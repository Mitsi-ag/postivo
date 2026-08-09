#!/usr/bin/env bash
# Postivo end-to-end smoke test.
# Usage: PORT=3100 bash scripts/smoke.sh   (server must already be running)
#
# If DATABASE_URL is unset, ensures local Postgres is up via docker compose.
set -u

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}"
JAR="$(mktemp -t postivo-smoke)"
EMAIL="smoke-$(date +%s)-$RANDOM@postivo.dev"
PASS="smoke-pass-123"
STEP=0

pass_step() { STEP=$((STEP + 1)); echo "  ✓ $1"; }
fail() { echo ""; echo "SMOKE FAIL at step $STEP: $1"; rm -f "$JAR"; exit 1; }

json_get() { python3 -c "import sys, json; d = json.load(sys.stdin); print($1)"; }

echo "== Postivo smoke test against $BASE =="

# 0. Postgres (only when the default local DATABASE_URL is in play)
if [ -z "${DATABASE_URL:-}" ]; then
  if ! pg_isready -h localhost -p 5432 -U postivo >/dev/null 2>&1; then
    echo "  … starting Postgres via docker compose"
    docker compose up -d --wait >/dev/null 2>&1 || fail "docker compose up -d --wait (Postgres)"
  fi
  pass_step "Postgres is up (docker compose)"
fi

# 1. Health (includes DB check)
HEALTH=$(curl -sf "$BASE/api/health") || fail "GET /api/health"
echo "$HEALTH" | grep -q '"ok":true' || fail "health payload unexpected: $HEALTH"
echo "$HEALTH" | grep -q '"db":true' || fail "health db check failed: $HEALTH"
pass_step "GET /api/health -> $HEALTH"

# 2. Register
REG=$(curl -sf -c "$JAR" -H 'content-type: application/json' \
  -d "{\"name\":\"Smoke\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$BASE/api/auth/register") || fail "POST /api/auth/register"
echo "$REG" | grep -q '"email"' || fail "register payload unexpected: $REG"
echo "$REG" | grep -q '"plan":"free"' || fail "new user not on free plan: $REG"
pass_step "POST /api/auth/register ($EMAIL, plan=free)"

# 3. Login (fresh cookie jar to prove login works)
LOGIN=$(curl -sf -c "$JAR" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$BASE/api/auth/login") || fail "POST /api/auth/login"
echo "$LOGIN" | grep -q '"email"' || fail "login payload unexpected: $LOGIN"
pass_step "POST /api/auth/login"

# 4. me
ME=$(curl -sf -b "$JAR" "$BASE/api/auth/me") || fail "GET /api/auth/me"
echo "$ME" | grep -q "$EMAIL" || fail "me payload unexpected: $ME"
pass_step "GET /api/auth/me"

# 5. Usage endpoint (free plan defaults, billing disabled without Stripe keys)
USAGE=$(curl -sf -b "$JAR" "$BASE/api/usage") || fail "GET /api/usage"
echo "$USAGE" | grep -q '"plan":"free"' || fail "usage plan unexpected: $USAGE"
echo "$USAGE" | grep -q '"billingEnabled":false' || fail "usage billingEnabled unexpected: $USAGE"
pass_step "GET /api/usage -> plan=free, billing disabled"

# 6. Free plan channel limit: 3 ok, 4th -> 402 upgrade
CHANNEL_ID=""
for i in 1 2 3; do
  CH=$(curl -sf -b "$JAR" -H 'content-type: application/json' \
    -d "{\"provider\":\"demo\",\"name\":\"Smoke Demo $i\",\"credentials\":{}}" \
    "$BASE/api/channels") || fail "POST /api/channels #$i"
  [ -z "$CHANNEL_ID" ] && CHANNEL_ID=$(echo "$CH" | json_get "d['channel']['id']")
done
CODE=$(curl -s -o /tmp/postivo-smoke-4th.json -w '%{http_code}' -b "$JAR" -H 'content-type: application/json' \
  -d '{"provider":"demo","name":"One too many","credentials":{}}' \
  "$BASE/api/channels")
[ "$CODE" = "402" ] || fail "4th channel should return 402, got $CODE: $(cat /tmp/postivo-smoke-4th.json)"
grep -q '"upgrade":true' /tmp/postivo-smoke-4th.json || fail "402 payload missing upgrade flag"
pass_step "free plan channel limit enforced (4th channel -> 402 upgrade)"

# 7. AI captions are Pro-only on free plan -> 402
CODE=$(curl -s -o /tmp/postivo-smoke-ai.json -w '%{http_code}' -b "$JAR" -H 'content-type: application/json' \
  -d '{"content":"hello world"}' "$BASE/api/ai/caption")
[ "$CODE" = "402" ] || fail "AI caption on free plan should return 402, got $CODE"
grep -q '"upgrade":true' /tmp/postivo-smoke-ai.json || fail "AI 402 payload missing upgrade flag"
pass_step "AI captions gated on free plan (402 upgrade)"

# 8. Billing routes return 503 when Stripe is not configured
CODE=$(curl -s -o /tmp/postivo-smoke-billing.json -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/billing/checkout")
[ "$CODE" = "503" ] || fail "billing checkout without Stripe keys should return 503, got $CODE"
grep -q 'billing_not_configured' /tmp/postivo-smoke-billing.json || fail "billing 503 payload unexpected"
pass_step "POST /api/billing/checkout -> 503 billing_not_configured"

# 9. Create post scheduled 1 minute ago
WHEN=$(python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) - timedelta(minutes=1)).strftime('%Y-%m-%dT%H:%M:%SZ'))")
POST=$(curl -sf -b "$JAR" -H 'content-type: application/json' \
  -d "{\"content\":\"Postivo smoke test post 🚀\",\"media\":[],\"scheduled_at\":\"$WHEN\",\"channelIds\":[\"$CHANNEL_ID\"]}" \
  "$BASE/api/posts") || fail "POST /api/posts"
POST_ID=$(echo "$POST" | json_get "d['post']['id']") || fail "parse post id"
pass_step "POST /api/posts (scheduled_at=$WHEN) -> $POST_ID"

# 10. Poll queue until the target is published (scheduler ticks every 30s)
echo "  … waiting for the scheduler to publish (up to 90s)"
PUBLISHED=""
for _ in $(seq 1 30); do
  sleep 3
  Q=$(curl -sf -b "$JAR" "$BASE/api/queue?tab=published" 2>/dev/null || true)
  if echo "$Q" | grep -q "$POST_ID" && echo "$Q" | grep -q '"external_url"'; then
    PUBLISHED="yes"
    break
  fi
done
[ -n "$PUBLISHED" ] || fail "post was not published within 90s"
pass_step "scheduler published the post (target has external_url)"

# 11. Queue tabs respond
curl -sf -b "$JAR" "$BASE/api/queue?tab=scheduled" >/dev/null || fail "queue scheduled"
curl -sf -b "$JAR" "$BASE/api/queue?tab=failed" >/dev/null || fail "queue failed"
pass_step "queue tabs respond"

# 12. Pages render
curl -sf "$BASE/" >/dev/null || fail "GET /"
curl -sf "$BASE/login" >/dev/null || fail "GET /login"
curl -sf "$BASE/" | grep -qi 'pricing' || fail "landing page missing pricing section"
pass_step "GET / (with pricing) and /login return 200"

rm -f "$JAR" /tmp/postivo-smoke-4th.json /tmp/postivo-smoke-ai.json /tmp/postivo-smoke-billing.json
echo ""
echo "SMOKE PASS — all $STEP checks green 🎉"
