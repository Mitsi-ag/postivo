import { expect, test } from '@playwright/test';
import { addChannel, createPost, failPostInDb, pastIso, pastLocal, registerViaApi, RUN } from './helpers';

test.describe('unauthenticated', () => {
  test('landing renders hero, pricing and FAQ', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Schedule everywhere');
    await expect(page.locator('#pricing')).toContainText('$9');
    await expect(page.locator('#faq')).toBeVisible();
  });

  test('privacy, terms and support pages return 200', async ({ request }) => {
    for (const path of ['/privacy', '/terms', '/support']) {
      const res = await request.get(path);
      expect(res.status(), `${path} should be 200`).toBe(200);
    }
  });

  test('app pages redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('auth', () => {
  test('register → onboarding → dashboard, logout, login, wrong password error', async ({ page }) => {
    const email = `e2e-auth-${RUN}@postivo.dev`;
    const password = 'e2e-auth-pass-1';

    await page.goto('/register');
    await page.getByPlaceholder('Ada Lovelace').fill('E2E Auth');
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('At least 8 characters').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('link', { name: 'Go to dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByLabel('Password').fill('totally-wrong-99');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();

    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('channels', () => {
  test('add demo channel → lists → delete', async ({ page }) => {
    await registerViaApi(page, 'channels');
    await page.goto('/channels');
    await page.getByRole('button', { name: 'Demo Channel' }).click();
    await page.getByPlaceholder('Demo Channel').fill('My Demo');
    await page.getByRole('button', { name: 'Connect channel' }).click();
    await expect(page.getByText('My Demo')).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No channels connected yet')).toBeVisible();
  });
});

test.describe('compose & publish', () => {
  test('content + channel + preview + follow-up + tag + past-due schedule → published', async ({ page }) => {
    test.setTimeout(200_000);
    await registerViaApi(page, 'compose');
    await addChannel(page);
    const content = `E2E compose ${RUN}`;

    await page.goto('/compose');
    await page.locator('#compose-content').fill(content);
    await page.getByRole('group', { name: 'Select channels' }).getByRole('button', { name: 'E2E Demo' }).click();

    // Live preview reflects the content (rendered as a preview paragraph).
    await expect(page.getByText('Live preview')).toBeVisible();
    await expect(page.getByRole('paragraph').filter({ hasText: content })).toBeVisible();

    // Follow-up thread row (behind the "+ Thread" section toggle).
    await page.getByRole('button', { name: '+ Thread' }).click();
    await page.getByRole('button', { name: 'Add follow-up' }).click();
    await expect(page.getByText('Reply 1')).toBeVisible();
    await page.getByPlaceholder('Follow-up content…').fill(`follow-up ${RUN}`);

    // Tag chip (behind the "+ Tags" section toggle).
    await page.getByRole('button', { name: '+ Tags' }).click();
    await page.locator('#tag-input').fill('e2etag');
    await page.locator('#tag-input').press('Enter');
    await expect(page.getByText('#e2etag')).toBeVisible();

    // Past-due schedule → toast → queue.
    await page.locator('#schedule-at').fill(pastLocal());
    await page.getByRole('button', { name: 'Schedule post' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Post scheduled' })).toBeVisible();
    await expect(page).toHaveURL(/\/queue/);
    await expect(page.getByText(content)).toBeVisible();

    // Poll the API until the in-process scheduler publishes (tick every 30s).
    let published = false;
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      const res = await page.request.get('/api/queue?tab=published');
      const body = await res.text();
      if (body.includes(content) && body.includes('"external_url"')) {
        published = true;
        break;
      }
      await page.waitForTimeout(5_000);
    }
    expect(published, 'post should publish within 150s').toBeTruthy();

    await page.getByRole('tab', { name: 'Published' }).click();
    await expect(page.getByText(content)).toBeVisible();
  });
});

test.describe('queue', () => {
  test('search/tag filters, draft edit/delete, failed target retry', async ({ page }) => {
    test.setTimeout(120_000);
    await registerViaApi(page, 'queue');
    const channelId = await addChannel(page);
    const tag = `q${RUN}`;
    await createPost(page, { content: `Draft alpha ${RUN}`, tags: [tag], channelIds: [] });

    await page.goto('/queue');
    await page.getByRole('tab', { name: 'Drafts' }).click();
    await expect(page.getByText(`Draft alpha ${RUN}`)).toBeVisible();

    // Search filter.
    await page.getByLabel('Search posts').fill('zzz-no-match');
    await expect(page.getByText('No posts match your filters')).toBeVisible();
    await page.getByLabel('Search posts').fill('');

    // Tag filter.
    await page.getByLabel('Filter by tag').selectOption(tag);
    await expect(page.getByText(`Draft alpha ${RUN}`)).toBeVisible();
    await page.getByLabel('Filter by tag').selectOption('');

    // Edit the draft in the composer (wait for the post to load first).
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/compose\?post=/);
    await expect(page.locator('#compose-content')).toHaveValue(`Draft alpha ${RUN}`);
    await page.locator('#compose-content').fill(`Draft beta ${RUN}`);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\/queue/);
    await page.getByRole('tab', { name: 'Drafts' }).click();
    await expect(page.getByText(`Draft beta ${RUN}`)).toBeVisible();

    // Failed target retry (X provider, fake token; failure arranged directly).
    // Scheduled in the future so the scheduler can't claim the target and race
    // the arranged failure below.
    const xChannel = await addChannel(page, 'x', 'E2E X', { bearerToken: 'fake-token-for-e2e' });
    const failing = await createPost(page, {
      content: `Will fail ${RUN}`,
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      channelIds: [xChannel],
    });
    await failPostInDb(failing.id);
    await page.getByRole('tab', { name: 'Failed' }).click();
    await expect(page.getByText('simulated failure').first()).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Retry queued' })).toBeVisible();
    // Clean up the re-queued post so the scheduler doesn't call the real X API.
    await page.request.delete(`/api/posts/${failing.id}`);

    // Delete the draft.
    await page.getByRole('tab', { name: 'Drafts' }).click();
    await expect(page.getByText(`Draft beta ${RUN}`)).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(`Draft beta ${RUN}`)).toHaveCount(0);
    void channelId;
  });
});

test.describe('calendar', () => {
  test('month/week toggle and day popover', async ({ page }) => {
    await registerViaApi(page, 'calendar');
    await page.goto('/calendar');

    await page.getByRole('button', { name: 'week', exact: true }).click();
    await expect(page.locator('button[aria-label*="posts on"]')).toHaveCount(7);

    await page.getByRole('button', { name: 'month', exact: true }).click();
    expect(await page.locator('button[aria-label*="posts on"]').count()).toBeGreaterThanOrEqual(28);

    await page.locator('button[aria-label*="posts on"]').first().click();
    await expect(page.getByText('No posts on this day')).toBeVisible();
  });
});

test.describe('library', () => {
  test('upload generated PNG → lists → delete', async ({ page }) => {
    await registerViaApi(page, 'library');
    await page.goto('/library');

    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#ffffff';
      ctx.font = '28px sans-serif';
      ctx.fillText('P', 24, 42);
      return c.toDataURL('image/png');
    });
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
    const name = `e2e-${RUN}.png`;

    await page.getByLabel('Upload media files').setInputFiles({ name, mimeType: 'image/png', buffer });
    await expect(page.getByRole('status').filter({ hasText: `Uploaded ${name}` })).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    await page.getByLabel(`Delete ${name}`).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Your library is empty')).toBeVisible();
  });
});

test.describe('automation', () => {
  test('RSS feed row appears + signature saves', async ({ page }) => {
    await registerViaApi(page, 'automation');
    await addChannel(page);
    await page.goto('/automation');

    const feedUrl = 'https://httpbin.org/feed.xml'; // public DNS must resolve (example.com is sinkholed on some rigs)
    await page.getByLabel('Feed URL').fill(feedUrl);
    await page.getByRole('group', { name: 'Feed target channels' }).getByRole('button').first().click();
    await page.getByRole('button', { name: 'Add feed' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'RSS feed added' })).toBeVisible();
    await expect(page.getByText(feedUrl)).toBeVisible();

    await page.getByText('Append signature to posts').click();
    await page.getByLabel('Post signature').fill('— E2E signature');
    await page.getByRole('button', { name: 'Save automation settings' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Automation settings saved' })).toBeVisible();
  });
});

test.describe('settings', () => {
  test('name change persists; API key created, token displayed, revoked', async ({ page }) => {
    await registerViaApi(page, 'settings');
    await page.goto('/settings');

    const newName = `Renamed ${RUN}`;
    const profileForm = page.locator('form').filter({ hasText: 'Profile' });
    await profileForm.locator('input').first().fill(newName);
    await profileForm.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    await page.reload();
    await expect(page.locator('form').filter({ hasText: 'Profile' }).locator('input').first()).toHaveValue(newName);

    await page.getByPlaceholder('Key name (e.g. content-agent)').fill('e2e-key');
    await page.getByRole('button', { name: 'Create key' }).click();
    await expect(page.getByText(/pv_[a-f0-9]{48}/)).toBeVisible();
    await expect(page.getByText('e2e-key')).toBeVisible();

    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText('e2e-key')).toHaveCount(0);
  });
});

test.describe('billing', () => {
  test('plan card renders on /settings/billing', async ({ page }) => {
    await registerViaApi(page, 'billing');
    await page.goto('/settings/billing');
    // The plan-comparison cards carry a 'Current plan' chip too — assert on the first match.
    await expect(page.getByText('Current plan').first()).toBeVisible();
    await expect(page.getByText('Free', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Pro — \$9\/mo/ })).toBeVisible();
  });
});

test.describe('agent v1 API', () => {
  test('API key → POST /api/v1/posts → GET → DELETE', async ({ page }) => {
    await registerViaApi(page, 'agent');
    const channelId = await addChannel(page);

    const keyRes = await page.request.post('/api/settings/keys', { data: { name: 'agent-e2e' } });
    expect(keyRes.ok()).toBeTruthy();
    const { key } = (await keyRes.json()) as { key: { token: string } };
    const headers = { authorization: `Bearer ${key.token}` };

    const content = `Agent post ${RUN}`;
    const created = await page.request.post('/api/v1/posts', {
      headers,
      data: { content, scheduled_at: pastIso(), channelIds: [channelId], tags: ['agent'] },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { post } = (await created.json()) as { post: { id: string } };

    const got = await page.request.get(`/api/v1/posts/${post.id}`, { headers });
    expect(got.ok()).toBeTruthy();
    expect(await got.text()).toContain(content);

    const deleted = await page.request.delete(`/api/v1/posts/${post.id}`, { headers });
    expect(deleted.ok()).toBeTruthy();

    const gone = await page.request.get(`/api/v1/posts/${post.id}`, { headers });
    expect(gone.status()).toBe(404);

    const noAuth = await page.request.get('/api/v1/posts');
    expect(noAuth.status()).toBe(401);
  });
});
