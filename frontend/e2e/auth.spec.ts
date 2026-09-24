import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('manager can log in and see dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#email', { timeout: 30_000 });
    await page.fill('#email', 'marcus@quoteiq.com');
    await page.fill('#password', 'password123');
    await page.click('button:has-text("Sign in")');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('sales rep can log in and see quotations', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#email', { timeout: 30_000 });
    await page.fill('#email', 'anna@quoteiq.com');
    await page.fill('#password', 'password123');
    await page.click('button:has-text("Sign in")');
    await expect(page).toHaveURL(/\/(dashboard|quotations)/);
  });

  test('wrong password shows error message', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#email', { timeout: 30_000 });
    await page.fill('#email', 'anna@quoteiq.com');
    await page.fill('#password', 'wrongpassword');
    await page.click('button:has-text("Sign in")');
    // Allow real time for bcrypt.compare (12 rounds) + network round-trip
    // under CI's shared CPU before the error text is expected to render.
    await expect(page.locator('text=Invalid email or password.')).toBeVisible({ timeout: 15_000 });
  });

  test('unknown email shows same error message', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#email', { timeout: 30_000 });
    await page.fill('#email', 'nobody@quoteiq.com');
    await page.fill('#password', 'password123');
    await page.click('button:has-text("Sign in")');
    await expect(page.locator('text=Invalid email or password.')).toBeVisible({ timeout: 15_000 });
  });

  test('user can log out', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#email', { timeout: 30_000 });
    await page.fill('#email', 'anna@quoteiq.com');
    await page.fill('#password', 'password123');
    await page.click('button:has-text("Sign in")');
    await expect(page).not.toHaveURL('/');
    await page.click('button:has-text("Sign out")');
    await expect(page).toHaveURL('/login');
  });
});
