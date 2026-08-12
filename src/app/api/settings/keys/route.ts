import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { one, query, type ApiKey } from '@/lib/db';
import type { ApiKeyDTO } from '@/lib/types';

function toDTO(k: ApiKey): ApiKeyDTO {
  return {
    id: k.id,
    name: k.name,
    key_prefix: k.key_prefix,
    created_at: k.created_at,
    last_used_at: k.last_used_at,
  };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const keys = (await query<ApiKey>('SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC', [user.id])).map(toDTO);
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? '').trim() || 'API key';
  const existing = await one<{ c: number }>('SELECT COUNT(*)::int AS c FROM api_keys WHERE user_id = $1', [user.id]);
  if ((existing?.c ?? 0) >= 10) {
    return NextResponse.json({ error: 'Maximum of 10 API keys reached — delete one first' }, { status: 400 });
  }
  // Shown exactly once: pv_<48 hex chars>
  const key = `pv_${crypto.randomBytes(24).toString('hex')}`;
  const id = crypto.randomUUID();
  await query('INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix) VALUES ($1,$2,$3,$4,$5)', [
    id,
    user.id,
    name,
    crypto.createHash('sha256').update(key).digest('hex'),
    key.slice(0, 10),
  ]);
  return NextResponse.json({ key: { id, name, key_prefix: key.slice(0, 10), token: key } }, { status: 201 });
}
