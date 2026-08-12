import { one, type User } from './db';

export type PlanId = 'free' | 'pro';

export interface PlanLimits {
  channels: number;
  postsPerMonth: number;
  aiCaptions: boolean;
  rssFeeds: number;
  storageMB: number;
  label: string;
  price: string;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { channels: 3, postsPerMonth: 30, aiCaptions: false, rssFeeds: 3, storageMB: 250, label: 'Free', price: '$0' },
  pro: { channels: 100, postsPerMonth: 10_000, aiCaptions: true, rssFeeds: 50, storageMB: 25_600, label: 'Pro', price: '$9/mo' },
};

export function planOf(user: Pick<User, 'plan'>): PlanLimits {
  return PLANS[user.plan === 'pro' ? 'pro' : 'free'];
}

export async function channelsUsed(userId: string): Promise<number> {
  const row = await one<{ c: number }>('SELECT COUNT(*)::int AS c FROM channels WHERE user_id = $1', [userId]);
  return row?.c ?? 0;
}

// Scheduled posts created in the current calendar month. Counts any post that
// was given a schedule — including ones already published or failed — so the
// monthly quota can't be bypassed by posts leaving the 'scheduled' status.
// Cumulative media storage used, in bytes. A hard per-plan cap (not just a
// per-hour rate limit) keeps the storage bill bounded per user.
export async function storageUsed(userId: string): Promise<number> {
  const row = await one<{ b: number }>('SELECT COALESCE(SUM(size), 0)::bigint AS b FROM media WHERE user_id = $1', [userId]);
  return Number(row?.b ?? 0);
}

export async function postsThisMonth(userId: string): Promise<number> {
  const row = await one<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM posts
     WHERE user_id = $1 AND scheduled_at IS NOT NULL AND created_at >= date_trunc('month', now())`,
    [userId],
  );
  return row?.c ?? 0;
}
