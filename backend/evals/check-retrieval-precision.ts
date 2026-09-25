// Checks whether RRF retrieval + reranking surfaced the expected source
// document(s) in the top-3 citations. Reads results.json — run run-eval.ts first.
import * as fs from 'node:fs';
import * as path from 'node:path';

interface ResultEntry {
  id: string;
  category: string;
  question: string;
  actualCitations: string[];
  expectedSourceDocuments: string[];
}

interface ResultsFile {
  runAt: string;
  results: ResultEntry[];
}

// documentTitle in citations is the stored filename ("pricing-guidelines.pdf");
// expectedSourceDocuments in the scenario file omits the extension
// ("pricing-guidelines") for readability — normalize both sides to compare.
function normalize(title: string): string {
  return title.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

function main() {
  const resultsPath = path.resolve(__dirname, 'results.json');
  if (!fs.existsSync(resultsPath)) {
    console.error(
      'evals/results.json not found — run `npx tsx evals/run-eval.ts` first.',
    );
    process.exit(1);
  }

  const { results } = JSON.parse(
    fs.readFileSync(resultsPath, 'utf-8'),
  ) as ResultsFile;

  const withExpectedSources = results.filter(
    (r) => r.expectedSourceDocuments.length > 0,
  );

  if (withExpectedSources.length === 0) {
    console.error(
      'No scenarios in results.json have expectedSourceDocuments — nothing to check.',
    );
    process.exit(1);
  }

  console.log(
    `Checking retrieval precision on ${withExpectedSources.length} scenario(s) with known source documents...\n`,
  );

  let fullyCovered = 0;
  let partiallyCovered = 0;
  let notCovered = 0;

  for (const r of withExpectedSources) {
    const actualNorm = new Set(r.actualCitations.map(normalize));
    const expectedNorm = r.expectedSourceDocuments.map(normalize);
    const found = expectedNorm.filter((e) => actualNorm.has(e));
    const missing = expectedNorm.filter((e) => !actualNorm.has(e));

    let status: string;
    if (missing.length === 0) {
      status = 'FULL';
      fullyCovered++;
    } else if (found.length > 0) {
      status = 'PARTIAL';
      partiallyCovered++;
    } else {
      status = 'MISS';
      notCovered++;
    }

    const missingText = missing.length
      ? `, missing [${missing.join(', ')}]`
      : '';
    console.log(
      `[${status}] ${r.id} — expected [${expectedNorm.join(', ')}], retrieved [${[...actualNorm].join(', ')}]${missingText}`,
    );
  }

  const total = withExpectedSources.length;
  const precision = (fullyCovered / total) * 100;

  console.log('\n--- Retrieval Precision Summary ---');
  console.log(
    `Full top-k coverage:    ${fullyCovered}/${total} (${precision.toFixed(1)}%)`,
  );
  console.log(`Partial coverage:       ${partiallyCovered}/${total}`);
  console.log(`No coverage:            ${notCovered}/${total}`);
  console.log(
    `\nThis measures whether RRF retrieval + reranking actually surfaced the source document(s)\n` +
      `a scenario is known to depend on, within the top-3 citations returned to the user —\n` +
      `not whether the final generated answer happened to be correct anyway.`,
  );

  process.exit(notCovered > 0 ? 1 : 0);
}

main();
