import crypto from 'node:crypto';
import { one, query, type Channel, type Post, type PostComment, type PostTarget, type RssFeed, type TargetComment, type User } from './db';
import { getProvider } from './providers/registry';
import { decryptChannelCredentials } from './crypto';
import { generateCaption } from './ai';
import { createPost } from './core';
import { channelsUsed, postsThisMonth, planOf } from './plans';
import { newItems, parseFeed } from './rss';
import { guardedFetch, readBodyCapped } from './ssrf';
import { signedMediaUrl } from './mediaShare';

const STARTED = Symbol.for('postivo.scheduler.started');
const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;
// Watchdog: a claimed ('publishing') target becomes claimable again after this
// long, so a crashed instance can never strand a post.
const CLAIM_TIMEOUT_MINUTES = 5;
// Hard cap on any single provider publish — a hung provider must not hold a
// claim hostage until the watchdog re-claims it (duplicate-publish window).
// 90s: Instagram's two-step container flow polls up to ~60s for Reels.
const PUBLISH_TIMEOUT_MS = 90_000;
// RSS bodies are capped so a hostile feed can't OOM the instance.
const RSS_MAX_BYTES = 5 * 1024 * 1024;

// Per-instance tick mutex: a slow tick (many due targets) must never stack
// with the next interval fire.
let tickRunning = false;

class PlanLimitError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  // race() subscribes to `promise`, so a late rejection after the timeout
  // wins is handled (ignored) rather than crashing the process.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function startScheduler(): void {
  const g = globalThis as unknown as Record<symbol, boolean>;
  if (g[STARTED]) return;
  g[STARTED] = true;
  console.log('[postivo] in-process scheduler started (30s interval)');
  const timer = setInterval(() => {
    if (tickRunning) return; // previous tick still working — skip this fire
    tickRunning = true;
    tick()
      .catch((err) => console.error('[postivo] scheduler tick failed:', err))
      .finally(() => {
        tickRunning = false;
      });
  }, 30_000);
  // Never keep a process (e.g. a build worker) alive because of the scheduler.
  if (typeof timer.unref === 'function') timer.unref();
  const boot = setTimeout(() => {
    tick().catch(() => {});
  }, 2_000);
  if (typeof boot.unref === 'function') boot.unref();
}

interface DueRow extends PostTarget {
  content: string;
  media: string[];
  comments: PostComment[];
  scheduled_at: string | null;
  signature: string;
  signature_enabled: boolean;
  outbound_webhook_url: string | null;
  user_id: string;
  plan: string;
}

async function log(targetId: string, level: string, message: string): Promise<void> {
  await query('INSERT INTO publish_log (target_id, level, message) VALUES ($1,$2,$3)', [targetId, level, message]);
}

// Fire-and-forget outbound webhook (5s timeout, errors swallowed).
function fireOutbound(url: string | null, payload: Record<string, unknown>): void {
  if (!url) return;
  guardedFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {});
}

// Atomically claim due targets. FOR UPDATE ... SKIP LOCKED makes this safe to
// run from any number of app instances racing on the same Postgres.
async function claimDue(): Promise<DueRow[]> {
  return query<DueRow>(
    `WITH claimed AS (
       UPDATE post_targets pt
       SET status = 'publishing',
           next_retry_at = now() + interval '${CLAIM_TIMEOUT_MINUTES} minutes'
       WHERE pt.id IN (
         SELECT pt2.id FROM post_targets pt2
         JOIN posts p ON p.id = pt2.post_id
         WHERE (
             (pt2.status = 'pending' AND (pt2.next_retry_at IS NULL OR pt2.next_retry_at <= now()))
             OR (pt2.status = 'publishing' AND pt2.next_retry_at <= now())
           )
           AND p.status = 'scheduled'
           AND p.scheduled_at IS NOT NULL
           AND p.scheduled_at <= now()
         ORDER BY pt2.next_retry_at ASC NULLS FIRST, p.scheduled_at ASC
         LIMIT ${BATCH_SIZE}
         FOR UPDATE OF pt2 SKIP LOCKED
       )
       RETURNING pt.*
     )
     SELECT c.*, p.content AS content, p.media AS media, p.comments AS comments, p.scheduled_at AS scheduled_at,
            u.signature AS signature, u.signature_enabled AS signature_enabled, u.outbound_webhook_url AS outbound_webhook_url,
            p.user_id AS user_id, u.plan AS plan
     FROM claimed c
     JOIN posts p ON p.id = c.post_id
     JOIN users u ON u.id = p.user_id`,
  );
}

