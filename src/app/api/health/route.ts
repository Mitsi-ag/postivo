import { NextResponse } from 'next/server';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let db = false;
  try {
    await one('SELECT 1');
    db = true;
  } catch {
    // Deliberately swallowed — never leak driver/internal error details.
  }
  // Always 200: platform health checks (App Runner) only prove the process is
  // up. The db flag surfaces connectivity problems for monitoring.
  return NextResponse.json({ ok: true, db });
}
