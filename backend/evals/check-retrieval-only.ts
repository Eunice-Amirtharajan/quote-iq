// Retrieval-only check for askPlaybook: runs the real hybrid search for every scenario and compares
// the 3 passages the model would get with the scenario's expected source documents. No Groq calls
// and no judge, so the result is deterministic for a given database: use it to measure a retrieval
// change (ranking, indexes, chunking) without the noise of generated answers. Costs one embedding
// per scenario.
// Usage: npx tsx evals/check-retrieval-only.ts [--out=before.json]
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AIService } from '../src/modules/ai/ai.service';
import type { AiQuotaService } from '../src/modules/ai/ai-quota.service';
import { AppLogger } from '../src/common/logger/logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { Counter, Gauge } from 'prom-client';

const PASSAGES_TO_MODEL = 3;
const REFUSE_ABOVE_DISTANCE = 0.7;

interface Scenario {
  id: string;
  question: string;
  expectedSourceDocuments?: string[];
}

type Search = (question: string) => Promise<{
  chunks: { documentTitle: string; chunkIndex: number }[];
  bestDistance: number;
}>;

const normalize = (title: string) =>
  title.replace(/\.[a-z0-9]+$/i, '').toLowerCase();

function coverage(missing: number, expected: number): string {
  if (missing === 0) return 'FULL';
  return missing < expected ? 'PARTIAL' : 'MISS';
}

async function main() {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const { scenarios } = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, 'playbook-scenarios.json'),
      'utf-8',
    ),
  ) as { scenarios: Scenario[] };

  const prisma = new PrismaService();
  const noopCounter = { inc: () => undefined } as unknown as Counter<string>;
  const noopGauge = { set: () => undefined } as unknown as Gauge<string>;
  const aiService = new AIService(
    prisma,
    new AppLogger(),
    noopCounter,
    noopGauge,
    noopCounter,
    noopCounter,
    noopCounter,
    noopGauge,
    noopCounter,
    {
      record: () => Promise.resolve(),
      assertBudget: () => Promise.resolve(),
    } as unknown as AiQuotaService,
  );
  const search = (
    aiService as unknown as { searchDocumentChunks: Search }
  ).searchDocumentChunks.bind(aiService);

  const rows = [];
  let full = 0;
  let withSources = 0;
  let reciprocalRankSum = 0;
  for (const s of scenarios) {
    const { chunks, bestDistance } = await search(s.question);
    const ranked = chunks.map(
      (c) => `${normalize(c.documentTitle)}#${c.chunkIndex}`,
    );
    const top = chunks
      .slice(0, PASSAGES_TO_MODEL)
      .map((c) => normalize(c.documentTitle));
    const expected = (s.expectedSourceDocuments ?? []).map(normalize);
    const refusedEarly = bestDistance > REFUSE_ABOVE_DISTANCE;
    let status = 'n/a';
    if (expected.length > 0) {
      withSources++;
      const missing = expected.filter((e) => !top.includes(e));
      status = coverage(missing.length, expected.length);
      if (status === 'FULL') full++;
      // Position of the first expected document in the full fused list (1-based), for a finer signal
      const firstHit = chunks.findIndex((c) =>
        expected.includes(normalize(c.documentTitle)),
      );
      reciprocalRankSum += firstHit >= 0 ? 1 / (firstHit + 1) : 0;
    }
    rows.push({ id: s.id, status, refusedEarly, bestDistance, top, ranked });
    console.log(
      `[${status}] ${s.id}${refusedEarly ? ' (refused early)' : ''} top: ${top.join(', ')}`,
    );
  }

  const summary = {
    fullCoverage: `${full}/${withSources}`,
    meanReciprocalRank: Number((reciprocalRankSum / withSources).toFixed(3)),
  };
  console.log(
    `\nExpected sources in the top ${PASSAGES_TO_MODEL}: ${summary.fullCoverage}`,
  );
  console.log(
    `Mean reciprocal rank of the first expected source: ${summary.meanReciprocalRank}`,
  );
  if (outArg) {
    fs.writeFileSync(
      outArg.split('=')[1],
      JSON.stringify({ summary, rows }, null, 2),
    );
  }
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
