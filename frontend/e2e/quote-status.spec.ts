import { test, expect, type Page } from '@playwright/test';
import { login, logout, selectSeededClient } from './helpers';

function breadcrumbBadge(page: Page, status: string) {
  return page
    .locator('div.flex.items-center', { hasText: 'Quotations' })
    .locator(`span:has-text("${status}")`);
}

// The detail page's breadcrumb title (a span). A plain text locator also matches the list rows
// (desktop + mobile <p>), which stay mounted while the lazy detail route loads.
function breadcrumbTitle(page: Page, title: string) {
  return page.locator('span.font-medium', { hasText: title });
}

test.describe('Quote status workflow', () => {
  test('full DRAFT → SENT → APPROVED workflow', async ({ page }) => {
    const quotationTitle = `Status-Test-${Date.now()}`;

    // --- Step 1: rep creates a DRAFT using a seeded client ---
    await login(page, 'anna@quoteiq.com');
    await page.goto('/quotations');
    await page.click('button:has-text("New Quotation")');
    await page.waitForSelector('input[placeholder*="Software Development"]');
    await page.fill('input[placeholder*="Software Development"]', quotationTitle);

    await selectSeededClient(page, 'Bauer');

    await page.fill('input[placeholder="Description"]', 'Status workflow test');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '100');
    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();
    await expect(page.locator(`text=${quotationTitle}`)).toBeVisible();

    // --- Step 2: rep opens detail and submits for approval ---
    await page.click(`text=${quotationTitle}`);
    await page.waitForURL(/\/quotations\/.+/);
    await expect(breadcrumbTitle(page, quotationTitle)).toBeVisible();
    await expect(breadcrumbBadge(page, 'DRAFT')).toBeVisible();

    await page.click('button:has-text("Submit for Approval")');
    await expect(breadcrumbBadge(page, 'SENT')).toBeVisible();

    // --- Step 3: switch to manager and approve ---
    await logout(page);
    await login(page, 'marcus@quoteiq.com');
    await page.goto('/quotations');
    await page.click(`text=${quotationTitle}`);
    await page.waitForURL(/\/quotations\/.+/);
    await expect(breadcrumbTitle(page, quotationTitle)).toBeVisible();
    await expect(breadcrumbBadge(page, 'SENT')).toBeVisible();

    await page.click('button:has-text("Approve")');
    await expect(breadcrumbBadge(page, 'APPROVED')).toBeVisible();
  });
});
