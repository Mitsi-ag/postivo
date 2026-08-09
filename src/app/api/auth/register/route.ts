import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { attachSession, hashPassword, publicUser } from '@/lib/auth';
import { one, query, type User } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/ratelimit';

interface RegisterBody {
  email?: string;
  password?: string;
  name?: string;
  timezone?: string;
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`register:${clientIp(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many attempts — try again in a few minutes' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as RegisterBody | null;
  if (!body?.email || !body.password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (await one<User>('SELECT * FROM users WHERE email = $1', [email])) {
    return NextResponse.json({ error: 'Email is already registered' }, { status: 409 });
  }
  const id = crypto.randomUUID();
  await query('INSERT INTO users (id, email, password_hash, name, timezone) VALUES ($1,$2,$3,$4,$5)', [
    id,
    email,
    hashPassword(body.password),
    (body.name ?? '').trim() || email.split('@')[0],
    (body.timezone ?? '').trim() || 'UTC',
  ]);
  const user = await one<User>('SELECT * FROM users WHERE id = $1', [id]);
  const res = NextResponse.json({ user: publicUser(user as User) });
  attachSession(res, id);
  return res;
}
