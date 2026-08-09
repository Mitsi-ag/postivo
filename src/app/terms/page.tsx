import Link from 'next/link';

export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-slate-300">
      <Link href="/" className="text-indigo-400 hover:text-indigo-300">← Postivo</Link>
      <h1 className="mt-6 mb-8 text-3xl font-bold text-white">Terms of Service</h1>
      <p className="mb-4 text-sm text-slate-500">Last updated: August 9, 2026</p>
      <div className="space-y-6 leading-relaxed">
        <section>
          <h2 className="mb-2 text-xl font-semibold text-white">1. The service</h2>
          <p>Postivo lets you schedule and publish content to social platforms you connect. You must comply with each platform's terms; you are responsible for the content you schedule.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-white">2. Plans & billing</h2>
          <p>The Free plan is free forever with stated limits. Pro is billed monthly via Stripe and renews until cancelled. You can cancel anytime from Settings → Billing; access continues to the end of the paid period. No refunds for partial periods.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-white">3. Acceptable use</h2>
          <p>No spam, no illegal content, no abuse of platform APIs, no attempts to circumvent plan limits. We may suspend accounts that violate these rules.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-white">4. Liability</h2>
          <p>The service is provided "as is" without warranties. To the maximum extent permitted by law, liability is limited to the amount you paid in the last 12 months.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold text-white">5. Contact</h2>
          <p><a className="text-indigo-400" href="mailto:mitsi@keenshift.ai">mitsi@keenshift.ai</a></p>
        </section>
      </div>
    </div>
  );
}
