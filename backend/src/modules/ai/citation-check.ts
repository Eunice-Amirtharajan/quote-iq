/**
 * Runtime citation checks for RAG answers: the answer may only cite sources that were actually
 * retrieved and shown to the model. Catches invented citations ("see [5]" when 3 passages were
 * given, a lessons entry that doesn't exist) and answers that cite nothing at all.
 */

export interface PassageCitations {
  /** Valid passage numbers (1-based), in order of first mention, without duplicates */
  cited: number[];
  /** Numbers that point at no provided passage */
  invalid: number[];
}

/**
 * The [n] markers in an answer, e.g. "(see [1])", "[1][3]" or "[1, 2]". Scans characters instead
 * of using a regex: the text is model output, so no backtracking risk on adversarial input.
 */
export function citedPassages(
  answer: string,
  passageCount: number,
): PassageCitations {
  const cited: number[] = [];
  const invalid: number[] = [];
  let i = answer.indexOf('[');
  while (i !== -1) {
    const close = answer.indexOf(']', i + 1);
    if (close === -1) break;
    for (const n of citationNumbers(answer.slice(i + 1, close))) {
      const target = n >= 1 && n <= passageCount ? cited : invalid;
      if (!target.includes(n)) target.push(n);
    }
    i = answer.indexOf('[', close + 1);
  }
  return { cited, invalid };
}

/** The numbers in one bracket's contents ("1" or "1, 3"); none if it isn't a citation. */
function citationNumbers(inside: string): number[] {
  const parts = inside.split(',').map((p) => p.trim());
  const isCitation = parts.every(
    (p) => p.length > 0 && p.length <= 3 && [...p].every(isDigit),
  );
  return isCitation ? parts.map(Number) : [];
}

export interface SourceCitations {
  /** Cited sources that were retrieved, in the retrieved spelling */
  known: string[];
  /** Cited sources that were never retrieved: invented by the model */
  unknown: string[];
}

/** Splits model-reported sources into ones that were retrieved and ones that weren't. */
export function checkCitedSources(
  cited: string[],
  retrieved: string[],
): SourceCitations {
  const byKey = new Map(retrieved.map((r) => [normalize(r), r]));
  const known: string[] = [];
  const unknown: string[] = [];
  for (const source of cited) {
    const match = byKey.get(normalize(source));
    if (match === undefined) unknown.push(source);
    else if (!known.includes(match)) known.push(match);
  }
  return { known, unknown };
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}
