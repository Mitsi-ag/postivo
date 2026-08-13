import { NextRequest, NextResponse } from 'next/server';
import { authV1 } from '@/lib/auth';
import { createPost, deletePost, getPostDTO, listChannelsDTO, listPosts, updatePost, type PostInput } from '@/lib/core';
import { channelsUsed, planOf, postsThisMonth, storageUsed } from '@/lib/plans';
import { providerMeta } from '@/lib/providers/registry';
import { bestSlots } from '@/lib/besttime';
import { one, query, type User } from '@/lib/db';

/*
 * MCP (Model Context Protocol) server — streamable-HTTP transport, JSON
 * responses. Authenticate with a Postivo API key: Authorization: Bearer pv_…
 *
 * This is the agent-first surface: any MCP client (Claude, Cursor, custom
 * agents) can schedule, edit and publish social posts with zero SDK work.
 * Every tool maps 1:1 onto the same core functions the REST API uses, so
 * quotas and validation are identical.
 */

const PROTOCOL_VERSION = '2025-03-26';
const SERVER_INFO = { name: 'postivo', version: '1.0.0' };

const TOOLS = [
  {
    name: 'list_channels',
    description: 'List connected social channels (id, provider, name, status, provider capabilities).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_providers',
    description: 'List available provider types and the credential fields each one needs to connect.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_posts',
    description: 'List posts. Filter by status (draft|scheduled|published|failed), tag, or scheduled window.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'scheduled', 'published', 'failed'] },
        tag: { type: 'string' },
        start: { type: 'string', description: 'ISO datetime — scheduled_at >= start' },
        end: { type: 'string', description: 'ISO datetime — scheduled_at <= end' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_post',
    description: 'Get one post with its per-channel targets (status, errors, external URLs, stats).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_post',
    description:
      'Create a post. Omit scheduled_at for a draft; provide it (ISO) plus channelIds to schedule. ' +
      'Media must be uploaded via the REST API first (POST /api/upload) and passed as ids.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        scheduled_at: { type: 'string', description: 'ISO datetime; omit for draft' },
        channelIds: { type: 'array', items: { type: 'string' } },
        media: { type: 'array', items: { type: 'string' }, description: 'media ids from /api/upload' },
        tags: { type: 'array', items: { type: 'string' } },
        comments: {
          type: 'array',
          items: {
            type: 'object',
            properties: { content: { type: 'string' }, delayMin: { type: 'number' } },
            required: ['content', 'delayMin'],
          },
          description: 'Follow-up thread comments, each delayed delayMin after the previous',
        },
        repeat_every_days: { type: 'number', description: '1-365; clones the post forever' },
        overrides: { type: 'object', description: 'per-channel content overrides, keyed by channel id' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'update_post',
    description: 'Update a post: content, schedule, channels, tags, comments, or status (draft|scheduled).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        content: { type: 'string' },
        scheduled_at: { type: ['string', 'null'] },
        status: { type: 'string', enum: ['draft', 'scheduled'] },
        channelIds: { type: 'array', items: { type: 'string' } },
        media: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        comments: { type: 'array', items: { type: 'object' } },
        repeat_every_days: { type: ['number', 'null'] },
        overrides: { type: 'object' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_post',
    description: 'Delete a post and its targets.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'retry_target',
    description: 'Re-queue a FAILED channel target for publishing.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'target id (from get_post)' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_usage',
    description: 'Current plan and usage (channels, posts this month, storage).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_best_time',
    description: 'Suggest the next best publish slots for the given channels (research-backed per network).',
    inputSchema: {
      type: 'object',
      properties: { channelIds: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    },
  },
] as const;

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function toolText(data: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

async function callTool(user: User, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_channels':
      return { channels: await listChannelsDTO(user.id) };
    case 'list_providers':
      return { providers: providerMeta() };
    case 'list_posts':
      return {
        posts: await listPosts(user.id, {
          status: typeof args.status === 'string' ? args.status : undefined,
          tag: typeof args.tag === 'string' ? args.tag : undefined,
          start: typeof args.start === 'string' ? args.start : undefined,
          end: typeof args.end === 'string' ? args.end : undefined,
        }),
      };
    case 'get_post': {
      const post = await getPostDTO(String(args.id ?? ''), user.id);
      if (!post) throw new Error('Post not found');
      return { post };
    }
    case 'create_post': {
      const result = await createPost(user, args as PostInput);
      if (result.error) throw new Error(result.error);
      return { post: result.post };
    }
    case 'update_post': {
      const { id, ...rest } = args;
      const result = await updatePost(user.id, String(id ?? ''), rest as PostInput);
      if (result.error) throw new Error(result.error);
      return { post: result.post };
    }
    case 'delete_post': {
      const result = await deletePost(user.id, String(args.id ?? ''));
      if (!result.ok) throw new Error(result.error ?? 'Post not found');
      return { ok: true };
    }
    case 'retry_target': {
      const target = await one<{ id: string; status: string }>(
        'SELECT t.id, t.status FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE t.id = $1 AND p.user_id = $2',
        [String(args.id ?? ''), user.id],
      );
      if (!target) throw new Error('Target not found');
      if (target.status !== 'failed') throw new Error('Only failed targets can be retried');
      await query(
        `UPDATE post_targets SET status = 'pending', error = NULL, retry_count = 0, next_retry_at = now() WHERE id = $1`,
        [target.id],
      );
      return { ok: true };
    }
    case 'get_usage': {
      const plan = planOf(user);
      return {
        plan: user.plan === 'pro' ? 'pro' : 'free',
        channels: { used: await channelsUsed(user.id), limit: plan.channels },
        postsThisMonth: { used: await postsThisMonth(user.id), limit: plan.postsPerMonth },
        storageMB: { used: Math.round((await storageUsed(user.id)) / (1024 * 1024)), limit: plan.storageMB },
      };
    }
    case 'get_best_time': {
      const ids = Array.isArray(args.channelIds) ? args.channelIds.map(String) : [];
      const channels = await listChannelsDTO(user.id);
      const providers = channels.filter((c) => ids.includes(c.id)).map((c) => c.provider);
      return { slots: bestSlots(providers, user.timezone ?? 'UTC') };
    }
    default:
      throw Object.assign(new Error(`Unknown tool "${name}"`), { code: -32602 });
  }
}

async function handleMessage(user: User, msg: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> }) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });
    case 'tools/call': {
      const name = String(params?.name ?? '');
      const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        return rpcResult(id, toolText(await callTool(user, name, toolArgs)));
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (typeof code === 'number') return rpcError(id, code, (err as Error).message);
        // Tool-level failures are reported as tool errors, not protocol errors.
        return rpcResult(id, { ...toolText({ error: (err as Error).message }), isError: true });
      }
    }
    default:
      // Notifications (no id) get no response per JSON-RPC.
      if (id === undefined || id === null) return null;
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authV1(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }
  const messages = Array.isArray(body) ? body : [body];
  const out = [];
  for (const msg of messages) {
    const r = await handleMessage(user, msg);
    if (r !== null) out.push(r);
  }
  // All-notifications payload → 202 with no body, per the MCP HTTP spec.
  if (out.length === 0) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? out : out[0], {
    headers: { 'MCP-Protocol-Version': PROTOCOL_VERSION },
  });
}

// SSE streaming isn't needed — every response is a single JSON document.
export async function GET() {
  return NextResponse.json(
    { ...SERVER_INFO, transport: 'streamable-http', auth: 'Authorization: Bearer pv_… (API keys in Settings)' },
    { status: 200 },
  );
}
