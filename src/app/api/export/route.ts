import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, publicUser, unauthorized } from '@/lib/auth';
import { decryptChannelCredentials } from '@/lib/crypto';
import {
  query,
  type ApiKey,
  type Channel,
  type ChannelSet,
  type MediaItem,
  type Post,
  type PostTarget,
  type RssFeed,
  type TargetComment,
} from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  // This export contains decrypted channel credentials — keep it tight.
  if (!rateLimit(`export:${user.id}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: 'Export limit reached — try again later' }, { status: 429 });
  }

  // Owner-only export of their own data — credentials are decrypted here just
  // like they are presented to providers at publish time.
  const channels = (await query<Channel>('SELECT * FROM channels WHERE user_id = $1', [user.id])).map((c) => ({
    ...c,
    credentials: decryptChannelCredentials(c),
  }));
  // Two queries total (no N+1): fetch every target and every comment the user
  // owns, then group in memory.
  const userPosts = await query<Post>('SELECT * FROM posts WHERE user_id = $1', [user.id]);
  const allTargets = await query<PostTarget>(
    'SELECT t.* FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE p.user_id = $1',
    [user.id],
  );
  const allComments = await query<TargetComment>(
    `SELECT c.* FROM post_targets_comments c
     JOIN post_targets t ON t.id = c.target_id
     JOIN posts p ON p.id = t.post_id WHERE p.user_id = $1 ORDER BY c.idx ASC`,
    [user.id],
  );
  const commentsByTarget = new Map<string, TargetComment[]>();
  for (const c of allComments) {
    const list = commentsByTarget.get(c.target_id) ?? [];
    list.push(c);
    commentsByTarget.set(c.target_id, list);
  }
  const targetsByPost = new Map<string, PostTarget[]>();
  for (const t of allTargets) {
    const list = targetsByPost.get(t.post_id) ?? [];
    list.push(t);
    targetsByPost.set(t.post_id, list);
  }
  const posts = userPosts.map((p) => ({
    ...p,
    media: Array.isArray(p.media) ? p.media : [],
    targets: (targetsByPost.get(p.id) ?? []).map((t) => ({ ...t, comments: commentsByTarget.get(t.id) ?? [] })),
  }));
  const apiKeys = (await query<ApiKey>('SELECT * FROM api_keys WHERE user_id = $1', [user.id])).map((k) => ({
    id: k.id,
    name: k.name,
    key_prefix: k.key_prefix,
    created_at: k.created_at,
    last_used_at: k.last_used_at,
  }));

  const payload = {
    exported_at: new Date().toISOString(),
    user: publicUser(user),
    api_keys: apiKeys,
    channels,
    posts,
    rss_feeds: await query<RssFeed>('SELECT * FROM rss_feeds WHERE user_id = $1', [user.id]),
    sets: await query<ChannelSet>('SELECT * FROM sets WHERE user_id = $1', [user.id]),
    media: await query<MediaItem>('SELECT * FROM media WHERE user_id = $1', [user.id]),
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="postivo-export-${date}.json"`,
    },
  });
}
