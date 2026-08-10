import crypto from 'node:crypto';

// Shared helpers for token-based email flows (password reset, verification).

export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

// Test-only hook: with emails stubbed (EMAIL_ENABLED off) e2e tests can't
// learn the raw token from an inbox, so token-issuing endpoints expose it in a
// response header — ONLY outside production and ONLY when explicitly armed.
export function testTokensEnabled(): boolean {
  return process.env.E2E_TOKENS === '1' && process.env.NODE_ENV !== 'production';
}

export function generateToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
