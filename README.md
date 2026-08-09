# ⚡ Postivo

**Schedule everywhere. Scale anywhere.**

Postivo is a radically simpler, open-source (MIT) social media scheduler — a lean alternative
to [Postiz](https://github.com/gitroomhq/postiz-app) — built as a **stateless, horizontally
scalable multi-tenant SaaS**: Next.js full-stack app + PostgreSQL + S3. No Redis, no BullMQ,
no Temporal, no worker fleet. Run 1 replica on your laptop or 20 behind a load balancer.

## Architecture

```
                        ┌────────────────────────────┐
        browsers/agents │        Load balancer       │
        ───────────────▶│  (any L7 LB / ingress)     │
                        └───────┬──────────┬─────────┘
                                │          │
                ┌───────────────┴──┐    ┌──┴───────────────┐
                │  Postivo app #1  │    │  Postivo app #N  │   stateless Next.js
                │  (Next.js + API) │    │  (Next.js + API) │   replicas — no local
                │  + scheduler     │    │  + scheduler     │   state required
                └───────┬──────────┘    └────────┬─────────┘
                        │                        │
              ┌─────────┴────────────────────────┴─────────┐
              ▼                                            ▼
   ┌─────────────────────┐                      ┌─────────────────────┐
   │   PostgreSQL 16     │                      │   S3 bucket         │
   │   (all app state;   │                      │   uploads/<user>/…  │
   │    SKIP LOCKED job  │                      │   (dev: local disk  │
   │    claiming)        │                      │    fallback)        │
   └─────────────────────┘                      └─────────────────────┘
```

- **Stateless app tier** — every replica serves the UI, the REST API and an in-process
  scheduler. Sessions are HMAC-signed cookies (set `JWT_SECRET` so all replicas share it).
- **Postgres is the only source of truth** — the scheduler claims due posts atomically with
  `UPDATE … FOR UPDATE SKIP LOCKED`, so N instances racing never publish the same post twice.
- **S3 for media** when `S3_BUCKET` is set (keys `uploads/<userId>/<id>.<ext>`, owner-checked
  reads via `/api/media/:id`); falls back to local disk under `DATA_DIR` in dev.

## Why Postivo over Postiz?

| | Postiz | Postivo |
|---|---|---|
| Services | 5+ (Next.js, NestJS, PostgreSQL, Redis, BullMQ/Temporal workers) | **App + Postgres** (S3 optional) |
| Queueing | Redis + BullMQ/Temporal | **Postgres `SKIP LOCKED`** — no extra infra |
| Memory | 2 GB+ across 5 services | **< 512 MB** per replica |
| License | AGPL-3.0 | **MIT** |
| API | Internal, UI-first | **Agent-first REST API** with Bearer API keys |
| Setup | Docker compose orchestration | `docker compose up -d && npm run dev` |

## Quickstart (local dev)

Requires Node.js 22+ and Docker.

```bash
docker compose up -d --wait   # Postgres 16 on :5432
npm install
npm run dev                   # http://localhost:3000 (schema auto-migrates on first query)
```

Production:

```bash
npm run build
DATABASE_URL=postgres://… JWT_SECRET=… npm run start
```

Smoke test (spins up Postgres itself if needed):

```bash
PORT=3000 bash scripts/smoke.sh
```

## Plans

| | Free | Pro ($12/mo) |
|---|---|---|
| Connected channels | 3 | 100 |
| Scheduled posts / calendar month | 30 | 10,000 |
| AI captions | — | ✓ |

Limits are enforced server-side; exceeding them returns **HTTP 402 `{error, upgrade:true}`**
and the UI shows an "Upgrade to Pro" banner linking to **Settings → Billing**.

## Billing (Stripe, optional)

Billing is fully env-gated: with no Stripe keys the app builds and runs normally, billing
routes return `503 billing_not_configured`, and the UI hides upgrade buttons.

```bash
STRIPE_SECRET_KEY=sk_live_…        # or sk_test_…
STRIPE_PRICE_PRO=price_…           # recurring price for the Pro plan
STRIPE_WEBHOOK_SECRET=whsec_…      # from `stripe listen` or the dashboard webhook
APP_URL=https://postivo.example.com
```

Routes: `POST /api/billing/checkout` (Checkout Session → `{url}`),
`POST /api/billing/portal` (customer portal → `{url}`),
`POST /api/billing/webhook` (raw-body signature-verified; handles
`checkout.session.completed` → plan=pro, `customer.subscription.deleted` → plan=free).

Point a Stripe webhook at `https://<app>/api/billing/webhook` for those two events.

## Features

- 📅 **Scheduling** — compose once, publish to many channels, per-channel content overrides
- 📆 **Calendar & Queue** — month view, scheduled/published/failed/drafts tabs, one-click retry
- 🖼️ **Media uploads** — images & video up to 50 MB, S3-backed in production
- ✨ **AI captions** — OpenAI-compatible caption generation (Pro), or a built-in offline fallback
- 🤖 **Agent API** — `pv_…` Bearer keys, `/api/v1/posts` + `/api/v1/channels`
- 📈 **Analytics** — publishes by provider, 14-day activity, publish log
- 📦 **Export** — one-click JSON export of all your data
- 🔁 **Reliable publishing** — scheduler claims due posts with `SKIP LOCKED` (multi-instance
  safe), 3 attempts with exponential backoff, per-target error capture
- 🛡️ **Hardened** — rate-limited auth endpoints, security headers, DB-backed `/api/health`

## Providers

| Provider | Connection fields | Notes |
|---|---|---|
| 🧪 Demo | — | Always succeeds; returns a fake URL. For testing. |
| 🪝 Webhook | URL, optional secret | POSTs `{content, media, scheduled_at, id}` with optional `X-Postivo-Secret`. Works with n8n / Zapier / Make. |
| 🦋 Bluesky | handle, app password | Settings → App Passwords on bsky.app. |
| 🐘 Mastodon | instance URL, access token | Preferences → Development → New application (`write:statuses`). |
| 👩‍💻 DEV | API key | dev.to Settings → Extensions → DEV Community API Keys. Publishes full articles. |
| 𝕏 | OAuth2 user access token | Needs `tweet.write` scope (user context). |
| 💼 LinkedIn | OAuth2 access token, person URN | `w_member_social` scope; URN looks like `urn:li:person:…`. |

Unknown providers or missing credentials fail safely: the scheduler marks the target failed with a
descriptive error, visible (and retryable) in the Queue.

## API

Everything the UI does is a JSON API. Cookie-session auth for the portal; Bearer API keys for agents.

```bash
# Health (no auth) — checks the DB
curl http://localhost:3000/api/health

# Register & login (sets postivo_session cookie; rate-limited to 10 req / 5 min / IP)
curl -c jar -X POST localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com","password":"supersecret"}'

# Connect a demo channel
curl -b jar -X POST localhost:3000/api/channels \
  -H 'content-type: application/json' \
  -d '{"provider":"demo","name":"My demo","credentials":{}}'

# Schedule a post
curl -b jar -X POST localhost:3000/api/posts \
  -H 'content-type: application/json' \
  -d '{"content":"Hello from Postivo!","channelIds":["<channelId>"],"scheduled_at":"2030-01-01T12:00:00.000Z"}'

# Usage / queue / analytics / export
curl -b jar localhost:3000/api/usage
curl -b jar 'localhost:3000/api/queue?tab=scheduled'
curl -b jar localhost:3000/api/analytics
curl -b jar localhost:3000/api/export -o export.json
```

### Agent API (API keys)

Create a key in **Settings → API keys** (shown once), then:

```bash
KEY=pv_xxxxxxxx...

curl -H "Authorization: Bearer $KEY" localhost:3000/api/v1/channels

curl -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"content":"Posted by an agent 🤖","channelIds":["<channelId>"],"scheduled_at":"2030-01-01T12:00:00.000Z"}' \
  localhost:3000/api/v1/posts

curl -H "Authorization: Bearer $KEY" 'localhost:3000/api/v1/posts?status=scheduled'
```

## Environment variables

See [.env.example](./.env.example).

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://postivo:postivo@localhost:5432/postivo` | Postgres connection string (required) |
| `DATABASE_SSL` | `false` | `true` → `ssl: { rejectUnauthorized: false }` (e.g. RDS) |
| `JWT_SECRET` | auto-generated into `${DATA_DIR}/jwt_secret` | HMAC secret for session tokens — **set it in multi-instance deploys** |
| `S3_BUCKET` | — | Enables S3 media storage (unset → local disk dev mode) |
| `AWS_REGION` | `us-east-1` | S3 region |
| `STRIPE_SECRET_KEY` | — | Enables Stripe billing |
| `STRIPE_PRICE_PRO` | — | Recurring Stripe price id for Pro |
| `STRIPE_WEBHOOK_SECRET` | — | Webhook signature verification |
| `APP_URL` | `http://localhost:3000` | Base URL for Stripe redirects |
| `OPENAI_API_KEY` | — | Enables real AI captions (Pro plan only) |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| `OPENAI_MODEL` | `gpt-4o-mini` | Caption model |
| `DATA_DIR` | `./data` | Local-disk uploads (dev) + generated secret |
| `PORT` | `3000` | Server port |

## Autoscaling notes

- The app is **stateless**: scale the app tier horizontally behind any load balancer. All
  shared state lives in Postgres; media in S3; sessions are signed cookies.
- Every replica runs its own 30s scheduler tick. Due posts are claimed with
  `FOR UPDATE SKIP LOCKED`, so a post is published **exactly once** no matter how many
  replicas race. A crashed replica's claims become claimable again after 5 minutes.
- Set `JWT_SECRET` on every replica. Use S3 (not local disk) once you run more than one
  replica or any ephemeral filesystem.
- The rate limiter is in-memory per instance (fine for auth brute-force protection); put a
  stricter global limit at the LB/WAF if needed.

## Security notes

- Passwords hashed with `crypto.scryptSync` (per-user salt) and verified with `timingSafeEqual`.
- Sessions are HMAC-SHA256 signed cookies (`httpOnly`, `sameSite=lax`, 30 days).
- API keys are stored as SHA-256 hashes; the plaintext is shown exactly once.
- Media reads are owner-checked and path-traversal safe (strict id validation).
- Auth endpoints are rate-limited; responses carry `X-Frame-Options`, `X-Content-Type-Options`
  and `Referrer-Policy` security headers.
- Stripe webhooks are signature-verified against the raw request body.

## Development

```bash
docker compose up -d --wait  # Postgres for local dev
npm run dev                  # dev server
npm run build                # production build (standalone output)
npm run start                # production server
bash scripts/smoke.sh        # end-to-end smoke test against a running server (PORT env to override)
```

## License

MIT. Do whatever you want.

---

## Production (live)

**https://82g4qd2zpd.ap-southeast-2.awsapprunner.com**

AWS (ap-southeast-2, acct 102301143129) — minimal autoscaling footprint:
- **App Runner** service `postivo` (0.25 vCPU / 0.5 GB, autoscales 1→10 instances @ 100 concurrent req each)
- **RDS** `postivo-db` (Postgres 16, db.t4g.micro) · **S3** `postivo-media-102301143129` · **ECR** `postivo`
- Secrets in Secrets Manager: `postivo/prod` (also `~/.config/postivo/`)

Redeploy after code changes:
```bash
AWS_REGION=ap-southeast-2 bash deploy/deploy.sh   # build → push → auto-deploys (URL stays stable)
```

To enable Stripe billing: create product/price, then update App Runner env
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_WEBHOOK_SECRET` (webhook URL: `<APP_URL>/api/billing/webhook`).

Mobile apps: `github.com/Mitsi-ag/postivo-mobile` — signed IPA + AAB/APK in `artifacts/`; iOS submission via `scripts/finish_ios.sh` after creating the ASC app record.
