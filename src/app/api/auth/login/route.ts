import { NextRequest, NextResponse } from 'next/server';
import { attachSession, hashPassword, publicUser, verifyPassword } from '@/lib/auth';
import { one, type User } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/ratelimit';

interface LoginBody {
  email?: string;
  password?: string;
}

// Constant-time-ish anti-enumeration: unknown emails still pay the scrypt
// cost so timing doesn't reveal whether an account exists.
let dummyHash: string | null = null;
function getDummyHash(): string {
  if (!dummyHash) dummyHash = hashPassword('postivo-dummy-login-password');
  return dummyHash;
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
  const ok = verifyPassword(body.password, user ? user.password_hash : getDummyHash());
  if (!user || !ok) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  const res = NextResponse.json({ user: publicUser(user) });
  await attachSession(res, user.id, req);
  return res;
}
