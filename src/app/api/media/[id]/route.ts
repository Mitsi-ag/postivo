import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { one, type MediaItem } from '@/lib/db';
import { getMedia } from '@/lib/storage';

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
  return new NextResponse(new Uint8Array(obj.body), {
    headers: {
      'content-type': obj.contentType || item.mime || 'application/octet-stream',
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
}
