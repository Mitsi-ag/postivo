// SSRF guard for every server-side outbound fetch whose URL comes from a user
// (webhook provider, RSS feeds, media import by URL, outbound webhooks).
// Blocks URLs that resolve to private/loopback/link-local addresses.
//
// SSRF_ALLOW_HOSTS (comma-separated hostnames) whitelists specific hosts —
// used by local dev / test rigs that legitimately fetch from localhost.
// Never set it in production.

import dns from 'node:dns/promises';
import net from 'node:net';

function allowHosts(): Set<string> {
  return new Set(
    (process.env.SSRF_ALLOW_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true; // 0/8, 10/8, loopback
    if (a === 169 && b === 254) return true; // link-local (cloud metadata!)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 unique-local
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
    const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return false;
}

// Throws an Error with a user-facing message when the URL is not safe to fetch.
// Resolves the hostname and rejects if ANY resolved address is private.
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  const host = url.hostname.toLowerCase();
  if (allowHosts().has(host)) return url;
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error(`Blocked URL: ${host} is a private or loopback address`);
    }
    return url;
  }
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`Could not resolve host "${host}"`);
  }
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new Error(`Blocked URL: "${host}" resolves to a private or loopback address`);
    }
  }
  return url;
}

// fetch() with the SSRF guard applied to the URL and every redirect hop.
// (A public URL that 302s to 169.254.169.254 must not be followed.)
export async function guardedFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= maxRedirects) throw new Error('Too many redirects');
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
}
