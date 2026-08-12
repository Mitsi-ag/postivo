import { useEffect, useRef, useState } from 'react';
import { AlertIcon, CheckIcon } from '@/components/icons';

/*
 * Shared primitives — every portal screen inherits its craft from here.
 * Hairline borders, 12px radius, iris focus rings, mono for readouts.
 */

export const inputCls =
  'w-full rounded-lg border border-control bg-raised px-3 py-2 text-sm text-fg placeholder:text-dim transition-colors focus:border-iris focus:outline-none focus-visible:ring-2 focus-visible:ring-iris-soft';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-iris-fill px-4 py-2 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(110,107,240,.35),0_4px_16px_rgba(110,107,240,.22)] transition-all hover:bg-iris hover:shadow-[0_0_0_1px_rgba(110,107,240,.5),0_6px_20px_rgba(110,107,240,.3)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-soft focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

export const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-mut transition-all hover:border-line2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40';

export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-err/25 px-3 py-1.5 text-xs text-err transition-colors hover:bg-err/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-err/40';

export const cardCls =
  'edge-top rounded-card border border-line bg-surface p-5';

// Like inputCls but without w-full — for inline selects/inputs in filter bars.
// appearance-none + custom chevron so the design system doesn't evaporate.
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239aa3b5' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";
export const selectCls =
  `appearance-none rounded-lg border border-control bg-raised pl-3 pr-9 py-2 text-sm text-fg transition-colors focus:border-iris focus:outline-none focus-visible:ring-2 focus-visible:ring-iris-soft bg-no-repeat [background-position:right_0.65rem_center] [background-size:12px] [background-image:${CHEVRON}]`;

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
  overdue: { text: 'text-warn border-warn/30 bg-warn/10', dot: 'bg-warn' },
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

/* On-brand checkbox — native ones render as white boxes on near-black cards. */
export function Checkbox({
  checked,
  onChange,
  children,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-mut">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-control bg-raised transition peer-checked:border-iris peer-checked:bg-iris-fill peer-focus-visible:ring-2 peer-focus-visible:ring-iris-soft"
      >
        <CheckIcon size={11} className="text-white opacity-0 transition peer-checked:opacity-100" />
      </span>
      {children}
    </label>
  );
}

/* Focus-managed confirm dialog — replaces window.confirm/prompt. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  destructive = false,
  requireText,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireText?: string; // when set, confirm only enables after typing this
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      setTyped('');
      confirmRef.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  const blocked = requireText !== undefined && typed !== requireText;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="edge-top w-full max-w-sm rounded-card border border-line bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
        {body && <div className="mt-2 text-sm leading-relaxed text-mut">{body}</div>}
        {requireText !== undefined && (
          <div className="mt-3">
            <label htmlFor="confirm-type" className="mb-1 block text-xs text-dim">
              Type <span className="font-mono text-fg">{requireText}</span> to confirm
            </label>
            <input id="confirm-type" value={typed} onChange={(e) => setTyped(e.target.value)} className={inputCls} autoComplete="off" />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onCancel} className={btnGhost}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={blocked}
            className={destructive ? btnDanger : btnPrimary}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
