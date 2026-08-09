import crypto from 'node:crypto';
import { one, query, type Channel, type Post, type PostComment, type PostTarget, type RssFeed, type TargetComment, type User } from './db';
import { getProvider } from './providers/registry';
import { generateCaption } from './ai';
import { createPost } from './core';
import { postsThisMonth, planOf } from './plans';
import { newItems, parseFeed } from './rss';

const STARTED = Symbol.for('postivo.scheduler.started');
const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;
// Watchdog: a claimed ('publishing') target becomes claimable again after this
// long, so a crashed instance can never strand a post.
const CLAIM_TIMEOUT_MINUTES = 5;

export function startScheduler(): void {
  const g = globalThis as unknown as Record<symbol, boolean>;
  if (g[STARTED]) return;
  g[STARTED] = true;
  console.log('[postivo] in-process scheduler started (30s interval)');
  const timer = setInterval(() => {
    tick().catch((err) => console.error('[postivo] scheduler tick failed:', err));
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
}

async function log(targetId: string, level: string, message: string): Promise<void> {
  await query('INSERT INTO publish_log (target_id, level, message) VALUES ($1,$2,$3)', [targetId, level, message]);
}

// Fire-and-forget outbound webhook (5s timeout, errors swallowed).
function fireOutbound(url: string | null, payload: Record<string, unknown>): void {
  if (!url) return;
  fetch(url, {
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
            u.signature AS signature, u.signature_enabled AS signature_enabled, u.outbound_webhook_url AS outbound_webhook_url
     FROM claimed c
     JOIN posts p ON p.id = c.post_id
     JOIN users u ON u.id = p.user_id`,
  );
}

async function tick(): Promise<void> {
  const due = await claimDue();
  for (const row of due) {
    await processTarget(row);
  }
  const comments = await claimDueComments();
  for (const row of comments) {
    await processComment(row);
  }
  await pollRssFeeds();
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
  const mediaUrls = mediaIds.map((id) => `/api/media/${id}`);

  try {
    if (!channel) throw new Error('Channel no longer exists');
    const provider = getProvider(channel.provider);
    if (!provider) throw new Error(`Unknown provider "${channel.provider}"`);
    if (channel.status !== 'active') throw new Error(`Channel "${channel.name}" is not active (${channel.status})`);
    const content = withSignature(row.content_override ?? row.content, provider.maxLength, row.signature, row.signature_enabled);
    const creds = channel.credentials ?? {};
    const result = await provider.publish(channel, creds, content, mediaUrls, {
      postId: row.post_id,
      scheduledAt: row.scheduled_at,
    });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = row.retry_count + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await query(`UPDATE post_targets SET status = 'failed', error = $1, retry_count = $2 WHERE id = $3`, [
        message,
        attempts,
        row.id,
      ]);
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
    `INSERT INTO posts (id, user_id, content, media, scheduled_at, status, comments, repeat_every_days, tags)
     VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8)`,
    [
      cloneId,
      post.user_id,
      post.content,
      JSON.stringify(Array.isArray(post.media) ? post.media : []),
      scheduledAt,
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
         ORDER BY c2.publish_at ASC
         LIMIT ${BATCH_SIZE}
         FOR UPDATE OF c2 SKIP LOCKED
       )
       RETURNING c.*
     )
     SELECT cl.*, t.channel_id AS channel_id, t.external_id AS external_id_target, t.post_id AS post_id
     FROM claimed cl JOIN post_targets t ON t.id = cl.target_id`,
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
    let result;
    if (provider.reply && row.external_id_target) {
      result = await provider.reply(channel, row.external_id_target, content);
    } else {
      // Provider can't thread replies — post as a standalone message instead.
      result = await provider.publish(channel, channel.credentials ?? {}, content, [], {
        postId: row.post_id,
        scheduledAt: row.publish_at,
      });
    }
    await query(
      `UPDATE post_targets_comments SET status = 'published', published_at = now(), error = NULL, external_id = $1 WHERE id = $2`,
      [result.externalId ?? null, row.id],
    );
    await log(row.target_id, 'info', `Published comment #${row.idx + 1} to ${channel.name} (${provider.id})`);
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
  const res = await fetch(feed.url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`feed responded ${res.status}`);
  const xml = await res.text();
  const items = parseFeed(xml);
  const fresh = newItems(items, feed.last_item_guid);
  const channelIds = Array.isArray(feed.channel_ids) ? feed.channel_ids : [];

  for (const item of fresh) {
    let content = `${item.title}\n\n${item.link}`.trim();
    if (feed.ai_caption) content = await generateCaption(content);
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
  const newest = items[0]?.guid ?? feed.last_item_guid;
  if (newest && newest !== feed.last_item_guid) {
    await query('UPDATE rss_feeds SET last_item_guid = $1 WHERE id = $2', [newest, feed.id]);
  }
}
