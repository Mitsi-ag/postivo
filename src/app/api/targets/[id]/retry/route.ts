import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { one, query } from '@/lib/db';

interface TargetOwner {
  id: string;
  post_id: string;
  user_id: string;
  status: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const target = await one<TargetOwner>(
    'SELECT t.id, t.post_id, t.status, p.user_id FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE t.id = $1',
    [id],
  );
  if (!target || target.user_id !== user.id) {
    return NextResponse.json({ error: 'Target not found' }, { status: 404 });
  }
  // Only failed targets may be retried — resetting a published (or in-flight)
  // target to pending would re-publish it on the platform (duplicate posts).
  if (target.status !== 'failed') {
    return NextResponse.json({ error: 'Only failed targets can be retried' }, { status: 409 });
  }
  await query(
    `UPDATE post_targets SET status = 'pending', error = NULL, retry_count = 0, next_retry_at = now() WHERE id = $1`,
    [id],
  );
  await query(
    `UPDATE posts SET status = 'scheduled',
       scheduled_at = CASE WHEN scheduled_at IS NULL OR scheduled_at > now() THEN now() ELSE scheduled_at END,
       updated_at = now()
     WHERE id = $1`,
    [target.post_id],
  );
  await query('INSERT INTO publish_log (target_id, level, message) VALUES ($1,$2,$3)', [
    id,
    'info',
    'Manual retry requested',
  ]);
  return NextResponse.json({ ok: true });
}
