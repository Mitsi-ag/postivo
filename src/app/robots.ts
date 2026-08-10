import type { MetadataRoute } from 'next';

const BASE = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard',
        '/onboarding',
        '/compose',
        '/queue',
        '/calendar',
        '/library',
        '/analytics',
        '/automation',
        '/channels',
        '/settings',
      ],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
