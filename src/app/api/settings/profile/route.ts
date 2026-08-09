import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, publicUser, unauthorized } from '@/lib/auth';
import { one, query, type User } from '@/lib/db';
import { assertPublicUrl } from '@/lib/ssrf';
import { isValidTimezone } from '@/lib/besttime';

interface ProfileBody {
  name?: string;
  timezone?: string;
  signature?: string;
  signature_enabled?: boolean;
  outbound_webhook_url?: string | null;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => null)) as ProfileBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const name = (body.name ?? user.name).trim();
  const timezone = (body.timezone ?? user.timezone).trim() || 'UTC';
  if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
  if (!isValidTimezone(timezone)) {
    return NextResponse.json({ error: `Unknown timezone "${timezone}" (use an IANA name like Australia/Sydney)` }, { status: 400 });
  }
  const signature = body.signature !== undefined ? body.signature.slice(0, 500) : user.signature;
  const signatureEnabled = body.signature_enabled !== undefined ? body.signature_enabled === true : user.signature_enabled;
  let webhookUrl = body.outbound_webhook_url !== undefined ? body.outbound_webhook_url : user.outbound_webhook_url;
  if (webhookUrl) {
    webhookUrl = webhookUrl.trim() || null;
    if (webhookUrl && !/^https?:\/\//.test(webhookUrl)) {
      return NextResponse.json({ error: 'outbound_webhook_url must be an http(s) URL' }, { status: 400 });
    }
    if (webhookUrl) {
      try {
        await assertPublicUrl(webhookUrl);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Webhook URL is not allowed' }, { status: 400 });
      }
    }
  }
  await query(
    'UPDATE users SET name = $1, timezone = $2, signature = $3, signature_enabled = $4, outbound_webhook_url = $5 WHERE id = $6',
    [name, timezone, signature ?? '', signatureEnabled, webhookUrl ?? null, user.id],
  );
  const updated = await one<User>('SELECT * FROM users WHERE id = $1', [user.id]);
  return NextResponse.json({ user: publicUser(updated as User) });
}
