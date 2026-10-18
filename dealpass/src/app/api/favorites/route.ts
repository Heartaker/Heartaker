import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { toggleFavorite } from '@/lib/services/offers';

export const dynamic = 'force-dynamic';

const schema = z.object({ offerId: z.string().uuid() });

/** Toggle a favourite. Requires an account; the browse experience does not. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  const active = await toggleFavorite(user.id, parsed.offerId);
  return NextResponse.json({ ok: true, favorite: active });
}