// Process claimed targets with bounded concurrency: sequentially, 10 targets
// × 90s worst case would outlive the 5-minute claim lease and a replica could
// re-claim the tail — publishing duplicates. 4-way keeps the batch ≤ ~4 min.
const PUBLISH_CONCURRENCY = 4;

async function mapPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item).catch((err) => console.error('[postivo] worker error:', err));
    }
  });
  await Promise.all(workers);
}

async function tick(): Promise<void> {
  const due = await claimDue();
  await mapPool(due, PUBLISH_CONCURRENCY, processTarget);
  const comments = await claimDueComments();
  await mapPool(comments, PUBLISH_CONCURRENCY, processComment);
  await pollRssFeeds();
  await sweepOrphanedPosts();
}

// A scheduled post with zero targets can never publish (nothing claims it) —
// fail it once it's past due instead of letting it sit in 'scheduled' forever.
// Normally impossible to create (createPost/updatePost require a channel), but
// channel deletion can orphan an already-scheduled post.
async function sweepOrphanedPosts(): Promise<void> {
  const orphaned = await query<{ id: string }>(
    `UPDATE posts SET status = 'failed', updated_at = now()
     WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now()
       AND NOT EXISTS (SELECT 1 FROM post_targets t WHERE t.post_id = posts.id)
     RETURNING id`,
  );
  for (const p of orphaned) {
    console.log(`[postivo] post ${p.id} failed: scheduled past due with no targets`);
  }
}

// Append the user's signature when it fits the provider's limit.
function withSignature(content: string, maxLength: number, signature: string, enabled: boolean): string {
  if (!enabled || !signature.trim()) return content;
  const combined = `${content}\n\n${signature.trim()}`;
  return combined.length <= maxLength ? combined : content;
}

async function scheduleComments(row: DueRow, comments: PostComment[]): Promise<void> {
  if (!Array.isArray(comments) || comments.length === 0) return;
  let at = Date.now();
  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    at += Math.max(0, Math.floor(Number(c.delayMin) || 0)) * 60_000;
    await query(
      `INSERT INTO post_targets_comments (id, target_id, idx, content, publish_at, status) VALUES ($1,$2,$3,$4,$5,'pending')`,
      [crypto.randomUUID(), row.id, i, c.content, new Date(at).toISOString()],
    );
  }
  await log(row.id, 'info', `Scheduled ${comments.length} follow-up comment(s)`);
}

