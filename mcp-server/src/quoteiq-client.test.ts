import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from './config.ts';
import {
  type Quotation,
  QuoteIqApiError,
  QuoteIqClient,
} from './quoteiq-client.ts';

interface SentRequest {
  query: string;
  variables: Record<string, unknown>;
  authorization: string | undefined;
}

/** A fake fetch that records requests and answers from a list, in order. */
function fakeFetch(responses: Response[]) {
  const sent: SentRequest[] = [];
  const fetchFn = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Omit<
      SentRequest,
      'authorization'
    >;
    sent.push({
      ...body,
      authorization: (init.headers as Record<string, string>).authorization,
    });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next;
  }) as typeof fetch;
  return { fetchFn, sent };
}

const json = (body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
  });
const unauthenticated = () =>
  json({
    errors: [
      { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
    ],
  });
const loginOk = (token: string) =>
  json(
    { data: { login: { id: 'u-1' } } },
    { 'set-cookie': `access_token=${token}; Path=/; HttpOnly; SameSite=Lax` },
  );

const quotation = (over: Partial<Quotation> = {}): Quotation => ({
  id: '1b0a1c52-8d1e-4f34-9a3b-2f6f4c1e9d10',
  quotationNumber: 'QT-2026-0042',
  title: 'Fleet licences',
  status: 'SENT',
  subtotal: 5000,
  taxRate: 19,
  taxAmount: 950,
  total: 5950,
  notes: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  client: { name: 'Bauer Manufacturing GmbH' },
  createdBy: { name: 'Marcus Reid' },
  items: [
    { description: 'Licence', quantity: 10, unitPrice: 500, lineTotal: 5000 },
  ],
  ...over,
});

const withToken = loadConfig({ QUOTEIQ_TOKEN: 'token-1' });
const withPassword = loadConfig({
  QUOTEIQ_EMAIL: 'marcus@quoteiq.com',
  QUOTEIQ_PASSWORD: 'secret',
});

describe('QuoteIqClient', () => {
  it('calls the API as the user, with their token as a Bearer header', async () => {
    const answer = {
      answer: 'Up to 10% (see [1]).',
      grounded: true,
      citations: [],
    };
    const { fetchFn, sent } = fakeFetch([
      json({ data: { askPlaybook: answer } }),
    ]);

    const result = await new QuoteIqClient(withToken, fetchFn).askPlaybook(
      'Max discount?',
    );

    assert.deepEqual(result, answer);
    assert.equal(sent[0]?.authorization, 'Bearer token-1');
    assert.deepEqual(sent[0]?.variables, { question: 'Max discount?' });
  });

  it('logs in with email and password, then reuses the session', async () => {
    const { fetchFn, sent } = fakeFetch([
      loginOk('session-1'),
      json({ data: { quotation: quotation() } }),
      json({ data: { quotation: quotation() } }),
    ]);
    const client = new QuoteIqClient(withPassword, fetchFn);

    await client.findQuotation(quotation().id);
    await client.findQuotation(quotation().id);

    assert.equal(sent.length, 3); // one login for both lookups
    assert.match(
      sent[0]?.query ?? '',
      /login\(email: \$email, password: \$password\)/,
    );
    assert.equal(sent[0]?.authorization, undefined);
    assert.equal(sent[1]?.authorization, 'Bearer session-1');
    assert.equal(sent[2]?.authorization, 'Bearer session-1');
  });

  it('signs in again once when the session has expired', async () => {
    const { fetchFn, sent } = fakeFetch([
      loginOk('old'),
      unauthenticated(),
      loginOk('new'),
      json({ data: { quotation: quotation() } }),
    ]);

    const result = await new QuoteIqClient(withPassword, fetchFn).findQuotation(
      quotation().id,
    );

    assert.equal(result?.quotationNumber, 'QT-2026-0042');
    assert.equal(sent[3]?.authorization, 'Bearer new');
  });

  it('explains an expired token when there is no password to sign in again with', async () => {
    const { fetchFn } = fakeFetch([unauthenticated()]);
    await assert.rejects(
      new QuoteIqClient(withToken, fetchFn).askPlaybook('Max discount?'),
      (err: Error) =>
        err instanceof QuoteIqApiError &&
        /token may have expired/.test(err.message),
    );
  });

  it('reports a failed login', async () => {
    const { fetchFn } = fakeFetch([
      json({ errors: [{ message: 'Invalid credentials' }] }),
    ]);
    await assert.rejects(
      new QuoteIqClient(withPassword, fetchFn).askPlaybook('Max discount?'),
      /login failed for marcus@quoteiq.com: Invalid credentials/,
    );
  });

  it("passes on the API's own error message, e.g. the AI limit", async () => {
    const { fetchFn } = fakeFetch([
      json({
        errors: [
          {
            message:
              "You've reached today's AI limit. It resets at midnight UTC.",
          },
        ],
      }),
    ]);
    await assert.rejects(
      new QuoteIqClient(withToken, fetchFn).askPlaybook('Max discount?'),
      /today's AI limit/,
    );
  });

  it('reports an unreachable API and a non-GraphQL response', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await assert.rejects(
      new QuoteIqClient(withToken, down).askPlaybook('Max discount?'),
      /Could not reach QuoteIQ at http:\/\/localhost:4000\/graphql: fetch failed/,
    );

    const { fetchFn } = fakeFetch([
      new Response('Bad gateway', { status: 502 }),
    ]);
    await assert.rejects(
      new QuoteIqClient(withToken, fetchFn).askPlaybook('Max discount?'),
      /HTTP 502 without a GraphQL response/,
    );
  });

  it('finds a quotation by number, ignoring other search matches', async () => {
    const { fetchFn, sent } = fakeFetch([
      json({
        data: {
          quotations: [
            quotation({
              quotationNumber: 'QT-2026-0420',
              title: 'QT-2026-0042 follow-up',
            }),
            quotation(),
          ],
        },
      }),
    ]);

    const result = await new QuoteIqClient(withToken, fetchFn).findQuotation(
      'qt-2026-0042',
    );

    assert.equal(result?.quotationNumber, 'QT-2026-0042');
    assert.deepEqual(sent[0]?.variables, { search: 'qt-2026-0042' });
  });

  it('returns null when nothing matches', async () => {
    const { fetchFn } = fakeFetch([json({ data: { quotations: [] } })]);
    assert.equal(
      await new QuoteIqClient(withToken, fetchFn).findQuotation('QT-2026-9999'),
      null,
    );
  });

  it("never requests a quotation's public link token", async () => {
    const { fetchFn, sent } = fakeFetch([
      json({ data: { quotation: quotation() } }),
      json({ data: { quotations: [] } }),
    ]);
    const client = new QuoteIqClient(withToken, fetchFn);
    await client.findQuotation(quotation().id);
    await client.findQuotation('QT-2026-0042');
    for (const request of sent)
      assert.doesNotMatch(request.query, /publicToken/);
  });
});
