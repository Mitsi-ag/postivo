import { one, query, type Channel, type PostTarget } from './db';
import { getProvider } from './providers/registry';

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
  scheduled_at: string | null;
}

async function log(targetId: string, level: string, message: string): Promise<void> {
  await query('INSERT INTO publish_log (target_id, level, message) VALUES ($1,$2,$3)', [targetId, level, message]);
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
     SELECT c.*, p.content AS content, p.media AS media, p.scheduled_at AS scheduled_at
     FROM claimed c JOIN posts p ON p.id = c.post_id`,
  );
}

async function tick(): Promise<void> {
  const due = await claimDue();
  for (const row of due) {
    await processTarget(row);
  }
}

async function processTarget(row: DueRow): Promise<void> {
  const channel = await one<Channel>('SELECT * FROM channels WHERE id = $1', [row.channel_id]);
  const content = row.content_override ?? row.content;
  const mediaIds = Array.isArray(row.media) ? row.media : [];
  const mediaUrls = mediaIds.map((id) => `/api/media/${id}`);

  try {
    if (!channel) throw new Error('Channel no longer exists');
    const provider = getProvider(channel.provider);
    if (!provider) throw new Error(`Unknown provider "${channel.provider}"`);
    if (channel.status !== 'active') throw new Error(`Channel "${channel.name}" is not active (${channel.status})`);
    const creds = channel.credentials ?? {};
    const result = await provider.publish(channel, creds, content, mediaUrls, {
      postId: row.post_id,
      scheduledAt: row.scheduled_at,
    });
    await query(
      `UPDATE post_targets SET status = 'published', published_at = now(), error = NULL, external_url = $1 WHERE id = $2`,
      [result.externalUrl ?? null, row.id],
    );
    await log(row.id, 'info', `Published to ${channel.name} (${provider.id})`);
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
  await query(`UPDATE posts SET status = $1, updated_at = now() WHERE id = $2 AND status = 'scheduled'`, [
    allFailed ? 'failed' : 'published',
    postId,
  ]);
}
