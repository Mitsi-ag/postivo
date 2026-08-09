import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { appUrl, billingEnabled, getStripe } from '@/lib/billing';

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!billingEnabled()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_PRO!, quantity: 1 }],
    customer_email: user.email,
    metadata: { user_id: user.id },
    success_url: `${appUrl()}/settings/billing?upgraded=1`,
    cancel_url: `${appUrl()}/settings/billing`,
  });
  return NextResponse.json({ url: session.url });
}
