import { chromium, type FullConfig } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** DATABASE_URL from the environment (CI), else from backend/.env — the same DB global-teardown cleans */
function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(path.resolve(process.cwd(), '..', 'backend', '.env'), 'utf8');
    return /^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m.exec(env)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Refuse to run against a non-local database. The suite creates clients, quotes and users,
 * and earlier local runs against the dev backend left test clients in the shared Neon DB.
 */
function assertLocalDatabase() {
  const url = resolveDatabaseUrl();
  if (!url || process.env.E2E_ALLOW_REMOTE_DB === '1') return;

  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return;
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `E2E tests would write to a non-local database (${host}). Start the test DB ` +
        `(docker-compose -f backend/docker-compose.test.yml up -d) and set DATABASE_URL to it, ` +
        `with the backend running against the same DB. Set E2E_ALLOW_REMOTE_DB=1 to override.`,
    );
  }
}

const READY_TIMEOUT_MS = 180_000;

/** Poll the backend's /health until it answers — a just-started backend refuses connections */
async function waitForBackend(apiBase: string) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${apiBase}/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Backend at ${apiBase} did not become healthy within ${READY_TIMEOUT_MS / 1000}s`);
}

/**
 * Load the login page once so a freshly started Vite dev server compiles the app before
 * the first test; otherwise the first tests spend their 30s timeout waiting on it.
 */
async function warmUpFrontend(baseURL: string) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(baseURL, { timeout: READY_TIMEOUT_MS });
    await page.waitForSelector('#email', { timeout: READY_TIMEOUT_MS });
  } finally {
    await browser.close();
  }
}

async function globalSetup(config: FullConfig) {
  assertLocalDatabase();
  await waitForBackend(process.env.E2E_API_URL ?? 'http://localhost:4000');
  const baseURL = config.projects[0]?.use.baseURL;
  if (baseURL) await warmUpFrontend(baseURL);
}

export default globalSetup;
