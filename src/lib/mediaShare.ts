import crypto from 'node:crypto';
import { getSecret } from './auth';
import { appUrl } from './tokens';

// Signed, expiring media URLs for outbound publishing.
//
// Providers (Pinterest, webhooks, …) fetch attached media from us at publish
// time, but they can't hold a session cookie — so the scheduler hands them an
// absolute URL carrying an HMAC signature over `<id>:<expiry>` instead. The
// signature is timing-safe to verify and expires, so a leaked link has a
// bounded lifetime. Owner session access (the portal) is unaffected.

export const MEDIA_SHARE_TTL_MS = 24 * 3_600_000; // 24h — covers the full retry ladder

export function mediaSignature(id: string, expiresAtMs: number): string {
  return crypto.createHmac('sha256', getSecret()).update(`media:${id}:${expiresAtMs}`).digest('base64url');
}

export function signedMediaUrl(id: string, ttlMs: number = MEDIA_SHARE_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const sig = mediaSignature(id, exp);
  return `${appUrl()}/api/media/${encodeURIComponent(id)}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

export function verifyMediaSignature(id: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  // Expiry must be sane — a token minted with a far-future exp would never die.
  if (exp > Date.now() + MEDIA_SHARE_TTL_MS + 60_000) return false;
  const expected = mediaSignature(id, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
