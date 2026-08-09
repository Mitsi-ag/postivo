#!/usr/bin/env bash
# Postivo Phase-1 feature verification.
# Usage: PORT=3201 bash scripts/smoke-phase1.sh   (server must already be running)
set -u

PORT="${PORT:-3201}"
BASE="http://localhost:${PORT}"
JAR="$(mktemp -t postivo-p1)"
EMAIL="p1-$(date +%s)-$RANDOM@postivo.dev"
PASS="smoke-pass-123"
STEP=0
RSS_PORT=$(( (RANDOM % 20000) + 20000 ))
STATIC_DIR="$(mktemp -d /tmp/postivo-static.XXXX)"

pass_step() { STEP=$((STEP + 1)); echo "  ✓ $1"; }
fail() { echo ""; echo "PHASE1 FAIL at step $STEP: $1"; cleanup; exit 1; }
cleanup() {
  [ -n "${HTTP_PID:-}" ] && kill "$HTTP_PID" 2>/dev/null
  rm -f "$JAR"; rm -rf "$STATIC_DIR"
}
trap cleanup EXIT

json_get() { python3 -c "import sys, json; d = json.load(sys.stdin); print($1)"; }
psql_q() { psql "${DATABASE_URL:-postgres://postivo:postivo@localhost:5432/postivo}" -tA -c "$1"; }

echo "== Postivo phase-1 verification against $BASE =="

# --- static file server (RSS xml + PNG) ---
cat > "$STATIC_DIR/feed.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test Feed</title>
<item><title><![CDATA[Hello RSS World]]></title><link>http://example.com/post-1</link><guid>guid-1</guid><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
</channel></rss>
XML
python3 -c "
import struct, zlib
sig = b'\x89PNG\r\n\x1a\n'
def chunk(t, d):
    c = struct.pack('>I', len(d)) + t + d
    return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
ihdr = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
idat = zlib.compress(b'\x00\x00\x00\x00')
open('$STATIC_DIR/pic.png','wb').write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b''))
"
(cd "$STATIC_DIR" && python3 -m http.server $RSS_PORT >/dev/null 2>&1) &
HTTP_PID=$!
for _ in $(seq 1 20); do
  curl -sf "http://localhost:$RSS_PORT/feed.xml" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "http://localhost:$RSS_PORT/feed.xml" >/dev/null || fail "local static server"
pass_step "local static server up (feed.xml + pic.png)"

# --- auth + channel ---
curl -sf -c "$JAR" -H 'content-type: application/json' \
  -d "{\"name\":\"P1\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$BASE/api/auth/register" >/dev/null || fail "register"
CH=$(curl -sf -b "$JAR" -H 'content-type: application/json' \
  -d '{"provider":"demo","name":"P1 Demo","credentials":{}}' "$BASE/api/channels") || fail "create demo channel"
CHANNEL_ID=$(echo "$CH" | json_get "d['channel']['id']")
pass_step "registered + demo channel $CHANNEL_ID"

# --- signature on ---
PROF=$(curl -sf -b "$JAR" -H 'content-type: application/json' \
  -d '{"signature":"— Sent with Postivo","signature_enabled":true}' "$BASE/api/settings/profile") || fail "profile update"
echo "$PROF" | grep -q '"signature_enabled":true' || fail "signature_enabled not persisted: $PROF"
pass_step "signature enabled via /api/settings/profile"

# --- post with comments + tags, scheduled in the past ---
WHEN=$(python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) - timedelta(minutes=1)).strftime('%Y-%m-%dT%H:%M:%SZ'))")
POST=$(curl -sf -b "$JAR" -H 'content-type: application/json' \
  -d "{\"content\":\"Thread head\",\"scheduled_at\":\"$WHEN\",\"channelIds\":[\"$CHANNEL_ID\"],\"comments\":[{\"content\":\"first reply\",\"delayMin\":0}],\"tags\":[\"launch\"]}" \
  "$BASE/api/posts") || fail "create post with comments"
POST_ID=$(echo "$POST" | json_get "d['post']['id']")
echo "$POST" | grep -q '"delayMin":0' || fail "comments not echoed: $POST"
echo "$POST" | grep -q '"launch"' || fail "tags not echoed: $POST"
pass_step "post with comments+tags created ($POST_ID)"

# --- recurring post ---
POST2=$(curl -sf -b "$JAR" -H 'content-type: application/json' \
  -d "{\"content\":\"Evergreen post\",\"scheduled_at\":\"$WHEN\",\"channelIds\":[\"$CHANNEL_ID\"],\"repeat_every_days\":1}" \
  "$BASE/api/posts") || fail "create recurring post"
POST2_ID=$(echo "$POST2" | json_get "d['post']['id']")
pass_step "recurring post created ($POST2_ID)"

# --- RSS feed ---
RSS=$(curl -sf -b "$JAR" -H 'content-type: application/json' \
  -d "{\"url\":\"http://localhost:$RSS_PORT/feed.xml\",\"channelIds\":[\"$CHANNEL_ID\"],\"interval_min\":5,\"ai_caption\":false}" \
  "$BASE/api/rss") || fail "create rss feed"
