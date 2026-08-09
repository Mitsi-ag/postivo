import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { one, query, type Channel, type RssFeed } from '@/lib/db';
import type { RssFeedDTO } from '@/lib/types';

function toDTO(f: RssFeed): RssFeedDTO {
  return {
    id: f.id,
    url: f.url,
    channel_ids: Array.isArray(f.channel_ids) ? f.channel_ids : [],
    interval_min: f.interval_min,
    ai_caption: f.ai_caption,
    last_item_guid: f.last_item_guid,
    last_polled_at: f.last_polled_at,
    created_at: f.created_at,
  };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const feeds = await query<RssFeed>('SELECT * FROM rss_feeds WHERE user_id = $1 ORDER BY created_at DESC', [user.id]);
  return NextResponse.json({ feeds: feeds.map(toDTO) });
}

interface CreateBody {
  url?: string;
  channelIds?: string[];
  interval_min?: number;
  ai_caption?: boolean;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const url = (body.url ?? '').trim();
  if (!/^https?:\/\//.test(url)) return NextResponse.json({ error: 'url must be an http(s) URL' }, { status: 400 });
  const channelIds: string[] = [];
  for (const cid of Array.isArray(body.channelIds) ? body.channelIds : []) {
    const ch = await one<Channel>('SELECT id FROM channels WHERE id = $1 AND user_id = $2', [String(cid), user.id]);
    if (ch) channelIds.push(ch.id);
  }
  if (channelIds.length === 0) return NextResponse.json({ error: 'Select at least one valid channel' }, { status: 400 });
  const intervalMin = Math.min(Math.max(Math.floor(Number(body.interval_min) || 60), 5), 24 * 60);
  const id = crypto.randomUUID();
  await query(
    'INSERT INTO rss_feeds (id, user_id, url, channel_ids, interval_min, ai_caption) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, user.id, url, JSON.stringify(channelIds), intervalMin, body.ai_caption === true],
  );
  const feed = await one<RssFeed>('SELECT * FROM rss_feeds WHERE id = $1', [id]);
  return NextResponse.json({ feed: toDTO(feed as RssFeed) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const existing = await one<RssFeed>('SELECT * FROM rss_feeds WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!existing) return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
  await query('DELETE FROM rss_feeds WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
