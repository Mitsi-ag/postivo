import http from 'node:http';
import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { dbQuery, nextIp, RUN, waitForDb } from './helpers';

// Hardening regression tests for the adversarial-audit fixes (SSRF egress,
// error-body stripping, credential encryption, rate limits, GDPR, plan
// enforcement, health shape). API-level, no UI.

let ctxCount = 0;
async function newUserCtx(tag: string, plan?: 'pro'): Promise<APIRequestContext> {
  ctxCount += 1;
  const ctx = await request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': nextIp() },
  });
  const email = `hard-${tag}-${RUN}@postivo.dev`;
  const res = await ctx.post('/api/auth/register', {
    data: { name: tag, email, password: 'hard-pass-1234' },
  });
  expect(res.ok(), `register ${tag}: ${await res.text()}`).toBeTruthy();
  if (plan === 'pro') {
    await dbQuery('UPDATE users SET plan = $1 WHERE email = $2', ['pro', email]);
  }
  return ctx;
}

async function addChannel(
  ctx: APIRequestContext,
  provider: string,
  name: string,
  credentials: Record<string, string>,
): Promise<string> {
  const res = await ctx.post('/api/channels', { data: { provider, name, credentials } });
  expect(res.ok(), `addChannel ${provider}: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { channel: { id: string } }).channel.id;
}

test('provider SSRF: discord/slack/wordpress/mastodon blocked; error bodies stripped', async () => {
  test.setTimeout(300_000);
  // Local rig: /redirect 302s to the cloud metadata endpoint, /teapot answers
  // 418 with a secret marker body that must never reach the user.
  const SECRET = `INTERNAL-SECRET-${RUN}`;
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/redirect')) {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
      res.end();
    } else {
      res.writeHead(418, { 'content-type': 'text/plain' });
      res.end(SECRET);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const ctx = await newUserCtx('ssrf-prov', 'pro');
    const targets: { name: string; provider: string; creds: Record<string, string>; expect: RegExp }[] = [
      { name: 'd1', provider: 'discord', creds: { webhookUrl: 'http://127.0.0.1:9/hook' }, expect: /private|loopback/i },
      { name: 's1', provider: 'slack', creds: { webhookUrl: 'http://2130706433/hook' }, expect: /private|loopback/i },
      {
        name: 'w1',
        provider: 'wordpress',
        creds: { siteUrl: 'http://[::ffff:7f00:1]/blog', username: 'u', applicationPassword: 'p' },
        expect: /private|loopback|resolve/i,
      },
      {
        name: 'm1',
        provider: 'mastodon',
        creds: { instanceUrl: `http://localhost:${port}/redirect`, accessToken: 'tok' },
        expect: /private|loopback/i,
      },
      { name: 'd2', provider: 'discord', creds: { webhookUrl: `http://localhost:${port}/teapot` }, expect: /HTTP 418/ },
    ];
    const channelIds: string[] = [];
    for (const t of targets) channelIds.push(await addChannel(ctx, t.provider, t.name, t.creds));

    const res = await ctx.post('/api/posts', {
      data: {
        content: `ssrf probe ${RUN}`,
        scheduled_at: new Date(Date.now() - 60_000).toISOString(),
        channelIds,
      },
    });
    expect(res.status(), `create post: ${await res.text()}`).toBe(201);
    const postId = ((await res.json()) as { post: { id: string } }).post.id;

    // Every target must fail (or be failing) with a guarded, body-free error.
    await waitForDb(async () => {
      const rows = await dbQuery<{ c: number }>(
        'SELECT COUNT(*)::int AS c FROM post_targets WHERE post_id = $1 AND error IS NOT NULL',
        [postId],
      );
      return rows[0].c === targets.length;
    }, 240_000);

    const errors = await dbQuery<{ channel_id: string; error: string }>(
      'SELECT channel_id, error FROM post_targets WHERE post_id = $1',
      [postId],
    );
    for (let i = 0; i < targets.length; i++) {
      const row = errors.find((e) => e.channel_id === channelIds[i]);
      expect(row, `target for ${targets[i].name}`).toBeTruthy();
      expect(row!.error, `${targets[i].name} error`).toMatch(targets[i].expect);
      expect(row!.error).not.toContain(SECRET);
      expect(row!.error).not.toContain('meta-data');
    }
    await ctx.dispose();
  } finally {
    server.close();
  }
});

