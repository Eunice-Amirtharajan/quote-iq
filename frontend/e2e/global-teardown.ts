import { execSync } from 'child_process';
import path from 'path';
import { assertLocalDatabase } from './global-setup';

async function globalTeardown() {
  // Same guard as setup: teardown runs even when setup refused a non-local DB,
  // and the cleanup deletes rows by name pattern
  assertLocalDatabase();
  // process.cwd() is the frontend/ directory when Playwright runs
  const backendDir = path.resolve(process.cwd(), '..', 'backend');
  execSync('npx tsx src/prisma/cleanup-e2e-data.ts', {
    cwd: backendDir,
    stdio: 'inherit',
    shell: true,
  });
}

export default globalTeardown;
