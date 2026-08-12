import Link from 'next/link';
import { Wordmark } from '@/components/icons';

export default function Privacy() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-fg">
        <Link href="/" className="font-mono text-xs uppercase tracking-[0.16em] text-dim transition-colors hover:text-iris-soft">← Postivo</Link>
        <h1 className="mt-6 mb-8 text-3xl font-bold text-fg">Privacy Policy</h1>
        <p className="mb-4 text-sm text-dim">Last updated: August 9, 2026</p>
        <div className="max-w-[68ch] space-y-6 leading-relaxed">
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">1. What we collect</h2>
            <p>Postivo collects the minimum data needed to operate the service: your email address, name, and timezone (account data); the social channel credentials you explicitly connect (stored encrypted at rest); and the content you schedule for publication.</p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">2. What we never do</h2>
            <p>We never sell your data, never train models on your content, never scrape your social accounts, and never access a platform on your behalf except to publish the posts you scheduled.</p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">3. Third-party processors</h2>
            <p>Infrastructure: AWS (Sydney, ap-southeast-2). Payments: Stripe (we never see your card number). Optional AI captions: OpenAI, only when you press the AI caption button, and only the text you provide is sent.</p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">4. Your controls</h2>
            <p>Settings → Export downloads everything we hold about you as JSON. Deleting a channel removes its credentials immediately. Deleting your account removes all associated data within 30 days.</p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">5. Contact</h2>
            <p>Privacy questions: <a className="text-iris-soft" href="mailto:support@postivo.keenshift.ai">support@postivo.keenshift.ai</a>.</p>
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
