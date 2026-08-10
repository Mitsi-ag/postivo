import type { SVGProps } from 'react';

/*
 * Postivo icon set — hand-rolled, 24px grid, 1.5px stroke, currentColor.
 * No icon library: every glyph is drawn to the same optical weight so the
 * portal chrome reads like one instrument panel.
 */

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const GridIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Svg>
);

export const PenIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Svg>
);

export const CalendarIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
    <path d="M3.5 9.5h17M8 2.5v4M16 2.5v4" />
  </Svg>
);

export const StackIcon = (p: P) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);

export const ImageIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.5 18 5-5 3.5 3.5 3-3 3.5 3.5" />
  </Svg>
);

export const BoltIcon = (p: P) => (
  <Svg {...p}>
    <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12Z" />
  </Svg>
);

export const PlugIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 2.5V7M15 2.5V7" />
    <path d="M7 7h10v4a5 5 0 0 1-10 0Z" />
    <path d="M12 16v5.5" />
  </Svg>
);

export const ChartIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 3.5v17h17" />
    <path d="M8 16.5v-5M12.5 16.5V8M17 16.5v-8" />
  </Svg>
);

export const GearIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
  </Svg>
);

export const CardIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 9.5h18M6.5 14.5h4" />
  </Svg>
);

export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const SearchIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
);

export const XIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5L19.5 7" />
  </Svg>
);

export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5" />
    <path d="M10 11v5.5M14 11v5.5" />
  </Svg>
);

export const RetryIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 3.5V8h-4.5" />
  </Svg>
);

export const RefreshIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 0 1-14.9 4M4 12a8 8 0 0 1 14.9-4" />
    <path d="M18.9 3.5v4h-4M5.1 20.5v-4h4" />
  </Svg>
);

export const ExternalIcon = (p: P) => (
  <Svg {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 10.5 13.5" />
    <path d="M19 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V6.5A1.5 1.5 0 0 1 5.5 5h5.5" />
  </Svg>
);

export const ClockIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3.5 2" />
  </Svg>
);

export const TagIcon = (p: P) => (
  <Svg {...p}>
    <path d="m3.5 12.5 9-9H20a1 1 0 0 1 1 1v7.5l-9 9a1.4 1.4 0 0 1-2 0l-6.5-6.5a1.4 1.4 0 0 1 0-2Z" />
    <circle cx="16.5" cy="7.5" r="1.2" />
  </Svg>
);

export const AlertIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 2.5 20h19Z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Svg>
);

export const RssIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 11a8.5 8.5 0 0 1 8.5 8.5M4.5 4.5a15 15 0 0 1 15 15" />
    <circle cx="5.5" cy="18.5" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);

export const FilmIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M8 4.5v15M16 4.5v15M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5" />
  </Svg>
);

export const DownloadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4.5 20.5h15" />
  </Svg>
);

export const KeyIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="15.5" r="4.5" />
    <path d="m11.2 12.3 8.3-8.3M16.5 7l2.5 2.5M13.5 10l2 2" />
  </Svg>
);

export const ArrowRightIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 12h15M13.5 6 19.5 12l-6 6" />
  </Svg>
);

export const UploadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
    <path d="M4.5 20.5h15" />
  </Svg>
);

/* Platform-preview glyphs (used inside PostPreview, mimics platform chrome) */
export const HeartIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 6.8 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
  </Svg>
);

export const RepostIcon = (p: P) => (
  <Svg {...p}>
    <path d="m17 2.5 3.5 3.5L17 9.5" />
    <path d="M20 6H8.5a4 4 0 0 0-4 4v1" />
    <path d="m7 21.5-3.5-3.5L7 14.5" />
    <path d="M4 18h11.5a4 4 0 0 0 4-4v-1" />
  </Svg>
);

export const CommentIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 0-3.1 6.3L20.5 19Z" />
  </Svg>
);

export const EyeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const BookmarkIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 3.5h11V21L12 17.5 6.5 21Z" />
  </Svg>
);

export const SendIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 3.5 10 14.5M21 3.5 14 21l-4-6.5L3.5 10.5Z" />
  </Svg>
);

export const SparkIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5l-1.8-5.9L4.5 10.8 10.2 9Z" />
  </Svg>
);

/* ── Brand mark ───────────────────────────────────────────────────── */

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6" stroke="#6e6bf0" strokeWidth="1.5" />
      <path
        d="M13.2 5 7.8 13h3.4l-1.4 6 6.4-8h-3.4Z"
        fill="#6e6bf0"
        stroke="#6e6bf0"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size + 4} />
      <span className="font-display font-semibold tracking-tight text-fg" style={{ fontSize: size }}>
        Postivo
      </span>
    </span>
  );
}

/* ── Provider mark ──────────────────────────────────────────────────
 * Provider metadata ships emoji glyphs; the portal never shows them.
 * Instead: a machined chip — provider color wash + mono abbreviation. */

const ABBR: Record<string, string> = {
  demo: 'DM',
  webhook: 'HK',
  bluesky: 'BS',
  mastodon: 'MA',
  devto: 'DV',
  x: 'X',
  linkedin: 'IN',
  telegram: 'TG',
  discord: 'DC',
  slack: 'SL',
  reddit: 'RD',
  pinterest: 'PN',
  hashnode: 'HN',
  medium: 'MD',
  wordpress: 'WP',
};

export function ProviderMark({
  id,
  name,
  color,
  size = 22,
}: {
  id?: string;
  name?: string;
  color?: string;
  size?: number;
}) {
  const abbr = (id && ABBR[id]) || (name ?? '?').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || '?';
  const c = color ?? '#6e6bf0';
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-md border font-mono font-medium"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, size * 0.4),
        letterSpacing: '0.02em',
        color: c,
        borderColor: `${c}38`,
        backgroundColor: `${c}14`,
      }}
    >
      {abbr}
    </span>
  );
}
