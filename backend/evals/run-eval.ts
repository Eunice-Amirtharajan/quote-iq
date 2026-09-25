// LLM-as-judge eval runner for askPlaybook. Judges with OpenAI rather than
// Groq (which generates the actual answers) to avoid shared failure modes.
// Usage: npx tsx evals/run-eval.ts [--filter=discount]
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'node:fs';
import * as path from 'node:path';
import OpenAI from 'openai';
import { AIService } from '../src/modules/ai/ai.service';
import { AppLogger } from '../src/common/logger/logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { Counter } from 'prom-client';

const JUDGE_MODEL = 'gpt-4o-mini';

interface Scenario {
  id: string;
  category: 'in-scope' | 'out-of-scope' | 'cross-document';
  question: string;
  expectedAnswer: string;
  expectedBehavior?: 'refuse';
  expectedSourceDocuments?: string[];
  notes?: string;
}

interface ScenarioFile {
  description: string;
  scenarios: Scenario[];
}

interface JudgeVerdict {
  score: 1 | 2 | 3 | 4 | 5;
  reason: string;
}

interface EvalResult {
  scenario: Scenario;
  actualAnswer: string;
  actualCitations: string[];
  verdict: JudgeVerdict;
  durationMs: number;
}

// A no-op Counter stand-in — the real one is a Prometheus counter wired
// through NestJS DI in production; askPlaybook only ever calls .inc() on it.
function makeNoopCounter(): Counter<string> {
  return { inc: () => undefined } as unknown as Counter<string>;
}

