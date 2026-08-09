import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Postivo — Schedule everywhere. Self-host anywhere. One binary.',
  description:
    'A radically simpler social media scheduler: 15 providers, threads, recurring posts, RSS automation, analytics and an agent-first API — in one stateless Next.js app.',
};

const COMPARISON = [
  { label: 'Deployment', postiz: 'Next.js + NestJS + PostgreSQL + Redis + BullMQ + Temporal', postivo: 'One container. One process.' },
  { label: 'Memory', postiz: '2 GB+ across 5 services', postivo: '< 512 MB, everything in-process' },
  { label: 'Database', postiz: 'External PostgreSQL + Redis required', postivo: 'One managed Postgres. Nothing else.' },
  { label: 'License', postiz: 'AGPL-3.0', postivo: 'MIT — do whatever you want' },
  { label: 'API', postiz: 'Internal-first, UI-driven', postivo: 'Agent-first REST API with Bearer keys' },
];

const PROVIDERS = [
  { icon: '𝕏', name: 'X' },
  { icon: '🦋', name: 'Bluesky' },
  { icon: '🐘', name: 'Mastodon' },
  { icon: '💼', name: 'LinkedIn' },
  { icon: '✈️', name: 'Telegram' },
  { icon: '🎮', name: 'Discord' },
  { icon: '💬', name: 'Slack' },
  { icon: '👽', name: 'Reddit' },
  { icon: '📌', name: 'Pinterest' },
  { icon: '📝', name: 'Hashnode' },
  { icon: 'Ⓜ️', name: 'Medium' },
  { icon: '🌐', name: 'WordPress' },
  { icon: '👩‍💻', name: 'DEV.to' },
  { icon: '🪝', name: 'Webhooks' },
  { icon: '🧪', name: 'Sandbox' },
];

const FEATURES = [
  { icon: '🗓️', title: 'Schedule everywhere', desc: 'Compose once, publish to 15 providers with per-channel overrides and live per-platform previews.' },
  { icon: '🧵', title: 'Threads & follow-ups', desc: 'Chain timed follow-up replies on channels that support them. Set the delay, we post the rest.' },
  { icon: '♻️', title: 'Recurring posts', desc: 'Repeat any post every N days. Evergreen content stays evergreen without you lifting a finger.' },
  { icon: '📡', title: 'RSS automation', desc: 'Point Postivo at any feed and new items are auto-scheduled — optionally captioned by AI.' },
  { icon: '📊', title: 'Engagement analytics', desc: 'Likes, reposts, replies and views pulled back per post, plus best-time-to-post suggestions.' },
  { icon: '🖼️', title: 'Media library', desc: 'Upload once, reuse everywhere. Images and video up to 50 MB, importable straight from a URL.' },
];

