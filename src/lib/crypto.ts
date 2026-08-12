// AES-256-GCM encryption for channel credentials at rest.
// Key comes from CREDENTIALS_KEY (32-byte hex); when unset (dev), it is
// derived from the session secret with a distinct info string so the two
// keys are never the same.
// Stored format: "v1:<base64(iv || authTag || ciphertext)>" (jsonb string).
// Legacy plaintext jsonb rows stay readable — decryptChannelCredentials
// falls back transparently, and rows are re-encrypted on their next write.

import crypto from 'node:crypto';
import { getSecret } from './auth';
import type { Channel } from './db';

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = (process.env.CREDENTIALS_KEY ?? '').trim();
  if (hex && !/^[a-f0-9]{64}$/i.test(hex)) {
    // A malformed key must be loud — silently falling back to the session
    // secret would make existing credentials undecryptable after a "fix".
    throw new Error('CREDENTIALS_KEY must be exactly 64 hex characters (32 bytes)');
  }
  cachedKey = hex
    ? Buffer.from(hex, 'hex')
    : crypto.scryptSync(getSecret(), 'postivo-credentials-v1', 32);
  return cachedKey;
}

export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')}`;
}

export function decryptJson<T>(stored: string): T {
  if (!stored.startsWith('v1:')) return JSON.parse(stored) as T; // legacy plaintext
  const raw = Buffer.from(stored.slice(3), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  const data = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  return JSON.parse(data.toString('utf8')) as T;
}

// Read-side helper: encrypted rows decrypt, legacy plaintext rows pass through.
export function decryptChannelCredentials(channel: Pick<Channel, 'credentials'>): Record<string, string> {
  const raw = channel.credentials as unknown;
  if (typeof raw === 'string') {
    try {
      return decryptJson<Record<string, string>>(raw);
    } catch {
      return {};
    }
  }
  return (raw as Record<string, string> | null) ?? {};
}
