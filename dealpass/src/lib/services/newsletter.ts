import { randomBytes } from 'node:crypto';
import { query, queryOne } from '../db';
import { sha256 } from '../normalize';
import { getEmailProvider } from '../email';
import type { Locale } from '../types';

/**
 * Newsletter subscription with mandatory double opt-in.
 *
 * Compliance guarantees enforced here (not just in the UI):
 *   • A subscriber is created with consent_status = 'pending'.
 *   • Only the HASH of the confirmation/unsubscribe token is stored — the token
 *     itself exists only in the email we send.
 *   • Marketing email is never sent before `confirmed_at` is set. The database
 *     itself rejects consent_status='confirmed' without confirmed_at
 *     (migration 0005), so n8n, the API and the admin UI all share one rule.
 *   • Unsubscribe is immediate and permanent.
 */

const TOKEN_BYTES = 32;

function salt(): string {
  return process.env.DATA_ENCRYPTION_KEY || 'dealpass-default-salt-change-me';
}

function hashToken(token: string): string {
  return sha256(`${salt()}|${token}`);
}

export type SubscribeResult =
  | { status: 'confirmation_sent' }
  | { status: 'already_confirmed' }
  | { status: 'invalid_email' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export interface SubscribeInput {
  email: string;
  language: Locale;
  country?: string;
  frequency?: 'daily' | 'weekly' | 'monthly';
  categories?: string[];
  merchants?: string[];
  source?: string;
}

export async function subscribe(input: SubscribeInput): Promise<SubscribeResult> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { status: 'invalid_email' };

  const existing = await queryOne<{ id: string; consent_status: string }>(
    'SELECT id, consent_status FROM newsletter_subscribers WHERE email = $1',
    [email],
  );

  if (existing?.consent_status === 'confirmed') {
    return { status: 'already_confirmed' };
  }

  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const unsubscribeToken = randomBytes(TOKEN_BYTES).toString('hex');
  const provider = getEmailProvider();

  await query(
    `INSERT INTO newsletter_subscribers (
       email, language_code, country_code, delivery_frequency, consent_status,
       consent_source, consent_at, confirmation_token_hash, confirmation_sent_at,
       unsubscribe_token_hash, preferred_categories, preferred_merchants
     )
     VALUES ($1,$2,$3,$4,'pending',$5,now(),$6,now(),$7,$8::uuid[],$9::uuid[])
     ON CONFLICT (email) DO UPDATE SET
       language_code          = EXCLUDED.language_code,
       country_code           = EXCLUDED.country_code,
       delivery_frequency     = EXCLUDED.delivery_frequency,
       confirmation_token_hash = EXCLUDED.confirmation_token_hash,
       confirmation_sent_at   = now(),
       unsubscribe_token_hash = EXCLUDED.unsubscribe_token_hash,
       consent_status         = 'pending',
       unsubscribed_at        = NULL,
       updated_at             = now()`,
    [
      email,
      input.language,
      input.country ?? 'DZ',
      input.frequency ?? 'weekly',
      input.source ?? 'website_form',
      hashToken(token),
      hashToken(unsubscribeToken),
      input.categories ?? [],
      input.merchants ?? [],
    ],
  );

  // Contact is created in the UNCONFIRMED list only.
  await provider
    .upsertContact({
      email,
      attributes: {
        LANGUAGE: input.language,
        COUNTRY: input.country ?? 'DZ',
        FREQUENCY: input.frequency ?? 'weekly',
        CONFIRMED: false,
      },
      listIds: process.env.BREVO_UNCONFIRMED_LIST_ID
        ? [Number(process.env.BREVO_UNCONFIRMED_LIST_ID)]
        : [],
    })
    .catch(() => undefined);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const confirmationUrl = `${siteUrl}/${input.language}/newsletter/confirm?token=${token}`;

  await provider.sendDoubleOptIn(email, confirmationUrl, {
    LANGUAGE: input.language,
    COUNTRY: input.country ?? 'DZ',
  }).catch(() => undefined);

  return { status: 'confirmation_sent' };
}

export type ConfirmResult = 'confirmed' | 'already_confirmed' | 'invalid_token';

