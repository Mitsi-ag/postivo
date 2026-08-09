export const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';

export const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';

export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950';

export const cardCls = 'rounded-xl border border-slate-800 bg-slate-900/50 p-5';

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-800 bg-red-950/60 px-4 py-2 text-sm text-red-300">{message}</div>
  );
}

export function UpgradeBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-indigo-800 bg-indigo-950/50 px-4 py-2.5 text-sm text-indigo-200">
      <span>You've hit the limit of the Free plan.</span>
      <a
        href="/settings/billing"
        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
      >
        Upgrade to Pro
      </a>
    </div>
  );
}

export function Badge({ status, className }: { status: string; className?: string }) {
  const colors: Record<string, string> = {
    scheduled: 'bg-indigo-950 text-indigo-300 border-indigo-800',
    pending: 'bg-indigo-950 text-indigo-300 border-indigo-800',
    published: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    failed: 'bg-red-950 text-red-300 border-red-800',
    draft: 'bg-slate-800 text-slate-300 border-slate-700',
    active: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${colors[status] ?? colors.draft} ${className ?? ''}`}
    >
      {status}
    </span>
  );
}
