import crypto from 'node:crypto';
import { one, query, type Channel, type Post, type PostTarget, type User } from './db';
import { getProvider, providerMetaFor } from './providers/registry';
import { channelsUsed, planOf, postsThisMonth } from './plans';
import type { ChannelDTO, PostDTO, TargetDTO } from './types';

// ---------- channels ----------

export async function listChannelsDTO(userId: string): Promise<ChannelDTO[]> {
  const channels = await query<Channel>('SELECT * FROM channels WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
  return channels.map((c) => ({
    id: c.id,
    provider: c.provider,
    name: c.name,
    status: c.status,
    created_at: c.created_at,
    provider_meta: providerMetaFor(c.provider),
  }));
}

export interface ChannelInput {
  provider?: string;
  name?: string;
  credentials?: Record<string, string>;
}

export async function createChannel(
  user: User,
  body: ChannelInput,
): Promise<{ channel?: ChannelDTO; error?: string; status?: number; upgrade?: boolean }> {
  const provider = body.provider ? getProvider(body.provider) : undefined;
  if (!provider) return { error: 'Unknown provider', status: 400 };
  const creds = body.credentials ?? {};
  for (const field of provider.fields) {
    if (!field.optional && !String(creds[field.key] ?? '').trim()) {
      return { error: `Missing required field: ${field.label}`, status: 400 };
    }
  }
  const limit = planOf(user).channels;
  const used = await channelsUsed(user.id);
  if (used >= limit) {
    return {
      error: `Your plan allows ${limit} channel${limit === 1 ? '' : 's'} — upgrade to connect more.`,
      status: 402,
      upgrade: true,
    };
  }
  const id = crypto.randomUUID();
  const name = (body.name ?? '').trim() || provider.name;
  await query(
    'INSERT INTO channels (id, user_id, provider, name, credentials, status) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, user.id, provider.id, name, JSON.stringify(creds), 'active'],
  );
  const channel = (await listChannelsDTO(user.id)).find((c) => c.id === id);
  return { channel };
}

// ---------- posts ----------

interface TargetJoin extends PostTarget {
  channel_name: string | null;
  provider: string | null;
}

export async function serializePost(post: Post): Promise<PostDTO> {
  const rows = await query<TargetJoin>(
    `SELECT t.*, c.name AS channel_name, c.provider AS provider
     FROM post_targets t LEFT JOIN channels c ON c.id = t.channel_id
     WHERE t.post_id = $1 ORDER BY t.id ASC`,
    [post.id],
  );
  const targets: TargetDTO[] = rows.map((r) => ({
    id: r.id,
    channel_id: r.channel_id,
    channel_name: r.channel_name,
    provider: r.provider,
    status: r.status,
    published_at: r.published_at,
    error: r.error,
    retry_count: r.retry_count,
    next_retry_at: r.next_retry_at,
    external_url: r.external_url,
    content_override: r.content_override,
  }));
  return {
    id: post.id,
    content: post.content,
    media: Array.isArray(post.media) ? post.media : [],
    scheduled_at: post.scheduled_at,
    status: post.status,
    created_at: post.created_at,
    updated_at: post.updated_at,
    targets,
  };
}

export async function getPostDTO(postId: string, userId: string): Promise<PostDTO | null> {
  const post = await one<Post>('SELECT * FROM posts WHERE id = $1 AND user_id = $2', [postId, userId]);
  return post ? serializePost(post) : null;
}

export async function listPosts(userId: string, status?: string): Promise<PostDTO[]> {
  let posts: Post[];
  if (status === 'failed') {
    posts = await query<Post>(
      `SELECT * FROM posts p WHERE p.user_id = $1 AND (
         p.status = 'failed' OR EXISTS (SELECT 1 FROM post_targets t WHERE t.post_id = p.id AND t.status = 'failed')
       ) ORDER BY p.updated_at DESC LIMIT 200`,
      [userId],
    );
  } else if (status) {
    const order = status === 'scheduled' ? 'p.scheduled_at ASC' : 'p.created_at DESC';
    posts = await query<Post>(`SELECT * FROM posts p WHERE p.user_id = $1 AND p.status = $2 ORDER BY ${order} LIMIT 200`, [userId, status]);
  } else {
    posts = await query<Post>('SELECT * FROM posts p WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT 500', [userId]);
  }
  return Promise.all(posts.map(serializePost));
}

export interface PostInput {
  content?: string;
  media?: string[];
  scheduled_at?: string | null;
  channelIds?: string[];
  overrides?: Record<string, string>;
}

async function validChannelIds(userId: string, channelIds: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const cid of channelIds) {
    const ch = await one<Channel>('SELECT * FROM channels WHERE id = $1 AND user_id = $2', [cid, userId]);
    if (ch) out.push(cid);
  }
  return out;
}

