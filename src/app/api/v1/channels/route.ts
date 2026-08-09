import { NextRequest, NextResponse } from 'next/server';
import { authV1 } from '@/lib/auth';
import { listChannelsDTO } from '@/lib/core';

// Public agent API — authenticate with `Authorization: Bearer pv_...`.

export async function GET(req: NextRequest) {
  const auth = await authV1(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  return NextResponse.json({ channels: await listChannelsDTO(user.id) });
}
