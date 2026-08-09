import { NextRequest, NextResponse } from 'next/server';
import { attachSession, publicUser, verifyPassword } from '@/lib/auth';
import { one, type User } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/ratelimit';

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`login:${clientIp(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many attempts — try again in a few minutes' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as LoginBody | null;
  if (!body?.email || !body.password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }
  const user = await one<User>('SELECT * FROM users WHERE email = $1', [body.email.trim().toLowerCase()]);
  if (!user || !verifyPassword(body.password, user.password_hash)) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  const res = NextResponse.json({ user: publicUser(user) });
  attachSession(res, user.id);
  return res;
}
