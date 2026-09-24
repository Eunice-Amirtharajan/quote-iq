import { test, expect } from '@playwright/test';

const GQL = 'http://localhost:4000/graphql';
const TEST_API = 'http://localhost:4000';

async function gql(
  request: import('@playwright/test').APIRequestContext,
  query: string,
  variables: Record<string, unknown> = {},
  cookie?: string,
): Promise<{ data?: Record<string, unknown>; errors?: unknown[] }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const res = await request.post(GQL, { data: { query, variables }, headers });
  return res.json();
}

async function loginApi(
  request: import('@playwright/test').APIRequestContext,
  email: string,
  password: string,
): Promise<{ cookie: string; userId: string }> {
  const res = await request.post(GQL, {
    data: {
      query: `mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) { id }
      }`,
      variables: { email, password },
    },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = (await res.json()) as { data?: { login?: { id: string } } };
  const setCookie = res.headers()['set-cookie'] ?? '';
  const match = setCookie.match(/jwt=[^;]+/);
  return {
    cookie: match ? match[0] : '',
    userId: body.data?.login?.id ?? '',
  };
}

async function getToken(
  request: import('@playwright/test').APIRequestContext,
  storeKey: string,
): Promise<string> {
  const res = await request.get(`${TEST_API}/__test__/token/${storeKey}`);
  if (!res.ok()) throw new Error(`Token not found for store key: ${storeKey}`);
  const body = (await res.json()) as { value: string };
  return body.value;
}

// ─── Navigation ──────────────────────────────────────────────────────────────

test.describe('Forgot password — navigation', () => {
  test('"Forgot password?" link on login page goes to /reset-password', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#email', { timeout: 30_000 });
    await page.click('a:has-text("Forgot password?")');
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.locator('h1:has-text("Reset your password")')).toBeVisible();
  });

  test('"Back to sign in" on request-reset page returns to /login', async ({ page }) => {
    await page.goto('/reset-password');
    await page.click('a:has-text("Back to sign in")');
    await expect(page).toHaveURL(/\/login$/);
  });
});

// ─── Request reset form ───────────────────────────────────────────────────────

