import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { one, query } from '@/lib/db';
import type { AnalyticsDTO } from '@/lib/types';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();

  const channels = (await one<{ c: number }>('SELECT COUNT(*)::int AS c FROM channels WHERE user_id = $1', [user.id]))?.c ?? 0;
  const scheduled =
    (await one<{ c: number }>(`SELECT COUNT(*)::int AS c FROM posts WHERE user_id = $1 AND status = 'scheduled'`, [user.id]))
      ?.c ?? 0;
  const failed =
    (
      await one<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM posts p WHERE p.user_id = $1 AND (
           p.status = 'failed' OR EXISTS (SELECT 1 FROM post_targets t WHERE t.post_id = p.id AND t.status = 'failed'))`,
        [user.id],
      )
    )?.c ?? 0;
  const publishedThisWeek =
    (
      await one<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM post_targets t JOIN posts p ON p.id = t.post_id
         WHERE p.user_id = $1 AND t.status = 'published' AND t.published_at >= now() - interval '7 days'`,
        [user.id],
      )
    )?.c ?? 0;

  const byProvider = await query<{ provider: string; count: number }>(
    `SELECT c.provider AS provider, COUNT(*)::int AS count
     FROM post_targets t
     JOIN channels c ON c.id = t.channel_id
     JOIN posts p ON p.id = t.post_id
     WHERE p.user_id = $1 AND t.status = 'published'
     GROUP BY c.provider ORDER BY count DESC`,
    [user.id],
  );

  const dayRows = await query<{ d: string; count: number }>(
    `SELECT to_char(t.published_at, 'YYYY-MM-DD') AS d, COUNT(*)::int AS count
     FROM post_targets t JOIN posts p ON p.id = t.post_id
     WHERE p.user_id = $1 AND t.status = 'published' AND t.published_at >= now() - interval '13 days'
     GROUP BY d`,
    [user.id],
  );
  const byDay = new Map(dayRows.map((r) => [r.d, r.count]));
  const last14Days: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    last14Days.push({ date, count: byDay.get(date) ?? 0 });
  }

  const recentLog = await query<{ id: number; at: string; level: string; message: string }>(
    `SELECT l.id, l.at, l.level, l.message
     FROM publish_log l
     JOIN post_targets t ON t.id = l.target_id
     JOIN posts p ON p.id = t.post_id
     WHERE p.user_id = $1
     ORDER BY l.id DESC LIMIT 20`,
    [user.id],
  );

  const payload: AnalyticsDTO = {
    totals: { channels, scheduled, publishedThisWeek, failed },
    byProvider,
    last14Days,
    recentLog,
  };
  return NextResponse.json(payload);
}
