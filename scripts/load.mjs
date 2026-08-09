// Load test driver (invoked by scripts/load.sh — do not run directly).
// 20 concurrent "users": register → login → create channel → schedule post.
// Then 500 concurrent GET /api/health. Fails (exit 1) on any 5xx.

const BASE = process.env.BASE_URL ?? 'http://localhost:3220';
const USERS = 20;
const HEALTH_CALLS = 500;

const run = `${Date.now().toString(36)}`;
let failures = 0;

function note5xx(label, res) {
  if (res.status >= 500) {
    failures += 1;
    console.error(`  ✗ 5xx on ${label}: ${res.status}`);
  }
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function userFlow(i) {
  const timings = [];
  const ip = `192.0.2.${(i % 250) + 1}`; // own rate-limit bucket per user
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': ip };
  const jar = [];
  const cookie = () => (jar.length ? { cookie: jar.join('; ') } : {});
  const track = (setCookie) => {
    for (const c of setCookie ?? []) jar.push(c.split(';')[0]);
  };

  async function call(label, path, init = {}) {
    const t0 = performance.now();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}), ...cookie() },
      redirect: 'manual',
    });
    track(res.headers.getSetCookie?.());
    timings.push(performance.now() - t0);
    note5xx(label, res);
    return res;
  }

  const email = `load-${i}-${run}@postivo.dev`;
  const password = `load-pass-${run}`;
  let res = await call('register', '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: `Load ${i}`, email, password }),
  });
  if (!res.ok) return { timings, ok: false, step: `register ${res.status}` };

  res = await call('login', '/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!res.ok) return { timings, ok: false, step: `login ${res.status}` };

  res = await call('create channel', '/api/channels', {
    method: 'POST',
    body: JSON.stringify({ provider: 'demo', name: `Load Demo ${i}`, credentials: {} }),
  });
  if (!res.ok) return { timings, ok: false, step: `channel ${res.status}` };
  const { channel } = await res.json();

  const when = new Date(Date.now() + 7 * 86_400_000).toISOString();
  res = await call('schedule post', '/api/posts', {
    method: 'POST',
    body: JSON.stringify({ content: `Load test post ${i} ${run}`, scheduled_at: when, channelIds: [channel.id] }),
  });
  if (!res.ok) return { timings, ok: false, step: `post ${res.status}` };

  return { timings, ok: true };
}

async function main() {
  console.log(`== Postivo load test against ${BASE} ==`);
  console.log(`  … ${USERS} concurrent users (register → login → channel → schedule post)`);

  const t0 = performance.now();
  const results = await Promise.all(Array.from({ length: USERS }, (_, i) => userFlow(i)));
  const wall = performance.now() - t0;

  const okCount = results.filter((r) => r.ok).length;
  const lat = results.flatMap((r) => r.timings).sort((a, b) => a - b);
  console.log(`  users ok: ${okCount}/${USERS}${okCount < USERS ? '  FAILED: ' + JSON.stringify(results.filter((r) => !r.ok).map((r) => r.step)) : ''}`);
  console.log(
    `  requests: ${lat.length} | wall ${wall.toFixed(0)}ms | p50 ${percentile(lat, 50).toFixed(0)}ms | p95 ${percentile(lat, 95).toFixed(0)}ms | p99 ${percentile(lat, 99).toFixed(0)}ms | max ${lat[lat.length - 1].toFixed(0)}ms`,
  );

  console.log(`  … ${HEALTH_CALLS} concurrent GET /api/health`);
  const ht0 = performance.now();
  const health = await Promise.all(
    Array.from({ length: HEALTH_CALLS }, async () => {
      const t = performance.now();
      const res = await fetch(`${BASE}/api/health`);
      note5xx('health', res);
      return { status: res.status, ms: performance.now() - t };
    }),
  );
  const hWall = performance.now() - ht0;
  const hLat = health.map((h) => h.ms).sort((a, b) => a - b);
  const h200 = health.filter((h) => h.status === 200).length;
  console.log(
    `  health 200s: ${h200}/${HEALTH_CALLS} | wall ${hWall.toFixed(0)}ms | p50 ${percentile(hLat, 50).toFixed(0)}ms | p95 ${percentile(hLat, 95).toFixed(0)}ms | max ${hLat[hLat.length - 1].toFixed(0)}ms`,
  );

  console.log(`  5xx total: ${failures}`);
  if (failures > 0 || okCount < USERS || h200 < HEALTH_CALLS) {
    console.log('LOAD FAIL');
    process.exit(1);
  }
  console.log('LOAD PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
