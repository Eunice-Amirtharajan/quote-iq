import { z } from 'zod';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const ConfigSchema = z
  .object({
    QUOTEIQ_API_URL: z.url().default('http://localhost:4000/graphql'),
    // A QuoteIQ access token (the access_token cookie's value), or the user's email + password.
    // Either way the server acts as that user: the API applies their role and data scope.
    QUOTEIQ_TOKEN: z.string().min(1).optional(),
    QUOTEIQ_EMAIL: z.email().optional(),
    QUOTEIQ_PASSWORD: z.string().min(1).optional(),
  })
  .refine((c) => c.QUOTEIQ_TOKEN ?? (c.QUOTEIQ_EMAIL && c.QUOTEIQ_PASSWORD), {
    message: 'Set QUOTEIQ_TOKEN, or both QUOTEIQ_EMAIL and QUOTEIQ_PASSWORD',
  })
  .refine(
    (c) => {
      // zod 4 runs this even when the URL field itself failed: leave that error to speak
      if (!URL.canParse(c.QUOTEIQ_API_URL)) return true;
      const url = new URL(c.QUOTEIQ_API_URL);
      return url.protocol === 'https:' || LOCAL_HOSTS.has(url.hostname);
    },
    // The token or password travels with every request
    { message: 'QUOTEIQ_API_URL must use https unless it points at localhost' },
  );

export type Config = z.infer<typeof ConfigSchema>;

/** Reads the configuration from the environment; throws with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) =>
      i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message,
    );
    throw new Error(
      `Invalid QuoteIQ MCP configuration:\n- ${problems.join('\n- ')}`,
    );
  }
  return parsed.data;
}
