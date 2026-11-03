import { inspect } from 'node:util';

/**
 * Removes anything shaped like a tag and trims, for free text stored from user input (quotation
 * fields, client names). Storage hygiene only: prompts still escape with escapeXml, and HTML output
 * is escaped where it is rendered.
 */
export function stripTags(v: string): string {
  // [^>]* is a negated class with no backtracking ambiguity; callers enforce length limits
  return v.replace(/<[^>]*>/g, '').trim(); // NOSONAR
}

export function escapeXml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Reverses escapeXml on model output: a model shown escaped text may echo `&#39;` or `&amp;`
 * back, which would show up literally in the UI. `&amp;` goes last so `&amp;lt;` stays `&lt;`.
 */
export function unescapeXml(str: string): string {
  return str
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

/**
 * Error details for a log line. Some errors aren't Error instances (Prisma's Neon driver adapter
 * throws plain objects), and String() turns those into "[object Object]", losing the cause.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  if (typeof err === 'object' && err !== null) {
    return inspect(err, { depth: 4, breakLength: Infinity });
  }
  return String(err);
}
