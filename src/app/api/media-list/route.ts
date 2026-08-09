import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { query, type MediaItem } from '@/lib/db';
import type { MediaListItemDTO } from '@/lib/types';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const items = await query<MediaItem>('SELECT * FROM media WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [
    user.id,
  ]);
  const media: MediaListItemDTO[] = items.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    mime: m.mime,
    size: m.size,
    url: `/api/media/${m.id}`,
    created_at: m.created_at,
  }));
  return NextResponse.json({ media });
}
