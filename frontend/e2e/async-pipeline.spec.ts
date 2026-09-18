import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.fill('#email', email);
  await page.fill('#password', 'password123');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/(dashboard|quotations)/);
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

    // --- Step 1: rep creates and submits a quotation ---
    await login(page, 'anna@quoteiq.com');
    await page.goto('/quotations');
    await page.click('button:has-text("New Quotation")');
    await page.fill('input[placeholder*="Software Development"]', quotationTitle);
    await page.fill('input[placeholder*="Acme Corp"]', 'Pipeline Test Client');
    await page.fill('input[placeholder="Description"]', 'E2E async pipeline test');
    await page.fill('input[placeholder="Qty"]', '1');
    await page.fill('input[placeholder="0.00"]', '5000');
    await page.click('button:has-text("Create Quotation")');
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
    // (the number itself is dynamic — we assert shape, not exact value)
    await expect(page.locator('text=%').first()).toBeVisible({ timeout: 5_000 });
  });
});
