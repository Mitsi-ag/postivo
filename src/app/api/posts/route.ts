import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { createPost, listPosts, type PostInput } from '@/lib/core';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const tag = req.nextUrl.searchParams.get('tag') ?? undefined;
  return NextResponse.json({ posts: await listPosts(user.id, { status, tag }) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => null)) as PostInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const result = await createPost(user, body);
  if (result.error) {
    return NextResponse.json(
      { error: result.error, ...(result.upgrade ? { upgrade: true } : {}) },
      { status: result.status ?? 400 },
    );
  }
  return NextResponse.json({ post: result.post }, { status: 201 });
}
