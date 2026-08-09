import fs from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DATA_DIR } from './db';

// Media storage: S3 in production (S3_BUCKET set), local disk in dev.
// Object keys are `uploads/<userId>/<id>.<ext>`; metadata (owner, mime) lives
// in the `media` table so reads can be owner-checked.

const BUCKET = process.env.S3_BUCKET ?? '';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

const g = globalThis as unknown as { __postivoS3?: S3Client };

function s3(): S3Client {
  if (!g.__postivoS3) g.__postivoS3 = new S3Client({ region: REGION });
  return g.__postivoS3;
}

export function s3Enabled(): boolean {
  return BUCKET.length > 0;
}

export async function putMedia(userId: string, id: string, mime: string, data: Buffer): Promise<void> {
  if (!s3Enabled()) {
    fs.writeFileSync(path.join(DATA_DIR, 'uploads', id), data);
    return;
  }
  await s3().send(
    new PutObjectCommand({ Bucket: BUCKET, Key: `uploads/${userId}/${id}`, Body: data, ContentType: mime }),
  );
}

export interface MediaObject {
  body: Buffer;
  contentType: string;
}

export async function getMedia(userId: string, id: string): Promise<MediaObject | null> {
  if (!s3Enabled()) {
    const filePath = path.join(DATA_DIR, 'uploads', id);
    if (!fs.existsSync(filePath)) return null;
    return { body: fs.readFileSync(filePath), contentType: '' };
  }
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: `uploads/${userId}/${id}` }));
    const body = Buffer.from(await res.Body!.transformToByteArray());
    return { body, contentType: res.ContentType ?? '' };
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null;
    throw err;
  }
}
