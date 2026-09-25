// Measures both grounded-refusal failure directions: false answers
// (hallucinating on out-of-scope questions) and false refusals (refusing
// answerable ones). Reads results.json — does not re-run the LLM.
import * as fs from 'node:fs';
import * as path from 'node:path';

const REFUSAL_STRING =
  'I could not find a relevant answer in the uploaded playbook documents.';

interface ResultEntry {
  id: string;
  category: string;
  question: string;
  score: number;
  reason: string;
}

interface ScenarioMeta {
  id: string;
  expectedBehavior?: 'refuse';
}

interface ResultsFile {
  results: ResultEntry[];
}

interface ScenarioFile {
  scenarios: ScenarioMeta[];
}

function main() {
  const resultsPath = path.resolve(__dirname, 'results.json');
  const scenariosPath = path.resolve(__dirname, 'playbook-scenarios.json');

  if (!fs.existsSync(resultsPath)) {
    console.error(
      'evals/results.json not found — run `npx tsx evals/run-eval.ts` first.',
    );
    process.exit(1);
  }

  const { results } = JSON.parse(
    fs.readFileSync(resultsPath, 'utf-8'),
  ) as ResultsFile;
  const { scenarios } = JSON.parse(
    fs.readFileSync(scenariosPath, 'utf-8'),
  ) as ScenarioFile;
  const expectedBehaviorById = new Map(
    scenarios.map((s) => [s.id, s.expectedBehavior]),
  );

  // Judge score alone doesn't say which direction failed, so it's split by
  // scenario group: a low score on an out-of-scope scenario is a false
  // answer, a low score on a false-refusal probe is a false refusal.
  const outOfScope = results.filter(
    (r) => expectedBehaviorById.get(r.id) === 'refuse',
  );
  const falseRefusalProbes = results.filter((r) =>
    r.id.startsWith('false-refusal-'),
  );

  const falseAnswers = outOfScope.filter((r) => r.score < 4);
  const falseRefusals = falseRefusalProbes.filter((r) => r.score < 4);

  console.log('--- Out-of-scope scenarios (should refuse) ---');
  for (const r of outOfScope) {
    const label =
      r.score >= 4 ? 'CORRECTLY REFUSED' : 'FALSE ANSWER (hallucination)';
    console.log(`  [${label}] ${r.id} — score ${r.score}/5`);
  }

  console.log(
    '\n--- False-refusal probes (answerable, indirectly phrased) ---',
  );
  for (const r of falseRefusalProbes) {
    const label = r.score >= 4 ? 'CORRECTLY ANSWERED' : 'FALSE REFUSAL';
    console.log(`  [${label}] ${r.id} — score ${r.score}/5 — ${r.reason}`);
  }

  const falseAnswerRate =
    outOfScope.length > 0
      ? (falseAnswers.length / outOfScope.length) * 100
      : null;
  const falseRefusalRate =
    falseRefusalProbes.length > 0
      ? (falseRefusals.length / falseRefusalProbes.length) * 100
      : null;

  console.log('\n--- Grounded-Refusal Accuracy Summary ---');
  console.log(
    `False-answer rate (hallucination proxy):  ${falseAnswers.length}/${outOfScope.length}` +
      (falseAnswerRate !== null ? ` (${falseAnswerRate.toFixed(1)}%)` : ''),
  );
  console.log(
    `False-refusal rate:                       ${falseRefusals.length}/${falseRefusalProbes.length}` +
      (falseRefusalRate !== null ? ` (${falseRefusalRate.toFixed(1)}%)` : ''),
  );
  console.log(`\nRefusal string checked against: "${REFUSAL_STRING}"`);

  const anyFailure = falseAnswers.length > 0 || falseRefusals.length > 0;
  process.exit(anyFailure ? 1 : 0);
}

main();
