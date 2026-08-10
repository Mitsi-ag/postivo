/*
 * The scheduler timeline — Postivo's differentiation anchor.
 * A 24h hairline bar with tick marks; each scheduled post is an iris notch.
 * Reused on the landing (demo data) and the dashboard (today's real queue).
 */

export interface TimelinePoint {
  /** Hour position, 0–24 */
  t: number;
  label?: string;
  tone?: 'iris' | 'ok';
}

const HOURS = [0, 6, 12, 18, 24];

export default function Timeline({
  points,
  className,
}: {
  points: TimelinePoint[];
  className?: string;
}) {
  return (
    <div className={className}>
      {/* Track */}
      <div className="relative h-10">
        {/* Base hairline */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" aria-hidden />
        {/* Hour ticks */}
        {Array.from({ length: 25 }, (_, h) => (
          <span
            key={h}
            aria-hidden
            className="absolute top-1/2 w-px -translate-y-1/2 bg-line2"
            style={{ left: `${(h / 24) * 100}%`, height: h % 6 === 0 ? 10 : 5 }}
          />
        ))}
        {/* Scheduled posts */}
        {points.map((p, i) => (
          <span
            key={i}
            className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${Math.min(99.2, Math.max(0.8, (p.t / 24) * 100))}%` }}
          >
            <span
              aria-hidden
              className={`block h-4 w-[3px] rounded-full ${
                p.tone === 'ok' ? 'bg-ok' : 'bg-iris shadow-[0_0_10px_rgba(110,107,240,.55)]'
              }`}
            />
            {p.label && (
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-md border border-line bg-raised px-2 py-1 font-mono text-[10px] whitespace-nowrap text-mut opacity-0 shadow-lg shadow-black/40 transition-opacity group-hover:opacity-100">
                {p.label}
              </span>
            )}
          </span>
        ))}
      </div>
      {/* Hour scale */}
      <div className="relative mt-1 h-4 font-mono text-[10px] tracking-wider text-dim" aria-hidden>
        {HOURS.map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  );
}
