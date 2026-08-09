import { NextRequest, NextResponse } from 'next/server';
import { authV1 } from '@/lib/auth';
import { deletePost, getPostDTO } from '@/lib/core';

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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authV1(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  const { id } = await params;
  if (!(await deletePost(user.id, id))) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
