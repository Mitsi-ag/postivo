import { NextResponse } from 'next/server';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let db = false;
  let dbError: string | null = null;
  try {
    await one('SELECT 1');
    db = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  // Always 200: platform health checks (App Runner) only prove the process is
  // up. The db flag/error surfaces connectivity problems for monitoring.
  return NextResponse.json({ ok: true, db, dbError, version: '1.0.0' });
}