async function processTarget(row: DueRow): Promise<void> {
  const channel = await one<Channel>('SELECT * FROM channels WHERE id = $1', [row.channel_id]);
  const mediaIds = Array.isArray(row.media) ? row.media : [];
  // Providers fetch media over the public internet — hand them absolute,
  // HMAC-signed, expiring URLs (a session-cookie path would always 401).
  const mediaUrls = mediaIds.map((id) => signedMediaUrl(id));

  try {
    if (!channel) throw new Error('Channel no longer exists');
    const provider = getProvider(channel.provider);
    if (!provider) throw new Error(`Unknown provider "${channel.provider}"`);
    if (channel.status !== 'active') throw new Error(`Channel "${channel.name}" is not active (${channel.status})`);
    // Enforce plan limits at publish time: a downgraded user who is over the
    // channel limit fails fast (retryable via the UI after upgrading).
    const plan = planOf({ plan: row.plan });
    const used = await channelsUsed(row.user_id);
    if (used > plan.channels) {
      throw new PlanLimitError(
        `plan_limit_exceeded: your plan allows ${plan.channels} channel${plan.channels === 1 ? '' : 's'} but ${used} are connected — upgrade to publish`,
      );
    }
    const content = withSignature(row.content_override ?? row.content, provider.maxLength, row.signature, row.signature_enabled);
    const creds = decryptChannelCredentials(channel);
    let result;
    try {
      // ONLY the external publish lives in this try — a provider error here
      // means the post (probably) didn't go out and is safe to retry.
      result = await withTimeout(
        provider.publish(channel, creds, content, mediaUrls, {
          postId: row.post_id,
          scheduledAt: row.scheduled_at,
        }),
        PUBLISH_TIMEOUT_MS,
        `Publishing to ${provider.id} timed out`,
      );
    } catch (err) {
      throw err; // handled by the outer catch: retry ladder / permanent fail
    }
    // Bookkeeping AFTER a successful publish must never bounce the target
    // back to pending — that would re-publish content that already went out.
    // A failure here is logged loudly but the publish stands.
    try {
      await query(
        `UPDATE post_targets SET status = 'published', published_at = now(), error = NULL, external_url = $1, external_id = $2 WHERE id = $3`,
        [result.externalUrl ?? null, result.externalId ?? null, row.id],
      );
      await log(row.id, 'info', `Published to ${channel.name} (${provider.id})`);
      await scheduleComments(row, row.comments);
      fireOutbound(row.outbound_webhook_url, {
        event: 'post.published',
        post_id: row.post_id,
        channel: provider.id,
        external_url: result.externalUrl ?? null,
      });
    } catch (bookkeepingErr) {
      console.error(`[postivo] CRITICAL: published target ${row.id} but bookkeeping failed (target may be stuck 'publishing' until the watchdog):`, bookkeepingErr);
    }
    await refreshPostStatus(row.post_id);
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Plan-limit failures skip the retry ladder: they fail permanently right
    // away and only make sense to retry after the user upgrades.
    const attempts = err instanceof PlanLimitError ? MAX_ATTEMPTS : row.retry_count + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await query(`UPDATE post_targets SET status = 'failed', error = $1, retry_count = $2 WHERE id = $3`, [
        message,
        attempts,
        row.id,
      ]);
      // Credential-shaped failures (401/403/unauthorized/invalid token) mean
      // the channel itself is broken — surface that on the channels page so
      // the user knows to reconnect instead of wondering why posts fail.
      if (channel && /\b(401|403)\b|unauthorized|forbidden|invalid\s+(token|key|cred|grant)|expired\s+token|revoked/i.test(message)) {
        await query(`UPDATE channels SET status = 'error' WHERE id = $1 AND status = 'active'`, [channel.id]);
      }
      await log(row.id, 'error', `Failed permanently after ${attempts} attempts: ${message}`);
      fireOutbound(row.outbound_webhook_url, {
        event: 'post.failed',
        post_id: row.post_id,
        channel: channel?.provider ?? null,
        error: message,
      });
    } else {
      await query(
        `UPDATE post_targets
         SET status = 'pending', error = $1, retry_count = $2,
             next_retry_at = now() + (interval '1 minute' * $3)
         WHERE id = $4`,
        [message, attempts, 2 ** (attempts - 1), row.id],
      );
      await log(row.id, 'warn', `Attempt ${attempts} failed: ${message} — will retry with backoff`);
    }
  }
  await refreshPostStatus(row.post_id);
}

async function refreshPostStatus(postId: string): Promise<void> {
  const targets = await query<PostTarget>('SELECT * FROM post_targets WHERE post_id = $1', [postId]);
  if (targets.length === 0) return;
  if (targets.some((t) => t.status === 'pending' || t.status === 'publishing')) return;
  const allFailed = targets.every((t) => t.status === 'failed');
  const updated = await query<{ id: string }>(
    `UPDATE posts SET status = $1, updated_at = now() WHERE id = $2 AND status = 'scheduled' RETURNING id`,
    [allFailed ? 'failed' : 'published', postId],
  );
  // The post just fully published → clone it if it is recurring.
  if (updated.length > 0 && !allFailed) {
    await cloneRecurring(postId).catch((err) => console.error('[postivo] recurring clone failed:', err));
  }
}

// Evergreen posts: clone the published post with scheduled_at = now + N days.
// The clone keeps repeat_every_days so the chain continues; the parent's
// repeat is cleared once the clone exists.
async function cloneRecurring(postId: string): Promise<void> {
  const post = await one<Post>('SELECT * FROM posts WHERE id = $1', [postId]);
  if (!post || !post.repeat_every_days) return;
  const user = await one<User>('SELECT * FROM users WHERE id = $1', [post.user_id]);
  if (!user) return;
  const used = await postsThisMonth(user.id);
  const limit = planOf(user).postsPerMonth;
  if (used >= limit) {
    console.log(`[postivo] recurring clone for post ${postId} skipped: monthly quota reached (${used}/${limit})`);
    await query('UPDATE posts SET repeat_every_days = NULL WHERE id = $1', [postId]);
    return;
  }
  const cloneId = crypto.randomUUID();
  const scheduledAt = new Date(Date.now() + post.repeat_every_days * 86_400_000).toISOString();
  await query(
    `INSERT INTO posts (id, user_id, content, media, scheduled_at, first_scheduled_at, status, comments, repeat_every_days, tags)
     VALUES ($1,$2,$3,$4,$5,$6,'scheduled',$7,$8,$9)`,
    [
      cloneId,
      post.user_id,
      post.content,
      JSON.stringify(Array.isArray(post.media) ? post.media : []),
      scheduledAt,
      new Date().toISOString(),
      JSON.stringify(Array.isArray(post.comments) ? post.comments : []),
      post.repeat_every_days,
      JSON.stringify(Array.isArray(post.tags) ? post.tags : []),
    ],
  );
  const targets = await query<PostTarget>('SELECT * FROM post_targets WHERE post_id = $1', [postId]);
  for (const t of targets) {
    await query(
      `INSERT INTO post_targets (id, post_id, channel_id, content_override, status, retry_count) VALUES ($1,$2,$3,$4,'pending',0)`,
      [crypto.randomUUID(), cloneId, t.channel_id, t.content_override],
    );
  }
  await query('UPDATE posts SET repeat_every_days = NULL WHERE id = $1', [postId]);
  console.log(`[postivo] recurring post ${postId} cloned to ${cloneId} (next run ${scheduledAt})`);
}

