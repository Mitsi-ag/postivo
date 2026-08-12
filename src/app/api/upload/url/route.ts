import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { query } from '@/lib/db';
import { putMedia, deleteMedia } from '@/lib/storage';
import { BodyTooLargeError, guardedFetch, readBodyCapped } from '@/lib/ssrf';
import { rateLimit } from '@/lib/ratelimit';
import { planOf, storageUsed } from '@/lib/plans';

const MAX_BYTES = 50 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

// Import media by URL: fetch server-side, validate, store like a normal upload.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!rateLimit(`upload-url:${user.id}`, 20, 60 * 60_000)) {
    return NextResponse.json({ error: 'URL import limit reached — try again later' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const url = (body?.url ?? '').trim();
  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'url must be an http(s) URL' }, { status: 400 });
  }

  let res: Response;
  try {
    res = await guardedFetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    return NextResponse.json({ error: `Could not fetch URL: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: `URL responded ${res.status}` }, { status: 502 });

  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!/^(image|video)\//.test(mime)) {
    return NextResponse.json({ error: `URL is not an image or video (content-type: ${mime || 'unknown'})` }, { status: 415 });
  }
  let buffer: Buffer;
  try {
    // Streamed with a hard byte cap — aborts instead of buffering a giant body.
    buffer = await readBodyCapped(res, MAX_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return NextResponse.json({ error: 'Remote file exceeds the 50MB limit' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Could not download the remote file' }, { status: 502 });
  }
  if (buffer.byteLength === 0) return NextResponse.json({ error: 'URL returned an empty body' }, { status: 400 });
  // Cumulative per-plan storage quota (same rule as multipart uploads).
  const storageLimit = planOf(user).storageMB * 1024 * 1024;
  const storageNow = await storageUsed(user.id);
  if (storageNow + buffer.byteLength > storageLimit) {
    return NextResponse.json(
      { error: `Storage full — your plan includes ${planOf(user).storageMB}MB of media. Delete some files or upgrade.`, upgrade: true },
      { status: 402 },
    );
  }

  const urlName = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').replace(/[^\w.-]/g, '').slice(0, 300);
  const ext = EXT_BY_MIME[mime] ?? (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '');
  const id = `${crypto.randomUUID()}.${ext || 'bin'}`;
  await putMedia(user.id, id, mime, buffer);
  try {
    await query('INSERT INTO media (id, user_id, mime, name, size) VALUES ($1,$2,$3,$4,$5)', [
      id,
      user.id,
      mime,
      urlName || id,
      buffer.byteLength,
    ]);
  } catch (err) {
    // Compensate: an untracked object would sit in storage quota-free forever.
    await deleteMedia(user.id, id).catch(() => {});
    throw err;
  }

  return NextResponse.json({ id, url: `/api/media/${id}` }, { status: 201 });
}
