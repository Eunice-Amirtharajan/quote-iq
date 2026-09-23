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

    await page.fill('input[placeholder*="Software Development"]', 'E2E Test Quotation');

    // ClientSelector: type a new client name and pick "Create ..." from the dropdown
    await page.fill('input[placeholder*="Search or create a client"]', 'Test Client Co');
    await page.click('li[role="option"]:has-text("Create")');

    await page.fill('input[placeholder="Description"]', 'Consulting services');
    await page.fill('input[placeholder="Qty"]', '2');
    await page.fill('input[placeholder="0.00"]', '500');

    await page.click('button:has-text("Create Quotation")');

    // Wait for modal to close (button disappears)
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();

    // Quotation title now appears in the list
    await expect(page.locator('text=E2E Test Quotation').first()).toBeVisible();
  });
});

test.describe('Mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('#email', 'anna@quoteiq.com');
    await page.fill('#password', 'password123');
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/\/(dashboard|quotations)/);
    await page.goto('/quotations');
  });

  test('sidebar is hidden and hamburger button is visible on mobile', async ({ page }) => {
    const sidebar = page.locator('aside');
    // Sidebar should be off-screen (transform: translateX(-100%))
    await expect(sidebar).toHaveCSS('transform', /matrix\(-?1/);
    await expect(page.locator('button[aria-label="Open menu"]')).toBeVisible();
  });

  test('hamburger opens the sidebar and shows nav links', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]');
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    await expect(page.locator('aside >> text=Quotations')).toBeVisible();
  });

  test('overlay click closes the sidebar', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]');
    // Click the backdrop overlay (sits between sidebar and main content)
    await page.locator('.bg-black\\/40').click();
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveCSS('transform', /matrix\(-?1/);
  });

  test('close button inside sidebar closes it', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]');
    await page.click('button[aria-label="Close menu"]');
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveCSS('transform', /matrix\(-?1/);
  });

  test('quotations are shown as cards (not a table) on mobile', async ({ page }) => {
    await expect(page.locator('table')).not.toBeVisible();
    // Card list is the md:hidden section — at least one card button should exist
    await expect(page.locator('.md\\:hidden button').first()).toBeVisible();
  });

  test('rep can create a quotation via mobile and the card appears', async ({ page }) => {
    await page.click('button:has-text("New Quotation")');
    await page.fill('input[placeholder*="Software Development"]', 'Mobile E2E Quotation');

    await page.fill('input[placeholder*="Search or create a client"]', 'Mobile Client');
    await page.click('li[role="option"]:has-text("Create")');

    await page.fill('input[placeholder="Description"]', 'Mobile service');
    await page.fill('input[placeholder="0.00"]', '999');

    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();

    // Title appears in the mobile card list
    await expect(page.locator('text=Mobile E2E Quotation').first()).toBeVisible();
  });
});
