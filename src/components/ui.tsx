import { AlertIcon, CheckIcon } from '@/components/icons';

/*
 * Shared primitives — every portal screen inherits its craft from here.
 * Hairline borders, 12px radius, iris focus rings, mono for readouts.
 */

export const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-dim transition-colors focus:border-iris/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-iris px-4 py-2 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(110,107,240,.35),0_4px_16px_rgba(110,107,240,.22)] transition-all hover:bg-iris-deep hover:shadow-[0_0_0_1px_rgba(110,107,240,.5),0_6px_20px_rgba(110,107,240,.3)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-soft focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

export const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-mut transition-all hover:border-line2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40';

export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-err/25 px-3 py-1.5 text-xs text-err transition-colors hover:bg-err/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-err/40';

export const cardCls =
  'edge-top rounded-card border border-line bg-surface p-5';

// Like inputCls but without w-full — for inline selects/inputs in filter bars.
export const selectCls =
  'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg transition-colors focus:border-iris/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40';

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-err/25 bg-err/8 px-4 py-2.5 text-sm text-err"
    >
      <AlertIcon size={15} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function UpgradeBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-iris/30 bg-iris/10 px-4 py-2.5 text-sm text-iris-soft">
      <span>You&apos;ve hit the limit of the Free plan.</span>
      <a
        href="/settings/billing"
        className="shrink-0 rounded-lg bg-iris px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-iris-deep"
      >
        Upgrade to Pro
      </a>
    </div>
  );
}

/* Status as a mono readout chip — the terminal motif, applied to state. */
const STATUS_TONE: Record<string, { text: string; dot: string }> = {
  scheduled: { text: 'text-iris-soft border-iris/30 bg-iris/10', dot: 'bg-iris' },
  pending: { text: 'text-iris-soft border-iris/30 bg-iris/10', dot: 'bg-iris' },
  published: { text: 'text-ok border-ok/25 bg-ok/10', dot: 'bg-ok' },
  active: { text: 'text-ok border-ok/25 bg-ok/10', dot: 'bg-ok' },
  failed: { text: 'text-err border-err/25 bg-err/10', dot: 'bg-err' },
  draft: { text: 'text-mut border-line bg-raised/60', dot: 'bg-dim' },
};

export function Badge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${tone.text} ${className ?? ''}`}
    >
      <span aria-hidden className={`h-1 w-1 rounded-full ${tone.dot}`} />
      {status}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-raised/70 ${className ?? ''}`} />;
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
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${cardCls} py-12 text-center`}>
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-raised/50 text-dim">
        {icon}
      </div>
      <p className="mt-4 text-sm font-medium text-fg">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-sm font-mono text-[11px] leading-relaxed text-dim">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-raised/50 px-2 py-0.5 font-mono text-[11px] text-mut">
      #{tag}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove tag ${tag}`}
          className="rounded-full text-dim transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-iris"
        >
          ×
        </button>
      )}
    </span>
  );
}

/* Inline confirm/success note (settings pages). */
export function SavedNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-ok">
      <CheckIcon size={13} />
      {message}
    </p>
  );
}
