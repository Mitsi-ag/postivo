import { NextRequest, NextResponse } from 'next/server';
import { authV1 } from '@/lib/auth';
import { createPost, listPosts, type PostInput } from '@/lib/core';

// Public agent API — authenticate with `Authorization: Bearer pv_...`
// (create keys under Settings → API keys).

export async function GET(req: NextRequest) {
  const auth = await authV1(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  const sp = req.nextUrl.searchParams;
  return NextResponse.json({
    posts: await listPosts(user.id, {
      status: sp.get('status') ?? undefined,
      tag: sp.get('tag') ?? undefined,
      start: sp.get('start') ?? undefined,
      end: sp.get('end') ?? undefined,
    }),
  });
}

export async function POST(req: NextRequest) {
  const auth = await authV1(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
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
