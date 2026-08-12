import Link from 'next/link';
import { Wordmark } from '@/components/icons';

export default function Support() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-fg">
        <Link href="/" className="font-mono text-xs uppercase tracking-[0.16em] text-dim transition-colors hover:text-iris-soft">← Postivo</Link>
        <h1 className="mt-6 mb-8 text-3xl font-bold text-fg">Support</h1>
        <div className="max-w-[68ch] space-y-6 leading-relaxed">
          <p>Need help with Postivo? Send us a message and we&apos;ll get you unstuck. Pro customers: within one business day.</p>
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="mb-2 text-xl font-semibold text-fg">Email</h2>
            <p><a className="text-iris-soft" href="mailto:support@postivo.keenshift.ai">support@postivo.keenshift.ai</a></p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">Common topics</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li><strong className="text-fg">Connecting channels</strong> — Channels → Add channel, pick a provider, paste its token. Bluesky and Mastodon work with just an app password/token.</li>
              <li><strong className="text-fg">Failed posts</strong> — Queue → Failed shows the exact platform error; hit Retry after fixing credentials.</li>
              <li><strong className="text-fg">Billing</strong> — Settings → Billing to upgrade, manage, or cancel. Handled securely by Stripe.</li>
              <li><strong className="text-fg">API access</strong> — Settings → API keys. Create, read, update and delete posts and list channels via REST with a Bearer key; the full OpenAPI 3.1 spec is at <a className="text-iris-soft" href="/api/v1/openapi.json">/api/v1/openapi.json</a>.</li>
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">Open source</h2>
            <p>Postivo is MIT-licensed open source — issues, docs and the full codebase live on <a className="text-iris-soft" href="https://github.com/Mitsi-ag/postivo" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
          </section>
        </div>
      </div>
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
