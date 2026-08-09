'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useRequireAuth } from '@/lib/useRequireAuth';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/compose', label: 'Compose', icon: '✍️' },
  { href: '/calendar', label: 'Calendar', icon: '📅' },
  { href: '/queue', label: 'Queue', icon: '📬' },
  { href: '/library', label: 'Library', icon: '🖼️' },
  { href: '/automation', label: 'Automation', icon: '🤖' },
  { href: '/channels', label: 'Channels', icon: '📡' },
  { href: '/analytics', label: 'Analytics', icon: '📈' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
  { href: '/settings/billing', label: 'Billing', icon: '💳' },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export default function Portal({ title, children }: { title: string; children: React.ReactNode }) {
  const { user, loading } = useRequireAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    document.title = `${title} · Postivo`;
  }, [title]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      router.push('/compose');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b border-slate-800 bg-slate-900/40 p-4 md:w-56 md:border-b-0 md:border-r">
          <Link href="/dashboard" className="mb-2 block px-2 text-xl font-bold text-white md:mb-6">
            ⚡ Postivo
          </Link>
          <nav aria-label="Main" className="flex flex-1 gap-1 overflow-x-auto md:flex-col md:gap-0 md:space-y-1 md:overflow-visible">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
                    active
                      ? 'bg-indigo-600/20 font-medium text-indigo-300'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden px-2 pt-4 text-xs text-slate-600 md:block">
            One process. One file. MIT.
            <br />
            Press <kbd className="rounded border border-slate-700 bg-slate-800 px-1 text-[10px] text-slate-400">c</kbd> to compose.
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 md:px-6">
            <h1 className="shrink-0 text-lg font-semibold text-white">{title}</h1>
            <div className="flex min-w-0 items-center gap-3 text-sm">
              <span className="truncate text-slate-400">
                {user.name}
                <span className="hidden sm:inline">
                  {' '}
                  <span className="text-slate-600">·</span> {user.email}
                </span>
              </span>
              <button onClick={logout} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60">
                Log out
              </button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
