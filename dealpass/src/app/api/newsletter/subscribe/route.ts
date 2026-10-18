import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { subscribe } from '@/lib/services/newsletter';
import { isLocale } from '@/lib/i18n/config';
import { rateLimit, rateLimitKey } from '@/lib/security/request';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().max(254),
  language: z.string().optional(),
  country: z.string().max(2).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
});

/** Subscribe. Always returns 200 to avoid disclosing which emails exist. */
export async function POST(request: NextRequest) {
  const limit = rateLimit(rateLimitKey(request, 'newsletter'), 5, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const result = await subscribe({
    email: parsed.email,
    language: isLocale(parsed.language) ? parsed.language : 'fr',
    country: parsed.country,
    frequency: parsed.frequency,
  });

  if (result.status === 'invalid_email') {
    return NextResponse.json({ ok: false, code: 'invalid_email' }, { status: 400 });
  }
  if (result.status === 'already_confirmed') {
    return NextResponse.json({ ok: true, code: 'already_subscribed' }, { status: 200 });
  }
  return NextResponse.json({ ok: true, code: 'confirmation_sent' });
}
