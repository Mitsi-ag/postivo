import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { dbQuery, nextIp, pastIso, RUN, waitForDb } from './helpers';

// Failure-mode tests for the media providers (instagram/tiktok/youtube):
// channels wired with dummy credentials must fail safely — the scheduler
// marks the target 'failed' with a sanitized error (generic guard message or
// "returned HTTP <code>"), never upstream HTML, never a crash, never the
// submitted credential. API-level, no UI.
//
// The scheduler ticks every 30s. A bad-token publish fails in seconds, so the
// first attempt lands within ~60s; we then bump retry_count in the DB so the
// next attempt is the permanent failure instead of waiting out the full
// 1m + 2m backoff ladder (same pattern as failPostInDb in helpers).

test.setTimeout(300_000);

async function newUserCtx(tag: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': nextIp() },
  });
  const res = await ctx.post('/api/auth/register', {
    data: { name: tag, email: `prov-${tag}-${RUN}@postivo.dev`, password: 'prov-pass-1234' },
  });
  expect(res.ok(), `register ${tag}: ${await res.text()}`).toBeTruthy();
  return ctx;
}

async function addChannel(ctx: APIRequestContext, provider: string, credentials: Record<string, string>): Promise<string> {
  const res = await ctx.post('/api/channels', { data: { provider, name: `E2E ${provider}`, credentials } });
  expect(res.ok(), `addChannel ${provider}: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { channel: { id: string } }).channel.id;
}

async function uploadMedia(ctx: APIRequestContext, name: string, mimeType: string, hex: string): Promise<string> {
  const up = await ctx.post('/api/upload', {
    multipart: { file: { name, mimeType, buffer: Buffer.from(hex, 'hex') } },
  });
  expect(up.status(), `upload ${name}: ${await up.text()}`).toBe(201);
  return ((await up.json()) as { id: string }).id;
}

const PNG = '89504e470d0a1a0a';
const MP4 = '00000018667479706d703432';

function assertSanitized(error: string | null, secret: string): void {
  expect(error, 'failed target must carry an error message').toBeTruthy();
  expect(error!.length, 'error must stay a short generic message').toBeLessThan(200);
  expect(error!, 'error must not contain upstream HTML').not.toMatch(/<[a-z!/]/i);
  expect(error!, 'error must not leak the submitted credential').not.toContain(secret);
}

interface TargetRow {
  status: string;
  error: string | null;
  retry_count: number;
}

async function expectSanitizedFailure(
  tag: string,
  provider: string,
  credentials: Record<string, string>,
  media: { name: string; mimeType: string; hex: string },
  secret: string,
): Promise<void> {
  const ctx = await newUserCtx(tag);
  const mediaId = await uploadMedia(ctx, media.name, media.mimeType, media.hex);
  const ch = await addChannel(ctx, provider, credentials);
  const res = await ctx.post('/api/posts', {
    data: {
      content: `e2e ${provider} failure-mode post`,
      media: [mediaId],
      scheduled_at: pastIso(2),
      channelIds: [ch],
    },
  });
  expect(res.ok(), `create post ${provider}: ${await res.text()}`).toBeTruthy();
  const post = ((await res.json()) as { post: { id: string; targets: { id: string }[] } }).post;
  const targetId = post.targets[0].id;

  const target = async () =>
    (await dbQuery<TargetRow>(`SELECT status, error, retry_count FROM post_targets WHERE id = $1`, [targetId]))[0];

  // Attempt 1: fails fast (bad token → HTTP 4xx) with a sanitized error.
  await waitForDb(async () => {
    const t = await target();
    return !!t && t.retry_count >= 1 && !!t.error;
  }, 90_000);
  assertSanitized((await target()).error, secret);

  // Skip the backoff ladder: make the next attempt the final one.
  await dbQuery(`UPDATE post_targets SET retry_count = 2 WHERE id = $1`, [targetId]);
  await waitForDb(async () => (await target()).status === 'failed', 120_000);
  const final = await target();
  expect(final.retry_count).toBe(3);
  assertSanitized(final.error, secret);
  await ctx.dispose();
}

test('instagram: dummy credentials fail safely with a sanitized error', async () => {
  await expectSanitizedFailure(
    'instagram',
    'instagram',
    { access_token: 'ig-dummy-token', ig_user_id: '1784000000000000' },
    { name: 'p.png', mimeType: 'image/png', hex: PNG },
    'ig-dummy-token',
  );
});

test('tiktok: dummy credentials fail safely with a sanitized error', async () => {
  await expectSanitizedFailure(
    'tiktok',
    'tiktok',
    { access_token: 'tt-dummy-token' },
    { name: 'v.mp4', mimeType: 'video/mp4', hex: MP4 },
    'tt-dummy-token',
  );
});

test('youtube: dummy credentials fail safely with a sanitized error', async () => {
  await expectSanitizedFailure(
    'youtube',
    'youtube',
    { access_token: 'yt-dummy-token' },
    { name: 'v.mp4', mimeType: 'video/mp4', hex: MP4 },
    'yt-dummy-token',
  );
});