FEED_ID=$(echo "$RSS" | json_get "d['feed']['id']")
curl -sf -b "$JAR" "$BASE/api/rss" | grep -q "$FEED_ID" || fail "rss list missing feed"
pass_step "RSS feed created + listed ($FEED_ID)"

# --- sets CRUD ---
SET=$(curl -sf -b "$JAR" -H 'content-type: application/json' \
  -d "{\"name\":\"My Set\",\"channelIds\":[\"$CHANNEL_ID\"]}" "$BASE/api/sets") || fail "create set"
SET_ID=$(echo "$SET" | json_get "d['set']['id']")
curl -sf -b "$JAR" "$BASE/api/sets" | grep -q "$SET_ID" || fail "sets list missing set"
curl -sf -b "$JAR" -X DELETE "$BASE/api/sets?id=$SET_ID" | grep -q '"ok":true' || fail "delete set"
pass_step "sets CRUD (create/list/delete)"

# --- upload by URL + media library ---
UP=$(curl -sf -b "$JAR" -H 'content-type: application/json' \
  -d "{\"url\":\"http://localhost:$RSS_PORT/pic.png\"}" "$BASE/api/upload/url") || fail "upload/url"
MEDIA_ID=$(echo "$UP" | json_get "d['id']")
echo "$MEDIA_ID" | grep -q '\.png$' || fail "upload/url id not a png: $MEDIA_ID"
ML=$(curl -sf -b "$JAR" "$BASE/api/media-list") || fail "media-list"
echo "$ML" | grep -q "$MEDIA_ID" || fail "media-list missing upload: $ML"
echo "$ML" | grep -q 'pic.png' || fail "media-list missing name: $ML"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE/api/media/$MEDIA_ID")
[ "$CODE" = "200" ] || fail "GET media before delete: $CODE"
curl -sf -b "$JAR" -X DELETE "$BASE/api/media/$MEDIA_ID" | grep -q '"ok":true' || fail "delete media"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE/api/media/$MEDIA_ID")
[ "$CODE" = "404" ] || fail "media should be 404 after delete, got $CODE"
pass_step "upload/url + media-list + media DELETE"

# --- openapi.json ---
curl -sf "$BASE/api/v1/openapi.json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['openapi'] == '3.1.0', d.get('openapi')
for p in ['/api/v1/posts', '/api/v1/posts/{id}', '/api/v1/channels', '/api/v1/openapi.json']:
    assert p in d['paths'], p
" || fail "openapi.json invalid"
pass_step "openapi.json is valid OpenAPI 3.1 covering v1 endpoints"

# --- best-time ---
BT=$(curl -sf -b "$JAR" "$BASE/api/best-time?channelIds=$CHANNEL_ID") || fail "best-time"
echo "$BT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert len(d['slots']) == 3, d
" || fail "best-time slots wrong: $BT"
pass_step "best-time returns 3 slots"

# --- v1 API with Bearer key ---
KEY=$(curl -sf -b "$JAR" -H 'content-type: application/json' -d '{"name":"p1"}' "$BASE/api/settings/keys") || fail "create api key"
TOKEN=$(echo "$KEY" | json_get "d['key']['token']")
V1=$(curl -sf -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"content\":\"V1 post\",\"scheduled_at\":\"$WHEN\",\"channelIds\":[\"$CHANNEL_ID\"],\"comments\":[{\"content\":\"v1 reply\",\"delayMin\":0}],\"tags\":[\"v1tag\"]}" \
  "$BASE/api/v1/posts") || fail "v1 create post"
V1_ID=$(echo "$V1" | json_get "d['post']['id']")
curl -sf -H "authorization: Bearer $TOKEN" "$BASE/api/v1/posts/$V1_ID" | grep -q '"v1tag"' || fail "v1 get post"
TAGF=$(curl -sf -H "authorization: Bearer $TOKEN" "$BASE/api/v1/posts?tag=v1tag") || fail "v1 tag filter"
echo "$TAGF" | grep -q "$V1_ID" || fail "v1 tag filter missing post"
TAGF2=$(curl -sf -H "authorization: Bearer $TOKEN" "$BASE/api/v1/posts?tag=nope") || fail "v1 tag filter 2"
echo "$TAGF2" | grep -q "$V1_ID" && fail "v1 tag filter should exclude post"
DATER=$(curl -sf -H "authorization: Bearer $TOKEN" "$BASE/api/v1/posts?start=2020-01-01T00:00:00Z&end=2030-01-01T00:00:00Z") || fail "v1 date filter"
echo "$DATER" | grep -q "$V1_ID" || fail "v1 date filter missing post"
pass_step "v1 API: create with comments+tags, get, tag + date filters"

# --- session tag filter ---
Q=$(curl -sf -b "$JAR" "$BASE/api/posts?tag=launch") || fail "session tag filter"
echo "$Q" | grep -q "$POST_ID" || fail "session tag filter missing post"
QQ=$(curl -sf -b "$JAR" "$BASE/api/queue?tab=scheduled&tag=launch") || fail "queue tag filter"
pass_step "session tag filters on /api/posts and /api/queue"

