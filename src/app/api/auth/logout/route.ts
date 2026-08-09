import { NextResponse } from 'next/server';
import { detachSession } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  detachSession(res);
  return res;
}
