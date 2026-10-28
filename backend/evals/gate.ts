// Quality gate for the askPlaybook eval: compares a run (results.json) with the committed
// baseline (baseline.json). Pure functions, so the decision logic is unit-tested (gate.spec.ts);
// check-gate.ts is the CLI around them.

export interface ResultRow {
  id: string;
  category: string;
  score: number;
  infraError?: boolean;
  /** Sources the answer cited */
  actualCitations: string[];
  /** Sources retrieval passed to the model; older results only have actualCitations */
  retrievedSources?: string[];
  /** False when a non-refusal answer cited no source it was given (askPlaybook's flag) */
  grounded?: boolean;
  expectedSourceDocuments: string[];
}

export interface Metrics {
  totalCount: number;
  avgScore: number;
  passCount: number;
  /** Out-of-scope questions answered instead of refused: a hallucination proxy */
  falseAnswers: number;
  /** In-scope probes that got the refusal instead of an answer */
  falseRefusals: number;
  retrievalScenarios: number;
  /** Scenarios whose expected source documents were all passed to the model */
  retrievalFullCoverage: number;
  /** Answers that cite none of the passages they were given, or invent one */
  ungroundedAnswers: number;
  infraErrors: number;
}

export interface Baseline {
  recordedAt: string;
  note: string;
  metrics: Omit<Metrics, 'infraErrors'>;
  tolerance: {
    avgScore: number;
    passCount: number;
    falseRefusals: number;
    retrievalFullCoverage: number;
    ungroundedAnswers: number;
  };
}

export interface Check {
  name: string;
  baseline: string;
  actual: string;
  passed: boolean;
}

export interface GateResult {
  passed: boolean;
  /** True when the run couldn't be graded (Groq unavailable), as opposed to a regression */
  infrastructureFailure: boolean;
  checks: Check[];
}

const PASS_SCORE = 4;

function normalize(title: string): string {
  return title.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

export function computeMetrics(
  rows: ResultRow[],
  refusalScenarioIds: Set<string>,
): Metrics {
  const graded = rows.filter((r) => !r.infraError);
  const withSources = rows.filter((r) => r.expectedSourceDocuments.length > 0);
  const fullyCovered = withSources.filter((r) => {
    const retrieved = new Set(
      (r.retrievedSources ?? r.actualCitations).map(normalize),
    );
    return r.expectedSourceDocuments.every((d) => retrieved.has(normalize(d)));
  });
  return {
    totalCount: rows.length,
    avgScore:
      graded.length === 0
        ? 0
        : graded.reduce((sum, r) => sum + r.score, 0) / graded.length,
    passCount: graded.filter((r) => r.score >= PASS_SCORE).length,
    falseAnswers: graded.filter(
      (r) => refusalScenarioIds.has(r.id) && r.score < PASS_SCORE,
    ).length,
    falseRefusals: graded.filter(
      (r) => r.id.startsWith('false-refusal-') && r.score < PASS_SCORE,
    ).length,
    retrievalScenarios: withSources.length,
    retrievalFullCoverage: fullyCovered.length,
    ungroundedAnswers: graded.filter((r) => r.grounded === false).length,
    infraErrors: rows.length - graded.length,
  };
}

export function evaluateGate(metrics: Metrics, baseline: Baseline): GateResult {
  const base = baseline.metrics;
  const tol = baseline.tolerance;
  if (metrics.infraErrors > 0) {
    return {
      passed: false,
      infrastructureFailure: true,
      checks: [
        {
          name: 'Scenarios graded (Groq available)',
          baseline: `${base.totalCount}`,
          actual: `${metrics.totalCount - metrics.infraErrors}`,
          passed: false,
        },
      ],
    };
  }
  const checks: Check[] = [
    {
      name: 'Scenario set unchanged (else update the baseline)',
      baseline: `${base.totalCount}`,
      actual: `${metrics.totalCount}`,
      passed: metrics.totalCount === base.totalCount,
    },
    {
      name: `Average judge score (min ${(base.avgScore - tol.avgScore).toFixed(2)})`,
      baseline: base.avgScore.toFixed(2),
      actual: metrics.avgScore.toFixed(2),
      passed: metrics.avgScore >= base.avgScore - tol.avgScore,
    },
    {
      name: `Scenarios passing, score >= ${PASS_SCORE} (min ${base.passCount - tol.passCount})`,
      baseline: `${base.passCount}`,
      actual: `${metrics.passCount}`,
      passed: metrics.passCount >= base.passCount - tol.passCount,
    },
    {
      name: 'Hallucinations: out-of-scope questions answered (no tolerance)',
      baseline: `${base.falseAnswers}`,
      actual: `${metrics.falseAnswers}`,
      passed: metrics.falseAnswers <= base.falseAnswers,
    },
    {
      name: `False refusals (max ${base.falseRefusals + tol.falseRefusals})`,
      baseline: `${base.falseRefusals}`,
      actual: `${metrics.falseRefusals}`,
      passed: metrics.falseRefusals <= base.falseRefusals + tol.falseRefusals,
    },
    {
      name: `Retrieval: expected sources given to the model (min ${base.retrievalFullCoverage - tol.retrievalFullCoverage})`,
      baseline: `${base.retrievalFullCoverage}/${base.retrievalScenarios}`,
      actual: `${metrics.retrievalFullCoverage}/${metrics.retrievalScenarios}`,
      passed:
        metrics.retrievalFullCoverage >=
        base.retrievalFullCoverage - tol.retrievalFullCoverage,
    },
    {
      name: `Ungrounded answers: no valid citation (max ${base.ungroundedAnswers + tol.ungroundedAnswers})`,
      baseline: `${base.ungroundedAnswers}`,
      actual: `${metrics.ungroundedAnswers}`,
      passed:
        metrics.ungroundedAnswers <=
        base.ungroundedAnswers + tol.ungroundedAnswers,
    },
  ];
  return {
    passed: checks.every((c) => c.passed),
    infrastructureFailure: false,
    checks,
  };
}

export function toMarkdown(result: GateResult): string {
  const title = result.infrastructureFailure
    ? '### LLM eval gate: could not grade (Groq unavailable) — re-run the job'
    : `### LLM eval gate: ${result.passed ? 'passed' : 'FAILED'}`;
  const rows = result.checks.map(
    (c) =>
      `| ${c.passed ? '✅' : '❌'} | ${c.name} | ${c.baseline} | ${c.actual} |`,
  );
  return [
    title,
    '',
    '| | Check | Baseline | This run |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}
