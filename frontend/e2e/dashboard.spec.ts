import { test, expect, type Page, type Request } from '@playwright/test';
import { login, logout, selectSeededClient } from './helpers';

// CI seeds users and one client but no quotations, and specs share one database —
// so these tests assert structure and behaviour, and create their own approved quote
// when they need data to flow through. The 'E2E' title prefix is cleaned up by
// global-teardown.

/** The dashboard's daily panels, in page order */
const DASHBOARD_PANELS = ['Stale Pipeline', 'Rep Performance', 'Approval Rate Trend'];

/** Analysis panels that live on the Win/Loss page */
const ANALYSIS_PANELS = ['Win Rate by Deal Size', 'Deal Velocity', 'Quarter-on-Quarter'];

const ANALYTICS_OPS = [
  'DashboardStats',
  'RepPerformance',
  'ApprovalRateTrend',
  'StaleQuotations',
  'ClientConcentration',
  'DealVelocity',
  'QuarterlyHistory',
  'RepDealSizeWinRates',
];

/** Win/Loss analysis queries that follow its period selector (quarterly history doesn't) */
const ANALYSIS_OPS_WITH_RANGE = ['DashboardStats', 'DealVelocity', 'RepDealSizeWinRates'];

/** Operation names of GraphQL requests made from now on */
function recordGraphqlOperations(page: Page) {
  const ops: { name: string; variables: Record<string, unknown> }[] = [];
  const onRequest = (req: Request) => {
    if (!req.url().includes('/graphql') || req.method() !== 'POST') return;
    const body = req.postDataJSON() as { operationName?: string; variables?: Record<string, unknown> } | null;
    if (body?.operationName) ops.push({ name: body.operationName, variables: body.variables ?? {} });
  };
  page.on('request', onRequest);
  return { ops, stop: () => page.off('request', onRequest) };
}

async function openDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Pipeline Intelligence' })).toBeVisible({ timeout: 15_000 });
  // Every daily panel has resolved once none is still showing its skeleton
  for (const name of DASHBOARD_PANELS) {
    await expect(page.getByRole('region', { name })).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
}