test.describe('Request password reset page', () => {
  test('submitting a registered email shows the "Check your email" success state', async ({ page }) => {
    await page.goto('/reset-password');
    await page.fill('#email', 'marcus@quoteiq.com');
    await page.click('button:has-text("Send reset link")');
    await expect(page.locator('h1:has-text("Check your email")')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=spam or junk')).toBeVisible();
  });

  test('submitting an unknown email also shows success state (anti-enumeration)', async ({ page }) => {
    await page.goto('/reset-password');
    await page.fill('#email', 'nobody@example.com');
    await page.click('button:has-text("Send reset link")');
    await expect(page.locator('h1:has-text("Check your email")')).toBeVisible({ timeout: 10_000 });
  });

  test('"Back to sign in" in success state returns to /login', async ({ page }) => {
    await page.goto('/reset-password');
    await page.fill('#email', 'marcus@quoteiq.com');
    await page.click('button:has-text("Send reset link")');
    await expect(page.locator('h1:has-text("Check your email")')).toBeVisible({ timeout: 10_000 });
    await page.click('a:has-text("Back to sign in")');
    await expect(page).toHaveURL(/\/login$/);
  });
});

// ─── Invalid token error states ──────────────────────────────────────────────

test.describe('Token error states', () => {
  test('/reset-password/:badtoken — submitting shows "Invalid or expired" error', async ({ page }) => {
    await page.goto('/reset-password/invalid-token-that-does-not-exist');
    await expect(page.locator('h1:has-text("Choose a new password")')).toBeVisible();
    await page.fill('#password', 'Password1!');
    await page.fill('#confirm', 'Password1!');
    await page.click('button:has-text("Update password")');
    await expect(page.locator('text=Invalid or expired')).toBeVisible({ timeout: 10_000 });
  });

  test('/invite/:badtoken — submitting shows "Invalid or expired" error', async ({ page }) => {
    await page.goto('/invite/invalid-token-that-does-not-exist');
    await expect(page.locator('h1:has-text("Set your password")')).toBeVisible();
    await page.fill('#password', 'Password1!');
    await page.fill('#confirm', 'Password1!');
    await page.click('button:has-text("Set password")');
    await expect(page.locator('text=Invalid or expired')).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Reset password form validation ──────────────────────────────────────────

test.describe('Reset password — form validation', () => {
  test('shows error when new password is too short', async ({ page, request }) => {
    const { userId } = await loginApi(request, 'tom@quoteiq.com', 'password123');
    await gql(request, `mutation { requestPasswordReset(email: "tom@quoteiq.com") }`);
    const token = await getToken(request, `reset_uid:${userId}`);

    await page.goto(`/reset-password/${token}`);
    await page.fill('#password', 'short');
    await page.fill('#confirm', 'short');
    await page.click('button:has-text("Update password")');
    await expect(page.locator('text=at least 8 characters')).toBeVisible();
  });

  test('shows error when passwords do not match', async ({ page, request }) => {
    const { userId } = await loginApi(request, 'tom@quoteiq.com', 'password123');
    await gql(request, `mutation { requestPasswordReset(email: "tom@quoteiq.com") }`);
    const token = await getToken(request, `reset_uid:${userId}`);

    await page.goto(`/reset-password/${token}`);
    await page.fill('#password', 'Password1!');
    await page.fill('#confirm', 'Password2!');
    await page.click('button:has-text("Update password")');
    await expect(page.locator('text=do not match')).toBeVisible();
  });
});

// ─── Accept invite form validation ───────────────────────────────────────────

test.describe('Accept invite — form validation', () => {
  test('shows error when password is too short', async ({ page, request }) => {
    const { cookie: managerCookie } = await loginApi(request, 'marcus@quoteiq.com', 'password123');
    const inviteEmail = `e2e-inv-short-${Date.now()}@test.com`;
    await gql(
      request,
      `mutation InviteUser($name: String!, $email: String!, $role: Role!) {
        inviteUser(name: $name, email: $email, role: $role)
      }`,
      { name: 'E2E Short Pw', email: inviteEmail, role: 'SALES_REP' },
      managerCookie,
    );
    const userRes = await gql(
      request,
      `query { users(take: 1, search: "E2E Short Pw") { items { id } } }`,
      {},
      managerCookie,
    );
    const userId = ((userRes.data?.users as { items: { id: string }[] })?.items[0])?.id ?? '';
    const inviteToken = await getToken(request, `invite_uid:${userId}`);

    await page.goto(`/invite/${inviteToken}`);
    await page.fill('#password', 'abc');
    await page.fill('#confirm', 'abc');
    await page.click('button:has-text("Set password")');
    await expect(page.locator('text=at least 8 characters')).toBeVisible();
  });

  test('shows error when passwords do not match', async ({ page, request }) => {
    const { cookie: managerCookie } = await loginApi(request, 'marcus@quoteiq.com', 'password123');
    const inviteEmail = `e2e-inv-mismatch-${Date.now()}@test.com`;
    await gql(
      request,
      `mutation InviteUser($name: String!, $email: String!, $role: Role!) {
        inviteUser(name: $name, email: $email, role: $role)
      }`,
      { name: 'E2E Mismatch Pw', email: inviteEmail, role: 'SALES_REP' },
      managerCookie,
    );
    const userRes = await gql(
      request,
      `query { users(take: 1, search: "E2E Mismatch Pw") { items { id } } }`,
      {},
      managerCookie,
    );
    const userId = ((userRes.data?.users as { items: { id: string }[] })?.items[0])?.id ?? '';
    const inviteToken = await getToken(request, `invite_uid:${userId}`);

    await page.goto(`/invite/${inviteToken}`);
    await page.fill('#password', 'Password1!');
    await page.fill('#confirm', 'Password2!');
    await page.click('button:has-text("Set password")');
    await expect(page.locator('text=do not match')).toBeVisible();
  });
});

// ─── Full end-to-end flows ────────────────────────────────────────────────────

test.describe('Full invite flow', () => {
  test('invited user can set password and log in', async ({ page, request }) => {
    const { cookie: managerCookie } = await loginApi(request, 'marcus@quoteiq.com', 'password123');
    const inviteEmail = `e2e-inv-full-${Date.now()}@test.com`;

    await gql(
      request,
      `mutation InviteUser($name: String!, $email: String!, $role: Role!) {
        inviteUser(name: $name, email: $email, role: $role)
      }`,
      { name: 'E2E FullInvite', email: inviteEmail, role: 'SALES_REP' },
      managerCookie,
    );

    const userRes = await gql(
      request,
      `query { users(take: 1, search: "E2E FullInvite") { items { id } } }`,
      {},
      managerCookie,
    );
    const userId = ((userRes.data?.users as { items: { id: string }[] })?.items[0])?.id ?? '';
    expect(userId).toBeTruthy();

    const inviteToken = await getToken(request, `invite_uid:${userId}`);
    expect(inviteToken).toBeTruthy();

    await page.goto(`/invite/${inviteToken}`);
    await expect(page.locator('h1:has-text("Set your password")')).toBeVisible();
    await page.fill('#password', 'NewPassword1!');
    await page.fill('#confirm', 'NewPassword1!');
    await page.click('button:has-text("Set password")');

    await expect(page.locator('h1:has-text("Password set")')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Go to sign in")');
    await page.waitForSelector('#email', { timeout: 30_000 });
    await page.fill('#email', inviteEmail);
    await page.fill('#password', 'NewPassword1!');
    await page.click('button:has-text("Sign in")');
    await expect(page).toHaveURL(/\/(dashboard|quotations)/, { timeout: 15_000 });
  });
});

test.describe('Full reset password flow', () => {
  test('user can reset their password and log in with the new one', async ({ page, request }) => {
    // Use tom@quoteiq.com — dedicated test account to avoid disrupting main test sessions
    const testEmail = 'tom@quoteiq.com';
    const originalPassword = 'password123';
    const newPassword = 'ResetNew1!';

    const { userId } = await loginApi(request, testEmail, originalPassword);
    expect(userId).toBeTruthy();

    // Trigger the password reset
    await gql(request, `mutation { requestPasswordReset(email: "${testEmail}") }`);

    // Retrieve the token via the reverse-index test endpoint
    const resetToken = await getToken(request, `reset_uid:${userId}`);
    expect(resetToken).toBeTruthy();

    // Navigate to the reset page and set new password
    await page.goto(`/reset-password/${resetToken}`);
    await expect(page.locator('h1:has-text("Choose a new password")')).toBeVisible();
    await page.fill('#password', newPassword);
    await page.fill('#confirm', newPassword);
    await page.click('button:has-text("Update password")');

    await expect(page.locator('h1:has-text("Password updated")')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Go to sign in")');
    await page.waitForSelector('#email', { timeout: 30_000 });
    await page.fill('#email', testEmail);
    await page.fill('#password', newPassword);
    await page.click('button:has-text("Sign in")');
    await expect(page).toHaveURL(/\/(dashboard|quotations)/, { timeout: 15_000 });

    // Restore original password so subsequent test runs don't break
    await gql(request, `mutation { requestPasswordReset(email: "${testEmail}") }`);
    const { userId: uid2 } = await loginApi(request, testEmail, newPassword);
    const restoreToken = await getToken(request, `reset_uid:${uid2}`);
    await gql(
      request,
      `mutation ResetPassword($token: String!, $password: String!) {
        resetPassword(token: $token, password: $password)
      }`,
      { token: restoreToken, password: originalPassword },
    );
  });
});
