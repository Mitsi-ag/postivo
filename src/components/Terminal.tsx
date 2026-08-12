'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * Hero terminal — a mock agent API session, typed in on a loop.
 * Reduced motion: the full transcript renders statically.
 */

interface Line {
  text: string;
  cls?: string;
  pause?: number; // ms to hold after typing this line
}

const LINES: Line[] = [
  { text: '$ curl -s https://you.example.com/api/v1/posts \\', cls: 'text-fg' },
  { text: '    -H "Authorization: Bearer pv_…" -d @launch.json', cls: 'text-fg', pause: 500 },
  { text: '{ "id": "po_9f2a41", "status": "scheduled", "targets": 3 }', cls: 'text-ok', pause: 700 },
  { text: '', pause: 250 },
  { text: '  x         → queued   09:00', cls: 'text-mut' },
  { text: '  bluesky   → queued   09:00', cls: 'text-mut' },
  { text: '  linkedin  → queued   09:00', cls: 'text-mut', pause: 800 },
  { text: '', pause: 250 },
  { text: '● 09:00:00  published → x.com/i/web/status/1824…', cls: 'text-iris-soft' },
  { text: '● 09:00:01  published → bsky.app/profile/you/post/3k…', cls: 'text-iris-soft' },
  { text: '● 09:00:02  published → linkedin.com/feed/update/7162…', cls: 'text-iris-soft', pause: 2600 },
];

// First two lines render instantly — no black-void first paint.
const SEED = { line: 2, char: 0 };

export default function Terminal() {
  const [progress, setProgress] = useState<{ line: number; char: number }>(SEED);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const reduced = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const togglePaused = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced.current) {
      setProgress({ line: LINES.length, char: 0 });
      return;
    }
    let line = SEED.line;
    let char = SEED.char;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (pausedRef.current) {
        timer = setTimeout(tick, 200);
        return;
      }
      const current = LINES[line];
      if (char < current.text.length) {
        char += 1;
        setProgress({ line, char });
        timer = setTimeout(tick, 14 + Math.random() * 22);
      } else {
        line += 1;
        char = 0;
        if (line >= LINES.length) {
          // Hold the full transcript, then restart the loop.
          timer = setTimeout(() => {
            line = SEED.line;
            setProgress({ line: SEED.line, char: 0 });
            timer = setTimeout(tick, 400);
          }, 3200);
        } else {
          setProgress({ line, char });
          timer = setTimeout(tick, current.pause ?? 90);
        }
      }
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [progress]);

  const done = progress.line >= LINES.length;
  const visible = LINES.slice(0, done ? LINES.length : progress.line + 1);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-[#05060a] text-left shadow-[0_24px_80px_rgba(0,0,0,.55)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-err/60" />
          <span className="h-2 w-2 rounded-full bg-warn/60" />
          <span className="h-2 w-2 rounded-full bg-ok/60" />
        </span>
        <span className="ml-2 font-mono text-[10px] tracking-widest text-dim uppercase">
          agent session — postivo · api/v1
        </span>
        <span className="chip ml-auto !py-0.5 !px-2">
          <span className="dot pulse-dot" />
          live
        </span>
        <button
          type="button"
          onClick={togglePaused}
          aria-label={paused ? 'Play terminal animation' : 'Pause terminal animation'}
          className="ml-2 flex h-5 w-5 items-center justify-center rounded border border-line text-[10px] leading-none text-dim transition-colors hover:border-line2 hover:text-fg"
        >
          <span aria-hidden>{paused ? '▶' : '⏸'}</span>
        </button>
      </div>
      <p className="sr-only">
        A terminal showing an API call scheduling a post to X, Bluesky and LinkedIn, then publishing
        confirmations.
      </p>
      <div
        ref={scrollRef}
        aria-hidden="true"
        className="h-64 overflow-hidden px-5 py-4 font-mono text-[11.5px] leading-[1.75] sm:text-xs"
      >
        {visible.map((l, i) => {
          const isCurrent = !done && i === progress.line;
          const text = isCurrent ? l.text.slice(0, progress.char) : l.text;
          return (
            <div key={i} className={l.cls ?? 'text-mut'}>
              {text}
              {isCurrent && <span className="terminal-caret text-iris">▍</span>}
              {l.text === '' && !isCurrent && ' '}
            </div>
          );
        })}
      </div>
    </div>
  );
}
