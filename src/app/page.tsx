import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRightIcon, BoltIcon, ChartIcon, CheckIcon, PlugIcon, RefreshIcon, RssIcon, StackIcon, Wordmark } from '@/components/icons';
import Terminal from '@/components/Terminal';
import Timeline from '@/components/Timeline';

export const metadata: Metadata = {
  title: 'Postivo — Schedule everywhere. Self-host anywhere. One binary.',
  description:
    'A radically simpler social media scheduler: 16 platforms, threads, recurring posts, RSS automation, analytics and an agent-first API — in one stateless Next.js app.',
};

const COMPARISON = [
  { label: 'Deployment', postiz: 'Next.js + NestJS + PostgreSQL + Redis + BullMQ + Temporal', postivo: 'One container. One process.' },
  { label: 'Memory', postiz: '2 GB+ across 5 services', postivo: '< 512 MB, everything in-process' },
  { label: 'Database', postiz: 'External PostgreSQL + Redis required', postivo: 'One managed Postgres. Nothing else.' },
  { label: 'License', postiz: 'AGPL-3.0', postivo: 'MIT — do whatever you want' },
  { label: 'API', postiz: 'Internal-first, UI-driven', postivo: 'Agent-first REST API with Bearer keys' },
];

const PROVIDERS = [
  'Instagram', 'TikTok', 'YouTube', 'X', 'LinkedIn', 'Bluesky', 'Mastodon', 'Telegram',
  'Discord', 'Slack', 'Reddit', 'Pinterest', 'Hashnode', 'Medium', 'WordPress', 'DEV.to',
];

const NAV_LINKS: [string, string][] = [
  ['Features', '#features'],
  ['The dial', '#timeline'],
  ['API', '#api'],
  ['Compare', '#compare'],
  ['Pricing', '#pricing'],
  ['FAQ', '#faq'],
];

const FAQ = [
  {
    q: 'How is Postivo different from Postiz or Buffer?',
    a: 'Postivo is a single stateless Next.js process with an in-process, race-safe scheduler. There is no Redis, no worker fleet, no Temporal — one container on one Postgres database, MIT licensed, that you can self-host in minutes.',
  },
  {
    q: 'Which platforms can I publish to?',
    a: 'Instagram, TikTok, YouTube, X, LinkedIn, Bluesky, Mastodon, Telegram, Discord, Slack, Reddit, Pinterest, Hashnode, Medium, WordPress and DEV.to — sixteen platforms, one composer — plus arbitrary webhooks (n8n/Zapier/Make) and a sandbox channel for testing.',
  },
  {
    q: 'What does the agent-first API look like?',
    a: 'Every core action — create posts, list channels, check usage — is a clean REST endpoint under /api/v1 with Bearer API keys and an OpenAPI spec. Point an agent at it and it can schedule content for you autonomously.',
  },
  {
    q: 'Can it post automatically from my blog?',
    a: 'Yes. Add your RSS feed, pick target channels and a poll interval, and Postivo schedules new items as they appear — optionally generating an AI caption for each one.',
  },
  {
    q: 'What do I get on the Free plan?',
    a: '3 connected channels, 30 scheduled posts per month, calendar, queue, analytics, RSS automation and full API access. Pro ($9/mo) raises limits to 100 channels and 10,000 posts and unlocks AI captions.',
  },
  {
    q: 'Where is my data stored?',
    a: 'In your own Postgres database and your own S3-compatible bucket (or local disk). Self-hosted means exactly that — we never see your content.',
  },
];

const DEMO_POINTS = [
  { t: 8.5, label: '08:30 — launch notes → x, bluesky' },
  { t: 9, label: '09:00 — shipped: RSS automation' },
  { t: 12.25, label: '12:15 — thread (3 replies)' },
  { t: 15.75, label: '15:45 — rss: blog post' },
  { t: 18.5, label: '18:30 — recurring · every 7d', tone: 'ok' as const },
  { t: 21, label: '21:00 — evergreen repost' },
];

