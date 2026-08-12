// AI caption helper shared by /api/ai/caption and the RSS auto-poster.
// Uses OpenAI when configured, otherwise falls back to deterministic local
// hashtag-based variants.

export function localCaptionSuggestions(content: string): string[] {
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

export async function openaiCaptionSuggestions(content: string): Promise<string[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      // A stalled LLM provider must not hang the scheduler's RSS phase.
      signal: AbortSignal.timeout(30_000),
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

export async function captionSuggestions(content: string): Promise<string[]> {
  return (await openaiCaptionSuggestions(content)) ?? localCaptionSuggestions(content);
}

// Single best caption — used by RSS auto-posting.
export async function generateCaption(content: string): Promise<string> {
  const suggestions = await captionSuggestions(content);
  return suggestions[0] ?? content;
}
