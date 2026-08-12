// Screenshot every Postivo screen (desktop + key mobile) for UI/UX review.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3220';
const OUT = '/tmp/postivo-screens';
fs.mkdirSync(OUT, { recursive: true });

const RUN = Date.now().toString(36);
const browser = await chromium.launch();

// --- public screens ---
const pub = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const [name, path] of [
  ['landing', '/'],
  ['login', '/login'],
  ['register', '/register'],
  ['forgot-password', '/forgot-password'],
  ['reset-password', '/reset-password?token=abc'],
  ['verify-email', '/verify-email?token=abc'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
  ['support', '/support'],
]) {
  await pub.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await pub.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('shot', name);
}

// --- authenticated screens (with seeded data) ---
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const reg = await page.request.post(`${BASE}/api/auth/register`, {
  data: { name: 'Review User', email: `review-${RUN}@postivo.dev`, password: 'review-pass-1234' },
});
if (!reg.ok()) throw new Error(`register failed: ${await reg.text()}`);

// Seed: demo channel, a scheduled post, a published one, a failed one, media, a set, a feed.
const chRes = await page.request.post(`${BASE}/api/channels`, { data: { provider: 'demo', name: 'Demo HQ', credentials: {} } });
const ch = (await chRes.json()).channel.id;
const future = new Date(Date.now() + 2 * 86400e3).toISOString();
const past = new Date(Date.now() - 3600e3).toISOString();
await page.request.post(`${BASE}/api/posts`, { data: { content: 'Launch day is here 🚀 Big things shipping.', scheduled_at: future, channelIds: [ch], tags: ['launch'] } });
const pubPost = await page.request.post(`${BASE}/api/posts`, { data: { content: 'Shipped: 18 providers, signed media, and more.', scheduled_at: past, channelIds: [ch], tags: ['changelog'] } });
const pubId = (await pubPost.json()).post.id;
// let the scheduler publish the past-due one (demo provider always succeeds)
await page.waitForTimeout(40_000);
const failPost = await page.request.post(`${BASE}/api/posts`, { data: { content: 'This one is stuck', scheduled_at: future, channelIds: [ch] } });
const failId = (await failPost.json()).post.id;
// simulate a failed target directly via DB is not available here; use webhook channel with dead URL instead
const whRes = await page.request.post(`${BASE}/api/channels`, { data: { provider: 'webhook', name: 'Dead Hook', credentials: { url: 'https://localhost:9/dead' } } });
if (whRes.ok()) {
  const wh = (await whRes.json()).channel.id;
  await page.request.post(`${BASE}/api/posts`, { data: { content: 'Will fail fast', scheduled_at: past, channelIds: [wh] } });
}
await page.request.post(`${BASE}/api/sets`, { data: { name: 'Main set', channelIds: [ch] } });
// upload one tiny media for the library
await page.request.post(`${BASE}/api/upload`, { multipart: { file: { name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0d0000000d494844520000000100000001080600000 01f15c4890000000d4944415478da63fcffff3f030005fe02fea72d994d0000000049454e44ae426082'.replace(/\s/g, ''), 'hex') } } });

for (const [name, path] of [
  ['onboarding', '/onboarding'],
  ['dashboard', '/dashboard'],
  ['compose', '/compose'],
  ['calendar', '/calendar'],
  ['queue', '/queue'],
  ['queue-failed', '/queue?tab=failed'],
  ['library', '/library'],
  ['automation', '/automation'],
  ['channels', '/channels'],
  ['analytics', '/analytics'],
  ['settings', '/settings'],
  ['settings-billing', '/settings/billing'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('shot', name);
}

// compose with content typed (the flagship screen in action)
await page.goto(`${BASE}/compose`, { waitUntil: 'networkidle' });
await page.locator('#compose-content').fill('Reviewing the composer with real content, tags and a channel selected.');
await page.locator(`text=Demo HQ`).first().click().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/compose-filled.png`, fullPage: true });

// --- mobile viewport pass on key screens ---
const mob = await ctx.newPage();
await mob.setViewportSize({ width: 390, height: 844 });
for (const [name, path] of [['m-landing', '/'], ['m-dashboard', '/dashboard'], ['m-compose', '/compose'], ['m-queue', '/queue']]) {
  await mob.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await mob.waitForTimeout(600);
  await mob.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('shot', name);
}

await browser.close();
console.log('DONE', fs.readdirSync(OUT).length, 'screenshots');
