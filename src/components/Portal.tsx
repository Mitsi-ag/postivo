'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useRequireAuth } from '@/lib/useRequireAuth';
import {
  BoltIcon,
  CalendarIcon,
  CardIcon,
  ChartIcon,
  GearIcon,
  GridIcon,
  ImageIcon,
  PenIcon,
  PlugIcon,
  StackIcon,
  Wordmark,
} from '@/components/icons';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', Icon: GridIcon },
  { href: '/compose', label: 'Compose', Icon: PenIcon },
  { href: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  { href: '/queue', label: 'Queue', Icon: StackIcon },
  { href: '/library', label: 'Library', Icon: ImageIcon },
  { href: '/automation', label: 'Automation', Icon: BoltIcon },
  { href: '/channels', label: 'Channels', Icon: PlugIcon },
  { href: '/analytics', label: 'Analytics', Icon: ChartIcon },
  { href: '/settings', label: 'Settings', Icon: GearIcon },
  { href: '/settings/billing', label: 'Billing', Icon: CardIcon },
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
        <div className="font-mono text-xs tracking-widest text-dim uppercase">Loading…</div>
      </div>
    );
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-line bg-surface/40 px-3 py-3 md:w-60 md:border-b-0 md:border-r md:px-4 md:py-5">
        <Link href="/dashboard" className="mb-2 block px-2 md:mb-7">
          <Wordmark />
        </Link>
        <nav
          aria-label="Main"
          className="flex flex-1 gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible"
        >
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/50 ${
                  active ? 'bg-iris/10 font-medium text-fg' : 'text-mut hover:bg-raised/60 hover:text-fg'
                }`}
              >
                {/* Active: iris edge indicator */}
                <span
                  aria-hidden
                  className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-iris transition-opacity ${
                    active ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <Icon
                  size={15}
                  className={`shrink-0 transition-colors ${active ? 'text-iris-soft' : 'text-dim group-hover:text-mut'}`}
                />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t border-line px-2 pt-4 font-mono text-[10px] leading-relaxed tracking-wide text-dim md:block">
          ONE PROCESS · ONE FILE · MIT
          <br />
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-line bg-raised px-1 py-px text-[10px] text-mut">c</kbd>
            to compose
          </span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-ink/85 px-4 py-3 backdrop-blur-md md:px-6">
          <h1 className="shrink-0 font-display text-[15px] font-semibold tracking-tight text-fg">{title}</h1>
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="truncate text-mut">
              {user.name}
              <span className="hidden sm:inline">
                {' '}
                <span className="text-dim">·</span> <span className="font-mono text-xs">{user.email}</span>
              </span>
            </span>
            <button
              onClick={logout}
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-mut transition-colors hover:border-line2 hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/50"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
