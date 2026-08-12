import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { billingEnabled, getStripe } from '@/lib/billing';
import { query } from '@/lib/db';

// Stripe webhook endpoint. Reads the RAW body (req.text() — never req.json())
// so the signature can be verified.

export async function POST(req: NextRequest) {
  if (!billingEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 400 },
    );
  }

// Stripe API 2025+ moved period bounds from the subscription root onto
// subscription items — read both so we work across API versions.
function periodEnd(sub: Stripe.Subscription): string | null {
  const s = sub as unknown as {
    current_period_end?: number;
    items?: { data?: { current_period_end?: number }[] };
  };
  const ts = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  if (sub.status === 'active' || sub.status === 'trialing') {
    await query('UPDATE users SET plan = $1, plan_renews_at = $2 WHERE stripe_customer_id = $3', [
      'pro',
      periodEnd(sub),
      customerId,
    ]);
  } else {
    // past_due / unpaid / canceled / incomplete_expired — access ends here.
    await query(`UPDATE users SET plan = 'free', plan_renews_at = NULL WHERE stripe_customer_id = $1`, [customerId]);
  }
}

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      if (userId) {
        await query('UPDATE users SET plan = $1, stripe_customer_id = $2 WHERE id = $3', [
          'pro',
          typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null),
          userId,
        ]);
        // Best-effort: pull the subscription so plan_renews_at is set from day
        // one instead of waiting for the first subscription.updated event.
        if (session.subscription) {
          try {
            const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
            await syncSubscription(await getStripe().subscriptions.retrieve(subId));
          } catch (err) {
            console.warn('[billing] could not retrieve subscription after checkout:', err);
          }
        }
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      await query(`UPDATE users SET plan = 'free', plan_renews_at = NULL WHERE stripe_customer_id = $1`, [customerId]);
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ received: true });
}
