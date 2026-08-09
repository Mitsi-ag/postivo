import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { DATA_DIR, one, query, type ApiKey, type User } from './db';
import type { PublicUser } from './types';

export type { PublicUser };

export const SESSION_COOKIE = 'postivo_session';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

// ---------- passwords ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ---------- session tokens ----------

let cachedSecret: string | null = null;

function getSecret(): string {
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
  fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  return cachedSecret;
}

export function createSessionToken(uid: string): string {
  const body = Buffer.from(JSON.stringify({ uid, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { uid?: string; exp?: number };
    if (!payload.uid || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export function attachSession(res: NextResponse, uid: string): void {
  res.cookies.set(SESSION_COOKIE, createSessionToken(uid), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function detachSession(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
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
    created_at: u.created_at,
  };
}

export async function getSessionUser(req: NextRequest): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const uid = verifySessionToken(token);
  if (!uid) return null;
  return (await one<User>('SELECT * FROM users WHERE id = $1', [uid])) ?? null;
}

export async function authByApiKey(req: NextRequest): Promise<User | null> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(pv_[a-f0-9]{48})$/i);
  if (!match) return null;
  const hash = crypto.createHash('sha256').update(match[1]).digest('hex');
  const key = await one<ApiKey>('SELECT * FROM api_keys WHERE key_hash = $1', [hash]);
  if (!key) return null;
  await query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [key.id]);
  return (await one<User>('SELECT * FROM users WHERE id = $1', [key.user_id])) ?? null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
