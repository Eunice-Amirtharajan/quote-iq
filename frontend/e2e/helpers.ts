import { expect, type Page } from '@playwright/test';

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

export async function logout(page: Page) {
  await page.click('button:has-text("Sign out")');
  await page.waitForURL('/login');
}

export async function selectSeededClient(page: Page, searchText: string) {
  const clientInput = page.locator('input[placeholder*="a client"]');
  await clientInput.click();
  // Wait for CLIENTS_QUERY to load — listbox appears once data arrives
  await expect(page.locator('ul[role="listbox"]')).toBeVisible({ timeout: 10_000 });
  // pressSequentially keeps focus on the element while typing each character,
  // triggering React's onChange reliably without any implicit mouse actions
  await clientInput.pressSequentially(searchText, { delay: 50 });
  await expect(page.locator('li[role="option"]').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('li[role="option"]').first().click();
  await expect(page.locator('ul[role="listbox"]')).not.toBeVisible();
}
