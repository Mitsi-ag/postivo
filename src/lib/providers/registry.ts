import type { Channel } from '../db';
import type { ProviderField, ProviderMeta } from '../types';

export interface PublishContext {
  postId: string;
  scheduledAt: string | null;
}

export interface PublishResult {
  externalUrl?: string;
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
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return text.slice(0, 300);
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
    async publish(channel) {
      await new Promise((r) => setTimeout(r, 100));
      return {
        externalUrl: `https://demo.postivo.local/${channel.id.slice(0, 8)}/${Date.now().toString(36)}`,
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
      const res = await fetch(creds.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content, media: mediaUrls, scheduled_at: ctx.scheduledAt, id: ctx.postId }),
      });
      if (!res.ok) throw new Error(`Webhook responded ${res.status}: ${await readError(res)}`);
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
    async publish(_channel, creds, content) {
      if (!creds.handle || !creds.appPassword) throw new Error('Bluesky handle and app password are required');
      const login = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: creds.handle, password: creds.appPassword }),
      });
      if (!login.ok) throw new Error(`Bluesky login failed (${login.status}): ${await readError(login)}`);
      const session = (await login.json()) as { accessJwt?: string; did?: string; handle?: string };
      if (!session.accessJwt || !session.did) throw new Error('Bluesky login returned no session');
      const res = await fetch('https://bsky.social/xrpc/app.bsky.feed.post', {
        method: 'POST',
        headers: { authorization: `Bearer ${session.accessJwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          repo: session.did,
          collection: 'app.bsky.feed.post',
          record: { $type: 'app.bsky.feed.post', text: content.slice(0, 300), createdAt: new Date().toISOString() },
        }),
      });
      if (!res.ok) throw new Error(`Bluesky post failed (${res.status}): ${await readError(res)}`);
      const data = (await res.json()) as { uri?: string };
      const rkey = data.uri?.split('/').pop();
      return {
        externalUrl: rkey ? `https://bsky.app/profile/${session.handle ?? session.did}/post/${rkey}` : undefined,
      };
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
      const res = await fetch(`${instance}/api/v1/statuses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`Mastodon post failed (${res.status}): ${await readError(res)}`);
      const data = (await res.json()) as { url?: string };
      return { externalUrl: data.url };
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
      const title = (content.split('\n')[0] || 'Untitled').slice(0, 100) || 'Untitled';
      const res = await fetch('https://dev.to/api/articles', {
        method: 'POST',
        headers: { 'api-key': creds.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ article: { title, body_markdown: content, published: true } }),
      });
      if (!res.ok) throw new Error(`DEV publish failed (${res.status}): ${await readError(res)}`);
      const data = (await res.json()) as { url?: string };
      return { externalUrl: data.url };
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
      const res = await fetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.bearerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text: content.slice(0, 280) }),
      });
      if (!res.ok) throw new Error(`X API error (${res.status}): ${await readError(res)}`);
      const data = (await res.json()) as { data?: { id?: string } };
      return { externalUrl: data.data?.id ? `https://x.com/i/web/status/${data.data.id}` : undefined };
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
      const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
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
      if (!res.ok) throw new Error(`LinkedIn publish failed (${res.status}): ${await readError(res)}`);
      const id = res.headers.get('x-restli-id') || ((await res.json().catch(() => ({}))) as { id?: string }).id;
      return { externalUrl: id ? `https://www.linkedin.com/feed/update/${id}/` : undefined };
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
    fields: p.fields,
  };
}
