import type { Page } from '@playwright/test';

export async function login(page: Page, email: string) {
  await page.goto('/');
  // AuthProvider fires ME_QUERY on mount; wait for it to resolve before the
  // login page renders. In CI the cold-start backend can take several seconds.
  await page.waitForSelector('#email', { timeout: 30_000 });
  await page.fill('#email', email);
  await page.fill('#password', 'password123');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/(dashboard|quotations)/);
}
