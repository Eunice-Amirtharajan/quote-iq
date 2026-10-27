import { inspect } from 'node:util';

export function escapeXml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
