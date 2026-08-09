import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { query, type Channel, type PostTarget } from '@/lib/db';
import { getProvider } from '@/lib/providers/registry';
import { rateLimit } from '@/lib/ratelimit';

interface TargetWithChannel extends PostTarget {
  provider: string;
  credentials: Record<string, string>;
}

// Pull engagement stats for published targets from providers that support it.
// Rate-limited to 1 call/minute per user.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!rateLimit(`analytics-refresh:${user.id}`, 1, 60_000)) {
    return NextResponse.json({ error: 'Analytics refresh is limited to once per minute' }, { status: 429 });
  }

  const targets = await query<TargetWithChannel>(
    `SELECT t.*, c.provider AS provider, c.credentials AS credentials
     FROM post_targets t
     JOIN channels c ON c.id = t.channel_id
     JOIN posts p ON p.id = t.post_id
     WHERE p.user_id = $1 AND t.status = 'published' AND t.external_id IS NOT NULL
     ORDER BY t.published_at DESC LIMIT 100`,
    [user.id],
  );

  let updated = 0;
  for (const t of targets) {
    const provider = getProvider(t.provider);
    if (!provider?.stats) continue;
    try {
      const channel = { id: t.channel_id, credentials: t.credentials ?? {} } as Channel;
      const stats = await provider.stats(channel, t.external_id as string);
      if (stats) {
        await query('UPDATE post_targets SET stats = $1 WHERE id = $2', [JSON.stringify(stats), t.id]);
        updated++;
      }
    } catch (err) {
      console.warn(`[postivo] stats refresh failed for target ${t.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ ok: true, updated, considered: targets.length });
}
