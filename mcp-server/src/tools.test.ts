import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  type PlaybookAnswer,
  type Quotation,
  QuoteIqApiError,
  type QuoteIqApi,
} from './quoteiq-client.ts';
import { registerTools } from './tools.ts';

const quotation: Quotation = {
  id: '1b0a1c52-8d1e-4f34-9a3b-2f6f4c1e9d10',
  quotationNumber: 'QT-2026-0042',
  title: 'Fleet licences',
  status: 'SENT',
  subtotal: 5000,
  taxRate: 19,
  taxAmount: 950,
  total: 5950,
  notes: 'Asked for 10% off',
  createdAt: '2026-10-01T09:00:00.000Z',
  client: { name: 'Bauer Manufacturing GmbH' },
  createdBy: { name: 'Marcus Reid' },
  items: [
    { description: 'Licence', quantity: 10, unitPrice: 500, lineTotal: 5000 },
  ],
};

/** A fake QuoteIQ: answers are set per test, calls are recorded. */
class FakeApi implements QuoteIqApi {
  answer: PlaybookAnswer | Error = {
    answer: '',
    grounded: true,
    citations: [],
  };
  quotation: Quotation | null = quotation;
  questions: string[] = [];

  async askPlaybook(question: string): Promise<PlaybookAnswer> {
    this.questions.push(question);
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }

  async findQuotation(): Promise<Quotation | null> {
    return this.quotation;
  }
}

let api: FakeApi;
let client: Client;

// A real MCP client and server, connected in memory: tests go through the protocol
beforeEach(async () => {
  api = new FakeApi();
  const server = new McpServer({ name: 'quoteiq', version: '0.1.0' });
  registerTools(server, api);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
});

const call = async (name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })) as CallToolResult;
const textOf = (result: CallToolResult) =>
  result.content.map((c) => (c.type === 'text' ? c.text : '')).join('');

describe('QuoteIQ MCP tools', () => {
  it('offers exactly two tools, both marked read-only', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'get_quotation',
      'search_playbook',
    ]);
    for (const tool of tools) {
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.equal(tool.annotations?.destructiveHint, false);
    }
  });

  describe('search_playbook', () => {
    it('returns the answer with the passages it cites', async () => {
      api.answer = {
        answer: 'Up to 10% without approval (see [1]).',
        grounded: true,
        citations: [
          {
            sourceNumber: 1,
            documentTitle: 'discount-approval-policy.pdf',
            excerpt: 'Discounts of 0-10% may be applied by the sales rep',
          },
        ],
      };

      const result = await call('search_playbook', {
        question: '  Max discount?  ',
      });

      assert.equal(result.isError, undefined);
      assert.equal(
        textOf(result),
        'Up to 10% without approval (see [1]).\n\nSources:\n[1] discount-approval-policy.pdf: "Discounts of 0-10% may be applied by the sales rep"',
      );
      assert.deepEqual(api.questions, ['Max discount?']); // trimmed
    });

    it('warns when the answer cites no playbook passage', async () => {
      api.answer = {
        answer: 'Lead with value.',
        grounded: false,
        citations: [],
      };
      const result = await call('search_playbook', {
        question: 'How do I open a call?',
      });
      assert.match(textOf(result), /cites no playbook passage\. Check it/);
    });

    it('rejects an invalid question before calling QuoteIQ', async () => {
      const result = await call('search_playbook', { question: 'a' });
      assert.equal(result.isError, true);
      assert.deepEqual(api.questions, []);
    });

    it('reports QuoteIQ errors to the assistant as tool errors', async () => {
      api.answer = new QuoteIqApiError(
        "You've reached today's AI limit. It resets at midnight UTC.",
      );
      const result = await call('search_playbook', {
        question: 'Max discount?',
      });
      assert.equal(result.isError, true);
      assert.match(textOf(result), /today's AI limit/);
    });
  });

  describe('get_quotation', () => {
    it('returns the quotation as JSON, without its public link token', async () => {
      const result = await call('get_quotation', { reference: 'QT-2026-0042' });
      const body = JSON.parse(textOf(result)) as Record<string, unknown>;
      assert.equal(body.client, 'Bauer Manufacturing GmbH');
      assert.equal(body.salesRep, 'Marcus Reid');
      assert.equal(body.total, 5950);
      assert.equal(body.currency, 'EUR');
      assert.equal('publicToken' in body, false);
    });

    it('says when the quotation is missing or not visible to the user', async () => {
      api.quotation = null;
      const result = await call('get_quotation', { reference: 'QT-2026-9999' });
      assert.equal(result.isError, true);
      assert.match(textOf(result), /No quotation "QT-2026-9999" found/);
    });
  });
});
