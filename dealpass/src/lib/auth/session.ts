import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { query, queryOne } from '../db/index';
import { sha256 } from '../normalize';
import type { Locale } from '../types';

/**
 * Session management.
 *
 * The cookie carries a random 256-bit token. Only its SHA-256 digest is
 * stored, so a database leak cannot be replayed as a valid login.
 *
 * Production note: this is a self-contained implementation so the platform
 * runs with zero external services. Supabase Auth or another managed IdP is
 * recommended for production — see docs/AUTHENTICATION.md. The rest of the
 * application only depends on `getCurrentUser()`, so swapping the provider is
 * a single-file change.
 */

const COOKIE_NAME = 'dealpass_session';
const SESSION_TTL_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  roleSlug: string;
  permissions: string[];
  preferredLanguage: Locale;
  preferredCountry: string;
  preferredCurrency: string;
  emailVerifiedAt: string | null;
}

function hashToken(token: string): string {
  return sha256(token);
}

export async function createSession(
  userId: string,
  userAgent?: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_hash)
     VALUES ($1, $2, $3, $4, NULL)`,
    [userId, hashToken(token), expiresAt, userAgent?.slice(0, 255) ?? null],
  );
  await query(`UPDATE profiles SET last_login_at = now() WHERE id = $1`, [userId]);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  }
  store.delete(COOKIE_NAME);
}

/** Read the current user, or null when signed out / session expired. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const row = await queryOne<{
    id: string;
    email: string;
    display_name: string | null;
    role_slug: string | null;
    preferred_language: string;
    preferred_country: string;
    preferred_currency: string;
    email_verified_at: string | null;
  }>(
    `SELECT p.id, p.email, p.display_name, r.slug AS role_slug,
            p.preferred_language, p.preferred_country, p.preferred_currency,
            p.email_verified_at
       FROM sessions s
       JOIN profiles p ON p.id = s.user_id AND p.deleted_at IS NULL
       LEFT JOIN roles r ON r.id = p.role_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );

  if (!row) return null;

  const permissions = (
    await query<{ slug: string }>(
      `SELECT perm.slug
         FROM role_permissions rp
         JOIN permissions perm ON perm.id = rp.permission_id
        WHERE rp.role_id = (SELECT role_id FROM profiles WHERE id = $1)`,
      [row.id],
    )
  ).map((r) => r.slug);

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    roleSlug: row.role_slug ?? 'registered_user',
    permissions,
    preferredLanguage: (row.preferred_language ?? 'fr') as Locale,
    preferredCountry: row.preferred_country ?? 'DZ',
    preferredCurrency: row.preferred_currency ?? 'DZD',
    emailVerifiedAt: row.email_verified_at,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

/** Purge expired sessions. Called by the nightly maintenance workflow. */
export async function purgeExpiredSessions(): Promise<number> {
  const rows = await query<{ id: string }>(`DELETE FROM sessions WHERE expires_at <= now() RETURNING id`);
  return rows.length;
}