export async function createPost(
  user: User,
  body: PostInput,
): Promise<{ post?: PostDTO; error?: string; status?: number; upgrade?: boolean }> {
  const content = (body.content ?? '').trim();
  const media = Array.isArray(body.media) ? body.media : [];
  const scheduledAt = body.scheduled_at ?? null;
  const channelIds = await validChannelIds(user.id, body.channelIds ?? []);

  if (!content && media.length === 0) return { error: 'Content is required', status: 400 };
  if (scheduledAt && channelIds.length === 0) return { error: 'Select at least one channel to schedule', status: 400 };
  if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) return { error: 'Invalid scheduled_at datetime', status: 400 };

  if (scheduledAt) {
    const limit = planOf(user).postsPerMonth;
    const used = await postsThisMonth(user.id);
    if (used >= limit) {
      return {
        error: `Your plan allows ${limit} scheduled posts per month — upgrade to schedule more.`,
        status: 402,
        upgrade: true,
      };
    }
  }

  const id = crypto.randomUUID();
  const status = scheduledAt ? 'scheduled' : 'draft';
  await query(
    'INSERT INTO posts (id, user_id, content, media, scheduled_at, status) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, user.id, content, JSON.stringify(media), scheduledAt, status],
  );
  for (const cid of channelIds) {
    await query(
      'INSERT INTO post_targets (id, post_id, channel_id, content_override, status, retry_count) VALUES ($1,$2,$3,$4,$5,0)',
      [crypto.randomUUID(), id, cid, body.overrides?.[cid]?.trim() || null, 'pending'],
    );
  }
  return { post: (await getPostDTO(id, user.id)) ?? undefined };
}

export interface UpdatePostInput extends PostInput {
  status?: string;
}

export async function updatePost(
  userId: string,
  postId: string,
  body: UpdatePostInput,
): Promise<{ post?: PostDTO; error?: string; status?: number }> {
  const existing = await one<Post>('SELECT * FROM posts WHERE id = $1 AND user_id = $2', [postId, userId]);
  if (!existing) return { error: 'Post not found', status: 404 };

  const content = body.content !== undefined ? body.content.trim() : existing.content;
  const media = body.media !== undefined ? body.media : Array.isArray(existing.media) ? existing.media : [];
  const scheduledAt = body.scheduled_at !== undefined ? body.scheduled_at : existing.scheduled_at;

  let status = existing.status;
  if (body.status && ['draft', 'scheduled'].includes(body.status)) {
    status = body.status as Post['status'];
  } else if (body.scheduled_at !== undefined) {
    status = scheduledAt ? 'scheduled' : 'draft';
  }
  if (status === 'scheduled' && !scheduledAt) return { error: 'A scheduled post needs scheduled_at', status: 400 };
  if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) return { error: 'Invalid scheduled_at datetime', status: 400 };
  if (!content && media.length === 0) return { error: 'Content is required', status: 400 };

  await query(
    'UPDATE posts SET content = $1, media = $2, scheduled_at = $3, status = $4, updated_at = now() WHERE id = $5',
    [content, JSON.stringify(media), scheduledAt, status, postId],
  );

  if (body.channelIds) {
    const channelIds = await validChannelIds(userId, body.channelIds);
    // Drop pending targets for channels no longer selected.
    const existingTargets = await query<PostTarget>('SELECT * FROM post_targets WHERE post_id = $1', [postId]);
    for (const t of existingTargets) {
      if (t.status === 'pending' && !channelIds.includes(t.channel_id)) {
        await query('DELETE FROM post_targets WHERE id = $1', [t.id]);
      }
    }
    // Add targets for newly selected channels.
    const have = new Set(existingTargets.map((t) => t.channel_id));
    for (const cid of channelIds) {
      if (!have.has(cid)) {
        await query(
          'INSERT INTO post_targets (id, post_id, channel_id, content_override, status, retry_count) VALUES ($1,$2,$3,$4,$5,0)',
          [crypto.randomUUID(), postId, cid, body.overrides?.[cid]?.trim() || null, 'pending'],
        );
      }
    }
  }

  if (body.overrides) {
    for (const [cid, text] of Object.entries(body.overrides)) {
      await query(
        `UPDATE post_targets SET content_override = $1 WHERE post_id = $2 AND channel_id = $3 AND status = 'pending'`,
        [text?.trim() || null, postId, cid],
      );
    }
  }

  return { post: (await getPostDTO(postId, userId)) ?? undefined };
}

export async function deletePost(userId: string, postId: string): Promise<boolean> {
  const existing = await one<Post>('SELECT * FROM posts WHERE id = $1 AND user_id = $2', [postId, userId]);
  if (!existing) return false;
  await query('DELETE FROM publish_log WHERE target_id IN (SELECT id FROM post_targets WHERE post_id = $1)', [postId]);
  await query('DELETE FROM post_targets WHERE post_id = $1', [postId]);
  await query('DELETE FROM posts WHERE id = $1', [postId]);
  return true;
}
