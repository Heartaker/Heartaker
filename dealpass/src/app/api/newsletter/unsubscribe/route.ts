import { NextResponse } from 'next/server';
import { z } from 'zod';
import { unsubscribeByEmail, unsubscribeWithToken } from '@/lib/services/newsletter';

export const dynamic = 'force-dynamic';

const schema = z.object({ token: z.string().optional(), email: z.string().optional() });

/** One-click unsubscribe. Immediate, per anti-spam regulations. */
export async function POST(request: Request) {
  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const ok = parsed.token
    ? await unsubscribeWithToken(parsed.token)
    : parsed.email
      ? await unsubscribeByEmail(parsed.email)
      : false;

  return NextResponse.json({ ok });
}
