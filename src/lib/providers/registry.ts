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

// YouTube re-downloads our own media for the resumable upload — cap it at the
// same 50MB the upload route enforces so a huge object can't OOM the instance.
const YOUTUBE_MAX_BYTES = 50 * 1024 * 1024;

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
    supportsMedia: false,
    fields: [
      { key: 'handle', label: 'Handle', placeholder: 'you.bsky.social' },
      { key: 'appPassword', label: 'App password', secret: true, placeholder: 'xxxx-xxxx-xxxx-xxxx' },
    ],
    async publish(channel, creds, content) {
      const session = await blueskySession(creds);
      const res = await guardedFetch('https://bsky.social/xrpc/app.bsky.feed.post', {
        method: 'POST',
        headers: { authorization: `Bearer ${session.jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          repo: session.did,
          collection: 'app.bsky.feed.post',
          record: { $type: 'app.bsky.feed.post', text: content.slice(0, 300), createdAt: new Date().toISOString() },
        }),
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
    supportsMedia: false,
    fields: [
      { key: 'instanceUrl', label: 'Instance URL', placeholder: 'https://mastodon.social' },
      { key: 'accessToken', label: 'Access token', secret: true },
    ],
    async publish(_channel, creds, content, mediaUrls) {
      if (!creds.instanceUrl || !creds.accessToken) throw new Error('Mastodon instance URL and access token are required');
      const instance = creds.instanceUrl.replace(/\/+$/, '');
      const status = mediaUrls.length ? `${content}\n\n${mediaUrls.join('\n')}` : content;
      const res = await guardedFetch(`${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw await httpError('Mastodon post', res);
      const data = (await res.json()) as { url?: string; id?: string };
      return { externalUrl: data.url, externalId: data.id };
    },
    async reply(channel, externalId, content) {
      const creds = channel.credentials ?? {};
      if (!creds.instanceUrl || !creds.accessToken) throw new Error('Mastodon instance URL and access token are required');
      const instance = creds.instanceUrl.replace(/\/+$/, '');
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
      const instance = creds.instanceUrl.replace(/\/+$/, '');
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
    supportsMedia: false,
    fields: [
      {
        key: 'bearerToken',
        label: 'OAuth2 user access token',
        secret: true,
        placeholder: 'Requires tweet.write scope',
      },
    ],
    async publish(_channel, creds, content) {
      if (!creds.bearerToken) {
        throw new Error('X requires an OAuth2 user-context access token with the tweet.write scope');
      }
      const res = await guardedFetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.bearerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text: content.slice(0, 280) }),
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
    supportsMedia: false,
    fields: [
      { key: 'accessToken', label: 'OAuth2 access token', secret: true },
      { key: 'personUrn', label: 'Person URN', placeholder: 'urn:li:person:XXXXXXXX' },
    ],
    async publish(_channel, creds, content) {
      if (!creds.accessToken || !creds.personUrn) throw new Error('LinkedIn access token and person URN are required');
      const res = await guardedFetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${creds.accessToken}`,
          'content-type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: creds.personUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: content },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
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
    supportsMedia: false,
    fields: [
      { key: 'botToken', label: 'Bot token', secret: true, placeholder: '123456:ABC-DEF…' },
      { key: 'chatId', label: 'Chat / channel ID', placeholder: '@mychannel or -100…' },
    ],
    async publish(_channel, creds, content) {
      if (!creds.botToken || !creds.chatId) throw new Error('Telegram bot token and chat ID are required');
      const res = await guardedFetch(`https://api.telegram.org/bot${creds.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: creds.chatId, text: content.slice(0, 4096) }),
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
    supportsMedia: false,
    fields: [{ key: 'webhookUrl', label: 'Webhook URL', secret: true, placeholder: 'https://discord.com/api/webhooks/…' }],
    async publish(_channel, creds, content) {
      if (!creds.webhookUrl) throw new Error('Discord webhook URL is missing');
      const url = creds.webhookUrl + (creds.webhookUrl.includes('?') ? '&' : '?') + 'wait=true';
      const res = await guardedFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: content.slice(0, 2000) }),
      });
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
    supportsMedia: false,
    fields: [
      { key: 'webhookUrl', label: 'Incoming webhook URL', secret: true, placeholder: 'https://hooks.slack.com/services/…' },
    ],
    async publish(_channel, creds, content) {
      if (!creds.webhookUrl) throw new Error('Slack webhook URL is missing');
      const res = await guardedFetch(creds.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: content }),
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
      return { externalId: data.data?.publish_id };
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
