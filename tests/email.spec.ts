import crypto from 'node:crypto';
import fs from 'node:fs';
import { expect, request, test } from '@playwright/test';
import { dbQuery, nextIp, registerViaApi, RUN } from './helpers';
import { renderPasswordResetEmail, renderVerifyEmail, renderWelcomeEmail, sendMail } from '../src/lib/mailer';

// Transactional email suite: password reset, email verification, welcome
// mail, outbound rate limiting, and the disabled-mode mailer contract.
//
// Requires the app to run with the test hook armed (E2E_TOKENS=1, non-prod):
// token-issuing endpoints then expose the raw token in x-test-*-token headers.
//
// Each API "user" gets its own source IP (TEST-NET-2/3) so the suite stays
// clear of the app's per-IP auth rate limits.

function sha256(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function newCtx() {
  return request.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } });
}

async function register(ctx: Awaited<ReturnType<typeof newCtx>>, tag: string) {
  const user = { email: `mail-${tag}-${RUN}@postivo.dev`, password: `mail-pass-${RUN}`, name: `Mail ${tag}` };
  const res = await ctx.post('/api/auth/register', {
    data: { name: user.name, email: user.email, password: user.password },
  });
  expect(res.ok(), `register ${tag}: ${await res.text()}`).toBeTruthy();
  return { user, res };
}

// ---------- mailer unit-ish (in-process, EMAIL_ENABLED off) ----------

test('mailer: disabled mode resolves ok and templates carry the brand', async () => {
  delete process.env.EMAIL_ENABLED; // belt & braces: the stub path must be taken
  const reset = renderPasswordResetEmail({ resetUrl: 'http://localhost:3240/reset-password?token=abc' });
  expect(reset.html).toContain('#07080c'); // ink background
  expect(reset.html).toContain('#6e6bf0'); // iris accent
  expect(reset.html).toContain('<table'); // email-safe table layout
  expect(reset.text).toContain('reset-password?token=abc');
  expect(renderVerifyEmail({ verifyUrl: 'http://x/verify-email?token=v' }).subject).toContain('Verify');
  expect(renderWelcomeEmail({ name: 'Ada', dashboardUrl: 'http://x/dashboard' }).html).toContain('Ada');
  const res = await sendMail({ to: `mailer-unit-${RUN}@postivo.dev`, ...reset });
  expect(res.ok).toBe(true);
});

test('mailer: rendered HTML preview (screenshot artifact)', async ({ page }) => {
  const tpl = renderPasswordResetEmail({ resetUrl: 'http://localhost:3240/reset-password?token=preview-token' });
  await fs.promises.mkdir('/tmp/postivo-qa', { recursive: true });
  await page.setViewportSize({ width: 800, height: 700 });
  await page.setContent(tpl.html);
  await page.screenshot({ path: '/tmp/postivo-qa/email-preview.png', fullPage: true });
});

// ---------- forgot ----------

test('forgot: always 200, identical for known and unknown emails', async () => {
  const ctx = await newCtx();
  const { user } = await register(ctx, 'forgot');
  const known = await ctx.post('/api/auth/forgot', { data: { email: user.email } });
  expect(known.status()).toBe(200);
  expect(await known.json()).toEqual({ ok: true, email_enabled: false });
  const unknown = await ctx.post('/api/auth/forgot', { data: { email: `ghost-${RUN}@postivo.dev` } });
  expect(unknown.status()).toBe(200);
  expect(await unknown.json()).toEqual({ ok: true, email_enabled: false });
  // The hook leaks the token only for the existing account.
  expect(known.headers()['x-test-reset-token']).toBeTruthy();
  expect(unknown.headers()['x-test-reset-token']).toBeFalsy();
  await ctx.dispose();
});

// ---------- password reset end-to-end ----------

