import { NextRequest, NextResponse } from 'next/server';
import { one, query, type EmailVerification } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { hashToken } from '@/lib/tokens';

interface VerifyBody {
  token?: string;
}

// Consumes an email-verification token. Unauthenticated by design — the
// token itself is the proof of inbox ownership.
export async function POST(req: NextRequest) {
  if (!rateLimit(`verify:${clientIp(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as VerifyBody | null;
  const token = body?.token ?? '';
  if (!token || token.length > 200) {
    return NextResponse.json(
      { error: 'This verification link is invalid or has already been used.', code: 'invalid' },
      { status: 400 },
    );
  }
  const row = await one<EmailVerification>('SELECT * FROM email_verifications WHERE token_hash = $1', [
    hashToken(token),
  ]);
  if (!row || row.verified_at) {
    return NextResponse.json(
      { error: 'This verification link is invalid or has already been used.', code: 'invalid' },
      { status: 400 },
    );
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'This verification link has expired — request a new one.', code: 'expired' },
      { status: 400 },
    );
  }
  await query('UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL', [row.user_id]);
  await query('UPDATE email_verifications SET verified_at = now() WHERE id = $1', [row.id]);
  return NextResponse.json({ ok: true });
}
