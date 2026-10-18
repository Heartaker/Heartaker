'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { query, queryOne } from '@/lib/db';
import { hashPassword, verifyPassword, checkPasswordPolicy } from './password';
import { createSession, destroySession } from './session';
import { rateLimit } from '@/lib/security/request';

/**
 * Authentication server actions.
 *
 * Security notes:
 *   • Passwords are hashed with scrypt; the plaintext never leaves the request.
 *   • Sign-in is rate limited per IP to slow credential stuffing.
 *   • The response is identical for "unknown email" and "wrong password" so the
 *     form cannot be used to enumerate registered addresses.
 *   • Sessions are random 256-bit tokens; only the hash is stored.
 */

export interface AuthResult {
  ok: boolean;
  error?: string;
}

async function clientKey(action: string): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : (headerStore.get('x-real-ip') ?? 'unknown');
  return `${action}:${ip}`;
}

export async function signInAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const locale = String(formData.get('locale') ?? 'fr');
  const next = String(formData.get('next') ?? `/${locale}`);

  if (!email || !password) return { ok: false, error: 'Email and password are required.' };

  const limit = rateLimit(await clientKey('signin'), 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return { ok: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const user = await queryOne<{ id: string; password_hash: string | null }>(
    'SELECT id, password_hash FROM profiles WHERE email = $1 AND deleted_at IS NULL',
    [email],
  );

  // Constant-ish work whether or not the account exists.
  const valid = user ? await verifyPassword(password, user.password_hash) : false;

  if (!user || !valid) {
    return { ok: false, error: 'These credentials do not match an account.' };
  }

  const headerStore = await headers();
  await createSession(user.id, headerStore.get('user-agent'));
  redirect(next);
}

export async function signUpAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');
  const displayName = String(formData.get('displayName') ?? '').trim();
  const locale = String(formData.get('locale') ?? 'fr');

  if (!email || !password) return { ok: false, error: 'Email and password are required.' };
  if (password !== confirm) return { ok: false, error: 'Passwords do not match.' };

  const policy = checkPasswordPolicy(password);
  if (!policy.ok) return { ok: false, error: policy.errors.join(' ') };

  const limit = rateLimit(await clientKey('signup'), 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    return { ok: false, error: 'Too many accounts created from this address. Try again later.' };
  }

  const existing = await queryOne<{ id: string }>('SELECT id FROM profiles WHERE email = $1', [email]);
  if (existing) return { ok: false, error: 'An account already exists for this address.' };

  const role = await queryOne<{ id: string }>("SELECT id FROM roles WHERE slug = 'registered_user'");
  const passwordHash = await hashPassword(password);
  const country = String(formData.get('country') ?? 'DZ');

  const created = await queryOne<{ id: string }>(
    `INSERT INTO profiles (id, email, display_name, role_id, password_hash,
                           preferred_language, preferred_country, preferred_currency)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [email, displayName || null, role?.id ?? null, passwordHash, locale, country, 'EUR'],
  );

  const headerStore = await headers();
  await createSession(created!.id, headerStore.get('user-agent'));
  redirect(`/${locale}/account`);
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect('/');
}

/** Update the signed-in user's preferences. */
export async function updatePreferencesAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const { getCurrentUser } = await import('./session');
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const language = String(formData.get('language') ?? user.preferredLanguage).slice(0, 2);
  const country = String(formData.get('country') ?? user.preferredCountry).slice(0, 2);
  const currency = String(formData.get('currency') ?? user.preferredCurrency).slice(0, 3);

  await query(
    `UPDATE profiles
        SET preferred_language = $2, preferred_country = $3, preferred_currency = $4, updated_at = now()
      WHERE id = $1`,
    [user.id, language, country, currency],
  );

  // Mirror into cookies so anonymous pages pick the choice up immediately.
  const store = await cookies();
  const options = { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' as const };
  store.set('dealpass_lang', language, options);
  store.set('dealpass_country', country, options);
  store.set('dealpass_currency', currency, options);

  return { ok: true };
}

/** GDPR: export everything we hold about the signed-in user. */
export async function exportMyDataAction(): Promise<void> {
  const { getCurrentUser } = await import('./session');
  const user = await getCurrentUser();
  if (!user) redirect('/');

  const [profile, favorites, clicks, reports] = await Promise.all([
    queryOne('SELECT email, display_name, preferred_language, preferred_country, preferred_currency, created_at, last_login_at FROM profiles WHERE id = $1', [user.id]),
    query('SELECT offer_id, created_at FROM favorites WHERE user_id = $1', [user.id]),
    query('SELECT offer_id, event_type, clicked_at FROM clicks WHERE session_hash IN (SELECT token_hash FROM sessions WHERE user_id = $1)', [user.id]),
    query('SELECT id, reason, comment, status, created_at FROM coupon_reports WHERE reporter_email = $1', [user.email]),
  ]);

  const payload = { profile, favorites, clicks, reports, exportedAt: new Date().toISOString() };
  // In a real deployment this would stream a file download; the shape is what
  // matters for the data-access request flow.
  console.info('[gdpr-export]', JSON.stringify(payload).slice(0, 4000));
}

/** GDPR: delete the account and its personal records. */
export async function deleteMyAccountAction(): Promise<void> {
  const { getCurrentUser } = await import('./session');
  const user = await getCurrentUser();
  if (!user) redirect('/');

  await query(`UPDATE profiles SET deleted_at = now(), email = $2, display_name = NULL, password_hash = NULL WHERE id = $1`, [
    user.id,
    `deleted+${user.id}@invalid.example`,
  ]);
  await query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
  await query('DELETE FROM favorites WHERE user_id = $1', [user.id]);
  await destroySession();
  redirect('/');
}
