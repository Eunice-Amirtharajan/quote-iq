import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.fill('#email', email);
  await page.fill('#password', 'password123');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/(dashboard|quotations)/);
}

test.describe('Client management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'anna@quoteiq.com');
    await page.goto('/quotations');
  });

  test('rep can select an existing seeded client from the dropdown', async ({ page }) => {
    await page.click('button:has-text("New Quotation")');

    await page.fill('input[placeholder*="Software Development"]', 'Existing Client Test');

    // Open the ClientSelector and wait for the seeded clients to appear
    const clientInput = page.locator('input[placeholder*="Search or create a client"]');
    await clientInput.fill('Bauer');

    // Seeded client "bauer logistics gmbh" should appear
    await expect(page.locator('li[role="option"]').first()).toBeVisible();
    await page.locator('li[role="option"]').first().click();

    await page.fill('input[placeholder="Description"]', 'Consulting');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '100');

    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();
    await expect(page.locator('text=Existing Client Test').first()).toBeVisible();
  });

  test('rep can create a new client on-the-fly when creating a quotation', async ({ page }) => {
    const uniqueClient = `NewClient-${Date.now()}`;

    await page.click('button:has-text("New Quotation")');
    await page.fill('input[placeholder*="Software Development"]', 'New Client Quotation');

    const clientInput = page.locator('input[placeholder*="Search or create a client"]');
    await clientInput.fill(uniqueClient);

    // "Create" option appears for an unrecognised name
    const createOption = page.locator(`li[role="option"]:has-text("Create")`);
    await expect(createOption).toBeVisible();
    await createOption.click();

    // The input should now show the created client name
    await expect(clientInput).toHaveValue(uniqueClient);

    await page.fill('input[placeholder="Description"]', 'Consulting');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '200');

    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();
    await expect(page.locator('text=New Client Quotation').first()).toBeVisible();
  });

  test('form shows validation error when no client is selected', async ({ page }) => {
    await page.click('button:has-text("New Quotation")');
    await page.fill('input[placeholder*="Software Development"]', 'No Client Quote');

    // Do NOT select a client — go straight to submit
    await page.fill('input[placeholder="Description"]', 'Item');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '50');

    await page.click('button:has-text("Create Quotation")');

    await expect(
      page.locator('text=Please select or create a client.'),
    ).toBeVisible();
  });

  test('client name is displayed on the quotation detail page', async ({ page }) => {
    const uniqueClient = `DetailClient-${Date.now()}`;

    await page.click('button:has-text("New Quotation")');
    await page.fill('input[placeholder*="Software Development"]', 'Detail Client Test');

    const clientInput = page.locator('input[placeholder*="Search or create a client"]');
    await clientInput.fill(uniqueClient);
    await page.locator('li[role="option"]:has-text("Create")').click();

    await page.fill('input[placeholder="Description"]', 'Service');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '300');

    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();

    // Navigate to detail page
    await page.click('text=Detail Client Test');
    await page.waitForURL(/\/quotations\/.+/);

    // Client name appears on the detail page
    await expect(page.locator(`text=${uniqueClient}`).first()).toBeVisible();
  });
});
