import Link from 'next/link';
import { Wordmark } from '@/components/icons';

export default function Terms() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-fg">
        <Link href="/" className="font-mono text-xs uppercase tracking-[0.16em] text-dim transition-colors hover:text-iris-soft">← Postivo</Link>
        <h1 className="mt-6 mb-8 text-3xl font-bold text-fg">Terms of Service</h1>
        <p className="mb-4 text-sm text-dim">Last updated: August 9, 2026</p>
        <div className="max-w-[68ch] space-y-6 leading-relaxed">
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">1. The service</h2>
            <p>Postivo lets you schedule and publish content to social platforms you connect. You must comply with each platform's terms; you are responsible for the content you schedule.</p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">2. Plans & billing</h2>
            <p>The Free plan is free forever with stated limits. Pro is billed monthly via Stripe and renews until cancelled. You can cancel anytime from Settings → Billing; access continues to the end of the paid period. No refunds for partial periods.</p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">3. Acceptable use</h2>
            <p>No spam, no illegal content, no abuse of platform APIs, no attempts to circumvent plan limits. We may suspend accounts that violate these rules.</p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">4. Liability</h2>
            <p>The service is provided “as is” without warranties. To the maximum extent permitted by law, liability is limited to the amount you paid in the last 12 months.</p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold text-fg">5. Contact</h2>
            <p><a className="text-iris-soft" href="mailto:support@postivo.keenshift.ai">support@postivo.keenshift.ai</a></p>
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