test('credentials: encrypted at rest, export roundtrip, legacy plaintext readable', async () => {
  const ctx = await newUserCtx('creds');
  const token = `secret-token-${RUN}`;
  const channelId = await addChannel(ctx, 'x', 'Enc X', { bearerToken: token });

  const rows = await dbQuery<{ credentials: string }>(
    'SELECT credentials::text AS credentials FROM channels WHERE id = $1',
    [channelId],
  );
  expect(rows[0].credentials).toContain('v1:');
  expect(rows[0].credentials).not.toContain(token);

  // Export (owner-only) decrypts transparently — roundtrip.
  const exp = await ctx.get('/api/export');
  expect(await exp.text()).toContain(token);

  // A legacy plaintext row stays readable (lazy re-encrypt on next write).
  const legacyToken = `legacy-token-${RUN}`;
  const legacyId = crypto.randomUUID();
  const me = await ctx.get('/api/auth/me');
  const uid = ((await me.json()) as { user: { id: string } }).user.id;
  await dbQuery('INSERT INTO channels (id, user_id, provider, name, credentials) VALUES ($1,$2,$3,$4,$5)', [
    legacyId,
    uid,
    'x',
    'Legacy X',
    JSON.stringify({ bearerToken: legacyToken }),
  ]);
  const exp2 = await ctx.get('/api/export');
  expect(await exp2.text()).toContain(legacyToken);
  await ctx.dispose();
});

test('rate limits: AI caption 10/min per user; invalid Bearer tokens throttled', async () => {
  const ctx = await newUserCtx('caption', 'pro');
  let last = 0;
  for (let i = 1; i <= 11; i++) {
    const res = await ctx.post('/api/ai/caption', { data: { content: `caption ${i} ${RUN}` } });
    last = res.status();
    if (i <= 10) expect(res.status(), `caption ${i}`).toBe(200);
  }
  expect(last, '11th caption in a minute').toBe(429);
  await ctx.dispose();

  // Invalid (well-formed but unknown) Bearer token: 30/min by key-prefix.
  const badKey = `pv_${'deadbeef'.repeat(6)}`;
  const anon = await request.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } });
  let lastBad = 0;
  for (let i = 1; i <= 31; i++) {
    const res = await anon.get('/api/v1/posts', { headers: { authorization: `Bearer ${badKey}` } });
    lastBad = res.status();
    if (i <= 30) expect(res.status(), `bad bearer ${i}`).toBe(401);
  }
  expect(lastBad, '31st invalid bearer').toBe(429);
  await anon.dispose();
});

test('export completeness: rss feeds, sets, media, comments included', async () => {
  const ctx = await newUserCtx('export');
  const ch = await addChannel(ctx, 'demo', 'Export Demo', {});

  const rss = await ctx.post('/api/rss', {
    data: { url: 'http://localhost:9/feed.xml', channelIds: [ch], ai_caption: false },
  });
  expect(rss.status(), `rss: ${await rss.text()}`).toBe(201);
  const set = await ctx.post('/api/sets', { data: { name: 'Export Set', channelIds: [ch] } });
  expect(set.ok()).toBeTruthy();
  const up = await ctx.post('/api/upload', {
    multipart: { file: { name: 'e.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') } },
  });
  expect(up.status()).toBe(201);
  const mediaId = ((await up.json()) as { id: string }).id;
  const post = await ctx.post('/api/posts', {
    data: {
      content: `export post ${RUN}`,
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      channelIds: [ch],
      comments: [{ content: 'follow up', delayMin: 5 }],
    },
  });
  expect(post.status()).toBe(201);

  const res = await ctx.get('/api/export');
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as {
    rss_feeds: { url: string }[];
    sets: { name: string }[];
    media: { id: string }[];
    posts: { comments: { content: string }[]; targets: { comments: unknown[] }[] }[];
  };
  expect(data.rss_feeds.some((f) => f.url.includes('feed.xml'))).toBe(true);
  expect(data.sets.some((s) => s.name === 'Export Set')).toBe(true);
  expect(data.media.some((m) => m.id === mediaId)).toBe(true);
  expect(data.posts.some((p) => p.comments.some((c) => c.content === 'follow up'))).toBe(true);
  expect(data.posts.every((p) => p.targets.every((t) => Array.isArray(t.comments)))).toBe(true);
  await ctx.dispose();
});

