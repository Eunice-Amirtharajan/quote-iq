import { APIError } from 'groq-sdk/core/error';

/**
 * A Groq 429 for a per-day limit (tokens or requests per day). Unlike the per-minute limits,
 * waiting a minute can't help: the limit frees up over hours. Groq names the limit in the
 * message, e.g. "... on tokens per day (TPD): Limit 200000, Used 198991 ...".
 */
export function isDailyLimit(err: unknown): boolean {
  return (
    err instanceof APIError &&
    err.status === 429 &&
    (err.message.includes('(TPD)') || err.message.includes('(RPD)'))
  );
}

/** Consecutive scenarios lost to the daily limit after which the rest aren't attempted. */
export const DAILY_LIMIT_ABORT_AFTER = 2;
