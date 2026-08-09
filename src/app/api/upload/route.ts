import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { query } from '@/lib/db';
import { putMedia } from '@/lib/storage';

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

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Missing "file" field in multipart form' }, { status: 400 });
  }
  if (!/^(image|video)\//.test(file.type)) {
    return NextResponse.json({ error: 'Only image/* and video/* uploads are allowed' }, { status: 415 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds the 50MB limit' }, { status: 413 });
  }

  const ext =
    EXT_BY_MIME[file.type] ??
    (file.name.includes('.') ? (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin');
  const id = `${crypto.randomUUID()}.${ext || 'bin'}`;
  await putMedia(user.id, id, file.type, buffer);
  await query('INSERT INTO media (id, user_id, mime) VALUES ($1,$2,$3)', [id, user.id, file.type]);

  return NextResponse.json({ id, url: `/api/media/${id}` }, { status: 201 });
}
