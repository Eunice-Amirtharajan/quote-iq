import { test, expect } from '@playwright/test';

test.describe('Quote creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('#email', 'anna@quoteiq.com');
    await page.fill('#password', 'password123');
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/\/(dashboard|quotations)/);
    await page.goto('/quotations');
  });

  test('rep can create a quotation and it appears in the list', async ({ page }) => {
    await page.click('button:has-text("New Quotation")');

    // Fill modal
    await page.fill('input[placeholder*="Software Development"]', 'E2E Test Quotation');
    await page.fill('input[placeholder*="Acme Corp"]', 'Test Client Co');
    await page.fill('input[placeholder="Description"]', 'Consulting services');
    await page.fill('input[placeholder="Qty"]', '2');
    await page.fill('input[placeholder="0.00"]', '500');

    await page.click('button:has-text("Create Quotation")');

    // Modal closes and new row appears (use first() in case a previous run left rows)
    await expect(page.locator('text=E2E Test Quotation').first()).toBeVisible();
    await expect(page.locator('text=Test Client Co').first()).toBeVisible();

    // Scope all checks to the newly created row
    const row = page.getByRole('row', { name: /E2E Test Quotation/ }).first();
    await expect(row.getByRole('cell', { name: /1,000/ })).toBeVisible();
    await expect(row.locator('span:has-text("DRAFT")')).toBeVisible();
  });
});
