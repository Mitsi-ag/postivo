export const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

export const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60';

export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60';

export const cardCls = 'rounded-xl border border-slate-800 bg-slate-900/50 p-5';

// Like inputCls but without w-full — for inline selects/inputs in filter bars.
export const selectCls =
  'rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60';

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-800 bg-red-950/60 px-4 py-2 text-sm text-red-300">
      {message}
    </div>
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

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-slate-800/80 ${className ?? ''}`} />;
}

export function SkeletonCards({ count = 3, height = 'h-24' }: { count?: number; height?: string }) {
  return (
    <div className="space-y-4" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={height} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${cardCls} py-10 text-center`}>
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="mt-3 text-sm font-medium text-slate-300">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-xs text-slate-300">
      #{tag}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove tag ${tag}`}
          className="text-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded-full"
        >
          ×
        </button>
      )}
    </span>
  );
}
