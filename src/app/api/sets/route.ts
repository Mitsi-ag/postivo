import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { one, query, type Channel, type ChannelSet } from '@/lib/db';
import type { ChannelSetDTO } from '@/lib/types';

function toDTO(s: ChannelSet): ChannelSetDTO {
  return {
    id: s.id,
    name: s.name,
    channel_ids: Array.isArray(s.channel_ids) ? s.channel_ids : [],
    created_at: s.created_at,
  };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const sets = await query<ChannelSet>('SELECT * FROM sets WHERE user_id = $1 ORDER BY created_at ASC', [user.id]);
  return NextResponse.json({ sets: sets.map(toDTO) });
}

interface CreateBody {
  name?: string;
  channelIds?: string[];
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const name = (body.name ?? '').trim().slice(0, 100);
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const channelIds: string[] = [];
  for (const cid of Array.isArray(body.channelIds) ? body.channelIds : []) {
    const ch = await one<Channel>('SELECT id FROM channels WHERE id = $1 AND user_id = $2', [String(cid), user.id]);
    if (ch) channelIds.push(ch.id);
  }
  const id = crypto.randomUUID();
  await query('INSERT INTO sets (id, user_id, name, channel_ids) VALUES ($1,$2,$3,$4)', [
    id,
    user.id,
    name,
    JSON.stringify(channelIds),
  ]);
  const set = await one<ChannelSet>('SELECT * FROM sets WHERE id = $1', [id]);
  return NextResponse.json({ set: toDTO(set as ChannelSet) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const existing = await one<ChannelSet>('SELECT * FROM sets WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!existing) return NextResponse.json({ error: 'Set not found' }, { status: 404 });
  await query('DELETE FROM sets WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
