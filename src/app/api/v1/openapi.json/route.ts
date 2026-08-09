import { NextResponse } from 'next/server';
import { openApiSpec } from '@/lib/openapi';

// Public OpenAPI 3.1 document for the v1 agent API. No auth required.
export async function GET() {
  return NextResponse.json(openApiSpec());
}
