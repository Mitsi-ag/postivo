'use client';

import { useEffect, useMemo, useState } from 'react';
import Portal from '@/components/Portal';
import { Badge, cardCls, ErrorBanner } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { PostDTO } from '@/lib/types';

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DOT_COLOR: Record<string, string> = {
  scheduled: 'bg-indigo-400',
  published: 'bg-emerald-400',
  failed: 'bg-red-400',
  draft: 'bg-slate-500',
};

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ posts: PostDTO[] }>('/api/posts')
      .then((d) => setPosts(d.posts))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load posts'));
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, PostDTO[]>();
    for (const p of posts) {
      const iso = p.scheduled_at ?? p.created_at;
      const key = dayKey(new Date(iso));
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [posts]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const selectedPosts = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  function shift(delta: number) {
    setCursor(new Date(year, month + delta, 1));
    setSelectedDay(null);
  }

  return (
    <Portal title="Calendar">
      <div className="mx-auto max-w-5xl space-y-5">
        <ErrorBanner message={error} />
        <div className={cardCls}>
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => shift(-1)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
              ← Prev
            </button>
            <h2 className="text-lg font-semibold text-white">{monthLabel}</h2>
            <button onClick={() => shift(1)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
              Next →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} className="min-h-20 rounded-lg" />;
              const key = dayKey(new Date(year, month, day));
              const dayPosts = byDay.get(key) ?? [];
              const active = selectedDay === key;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(active ? null : key)}
                  className={`min-h-20 rounded-lg border p-1.5 text-left align-top transition ${
                    active
                      ? 'border-indigo-500 bg-indigo-950/40'
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'
                  }`}
                >
                  <span className="text-xs text-slate-400">{day}</span>
                  <div className="mt-1 space-y-1">
                    {dayPosts.slice(0, 3).map((p) => (
                      <div key={p.id} className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLOR[p.status] ?? DOT_COLOR.draft}`} />
                        <span className="truncate text-[10px] text-slate-400">{p.content || '(media)'}</span>
                      </div>
                    ))}
                    {dayPosts.length > 3 && (
                      <div className="text-[10px] text-slate-500">+{dayPosts.length - 3} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedDay && (
          <div className={cardCls}>
            <h3 className="mb-3 font-semibold text-white">
              {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
            {selectedPosts.length === 0 ? (
              <p className="text-sm text-slate-500">No posts on this day.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {selectedPosts.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200">{p.content || '(media only)'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(p.scheduled_at ?? p.created_at)} ·{' '}
                        {p.targets.map((t) => t.channel_name ?? t.provider).join(', ') || 'no channels'}
                      </p>
                    </div>
                    <Badge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Portal>
  );
}
