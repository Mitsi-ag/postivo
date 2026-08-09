import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { query } from '@/lib/db';
import { bestSlots } from '@/lib/besttime';

// GET /api/best-time?channelIds=id1,id2 → next 3 suggested slots (ISO).
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const ids = (req.nextUrl.searchParams.get('channelIds') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  let providerIds: string[] = [];
  if (ids.length) {
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    const rows = await query<{ provider: string }>(
      `SELECT DISTINCT provider FROM channels WHERE user_id = $1 AND id IN (${placeholders})`,
      [user.id, ...ids],
    );
    providerIds = rows.map((r) => r.provider);
  }
  return NextResponse.json({ slots: bestSlots(providerIds, user.timezone, 3), timezone: user.timezone || 'UTC' });
}