# --- wait for scheduler: publish, comment chain, recurring clone, RSS post ---
echo "  … waiting for the scheduler (up to 150s)"
for _ in $(seq 1 50); do
  sleep 3
  MAIN=$(psql_q "SELECT t.status FROM post_targets t JOIN posts p ON p.id=t.post_id WHERE p.id='$POST_ID'" 2>/dev/null)
  CMT=$(psql_q "SELECT COUNT(*) FROM post_targets_comments c JOIN post_targets t ON t.id=c.target_id WHERE t.post_id='$POST_ID' AND c.status='published'" 2>/dev/null)
  CLONE=$(psql_q "SELECT COUNT(*) FROM posts WHERE user_id=(SELECT user_id FROM posts WHERE id='$POST2_ID') AND content='Evergreen post' AND id<>'$POST2_ID' AND status='scheduled' AND repeat_every_days=1" 2>/dev/null)
  RSSP=$(psql_q "SELECT COUNT(*) FROM posts WHERE user_id=(SELECT user_id FROM posts WHERE id='$POST_ID') AND content LIKE '%Hello RSS World%'" 2>/dev/null)
  [ "$MAIN" = "published" ] && [ "$CMT" = "1" ] && [ "$CLONE" = "1" ] && [ "$RSSP" = "1" ] && break
done
[ "$MAIN" = "published" ] || fail "main target not published (status=$MAIN)"
pass_step "main post published"
[ "$CMT" = "1" ] || fail "chained comment not published (count=$CMT)"
pass_step "scheduled comment chained + published (delayMin=0)"
[ "$CLONE" = "1" ] || fail "recurring clone not scheduled (count=$CLONE)"
PARENT_REPEAT=$(psql_q "SELECT COALESCE(repeat_every_days,-1) FROM posts WHERE id='$POST2_ID'")
[ "$PARENT_REPEAT" = "-1" ] || fail "parent repeat not cleared (=$PARENT_REPEAT)"
CLONE_WHEN=$(psql_q "SELECT scheduled_at > now() + interval '20 hours' FROM posts WHERE content='Evergreen post' AND id<>'$POST2_ID' AND user_id=(SELECT user_id FROM posts WHERE id='$POST2_ID')")
[ "$CLONE_WHEN" = "t" ] || fail "clone not scheduled ~tomorrow ($CLONE_WHEN)"
pass_step "recurring post cloned (scheduled tomorrow, keeps repeat; parent cleared)"
[ "$RSSP" = "1" ] || fail "RSS item did not create a post (count=$RSSP)"
RSS_TAG=$(psql_q "SELECT tags::text FROM posts WHERE content LIKE '%Hello RSS World%' LIMIT 1")
echo "$RSS_TAG" | grep -q 'rss' || fail "RSS post missing rss tag: $RSS_TAG"
pass_step "RSS feed polled → post created with rss tag"

# --- RSS dedup: second poll creates nothing new ---
sleep 35
RSS_COUNT=$(psql_q "SELECT COUNT(*) FROM posts WHERE user_id=(SELECT user_id FROM posts WHERE id='$POST_ID') AND content LIKE '%Hello RSS World%'")
[ "$RSS_COUNT" = "1" ] || fail "RSS dedup failed — $RSS_COUNT posts for one item"
pass_step "RSS dedup via last_item_guid"

# --- signature was appended on publish (demo provider logs content) ---
grep -q 'Thread head' /tmp/postivo-server.log || fail "demo publish log missing content"
grep -q 'Sent with Postivo' /tmp/postivo-server.log || fail "signature not appended in published content"
pass_step "signature appended on publish (verified via demo provider log)"

# --- analytics refresh + engagement ---
AR=$(curl -sf -b "$JAR" -X POST "$BASE/api/analytics/refresh") || fail "analytics refresh"
echo "$AR" | grep -q '"ok":true' || fail "analytics refresh payload: $AR"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/analytics/refresh")
[ "$CODE" = "429" ] || fail "second refresh should be 429, got $CODE"
AN=$(curl -sf -b "$JAR" "$BASE/api/analytics") || fail "analytics"
echo "$AN" | grep -q '"engagement"' || fail "analytics missing engagement: $AN"
echo "$AN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['engagement']['likes'] > 0 or d['engagement']['views'] > 0, d['engagement']
" || fail "engagement not aggregated: $AN"
pass_step "analytics refresh (rate-limited 429) + engagement aggregation"

# --- v1 delete ---
curl -sf -H "authorization: Bearer $TOKEN" -X DELETE "$BASE/api/v1/posts/$V1_ID" | grep -q '"ok":true' || fail "v1 delete"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" "$BASE/api/v1/posts/$V1_ID")
[ "$CODE" = "404" ] || fail "v1 post should be 404 after delete, got $CODE"
pass_step "v1 DELETE post"

echo ""
echo "PHASE1 PASS — all $STEP checks green 🎉"
