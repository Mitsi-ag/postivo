import { NextRequest, NextResponse } from 'next/server';
import { authV1 } from '@/lib/auth';
import { deletePost, getPostDTO, updatePost, type UpdatePostInput } from '@/lib/core';

// Public agent API — authenticate with `Authorization: Bearer pv_...`.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authV1(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  const { id } = await params;
  const post = await getPostDTO(id, user.id);
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  return NextResponse.json({ post });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authV1(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as UpdatePostInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const result = await updatePost(user.id, id, body);
  if (result.error) {
    return NextResponse.json({ error: result.error, upgrade: result.upgrade ?? false }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ post: result.post });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authV1(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  const { id } = await params;
  const result = await deletePost(user.id, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  return NextResponse.json({ ok: true });
}
