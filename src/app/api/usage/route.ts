import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { billingEnabled } from '@/lib/billing';
import { channelsUsed, planOf, postsThisMonth } from '@/lib/plans';
import type { UsageDTO } from '@/lib/types';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const plan = planOf(user);
  const payload: UsageDTO = {
    plan: user.plan === 'pro' ? 'pro' : 'free',
    channels: { used: await channelsUsed(user.id), limit: plan.channels },
    postsThisMonth: { used: await postsThisMonth(user.id), limit: plan.postsPerMonth },
    billingEnabled: billingEnabled(),
  };
  return NextResponse.json(payload);
}