const FAQ = [
  {
    q: 'How is Postivo different from Postiz or Buffer?',
    a: 'Postivo is a single stateless Next.js process with an in-process, race-safe scheduler. There is no Redis, no worker fleet, no Temporal — one container on one Postgres database, MIT licensed, that you can self-host in minutes.',
  },
  {
    q: 'Which platforms can I publish to?',
    a: 'X, Bluesky, Mastodon, LinkedIn, Telegram, Discord, Slack, Reddit, Pinterest, Hashnode, Medium, WordPress, DEV.to, arbitrary webhooks (n8n/Zapier/Make), plus a sandbox channel for testing. Fifteen providers, one composer.',
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

const CODE_SAMPLE = `# Schedule a post to every channel — from any agent
curl -X POST https://your-postivo.com/api/v1/posts \\
  -H "Authorization: Bearer pv_…" \\
  -H "content-type: application/json" \\
  -d '{
    "content": "Shipped: RSS automation + threads 🚀",
    "scheduled_at": "2026-08-12T09:00:00Z",
    "channelIds": ["ch_x", "ch_bsky", "ch_li"],
    "tags": ["launch"],
    "repeat_every_days": 7,
    "comments": [{ "content": "Docs in the reply ↓", "delayMin": 2 }]
  }'`;

const sectionTitle = 'text-center text-3xl font-bold tracking-tight text-white';
const sectionSub = 'mx-auto mt-3 max-w-2xl text-center text-slate-400';

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Sticky nav */}
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold text-white">⚡ Postivo</span>
          <nav className="hidden items-center gap-6 text-sm text-slate-400 md:flex" aria-label="Sections">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#api" className="hover:text-white">API</a>
            <a href="#compare" className="hover:text-white">Compare</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-white">
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 text-center">
          <div className="mx-auto mb-6 inline-block rounded-full border border-indigo-800 bg-indigo-950/50 px-4 py-1 text-xs font-medium text-indigo-300">
            The radically simpler Postiz alternative
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Schedule everywhere.
            <br />
            Self-host anywhere.{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              One binary.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Postivo is a social media scheduler that runs as a single stateless Next.js app on Postgres
            with an in-process, race-safe scheduler. Threads, recurring posts, RSS automation, engagement
            analytics and an agent-first API — no Redis, no Temporal, no worker fleet.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500"
            >
              Start scheduling →
            </Link>
            <a
              href="#compare"
              className="rounded-xl border border-slate-700 px-6 py-3 font-medium text-slate-300 hover:bg-slate-800"
            >
              Why Postivo?
            </a>
          </div>
        </div>

        {/* Providers marquee */}
        <div className="relative border-y border-slate-800/60 bg-slate-900/30 py-5">
          <div className="overflow-hidden" aria-label="Supported providers">
            <div className="animate-marquee flex w-max items-center gap-10 px-6">
              {[...PROVIDERS, ...PROVIDERS].map((p, i) => (
                <span key={i} className="flex shrink-0 items-center gap-2 text-sm text-slate-400">
                  <span className="text-xl" aria-hidden>
                    {p.icon}
                  </span>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className={sectionTitle}>Everything a modern scheduler should do</h2>
        <p className={sectionSub}>Without the six-container docker-compose file.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 transition hover:border-slate-700"
            >
              <div className="mb-3 text-2xl" aria-hidden>
                {f.icon}
              </div>
              <h3 className="mb-1.5 font-semibold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agentic API */}
      <section id="api" className="border-y border-slate-800/60 bg-slate-900/20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-2">
          <div>
            <div className="mb-4 inline-block rounded-full border border-cyan-800 bg-cyan-950/40 px-3 py-1 text-xs font-medium text-cyan-300">
              Agent-first API
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white">Built for agents, not just humans</h2>
            <p className="mt-4 text-slate-400">
              Every core action is a clean REST endpoint with Bearer-key auth and an OpenAPI 3.1 spec at{' '}
              <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-cyan-300">/api/v1/openapi.json</code>.
              Hand the spec to an agent and it can schedule, tag, thread and recur posts for you — no SDK required.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-slate-300">
              <li>✓ Scoped API keys with per-user rate limits</li>
              <li>✓ Threads, tags, recurring posts and media via one POST</li>
              <li>✓ Outbound webhooks on every publish result</li>
            </ul>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-2.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            </div>
            <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-slate-300">
              <code>{CODE_SAMPLE}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className={sectionTitle}>Postiz vs Postivo</h2>
        <p className={sectionSub}>Same job. A tenth of the moving parts.</p>
        <div className="mt-10 overflow-hidden rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-left">
                <th className="px-5 py-3 font-medium text-slate-400"></th>
                <th className="px-5 py-3 font-medium text-slate-400">Postiz</th>
                <th className="px-5 py-3 font-medium text-indigo-300">Postivo</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-5 py-3.5 font-medium text-slate-300">{row.label}</td>
                  <td className="px-5 py-3.5 text-slate-500">{row.postiz}</td>
                  <td className="px-5 py-3.5 text-slate-200">{row.postivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className={sectionTitle}>Pricing</h2>
        <p className={sectionSub}>Free to self-host forever. Pro when you scale.</p>
        <div className="mx-auto mt-10 grid max-w-3xl gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h3 className="text-lg font-semibold text-white">Free</h3>
            <p className="mt-1 text-3xl font-bold text-white">$0</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-400">
              <li>✓ 3 connected channels</li>
              <li>✓ 30 scheduled posts per month</li>
              <li>✓ Calendar, queue, analytics & RSS automation</li>
              <li>✓ Agent API with Bearer keys</li>
              <li className="text-slate-600">✗ AI captions</li>
            </ul>
            <Link
              href="/register"
              className="mt-6 block rounded-xl border border-slate-700 px-6 py-3 text-center font-medium text-slate-300 hover:bg-slate-800"
            >
              Start free
            </Link>
          </div>
          <div className="relative rounded-2xl border border-indigo-700 bg-indigo-950/30 p-6">
            <span className="absolute -top-3 right-4 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-medium text-white">
              Pro
            </span>
            <h3 className="text-lg font-semibold text-white">Pro</h3>
            <p className="mt-1 text-3xl font-bold text-white">
              $9<span className="text-base font-normal text-slate-400">/mo</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>✓ 100 connected channels</li>
              <li>✓ 10,000 scheduled posts per month</li>
              <li>✓ AI caption generation</li>
              <li>✓ Everything in Free</li>
              <li>✓ Priority support</li>
            </ul>
            <Link
              href="/register"
              className="mt-6 block rounded-xl bg-indigo-600 px-6 py-3 text-center font-medium text-white hover:bg-indigo-500"
            >
              Go Pro
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-6 pb-20">
        <h2 className={sectionTitle}>Frequently asked questions</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4 open:border-slate-700"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-slate-200 [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="shrink-0 text-slate-500 transition group-open:rotate-45" aria-hidden>
                  ＋
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-800 bg-slate-900/30">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-white">One process. One file. Your data.</h2>
          <p className="mt-3 text-slate-400">MIT licensed. Runs in 512 MB of RAM. Ready in a minute.</p>
          <Link
            href="/register"
            className="mt-6 inline-block rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500"
          >
            Create your account
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs text-slate-600 sm:flex-row">
          <span>⚡ Postivo — MIT licensed open source social media scheduling.</span>
          <nav className="flex items-center gap-5" aria-label="Footer">
            <Link href="/privacy" className="hover:text-slate-400">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-400">
              Terms
            </Link>
            <Link href="/support" className="hover:text-slate-400">
              Support
            </Link>
            <Link href="/login" className="hover:text-slate-400">
              Log in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
