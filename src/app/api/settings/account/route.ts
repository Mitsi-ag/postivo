import { NextRequest, NextResponse } from 'next/server';
import { detachSession, getSessionUser, unauthorized, verifyPassword } from '@/lib/auth';
import { query, withTransaction, type MediaItem } from '@/lib/db';
import { deleteMedia } from '@/lib/storage';
import { rateLimit } from '@/lib/ratelimit';
import { billingEnabled, getStripe } from '@/lib/billing';

interface DeleteBody {
  password?: string;
}

// GDPR right to erasure: password re-auth, best-effort media object cleanup,
// then explicit deletion of every row the user owns (no FK cascades exist).
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!rateLimit(`delete-account:${user.id}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as DeleteBody | null;
  if (!body?.password || !(await verifyPassword(body.password, user.password_hash))) {
    return NextResponse.json({ error: 'Password is incorrect' }, { status: 403 });
  }

  // Cancel Stripe billing FIRST — erasing the account while a subscription
  // stays active would keep charging a user who can no longer reach the
  // billing portal. Best-effort: a Stripe outage must not block erasure.
  if (user.stripe_customer_id && billingEnabled()) {
    try {
      const stripe = getStripe();
      for (const status of ['active', 'trialing', 'past_due'] as const) {
        const subs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, status });
        for (const s of subs.data) {
          await stripe.subscriptions.cancel(s.id);
        }
      }
    } catch (err) {
      console.error(`[postivo] account deletion: could not cancel Stripe subscriptions for ${user.stripe_customer_id}:`, err);
    }
  }

  // Media files first (S3 or local disk), best-effort — row deletion below is
  // the source of truth.
  const media = await query<MediaItem>('SELECT * FROM media WHERE user_id = $1', [user.id]);
  for (const m of media) {
    await deleteMedia(user.id, m.id).catch(() => {});
  }

  await withTransaction(async (q) => {
    await q(
      'DELETE FROM publish_log WHERE target_id IN (SELECT t.id FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE p.user_id = $1)',
      [user.id],
    );
    await q(
      'DELETE FROM post_targets_comments WHERE target_id IN (SELECT t.id FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE p.user_id = $1)',
      [user.id],
    );
    await q('DELETE FROM post_targets WHERE post_id IN (SELECT id FROM posts WHERE user_id = $1)', [user.id]);
    await q('DELETE FROM posts WHERE user_id = $1', [user.id]);
    await q('DELETE FROM channels WHERE user_id = $1', [user.id]);
    await q('DELETE FROM api_keys WHERE user_id = $1', [user.id]);
    await q('DELETE FROM sessions WHERE user_id = $1', [user.id]);
    await q('DELETE FROM rss_feeds WHERE user_id = $1', [user.id]);
    await q('DELETE FROM sets WHERE user_id = $1', [user.id]);
    await q('DELETE FROM media WHERE user_id = $1', [user.id]);
    await q('DELETE FROM password_resets WHERE user_id = $1', [user.id]);
    await q('DELETE FROM email_verifications WHERE user_id = $1', [user.id]);
    await q('DELETE FROM users WHERE id = $1', [user.id]);
  });

  const res = NextResponse.json({ ok: true });
  detachSession(res, req);
  return res;
}
