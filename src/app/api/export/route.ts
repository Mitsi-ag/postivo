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

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();

  // Owner-only export of their own data — credentials are decrypted here just
  // like they are presented to providers at publish time.
  const channels = (await query<Channel>('SELECT * FROM channels WHERE user_id = $1', [user.id])).map((c) => ({
    ...c,
    credentials: decryptChannelCredentials(c),
  }));
  const posts = [];
  for (const p of await query<Post>('SELECT * FROM posts WHERE user_id = $1', [user.id])) {
    const targets = [];
    for (const t of await query<PostTarget>('SELECT t.* FROM post_targets t WHERE t.post_id = $1', [p.id])) {
      targets.push({
        ...t,
        comments: await query<TargetComment>(
          'SELECT * FROM post_targets_comments WHERE target_id = $1 ORDER BY idx ASC',
          [t.id],
        ),
      });
    }
    posts.push({
      ...p,
      media: Array.isArray(p.media) ? p.media : [],
      targets,
    });
  }
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
