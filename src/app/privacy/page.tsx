import Link from 'next/link';

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-slate-300">
      <Link href="/" className="text-indigo-400 hover:text-indigo-300">← Postivo</Link>
      <h1 className="mt-6 mb-8 text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="mb-4 text-sm text-slate-500">Last updated: August 9, 2026</p>
      <div className="space-y-6 leading-relaxed">
        <section>
          <h2 className="mb-2 text-xl font-semibold text-white">1. What we collect</h2>
          <p>Postivo collects the minimum data needed to operate the service: your email address, name, and timezone (account data); the social channel credentials you explicitly connect (stored encrypted at rest); and the content you schedule for publication.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-white">2. What we never do</h2>
          <p>We never sell your data, never train models on your content, never scrape your social accounts, and never access a platform on your behalf except to publish the posts you scheduled.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-white">3. Third-party processors</h2>
          <p>Infrastructure: AWS (Sydney, ap-southeast-2). Payments: Stripe (we never see your card number). Optional AI captions: OpenAI, only when you press the AI caption button, and only the text you provide is sent.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-white">4. Your controls</h2>
          <p>Settings → Export downloads everything we hold about you as JSON. Deleting a channel removes its credentials immediately. Deleting your account removes all associated data within 30 days.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-white">5. Contact</h2>
          <p>Privacy questions: <a className="text-indigo-400" href="mailto:mitsi@keenshift.ai">mitsi@keenshift.ai</a>.</p>
        </section>
      </div>
    </div>
  );
}