const label = 'font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-iris-soft';
const h2cls = 'mt-4 font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl';
const subcls = 'mt-4 max-w-2xl text-[15px] leading-relaxed text-mut';

function SectionHead({ kicker, title, sub, center }: { kicker: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : ''}>
      <p className={label}>{kicker}</p>
      <h2 className={h2cls}>{title}</h2>
      {sub && <p className={`${subcls} ${center ? 'mx-auto' : ''}`}>{sub}</p>}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* ── Sticky glass nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line bg-ink/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="Postivo home">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-7 text-[13px] text-mut md:flex" aria-label="Sections">
            {NAV_LINKS.map(([t, href]) => (
              <a key={href} href={href} className="transition-colors hover:text-fg">
                {t}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/login" className="rounded-lg px-3.5 py-2 text-[13px] text-mut transition-colors hover:text-fg">
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-iris px-3.5 py-2 text-[13px] font-medium text-white shadow-[0_0_0_1px_rgba(110,107,240,.35),0_4px_16px_rgba(110,107,240,.25)] transition-colors hover:bg-iris-deep"
            >
              Get started
            </Link>
            <details className="relative md:hidden">
              <summary
                aria-label="Open menu"
                className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-line text-mut transition-colors hover:border-line2 hover:text-fg [&::-webkit-details-marker]:hidden"
              >
                <span aria-hidden className="text-base leading-none">☰</span>
              </summary>
              <nav
                aria-label="Mobile sections"
                className="absolute right-0 top-full mt-3 w-44 rounded-card border border-line bg-surface p-2 shadow-[0_16px_48px_rgba(0,0,0,.5)]"
              >
                {NAV_LINKS.map(([t, href]) => (
                  <a
                    key={href}
                    href={href}
                    className="block rounded-lg px-3 py-2 text-[13px] text-mut transition-colors hover:bg-raised hover:text-fg"
                  >
                    {t}
                  </a>
                ))}
              </nav>
            </details>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="noise relative overflow-hidden">
        {/* Iris glow orb */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-320px] h-[640px] w-[900px] -translate-x-1/2 rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgba(110,107,240,.16), transparent)' }}
        />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-24 text-center sm:pt-28">
          <div className="anim-rise" style={{ animationDelay: '0ms' }}>
            <span className="chip">
              <span className="dot pulse-dot" />
              Live — v1.0 · MIT licensed
            </span>
          </div>
          <h1
            className="anim-rise mx-auto mt-7 max-w-4xl text-balance font-display text-[42px] font-bold leading-[1.04] tracking-[-0.03em] text-fg sm:text-6xl"
            style={{ animationDelay: '90ms' }}
          >
            Schedule everywhere.
            <br className="hidden sm:block" />
            Ship from <span className="text-iris-soft">one binary.</span>
          </h1>
          <p
            className="anim-rise mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-mut sm:text-base"
            style={{ animationDelay: '180ms' }}
          >
            Postivo is a social media scheduler that runs as a single stateless Next.js app on
            Postgres — threads, recurring posts, RSS automation, engagement analytics and an
            agent-first API. No Redis, no Temporal, no worker fleet.
          </p>
          <div className="anim-rise mt-9 flex flex-wrap items-center justify-center gap-3.5" style={{ animationDelay: '270ms' }}>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-iris px-6 py-3 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(110,107,240,.4),0_8px_28px_rgba(110,107,240,.35)] transition-all hover:bg-iris-deep hover:shadow-[0_0_0_1px_rgba(110,107,240,.55),0_10px_32px_rgba(110,107,240,.45)]"
            >
              Start free
              <ArrowRightIcon size={15} />
            </Link>
            <a
              href="#compare"
              className="rounded-lg border border-line px-6 py-3 text-sm font-medium text-mut transition-colors hover:border-line2 hover:bg-raised hover:text-fg"
            >
              See the comparison
            </a>
            <a
              href="https://github.com/Mitsi-ag/postivo"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-line px-6 py-3 text-sm font-medium text-mut transition-colors hover:border-line2 hover:bg-raised hover:text-fg"
            >
              View on GitHub
            </a>
          </div>

          {/* Live terminal */}
          <div className="anim-rise mx-auto mt-16 max-w-3xl" style={{ animationDelay: '380ms' }}>
            <Terminal />
          </div>
        </div>

        {/* Provider marquee */}
        <div className="relative border-y border-line bg-surface/40 py-5">
          <ul className="sr-only">
            {PROVIDERS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="marquee-mask overflow-hidden" aria-hidden="true">
            <div className="animate-marquee flex w-max items-center gap-3 px-6">
              {[...PROVIDERS, ...PROVIDERS].map((name, i) => (
                <span
                  key={i}
                  className="shrink-0 rounded-full border border-line bg-raised/40 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-mut"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Bento features ───────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <SectionHead
          kicker="01 — Capabilities"
          title="Everything a modern scheduler should do"
          sub="Without the six-container docker-compose file."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-12">
          {/* Large: 16 platforms */}
          <div className="edge-top lift rounded-card border border-line bg-surface p-7 lg:col-span-7">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-iris/25 bg-iris/10 text-iris-soft">
              <PlugIcon size={17} />
            </div>
            <h3 className="mt-5 font-display text-lg font-semibold text-fg">16 platforms, one composer</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-mut">
              Compose once, publish everywhere — with per-channel overrides and live per-platform
              previews that show exactly what ships. Webhooks cover anything else.
            </p>
            <div className="mt-6 flex flex-wrap gap-1.5">
              {PROVIDERS.slice(0, 6).map((p) => (
                <span key={p} className="rounded-md border border-line bg-raised/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-dim">
                  {p}
                </span>
              ))}
              <span className="rounded-md border border-line bg-raised/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-dim">
                + 10 more
              </span>
            </div>
          </div>
          {/* Large: agent API */}
          <div id="api" className="edge-top-iris edge-top lift scroll-mt-24 rounded-card border border-line bg-surface p-7 lg:col-span-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-iris/25 bg-iris/10 text-iris-soft">
              <BoltIcon size={17} />
            </div>
            <h3 className="mt-5 font-display text-lg font-semibold text-fg">Agent-first API</h3>
            <p className="mt-2 text-sm leading-relaxed text-mut">
              Every action is a clean REST endpoint with Bearer keys and an OpenAPI 3.1 spec. Hand
              the spec to an agent — it schedules for you.
            </p>
            <pre className="mt-5 overflow-x-auto rounded-lg border border-line bg-[#05060a] p-3.5 font-mono text-[10.5px] leading-relaxed text-mut">
{`POST /api/v1/posts
Authorization: Bearer pv_…

201  { "status": "scheduled" }`}
            </pre>
          </div>
          {/* Small: threads */}
          <div className="edge-top lift rounded-card border border-line bg-surface p-6 lg:col-span-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised/60 text-mut">
              <StackIcon size={16} />
            </div>
            <h3 className="mt-4 font-display text-[15px] font-semibold text-fg">Threads &amp; follow-ups</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-mut">
              Chain timed follow-up replies. Set the delay, we post the rest — strictly in order.
            </p>
          </div>
          {/* Small: recurring */}
          <div className="edge-top lift rounded-card border border-line bg-surface p-6 lg:col-span-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised/60 text-mut">
              <RefreshIcon size={16} />
            </div>
            <h3 className="mt-4 font-display text-[15px] font-semibold text-fg">Recurring posts</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-mut">
              Repeat any post every N days. Evergreen content stays evergreen, hands-free.
            </p>
          </div>
          {/* Small: RSS */}
          <div className="edge-top lift rounded-card border border-line bg-surface p-6 lg:col-span-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised/60 text-mut">
              <RssIcon size={16} />
            </div>
            <h3 className="mt-4 font-display text-[15px] font-semibold text-fg">RSS automation</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-mut">
              Point Postivo at any feed — new items are auto-scheduled, optionally AI-captioned.
            </p>
          </div>
          {/* Small: analytics */}
          <div className="edge-top lift rounded-card border border-line bg-surface p-6 lg:col-span-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raised/60 text-mut">
              <ChartIcon size={16} />
            </div>
            <h3 className="mt-4 font-display text-[15px] font-semibold text-fg">Engagement analytics</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-mut">
              Likes, reposts, replies and views pulled back per post, plus best-time suggestions.
            </p>
          </div>
        </div>
      </section>

      {/* ── Scheduler timeline ───────────────────────────────────── */}
      <section id="timeline" className="scroll-mt-24 border-y border-line bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionHead
            kicker="02 — The dial"
            title="A day of publishing, at a glance"
            sub="Every scheduled post is a notch on the instrument. The in-process scheduler claims due posts with Postgres SKIP LOCKED — race-safe, even across replicas."
          />
          <div className="edge-top mt-14 rounded-card border border-line bg-surface p-6 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <span className="chip">
                <span className="dot pulse-dot" />
                Today — 6 scheduled
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
                scheduler tick: 30s · claim: skip locked
              </span>
            </div>
            <Timeline points={DEMO_POINTS} />
          </div>
        </div>
      </section>

      {/* ── Comparison ───────────────────────────────────────────── */}
      <section id="compare" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <SectionHead
          center
          kicker="03 — Compare"
          title="Postiz vs Postivo"
          sub="Same job. A tenth of the moving parts."
        />
        {/* Stacked cards below sm — Postivo first, no horizontal scroll */}
        <div className="mx-auto mt-14 max-w-4xl space-y-3 sm:hidden">
          {COMPARISON.map((row) => (
            <div key={row.label} className="edge-top rounded-card border border-line bg-surface p-5">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-dim">{row.label}</p>
              <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-fg">
                <CheckIcon size={14} className="mt-0.5 shrink-0 text-iris" />
                {row.postivo}
              </p>
              <p className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-dim">
                <span className="mt-0.5 shrink-0" aria-hidden>—</span>
                {row.postiz}
              </p>
            </div>
          ))}
        </div>
        {/* Table on sm+ */}
        <div className="edge-top mx-auto mt-14 hidden max-w-4xl overflow-x-auto rounded-card border border-line bg-surface sm:block">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-dim" />
                <th className="px-5 py-3.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-dim">Postiz</th>
                <th className="bg-iris/5 px-5 py-3.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-iris-soft">Postivo</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-4 font-medium text-fg">{row.label}</td>
                  <td className="px-5 py-4 text-[13px] leading-relaxed text-dim">
                    <span className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0" aria-hidden>—</span>
                      {row.postiz}
                    </span>
                  </td>
                  <td className="bg-iris/5 px-5 py-4 text-[13px] leading-relaxed text-fg">
                    <span className="flex items-start gap-2">
                      <CheckIcon size={14} className="mt-0.5 shrink-0 text-iris" />
                      {row.postivo}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <SectionHead
          center
          kicker="04 — Pricing"
          title="Self-host free. Or let us run it."
          sub="Self-hosting is MIT-licensed with no limits. Postivo Cloud starts free — Free tier limits apply, and Pro ($9/mo) removes them."
        />
        <div className="mx-auto mt-14 grid max-w-3xl items-start gap-5 sm:grid-cols-2">
          {/* Free */}
          <div className="edge-top lift rounded-card border border-line bg-surface p-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-dim">Free</p>
            <p className="mt-3 font-display text-4xl font-bold tracking-tight text-fg">
              $0<span className="font-sans text-sm font-normal text-dim"> / forever</span>
            </p>
            <ul className="mt-6 space-y-2.5 border-t border-line pt-6 text-sm text-mut">
              {['3 connected channels', '30 scheduled posts / month', '250 MB media storage', 'Calendar, queue, analytics & RSS', 'Agent API with Bearer keys'].map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <CheckIcon size={14} className="mt-0.5 shrink-0 text-mut" />
                  {f}
                </li>
              ))}
              <li className="flex items-start gap-2.5 text-dim">
                <span className="mt-0.5 w-3.5 text-center" aria-hidden>—</span>
                No AI captions
              </li>
            </ul>
            <Link
              href="/register"
              className="mt-7 block rounded-lg border border-line px-6 py-3 text-center text-sm font-medium text-mut transition-colors hover:border-line2 hover:bg-raised hover:text-fg"
            >
              Start free
            </Link>
          </div>
          {/* Pro */}
          <div className="edge-top edge-top-iris lift relative mt-4 rounded-card border border-iris/40 bg-surface p-7 shadow-[0_0_60px_rgba(110,107,240,.14)] sm:mt-0">
            <span className="absolute -top-2 right-5 rounded-full bg-iris px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-white sm:-top-3">
              Most popular
            </span>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-iris-soft">Pro</p>
            <p className="mt-3 font-display text-4xl font-bold tracking-tight text-fg">
              $9<span className="font-sans text-sm font-normal text-dim"> / month</span>
            </p>
            <ul className="mt-6 space-y-2.5 border-t border-line pt-6 text-sm text-mut">
              {['100 connected channels', '10,000 scheduled posts / month', '25 GB media storage', 'AI caption generation', 'Everything in Free', 'Priority support'].map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <CheckIcon size={14} className="mt-0.5 shrink-0 text-iris" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className="mt-7 block rounded-lg bg-iris px-6 py-3 text-center text-sm font-medium text-white shadow-[0_0_0_1px_rgba(110,107,240,.4),0_8px_24px_rgba(110,107,240,.3)] transition-colors hover:bg-iris-deep"
            >
              Go Pro
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-6 pb-24">
        <SectionHead center kicker="05 — FAQ" title="Frequently asked questions" />
        <div className="mt-12">
          {FAQ.map((f) => (
            <details key={f.q} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-5 text-[15px] font-medium text-fg transition-colors hover:text-iris-soft focus-visible:ring-2 focus-visible:ring-iris-soft [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="shrink-0 text-dim transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-5 text-sm leading-relaxed text-mut">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Manifesto closer ─────────────────────────────────────── */}
      <section className="noise relative overflow-hidden border-t border-line">
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[-260px] left-1/2 h-[520px] w-[760px] -translate-x-1/2 rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgba(110,107,240,.13), transparent)' }}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-28 text-center">
          <p className="rule mx-auto max-w-md">Manifesto</p>
          <h2 className="mx-auto mt-8 max-w-3xl font-display text-4xl font-bold leading-[1.06] tracking-[-0.03em] text-fg sm:text-6xl">
            One process.
            <br />
            One file. <span className="text-iris-soft">Your data.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-[15px] text-mut">
            MIT licensed. Runs in 512 MB of RAM. Ready in a minute.
          </p>
          <Link
            href="/register"
            className="mt-10 inline-flex items-center gap-2 rounded-lg bg-iris px-7 py-3.5 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(110,107,240,.4),0_8px_28px_rgba(110,107,240,.35)] transition-colors hover:bg-iris-deep"
          >
            Start free
            <ArrowRightIcon size={15} />
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-line py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <Wordmark size={14} />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
              MIT · one binary
            </span>
          </div>
          <nav className="flex items-center gap-6 text-xs text-dim" aria-label="Footer">
            <Link href="/privacy" className="transition-colors hover:text-mut">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-mut">Terms</Link>
            <Link href="/support" className="transition-colors hover:text-mut">Support</Link>
            <a
              href="https://github.com/Mitsi-ag/postivo"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-mut"
            >
              GitHub ↗
            </a>
            <Link href="/login" className="transition-colors hover:text-mut">Log in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