// ---------- scheduled comments (threads) ----------

interface DueComment extends TargetComment {
  channel_id: string;
  external_id_target: string | null;
  post_id: string;
}

async function claimDueComments(): Promise<DueComment[]> {
  return query<DueComment>(
    `WITH claimed AS (
       UPDATE post_targets_comments c
       SET status = 'publishing',
           next_retry_at = now() + interval '${CLAIM_TIMEOUT_MINUTES} minutes'
       WHERE c.id IN (
         SELECT c2.id FROM post_targets_comments c2
         WHERE (
             (c2.status = 'pending' AND c2.publish_at <= now() AND (c2.next_retry_at IS NULL OR c2.next_retry_at <= now()))
             OR (c2.status = 'publishing' AND c2.next_retry_at <= now())
           )
           -- Thread integrity: never publish a follow-up while an earlier one
           -- in the same thread is not yet published (no leapfrogging).
           AND NOT EXISTS (
             SELECT 1 FROM post_targets_comments e
             WHERE e.target_id = c2.target_id AND e.idx < c2.idx AND e.status <> 'published'
           )
         ORDER BY c2.publish_at ASC, c2.idx ASC
         LIMIT ${BATCH_SIZE}
         FOR UPDATE OF c2 SKIP LOCKED
       )
       RETURNING c.*
     )
     SELECT cl.*, t.channel_id AS channel_id, t.external_id AS external_id_target, t.post_id AS post_id
     FROM claimed cl JOIN post_targets t ON t.id = cl.target_id
     ORDER BY cl.publish_at ASC, cl.idx ASC`,
  );
}

async function processComment(row: DueComment): Promise<void> {
  const channel = await one<Channel>('SELECT * FROM channels WHERE id = $1', [row.channel_id]);
  try {
    if (!channel) throw new Error('Channel no longer exists');
    const provider = getProvider(channel.provider);
    if (!provider) throw new Error(`Unknown provider "${channel.provider}"`);
    if (channel.status !== 'active') throw new Error(`Channel "${channel.name}" is not active (${channel.status})`);
    const content = row.content;
    const creds = decryptChannelCredentials(channel);
    let result;
    if (provider.reply && row.external_id_target) {
      result = await withTimeout(
        provider.reply({ ...channel, credentials: creds }, row.external_id_target, content),
        PUBLISH_TIMEOUT_MS,
        `Reply on ${provider.id} timed out`,
      );
    } else {
      // Provider can't thread replies — post as a standalone message instead.
      result = await withTimeout(
        provider.publish(channel, creds, content, [], {
          postId: row.post_id,
          scheduledAt: row.publish_at,
        }),
        PUBLISH_TIMEOUT_MS,
        `Publishing to ${provider.id} timed out`,
      );
    }
    // The comment went out — bookkeeping failures must not re-publish it.
    try {
      await query(
        `UPDATE post_targets_comments SET status = 'published', published_at = now(), error = NULL, external_id = $1 WHERE id = $2`,
        [result.externalId ?? null, row.id],
      );
      await log(row.target_id, 'info', `Published comment #${row.idx + 1} to ${channel.name} (${provider.id})`);
    } catch (bookkeepingErr) {
      console.error(`[postivo] CRITICAL: published comment ${row.id} but bookkeeping failed:`, bookkeepingErr);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = row.retry_count + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await query(`UPDATE post_targets_comments SET status = 'failed', error = $1, retry_count = $2 WHERE id = $3`, [
        message,
        attempts,
        row.id,
      ]);
      await log(row.target_id, 'error', `Comment #${row.idx + 1} failed permanently after ${attempts} attempts: ${message}`);
      // The thread is broken — skip every later follow-up so it can't
      // leapfrog the failed one or hang in 'pending' forever.
      const skipped = await query<{ id: string }>(
        `UPDATE post_targets_comments SET status = 'failed', error = 'skipped: earlier comment in thread failed'
         WHERE target_id = $1 AND idx > $2 AND status IN ('pending','publishing') RETURNING id`,
        [row.target_id, row.idx],
      );
      if (skipped.length > 0) {
        await log(row.target_id, 'warn', `Skipped ${skipped.length} later comment(s): earlier comment in thread failed`);
      }
    } else {
      await query(
        `UPDATE post_targets_comments
         SET status = 'pending', error = $1, retry_count = $2,
             next_retry_at = now() + (interval '1 minute' * $3)
         WHERE id = $4`,
        [message, attempts, 2 ** (attempts - 1), row.id],
      );
      await log(row.target_id, 'warn', `Comment #${row.idx + 1} attempt ${attempts} failed: ${message} — will retry`);
    }
  }
}