async function openPipelineAnalysis(page: Page) {
  await page.goto('/winloss');
  const analysis = page.getByRole('region', { name: 'Pipeline analysis' });
  await expect(analysis).toBeVisible({ timeout: 15_000 });
  // Every analysis panel has resolved once none is still showing its skeleton
  const qoq = analysis.getByRole('region', { name: 'Quarter-on-Quarter' });
  await expect(qoq.getByRole('rowheader')).toHaveCount(4, { timeout: 15_000 });
  await expect(analysis.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  return analysis;
}

/** The status badge next to the breadcrumb on the quotation detail page */
function statusBadge(page: Page, status: string) {
  return page.locator('div.flex.items-center', { hasText: 'Quotations' }).locator(`span:has-text("${status}")`);
}

async function createApprovedQuote(page: Page, title: string) {
  await login(page, 'anna@quoteiq.com');
  await page.goto('/quotations');
  await page.click('button:has-text("New Quotation")');
  await page.waitForSelector('input[placeholder*="Software Development"]');
  await page.fill('input[placeholder*="Software Development"]', title);
  await selectSeededClient(page, 'Bauer');
  await page.fill('input[placeholder="Description"]', 'Analytics e2e line item');
  await page.fill('input[placeholder="Qty"]', '2');
  await page.fill('input[placeholder="0.00"]', '1500');
  await page.click('button:has-text("Create Quotation")');
  // Creating a quote opens its detail page
  await page.waitForURL(/\/quotations\/.+/);
  await page.click('button:has-text("Submit for Approval")');
  await expect(statusBadge(page, 'SENT')).toBeVisible();
  await logout(page);

  await login(page, 'marcus@quoteiq.com');
  await page.goto('/quotations');
  await page.getByText(title).first().click();
  await page.waitForURL(/\/quotations\/.+/);
  await page.click('button:has-text("Approve")');
  await expect(statusBadge(page, 'APPROVED')).toBeVisible();
}

test.describe('Pipeline Intelligence dashboard', () => {
  test('manager sees the KPI tiles and the three daily panels, in order', async ({ page }) => {
    await login(page, 'marcus@quoteiq.com');
    await openDashboard(page);

    for (const label of ['Total Pipeline', 'Approval Rate', 'Avg Deal Size', 'Stale Quotes']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    const regions = await page.getByRole('region').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(regions).toEqual(DASHBOARD_PANELS);

    // Analysis panels are not on the dashboard; the page points to Win/Loss instead
    for (const name of ANALYSIS_PANELS) {
      await expect(page.getByRole('region', { name })).toHaveCount(0);
    }
    await expect(page.getByRole('link', { name: 'Win/Loss', exact: true }).last()).toHaveAttribute('href', '/winloss');

    // Every panel resolved — none fell back to its error state
    await expect(page.getByText(/Couldn't load/)).toHaveCount(0);
    await expect(page.getByText('Failed to load dashboard stats')).toHaveCount(0);
  });

  test('an approved quotation shows up in the dashboard panels', async ({ page }) => {
    test.setTimeout(90_000); // creates, sends and approves a quote through the UI first
    await createApprovedQuote(page, `E2E-Analytics-${Date.now()}`);
    await openDashboard(page);

    // Rep Performance: Anna has approved revenue, so she appears with revenue and "win rate · deals"
    const reps = page.getByRole('region', { name: 'Rep Performance' });
    await expect(reps.locator('svg').getByText('Anna Schmidt')).toBeVisible();
    await expect(reps.locator('svg').getByText(/^\d+(\.\d)?% · [\d,]+ deals$/).first()).toBeVisible();

    // Approval trend: the current month (by status-change date, UTC) now has a rate
    const now = new Date();
    const monthLabel = `${now.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${now.getUTCFullYear()}`;
    const trendTable = page.getByRole('table', { name: 'Monthly approval rate' });
    await expect(trendTable.getByRole('row').filter({ hasText: monthLabel })).toContainText('%');
  });

  test('the period selector refetches only the panels it scopes', async ({ page }) => {
    await login(page, 'marcus@quoteiq.com');
    await openDashboard(page);

    const recorder = recordGraphqlOperations(page);
    await page.getByRole('button', { name: 'Last 30 days' }).click();

    await expect(page.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('approved revenue + win rate · last 30 days', { exact: true })).toBeVisible();
    await expect(page.getByText(/quotations · last 30 days$/)).toBeVisible();
    await expect
      .poll(() => recorder.ops.filter((o) => ANALYTICS_OPS.includes(o.name)).length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(3);
    await page.waitForLoadState('networkidle');
    recorder.stop();

    // Only analytics operations matter here — anything else the layout fetches is ignored.
    // ClientConcentration still runs on the dashboard: it drives the concentration warning.
    const analytics = recorder.ops.filter((o) => ANALYTICS_OPS.includes(o.name));
    expect(analytics.map((o) => o.name).sort()).toEqual(['ClientConcentration', 'DashboardStats', 'RepPerformance']);
    for (const op of analytics) {
      expect(op.variables.range).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    }
  });

  test('sales rep has no dashboard link and sees an access message', async ({ page }) => {
    await login(page, 'anna@quoteiq.com');
    await expect(page).toHaveURL(/\/quotations/);
    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);

    await page.goto('/dashboard');
    await expect(page.getByText('Pipeline analytics are available to sales managers.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Rep Performance' })).toHaveCount(0);
  });

  test('chart libraries are only downloaded when the dashboard is opened', async ({ page }) => {
    const chartRequests: string[] = [];
    page.on('request', (req) => {
      if (/recharts/.test(req.url())) chartRequests.push(req.url());
    });

    // A rep never visits the dashboard, so the chart code should never load
    await login(page, 'anna@quoteiq.com');
    await expect(page).toHaveURL(/\/quotations/);
    await page.waitForLoadState('networkidle');
    expect(chartRequests).toEqual([]);

    await logout(page);
    await login(page, 'marcus@quoteiq.com');
    await openDashboard(page);
    expect(chartRequests.length).toBeGreaterThan(0);
  });
});

test.describe('Pipeline analysis on the Win/Loss page', () => {
  test('manager sees the heatmap, concentration, velocity and quarter history — and no funnel', async ({ page }) => {
    await login(page, 'marcus@quoteiq.com');
    const analysis = await openPipelineAnalysis(page);

    for (const name of ANALYSIS_PANELS) {
      await expect(analysis.getByRole('region', { name })).toBeVisible();
    }
    // Removed after the PM review: funnel, client concentration panel, quarter card grid
    for (const removed of ['Pipeline Funnel', 'Client Concentration']) {
      await expect(analysis.getByRole('region', { name: removed })).toHaveCount(0);
    }
    await expect(analysis.getByRole('article')).toHaveCount(0);
    // Newest quarter first, marked as in progress
    const qoq = analysis.getByRole('region', { name: 'Quarter-on-Quarter' });
    await expect(qoq.getByRole('rowheader').first()).toContainText('in progress');
    await expect(analysis.getByText(/Couldn't load/)).toHaveCount(0);
  });

  test('an approved quotation flows through to the analysis panels', async ({ page }) => {
    test.setTimeout(90_000);
    await createApprovedQuote(page, `E2E-Analysis-${Date.now()}`);
    const analysis = await openPipelineAnalysis(page);

    // Heatmap: Anna now has a decided deal in the < €5k band (2 × €1,500 = €3,000), so she has a row,
    // and the team baseline row is always drawn
    const heatmap = analysis.getByRole('region', { name: 'Win Rate by Deal Size' });
    await expect(heatmap.locator('svg text').filter({ hasText: 'Anna Schmidt' })).toBeVisible();
    await expect(heatmap.locator('svg text').filter({ hasText: 'Team average' })).toBeVisible();
    await expect(heatmap.locator('svg rect')).not.toHaveCount(0);

    // The funnel's numbers now live in one line of text
    await expect(analysis.getByLabel('Stage conversion')).toContainText('of sent are approved');
    await expect(analysis.getByRole('region', { name: 'Pipeline Funnel' })).toHaveCount(0);

    // Deal Velocity: the approval just recorded is a SENT → APPROVED sample
    const velocity = analysis.getByRole('region', { name: 'Deal Velocity' });
    const approvedRow = velocity.getByRole('row').filter({ hasText: 'SENT → APPROVED' });
    await expect(approvedRow.getByRole('cell').nth(1)).toHaveText(/^\d+(\.\d)?d$/);

    // Quarter-on-Quarter: the current quarter's quote count includes the new quotation
    const currentQuarter = analysis.getByRole('region', { name: 'Quarter-on-Quarter' }).locator('tr[aria-current="true"]');
    await expect(currentQuarter.getByRole('cell').nth(1)).toHaveText(/^[1-9][\d,]*$/);
  });

  test('its own period selector refetches the heatmap, stage conversion and velocity', async ({ page }) => {
    await login(page, 'marcus@quoteiq.com');
    const analysis = await openPipelineAnalysis(page);

    const recorder = recordGraphqlOperations(page);
    await analysis.getByRole('group', { name: 'Analysis period' }).getByRole('button', { name: 'Last 90 days' }).click();
    await expect
      .poll(() => recorder.ops.filter((o) => ANALYTICS_OPS.includes(o.name)).length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(ANALYSIS_OPS_WITH_RANGE.length);
    await page.waitForLoadState('networkidle');
    recorder.stop();

    const analytics = recorder.ops.filter((o) => ANALYSIS_OPS_WITH_RANGE.includes(o.name));
    expect(analytics.map((o) => o.name).sort()).toEqual(ANALYSIS_OPS_WITH_RANGE);
    const heatmapOp = analytics.find((o) => o.name === 'RepDealSizeWinRates')!;
    expect(heatmapOp.variables).toMatchObject({ offset: 0, range: { from: expect.any(String) } });
  });
});
