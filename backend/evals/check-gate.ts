// Compares evals/results.json with the committed evals/baseline.json and fails on a regression.
// Usage:
//   npx tsx evals/check-gate.ts                    gate the last run (CI)
//   npx tsx evals/check-gate.ts --update-baseline  accept the last run as the new baseline
//                                                  (commit baseline.json with the change)
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type Baseline,
  computeMetrics,
  evaluateGate,
  type ResultRow,
  toMarkdown,
} from './gate';

const resultsPath = path.resolve(__dirname, 'results.json');
const baselinePath = path.resolve(__dirname, 'baseline.json');
const scenariosPath = path.resolve(__dirname, 'playbook-scenarios.json');

function main() {
  if (!fs.existsSync(resultsPath)) {
    console.error('evals/results.json not found — run `npm run eval` first.');
    process.exit(1);
  }
  const { results } = JSON.parse(fs.readFileSync(resultsPath, 'utf-8')) as {
    results: ResultRow[];
  };
  const { scenarios } = JSON.parse(fs.readFileSync(scenariosPath, 'utf-8')) as {
    scenarios: { id: string; expectedBehavior?: string }[];
  };
  const refusalIds = new Set(
    scenarios.filter((s) => s.expectedBehavior === 'refuse').map((s) => s.id),
  );
  const metrics = computeMetrics(results, refusalIds);
  const baseline = JSON.parse(
    fs.readFileSync(baselinePath, 'utf-8'),
  ) as Baseline;

  if (process.argv.includes('--update-baseline')) {
    if (metrics.infraErrors > 0) {
      console.error(
        `Not updating the baseline: ${metrics.infraErrors} scenario(s) weren't graded (Groq unavailable).`,
      );
      process.exit(1);
    }
    const updated: Baseline = {
      ...baseline,
      recordedAt: new Date().toISOString(),
      metrics: {
        totalCount: metrics.totalCount,
        avgScore: Number(metrics.avgScore.toFixed(2)),
        passCount: metrics.passCount,
        falseAnswers: metrics.falseAnswers,
        falseRefusals: metrics.falseRefusals,
        retrievalScenarios: metrics.retrievalScenarios,
        retrievalFullCoverage: metrics.retrievalFullCoverage,
      },
    };
    fs.writeFileSync(baselinePath, JSON.stringify(updated, null, 2) + '\n');
    console.log(
      'Baseline updated — commit evals/baseline.json with your change.',
    );
    return;
  }

  const result = evaluateGate(metrics, baseline);
  const markdown = toMarkdown(result);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  }
  process.exit(result.passed ? 0 : 1);
}

main();
