import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { one, query, type User } from '@/lib/db';
import { renderPasswordResetEmail, sendMail, emailEnabled } from '@/lib/mailer';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { appUrl, generateToken, testTokensEnabled } from '@/lib/tokens';

interface ForgotBody {
  email?: string;
}

// Anti-enumeration: the response is ALWAYS 200 { ok: true } for well-formed
// requests, whether or not the email is registered. Only rate limiting (per
// source IP, like every other auth endpoint) can produce a different status.
export async function POST(req: NextRequest) {
  if (!rateLimit(`forgot:${clientIp(req)}`, 5, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as ForgotBody | null;
  const email = (body?.email ?? '').trim().toLowerCase();
  const res = NextResponse.json({ ok: true, email_enabled: emailEnabled() });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res;
  const user = await one<User>('SELECT * FROM users WHERE email = $1', [email]);
  if (!user) return res;
  try {
    const { token, hash } = generateToken();
    // One live reset link per account — older unused tokens are invalidated.
    await query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [user.id]);
    await query('INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)', [
      crypto.randomUUID(),
      user.id,
      hash,
      new Date(Date.now() + 3_600_000), // 1 hour
    ]);
    const tpl = renderPasswordResetEmail({ resetUrl: `${appUrl()}/reset-password?token=${token}` });
    // Fire-and-forget: email delivery must never block or fail the auth flow.
    void sendMail({ to: email, ...tpl }).catch((err) => console.warn('[mail] reset send error:', err));
    if (testTokensEnabled()) res.headers.set('x-test-reset-token', token);
  } catch (err) {
    console.warn('[auth] forgot-password flow error:', err);
  }
  return res;
}
