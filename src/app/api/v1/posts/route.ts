import { NextRequest, NextResponse } from 'next/server';
import { authByApiKey, unauthorized } from '@/lib/auth';
import { createPost, listPosts, type PostInput } from '@/lib/core';

// Public agent API — authenticate with `Authorization: Bearer pv_...`
// (create keys under Settings → API keys).

export async function GET(req: NextRequest) {
  const user = await authByApiKey(req);
  if (!user) return unauthorized();
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  return NextResponse.json({ posts: await listPosts(user.id, status) });
}

export async function POST(req: NextRequest) {
  const user = await authByApiKey(req);
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
