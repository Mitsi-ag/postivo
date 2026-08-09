import { NextRequest, NextResponse } from 'next/server';
import { detachSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  detachSession(res, req);
  return res;
}
