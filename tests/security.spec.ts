import crypto from 'node:crypto';
import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { nextIp, RUN } from './helpers';

// API-level security regression checks. UI-free: each "user" is an independent
// APIRequestContext with its own cookie jar and its own source IP (so the
// suite stays clear of the app's per-IP auth rate limits).

let ctxCount = 0;

async function newUserCtx(tag: string): Promise<APIRequestContext> {
  ctxCount += 1;
  const ctx = await request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': nextIp() },
  });
  const res = await ctx.post('/api/auth/register', {
    data: { name: tag, email: `sec-${tag}-${RUN}@postivo.dev`, password: 'sec-pass-1234' },
  });
  expect(res.ok(), `register ${tag}: ${await res.text()}`).toBeTruthy();
  return ctx;
}

function expectNoStackLeak(body: string): void {
  expect(body).not.toMatch(/node_modules/);
  expect(body).not.toMatch(/\.ts:\d+/);
  expect(body).not.toMatch(/\n\s+at\s+\S+\s+\(/);
}

// Extract the session cookie value from a login/register response.
function sessionCookieValue(res: { headersArray(): { name: string; value: string }[] }): string {
  const header = res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? '';
  return header.match(/postivo_session=([^;]*)/)?.[1] ?? '';
}

test('authz: user A cannot touch user B resources', async () => {
  const a = await newUserCtx('alice');
  const b = await newUserCtx('bob');

  // Bob's assets.
  const ch = await b.post('/api/channels', { data: { provider: 'demo', name: 'Bob Demo', credentials: {} } });
  const bChannel = ((await ch.json()) as { channel: { id: string } }).channel.id;
  const post = await b.post('/api/posts', {
    data: { content: `Bob post ${RUN}`, scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), channelIds: [bChannel] },
  });
  const bPost = (await post.json()) as { post: { id: string; targets: { id: string }[] } };
  const bTarget = bPost.post.targets[0].id;
  const up = await b.post('/api/upload', {
    multipart: { file: { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') } },
  });
  const bMedia = ((await up.json()) as { id: string }).id;
  const key = await b.post('/api/settings/keys', { data: { name: 'bob-key' } });
  const bKey = ((await key.json()) as { key: { id: string } }).key.id;

  // Alice tries every cross-user access → 404 (never 200/403-with-data).
  const attempts: [string, string, Record<string, unknown>?][] = [
    ['get', `/api/posts/${bPost.post.id}`],
    ['patch', `/api/posts/${bPost.post.id}`, { content: 'hijack' }],
    ['delete', `/api/posts/${bPost.post.id}`],
    ['delete', `/api/channels/${bChannel}`],
    ['get', `/api/media/${bMedia}`],
    ['delete', `/api/media/${bMedia}`],
    ['delete', `/api/settings/keys/${bKey}`],
    ['post', `/api/targets/${bTarget}/retry`],
  ];
  for (const [method, url, data] of attempts) {
    const res =
      method === 'get'
        ? await a.get(url)
        : method === 'delete'
          ? await a.delete(url)
          : method === 'patch'
            ? await a.patch(url, { data })
            : await a.post(url, { data: data ?? {} });
    expect(res.status(), `${method.toUpperCase()} ${url} must be 404`).toBe(404);
    expectNoStackLeak(await res.text());
  }

  // Listings must not leak Bob's ids either.
  for (const url of ['/api/posts', '/api/media-list', '/api/channels', '/api/settings/keys']) {
    const res = await a.get(url);
    const body = await res.text();
    expect(body).not.toContain(bPost.post.id);
    expect(body).not.toContain(bMedia);
    expect(body).not.toContain(bChannel);
    expect(body).not.toContain(bKey);
  }

  await a.dispose();
  await b.dispose();
});

test('api keys: revoked key → 401; hash/token never returned', async () => {
  const ctx = await newUserCtx('keys');

  const created = await ctx.post('/api/settings/keys', { data: { name: 'sec-key' } });
  const { key } = (await created.json()) as { key: { id: string; token: string } };
  const hash = crypto.createHash('sha256').update(key.token).digest('hex');
  const bearer = { authorization: `Bearer ${key.token}` };

  const ok = await ctx.get('/api/v1/posts', { headers: bearer });
  expect(ok.status()).toBe(200);

  // List + export must never contain the hash or the raw token.
  const list = await ctx.get('/api/settings/keys');
  const listBody = await list.text();
  expect(listBody).not.toContain(hash);
  expect(listBody).not.toContain(key.token);
  const exp = await ctx.get('/api/export');
  const expBody = await exp.text();
  expect(expBody).not.toContain(hash);
  expect(expBody).not.toContain(key.token);

  // Revoke → 401.
  const del = await ctx.delete(`/api/settings/keys/${key.id}`);
  expect(del.ok()).toBeTruthy();
  const revoked = await ctx.get('/api/v1/posts', { headers: bearer });
  expect(revoked.status()).toBe(401);

  await ctx.dispose();
});

test('uploads: non-media mime → 415, >50MB → 413, empty → 400', async () => {
  test.setTimeout(120_000);
  const ctx = await newUserCtx('upload');

  const text = await ctx.post('/api/upload', {
    multipart: { file: { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') } },
  });
  expect(text.status()).toBe(415);

  const big = await ctx.post('/api/upload', {
    multipart: { file: { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(50 * 1024 * 1024 + 1, 1) } },
  });
  expect(big.status()).toBe(413);

  const empty = await ctx.post('/api/upload', {
    multipart: { file: { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) } },
  });
  expect(empty.status()).toBe(400);

  await ctx.dispose();
});

test('media path traversal attempts are rejected', async () => {
  const ctx = await newUserCtx('traversal');
  for (const id of ['..%2F..%2Fetc%2Fpasswd.png', '..%2Fsecret.png', '%2e%2e%2f%2e%2e%2fjwt_secret.png', '....png']) {
    const res = await ctx.get(`/api/media/${id}`);
    expect([400, 404], `traversal ${id} → ${res.status()}`).toContain(res.status());
    const body = await res.text();
    expect(body).not.toContain('root:');
    expectNoStackLeak(body);
  }
  await ctx.dispose();
});

test('rate limiting: 11th login attempt in 5 min → 429', async () => {
  // RUN-derived source IP: in-memory limiter buckets survive across runs of the
  // suite (same server process), so this test needs a fresh bucket every time.
  const bucketIp = `203.0.113.${(parseInt(RUN.replace(/[^a-z0-9]/g, ''), 36) % 250) + 1}`;
  const ctx = await request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': bucketIp },
  });
  let lastStatus = 0;
  for (let i = 1; i <= 11; i++) {
    const res = await ctx.post('/api/auth/login', { data: { email: `nobody-${RUN}@postivo.dev`, password: 'wrong-pass-123' } });
    lastStatus = res.status();
    if (i <= 10) expect(res.status(), `attempt ${i}`).toBe(401);
  }
  expect(lastStatus, '11th attempt should be rate-limited').toBe(429);
  await ctx.dispose();
});

test('rate limiting: spoofed leftmost X-Forwarded-For does not bypass the bucket', async () => {
  // The limiter must key on the LAST XFF entry (proxy-appended client IP), so
  // prepending a fresh fake IP per request must not reset the bucket.
  const realIp = `203.0.113.${((parseInt(RUN.replace(/[^a-z0-9]/g, ''), 36) % 250) + 7) % 250 + 1}`;
  const ctx = await request.newContext();
  let lastStatus = 0;
  for (let i = 1; i <= 11; i++) {
    const res = await ctx.post('/api/auth/login', {
      headers: { 'x-forwarded-for': `10.99.99.${i}, ${realIp}` },
      data: { email: `spoof-${RUN}@postivo.dev`, password: 'wrong-pass-123' },
    });
    lastStatus = res.status();
    if (i <= 10) expect(res.status(), `attempt ${i}`).toBe(401);
  }
  expect(lastStatus, 'spoofed XFF must still hit the limit').toBe(429);
  await ctx.dispose();
});

test('sessions: password change kills stolen + other-device cookies, changer stays in', async () => {
  const ctx = await newUserCtx('sess-revoke');
  const me = await ctx.get('/api/auth/me');
  const { user } = (await me.json()) as { user: { id: string; email: string } };

  // Capture a raw cookie ("stolen") via a fresh login, plus a second device.
  const login1 = await ctx.post('/api/auth/login', {
    data: { email: user.email, password: 'sec-pass-1234' },
  });
  const stolen = sessionCookieValue(login1);
  expect(stolen).not.toBe('');
  const device2 = await request.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } });
  const login = await device2.post('/api/auth/login', {
    data: { email: user.email, password: 'sec-pass-1234' },
  });
  expect(login.ok()).toBeTruthy();

  // Change the password from device 1.
  const change = await ctx.post('/api/settings/password', {
    data: { current: 'sec-pass-1234', next: 'sec-pass-5678' },
  });
  expect(change.ok()).toBeTruthy();

  // Stolen cookie → dead. Other device → dead. Changer → still valid.
  const thief = await request.newContext();
  const replay = await thief.get('/api/auth/me', { headers: { cookie: `postivo_session=${stolen}` } });
  expect(replay.status()).toBe(401);
  expect((await device2.get('/api/auth/me')).status()).toBe(401);
  expect((await ctx.get('/api/auth/me')).status()).toBe(200);
  await thief.dispose();
  await device2.dispose();
  await ctx.dispose();
});

