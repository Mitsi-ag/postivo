// Simple in-memory fixed-window rate limiter.
// NOTE: limits are per app instance (stateless app tier). With N replicas the
// effective limit is N× — good enough for brute-force protection on auth
// endpoints; move to Redis/Postgres if a strict global limit is ever needed.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map doesn't grow unbounded.
let lastSweep = Date.now();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (now - lastSweep > windowMs) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export function clientIp(req: Request): string {
  // Behind App Runner (or any proxy that appends), the LAST X-Forwarded-For
  // entry is the client IP the platform saw — the leftmost values are
  // attacker-controlled and must not be trusted for rate limiting.
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const parts = fwd.split(',');
    return parts[parts.length - 1].trim();
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}
