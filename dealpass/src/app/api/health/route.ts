import { NextResponse } from 'next/server';
import { query, getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Liveness + readiness probe used by uptime monitoring. */
export async function GET() {
  try {
    const db = await getDb();
    const row = await query<{ n: string }>(
      `SELECT (SELECT count(*)::text FROM offers WHERE deleted_at IS NULL) AS n`,
    );
    return NextResponse.json({
      status: 'ok',
      driver: db.name,
      offers: Number(row[0]?.n ?? 0),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'unknown' },
      { status: 503 },
    );
  }
}
