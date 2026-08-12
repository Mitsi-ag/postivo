import { NextRequest, NextResponse } from 'next/server';
import { attachSession, getSessionUser, hashPassword, revokeAllSessions, unauthorized, verifyPassword } from '@/lib/auth';
import { query } from '@/lib/db';

interface PasswordBody {
  current?: string;
  next?: string;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => null)) as PasswordBody | null;
  if (!body?.current || !body.next) {
    return NextResponse.json({ error: 'current and next passwords are required' }, { status: 400 });
  }
  if (!(await verifyPassword(body.current, user.password_hash))) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
  }
  if (body.next.length < 8 || body.next.length > 256) {
    return NextResponse.json({ error: 'New password must be between 8 and 256 characters' }, { status: 400 });
  }
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(body.next), user.id]);
  // A password change kills every existing session (stolen cookies included),
  // then issues a fresh one so the changer stays logged in.
  await revokeAllSessions(user.id);
  const res = NextResponse.json({ ok: true });
  await attachSession(res, user.id, req);
  return res;
}
