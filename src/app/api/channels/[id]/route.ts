import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { one, query, type Channel } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const channel = await one<Channel>('SELECT * FROM channels WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  // Pending targets for this channel can never publish — drop them.
  await query(`DELETE FROM post_targets WHERE channel_id = $1 AND status = 'pending'`, [id]);
  await query('DELETE FROM channels WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
