import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.fill('#email', email);
  await page.fill('#password', 'password123');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/(dashboard|quotations)/);
}

async function logout(page: Page) {
  await page.click('button:has-text("Sign out")');
  await page.waitForURL('/login');
}

function breadcrumbBadge(page: Page, status: string) {
  return page
    .locator('div.flex.items-center', { hasText: 'Quotations' })
    .locator(`span:has-text("${status}")`);
}

test.describe('Quote status workflow', () => {
  test('full DRAFT → SENT → APPROVED workflow', async ({ page }) => {
    const quotationTitle = `Status-Test-${Date.now()}`;

    // --- Step 1: rep creates a DRAFT ---
    await login(page, 'anna@quoteiq.com');
    await page.goto('/quotations');
    await page.click('button:has-text("New Quotation")');
    await page.fill('input[placeholder*="Software Development"]', quotationTitle);

    // ClientSelector: type a new client name and pick "Create ..." from the dropdown
    await page.fill('input[placeholder*="Search or create a client"]', 'Status Test Client');
    await page.click('li[role="option"]:has-text("Create")');

    await page.fill('input[placeholder="Description"]', 'Status workflow test');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '100');
    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator(`text=${quotationTitle}`)).toBeVisible();

    // --- Step 2: rep opens detail and submits for approval ---
    await page.click(`text=${quotationTitle}`);
    await page.waitForURL(/\/quotations\/.+/);
    await expect(page.locator(`text=${quotationTitle}`)).toBeVisible();
    await expect(breadcrumbBadge(page, 'DRAFT')).toBeVisible();

    await page.click('button:has-text("Submit for Approval")');
    await expect(breadcrumbBadge(page, 'SENT')).toBeVisible();

    // --- Step 3: switch to manager and approve ---
    await logout(page);
    await login(page, 'marcus@quoteiq.com');
    await page.goto('/quotations');
    await page.click(`text=${quotationTitle}`);
    await page.waitForURL(/\/quotations\/.+/);
    await expect(page.locator(`text=${quotationTitle}`)).toBeVisible();
    await expect(breadcrumbBadge(page, 'SENT')).toBeVisible();

    await page.click('button:has-text("Approve")');
    await expect(breadcrumbBadge(page, 'APPROVED')).toBeVisible();
  });
});
