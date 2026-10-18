import { NextResponse } from 'next/server';
import { isInternalCaller, unauthorizedResponse } from '@/lib/security/internal';

/**
 * Wraps an internal automation endpoint: verifies the shared token, runs the
 * handler, and converts a thrown error into a logged 500 rather than an
 * unhandled rejection.
 */
export async function internalRoute(
  handler: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>,
  request: Request,
): Promise<NextResponse> {
  if (!(await isInternalCaller())) {
    return unauthorizedResponse() as NextResponse;
  }

  let payload: Record<string, unknown> = {};
  if (request.method === 'POST') {
    try {
      const text = await request.text();
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 });
    }
  }

  try {
    const result = await handler(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[internal-route]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
