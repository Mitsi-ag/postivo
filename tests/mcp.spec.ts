import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { nextIp, RUN } from './helpers';

// MCP server tests: the streamable-HTTP JSON-RPC endpoint at /api/mcp,
// authenticated with a pv_ API key.

async function newUserWithKey(tag: string): Promise<{ ctx: APIRequestContext; key: string }> {
  const ctx = await request.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': nextIp() },
  });
  const res = await ctx.post('/api/auth/register', {
    data: { name: tag, email: `mcp-${tag}-${RUN}@postivo.dev`, password: 'mcp-pass-1234' },
  });
  expect(res.ok(), `register ${tag}: ${await res.text()}`).toBeTruthy();
  const keyRes = await ctx.post('/api/settings/keys', { data: { name: 'mcp-test' } });
  expect(keyRes.ok(), `create key: ${await keyRes.text()}`).toBeTruthy();
  const key = ((await keyRes.json()) as { key: { token: string } }).key.token;
  return { ctx, key };
}

function rpc(key: string, method: string, params?: Record<string, unknown>, id: number | string = 1) {
  return request
    .newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } })
    .then((ctx) =>
      ctx
        .post('/api/mcp', {
          headers: { authorization: `Bearer ${key}` },
          data: { jsonrpc: '2.0', id, method, params },
        })
        .then(async (res) => ({ res, body: await res.json(), dispose: () => ctx.dispose() })),
    );
}

test('mcp: initialize handshake + protocol version header', async () => {
  const { ctx, key } = await newUserWithKey('init');
  const { res, body, dispose } = await rpc(key, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } });
  expect(res.status()).toBe(200);
  expect(res.headers()['mcp-protocol-version']).toBe('2025-03-26');
  expect(body.result.serverInfo.name).toBe('postivo');
  expect(body.result.capabilities.tools).toBeTruthy();
  await dispose();
  await ctx.dispose();
});

test('mcp: tools/list exposes the scheduling surface', async () => {
  const { ctx, key } = await newUserWithKey('tools');
  const { body, dispose } = await rpc(key, 'tools/list');
  const names = (body.result.tools as { name: string }[]).map((t) => t.name);
  for (const t of ['list_channels', 'create_post', 'update_post', 'delete_post', 'list_posts', 'get_post', 'retry_target', 'get_usage', 'get_best_time', 'list_providers']) {
    expect(names).toContain(t);
  }
  await dispose();
  await ctx.dispose();
});

test('mcp: full flow — channel, schedule via tools/call, usage, delete', async () => {
  const { ctx, key } = await newUserWithKey('flow');

  // Connect a demo channel via REST (MCP is post-management; channel connect
  // stays in the portal), then drive everything else over MCP.
  const chRes = await ctx.post('/api/channels', { data: { provider: 'demo', name: 'MCP Demo', credentials: {} } });
  const channelId = ((await chRes.json()) as { channel: { id: string } }).channel.id;

  const create = await rpc(key, 'tools/call', {
    name: 'create_post',
    arguments: {
      content: `mcp post ${RUN}`,
      scheduled_at: new Date(Date.now() + 2 * 86400e3).toISOString(),
      channelIds: [channelId],
      tags: ['mcp'],
    },
  });
  const created = JSON.parse(create.body.result.content[0].text) as { post: { id: string; status: string } };
  expect(created.post.status).toBe('scheduled');
  await create.dispose();

  const list = await rpc(key, 'tools/call', { name: 'list_posts', arguments: { tag: 'mcp' } });
  const listed = JSON.parse(list.body.result.content[0].text) as { posts: { id: string; content: string }[] };
  expect(listed.posts.map((p) => p.id)).toContain(created.post.id);
  await list.dispose();

  const usage = await rpc(key, 'tools/call', { name: 'get_usage', arguments: {} });
  const usageData = JSON.parse(usage.body.result.content[0].text) as { postsThisMonth: { used: number } };
  expect(usageData.postsThisMonth.used).toBeGreaterThanOrEqual(1);
  await usage.dispose();

  const del = await rpc(key, 'tools/call', { name: 'delete_post', arguments: { id: created.post.id } });
  expect(JSON.parse(del.body.result.content[0].text)).toEqual({ ok: true });
  await del.dispose();
  await ctx.dispose();
});

test('mcp: tool errors are isError results, not protocol errors', async () => {
  const { ctx, key } = await newUserWithKey('err');
  const { body, dispose } = await rpc(key, 'tools/call', { name: 'get_post', arguments: { id: 'nope' } });
  expect(body.result.isError).toBe(true);
  expect(body.result.content[0].text).toContain('Post not found');
  await dispose();
  await ctx.dispose();
});

test('mcp: unknown method → -32601; unknown tool → -32602; no auth → 401', async () => {
  const { ctx, key } = await newUserWithKey('proto');
  const unknown = await rpc(key, 'resources/list', {}, 7);
  expect(unknown.body.error.code).toBe(-32601);
  await unknown.dispose();

  const badTool = await rpc(key, 'tools/call', { name: 'does_not_exist', arguments: {} }, 8);
  expect(badTool.body.error.code).toBe(-32602);
  await badTool.dispose();

  const noAuth = await request.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } });
  const res = await noAuth.post('/api/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'ping' } });
  expect(res.status()).toBe(401);
  await noAuth.dispose();
  await ctx.dispose();
});

test('mcp: notification-only payload → 202 no body', async () => {
  const { ctx, key } = await newUserWithKey('notif');
  const c = await request.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } });
  const res = await c.post('/api/mcp', {
    headers: { authorization: `Bearer ${key}` },
    data: { jsonrpc: '2.0', method: 'notifications/initialized' },
  });
  expect(res.status()).toBe(202);
  await c.dispose();
  await ctx.dispose();
});
