import { NextRequest, NextResponse } from 'next/server';
import { attachSession, hashPassword, revokeAllSessions } from '@/lib/auth';
import { one, query, type PasswordReset } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { hashToken } from '@/lib/tokens';

const INVALID = { error: 'This reset link is invalid or has already been used.', code: 'invalid' };
const EXPIRED = { error: 'This reset link has expired — request a new one.', code: 'expired' };

type Lookup = { row: PasswordReset; error?: never } | { row?: never; error: { error: string; code: string } };

async function lookup(token: string): Promise<Lookup> {
  if (!token || token.length > 200) return { error: INVALID };
  const row = await one<PasswordReset>('SELECT * FROM password_resets WHERE token_hash = $1', [hashToken(token)]);
  if (!row || row.used_at) return { error: INVALID };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { error: EXPIRED };
  return { row };
}

// Token pre-validation for the /reset-password page (no state change).
export async function GET(req: NextRequest) {
  if (!rateLimit(`reset-check:${clientIp(req)}`, 30, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });
  }
  const result = await lookup(req.nextUrl.searchParams.get('token') ?? '');
  if (result.error) return NextResponse.json(result.error, { status: 400 });
  return NextResponse.json({ ok: true });
}

interface ResetBody {
  token?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`reset:${clientIp(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as ResetBody | null;
  if (!body?.token || !body.password) {
    return NextResponse.json({ error: 'token and password are required' }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  const result = await lookup(body.token);
  if (result.error) return NextResponse.json(result.error, { status: 400 });
  const { row } = result;
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(body.password), row.user_id]);
  await query('UPDATE password_resets SET used_at = now() WHERE id = $1', [row.id]);
  // A password reset kills every existing session (stolen cookies included),
  // then issues a fresh one so the resetter lands signed in.
  await revokeAllSessions(row.user_id);
  const res = NextResponse.json({ ok: true });
  await attachSession(res, row.user_id, req);
  return res;
}
