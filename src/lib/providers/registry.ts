import crypto from 'node:crypto';
import type { Channel } from '../db';
import { guardedFetch, readBodyCapped } from '../ssrf';
import type { ProviderField, ProviderMeta } from '../types';

export interface PublishContext {
  postId: string;
  scheduledAt: string | null;
}

export interface PublishResult {
  externalUrl?: string;
  externalId?: string;
}

export interface Provider {
  id: string;
  name: string;
  icon: string;
  color: string;
  maxLength: number;
  supportsMedia: boolean;
  fields: ProviderField[];
  publish(
    channel: Channel,
    creds: Record<string, string>,
    content: string,
    mediaUrls: string[],
    ctx: PublishContext,
  ): Promise<PublishResult>;
  // Optional: publish `content` as a reply/comment to a previously published
  // item identified by externalId (as returned by publish()).
  reply?(channel: Channel, externalId: string, content: string): Promise<PublishResult>;
  // Optional: fetch engagement stats for a published item.
  stats?(channel: Channel, externalId: string): Promise<Record<string, number> | null>;
}

// Provider error bodies can contain internal details — log them server-side
// only. What reaches post_targets.error / publish_log / the UI is always a
// generic "returned HTTP <code>" message with no response-body content.
async function httpError(label: string, res: Response): Promise<Error> {
  const body = await res.text().catch(() => '');
  console.error(`[postivo] ${label}: HTTP ${res.status} — ${body.slice(0, 500)}`);
  return new Error(`${label} returned HTTP ${res.status}`);
}

// Non-HTTP provider errors parsed from response bodies: same rule.
function bodyError(label: string, detail: string): Error {
  console.error(`[postivo] ${label}: ${detail.slice(0, 500)}`);
  return new Error(`${label} returned an error`);
}

function firstLine(content: string, fallback = 'Untitled', max = 100): string {
  return (content.split('\n')[0] || fallback).slice(0, max) || fallback;
}

// Download media bytes back from our own signed URL for native platform upload.
async function fetchMediaBytes(url: string, maxBytes = 50 * 1024 * 1024): Promise<{ body: Buffer; contentType: string }> {
  const res = await guardedFetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw await httpError('media fetch', res);
  const body = await readBodyCapped(res, maxBytes);
  return { body, contentType: (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0] };
}

// Signed media URLs look like /api/media/<uuid>.<ext>?exp=…&sig=… — recover a
// filename for providers whose upload APIs want one (Discord, Slack, …).
function mediaFilename(url: string, fallback = 'media'): string {
  try {
    const name = new URL(url).pathname.split('/').pop();
    if (name) return name;
  } catch {
    // Unparseable URL — fall through to the fallback.
  }
  return fallback;
}

// YouTube re-downloads our own media for the resumable upload — cap it at the
// same 50MB the upload route enforces so a huge object can't OOM the instance.
const YOUTUBE_MAX_BYTES = 50 * 1024 * 1024;

// Fediverse-style instance hosts (Mastodon, Pixelfed, Friendica, PeerTube):
// accept "pixelfed.social" or "https://pixelfed.social/" and normalize to a
// bare base URL with no trailing slash. Plain http is rejected in production —
// instance tokens must never cross the wire unencrypted.
function normalizeInstance(raw: string, label: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error(`${label} instance is required`);
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error(`${label} instance is not a valid host`);
  }
  if (url.protocol !== 'https:' && (url.protocol !== 'http:' || process.env.NODE_ENV === 'production')) {
    throw new Error(`${label} instance must use https`);
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

// ---------- Bluesky helpers ----------

async function blueskySession(creds: Record<string, string>): Promise<{ jwt: string; did: string; handle: string }> {
  if (!creds.handle || !creds.appPassword) throw new Error('Bluesky handle and app password are required');
  const login = await guardedFetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: creds.handle, password: creds.appPassword }),
  });
  if (!login.ok) throw await httpError('Bluesky login', login);
  const session = (await login.json()) as { accessJwt?: string; did?: string; handle?: string };
  if (!session.accessJwt || !session.did) throw new Error('Bluesky login returned no session');
  return { jwt: session.accessJwt, did: session.did, handle: session.handle ?? session.did };
}

