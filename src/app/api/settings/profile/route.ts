import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, publicUser, unauthorized } from '@/lib/auth';
import { one, query, type User } from '@/lib/db';

interface ProfileBody {
  name?: string;
  timezone?: string;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => null)) as ProfileBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const name = (body.name ?? user.name).trim();
  const timezone = (body.timezone ?? user.timezone).trim() || 'UTC';
  if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
  await query('UPDATE users SET name = $1, timezone = $2 WHERE id = $3', [name, timezone, user.id]);
  const updated = await one<User>('SELECT * FROM users WHERE id = $1', [user.id]);
  return NextResponse.json({ user: publicUser(updated as User) });
}
