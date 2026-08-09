import crypto from 'node:crypto';
import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { dbQuery, nextIp, RUN, waitForDb } from './helpers';

// Chaos/scenario regression tests — each test guards a defect found by
// adversarial scenario testing (see README "Testing"). API-level, no UI.

let ctxCount = 0;
async function newUserCtx(tag: string): Promise<APIRequestContext> {
  ctxCount += 1;
  const ctx = await request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': nextIp() },
  });
  const res = await ctx.post('/api/auth/register', {
    data: { name: tag, email: `scn-${tag}-${RUN}@postivo.dev`, password: 'scn-pass-1234' },
  });
  expect(res.ok(), `register ${tag}: ${await res.text()}`).toBeTruthy();
  return ctx;
}

async function addDemoChannel(ctx: APIRequestContext, name = 'Scn Demo'): Promise<string> {
  const res = await ctx.post('/api/channels', { data: { provider: 'demo', name, credentials: {} } });
  expect(res.ok(), `addDemoChannel: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { channel: { id: string } }).channel.id;
}

const futureIso = (days = 2) => new Date(Date.now() + days * 86_400_000).toISOString();
const pastIso = (min = 3) => new Date(Date.now() - min * 60_000).toISOString();

test('fuzz: NUL bytes in content/tags/comments are sanitized, never 500', async () => {
  const ctx = await newUserCtx('nul');
  const ch = await addDemoChannel(ctx);

  const res = await ctx.post('/api/posts', {
    data: {
      content: 'before\0after',
      scheduled_at: futureIso(),
      channelIds: [ch],
      tags: ['ta\0g', 'ok'],
      comments: [{ content: 'follow\0up', delayMin: 5 }],
    },
  });
  expect(res.status(), `nul-byte post: ${res.status()} ${await res.text()}`).toBe(201);
  const { post } = (await res.json()) as {
    post: { content: string; tags: string[]; comments: { content: string }[] };
  };
  expect(post.content).toBe('beforeafter');
  expect(post.tags).toContain('tag');
  expect(post.comments[0].content).toBe('followup');
  await ctx.dispose();
});

test('media ownership: another user\'s media id is dropped from post.media', async () => {
  const a = await newUserCtx('med-a');
  const b = await newUserCtx('med-b');
  const ch = await addDemoChannel(a);

  const up = await b.post('/api/upload', {
    multipart: { file: { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') } },
  });
  const bMedia = ((await up.json()) as { id: string }).id;

  const res = await a.post('/api/posts', {
    data: { content: 'cross-media', scheduled_at: futureIso(), channelIds: [ch], media: [bMedia, 'bogus-id.png'] },
  });
  expect(res.status()).toBe(201);
  const { post } = (await res.json()) as { post: { media: string[] } };
  expect(post.media).toEqual([]);
  await a.dispose();
  await b.dispose();
});

test('svg uploads are served with a CSP sandbox (no script execution)', async () => {
  const ctx = await newUserCtx('svg');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const up = await ctx.post('/api/upload', {
    multipart: { file: { name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) } },
  });
  expect(up.status()).toBe(201);
  const { id } = (await up.json()) as { id: string };
  const res = await ctx.get(`/api/media/${id}`);
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['content-security-policy']).toBe('sandbox');
  await ctx.dispose();
});

test('billing: checkout for an already-pro user → 409; stripe api failure → 502/503, never 500', async () => {
  const pro = await newUserCtx('pro');
  const me = await pro.get('/api/auth/me');
  const proId = ((await me.json()) as { user: { id: string } }).user.id;
  await dbQuery(`UPDATE users SET plan = 'pro' WHERE id = $1`, [proId]);

  const res = await pro.post('/api/billing/checkout', { data: {} });
  expect([409, 503], `pro checkout: ${res.status()}`).toContain(res.status()); // 503 when billing not configured

  const free = await newUserCtx('free');
  const res2 = await free.post('/api/billing/checkout', { data: {} });
  // billing configured with test keys → Stripe rejects → 502; unconfigured → 503. Never 500.
  expect([502, 503], `free checkout: ${res2.status()}`).toContain(res2.status());
  await pro.dispose();
  await free.dispose();
});

test('best-time: slots land in the user timezone; garbage timezone rejected', async () => {
  const ctx = await newUserCtx('tz');
  const ch = await addDemoChannel(ctx);

  const prof = await ctx.post('/api/settings/profile', { data: { timezone: 'Australia/Sydney' } });
  expect(prof.ok()).toBeTruthy();
  const res = await ctx.get(`/api/best-time?channelIds=${ch}`);
  expect(res.ok()).toBeTruthy();
  const { slots } = (await res.json()) as { slots: string[] };
  expect(slots.length).toBe(3);
  for (const s of slots) {
    const sydneyHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', hour: '2-digit', hour12: false }).format(new Date(s)),
    );
    expect([9, 10, 11], `slot ${s} → Sydney hour ${sydneyHour}`).toContain(sydneyHour);
  }

  const bad = await ctx.post('/api/settings/profile', { data: { timezone: 'Mars/Olympus_Mons' } });
  expect(bad.status()).toBe(400);

  // Even a garbage value already stored in the DB must not 500 the endpoint.
  const me = await ctx.get('/api/auth/me');
  const uid = ((await me.json()) as { user: { id: string } }).user.id;
  await dbQuery(`UPDATE users SET timezone = 'Mars/Olympus_Mons' WHERE id = $1`, [uid]);
  const res2 = await ctx.get(`/api/best-time?channelIds=${ch}`);
  expect(res2.status()).toBe(200);
  await dbQuery(`UPDATE users SET timezone = 'UTC' WHERE id = $1`, [uid]);
  await ctx.dispose();
});

test('threads: follow-up comments publish strictly in order', async () => {
  test.setTimeout(240_000);
  const ctx = await newUserCtx('thread');
  const ch = await addDemoChannel(ctx);

  const res = await ctx.post('/api/posts', {
    data: {
      content: `thread order ${RUN}`,
      scheduled_at: pastIso(),
      channelIds: [ch],
      comments: [
        { content: 'first', delayMin: 0 },
        { content: 'second', delayMin: 0 },
      ],
    },
  });
  expect(res.status()).toBe(201);
  const postId = ((await res.json()) as { post: { id: string } }).post.id;

  await waitForDb(async () => {
    const rows = await dbQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM post_targets_comments cc
       JOIN post_targets t ON t.id = cc.target_id WHERE t.post_id = $1 AND cc.status = 'published'`,
      [postId],
    );
    return rows[0].c === 2;
  }, 200_000);

  const order = await dbQuery<{ message: string }>(
    `SELECT l.message FROM publish_log l JOIN post_targets t ON t.id = l.target_id
     WHERE t.post_id = $1 AND l.message LIKE 'Published comment%' ORDER BY l.at ASC`,
    [postId],
  );
  expect(order.map((r) => r.message)).toEqual([
    'Published comment #1 to Scn Demo (demo)',
    'Published comment #2 to Scn Demo (demo)',
  ]);
  await ctx.dispose();
});

