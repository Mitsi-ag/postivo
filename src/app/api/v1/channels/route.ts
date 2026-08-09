import { NextRequest, NextResponse } from 'next/server';
import { authByApiKey, unauthorized } from '@/lib/auth';
import { listChannelsDTO } from '@/lib/core';

// Public agent API — authenticate with `Authorization: Bearer pv_...`.

export async function GET(req: NextRequest) {
  const user = await authByApiKey(req);
  if (!user) return unauthorized();
  return NextResponse.json({ channels: await listChannelsDTO(user.id) });
}
