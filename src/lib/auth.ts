import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { DATA_DIR, one, query, type ApiKey, type Session, type User } from './db';
import { clientIp, rateLimit } from './ratelimit';
import type { PublicUser } from './types';

export type { PublicUser };

export const SESSION_COOKIE = 'postivo_session';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

// ---------- passwords ----------

// Async scrypt — the sync variant blocks the event loop for every concurrent
// request during a login burst.
function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt)).toString('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = await scryptAsync(password, salt);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ---------- session tokens ----------

let cachedSecret: string | null = null;

export function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.JWT_SECRET) {
    cachedSecret = process.env.JWT_SECRET;
    return cachedSecret;
  }
  // Multi-instance deployments MUST set JWT_SECRET; the file fallback is only
  // suitable for single-process dev.
  const file = path.join(DATA_DIR, 'jwt_secret');
  try {
    cachedSecret = fs.readFileSync(file, 'utf8').trim();
    if (cachedSecret) return cachedSecret;
  } catch {
    // fall through and generate
  }
  cachedSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  } catch {
    // Read-only filesystem (serverless, some containers): the secret lives for
    // this process only — sessions won't survive a restart. Acceptable for
    // ephemeral dev; production must set JWT_SECRET.
  }
  return cachedSecret;
}

export function createSessionToken(uid: string, jti: string): string {
  const body = Buffer.from(JSON.stringify({ uid, jti, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): { uid: string; jti: string } | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      uid?: string;
      jti?: string;
      exp?: number;
    };
    if (!payload.uid || !payload.jti || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return { uid: payload.uid, jti: payload.jti };
  } catch {
    return null;
  }
}

// ---------- server-side sessions (revocable) ----------

// Every session token carries a jti backed by a row in the sessions table.
// A token is only honored while its row exists, is unrevoked and unexpired —
// so logout / password change / account deletion actually kill sessions.

async function createSession(uid: string): Promise<string> {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query('INSERT INTO sessions (jti, user_id, expires_at) VALUES ($1,$2,$3)', [jti, uid, expiresAt]);
  // Opportunistic cleanup of expired rows (~2% of logins) so the table
  // doesn't grow unbounded.
  if (Math.random() < 0.02) {
    await query('DELETE FROM sessions WHERE expires_at <= now()', []).catch(() => []);
  }
  return createSessionToken(uid, jti);
}

export async function revokeSession(jti: string): Promise<void> {
  await query('UPDATE sessions SET revoked_at = now() WHERE jti = $1 AND revoked_at IS NULL', [jti]);
}

export async function revokeAllSessions(uid: string): Promise<void> {
  await query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [uid]);
}

async function activeSession(jti: string, uid: string): Promise<boolean> {
  const row = await one<Session>('SELECT * FROM sessions WHERE jti = $1 AND user_id = $2', [jti, uid]);
  return !!row && !row.revoked_at && new Date(row.expires_at).getTime() > Date.now();
}

// Behind a TLS-terminating proxy (App Runner) the app sees plain http, so we
// trust x-forwarded-proto to decide whether the Secure flag belongs on the
// session cookie.
function isSecureRequest(req?: NextRequest): boolean {
  if (!req) return false;
  return req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:';
}

export async function attachSession(res: NextResponse, uid: string, req?: NextRequest): Promise<void> {
  res.cookies.set(SESSION_COOKIE, await createSession(uid), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function detachSession(res: NextResponse, req?: NextRequest): void {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: 0,
  });
}

// ---------- request auth ----------

export function publicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    timezone: u.timezone,
    plan: u.plan,
    signature: u.signature ?? '',
    signature_enabled: u.signature_enabled === true,
    outbound_webhook_url: u.outbound_webhook_url ?? null,
    email_verified: !!u.email_verified_at,
    created_at: u.created_at,
  };
}

export async function getSessionUser(req: NextRequest): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = verifySessionToken(token);
  if (!claims) return null;
  if (!(await activeSession(claims.jti, claims.uid))) return null;
  return (await one<User>('SELECT * FROM users WHERE id = $1', [claims.uid])) ?? null;
}

// Public v1 API auth: 120 req/min per key; invalid Bearer tokens are
// throttled per-IP (attacker-controlled key prefixes can't mint fresh
// buckets) so brute-force always hits the same counter.
export async function authV1(req: NextRequest): Promise<User | NextResponse> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(pv_[a-f0-9]{48})$/i);
  const presented = header.match(/^Bearer\s+(\S+)/)?.[1] ?? '';
  const prefix = presented.slice(0, 14) || 'none';
  if (!rateLimit(`v1:${prefix}`, 120, 60_000)) return tooManyRequests();
  const user = match ? await authByApiKey(req) : null;
  if (!user) {
    if (!rateLimit(`v1-invalid:${clientIp(req)}`, 30, 60_000)) return tooManyRequests();
    return unauthorized();
  }
  return user;
}

export async function authByApiKey(req: NextRequest): Promise<User | null> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(pv_[a-f0-9]{48})$/i);
  if (!match) return null;
  const hash = crypto.createHash('sha256').update(match[1]).digest('hex');
  const key = await one<ApiKey>('SELECT * FROM api_keys WHERE key_hash = $1', [hash]);
  if (!key) return null;
  // Touch last_used_at at most once a minute — a write per request is
  // needless WAL churn at 120 req/min/key.
  await query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1 AND (last_used_at IS NULL OR last_used_at <= now() - interval '1 minute')`, [key.id]);
  return (await one<User>('SELECT * FROM users WHERE id = $1', [key.user_id])) ?? null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function tooManyRequests(): NextResponse {
  return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });
}
