import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { parseFeed } from '@/lib/rss';
import { assertPublicUrl, guardedFetch, readBodyCapped } from '@/lib/ssrf';

// Same hard cap the scheduler enforces when polling feeds.
const MAX_BYTES = 5 * 1024 * 1024;

// Channel/feed-level <title> — everything before the first <item>/<entry>.
function feedTitle(xml: string): string | undefined {
  const head = xml.split(/<item[\s>]|<entry[\s>]/i)[0];
  const m = head.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  const raw = m[1].trim();
  const t = raw.startsWith('<![CDATA[') && raw.endsWith(']]>') ? raw.slice(9, -3).trim() : raw;
  return t || undefined;
}

// GET /api/rss/preview?url=… — dry-run a feed before subscribing to it.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!rateLimit(`rss-preview:${user.id}`, 10, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many feed tests — try again in a few minutes.' }, { status: 429 });
  }
  const url = (req.nextUrl.searchParams.get('url') ?? '').trim();
  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'url must be an http(s) URL' }, { status: 400 });
  }
  try {
    await assertPublicUrl(url);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'URL is not allowed' }, { status: 400 });
  }
  try {
    const res = await guardedFetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return NextResponse.json({ error: `The feed URL responded with HTTP ${res.status}` }, { status: 502 });
    }
    const xml = (await readBodyCapped(res, MAX_BYTES)).toString('utf8');
    const items = parseFeed(xml);
    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Fetched OK, but found no feed items — is this a valid RSS or Atom feed?' },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      title: feedTitle(xml),
      itemCount: items.length,
      sample: items.slice(0, 3).map((i) => i.title),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not fetch the feed' },
      { status: 502 },
    );
  }
}