test('sessions: logout revokes the server-side session', async () => {
  const ctx = await newUserCtx('sess-logout');
  const me = await ctx.get('/api/auth/me');
  const { user } = (await me.json()) as { user: { email: string } };
  const login = await ctx.post('/api/auth/login', { data: { email: user.email, password: 'sec-pass-1234' } });
  const cookie = sessionCookieValue(login);
  expect(cookie).not.toBe('');
  const out = await ctx.post('/api/auth/logout');
  expect(out.ok()).toBeTruthy();
  // Replaying the pre-logout cookie must fail even though it would still be
  // a valid HMAC token — the session row is revoked.
  const replay = await ctx.get('/api/auth/me', { headers: { cookie: `postivo_session=${cookie}` } });
  expect(replay.status()).toBe(401);
  await ctx.dispose();
});

test('SQL injection probes on filter params → no 500s', async () => {
  const ctx = await newUserCtx('sqli');
  const probes = [
    `/api/posts?tag=${encodeURIComponent(`' OR '1'='1`)}`,
    `/api/posts?tag=${encodeURIComponent(`x"; DROP TABLE users;--`)}`,
    `/api/queue?tab=scheduled&tag=${encodeURIComponent(`' UNION SELECT password_hash FROM users--`)}`,
    `/api/queue?tab=${encodeURIComponent(`scheduled' OR '1'='1`)}`,
  ];
  for (const url of probes) {
    const res = await ctx.get(url);
    expect(res.status(), `${url} → ${res.status()}`).toBeLessThan(500);
    expectNoStackLeak(await res.text());
  }
  // Table still alive after the probes.
  const health = await ctx.get('/api/health');
  expect((await health.json() as { db: boolean }).db).toBe(true);
  await ctx.dispose();
});

