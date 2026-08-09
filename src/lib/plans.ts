import { one, type User } from './db';

export type PlanId = 'free' | 'pro';

export interface PlanLimits {
  channels: number;
  postsPerMonth: number;
  aiCaptions: boolean;
  label: string;
  price: string;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { channels: 3, postsPerMonth: 30, aiCaptions: false, label: 'Free', price: '$0' },
  pro: { channels: 100, postsPerMonth: 10_000, aiCaptions: true, label: 'Pro', price: '$12/mo' },
};

export function planOf(user: Pick<User, 'plan'>): PlanLimits {
  return PLANS[user.plan === 'pro' ? 'pro' : 'free'];
}

export async function channelsUsed(userId: string): Promise<number> {
  const row = await one<{ c: number }>('SELECT COUNT(*)::int AS c FROM channels WHERE user_id = $1', [userId]);
  return row?.c ?? 0;
}

// Scheduled posts created in the current calendar month.
export async function postsThisMonth(userId: string): Promise<number> {
  const row = await one<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM posts
     WHERE user_id = $1 AND status = 'scheduled' AND created_at >= date_trunc('month', now())`,
    [userId],
  );
  return row?.c ?? 0;
}
