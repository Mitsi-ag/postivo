import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { planOf } from '@/lib/plans';

interface CaptionBody {
  content?: string;
}

function localSuggestions(content: string): string[] {
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      keywords.push(w);
    }
    if (keywords.length >= 6) break;
  }
  const tags = keywords.map((k) => `#${k}`);
  const tagLine = tags.join(' ');
  return [
    `${content}\n\n${tagLine}`.trim(),
    `${content} — what do you think? ${tags.slice(0, 3).join(' ')}`.trim(),
    `🔥 ${content} ${tags.slice(0, 4).join(' ')}`.trim(),
  ];
}

async function openaiSuggestions(content: string): Promise<string[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        messages: [
          {
            role: 'system',
            content:
              'You are a social media copywriter. Return exactly 3 caption variants, one per line, ' +
              'no numbering, no bullet points, no surrounding quotes. Each includes 3-6 relevant hashtags.',
          },
          { role: 'user', content: `Write captions for this post draft:\n\n${content}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    const suggestions = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    return suggestions.length ? suggestions : null;
  } catch {
    return null;
  }
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
  const body = (await req.json().catch(() => null)) as CaptionBody | null;
  const content = (body?.content ?? '').trim();
  if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 });

  const suggestions = (await openaiSuggestions(content)) ?? localSuggestions(content);
  return NextResponse.json({ suggestions });
}