test('security headers present on pages and API responses', async () => {
  const ctx = await request.newContext();
  for (const url of ['/', '/api/health', '/login']) {
    const res = await ctx.get(url);
    expect(res.headers()['x-frame-options']).toBe('DENY');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['referrer-policy']).toBeTruthy();
    expect(res.headers()['strict-transport-security']).toContain('max-age=63072000');
    expect(res.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers()['x-powered-by']).toBeUndefined();
  }
  await ctx.dispose();
});

test('session cookie flags: HttpOnly + SameSite; Secure behind https proxy', async () => {
  const ctx = await request.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } });
  const res = await ctx.post('/api/auth/register', {
    data: { name: 'cookie', email: `sec-cookie-${RUN}@postivo.dev`, password: 'sec-pass-1234' },
  });
  const cookie = (res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? '').toLowerCase();
  expect(cookie).toContain('httponly');
  expect(cookie).toContain('samesite=lax');
  expect(cookie).not.toContain('secure'); // plain http local dev — must NOT be set

  // Behind a TLS-terminating proxy (x-forwarded-proto: https) Secure is required.
  const ctx2 = await request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': nextIp(), 'x-forwarded-proto': 'https' },
  });
  const res2 = await ctx2.post('/api/auth/register', {
    data: { name: 'cookie2', email: `sec-cookie2-${RUN}@postivo.dev`, password: 'sec-pass-1234' },
  });
  const cookie2 = (res2.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? '').toLowerCase();
  expect(cookie2).toContain('secure');
  expect(cookie2).toContain('httponly');
  await ctx.dispose();
  await ctx2.dispose();
});

test('SSRF: private/loopback targets rejected everywhere', async () => {
  const ctx = await newUserCtx('ssrf');
  const ch = await ctx.post('/api/channels', { data: { provider: 'demo', name: 'SSRF Demo', credentials: {} } });
  const channelId = ((await ch.json()) as { channel: { id: string } }).channel.id;

  // RSS feed pointing at the cloud metadata endpoint.
  const rss = await ctx.post('/api/rss', {
    data: { url: 'http://169.254.169.254/latest/meta-data', channelIds: [channelId] },
  });
  expect(rss.status()).toBe(400);
  expect(await rss.text()).toContain('private');

  // Media import from a private address.
  const up = await ctx.post('/api/upload/url', { data: { url: 'http://169.254.169.254/pic.png' } });
  expect([400, 502]).toContain(up.status());
  expect(await up.text()).toContain('private');

  // Outbound webhook into RFC1918 space.
  const prof = await ctx.post('/api/settings/profile', { data: { outbound_webhook_url: 'http://10.9.9.9/hook' } });
  expect(prof.status()).toBe(400);
  expect(await prof.text()).toContain('private');

  await ctx.dispose();
});
