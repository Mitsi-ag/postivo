import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { one, query, type Channel } from '@/lib/db';
import { getProvider } from '@/lib/providers/registry';
import { decryptChannelCredentials, encryptJson } from '@/lib/crypto';
import { listChannelsDTO } from '@/lib/core';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const channel = await one<Channel>('SELECT * FROM channels WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { name?: string; credentials?: Record<string, string> } | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const name = body.name !== undefined ? body.name.trim() : channel.name;
  if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });

  // Credentials merge over the existing ones — the UI only sends the fields
  // the user re-typed, so untouched secrets survive the edit.
  let credentialsJson: string | undefined;
  let reactivated = false;
  if (body.credentials && typeof body.credentials === 'object') {
    const merged = { ...decryptChannelCredentials(channel) };
    for (const [k, v] of Object.entries(body.credentials)) {
      if (typeof v === 'string' && v.trim()) merged[k] = v.trim();
    }
    const provider = getProvider(channel.provider);
    if (provider) {
      for (const field of provider.fields) {
        if (!field.optional && !String(merged[field.key] ?? '').trim()) {
          return NextResponse.json({ error: `Missing required field: ${field.label}` }, { status: 400 });
        }
      }
    }
    credentialsJson = JSON.stringify(encryptJson(merged));
    reactivated = true; // fresh credentials — give the channel a clean slate
  }

  await query('UPDATE channels SET name = $1' + (credentialsJson ? ', credentials = $3' : '') + (reactivated ? `, status = 'active'` : '') + ' WHERE id = $2',
    credentialsJson ? [name, id, credentialsJson] : [name, id]);

  const dto = (await listChannelsDTO(user.id)).find((c) => c.id === id);
  return NextResponse.json({ channel: dto });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const channel = await one<Channel>('SELECT * FROM channels WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  // Pending targets for this channel can never publish — drop them.
  await query(`DELETE FROM post_targets WHERE channel_id = $1 AND status = 'pending'`, [id]);
  await query('DELETE FROM channels WHERE id = $1', [id]);
  // Scrub the deleted id out of jsonb channel lists, or RSS feeds would keep
  // creating zero-target posts and sets would render dead chips.
  const needle = JSON.stringify([id]);
  await query(
    `UPDATE rss_feeds SET channel_ids = COALESCE((
       SELECT jsonb_agg(e) FROM jsonb_array_elements_text(channel_ids) e WHERE e <> $1
     ), '[]'::jsonb) WHERE channel_ids @> $2::jsonb`,
    [id, needle],
  );
  await query(
    `UPDATE sets SET channel_ids = COALESCE((
       SELECT jsonb_agg(e) FROM jsonb_array_elements_text(channel_ids) e WHERE e <> $1
     ), '[]'::jsonb) WHERE channel_ids @> $2::jsonb`,
    [id, needle],
  );
  return NextResponse.json({ ok: true });
}
