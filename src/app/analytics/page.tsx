'use client';

import { useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { cardCls, ErrorBanner } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { AnalyticsDTO } from '@/lib/types';

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AnalyticsDTO>('/api/analytics')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analytics'));
  }, []);

  const maxProvider = Math.max(1, ...(data?.byProvider.map((p) => p.count) ?? [1]));
  const maxDay = Math.max(1, ...(data?.last14Days.map((d) => d.count) ?? [1]));

  return (
    <Portal title="Analytics">
      <div className="mx-auto max-w-4xl space-y-6">
        <ErrorBanner message={error} />
        {!data ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Channels', value: data.totals.channels },
                { label: 'Scheduled', value: data.totals.scheduled },
                { label: 'Published this week', value: data.totals.publishedThisWeek },
                { label: 'Failed', value: data.totals.failed },
              ].map((s) => (
                <div key={s.label} className={cardCls}>
                  <div className="text-3xl font-bold text-white">{s.value}</div>
                  <div className="mt-1 text-xs text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className={cardCls}>
                <h2 className="mb-4 font-semibold text-white">Published by provider</h2>
                {data.byProvider.length === 0 ? (
                  <p className="text-sm text-slate-500">No published posts yet.</p>
                ) : (
                  <div className="space-y-3">
                    {data.byProvider.map((p) => (
                      <div key={p.provider}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-slate-300">{p.provider}</span>
                          <span className="text-slate-500">{p.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800">
                          <div
                            className="h-2 rounded-full bg-indigo-500"
                            style={{ width: `${(p.count / maxProvider) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={cardCls}>
                <h2 className="mb-4 font-semibold text-white">Publishes — last 14 days</h2>
                <div className="flex h-32 items-end gap-1.5">
                  {data.last14Days.map((d) => (
                    <div key={d.date} className="group flex flex-1 flex-col items-center justify-end">
                      <span className="mb-1 text-[10px] text-slate-500 opacity-0 group-hover:opacity-100">
                        {d.count}
                      </span>
                      <div
                        className="w-full rounded-t bg-indigo-500/80"
                        style={{ height: `${Math.max(d.count > 0 ? 6 : 2, (d.count / maxDay) * 100)}%` }}
                        title={`${d.date}: ${d.count}`}
                      />
                      <span className="mt-1 text-[9px] text-slate-600">{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={cardCls}>
              <h2 className="mb-4 font-semibold text-white">Recent publish activity</h2>
              {data.recentLog.length === 0 ? (
                <p className="text-sm text-slate-500">No activity yet.</p>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {data.recentLog.map((l) => (
                    <li key={l.id} className="flex items-start gap-3 py-2.5 text-xs">
                      <span
                        className={`mt-0.5 inline-block w-14 shrink-0 rounded-full border px-2 py-0.5 text-center font-medium ${
                          l.level === 'error'
                            ? 'border-red-800 bg-red-950 text-red-300'
                            : l.level === 'warn'
                              ? 'border-amber-800 bg-amber-950 text-amber-300'
                              : 'border-slate-700 bg-slate-800 text-slate-300'
                        }`}
                      >
                        {l.level}
                      </span>
                      <span className="flex-1 text-slate-300">{l.message}</span>
                      <span className="shrink-0 text-slate-600">{formatDate(l.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Portal>
  );
}
