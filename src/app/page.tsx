import Link from 'next/link';

const COMPARISON = [
  { label: 'Deployment', postiz: 'Next.js + NestJS + PostgreSQL + Redis + BullMQ + Temporal', postivo: 'One container. One process.' },
  { label: 'Memory', postiz: '2 GB+ across 5 services', postivo: '< 512 MB, everything in-process' },
  { label: 'Database', postiz: 'External PostgreSQL required', postivo: 'Embedded SQLite (WAL), zero setup' },
  { label: 'License', postiz: 'AGPL-3.0', postivo: 'MIT — do whatever you want' },
  { label: 'API', postiz: 'Internal-first, UI-driven', postivo: 'Agent-first REST API with Bearer keys' },
];

const FEATURES = [
  { icon: '🗓️', title: 'Schedule everywhere', desc: 'Compose once, publish to Bluesky, Mastodon, X, LinkedIn, DEV and any webhook — with per-channel overrides.' },
  { icon: '🪝', title: 'Webhook provider', desc: 'First-class webhook channel plugs straight into n8n, Zapier or Make. Your content, your pipelines.' },
  { icon: '🤖', title: 'Agent-first API', desc: 'Every core action is a clean REST endpoint. Generate an API key and let your agents schedule for you.' },
  { icon: '📦', title: 'Self-host anywhere', desc: 'No Postgres, no Redis, no workers. A single Node process with an embedded SQLite database.' },
  { icon: '🖼️', title: 'Media uploads', desc: 'Attach images and video up to 50 MB. Stored locally, served by the app.' },
  { icon: '✨', title: 'AI captions', desc: 'Optional OpenAI-compatible caption generation, with a built-in local fallback that works offline.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-xl font-bold text-white">⚡ Postivo</span>
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
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        <div className="mx-auto mb-6 inline-block rounded-full border border-indigo-800 bg-indigo-950/50 px-4 py-1 text-xs font-medium text-indigo-300">
          The radically simpler Postiz alternative
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-tight tracking-tight text-white">
          Schedule everywhere.
          <br />
          Self-host anywhere.{' '}
          <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            One binary.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          Postivo is a social media scheduler that runs as a single Next.js app with an embedded SQLite
          database and an in-process scheduler. No Postgres, no Redis, no worker fleet — just{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm text-indigo-300">npm start</code>.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
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
      </section>

      {/* Comparison */}
      <section id="compare" className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="mb-8 text-center text-2xl font-bold text-white">Postiz vs Postivo</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-800">
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

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="mb-3 text-2xl">{f.icon}</div>
              <h3 className="mb-1.5 font-semibold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="mb-8 text-center text-2xl font-bold text-white">Pricing</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h3 className="text-lg font-semibold text-white">Free</h3>
            <p className="mt-1 text-3xl font-bold text-white">$0</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-400">
              <li>✓ 3 connected channels</li>
              <li>✓ 30 scheduled posts per month</li>
              <li>✓ Calendar, queue & analytics</li>
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
              $12<span className="text-base font-normal text-slate-400">/mo</span>
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

      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-600">
        Postivo — MIT licensed open source social media scheduling.
      </footer>
    </div>
  );
}
