// Minimal RSS 2.0 / Atom parser — hand-rolled, no dependencies.
// Handles <item>/<entry> blocks, title/link/guid/pubDate and CDATA sections.

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  pubDate: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function stripCdata(s: string): string {
  const t = s.trim();
  if (t.startsWith('<![CDATA[') && t.endsWith(']]>')) return t.slice(9, -3).trim();
  return t;
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decodeEntities(stripCdata(m[1])) : '';
}

function atomLink(block: string): string {
  // Prefer <link href="..."/> (rel="alternate" or no rel).
  const links = block.match(/<link\b[^>]*\/?>/gi) ?? [];
  for (const l of links) {
    const rel = l.match(/rel="([^"]+)"/i)?.[1];
    if (rel && rel !== 'alternate') continue;
    const href = l.match(/href="([^"]+)"/i)?.[1];
    if (href) return decodeEntities(href);
  }
  return '';
}

export function parseFeed(xml: string): FeedItem[] {
  const blocks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const items: FeedItem[] = [];
  for (const block of blocks.slice(0, 50)) {
    const title = tag(block, 'title');
    const link = tag(block, 'link') || atomLink(block);
    const guid = tag(block, 'guid') || tag(block, 'id') || link || title;
    const pubDateRaw = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated');
    const pubDate = pubDateRaw && !Number.isNaN(Date.parse(pubDateRaw)) ? new Date(pubDateRaw).toISOString() : null;
    if (!title && !link) continue;
    items.push({ guid, title, link, pubDate });
  }
  return items;
}

// Returns items newer than lastGuid, oldest-first. On a first poll (lastGuid
// null) only the newest item is returned so we never flood channels.
export function newItems(items: FeedItem[], lastGuid: string | null): FeedItem[] {
  if (items.length === 0) return [];
  if (!lastGuid) return [items[0]];
  const idx = items.findIndex((i) => i.guid === lastGuid);
  const fresh = idx === -1 ? items : items.slice(0, idx);
  return fresh.slice(0, 10).reverse();
}
