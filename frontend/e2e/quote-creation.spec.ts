import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

async function createClientInline(page: Page, clientName: string) {
  const clientInput = page.locator('input[placeholder*="a client"]');
  await clientInput.click();
  // Wait for CLIENTS_QUERY to load — listbox appears with existing clients
  await expect(page.locator('ul[role="listbox"]')).toBeVisible({ timeout: 10_000 });
  // pressSequentially keeps focus on the element while typing each character,
  // triggering React's onChange reliably without any implicit mouse actions
  await clientInput.pressSequentially(clientName, { delay: 50 });
  const createOption = page.locator('li[role="option"]:has-text("Create")');
  await expect(createOption).toBeVisible();
  await createOption.click();
  // Wait for dropdown to close — happens in handleCreate's finally after mutation resolves
  await expect(page.locator('ul[role="listbox"]')).not.toBeVisible();
}

test.describe('Quote creation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'marcus@quoteiq.com');
    await page.goto('/quotations');
  });

  test('manager can create a quotation and it appears in the list', async ({ page }) => {
    await page.click('button:has-text("New Quotation")');
    await page.waitForSelector('input[placeholder*="Software Development"]');
    await page.fill('input[placeholder*="Software Development"]', 'E2E Test Quotation');

    await createClientInline(page, `TestClient-${Date.now()}`);

    await page.fill('input[placeholder="Description"]', 'Consulting services');
    await page.fill('input[placeholder="Qty"]', '2');
    await page.fill('input[placeholder="0.00"]', '500');

    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();
    await expect(page.locator('text=E2E Test Quotation').first()).toBeVisible();
  });
});

test.describe('Mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await login(page, 'marcus@quoteiq.com');
    await page.goto('/quotations');
  });

  test('sidebar is hidden and hamburger button is visible on mobile', async ({ page }) => {
    const sidebar = page.locator('aside');
    // Tailwind uses CSS custom properties for translate, so assert on class not computed CSS
    await expect(sidebar).toHaveClass(/-translate-x-full/);
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
    await page.locator('.bg-black\\/40').click();
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveClass(/-translate-x-full/);
  });

  test('close button inside sidebar closes it', async ({ page }) => {
    await page.click('button[aria-label="Open menu"]');
    await page.click('button[aria-label="Close menu"]');
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveClass(/-translate-x-full/);
  });

  test('quotations are shown as cards (not a table) on mobile', async ({ page }) => {
    await expect(page.locator('table')).not.toBeVisible();
    await expect(page.locator('.md\\:hidden button').first()).toBeVisible();
  });

  test('manager can create a quotation via mobile and the card appears', async ({ page }) => {
    await page.click('button:has-text("New Quotation")');
    await page.waitForSelector('input[placeholder*="Software Development"]');
    await page.fill('input[placeholder*="Software Development"]', 'Mobile E2E Quotation');

    await createClientInline(page, `MobileClient-${Date.now()}`);

    await page.fill('input[placeholder="Description"]', 'Mobile service');
    await page.fill('input[placeholder="0.00"]', '999');

    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();
    await expect(page.locator('text=Mobile E2E Quotation').first()).toBeVisible();
  });
});
