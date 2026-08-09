import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { query } from '@/lib/db';
import { putMedia } from '@/lib/storage';
import { guardedFetch } from '@/lib/ssrf';

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
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength === 0) return NextResponse.json({ error: 'URL returned an empty body' }, { status: 400 });
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Remote file exceeds the 50MB limit' }, { status: 413 });
  }

  const urlName = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').replace(/[^\w.-]/g, '').slice(0, 300);
  const ext = EXT_BY_MIME[mime] ?? (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '');
  const id = `${crypto.randomUUID()}.${ext || 'bin'}`;
  await putMedia(user.id, id, mime, buffer);
  await query('INSERT INTO media (id, user_id, mime, name, size) VALUES ($1,$2,$3,$4,$5)', [
    id,
    user.id,
    mime,
    urlName || id,
    buffer.byteLength,
  ]);

  return NextResponse.json({ id, url: `/api/media/${id}` }, { status: 201 });
}
