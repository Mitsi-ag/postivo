import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { captionSuggestions } from '@/lib/ai';
import { planOf } from '@/lib/plans';
import { rateLimit } from '@/lib/ratelimit';

interface CaptionBody {
  content?: string;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!planOf(user).aiCaptions) {
    return NextResponse.json(
      { error: 'AI captions are a Pro feature — upgrade to use them.', upgrade: true },
      { status: 402 },
    );
  }
  // Cost guard: 10 per minute + 50 per day per user.
  if (!rateLimit(`caption-min:${user.id}`, 10, 60_000) || !rateLimit(`caption-day:${user.id}`, 50, 24 * 60 * 60_000)) {
    return NextResponse.json({ error: 'Caption limit reached — try again later' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as CaptionBody | null;
  const content = (body?.content ?? '').trim();
  if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 });

  return NextResponse.json({ suggestions: await captionSuggestions(content) });
}
