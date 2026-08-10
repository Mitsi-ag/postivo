import Link from 'next/link';

export default function Support() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-fg">
      <Link href="/" className="font-mono text-xs uppercase tracking-[0.16em] text-dim transition-colors hover:text-iris-soft">← Postivo</Link>
      <h1 className="mt-6 mb-8 text-3xl font-bold text-fg">Support</h1>
      <div className="space-y-6 leading-relaxed">
        <p>Need help with Postivo? We answer every message within one business day.</p>
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-2 text-xl font-semibold text-fg">Email</h2>
          <p><a className="text-iris-soft" href="mailto:mitsi@keenshift.ai">mitsi@keenshift.ai</a></p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-fg">Common topics</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li><strong className="text-fg">Connecting channels</strong> — Channels → Add channel, pick a provider, paste its token. Bluesky and Mastodon work with just an app password/token.</li>
            <li><strong className="text-fg">Failed posts</strong> — Queue → Failed shows the exact platform error; hit Retry after fixing credentials.</li>
            <li><strong className="text-fg">Billing</strong> — Settings → Billing to upgrade, manage, or cancel. Handled securely by Stripe.</li>
            <li><strong className="text-fg">API access</strong> — Settings → API keys. Every core action is available via REST with a Bearer key.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
