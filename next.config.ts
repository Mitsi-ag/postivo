import type { NextConfig } from 'next';

// Next.js App Router bootstraps hydration with inline RSC scripts
// (self.__next_f.push), so script-src needs 'unsafe-inline'; everything else
// stays locked to same-origin. Stripe checkout is a top-level navigation to
// checkout.stripe.com, which CSP does not restrict.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://api.stripe.com https://checkout.stripe.com",
  'frame-src https://checkout.stripe.com https://js.stripe.com',
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['pg', 'stripe', '@aws-sdk/client-s3'],
  async headers() {
    return [
      {
        // Media responses set their own CSP (SVG sandbox is stricter) — the
        // global CSP must not clobber it.
        source: '/((?!api/media).*)',
        headers: [...SECURITY_HEADERS, { key: 'Content-Security-Policy', value: CSP }],
      },
      {
        source: '/api/media/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
