import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.fill('#email', email);
  await page.fill('#password', 'password123');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/(dashboard|quotations)/);
}

async function openNewQuotationModal(page: Page) {
  await page.click('button:has-text("New Quotation")');
  await page.waitForSelector('input[placeholder*="Software Development"]');
}

async function selectClientByTyping(page: Page, searchText: string) {
  const clientInput = page.locator('input[placeholder*="a client"]');
  await clientInput.click();
  // Wait for the CLIENTS_QUERY to load — listbox appears once data arrives
  await expect(page.locator('ul[role="listbox"]')).toBeVisible({ timeout: 10_000 });
  // pressSequentially keeps focus on the element while typing each character,
  // triggering React's onChange reliably without any implicit mouse actions
  await clientInput.pressSequentially(searchText, { delay: 50 });
  return clientInput;
}

async function createClientInline(page: Page, clientName: string) {
  const clientInput = await selectClientByTyping(page, clientName);
  const createOption = page.locator('li[role="option"]:has-text("Create")');
  await expect(createOption).toBeVisible();
  await createOption.click();
  // Wait for the dropdown to close — happens in handleCreate's finally block
  // after the createClient mutation resolves and clientId is set in parent
  await expect(page.locator('ul[role="listbox"]')).not.toBeVisible();
  return clientInput;
}

test.describe('Client management — rep (search only)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'anna@quoteiq.com');
    await page.goto('/quotations');
  });

  test('rep can select an existing seeded client from the dropdown', async ({ page }) => {
    await openNewQuotationModal(page);
    await page.fill('input[placeholder*="Software Development"]', 'Existing Client Test');

    // Type to trigger dropdown, then pick seeded client
    const clientInput = await selectClientByTyping(page, 'Bauer');
    await expect(page.locator('li[role="option"]').first()).toBeVisible({ timeout: 10_000 });
    await page.locator('li[role="option"]').first().click();
    // Dropdown closed — clientId is set
    await expect(page.locator('ul[role="listbox"]')).not.toBeVisible();

    await page.fill('input[placeholder="Description"]', 'Consulting');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '100');

    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();
    await expect(page.locator('text=Existing Client Test').first()).toBeVisible();
  });

  test('form shows validation error when no client is selected', async ({ page }) => {
    await openNewQuotationModal(page);
    await page.fill('input[placeholder*="Software Development"]', 'No Client Quote');

    // Do NOT select a client — go straight to submit
    await page.fill('input[placeholder="Description"]', 'Item');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '50');

    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('text=Please select or create a client.')).toBeVisible();
  });
});

test.describe('Client management — manager (can create clients)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'marcus@quoteiq.com');
    await page.goto('/quotations');
  });

  test('manager can create a new client on-the-fly when creating a quotation', async ({ page }) => {
    const uniqueClient = `NewClient-${Date.now()}`;

    await openNewQuotationModal(page);
    await page.fill('input[placeholder*="Software Development"]', 'New Client Quotation');

    await createClientInline(page, uniqueClient);

    await page.fill('input[placeholder="Description"]', 'Consulting');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '200');

    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();
    await expect(page.locator('text=New Client Quotation').first()).toBeVisible();
  });

  test('client name is displayed on the quotation detail page', async ({ page }) => {
    const uniqueClient = `DetailClient-${Date.now()}`;

    await openNewQuotationModal(page);
    await page.fill('input[placeholder*="Software Development"]', 'Detail Client Test');

    await createClientInline(page, uniqueClient);

    await page.fill('input[placeholder="Description"]', 'Service');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '300');

    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();

    await page.click('text=Detail Client Test');
    await page.waitForURL(/\/quotations\/.+/);
    await expect(page.locator(`text=${uniqueClient}`).first()).toBeVisible();
  });
});
