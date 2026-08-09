import { expect, type Page } from '@playwright/test';
import pg from 'pg';

// Unique suffix for everything this run creates, so re-runs never collide.
export const RUN = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

// Each API registration uses its own source IP (TEST-NET-2/3) so the suite
// never trips the app's per-IP auth rate limits (10 req / 5 min). The /24 is
// RUN-derived: in-memory limiter buckets live 5 min on the server, so repeated
// runs of the suite must not share them.
const runOctet = (parseInt(RUN.replace('-', '').slice(0, 6), 36) % 250) + 1;
let ipCounter = 0;
export function nextIp(): string {
  ipCounter += 1;
  return `198.51.${runOctet}.${(ipCounter % 250) + 1}`;
}

export interface TestUser {
  email: string;
  password: string;
  name: string;
}

// Registers a user via the API; the session cookie lands in the browser
// context, so subsequent page.goto() calls are authenticated.
export async function registerViaApi(page: Page, tag: string): Promise<TestUser> {
  const user = {
    email: `e2e-${tag}-${RUN}@postivo.dev`,
    password: `e2e-pass-${RUN}`,
    name: `E2E ${tag}`,
  };
  const res = await page.request.post('/api/auth/register', {
    headers: { 'x-forwarded-for': nextIp() },
    data: { name: user.name, email: user.email, password: user.password },
  });
  expect(res.ok(), `register failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  return user;
}

export async function addChannel(
  page: Page,
  provider = 'demo',
  name = 'E2E Demo',
  credentials: Record<string, string> = {},
): Promise<string> {
  const res = await page.request.post('/api/channels', { data: { provider, name, credentials } });
  expect(res.ok(), `addChannel failed: ${await res.text()}`).toBeTruthy();
  const data = (await res.json()) as { channel: { id: string } };
  return data.channel.id;
}

export async function createPost(page: Page, body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await page.request.post('/api/posts', { data: body });
  expect(res.ok(), `createPost failed: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { post: { id: string } }).post;
}

// datetime-local input value, `hoursAgo` in the past.
export function pastLocal(hoursAgo = 1): string {
  const d = new Date(Date.now() - hoursAgo * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ISO timestamp, `minAgo` in the past (immediately due for the scheduler).
export function pastIso(minAgo = 2): string {
  return new Date(Date.now() - minAgo * 60_000).toISOString();
}

// Direct DB access for arranging states the UI can't reach quickly
// (e.g. a permanently failed target without waiting out the retry backoff).
export async function failPostInDb(postId: string, message = 'simulated failure'): Promise<void> {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL ?? 'postgres://postivo:postivo@localhost:5432/postivo',
  });
  await client.connect();
  try {
    await client.query(`UPDATE post_targets SET status = 'failed', error = $1, retry_count = 3 WHERE post_id = $2`, [
      message,
      postId,
    ]);
    await client.query(`UPDATE posts SET status = 'failed', updated_at = now() WHERE id = $1`, [postId]);
  } finally {
    await client.end();
  }
}
