import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordCodeCopy, detectDeviceType } from '@/lib/services/tracking';
import { clientIpFrom } from '@/lib/security/request';

export const dynamic = 'force-dynamic';

const schema = z.object({
  offerId: z.string().uuid(),
  eventType: z.enum(['view', 'code_reveal', 'code_copy', 'click']),
});

/** Anonymous interaction events. No account required, no personal data sent. */
export async function POST(request: NextRequest) {
  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  await recordCodeCopy(parsed.offerId, {
    language: request.nextUrl.searchParams.get('lang'),
    deviceType: detectDeviceType(request.headers.get('user-agent')),
    referrer: request.headers.get('referer'),
    // Only a salted, day-rotating digest is persisted — never the address.
    ip: clientIpFrom(request),
  }).catch(() => undefined);

  return new NextResponse(null, { status: 204 });
}