export const providers: Provider[] = [
  {
    id: 'demo',
    name: 'Demo Channel',
    icon: '🧪',
    color: '#64748b',
    maxLength: 2000,
    supportsMedia: true,
    fields: [],
    async publish(channel, _creds, content) {
      await new Promise((r) => setTimeout(r, 100));
      const id = Date.now().toString(36);
      console.log(`[postivo] demo publish on ${channel.name}: ${content.slice(0, 120)}`);
      return {
        externalUrl: `https://demo.postivo.local/${channel.id.slice(0, 8)}/${id}`,
        externalId: id,
      };
    },
    async reply(channel, externalId, content) {
      await new Promise((r) => setTimeout(r, 100));
      console.log(`[postivo] demo reply on ${channel.name} to ${externalId}: ${content.slice(0, 120)}`);
      return {
        externalUrl: `https://demo.postivo.local/${channel.id.slice(0, 8)}/${externalId}#c${Date.now().toString(36)}`,
        externalId: `${externalId}-c${Date.now().toString(36)}`,
      };
    },
    async stats(_channel, externalId) {
      // Deterministic pseudo-stats so the demo channel can exercise analytics.
      const h = crypto.createHash('sha256').update(externalId).digest();
      return {
        likes: h[0] * 3 + (h[1] % 7),
        reposts: h[2] % 11,
        replies: h[3] % 5,
        views: 100 + h[4] * 13,
      };
    },
  },
  {
    id: 'webhook',
    name: 'Webhook',
    icon: '🪝',
    color: '#f59e0b',
    maxLength: 10000,
    supportsMedia: true,
    fields: [
      { key: 'url', label: 'Webhook URL', placeholder: 'https://hooks.example.com/…' },
      { key: 'secret', label: 'Secret (sent as X-Postivo-Secret)', secret: true, optional: true },
    ],
    async publish(_channel, creds, content, mediaUrls, ctx) {
      if (!creds.url) throw new Error('Webhook URL is missing');
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (creds.secret) headers['x-postivo-secret'] = creds.secret;
      const res = await guardedFetch(creds.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content, media: mediaUrls, scheduled_at: ctx.scheduledAt, id: ctx.postId }),
      });
      if (!res.ok) throw await httpError('Webhook', res);
      return {};
    },
  },
  {
    id: 'bluesky',
    name: 'Bluesky',
    icon: '🦋',
    color: '#0285ff',
    maxLength: 300,
    supportsMedia: true,
    fields: [
      { key: 'handle', label: 'Handle', placeholder: 'you.bsky.social' },
      { key: 'appPassword', label: 'App password', secret: true, placeholder: 'xxxx-xxxx-xxxx-xxxx' },
    ],
    async publish(channel, creds, content, mediaUrls) {
      const session = await blueskySession(creds);
      // Native image upload: pull the bytes back from our signed media URLs
      // and uploadBlob them (app.bsky.embed.images allows max 4 images).
      const images: { alt: string; image: unknown }[] = [];
      for (const url of mediaUrls.slice(0, 4)) {
        const { body, contentType } = await fetchMediaBytes(url, 10 * 1024 * 1024);
        if (!contentType.startsWith('image/')) continue; // videos are skipped
        const up = await guardedFetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
          method: 'POST',
          headers: { authorization: `Bearer ${session.jwt}`, 'content-type': contentType },
          body: new Uint8Array(body),
          signal: AbortSignal.timeout(60_000),
        });
        if (!up.ok) throw await httpError('Bluesky image upload', up);
        const blob = ((await up.json()) as { blob?: unknown }).blob;
        if (!blob) throw new Error('Bluesky image upload returned no blob');
        images.push({ alt: '', image: blob });
      }
      if (mediaUrls.length && !images.length) {
        throw new Error('Bluesky supports image attachments only — video upload is not supported');
      }
      const record: Record<string, unknown> = {
        $type: 'app.bsky.feed.post',
        text: content.slice(0, 300),
        createdAt: new Date().toISOString(),
      };
      if (images.length) record.embed = { $type: 'app.bsky.embed.images', images };
      const res = await guardedFetch('https://bsky.social/xrpc/app.bsky.feed.post', {
        method: 'POST',
        headers: { authorization: `Bearer ${session.jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          repo: session.did,
          collection: 'app.bsky.feed.post',
          record,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw await httpError('Bluesky post', res);
      const data = (await res.json()) as { uri?: string };
      const rkey = data.uri?.split('/').pop();
      return {
        externalUrl: rkey ? `https://bsky.app/profile/${session.handle}/post/${rkey}` : undefined,
        externalId: data.uri,
      };
    },
    async reply(channel, externalId, content) {
      const creds = channel.credentials ?? {};
      const session = await blueskySession(creds);
      // Resolve the parent's CID (required for a reply reference).
      const get = await guardedFetch(
        `https://bsky.social/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(externalId)}`,
        { headers: { authorization: `Bearer ${session.jwt}` } },
      );
      if (!get.ok) throw await httpError('Bluesky could not load parent post', get);
      const posts = ((await get.json()) as { posts?: { uri: string; cid: string }[] }).posts ?? [];
      if (!posts[0]) throw new Error('Bluesky parent post not found for reply');
      const ref = { uri: posts[0].uri, cid: posts[0].cid };
      const res = await guardedFetch('https://bsky.social/xrpc/app.bsky.feed.post', {
        method: 'POST',
        headers: { authorization: `Bearer ${session.jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          repo: session.did,
          collection: 'app.bsky.feed.post',
          record: {
            $type: 'app.bsky.feed.post',
            text: content.slice(0, 300),
            createdAt: new Date().toISOString(),
            reply: { root: ref, parent: ref },
          },
        }),
      });
      if (!res.ok) throw await httpError('Bluesky reply', res);
      const data = (await res.json()) as { uri?: string };
      const rkey = data.uri?.split('/').pop();
      return {
        externalUrl: rkey ? `https://bsky.app/profile/${session.handle}/post/${rkey}` : undefined,
        externalId: data.uri,
      };
    },
    async stats(_channel, externalId) {
      const res = await guardedFetch(
        `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(externalId)}`,
      );
      if (!res.ok) return null;
      const post = ((await res.json()) as { posts?: { likeCount?: number; repostCount?: number; replyCount?: number }[] })
        .posts?.[0];
      if (!post) return null;
      return { likes: post.likeCount ?? 0, reposts: post.repostCount ?? 0, replies: post.replyCount ?? 0 };
    },
  },
  {
    id: 'mastodon',
    name: 'Mastodon',
    icon: '🐘',
    color: '#6364ff',
    maxLength: 500,
    supportsMedia: true,
    fields: [
      { key: 'instanceUrl', label: 'Instance URL', placeholder: 'https://mastodon.social' },
      { key: 'accessToken', label: 'Access token', secret: true },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.instanceUrl || !creds.accessToken) throw new Error('Mastodon instance URL and access token are required');
      const instance = normalizeInstance(creds.instanceUrl, 'Mastodon');
      // Native media upload — a failed upload throws (retryable) rather than
      // silently degrading the post to pasted URLs.
      const mediaIds: string[] = [];
      for (const url of mediaUrls) {
        const { body, contentType } = await fetchMediaBytes(url);
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(body)], { type: contentType }), mediaFilename(url));
        const up = await guardedFetch(`${instance}/api/v2/media`, {
          method: 'POST',
          headers: { authorization: `Bearer ${creds.accessToken}` },
          body: form,
          signal: AbortSignal.timeout(60_000),
        });
        if (!up.ok) throw await httpError('Mastodon media upload', up);
        const id = ((await up.json()) as { id?: string }).id;
        if (!id) throw new Error('Mastodon media upload returned no id');
        mediaIds.push(id);
      }
      const res = await guardedFetch(`${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: content, ...(mediaIds.length ? { media_ids: mediaIds } : {}) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw await httpError('Mastodon post', res);
      const data = (await res.json()) as { url?: string; id?: string };
      return { externalUrl: data.url, externalId: data.id };
    },
    async reply(channel, externalId, content) {
      const creds = channel.credentials ?? {};
      if (!creds.instanceUrl || !creds.accessToken) throw new Error('Mastodon instance URL and access token are required');
      const instance = normalizeInstance(creds.instanceUrl, 'Mastodon');
      const res = await guardedFetch(`${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: content, in_reply_to_id: externalId }),
      });
      if (!res.ok) throw await httpError('Mastodon reply', res);
      const data = (await res.json()) as { url?: string; id?: string };
      return { externalUrl: data.url, externalId: data.id };
    },
    async stats(channel, externalId) {
      const creds = channel.credentials ?? {};
      if (!creds.instanceUrl || !creds.accessToken) return null;
      const instance = normalizeInstance(creds.instanceUrl, 'Mastodon');
      const res = await guardedFetch(`${instance}/api/v1/statuses/${encodeURIComponent(externalId)}`, {
        headers: { authorization: `Bearer ${creds.accessToken}` },
      });
      if (!res.ok) return null;
      const s = (await res.json()) as { favourites_count?: number; reblogs_count?: number; replies_count?: number };
      return {
        likes: s.favourites_count ?? 0,
        reposts: s.reblogs_count ?? 0,
        replies: s.replies_count ?? 0,
      };
    },
  },
  {
    id: 'pixelfed',
    name: 'Pixelfed',
    icon: '🖼️',
    color: '#d62976',
    maxLength: 1000,
    supportsMedia: true,
    fields: [
      { key: 'instance', label: 'Instance', placeholder: 'pixelfed.social' },
      { key: 'access_token', label: 'Access token', secret: true, placeholder: 'Settings → Applications' },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.instance || !creds.access_token) throw new Error('Pixelfed instance and access token are required');
      // Pixelfed is photo-first — there is no text-only post.
      if (!mediaUrls.length) throw new Error('Pixelfed requires an image or video');
      const instance = normalizeInstance(creds.instance, 'Pixelfed');
      // Mastodon-compatible media upload; older Pixelfed versions only expose
      // /api/v1/media, so fall back to it when v2 answers 404.
      const mediaIds: string[] = [];
      for (const url of mediaUrls) {
        const { body, contentType } = await fetchMediaBytes(url);
        const form = () => {
          const f = new FormData();
          f.append('file', new Blob([new Uint8Array(body)], { type: contentType }), mediaFilename(url));
          return f;
        };
        let up = await guardedFetch(`${instance}/api/v2/media`, {
          method: 'POST',
          headers: { authorization: `Bearer ${creds.access_token}` },
          body: form(),
          signal: AbortSignal.timeout(60_000),
        });
        if (up.status === 404) {
          await up.body?.cancel().catch(() => {}); // release the socket before the retry
          up = await guardedFetch(`${instance}/api/v1/media`, {
            method: 'POST',
            headers: { authorization: `Bearer ${creds.access_token}` },
            body: form(),
            signal: AbortSignal.timeout(60_000),
          });
        }
        if (!up.ok) throw await httpError('Pixelfed media upload', up);
        const id = ((await up.json()) as { id?: string }).id;
        if (!id) throw new Error('Pixelfed media upload returned no id');
        mediaIds.push(id);
      }
      const res = await guardedFetch(`${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: content, media_ids: mediaIds }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw await httpError('Pixelfed post', res);
      const data = (await res.json()) as { url?: string; id?: string };
      return { externalUrl: data.url, externalId: data.id };
    },
  },
  {
    id: 'friendica',
    name: 'Friendica',
    icon: '🤝',
    color: '#1e87c9',
    maxLength: 5000,
    supportsMedia: true,
    fields: [
      { key: 'instance', label: 'Instance', placeholder: 'friendica.example.com' },
      { key: 'access_token', label: 'Access token', secret: true, placeholder: 'Settings → OAuth apps' },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.instance || !creds.access_token) throw new Error('Friendica instance and access token are required');
      const instance = normalizeInstance(creds.instance, 'Friendica');
      // Mastodon-compatible API: media first (v2 endpoint), then the status.
      const mediaIds: string[] = [];
      for (const url of mediaUrls) {
        const { body, contentType } = await fetchMediaBytes(url);
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(body)], { type: contentType }), mediaFilename(url));
        const up = await guardedFetch(`${instance}/api/v2/media`, {
          method: 'POST',
          headers: { authorization: `Bearer ${creds.access_token}` },
          body: form,
          signal: AbortSignal.timeout(60_000),
        });
        if (!up.ok) throw await httpError('Friendica media upload', up);
        const id = ((await up.json()) as { id?: string }).id;
        if (!id) throw new Error('Friendica media upload returned no id');
        mediaIds.push(id);
      }
      const res = await guardedFetch(`${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: content, ...(mediaIds.length ? { media_ids: mediaIds } : {}) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw await httpError('Friendica post', res);
      const data = (await res.json()) as { url?: string; id?: string };
      return { externalUrl: data.url, externalId: data.id };
    },
  },
  {
    id: 'peertube',
    name: 'PeerTube',
    icon: '📺',
    color: '#f1680d',
    maxLength: 5000,
    supportsMedia: true,
    fields: [
      { key: 'instance', label: 'Instance', placeholder: 'peertube.example.com' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password', secret: true },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.instance || !creds.username || !creds.password) {
        throw new Error('PeerTube instance, username and password are required');
      }
      const video = mediaUrls[0];
      // PeerTube is a video platform — there is no text/image post.
      if (!video) throw new Error('PeerTube requires a video');
      const instance = normalizeInstance(creds.instance, 'PeerTube');
      // PeerTube's API is NOT Mastodon-compatible: OAuth password grant against
      // the instance's built-in client, then a multipart video upload.
      const oc = await guardedFetch(`${instance}/api/v1/oauth-clients/local`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!oc.ok) throw await httpError('PeerTube OAuth client', oc);
      const client = (await oc.json()) as { client_id?: string; client_secret?: string };
      if (!client.client_id || !client.client_secret) throw new Error('PeerTube OAuth client returned no credentials');
      const token = await guardedFetch(`${instance}/api/v1/users/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: client.client_id,
          client_secret: client.client_secret,
          grant_type: 'password',
          response_type: 'code',
          username: creds.username,
          password: creds.password,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!token.ok) throw await httpError('PeerTube login', token);
      const accessToken = ((await token.json()) as { access_token?: string }).access_token;
      if (!accessToken) throw new Error('PeerTube login returned no access token');
      const auth = { authorization: `Bearer ${accessToken}` };
      // Uploads go to a video channel — take the account's first one.
      const me = await guardedFetch(`${instance}/api/v1/users/me`, {
        headers: auth,
        signal: AbortSignal.timeout(30_000),
      });
      if (!me.ok) throw await httpError('PeerTube account', me);
      const channelId = ((await me.json()) as { videoChannels?: { id?: number }[] }).videoChannels?.[0]?.id;
      if (!channelId) throw new Error('PeerTube account has no video channel');
      const { body, contentType } = await fetchMediaBytes(video);
      if (!contentType.startsWith('video/')) throw new Error('PeerTube requires a video');
      const form = new FormData();
      form.append('name', firstLine(content, 'Postivo video', 120));
      form.append('description', content.slice(0, 5000));
      form.append('privacy', '1'); // 1 = public
      form.append('channelId', String(channelId));
      form.append('videofile', new Blob([new Uint8Array(body)], { type: contentType }), mediaFilename(video, 'video.mp4'));
      const res = await guardedFetch(`${instance}/api/v1/videos/upload`, {
        method: 'POST',
        headers: auth,
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw await httpError('PeerTube video upload', res);
      const data = (await res.json()) as { video?: { uuid?: string; shortUUID?: string } };
      const vid = data.video?.shortUUID ?? data.video?.uuid;
      return {
        externalId: data.video?.uuid,
        externalUrl: vid ? `${instance}/w/${vid}` : undefined,
      };
    },
  },
  {
    id: 'devto',
    name: 'DEV Community',
    icon: '👩‍💻',
    color: '#e2e8f0',
    maxLength: 100000,
    supportsMedia: false,
    fields: [{ key: 'apiKey', label: 'API key', secret: true }],
    async publish(_channel, creds, content) {
      if (!creds.apiKey) throw new Error('DEV API key is required');
      const title = firstLine(content);
      const res = await guardedFetch('https://dev.to/api/articles', {
        method: 'POST',
        headers: { 'api-key': creds.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ article: { title, body_markdown: content, published: true } }),
      });
      if (!res.ok) throw await httpError('DEV publish', res);
      const data = (await res.json()) as { url?: string; id?: number };
      return { externalUrl: data.url, externalId: data.id ? String(data.id) : undefined };
    },
    async stats(channel, externalId) {
      const creds = channel.credentials ?? {};
      if (!creds.apiKey) return null;
      const res = await guardedFetch(`https://dev.to/api/articles/${encodeURIComponent(externalId)}`, {
        headers: { 'api-key': creds.apiKey },
      });
      if (!res.ok) return null;
      const a = (await res.json()) as {
        page_views_count?: number;
        public_reactions_count?: number;
        comments_count?: number;
      };
      return {
        views: a.page_views_count ?? 0,
        likes: a.public_reactions_count ?? 0,
        comments: a.comments_count ?? 0,
      };
    },
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    icon: '𝕏',
    color: '#e7e9ea',
    maxLength: 280,
    supportsMedia: true,
    fields: [
      {
        key: 'bearerToken',
        label: 'OAuth2 user access token',
        secret: true,
        placeholder: 'Requires tweet.write + media.write scopes',
      },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.bearerToken) {
        throw new Error('X requires an OAuth2 user-context access token with the tweet.write scope');
      }
      // Native image upload via the chunked INIT → APPEND → FINALIZE flow.
      const mediaIds: string[] = [];
      for (const url of mediaUrls.slice(0, 4)) {
        const { body, contentType } = await fetchMediaBytes(url);
        if (!contentType.startsWith('image/')) continue; // videos are skipped
        const init = await guardedFetch('https://api.x.com/2/media/upload?command=INIT&media_category=tweet_image', {
          method: 'POST',
          headers: { authorization: `Bearer ${creds.bearerToken}`, 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ media_type: contentType, total_bytes: String(body.byteLength) }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!init.ok) {
          if (init.status === 403) {
            const detail = await init.text().catch(() => '');
            console.error(`[postivo] X media upload INIT: HTTP 403 — ${detail.slice(0, 500)}`);
            if (/scope/i.test(detail)) {
              throw new Error('X media upload requires an OAuth2 user token with the media.write scope');
            }
            throw new Error('X media upload INIT returned HTTP 403');
          }
          throw await httpError('X media upload INIT', init);
        }
        const mediaId = ((await init.json()) as { data?: { id?: string } }).data?.id;
        if (!mediaId) throw new Error('X media upload INIT returned no media id');
        const form = new FormData();
        form.append('media', new Blob([new Uint8Array(body)], { type: contentType }), mediaFilename(url));
        const append = await guardedFetch(
          `https://api.x.com/2/media/upload?command=APPEND&media_id=${encodeURIComponent(mediaId)}&segment_index=0`,
          {
            method: 'POST',
            headers: { authorization: `Bearer ${creds.bearerToken}` },
            body: form,
            signal: AbortSignal.timeout(60_000),
          },
        );
        if (!append.ok) throw await httpError('X media upload APPEND', append);
        const fin = await guardedFetch(
          `https://api.x.com/2/media/upload?command=FINALIZE&media_id=${encodeURIComponent(mediaId)}`,
          { method: 'POST', headers: { authorization: `Bearer ${creds.bearerToken}` }, signal: AbortSignal.timeout(30_000) },
        );
        if (!fin.ok) throw await httpError('X media upload FINALIZE', fin);
        mediaIds.push(mediaId);
      }
      if (mediaUrls.length && !mediaIds.length) throw new Error('X video upload is not supported yet');
      const res = await guardedFetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.bearerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          text: content.slice(0, 280),
          ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw await httpError('X API', res);
      const data = (await res.json()) as { data?: { id?: string } };
      return {
        externalUrl: data.data?.id ? `https://x.com/i/web/status/${data.data.id}` : undefined,
        externalId: data.data?.id,
      };
    },
    async reply(channel, externalId, content) {
      const creds = channel.credentials ?? {};
      if (!creds.bearerToken) {
        throw new Error('X requires an OAuth2 user-context access token with the tweet.write scope');
      }
      const res = await guardedFetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.bearerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          text: content.slice(0, 280),
          reply: { in_reply_to_tweet_id: externalId },
        }),
      });
      if (!res.ok) throw await httpError('X reply', res);
      const data = (await res.json()) as { data?: { id?: string } };
      return {
        externalUrl: data.data?.id ? `https://x.com/i/web/status/${data.data.id}` : undefined,
        externalId: data.data?.id,
      };
    },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '💼',
    color: '#0a66c2',
    maxLength: 3000,
    supportsMedia: true,
    fields: [
      { key: 'accessToken', label: 'OAuth2 access token', secret: true },
      { key: 'personUrn', label: 'Person URN', placeholder: 'urn:li:person:XXXXXXXX' },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.accessToken || !creds.personUrn) throw new Error('LinkedIn access token and person URN are required');
      const headers = {
        authorization: `Bearer ${creds.accessToken}`,
        'content-type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      };
      // Native image upload (first image only) in the ugcPosts family:
      // register the asset, PUT the bytes to the signed uploadUrl, then
      // reference the asset URN in the share's media array.
      let shareMediaCategory = 'NONE';
      let media: { status: string; media: string }[] | undefined;
      if (mediaUrls[0]) {
        const { body, contentType } = await fetchMediaBytes(mediaUrls[0]);
        if (!contentType.startsWith('image/')) throw new Error('LinkedIn supports image attachments only');
        const reg = await guardedFetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
              owner: creds.personUrn,
              serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
            },
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!reg.ok) throw await httpError('LinkedIn image register', reg);
        const rv = (await reg.json()) as {
          value?: {
            asset?: string;
            uploadMechanism?: { 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: { uploadUrl?: string } };
          };
        };
        const asset = rv.value?.asset;
        const uploadUrl = rv.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
        if (!asset || !uploadUrl) throw new Error('LinkedIn image register returned no upload URL');
        const up = await guardedFetch(uploadUrl, {
          method: 'PUT',
          headers: { authorization: `Bearer ${creds.accessToken}`, 'content-type': contentType },
          body: new Uint8Array(body),
          signal: AbortSignal.timeout(60_000),
        });
        if (!up.ok) throw await httpError('LinkedIn image upload', up);
        shareMediaCategory = 'IMAGE';
        media = [{ status: 'READY', media: asset }];
      }
      const res = await guardedFetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          author: creds.personUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: content },
              shareMediaCategory,
              ...(media ? { media } : {}),
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw await httpError('LinkedIn publish', res);
      const id = res.headers.get('x-restli-id') || ((await res.json().catch(() => ({}))) as { id?: string }).id;
      return { externalUrl: id ? `https://www.linkedin.com/feed/update/${id}/` : undefined, externalId: id };
    },
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    color: '#229ed9',
    maxLength: 4096,
    supportsMedia: true,
    fields: [
      { key: 'botToken', label: 'Bot token', secret: true, placeholder: '123456:ABC-DEF…' },
      { key: 'chatId', label: 'Chat / channel ID', placeholder: '@mychannel or -100…' },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.botToken || !creds.chatId) throw new Error('Telegram bot token and chat ID are required');
      // Native media: sendPhoto/sendVideo with a multipart upload (first item
      // only). Media captions are capped at 1024 chars by the Bot API.
      if (mediaUrls[0]) {
        const { body, contentType } = await fetchMediaBytes(mediaUrls[0]);
        const isVideo = contentType.startsWith('video/');
        const method = isVideo ? 'sendVideo' : 'sendPhoto';
        const form = new FormData();
        form.append('chat_id', creds.chatId);
        form.append('caption', content.slice(0, 1024));
        form.append(isVideo ? 'video' : 'photo', new Blob([new Uint8Array(body)], { type: contentType }), mediaFilename(mediaUrls[0]));
        const res = await guardedFetch(`https://api.telegram.org/bot${creds.botToken}/${method}`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw await httpError(`Telegram ${method}`, res);
        const data = (await res.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
        if (!data.ok) throw bodyError(`Telegram ${method}`, data.description ?? 'unknown');
        return { externalId: data.result?.message_id ? String(data.result.message_id) : undefined };
      }
      const res = await guardedFetch(`https://api.telegram.org/bot${creds.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: creds.chatId, text: content.slice(0, 4096) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw await httpError('Telegram sendMessage', res);
      const data = (await res.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      if (!data.ok) throw bodyError('Telegram sendMessage', data.description ?? 'unknown');
      return { externalId: data.result?.message_id ? String(data.result.message_id) : undefined };
    },
    async reply(channel, externalId, content) {
      const creds = channel.credentials ?? {};
      if (!creds.botToken || !creds.chatId) throw new Error('Telegram bot token and chat ID are required');
      const res = await guardedFetch(`https://api.telegram.org/bot${creds.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: creds.chatId,
          text: content.slice(0, 4096),
          reply_to_message_id: Number(externalId),
        }),
      });
      if (!res.ok) throw await httpError('Telegram reply', res);
      const data = (await res.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      if (!data.ok) throw bodyError('Telegram reply', data.description ?? 'unknown');
      return { externalId: data.result?.message_id ? String(data.result.message_id) : undefined };
    },
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: '🎮',
    color: '#5865f2',
    maxLength: 2000,
    supportsMedia: true,
    fields: [{ key: 'webhookUrl', label: 'Webhook URL', secret: true, placeholder: 'https://discord.com/api/webhooks/…' }],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.webhookUrl) throw new Error('Discord webhook URL is missing');
      const url = creds.webhookUrl + (creds.webhookUrl.includes('?') ? '&' : '?') + 'wait=true';
      let res: Response;
      if (mediaUrls[0]) {
        // Native attachment: multipart with payload_json + one file.
        const { body, contentType } = await fetchMediaBytes(mediaUrls[0]);
        const form = new FormData();
        form.append('payload_json', JSON.stringify({ content: content.slice(0, 2000) }));
        form.append('file', new Blob([new Uint8Array(body)], { type: contentType }), mediaFilename(mediaUrls[0]));
        res = await guardedFetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
      } else {
        res = await guardedFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: content.slice(0, 2000) }),
          signal: AbortSignal.timeout(30_000),
        });
      }
      if (!res.ok) throw await httpError('Discord webhook', res);
      const data = (await res.json().catch(() => ({}))) as { id?: string; channel_id?: string };
      return {
        externalId: data.id,
        externalUrl:
          data.id && data.channel_id ? `https://discord.com/channels/@me/${data.channel_id}/${data.id}` : undefined,
      };
    },
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '💬',
    color: '#4a154b',
    maxLength: 4000,
    supportsMedia: true,
    fields: [
      { key: 'webhookUrl', label: 'Incoming webhook URL', secret: true, placeholder: 'https://hooks.slack.com/services/…' },
      { key: 'botToken', label: 'Bot token (for media uploads)', secret: true, optional: true, placeholder: 'xoxb-…' },
      { key: 'channelId', label: 'Channel ID (for media uploads)', optional: true, placeholder: 'C0123456789' },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      // Native media upload needs the Web API (files.*External) — incoming
      // webhooks can't attach files. With bot creds, text-only posts go
      // through chat.postMessage too.
      if (mediaUrls[0] || (creds.botToken && creds.channelId)) {
        if (!creds.botToken || !creds.channelId) {
          throw new Error('Slack media upload requires a bot token and channel ID (incoming webhooks cannot attach files)');
        }
        const auth = { authorization: `Bearer ${creds.botToken}` };
        if (mediaUrls[0]) {
          const { body, contentType } = await fetchMediaBytes(mediaUrls[0]);
          const filename = mediaFilename(mediaUrls[0]);
          const get = await guardedFetch('https://slack.com/api/files.getUploadURLExternal', {
            method: 'POST',
            headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ filename, length: String(body.byteLength) }),
            signal: AbortSignal.timeout(30_000),
          });
          if (!get.ok) throw await httpError('Slack getUploadURLExternal', get);
          const g = (await get.json()) as { ok?: boolean; upload_url?: string; file_id?: string; error?: string };
          if (!g.ok) throw bodyError('Slack getUploadURLExternal', g.error ?? 'unknown');
          if (!g.upload_url || !g.file_id) throw new Error('Slack getUploadURLExternal returned no upload URL');
          const up = await guardedFetch(g.upload_url, {
            method: 'POST',
            headers: { 'content-type': contentType },
            body: new Uint8Array(body),
            signal: AbortSignal.timeout(60_000),
          });
          if (!up.ok) throw await httpError('Slack file upload', up);
          const done = await guardedFetch('https://slack.com/api/files.completeUploadExternal', {
            method: 'POST',
            headers: { ...auth, 'content-type': 'application/json' },
            body: JSON.stringify({
              files: [{ id: g.file_id, title: filename }],
              channel_id: creds.channelId,
              initial_comment: content,
            }),
            signal: AbortSignal.timeout(30_000),
          });
          if (!done.ok) throw await httpError('Slack completeUploadExternal', done);
          const d = (await done.json()) as { ok?: boolean; error?: string };
          if (!d.ok) throw bodyError('Slack completeUploadExternal', d.error ?? 'unknown');
          return {};
        }
        const res = await guardedFetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ channel: creds.channelId, text: content }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw await httpError('Slack chat.postMessage', res);
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!data.ok) throw bodyError('Slack chat.postMessage', data.error ?? 'unknown');
        return {};
      }
      if (!creds.webhookUrl) throw new Error('Slack webhook URL is missing');
      const res = await guardedFetch(creds.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: content }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw await httpError('Slack webhook', res);
      const body = (await res.text().catch(() => '')).trim();
      if (body && body !== 'ok') throw bodyError('Slack webhook', body);
      return {};
    },
  },
  {
    id: 'reddit',
    name: 'Reddit',
    icon: '👽',
    color: '#ff4500',
    maxLength: 40000,
    supportsMedia: false,
    fields: [
      { key: 'clientId', label: 'Client ID (script app)' },
      { key: 'clientSecret', label: 'Client secret', secret: true },
      { key: 'username', label: 'Reddit username' },
      { key: 'password', label: 'Reddit password', secret: true },
      { key: 'subreddit', label: 'Subreddit', placeholder: 'test' },
    ],
    async publish(_channel, creds, content) {
      for (const k of ['clientId', 'clientSecret', 'username', 'password', 'subreddit'] as const) {
        if (!creds[k]) throw new Error(`Reddit ${k} is required`);
      }
      const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
      const tokenRes = await guardedFetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'postivo/1.0',
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: creds.username,
          password: creds.password,
        }),
      });
      if (!tokenRes.ok) throw await httpError('Reddit OAuth', tokenRes);
      const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
      if (!token) throw new Error('Reddit OAuth returned no access token (check app type is "script")');
      const res = await guardedFetch('https://oauth.reddit.com/api/submit', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'postivo/1.0' },
        body: JSON.stringify({
          sr: creds.subreddit.replace(/^r\//, ''),
          title: firstLine(content, 'Untitled', 300),
          text: content,
          kind: 'self',
        }),
      });
      if (!res.ok) throw await httpError('Reddit submit', res);
      const data = (await res.json()) as {
        json?: { errors?: unknown[]; data?: { url?: string; id?: string; name?: string } };
      };
      if (data.json?.errors?.length) throw bodyError('Reddit submit', JSON.stringify(data.json.errors));
      return {
        externalUrl: data.json?.data?.url,
        externalId: data.json?.data?.name ?? data.json?.data?.id,
      };
    },
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    icon: '📌',
    color: '#e60023',
    maxLength: 500,
    supportsMedia: true,
    fields: [
      { key: 'accessToken', label: 'Access token', secret: true },
      { key: 'boardId', label: 'Board ID', placeholder: '1234567890123456789' },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.accessToken || !creds.boardId) throw new Error('Pinterest access token and board ID are required');
      const body: Record<string, unknown> = {
        board_id: creds.boardId,
        title: firstLine(content, 'Postivo pin'),
        description: content.slice(0, 500),
      };
      if (mediaUrls[0]) body.media_source = { source_type: 'image_url', url: mediaUrls[0] };
      const res = await guardedFetch('https://api.pinterest.com/v5/pins', {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await httpError('Pinterest pin', res);
      const data = (await res.json()) as { id?: string };
      return {
        externalId: data.id,
        externalUrl: data.id ? `https://www.pinterest.com/pin/${data.id}/` : undefined,
      };
    },
  },
  {
    id: 'hashnode',
    name: 'Hashnode',
    icon: '📝',
    color: '#2962ff',
    maxLength: 100000,
    supportsMedia: false,
    fields: [
      { key: 'apiKey', label: 'Personal access token', secret: true },
      { key: 'publicationId', label: 'Publication ID', placeholder: 'ObjectId from Hashnode dashboard' },
    ],
    async publish(_channel, creds, content) {
      if (!creds.apiKey || !creds.publicationId) throw new Error('Hashnode API key and publication ID are required');
      const res = await guardedFetch('https://gql.hashnode.com', {
        method: 'POST',
        headers: { authorization: creds.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          query:
            'mutation PublishPost($input: PublishPostInput!) { publishPost(input: $input) { post { id url } } }',
          variables: {
            input: {
              title: firstLine(content),
              contentMarkdown: content,
              publicationId: creds.publicationId,
            },
          },
        }),
      });
      if (!res.ok) throw await httpError('Hashnode publish', res);
      const data = (await res.json()) as {
        data?: { publishPost?: { post?: { id?: string; url?: string } } };
        errors?: { message?: string }[];
      };
      if (data.errors?.length) throw bodyError('Hashnode publish', data.errors[0].message ?? 'unknown');
      const post = data.data?.publishPost?.post;
      if (!post?.id) throw new Error('Hashnode returned no post');
      return { externalId: post.id, externalUrl: post.url };
    },
  },
  {
    id: 'medium',
    name: 'Medium',
    icon: 'Ⓜ️',
    color: '#ababab',
    maxLength: 100000,
    supportsMedia: false,
    fields: [{ key: 'integrationToken', label: 'Integration token', secret: true }],
    async publish(_channel, creds, content) {
      if (!creds.integrationToken) throw new Error('Medium integration token is required');
      const me = await guardedFetch('https://api.medium.com/v1/me', {
        headers: { authorization: `Bearer ${creds.integrationToken}` },
      });
      if (!me.ok) throw await httpError('Medium auth', me);
      const userId = ((await me.json()) as { data?: { id?: string } }).data?.id;
      if (!userId) throw new Error('Medium /v1/me returned no user id');
      const res = await guardedFetch(`https://api.medium.com/v1/users/${userId}/posts`, {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.integrationToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          title: firstLine(content),
          contentFormat: 'markdown',
          content,
          publishStatus: 'public',
        }),
      });
      if (!res.ok) throw await httpError('Medium publish', res);
      const data = (await res.json()) as { data?: { id?: string; url?: string } };
      return { externalId: data.data?.id, externalUrl: data.data?.url };
    },
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    icon: '🌐',
    color: '#21759b',
    maxLength: 100000,
    supportsMedia: false,
    fields: [
      { key: 'siteUrl', label: 'Site URL', placeholder: 'https://blog.example.com' },
      { key: 'username', label: 'Username' },
      { key: 'applicationPassword', label: 'Application password', secret: true, placeholder: 'xxxx xxxx xxxx xxxx' },
    ],
    async publish(_channel, creds, content) {
      if (!creds.siteUrl || !creds.username || !creds.applicationPassword) {
        throw new Error('WordPress site URL, username and application password are required');
      }
      const site = creds.siteUrl.replace(/\/+$/, '');
      const auth = Buffer.from(`${creds.username}:${creds.applicationPassword}`).toString('base64');
      const res = await guardedFetch(`${site}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify({ title: firstLine(content), content, status: 'publish' }),
      });
      if (!res.ok) throw await httpError('WordPress publish', res);
      const data = (await res.json()) as { id?: number; link?: string };
      return { externalId: data.id ? String(data.id) : undefined, externalUrl: data.link };
    },
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '📸',
    color: '#e1306c',
    maxLength: 2200,
    supportsMedia: true,
    fields: [
      {
        key: 'access_token',
        label: 'Long-lived access token',
        secret: true,
        placeholder: 'Instagram Business/Creator via Facebook Login',
      },
      { key: 'ig_user_id', label: 'Instagram Business account ID', placeholder: '1784…' },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.access_token || !creds.ig_user_id) {
        throw new Error('Instagram access token and Business account ID are required');
      }
      const media = mediaUrls[0];
      // The Graph API has no text-only post — every publish is a media container.
      if (!media) throw new Error('Instagram requires an image or video');
      const graph = 'https://graph.facebook.com/v21.0';
      const base = `${graph}/${encodeURIComponent(creds.ig_user_id)}`;
      const isVideo = /\.(mp4|mov)(\?|$)/i.test(media);
      const params = new URLSearchParams({ caption: content.slice(0, 2200), access_token: creds.access_token });
      if (isVideo) {
        params.set('media_type', 'REELS');
        params.set('video_url', media);
      } else {
        params.set('image_url', media);
      }
      const create = await guardedFetch(`${base}/media`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      if (!create.ok) throw await httpError('Instagram media container', create);
      const container = ((await create.json()) as { id?: string }).id;
      if (!container) throw new Error('Instagram media container returned no id');
      // Media is processed asynchronously — poll the container until the Graph
      // API reports it ready to publish (videos can take a while).
      const deadline = Date.now() + 60_000;
      for (;;) {
        const status = await guardedFetch(
          `${graph}/${encodeURIComponent(container)}?fields=status_code&access_token=${encodeURIComponent(creds.access_token)}`,
        );
        if (!status.ok) throw await httpError('Instagram container status', status);
        const code = ((await status.json()) as { status_code?: string }).status_code;
        if (code === 'FINISHED') break;
        if (code === 'ERROR' || code === 'EXPIRED') throw bodyError('Instagram container status', code);
        if (Date.now() > deadline) throw new Error('Instagram media processing timed out');
        await new Promise((r) => setTimeout(r, 2_000));
      }
      const pub = await guardedFetch(`${base}/media_publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ creation_id: container, access_token: creds.access_token }),
      });
      if (!pub.ok) throw await httpError('Instagram media publish', pub);
      const mediaId = ((await pub.json()) as { id?: string }).id;
      // Best-effort permalink — nice for the publish log, not worth failing over.
      let externalUrl: string | undefined;
      if (mediaId) {
        const link = await guardedFetch(
          `${graph}/${encodeURIComponent(mediaId)}?fields=permalink&access_token=${encodeURIComponent(creds.access_token)}`,
        ).catch(() => null);
        if (link?.ok) externalUrl = ((await link.json()) as { permalink?: string }).permalink;
      }
      return { externalId: mediaId, externalUrl };
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: '🎵',
    color: '#25f4ee',
    maxLength: 2200,
    supportsMedia: true,
    fields: [
      {
        key: 'access_token',
        label: 'OAuth2 access token',
        secret: true,
        placeholder: 'video.upload scope (Content Posting API)',
      },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.access_token) throw new Error('TikTok access token is required');
      const video = mediaUrls[0];
      // The Content Posting API video flow is the only direct-post path.
      if (!video) throw new Error('TikTok requires a video');
      const res = await guardedFetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.access_token}`, 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          post_info: { title: content.slice(0, 2200), privacy_level: 'PUBLIC_TO_EVERYONE' },
          // TikTok pulls the video from our signed, expiring media URL.
          source_info: { source: 'PULL_FROM_URL', video_url: video },
        }),
      });
      if (!res.ok) throw await httpError('TikTok video init', res);
      // TikTok reports API errors with HTTP 200 + an error.code payload.
      const data = (await res.json()) as {
        data?: { publish_id?: string };
        error?: { code?: string; message?: string };
      };
      if (data.error?.code && data.error.code !== 'ok') {
        throw bodyError('TikTok video init', data.error.message ?? data.error.code);
      }
      const publishId = data.data?.publish_id;
      if (!publishId) return {};
      // publish_id only means the job was ACCEPTED — poll the status endpoint
      // until TikTok actually publishes (or fails) the video.
      const deadline = Date.now() + 60_000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 3_000));
        const st = await guardedFetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
          method: 'POST',
          headers: { authorization: `Bearer ${creds.access_token}`, 'content-type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ publish_id: publishId }),
        });
        if (!st.ok) throw await httpError('TikTok publish status', st);
        const sd = (await st.json()) as {
          data?: { status?: string; fail_reason?: string };
          error?: { code?: string; message?: string };
        };
        if (sd.error?.code && sd.error.code !== 'ok') {
          throw bodyError('TikTok publish status', sd.error.message ?? sd.error.code);
        }
        const status = sd.data?.status ?? '';
        if (status === 'PUBLISH_COMPLETE') break;
        if (status === 'FAILED') throw bodyError('TikTok publish', sd.data?.fail_reason ?? 'processing failed');
        if (Date.now() > deadline) throw new Error('TikTok is still processing the video — check your TikTok app before retrying');
      }
      return { externalId: publishId };
    },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: '▶️',
    color: '#ff0000',
    maxLength: 5000,
    supportsMedia: true,
    fields: [
      {
        key: 'access_token',
        label: 'OAuth2 access token',
        secret: true,
        placeholder: 'Requires the youtube.upload scope',
      },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.access_token) throw new Error('YouTube access token is required');
      const video = mediaUrls[0];
      if (!video) throw new Error('YouTube requires a video');
      // Resumable upload, step 1: open the session with the video metadata.
      const init = await guardedFetch(
        'https://upload.youtube.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${creds.access_token}`,
            'content-type': 'application/json; charset=UTF-8',
            'x-upload-content-type': 'video/*',
          },
          body: JSON.stringify({
            snippet: { title: content.slice(0, 100).trim() || 'Postivo video', description: content.slice(0, 5000) },
            status: { privacyStatus: 'public' },
          }),
        },
      );
      if (!init.ok) throw await httpError('YouTube upload init', init);
      const sessionUri = init.headers.get('location');
      if (!sessionUri) throw new Error('YouTube upload init returned no session URI');
      // Step 2: pull the bytes back from our own signed media URL (the APP_URL
      // host is exempted in ssrf.ts), then PUT them to the session URI.
      const media = await guardedFetch(video);
      if (!media.ok) throw await httpError('YouTube media download', media);
      const bytes = await readBodyCapped(media, YOUTUBE_MAX_BYTES);
      const contentType = (media.headers.get('content-type') ?? 'video/mp4').split(';')[0].trim();
      const up = await guardedFetch(sessionUri, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${creds.access_token}`,
          'content-type': contentType,
          'content-length': String(bytes.byteLength),
        },
        body: new Uint8Array(bytes),
      });
      if (!up.ok) throw await httpError('YouTube video upload', up);
      const data = (await up.json()) as { id?: string };
      return { externalId: data.id, externalUrl: data.id ? `https://youtu.be/${data.id}` : undefined };
    },
  },
];

export function getProvider(id: string): Provider | undefined {
  return providers.find((p) => p.id === id);
}

export function providerMeta(): ProviderMeta[] {
  return providers.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    color: p.color,
    maxLength: p.maxLength,
    supportsMedia: p.supportsMedia,
    supportsReply: typeof p.reply === 'function',
    supportsStats: typeof p.stats === 'function',
    fields: p.fields,
  }));
}

export function providerMetaFor(id: string): ProviderMeta | null {
  const p = getProvider(id);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    color: p.color,
    maxLength: p.maxLength,
    supportsMedia: p.supportsMedia,
    supportsReply: typeof p.reply === 'function',
    supportsStats: typeof p.stats === 'function',
    fields: p.fields,
  };
}
