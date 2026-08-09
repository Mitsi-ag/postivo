import { NextRequest, NextResponse } from 'next/server';
import { detachSession, getSessionUser, unauthorized, verifyPassword } from '@/lib/auth';
import { query, type MediaItem } from '@/lib/db';
import { deleteMedia } from '@/lib/storage';
import { rateLimit } from '@/lib/ratelimit';

interface DeleteBody {
  password?: string;
}

// GDPR right to erasure: password re-auth, best-effort media object cleanup,
// then explicit deletion of every row the user owns (no FK cascades exist).
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!rateLimit(`delete-account:${user.id}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as DeleteBody | null;
  if (!body?.password || !verifyPassword(body.password, user.password_hash)) {
    return NextResponse.json({ error: 'Password is incorrect' }, { status: 403 });
  }

  // Media files first (S3 or local disk), best-effort — row deletion below is
  // the source of truth.
  const media = await query<MediaItem>('SELECT * FROM media WHERE user_id = $1', [user.id]);
  for (const m of media) {
    await deleteMedia(user.id, m.id).catch(() => {});
  }

  await query(
    'DELETE FROM publish_log WHERE target_id IN (SELECT t.id FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE p.user_id = $1)',
    [user.id],
  );
  await query(
    'DELETE FROM post_targets_comments WHERE target_id IN (SELECT t.id FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE p.user_id = $1)',
    [user.id],
  );
  await query('DELETE FROM post_targets WHERE post_id IN (SELECT id FROM posts WHERE user_id = $1)', [user.id]);
  await query('DELETE FROM posts WHERE user_id = $1', [user.id]);
  await query('DELETE FROM channels WHERE user_id = $1', [user.id]);
  await query('DELETE FROM api_keys WHERE user_id = $1', [user.id]);
  await query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
  await query('DELETE FROM rss_feeds WHERE user_id = $1', [user.id]);
  await query('DELETE FROM sets WHERE user_id = $1', [user.id]);
  await query('DELETE FROM media WHERE user_id = $1', [user.id]);
  await query('DELETE FROM users WHERE id = $1', [user.id]);

  const res = NextResponse.json({ ok: true });
  detachSession(res, req);
  return res;
}
