import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { one, type MediaItem } from '@/lib/db';
import { getMedia, deleteMedia } from '@/lib/storage';
import { query } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Prevent path traversal — media ids are always "<uuid>.<ext>".
  if (!/^[A-Za-z0-9-]+\.[a-z0-9]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid media id' }, { status: 400 });
  }
  // Owner-only access.
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const item = await one<MediaItem>('SELECT * FROM media WHERE id = $1', [id]);
  if (!item || item.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const obj = await getMedia(user.id, id);
  if (!obj) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const headers: Record<string, string> = {
    'content-type': obj.contentType || item.mime || 'application/octet-stream',
    'cache-control': 'private, max-age=31536000, immutable',
  };
  // User-supplied SVG can carry <script> — sandbox it so it renders as an
  // image but can never execute in this origin (stored-XSS guard).
  if ((item.mime || obj.contentType) === 'image/svg+xml' || id.endsWith('.svg')) {
    headers['content-security-policy'] = 'sandbox';
  }
  return new NextResponse(new Uint8Array(obj.body), { headers });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9-]+\.[a-z0-9]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid media id' }, { status: 400 });
  }
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const item = await one<MediaItem>('SELECT * FROM media WHERE id = $1', [id]);
  if (!item || item.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await deleteMedia(user.id, id).catch(() => {}); // row removal is the source of truth
  await query('DELETE FROM media WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
