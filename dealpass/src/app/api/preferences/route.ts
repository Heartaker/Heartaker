import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isLocale, COUNTRIES, CURRENCIES } from '@/lib/i18n/config';
import { getCurrentUser } from '@/lib/auth/session';
import { query } from '@/lib/db';

/**
 * Persist a visitor's language / country / currency / theme choice.
 * Anonymous visitors store the choice in a cookie; signed-in users also have it
 * written to their profile so it follows them across devices.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const store = await cookies();
  const oneYear = 60 * 60 * 24 * 365;
  const options = { path: '/', maxAge: oneYear, sameSite: 'lax' as const };

  if (typeof body.language === 'string' && isLocale(body.language)) {
    store.set('dealpass_lang', body.language, options);
  }
  if (typeof body.country === 'string' && COUNTRIES.some((c) => c.code === body.country)) {
    store.set('dealpass_country', body.country, options);
  }
  if (typeof body.currency === 'string' && CURRENCIES.some((c) => c.code === body.currency)) {
    store.set('dealpass_currency', body.currency, options);
  }
  if (body.theme === 'dark' || body.theme === 'light') {
    store.set('dealpass_theme', body.theme, options);
  }

  const user = await getCurrentUser();
  if (user) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (typeof body.language === 'string' && isLocale(body.language)) {
      values.push(body.language); fields.push(`preferred_language = $${values.length}`);
    }
    if (typeof body.country === 'string' && COUNTRIES.some((c) => c.code === body.country)) {
      values.push(body.country); fields.push(`preferred_country = $${values.length}`);
    }
    if (typeof body.currency === 'string' && CURRENCIES.some((c) => c.code === body.currency)) {
      values.push(body.currency); fields.push(`preferred_currency = $${values.length}`);
    }
    if (fields.length > 0) {
      values.push(user.id);
      await query(`UPDATE profiles SET ${fields.join(', ')}, updated_at = now() WHERE id = $${values.length}`, values);
    }
  }

  return NextResponse.json({ ok: true });
}
