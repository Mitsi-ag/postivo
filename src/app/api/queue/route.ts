import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { listPosts } from '@/lib/core';

const TABS: Record<string, string> = {
  scheduled: 'scheduled',
  published: 'published',
  failed: 'failed',
  drafts: 'draft',
};

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const tab = req.nextUrl.searchParams.get('tab') ?? 'scheduled';
  const status = TABS[tab];
  if (!status) return NextResponse.json({ error: `Unknown tab "${tab}"` }, { status: 400 });
  return NextResponse.json({ posts: await listPosts(user.id, status) });
}
