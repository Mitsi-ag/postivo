import type { MetadataRoute } from 'next';

const BASE = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['/', '/login', '/register', '/privacy', '/terms', '/support'];
  return routes.map((path) => ({
    url: `${BASE}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.5,
  }));
}
