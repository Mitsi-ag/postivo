import { NextRequest, NextResponse } from 'next/server';
import { detachSession, revokeSession, SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // Revoke the server-side session so a copied cookie dies immediately.
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (claims) await revokeSession(claims.jti);
  const res = NextResponse.json({ ok: true });
  detachSession(res, req);
  return res;
}
