import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, publicUser, unauthorized } from '@/lib/auth';
import { query, type ApiKey, type Channel, type Post, type PostTarget } from '@/lib/db';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();

  const channels = (await query<Channel>('SELECT * FROM channels WHERE user_id = $1', [user.id])).map((c) => ({
    ...c,
    credentials: c.credentials ?? {},
  }));
  const posts = [];
  for (const p of await query<Post>('SELECT * FROM posts WHERE user_id = $1', [user.id])) {
    posts.push({
      ...p,
      media: Array.isArray(p.media) ? p.media : [],
      targets: await query<PostTarget>('SELECT t.* FROM post_targets t WHERE t.post_id = $1', [p.id]),
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
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="postivo-export-${date}.json"`,
    },
  });
}
