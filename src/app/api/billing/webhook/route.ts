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
      }
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
