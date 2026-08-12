import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { attachSession, hashPassword, publicUser } from '@/lib/auth';
import { one, query, type User } from '@/lib/db';
import { renderVerifyEmail, renderWelcomeEmail, sendMail } from '@/lib/mailer';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { appUrl, generateToken, testTokensEnabled } from '@/lib/tokens';

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
  if (body.password.length > 256) {
    // scrypt cost scales with input length — cap it to avoid CPU-DoS.
    return NextResponse.json({ error: 'Password must be at most 256 characters' }, { status: 400 });
  }
  if (await one<User>('SELECT * FROM users WHERE email = $1', [email])) {
    // Deliberately generic — don't confirm that the email is registered.
    return NextResponse.json({ error: 'Could not create account' }, { status: 409 });
  }
  const id = crypto.randomUUID();
  try {
    await query('INSERT INTO users (id, email, password_hash, name, timezone) VALUES ($1,$2,$3,$4,$5)', [
      id,
      email,
      hashPassword(body.password),
      (body.name ?? '').trim() || email.split('@')[0],
      (body.timezone ?? '').trim() || 'UTC',
    ]);
  } catch (err) {
    // Two concurrent registrations with the same email race past the SELECT
    // above — the UNIQUE constraint decides; answer like the check would have.
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Could not create account' }, { status: 409 });
    }
    throw err;
  }
  const user = await one<User>('SELECT * FROM users WHERE id = $1', [id]);
  const res = NextResponse.json({ user: publicUser(user as User) });
  await attachSession(res, id, req);
  // Transactional email — strictly fire-and-forget: delivery failures must
  // never fail or delay registration.
  try {
    const { token, hash } = generateToken();
    await query('INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)', [
      crypto.randomUUID(),
      id,
      hash,
      new Date(Date.now() + 24 * 3_600_000), // 24 hours
    ]);
    const tpl = renderVerifyEmail({ verifyUrl: `${appUrl()}/verify-email?token=${token}` });
    void sendMail({ to: email, ...tpl }).catch((err) => console.warn('[mail] verify send error:', err));
    if (testTokensEnabled()) res.headers.set('x-test-verify-token', token);
  } catch (err) {
    console.warn('[auth] verification email error:', err);
  }
  const welcome = renderWelcomeEmail({ name: (user as User).name, dashboardUrl: `${appUrl()}/dashboard` });
  void sendMail({ to: email, ...welcome }).catch((err) => console.warn('[mail] welcome send error:', err));
  return res;
}