export async function confirmSubscription(token: string): Promise<ConfirmResult> {
  const hash = hashToken(token);
  const row = await queryOne<{ id: string; email: string; consent_status: string; language_code: Locale }>(
    `SELECT id, email, consent_status, language_code
       FROM newsletter_subscribers
      WHERE confirmation_token_hash = $1`,
    [hash],
  );

  if (!row) return 'invalid_token';
  if (row.consent_status === 'confirmed') return 'already_confirmed';

  await query(
    `UPDATE newsletter_subscribers
        SET consent_status = 'confirmed',
            confirmed_at = now(),
            unsubscribed_at = NULL,
            confirmation_token_hash = NULL,
            updated_at = now()
      WHERE id = $1`,
    [row.id],
  );

  const provider = getEmailProvider();
  // Promote to the confirmed list and leave the pending list.
  await provider
    .updateLists(
      row.email,
      process.env.BREVO_CONFIRMED_LIST_ID ? [Number(process.env.BREVO_CONFIRMED_LIST_ID)] : [],
      process.env.BREVO_UNCONFIRMED_LIST_ID ? [Number(process.env.BREVO_UNCONFIRMED_LIST_ID)] : [],
    )
    .catch(() => undefined);

  return 'confirmed';
}

export async function unsubscribeWithToken(token: string): Promise<boolean> {
  const hash = hashToken(token);
  const row = await queryOne<{ id: string; email: string }>(
    'SELECT id, email FROM newsletter_subscribers WHERE unsubscribe_token_hash = $1',
    [hash],
  );
  if (!row) return false;

  await query(
    `UPDATE newsletter_subscribers
        SET consent_status = 'unsubscribed',
            unsubscribed_at = now(),
            confirmation_token_hash = NULL,
            updated_at = now()
      WHERE id = $1`,
    [row.id],
  );

  await getEmailProvider().unsubscribe(row.email).catch(() => undefined);
  return true;
}

export async function unsubscribeByEmail(email: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM newsletter_subscribers WHERE email = $1',
    [email.trim().toLowerCase()],
  );
  if (!row) return false;

  await query(
    `UPDATE newsletter_subscribers
        SET consent_status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
      WHERE id = $1`,
    [row.id],
  );
  await getEmailProvider().unsubscribe(email).catch(() => undefined);
  return true;
}

// ---------------------------------------------------------------------------
// Segmentation for automated campaigns (WORKFLOW 5)
// ---------------------------------------------------------------------------

export interface SubscriberSegment {
  language: Locale;
  country: string | null;
  frequency: string;
  emails: string[];
}

/** Only ever returns confirmed subscribers — pending contacts are excluded. */
export async function confirmedSegments(): Promise<SubscriberSegment[]> {
  const rows = await query<{ email: string; language_code: Locale; country_code: string; delivery_frequency: string }>(
    `SELECT email, language_code, country_code, delivery_frequency
       FROM newsletter_subscribers
      WHERE consent_status = 'confirmed'
        AND unsubscribed_at IS NULL
      ORDER BY language_code, country_code`,
  );

  const map = new Map<string, SubscriberSegment>();
  for (const row of rows) {
    const key = `${row.language_code}|${row.country_code}|${row.delivery_frequency}`;
    const segment = map.get(key) ?? {
      language: row.language_code,
      country: row.country_code,
      frequency: row.delivery_frequency,
      emails: [],
    };
    segment.emails.push(row.email);
    map.set(key, segment);
  }
  return [...map.values()];
}

/** Housekeeping: suppress contacts who never confirmed within 30 days. */
export async function purgeStaleUnconfirmed(days = 30): Promise<number> {
  const rows = await query<{ id: string; email: string }>(
    `UPDATE newsletter_subscribers
        SET consent_status = 'suppressed', updated_at = now()
      WHERE consent_status = 'pending'
        AND confirmation_sent_at < now() - ($1 || ' days')::interval
      RETURNING id, email`,
    [String(days)],
  );

  for (const row of rows) {
    await getEmailProvider().unsubscribe(row.email).catch(() => undefined);
  }
  return rows.length;
}

export async function newsletterStats(): Promise<{
  total: number;
  confirmed: number;
  pending: number;
  unsubscribed: number;
}> {
  const row = await queryOne<Record<string, string>>(
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE consent_status = 'confirmed')::text   AS confirmed,
       count(*) FILTER (WHERE consent_status = 'pending')::text     AS pending,
       count(*) FILTER (WHERE consent_status = 'unsubscribed')::text AS unsubscribed
     FROM newsletter_subscribers`,
  );
  return {
    total: Number(row?.total ?? 0),
    confirmed: Number(row?.confirmed ?? 0),
    pending: Number(row?.pending ?? 0),
    unsubscribed: Number(row?.unsubscribed ?? 0),
  };
}
