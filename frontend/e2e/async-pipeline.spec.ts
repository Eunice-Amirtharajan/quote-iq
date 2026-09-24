import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

async function selectSeededClient(page: Page, searchText: string) {
  const clientInput = page.locator('input[placeholder*="a client"]');
  await clientInput.click();
  // Wait for CLIENTS_QUERY to load — listbox appears once data arrives
  await expect(page.locator('ul[role="listbox"]')).toBeVisible({ timeout: 10_000 });
  // pressSequentially keeps focus on the element while typing each character,
  // triggering React's onChange reliably without any implicit mouse actions
  await clientInput.pressSequentially(searchText, { delay: 50 });
  await expect(page.locator('li[role="option"]').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('li[role="option"]').first().click();
  await expect(page.locator('ul[role="listbox"]')).not.toBeVisible();
}

test.describe('Async pipeline — Win Chance live push', () => {
  /**
   * Full async pipeline E2E:
   * rep creates quote → submits for approval → RabbitMQ consumer picks up
   * quote.created event → AI scores → ScoreGateway emits score.ready →
   * browser receives via WebSocket → Win Chance card appears without refresh.
   *
   * Manager must be logged in to see the Win Chance card (SALES_REP is blocked).
   * Timeout is generous because the Groq AI call + queue processing takes 5–15 s.
   */
  test('Win Chance score appears on detail page without refresh after submission', async ({ page }) => {
    const quotationTitle = `Pipeline-Test-${Date.now()}`;

    // --- Step 1: rep creates and submits a quotation using a seeded client ---
    await login(page, 'anna@quoteiq.com');
    await page.goto('/quotations');
    await page.click('button:has-text("New Quotation")');
    await page.waitForSelector('input[placeholder*="Software Development"]');
    await page.fill('input[placeholder*="Software Development"]', quotationTitle);

    await selectSeededClient(page, 'Bauer');

    await page.fill('input[placeholder="Description"]', 'E2E async pipeline test');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '5000');
    await page.click('button:has-text("Create Quotation")');
    await expect(page.locator('button:has-text("Create Quotation")')).not.toBeVisible();
    await expect(page.locator(`text=${quotationTitle}`).first()).toBeVisible();

    await page.click(`text=${quotationTitle}`);
    await page.waitForURL(/\/quotations\/.+/);

    await page.click('button:has-text("Submit for Approval")');
    // wait for status badge to flip to SENT — quote.created is published at this point
    await expect(
      page
        .locator('div.flex.items-center', { hasText: 'Quotations' })
        .locator('span:has-text("SENT")'),
    ).toBeVisible();

    // capture the detail URL so manager can navigate directly to it
    const detailUrl = page.url();

    // --- Step 2: sign out, log in as manager, open the same detail page ---
    await page.click('button:has-text("Sign out")');
    await page.waitForURL('/login');
    await login(page, 'marcus@quoteiq.com');
    await page.goto(detailUrl);
    await page.waitForURL(/\/quotations\/.+/);
    await expect(page.locator(`text=${quotationTitle}`).first()).toBeVisible();

    // --- Step 3: Win Chance card appears via WebSocket — no refresh ---
    // The queue consumer processes quote.created asynchronously; the browser
    // receives score.ready over the WebSocket and renders the card live.
    // Allow up to 30 s for the full pipeline (queue + AI call + emit).
    await expect(page.locator('h3:has-text("Win Chance")')).toBeVisible({
      timeout: 30_000,
    });

    // Score is a number 0–100 followed by %; assert the % sign is present
    await expect(page.locator('text=%').first()).toBeVisible({ timeout: 5_000 });
  });
});
