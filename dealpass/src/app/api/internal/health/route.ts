import { NextResponse } from 'next/server';
import { internalTokenConfigured } from '@/lib/security/internal';

export const dynamic = 'force-dynamic';

/** Lets n8n verify connectivity and token health without side effects. */
export async function GET() {
  return NextResponse.json({
    automationEnabled: internalTokenConfigured(),
    timestamp: new Date().toISOString(),
  });
}
