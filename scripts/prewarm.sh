#!/usr/bin/env bash
# Prewarm a `next dev` instance so every route is compiled before the
# Playwright suite runs (dev-mode cold compiles can exceed the tests' 5s
# assertions). Usage: PORT=3220 bash scripts/prewarm.sh
set -u
PORT="${PORT:-3220}"
BASE="http://localhost:${PORT}"

for p in / /login /register /onboarding /dashboard /compose /calendar /queue /library \
  /automation /channels /analytics /settings /settings/billing /forgot-password \
  /reset-password /verify-email /privacy /terms /support /robots.txt /sitemap.xml; do
  curl -sf -o /dev/null --max-time 60 "$BASE$p" || curl -s -o /dev/null --max-time 60 "$BASE$p" || true
done

for p in /api/health /api/auth/me /api/channels /api/posts /api/queue /api/usage \
  /api/analytics /api/best-time /api/export /api/media-list /api/providers /api/rss \
  /api/sets /api/settings/keys /api/v1/posts /api/v1/channels /api/v1/openapi.json \
  "/api/auth/reset?token=x" /api/channels/x /api/posts/x /api/media/x; do
  curl -s -o /dev/null --max-time 60 "$BASE$p" || true
done

for p in /api/auth/register /api/auth/login /api/auth/logout /api/auth/forgot \
  /api/auth/verify /api/auth/verify/resend /api/ai/caption /api/billing/checkout \
  /api/billing/portal /api/billing/webhook /api/analytics/refresh /api/settings/password \
  /api/settings/profile /api/settings/account /api/targets/x/retry /api/upload/url; do
  curl -s -o /dev/null --max-time 60 -X POST -H 'content-type: application/json' -d '{}' "$BASE$p" || true
done
curl -s -o /dev/null --max-time 60 -X POST -F 'x=1' "$BASE/api/upload" || true

echo "prewarmed $BASE"
