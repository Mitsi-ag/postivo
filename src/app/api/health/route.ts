import { NextResponse } from 'next/server';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await one('SELECT 1');
    return NextResponse.json({ ok: true, db: true, version: '1.0.0' });
  } catch {
    return NextResponse.json({ ok: false, db: false, version: '1.0.0' }, { status: 503 });
  }
}
