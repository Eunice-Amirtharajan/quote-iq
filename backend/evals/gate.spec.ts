import {
  type Baseline,
  computeMetrics,
  evaluateGate,
  type Metrics,
  type ResultRow,
  toMarkdown,
} from './gate';

const row = (over: Partial<ResultRow> = {}): ResultRow => ({
  id: 'pricing-01',
  category: 'in-scope',
  score: 5,
  actualCitations: [],
  expectedSourceDocuments: [],
  ...over,
});

const baseline: Baseline = {
  recordedAt: '2026-10-27T19:15:00.000Z',
  note: '',
  metrics: {
    totalCount: 23,
    avgScore: 4.83,
    passCount: 23,
    falseAnswers: 0,
    falseRefusals: 0,
    retrievalScenarios: 19,
    retrievalFullCoverage: 18,
  },
  tolerance: {
    avgScore: 0.3,
    passCount: 1,
    falseRefusals: 1,
    retrievalFullCoverage: 1,
  },
};

const good: Metrics = { ...baseline.metrics, infraErrors: 0 };
const failing = (metrics: Partial<Metrics>) =>
  evaluateGate({ ...good, ...metrics }, baseline)
    .checks.filter((c) => !c.passed)
    .map((c) => c.name.split(' (')[0]);

describe('computeMetrics', () => {
  it('averages graded scores and counts passes (score >= 4)', () => {
    const m = computeMetrics(
      [row({ score: 5 }), row({ score: 4 }), row({ score: 3 })],
      new Set(),
    );
    expect(m.avgScore).toBe(4);
    expect(m.passCount).toBe(2);
  });

  it('counts an answered out-of-scope question as a hallucination', () => {
    const m = computeMetrics(
      [
        row({ id: 'out-of-scope-01', score: 1 }),
        row({ id: 'out-of-scope-02', score: 5 }),
      ],
      new Set(['out-of-scope-01', 'out-of-scope-02']),
    );
    expect(m.falseAnswers).toBe(1);
  });

  it('counts a refused false-refusal probe', () => {
    const m = computeMetrics(
      [row({ id: 'false-refusal-01', score: 2 })],
      new Set(),
    );
    expect(m.falseRefusals).toBe(1);
  });

  it('counts retrieval coverage, ignoring file extensions and case', () => {
    const m = computeMetrics(
      [
        row({
          expectedSourceDocuments: ['pricing-guidelines.md'],
          actualCitations: ['Pricing-Guidelines.pdf'],
        }),
        row({
          expectedSourceDocuments: [
            'pricing-guidelines.md',
            'discount-approval-policy.md',
          ],
          actualCitations: ['pricing-guidelines.pdf'],
        }),
        row(),
      ],
      new Set(),
    );
    expect(m.retrievalScenarios).toBe(2);
    expect(m.retrievalFullCoverage).toBe(1);
  });

  it('leaves ungraded (infrastructure) rows out of the scores', () => {
    const m = computeMetrics(
      [row({ score: 5 }), row({ score: 1, infraError: true })],
      new Set(),
    );
    expect(m.infraErrors).toBe(1);
    expect(m.avgScore).toBe(5);
  });

  it('reports an average of 0 when nothing could be graded', () => {
    expect(
      computeMetrics([row({ infraError: true })], new Set()).avgScore,
    ).toBe(0);
  });
});

describe('evaluateGate', () => {
  it('passes a run at the baseline and one within tolerance', () => {
    expect(evaluateGate(good, baseline).passed).toBe(true);
    expect(
      failing({
        avgScore: 4.53,
        passCount: 22,
        falseRefusals: 1,
        retrievalFullCoverage: 17,
      }),
    ).toEqual([]);
  });

  it('fails a regression beyond tolerance on each metric', () => {
    expect(failing({ avgScore: 4.52 })).toEqual(['Average judge score']);
    expect(failing({ passCount: 21 })).toEqual([
      'Scenarios passing, score >= 4',
    ]);
    expect(failing({ falseRefusals: 2 })).toEqual(['False refusals']);
    expect(failing({ retrievalFullCoverage: 16 })).toEqual([
      'Retrieval: expected sources cited',
    ]);
  });

  it('allows no hallucinations at all', () => {
    expect(failing({ falseAnswers: 1 })).toEqual([
      'Hallucinations: out-of-scope questions answered',
    ]);
  });

  it('asks for a baseline update when the scenario set changed', () => {
    expect(failing({ totalCount: 24 })).toEqual(['Scenario set unchanged']);
  });

  it('reports ungraded runs as an infrastructure failure, not a regression', () => {
    const result = evaluateGate({ ...good, infraErrors: 2 }, baseline);
    expect(result).toMatchObject({
      passed: false,
      infrastructureFailure: true,
    });
    expect(toMarkdown(result)).toContain('could not grade (Groq unavailable)');
  });

  it('renders a pass/fail table', () => {
    const md = toMarkdown(evaluateGate({ ...good, falseAnswers: 2 }, baseline));
    expect(md).toContain('### LLM eval gate: FAILED');
    expect(md).toContain(
      '| ❌ | Hallucinations: out-of-scope questions answered (no tolerance) | 0 | 2 |',
    );
  });
});
