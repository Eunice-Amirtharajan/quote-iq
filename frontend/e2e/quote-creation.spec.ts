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

    // Wait for the new row — title appears as a <p title="..."> inside the table
    await expect(page.locator('p[title="E2E Test Quotation"]').first()).toBeVisible();

    // Find the row that contains our title and verify the DRAFT badge inside it
    const titleCell = page.locator('p[title="E2E Test Quotation"]').first();
    const row = titleCell.locator('xpath=ancestor::tr[1]');
    await expect(row.locator('span:has-text("DRAFT")')).toBeVisible();
  });
});
