import { APIError, RateLimitError } from 'groq-sdk/core/error';
import { isDailyLimit } from './daily-limit';

const rateLimit = (message: string) =>
  new RateLimitError(429, { message }, message, new Headers());

describe('isDailyLimit', () => {
  it('recognises the tokens-per-day and requests-per-day limits', () => {
    expect(
      isDailyLimit(
        rateLimit(
          'Rate limit reached for model `openai/gpt-oss-20b` on tokens per day (TPD): Limit 200000, Used 198991',
        ),
      ),
    ).toBe(true);
    expect(
      isDailyLimit(rateLimit('Rate limit reached on requests per day (RPD)')),
    ).toBe(true);
  });

  it('leaves per-minute limits to the normal retry', () => {
    expect(
      isDailyLimit(
        rateLimit(
          'Rate limit reached on input tokens per minute (ITPM): Limit 7000',
        ),
      ),
    ).toBe(false);
    expect(isDailyLimit(rateLimit('Rate limit reached (TPM)'))).toBe(false);
  });

  it('ignores errors that are not 429s', () => {
    expect(
      isDailyLimit(
        APIError.generate(500, undefined, '(TPD) mentioned', new Headers()),
      ),
    ).toBe(false);
    expect(isDailyLimit(new Error('(TPD)'))).toBe(false);
  });
});
