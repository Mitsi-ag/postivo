import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { one, query, type ApiKey } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const key = await one<ApiKey>('SELECT * FROM api_keys WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!key) return NextResponse.json({ error: 'API key not found' }, { status: 404 });
  await query('DELETE FROM api_keys WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
