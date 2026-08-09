import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { createChannel, listChannelsDTO, type ChannelInput } from '@/lib/core';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  return NextResponse.json({ channels: await listChannelsDTO(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => null)) as ChannelInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const result = await createChannel(user, body);
  if (result.error) {
    return NextResponse.json(
      { error: result.error, ...(result.upgrade ? { upgrade: true } : {}) },
      { status: result.status ?? 400 },
    );
  }
  return NextResponse.json({ channel: result.channel }, { status: 201 });
}