test('threads: permanently failed follow-up cascades — later comments skipped, never leapfrog', async () => {
  test.setTimeout(300_000);
  // Flaky webhook: request #1 (main post) succeeds, #2..#4 fail (comment #1's
  // three attempts), #5+ would succeed — comment #2 must never reach it.
  const http = await import('node:http');
  let reqCount = 0;
  const server = http.createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      reqCount += 1;
      if (reqCount >= 2 && reqCount <= 4) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('flaky failure');
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const ctx = await newUserCtx('cascade');
    const chRes = await ctx.post('/api/channels', {
      data: { provider: 'webhook', name: 'Cascade Hook', credentials: { url: `http://localhost:${port}/hook` } },
    });
    expect(chRes.ok(), `webhook channel: ${await chRes.text()}`).toBeTruthy();
    const ch = ((await chRes.json()) as { channel: { id: string } }).channel.id;

    const res = await ctx.post('/api/posts', {
      data: {
        content: `thread cascade ${RUN}`,
        scheduled_at: pastIso(),
        channelIds: [ch],
        comments: [
          { content: 'first', delayMin: 0 },
          { content: 'second', delayMin: 0 },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const postId = ((await res.json()) as { post: { id: string } }).post.id;

    // Wait until comment #1 is claimed at least once (its first attempt fails).
    await waitForDb(async () => {
      const rows = await dbQuery<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM post_targets_comments cc JOIN post_targets t ON t.id = cc.target_id
         WHERE t.post_id = $1 AND cc.idx = 0 AND cc.retry_count >= 1`,
        [postId],
      );
      return rows[0].c === 1;
    }, 120_000);

    // Accelerate the retry backoff so attempts 2 and 3 happen on the next ticks.
    const deadline = Date.now() + 240_000;
    for (;;) {
      const rows = await dbQuery<{ status: string; retry_count: number }>(
        `SELECT cc.status, cc.retry_count FROM post_targets_comments cc JOIN post_targets t ON t.id = cc.target_id
         WHERE t.post_id = $1 AND cc.idx = 0`,
        [postId],
      );
      if (rows[0]?.status === 'failed') break;
      if (Date.now() > deadline) throw new Error('comment #1 never failed permanently');
      await dbQuery(
        `UPDATE post_targets_comments cc SET next_retry_at = now()
         FROM post_targets t WHERE t.id = cc.target_id AND t.post_id = $1 AND cc.idx = 0 AND cc.status = 'pending'`,
        [postId],
      );
      await new Promise((r) => setTimeout(r, 5_000));
    }

    // The cascade must have skipped comment #2 without ever publishing it.
    const rows = await dbQuery<{ idx: number; status: string; error: string | null; published_at: string | null }>(
      `SELECT cc.idx, cc.status, cc.error, cc.published_at FROM post_targets_comments cc
       JOIN post_targets t ON t.id = cc.target_id WHERE t.post_id = $1 ORDER BY cc.idx`,
      [postId],
    );
    expect(rows[0].status).toBe('failed');
    expect(rows[1].status).toBe('failed');
    expect(rows[1].error).toContain('skipped: earlier comment in thread failed');
    expect(rows[1].published_at).toBeNull(); // never leapfrogged the failed one
    expect(reqCount).toBe(4); // 1 main + 3 failed attempts — comment #2 never fired
    await ctx.dispose();
  } finally {
    server.close();
  }
});

test('quota: 31st scheduled post on free plan → 402 upgrade', async () => {
  test.setTimeout(120_000);
  const ctx = await newUserCtx('quota');
  const ch = await addDemoChannel(ctx);
  for (let i = 1; i <= 30; i++) {
    const res = await ctx.post('/api/posts', {
      data: { content: `quota ${i}`, scheduled_at: futureIso(3), channelIds: [ch] },
    });
    expect(res.status(), `post ${i}`).toBe(201);
  }
  const res31 = await ctx.post('/api/posts', {
    data: { content: 'quota 31', scheduled_at: futureIso(3), channelIds: [ch] },
  });
  expect(res31.status()).toBe(402);
  const body = (await res31.json()) as { upgrade?: boolean };
  expect(body.upgrade).toBe(true);
  await ctx.dispose();
});

test('session: expired or tampered cookie → 401; valid signed cookie → 200', async () => {
  const secret = process.env.JWT_SECRET;
  test.skip(!secret, 'JWT_SECRET must be set in the test environment to craft cookies');
  const ctx = await newUserCtx('sess');
  const me = await ctx.get('/api/auth/me');
  const uid = ((await me.json()) as { user: { id: string } }).user.id;

  const craft = (exp: number, jti: string): string => {
    const body = Buffer.from(JSON.stringify({ uid, jti, exp })).toString('base64url');
    const sig = crypto.createHmac('sha256', secret!).update(body).digest('base64url');
    return `${body}.${sig}`;
  };
  // A valid token needs a live server-side session row backing its jti.
  const jti = crypto.randomUUID();
  await dbQuery("INSERT INTO sessions (jti, user_id, expires_at) VALUES ($1,$2, now() + interval '1 day')", [jti, uid]);
  const expired = craft(Date.now() - 1000, crypto.randomUUID());
  const noRow = craft(Date.now() + 86_400_000, crypto.randomUUID()); // valid HMAC, no session row
  const valid = craft(Date.now() + 86_400_000, jti);
  const tampered = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`;

  for (const [name, token, expected] of [
    ['expired', expired, 401],
    ['tampered', tampered, 401],
    ['no-session-row', noRow, 401],
    ['valid', valid, 200],
  ] as const) {
    for (const path of ['/api/auth/me', '/api/posts', '/api/rss', '/api/sets', '/api/media-list']) {
      const res = await ctx.get(path, { headers: { cookie: `postivo_session=${token}` } });
      expect(res.status(), `${name} cookie on ${path}`).toBe(expected);
    }
  }
  await ctx.dispose();
});

test('recurring: unscheduling a repeating post clears the repeat', async () => {
  const ctx = await newUserCtx('recur');
  const ch = await addDemoChannel(ctx);
  const res = await ctx.post('/api/posts', {
    data: { content: 'recurring cancel', scheduled_at: futureIso(), channelIds: [ch], repeat_every_days: 1 },
  });
  expect(res.status()).toBe(201);
  const postId = ((await res.json()) as { post: { id: string } }).post.id;

  const patch = await ctx.patch(`/api/posts/${postId}`, { data: { scheduled_at: null } });
  expect(patch.ok()).toBeTruthy();
  const { post } = (await patch.json()) as { post: { status: string; repeat_every_days: number | null } };
  expect(post.status).toBe('draft');
  expect(post.repeat_every_days).toBeNull();
  await ctx.dispose();
});
