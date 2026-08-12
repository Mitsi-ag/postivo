import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { dbQuery, nextIp, RUN } from './helpers';

// Regression tests for the fault-fix pass (quota bypass, duplicate-publish
// retry, zero-target schedules, signed provider media URLs, channel-delete
// cleanup, register race, erasure completeness). API-level, no UI.

async function newUserCtx(tag: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': nextIp() },
  });
  const res = await ctx.post('/api/auth/register', {
    data: { name: tag, email: `reg-${tag}-${RUN}@postivo.dev`, password: 'reg-pass-1234' },
  });
  expect(res.ok(), `register ${tag}: ${await res.text()}`).toBeTruthy();
  return ctx;
}

async function addDemoChannel(ctx: APIRequestContext, name = 'Reg Demo'): Promise<string> {
  const res = await ctx.post('/api/channels', { data: { provider: 'demo', name, credentials: {} } });
  expect(res.ok(), `addDemoChannel: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { channel: { id: string } }).channel.id;
}

const futureIso = (days = 2) => new Date(Date.now() + days * 86_400_000).toISOString();

test('quota: draft → schedule via update enforces the monthly limit', async () => {
  const ctx = await newUserCtx('quota');
  const ch = await addDemoChannel(ctx);

  // Free plan: 30 scheduled/month. Create 30 drafts, then schedule them all
  // via PATCH — the 31st month-counted post must be rejected whichever route
  // it takes.
  const drafts: string[] = [];
  for (let i = 0; i < 31; i++) {
    const res = await ctx.post('/api/posts', { data: { content: `draft ${i}` } });
    expect(res.status()).toBe(201);
    drafts.push(((await res.json()) as { post: { id: string } }).post.id);
  }
  let rejected = 0;
  for (const id of drafts) {
    const res = await ctx.patch(`/api/posts/${id}`, {
      data: { scheduled_at: futureIso(), channelIds: [ch] },
    });
    if (res.status() === 402) rejected += 1;
  }
  expect(rejected, 'at least one draft→schedule must hit the 402 quota').toBeGreaterThanOrEqual(1);
  await ctx.dispose();
});

test('retry: a published target cannot be reset to pending (duplicate-publish guard)', async () => {
  const ctx = await newUserCtx('retry');
  const ch = await addDemoChannel(ctx);
  const res = await ctx.post('/api/posts', {
    data: { content: 'published retry guard', scheduled_at: futureIso(), channelIds: [ch] },
  });
  const post = ((await res.json()) as { post: { id: string; targets: { id: string }[] } }).post;
  const targetId = post.targets[0].id;

  // Simulate a successfully published target, then try to retry it.
  await dbQuery(`UPDATE post_targets SET status = 'published', published_at = now() WHERE id = $1`, [targetId]);
  const retry = await ctx.post(`/api/targets/${targetId}/retry`);
  expect(retry.status()).toBe(409);
  const after = await dbQuery<{ status: string }>(`SELECT status FROM post_targets WHERE id = $1`, [targetId]);
  expect(after[0].status).toBe('published');
  await ctx.dispose();
});

test('retry: a failed target can be retried', async () => {
  const ctx = await newUserCtx('retry-ok');
  const ch = await addDemoChannel(ctx);
  const res = await ctx.post('/api/posts', {
    data: { content: 'failed retry allowed', scheduled_at: futureIso(), channelIds: [ch] },
  });
  const post = ((await res.json()) as { post: { id: string; targets: { id: string }[] } }).post;
  const targetId = post.targets[0].id;

  await dbQuery(`UPDATE post_targets SET status = 'failed', error = 'x', retry_count = 3 WHERE id = $1`, [targetId]);
  const retry = await ctx.post(`/api/targets/${targetId}/retry`);
  expect(retry.ok(), `retry failed target: ${await retry.text()}`).toBeTruthy();
  const after = await dbQuery<{ status: string }>(`SELECT status FROM post_targets WHERE id = $1`, [targetId]);
  expect(after[0].status).toBe('pending');
  await ctx.dispose();
});

test('zero-target: a draft cannot be scheduled with all channels deselected', async () => {
  const ctx = await newUserCtx('zerot');
  const ch = await addDemoChannel(ctx);
  const res = await ctx.post('/api/posts', {
    data: { content: 'zero target guard', scheduled_at: futureIso(), channelIds: [ch] },
  });
  const post = ((await res.json()) as { post: { id: string } }).post;

  // Unschedule to draft, then try to re-schedule while dropping the channel.
  await ctx.patch(`/api/posts/${post.id}`, { data: { scheduled_at: null } });
  const bad = await ctx.patch(`/api/posts/${post.id}`, {
    data: { scheduled_at: futureIso(), channelIds: [] },
  });
  expect(bad.status()).toBe(400);
  const body = (await bad.json()) as { error: string };
  expect(body.error).toMatch(/channel/i);
  await ctx.dispose();
});

test('media: signed URL serves media without a session; bogus signature is rejected', async () => {
  const ctx = await newUserCtx('signed');
  const up = await ctx.post('/api/upload', {
    multipart: { file: { name: 's.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') } },
  });
  expect(up.status(), `upload: ${await up.text()}`).toBe(201);
  const { id } = (await up.json()) as { id: string };

  // Sign exactly like the server does. The server may get JWT_SECRET from
  // .env (Next auto-loads it; the Playwright process does not) — mirror that
  // so both sides derive the same HMAC key.
  if (!process.env.JWT_SECRET) {
    try {
      const envFile = (await import('node:fs')).readFileSync('.env', 'utf8');
      const m = envFile.match(/^JWT_SECRET=["']?([^"'\n]+)["']?/m);
      if (m) process.env.JWT_SECRET = m[1];
    } catch {
      // no .env — both sides fall back to the shared DATA_DIR secret file
    }
  }
  const { signedMediaUrl } = await import('../src/lib/mediaShare');
  const url = new URL(signedMediaUrl(id));

  // Unauthenticated request with the valid signature → 200.
  const anon = await request.newContext();
  const ok = await anon.get(`/api/media/${id}?${url.searchParams.toString()}`);
  expect(ok.status()).toBe(200);
  expect(ok.headers()['content-type']).toContain('image/png');

  // Tampered signature → 401.
  const bad = await anon.get(`/api/media/${id}?exp=${Date.now() + 60_000}&sig=AAAA`);
  expect(bad.status()).toBe(401);

  // No credentials at all → 401.
  const none = await anon.get(`/api/media/${id}`);
  expect(none.status()).toBe(401);

  // Owner session still works.
  const own = await ctx.get(`/api/media/${id}`);
  expect(own.status()).toBe(200);
  await anon.dispose();
  await ctx.dispose();
});

test('channel delete: stale ids are scrubbed from sets and rss feeds', async () => {
  const ctx = await newUserCtx('scrub');
  const ch = await addDemoChannel(ctx);
  const setRes = await ctx.post('/api/sets', { data: { name: 'my set', channelIds: [ch] } });
  expect(setRes.ok(), `create set: ${await setRes.text()}`).toBeTruthy();
  const rssRes = await ctx.post('/api/rss', {
    // localhost is whitelisted via SSRF_ALLOW_HOSTS in the test environment;
    // assertPublicUrl only resolves DNS at creation time, the path 404s later.
    data: { url: 'http://localhost:3220/feed.xml', channelIds: [ch], interval_min: 60 },
  });
  expect(rssRes.ok(), `create feed: ${await rssRes.text()}`).toBeTruthy();

  const del = await ctx.delete(`/api/channels/${ch}`);
  expect(del.ok()).toBeTruthy();

  const set = await dbQuery<{ channel_ids: string[] }>(`SELECT channel_ids FROM sets WHERE channel_ids::text LIKE '%' || $1 || '%'`, [ch]);
  expect(set.length).toBe(0);
  const feed = await dbQuery<{ channel_ids: string[] }>(`SELECT channel_ids FROM rss_feeds WHERE channel_ids::text LIKE '%' || $1 || '%'`, [ch]);
  expect(feed.length).toBe(0);
  await ctx.dispose();
});

test('channel PATCH: rename + credential update reactivates an errored channel', async () => {
  const ctx = await newUserCtx('chpatch');
  const ch = await addDemoChannel(ctx, 'Old Name');
  await dbQuery(`UPDATE channels SET status = 'error' WHERE id = $1`, [ch]);

  const res = await ctx.patch(`/api/channels/${ch}`, { data: { name: 'New Name' } });
  expect(res.ok(), `patch channel: ${await res.text()}`).toBeTruthy();
  const { channel } = (await res.json()) as { channel: { name: string; status: string } };
  expect(channel.name).toBe('New Name');

  // No credentials sent → status untouched; send one → reactivated.
  expect(channel.status).toBe('error');
  const res2 = await ctx.patch(`/api/channels/${ch}`, { data: { credentials: { note: 'x' } } });
  expect(res2.ok()).toBeTruthy();
  const after = await dbQuery<{ status: string }>(`SELECT status FROM channels WHERE id = $1`, [ch]);
  expect(after[0].status).toBe('active');
  await ctx.dispose();
});

test('register: duplicate email gets 409 (also via the unique-violation path)', async () => {
  const ctx = await newUserCtx('dup');
  const email = `reg-dup-${RUN}@postivo.dev`;
  // Re-register the exact same email through a fresh IP (rate-limit safe).
  const ctx2 = await request.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } });
  const res = await ctx2.post('/api/auth/register', {
    data: { name: 'dup2', email, password: 'reg-pass-1234' },
  });
  // First registration used `reg-dup-...` already? newUserCtx('dup') used the
  // same address pattern — assert the conflict response shape.
  expect(res.status()).toBe(409);
  const body = (await res.json()) as { error: string };
  expect(body.error).toBe('Could not create account');
  await ctx.dispose();
  await ctx2.dispose();
});

test('erasure: account deletion purges reset + verification tokens', async () => {
  const ctx = await newUserCtx('erase');
  const email = `reg-erase-${RUN}@postivo.dev`;
  // Seed a password-reset row and an email-verification row.
  const me = await ctx.get('/api/auth/me');
  const userId = ((await me.json()) as { user: { id: string } }).user.id;
  await dbQuery(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1, 'x', now() + interval '1 hour')`,
    [userId],
  );
  await dbQuery(
    `INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1, 'x', now() + interval '1 hour')`,
    [userId],
  );

  const del = await ctx.delete('/api/settings/account', { data: { password: 'reg-pass-1234' } });
  expect(del.ok(), `delete account: ${await del.text()}`).toBeTruthy();

  const resets = await dbQuery(`SELECT id FROM password_resets WHERE user_id = $1`, [userId]);
  const verifs = await dbQuery(`SELECT id FROM email_verifications WHERE user_id = $1`, [userId]);
  const users = await dbQuery(`SELECT id FROM users WHERE id = $1 OR email = $2`, [userId, email]);
  expect(resets.length).toBe(0);
  expect(verifs.length).toBe(0);
  expect(users.length).toBe(0);
  await ctx.dispose();
});

test('upload: cumulative storage quota returns 402 when the plan is full', async () => {
  const ctx = await newUserCtx('storage');
  const me = await ctx.get('/api/auth/me');
  const userId = ((await me.json()) as { user: { id: string } }).user.id;
  // Simulate a nearly-full free plan (250MB) with one synthetic row.
  await dbQuery(`INSERT INTO media (id, user_id, mime, name, size) VALUES ($1, $2, 'image/png', 'big.png', $3)`, [
    `00000000-0000-0000-0000-${String(Date.now()).slice(-12)}.png`,
    userId,
    250 * 1024 * 1024,
  ]);
  const up = await ctx.post('/api/upload', {
    multipart: { file: { name: 'tiny.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') } },
  });
  expect(up.status()).toBe(402);
  const body = (await up.json()) as { upgrade: boolean };
  expect(body.upgrade).toBe(true);
  await dbQuery(`DELETE FROM media WHERE user_id = $1 AND name = 'big.png'`, [userId]);
  await ctx.dispose();
});
