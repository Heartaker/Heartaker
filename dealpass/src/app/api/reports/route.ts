import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { rateLimit, rateLimitKey } from '@/lib/security/request';
import { privacyHash } from '@/lib/normalize';

export const dynamic = 'force-dynamic';

const schema = z.object({
  offerId: z.string().uuid(),
  reason: z.enum([
    'expired','code_invalid','code_not_working','misleading_terms',
    'broken_link','not_available_in_country','other',
  ]),
  comment: z.string().max(1000).optional(),
  email: z.string().email().optional(),
});

/** Visitor reports of invalid coupons. Rate limited to prevent abuse. */
export async function POST(request: NextRequest) {
  const limit = rateLimit(rateLimitKey(request, 'report'), 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  await query(
    `INSERT INTO coupon_reports (offer_id, reason, comment, reporter_email, reporter_hash, status)
     VALUES ($1, $2, $3, $4, $5, 'open')`,
    [
      parsed.offerId,
      parsed.reason,
      parsed.comment ?? null,
      parsed.email ?? null,
      parsed.email
        ? privacyHash(parsed.email, process.env.DATA_ENCRYPTION_KEY || 'dealpass-salt')
        : null,
    ],
  );

  return NextResponse.json({ ok: true });
}
