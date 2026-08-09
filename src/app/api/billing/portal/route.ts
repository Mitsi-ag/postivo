import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { appUrl, billingEnabled, getStripe } from '@/lib/billing';

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!billingEnabled()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }
  if (!user.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account — subscribe first' }, { status: 400 });
  }
  const session = await getStripe().billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${appUrl()}/settings/billing`,
  });
  return NextResponse.json({ url: session.url });
}
