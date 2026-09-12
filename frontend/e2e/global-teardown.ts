import { execSync } from 'child_process';
import path from 'path';

async function globalTeardown() {
  // process.cwd() is the frontend/ directory when Playwright runs
  const backendDir = path.resolve(process.cwd(), '..', 'backend');
  execSync('npx tsx src/prisma/cleanup-e2e-data.ts', {
    cwd: backendDir,
    stdio: 'inherit',
    shell: true,
  });
}

export default globalTeardown;