// ---------- RSS auto-posting ----------

async function claimDueFeeds(): Promise<RssFeed[]> {
  return query<RssFeed>(
    `WITH claimed AS (
       UPDATE rss_feeds f
       SET last_polled_at = now()
       WHERE f.id IN (
         SELECT f2.id FROM rss_feeds f2
         WHERE f2.last_polled_at IS NULL
            OR f2.last_polled_at <= now() - (interval '1 minute' * f2.interval_min)
         ORDER BY f2.last_polled_at ASC NULLS FIRST
         LIMIT 5
         FOR UPDATE OF f2 SKIP LOCKED
       )
       RETURNING f.*
     )
     SELECT * FROM claimed`,
  );
}

async function pollRssFeeds(): Promise<void> {
  const feeds = await claimDueFeeds().catch((err) => {
    console.error('[postivo] rss claim failed:', err);
    return [] as RssFeed[];
  });
  for (const feed of feeds) {
    await processFeed(feed).catch((err) => console.error(`[postivo] rss feed ${feed.id} (${feed.url}) failed:`, err));
  }
}

async function processFeed(feed: RssFeed): Promise<void> {
  const user = await one<User>('SELECT * FROM users WHERE id = $1', [feed.user_id]);
  if (!user) return;
  const res = await guardedFetch(feed.url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`feed responded ${res.status}`);
  // Hard 5MB cap — content-length checked first, then the stream is aborted.
  const xml = (await readBodyCapped(res, RSS_MAX_BYTES)).toString('utf8');
  const items = parseFeed(xml);
  if (items.length === 0) {
    console.error(`[postivo] rss feed ${feed.id} (${feed.url}): fetched OK but parsed 0 items (malformed or empty feed?)`);
  }
  const fresh = newItems(items, feed.last_item_guid, Array.isArray(feed.seen_guids) ? feed.seen_guids : []);
  const channelIds = Array.isArray(feed.channel_ids) ? feed.channel_ids : [];

  for (const item of fresh) {
    let content = `${item.title}\n\n${item.link}`.trim();
    // Check the monthly quota BEFORE spending an AI caption on an item that
    // can't be scheduled anyway.
    const plan = planOf(user);
    if ((await postsThisMonth(user.id)) >= plan.postsPerMonth) {
      console.log(`[postivo] rss feed ${feed.id}: monthly quota reached — skipping remaining items`);
      break;
    }
    // ai_caption is a Pro feature — enforce at poll time too (a downgraded
    // user's feeds silently fall back to the raw item text).
    if (feed.ai_caption && plan.aiCaptions) content = await generateCaption(content);
    const result = await createPost(user, {
      content,
      scheduled_at: new Date().toISOString(),
      channelIds,
      tags: ['rss'],
    });
    if (result.error) {
      // Plan quota (402) or invalid channels — skip this item but keep the
      // feed moving so we don't retry the same item forever.
      console.log(`[postivo] rss feed ${feed.id}: item "${item.title.slice(0, 60)}" skipped: ${result.error}`);
    } else {
      console.log(`[postivo] rss feed ${feed.id}: scheduled "${item.title.slice(0, 60)}" (${result.post?.id})`);
    }
  }
  // Persist a bounded seen-history (200 guids) alongside the last-guid marker.
  const newest = items[0]?.guid ?? feed.last_item_guid;
  const seen = [...fresh.map((i) => i.guid), ...(Array.isArray(feed.seen_guids) ? feed.seen_guids : [])]
    .filter(Boolean)
    .slice(0, 200);
  await query('UPDATE rss_feeds SET last_item_guid = $1, seen_guids = $2 WHERE id = $3', [
    newest,
    JSON.stringify([...new Set(seen)]),
    feed.id,
  ]);
}
