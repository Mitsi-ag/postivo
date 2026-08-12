import Stripe from 'stripe';

// Stripe billing is fully env-gated: with no STRIPE_SECRET_KEY every billing
// route returns 503 billing_not_configured and the UI hides upgrade buttons.

export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO);
}

// Single source of truth for the app origin (also used by email token flows).
export { appUrl } from './tokens';

const g = globalThis as unknown as { __postivoStripe?: Stripe };

export function getStripe(): Stripe {
  if (!g.__postivoStripe) {
    g.__postivoStripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return g.__postivoStripe;
}