async function judgeAnswer(
  openai: OpenAI,
  scenario: Scenario,
  actualAnswer: string,
): Promise<JudgeVerdict> {
  const judgePrompt = `You are grading whether an AI assistant's answer correctly addresses a question, given a known-correct reference answer. Score 1-5:
5 = Fully correct, matches the substance of the reference answer, no material omissions.
4 = Mostly correct, minor omission or phrasing difference but the core facts are right.
3 = Partially correct — gets some facts right but misses something material from the reference answer.
2 = Mostly wrong or largely irrelevant to the reference answer.
1 = Completely wrong, or answered when it should have refused (see below).

Special case: if the reference answer is the refusal string "I could not find a relevant answer in the uploaded playbook documents.", the ONLY correct actual answer is that exact refusal (or a clear equivalent refusal). If the actual answer instead provides substantive content, score 1 — it hallucinated an answer to an out-of-scope question.

Question: ${scenario.question}

Reference (correct) answer:
${scenario.expectedAnswer}

Actual answer to grade:
${actualAnswer}

Respond ONLY with JSON: {"score": <1-5>, "reason": "<one sentence>"}`;

  const completion = await openai.chat.completions.create({
    model: JUDGE_MODEL,
    messages: [{ role: 'user', content: judgePrompt }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as { score: number; reason: string };
  const score = Math.min(
    5,
    Math.max(1, Math.round(parsed.score)),
  ) as JudgeVerdict['score'];
  return { score, reason: parsed.reason ?? '(no reason given)' };
}

function loadScenarios(filter: string | undefined): Scenario[] {
  const scenarioPath = path.resolve(__dirname, 'playbook-scenarios.json');
  const { scenarios } = JSON.parse(
    fs.readFileSync(scenarioPath, 'utf-8'),
  ) as ScenarioFile;
  return filter ? scenarios.filter((s) => s.id.includes(filter)) : scenarios;
}

async function runScenario(
  aiService: AIService,
  openai: OpenAI,
  scenario: Scenario,
): Promise<EvalResult> {
  const start = Date.now();
  let actualAnswer: string;
  let actualCitations: string[] = [];

  try {
    const response = await aiService.askPlaybook(scenario.question);
    actualAnswer = response.answer;
    actualCitations = response.citations.map((c) => c.documentTitle);
  } catch (err) {
    // askPlaybook throws BadRequestException when no READY documents exist —
    // treat as the answer text so the judge can still score it; a thrown
    // "no documents available" error is a distinct, visible failure mode.
    actualAnswer =
      err instanceof Error ? `[THREW] ${err.message}` : String(err);
  }

  const verdict = await judgeAnswer(openai, scenario, actualAnswer);
  return {
    scenario,
    actualAnswer,
    actualCitations,
    verdict,
    durationMs: Date.now() - start,
  };
}

function printSummary(results: EvalResult[]): {
  avgScore: number;
  passCount: number;
} {
  const avgScore =
    results.reduce((sum, r) => sum + r.verdict.score, 0) / results.length;
  const passCount = results.filter((r) => r.verdict.score >= 4).length;
  const byCategory = new Map<string, { total: number; sumScore: number }>();
  for (const r of results) {
    const entry = byCategory.get(r.scenario.category) ?? {
      total: 0,
      sumScore: 0,
    };
    entry.total += 1;
    entry.sumScore += r.verdict.score;
    byCategory.set(r.scenario.category, entry);
  }

  console.log('\n--- Summary ---');
  console.log(`Overall: ${passCount}/${results.length} passed (score >= 4)`);
  console.log(`Average score: ${avgScore.toFixed(2)}/5`);
  for (const [category, { total, sumScore }] of Array.from(
    byCategory.entries(),
  )) {
    console.log(
      `  ${category}: avg ${(sumScore / total).toFixed(2)}/5 (${total} scenarios)`,
    );
  }
  return { avgScore, passCount };
}

function printFailures(results: EvalResult[]): void {
  const failed = results.filter((r) => r.verdict.score < 4);
  if (failed.length === 0) return;

  console.log('\n--- Failures ---');
  for (const r of failed) {
    console.log(`\n${r.scenario.id}: "${r.scenario.question}"`);
    console.log(`  Expected: ${r.scenario.expectedAnswer.slice(0, 150)}...`);
    console.log(`  Actual:   ${r.actualAnswer.slice(0, 150)}...`);
    console.log(`  Judge:    ${r.verdict.reason}`);
  }
}

// Machine-readable results consumed by the CI llm-eval job's artifact upload.
function writeResults(
  results: EvalResult[],
  avgScore: number,
  passCount: number,
): string {
  const outPath = path.resolve(__dirname, 'results.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        overallAvgScore: avgScore,
        passCount,
        totalCount: results.length,
        results: results.map((r) => ({
          id: r.scenario.id,
          category: r.scenario.category,
          question: r.scenario.question,
          score: r.verdict.score,
          reason: r.verdict.reason,
          actualCitations: r.actualCitations,
          expectedSourceDocuments: r.scenario.expectedSourceDocuments ?? [],
          durationMs: r.durationMs,
        })),
      },
      null,
      2,
    ),
  );
  return outPath;
}

async function main() {
  const filterArg = process.argv.find((a) => a.startsWith('--filter='));
  const filter = filterArg ? filterArg.split('=')[1] : undefined;
  const toRun = loadScenarios(filter);

  if (toRun.length === 0) {
    console.error(`No scenarios matched filter "${filter}"`);
    process.exit(1);
  }

  console.log(`Running ${toRun.length} scenario(s) against askPlaybook...\n`);

  const prisma = new PrismaService();
  const logger = new AppLogger();
  const aiService = new AIService(prisma, logger, makeNoopCounter());
  await aiService.onModuleInit(); // loads available Groq models — normally run by Nest's lifecycle

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const results: EvalResult[] = [];
  for (const scenario of toRun) {
    const result = await runScenario(aiService, openai, scenario);
    results.push(result);

    const scoreLabel = result.verdict.score >= 4 ? 'PASS' : 'FAIL';
    console.log(
      `[${scoreLabel}] ${scenario.id} (${scenario.category}) — score ${result.verdict.score}/5 — ${result.verdict.reason}`,
    );
  }

  await prisma.$disconnect();

  const { avgScore, passCount } = printSummary(results);
  printFailures(results);
  const outPath = writeResults(results, avgScore, passCount);
  console.log(`\nResults written to ${outPath}`);

  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
