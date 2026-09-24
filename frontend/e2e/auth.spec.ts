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
    // bcrypt.compare on the backend (12 rounds) plus network round-trip can
    // exceed the default 5s assertion timeout under CI's shared CPU — the
    // button also flips back from "Signing in..." once the mutation settles,
    // so wait for that as a proxy before asserting the error text.
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Invalid email or password.')).toBeVisible();
  });

  test('unknown email shows same error message', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#email', { timeout: 30_000 });
    await page.fill('#email', 'nobody@quoteiq.com');
    await page.fill('#password', 'password123');
    await page.click('button:has-text("Sign in")');
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Invalid email or password.')).toBeVisible();
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
