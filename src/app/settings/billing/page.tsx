'use client';

import { useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { BoltIcon, CheckIcon } from '@/components/icons';
import { btnPrimary, cardCls, ErrorBanner } from '@/components/ui';
import { api } from '@/lib/client';
import type { UsageDTO } from '@/lib/types';

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, limit > 0 ? (used / limit) * 100 : 0);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-mut">{label}</span>
        <span className="text-fg">
          {used} / {limit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        <div
          className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-iris'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [usage, setUsage] = useState<UsageDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<UsageDTO>('/api/usage')
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load usage'));
  }, []);

  async function act(path: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ url: string }>(path, { method: 'POST' });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Billing action failed');
      setBusy(false);
    }
  }

  return (
    <Portal title="Billing">
      <div className="mx-auto max-w-2xl space-y-5">
        <ErrorBanner message={error} />

        {/* Current plan */}
        <div className={cardCls}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-mut">Current plan</h2>
              <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-fg">
                {usage ? (
                  usage.plan === 'pro' ? (
                    <>
                      <BoltIcon size={18} className="text-iris" />
                      Pro
                    </>
                  ) : (
                    'Free'
                  )
                ) : (
                  '…'
                )}
              </p>
            </div>
            {usage?.billingEnabled &&
              (usage.plan === 'pro' ? (
                <button onClick={() => act('/api/billing/portal')} disabled={busy} className={btnPrimary}>
                  {busy ? 'Opening…' : 'Manage subscription'}
                </button>
              ) : (
                <button onClick={() => act('/api/billing/checkout')} disabled={busy} className={btnPrimary}>
                  {busy ? 'Opening…' : 'Upgrade to Pro'}
                </button>
              ))}
          </div>
          {usage && !usage.billingEnabled && usage.plan !== 'pro' && (
            <p className="mt-3 text-xs text-dim">
              Billing is not configured on this instance (no Stripe keys) — all plans are self-managed.
            </p>
          )}
        </div>

        {/* Usage meters */}
        <div className={`${cardCls} space-y-4`}>
          <h2 className="text-sm font-medium text-mut">Usage</h2>
          {usage ? (
            <>
              <Meter label="Connected channels" used={usage.channels.used} limit={usage.channels.limit} />
              <Meter
                label="Scheduled posts this month"
                used={usage.postsThisMonth.used}
                limit={usage.postsThisMonth.limit}
              />
              <p className="flex items-center gap-1.5 text-xs text-dim">
                AI captions: {usage.plan === 'pro' ? <><CheckIcon size={12} className="text-ok" /> included</> : 'Pro feature'}
              </p>
            </>
          ) : (
            <p className="text-sm text-dim">Loading…</p>
          )}
        </div>

        {/* Plan comparison */}
        <div className={`${cardCls} grid gap-4 sm:grid-cols-2`}>
          <div>
            <h3 className="font-semibold text-fg">Free</h3>
            <ul className="mt-2 space-y-1 text-sm text-mut">
              <li>3 channels</li>
              <li>30 scheduled posts / month</li>
              <li>No AI captions</li>
            </ul>
          </div>
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-fg">
              <BoltIcon size={14} className="text-iris" />
              Pro — $9/mo
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-mut">
              <li>100 channels</li>
              <li>10,000 scheduled posts / month</li>
              <li>AI caption generation</li>
            </ul>
          </div>
        </div>
      </div>
    </Portal>
  );
}
