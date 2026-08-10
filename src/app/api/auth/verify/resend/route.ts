import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, tooManyRequests, unauthorized } from '@/lib/auth';
import { query } from '@/lib/db';
import { renderVerifyEmail, sendMail } from '@/lib/mailer';
import { rateLimit } from '@/lib/ratelimit';
import { appUrl, generateToken, testTokensEnabled } from '@/lib/tokens';

// Re-send the verification email (authenticated). Strictly rate-limited per
// user — the dashboard banner button calls this.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const res = NextResponse.json({ ok: true });
  if (user.email_verified_at) return res; // already verified — nothing to do
  if (!rateLimit(`verify-resend:${user.id}`, 3, 10 * 60_000)) return tooManyRequests();
  try {
    const { token, hash } = generateToken();
    await query('DELETE FROM email_verifications WHERE user_id = $1 AND verified_at IS NULL', [user.id]);
    await query('INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)', [
      crypto.randomUUID(),
      user.id,
      hash,
      new Date(Date.now() + 24 * 3_600_000), // 24 hours
    ]);
    const tpl = renderVerifyEmail({ verifyUrl: `${appUrl()}/verify-email?token=${token}` });
    void sendMail({ to: user.email, ...tpl }).catch((err) => console.warn('[mail] verify resend error:', err));
    if (testTokensEnabled()) res.headers.set('x-test-verify-token', token);
  } catch (err) {
    console.warn('[auth] verify resend error:', err);
  }
  return res;
}