test('RSS caps: ai_caption 402 on free; 4th feed on free plan → 402', async () => {
  const ctx = await newUserCtx('rsscaps');
  const ch = await addChannel(ctx, 'demo', 'Caps Demo', {});

  const ai = await ctx.post('/api/rss', {
    data: { url: 'http://localhost:9/ai.xml', channelIds: [ch], ai_caption: true },
  });
  expect(ai.status()).toBe(402);
  expect(((await ai.json()) as { upgrade?: boolean }).upgrade).toBe(true);

  for (let i = 1; i <= 3; i++) {
    const res = await ctx.post('/api/rss', {
      data: { url: `http://localhost:9/feed-${i}.xml`, channelIds: [ch] },
    });
    expect(res.status(), `feed ${i}`).toBe(201);
  }
  const fourth = await ctx.post('/api/rss', {
    data: { url: 'http://localhost:9/feed-4.xml', channelIds: [ch] },
  });
  expect(fourth.status()).toBe(402);
  await ctx.dispose();
});

test('account deletion: password re-auth, all rows gone, other users unaffected', async () => {
  const a = await newUserCtx('del-a');
  const b = await newUserCtx('del-b');
  const aCh = await addChannel(a, 'demo', 'A Demo', {});
  const bCh = await addChannel(b, 'demo', 'B Demo', {});
  await a.post('/api/posts', {
    data: { content: `del-a post ${RUN}`, scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), channelIds: [aCh] },
  });
  await b.post('/api/posts', {
    data: { content: `del-b post ${RUN}`, scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), channelIds: [bCh] },
  });
  await a.post('/api/settings/keys', { data: { name: 'a-key' } });
  const aMe = ((await (await a.get('/api/auth/me')).json()) as { user: { id: string } }).user;
  const bMe = ((await (await b.get('/api/auth/me')).json()) as { user: { id: string } }).user;

  const wrong = await a.delete('/api/settings/account', { data: { password: 'nope-nope-nope' } });
  expect(wrong.status()).toBe(403);
  const ok = await a.delete('/api/settings/account', { data: { password: 'hard-pass-1234' } });
  expect(ok.ok()).toBeTruthy();

  expect((await a.get('/api/auth/me')).status()).toBe(401);
  for (const table of ['users', 'channels', 'posts', 'media', 'rss_feeds', 'api_keys', 'sessions']) {
    const col = table === 'users' ? 'id' : 'user_id';
    const rows = await dbQuery<{ c: number }>(`SELECT COUNT(*)::int AS c FROM ${table} WHERE ${col} = $1`, [aMe.id]);
    expect(rows[0].c, `${table} rows for deleted user`).toBe(0);
  }
  const orphanTargets = await dbQuery<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM post_targets WHERE channel_id = $1',
    [aCh],
  );
  expect(orphanTargets[0].c).toBe(0);

  // Second user fully intact.
  expect((await b.get('/api/auth/me')).status()).toBe(200);
  const bPosts = await b.get('/api/posts');
  expect(await bPosts.text()).toContain(`del-b post ${RUN}`);
  const bRows = await dbQuery<{ c: number }>('SELECT COUNT(*)::int AS c FROM channels WHERE user_id = $1', [bMe.id]);
  expect(bRows[0].c).toBe(1);
  await a.dispose();
  await b.dispose();
});

test('plan enforcement at publish: downgraded user over channel limit fails target', async () => {
  test.setTimeout(240_000);
  const ctx = await newUserCtx('downgrade', 'pro');
  const ids: string[] = [];
  for (let i = 1; i <= 4; i++) ids.push(await addChannel(ctx, 'demo', `DG ${i}`, {}));
  // Downgrade pro → free (limit 3) with 4 channels connected.
  const me = ((await (await ctx.get('/api/auth/me')).json()) as { user: { id: string } }).user;
  await dbQuery("UPDATE users SET plan = 'free' WHERE id = $1", [me.id]);

  const res = await ctx.post('/api/posts', {
    data: {
      content: `downgrade post ${RUN}`,
      scheduled_at: new Date(Date.now() - 60_000).toISOString(),
      channelIds: [ids[0]],
    },
  });
  expect(res.status()).toBe(201);
  const postId = ((await res.json()) as { post: { id: string } }).post.id;

  await waitForDb(async () => {
    const rows = await dbQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM post_targets WHERE post_id = $1 AND status = 'failed' AND error LIKE 'plan_limit_exceeded%'`,
      [postId],
    );
    return rows[0].c === 1;
  }, 200_000);
  await ctx.dispose();
});

test('health endpoint exposes only {ok, db}', async () => {
  const ctx = await request.newContext();
  const res = await ctx.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(['db', 'ok']);
  expect(body.db).toBe(true);
  expect(res.headers()['x-powered-by']).toBeUndefined();
  await ctx.dispose();
});