test('reset: full token flow — wrong/valid/reused, sessions revoked, new password logs in', async ({
  page,
}) => {
  const ctx = await newCtx();
  const { user, res: reg } = await register(ctx, 'reset');
  const oldCookie = reg
    .headersArray()
    .find((h) => h.name.toLowerCase() === 'set-cookie')
    ?.value.match(/postivo_session=([^;]*)/)?.[1];
  expect(oldCookie).toBeTruthy();

  const forgot = await ctx.post('/api/auth/forgot', { data: { email: user.email } });
  const token = forgot.headers()['x-test-reset-token'];
  expect(token, 'test hook must expose the reset token').toBeTruthy();

  // Wrong token -> 400 invalid
  const wrong = await ctx.post('/api/auth/reset', { data: { token: 'bogus-token', password: 'new-pass-12345' } });
  expect(wrong.status()).toBe(400);
  expect(((await wrong.json()) as { code: string }).code).toBe('invalid');

  // Valid token -> ok
  const ok = await ctx.post('/api/auth/reset', { data: { token, password: 'new-pass-12345' } });
  expect(ok.status(), await ok.text()).toBe(200);

  // Old session cookie is revoked -> 401
  const probe = await request.newContext();
  const me = await probe.get('/api/auth/me', { headers: { cookie: `postivo_session=${oldCookie}` } });
  expect(me.status()).toBe(401);
  await probe.dispose();

  // New password logs in
  const loginCtx = await newCtx();
  const login = await loginCtx.post('/api/auth/login', { data: { email: user.email, password: 'new-pass-12345' } });
  expect(login.status(), await login.text()).toBe(200);
  await loginCtx.dispose();

  // Reused token -> 400 invalid
  const reused = await ctx.post('/api/auth/reset', { data: { token, password: 'other-pass-12345' } });
  expect(reused.status()).toBe(400);
  expect(((await reused.json()) as { code: string }).code).toBe('invalid');

  // Reused token link -> error page
  await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  await expect(page.getByText('Link already used')).toBeVisible();
  await ctx.dispose();
});

test('reset: expired token -> 400 expired + error page', async ({ page }) => {
  const ctx = await newCtx();
  const { user } = await register(ctx, 'expired');
  const forgot = await ctx.post('/api/auth/forgot', { data: { email: user.email } });
  const token = forgot.headers()['x-test-reset-token'];
  expect(token).toBeTruthy();

  // Age the token past its 1h lifetime directly in the DB.
  await dbQuery(`UPDATE password_resets SET expires_at = now() - interval '10 minutes' WHERE token_hash = $1`, [
    sha256(token),
  ]);

  const res = await ctx.post('/api/auth/reset', { data: { token, password: 'new-pass-12345' } });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { code: string }).code).toBe('expired');

  await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  await expect(page.getByText('Link expired')).toBeVisible();
  await ctx.dispose();
});

test('reset: browser flow — forgot link on login, form posts, lands on dashboard', async ({ page }) => {
  const ctx = await newCtx();
  const { user } = await register(ctx, 'browser');
  const forgot = await ctx.post('/api/auth/forgot', { data: { email: user.email } });
  const token = forgot.headers()['x-test-reset-token'];
  await ctx.dispose();

  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();

  await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  await page.locator('#reset-password').fill('browser-pass-123');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});

// ---------- email verification ----------

test('verify: token marks user verified, success screen, bogus token errors', async ({ page }) => {
  const ip = nextIp();
  const user = { email: `mail-vflow-${RUN}@postivo.dev`, password: 'verify-pass-123', name: 'Mail vflow' };
  const reg = await page.request.post('/api/auth/register', {
    headers: { 'x-forwarded-for': ip },
    data: user,
  });
  expect(reg.ok()).toBeTruthy();
  const token = reg.headers()['x-test-verify-token'];
  expect(token, 'test hook must expose the verification token').toBeTruthy();

  // Unverified in the DB before consuming the token.
  const before = await dbQuery<{ email_verified_at: string | null }>(
    'SELECT email_verified_at FROM users WHERE email = $1',
    [user.email],
  );
  expect(before[0].email_verified_at).toBeNull();

  await page.goto(`/verify-email?token=${encodeURIComponent(token)}`);
  await expect(page.getByText('Email verified')).toBeVisible();

  const after = await dbQuery<{ email_verified_at: string | null }>(
    'SELECT email_verified_at FROM users WHERE email = $1',
    [user.email],
  );
  expect(after[0].email_verified_at).toBeTruthy();

  await page.goto('/verify-email?token=bogus-token');
  await expect(page.getByText('Link invalid')).toBeVisible();
});

test('verify: dashboard banner shows for unverified, resend works then 429s', async ({ page }) => {
  await registerViaApi(page, 'banner'); // fresh unverified user, session cookie in context
  await page.goto('/dashboard');
  await expect(page.getByText('Verify your email', { exact: true })).toBeVisible();

  const resend = page.getByRole('button', { name: 'Resend' });
  // Endpoint allows 3 resends per 10 min per user; the 4th must 429.
  // The suite runs with email stubbed, so the banner is honest about that.
  for (let i = 0; i < 3; i++) {
    await resend.click();
    await expect(page.getByText("We couldn't send the email — delivery isn't set up on this workspace.")).toBeVisible();
  }
  await resend.click();
  await expect(page.getByText('Too many requests — try again in a few minutes.')).toBeVisible();
});
