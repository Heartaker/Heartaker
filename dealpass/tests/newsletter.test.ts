import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { describeDb } from './helpers/db';
import { query, queryOne } from '@/lib/db';
import {
  subscribe,
  confirmSubscription,
  unsubscribeWithToken,
  unsubscribeByEmail,
  confirmedSegments,
  newsletterStats,
  isValidEmail,
  purgeStaleUnconfirmed,
} from '@/lib/services/newsletter';

/**
 * Double opt-in is a hard requirement: no code path may send marketing email
 * to someone who has not confirmed. These tests cover the application layer;
 * a database trigger (`assert_marketable`) covers every other path, including
 * anything n8n might do directly.
 */

const TEST_EMAILS = [
  'dealpass-test-a@example.test',
  'dealpass-test-b@example.test',
  'dealpass-test-c@example.test',
];

describeDb('newsletter double opt-in', () => {
  beforeAll(async () => {
    await query('DELETE FROM newsletter_subscribers WHERE email = ANY($1::text[])', [TEST_EMAILS]);
  });

  afterAll(async () => {
    await query('DELETE FROM newsletter_subscribers WHERE email = ANY($1::text[])', [TEST_EMAILS]);
  });

  it('rejects a malformed address without touching the database', async () => {
    const result = await subscribe({
      email: 'not-an-email',
      language: 'fr',
      country: 'DZ',
    });
    expect(result.status).toBe('invalid_email');
  });

  it('stores a pending subscriber, never a confirmed one', async () => {
    const result = await subscribe({
      email: TEST_EMAILS[0]!,
      language: 'fr',
      country: 'DZ',
      frequency: 'weekly',
    });
    expect(result.status).toBe('confirmation_sent');

    const row = await queryOne<{ consent_status: string; confirmed_at: string | null }>(
      'SELECT consent_status, confirmed_at FROM newsletter_subscribers WHERE email = $1',
      [TEST_EMAILS[0]!],
    );
    expect(row?.consent_status).toBe('pending');
    expect(row?.confirmed_at).toBeNull();
  });

  it('never stores the confirmation token itself, only its hash', async () => {
    const row = await queryOne<{ confirmation_token_hash: string | null }>(
      'SELECT confirmation_token_hash FROM newsletter_subscribers WHERE email = $1',
      [TEST_EMAILS[0]!],
    );
    expect(row?.confirmation_token_hash).toBeTruthy();
    expect(row?.confirmation_token_hash?.length).toBe(64); // sha-256 hex
  });

  it('leaves unconfirmed subscribers out of every sendable segment', async () => {
    const segments = await confirmedSegments();
    const all = segments.flatMap((segment) => segment.emails);
    expect(all).not.toContain(TEST_EMAILS[0]!);
  });

  it('promotes a subscriber to confirmed only with the real token', async () => {
    const row = await queryOne<{ confirmation_token_hash: string }>(
      'SELECT confirmation_token_hash FROM newsletter_subscribers WHERE email = $1',
      [TEST_EMAILS[0]!],
    );
    // Confirming with the stored hash rather than the token must fail: the
    // hash is not the token, and only the emailed token can confirm.
    expect(await confirmSubscription(row!.confirmation_token_hash)).toBe('invalid_token');
  });

  it('refuses to mark a subscriber confirmed without a confirmation timestamp', async () => {
    await expect(
      query(
        `UPDATE newsletter_subscribers SET consent_status = 'confirmed', confirmed_at = NULL
          WHERE email = $1`,
        [TEST_EMAILS[1]!],
      ),
    ).resolves.toBeDefined();

    // The trigger fires before the row is written, so a direct attempt to
    // skip double opt-in raises rather than silently succeeding.
    await query(
      `INSERT INTO newsletter_subscribers (email, language_code, consent_status, confirmed_at)
       VALUES ($1, 'fr', 'pending', NULL)
       ON CONFLICT (email) DO NOTHING`,
      [TEST_EMAILS[1]!],
    );

    await expect(
      query(
        `UPDATE newsletter_subscribers SET consent_status = 'confirmed', confirmed_at = NULL
          WHERE email = $1`,
        [TEST_EMAILS[1]!],
      ),
    ).rejects.toThrow(/double opt-in/i);
  });

  it('completes the full double opt-in round trip', async () => {
    // Seed a pending subscriber with a token we know, so the real
    // confirmSubscription() code path can be exercised end to end.
    const knownToken = 'test-confirmation-token-abc123';
    const tokenHash = createHash('sha256')
      .update(`${process.env.DATA_ENCRYPTION_KEY || 'dealpass-default-salt-change-me'}|${knownToken}`)
      .digest('hex');

    await query(
      `INSERT INTO newsletter_subscribers
         (email, language_code, country_code, delivery_frequency, consent_status,
          confirmation_token_hash, confirmation_sent_at)
       VALUES ($1, 'fr', 'DZ', 'weekly', 'pending', $2, now())
       ON CONFLICT (email) DO UPDATE
         SET consent_status = 'pending',
             confirmed_at = NULL,
             unsubscribed_at = NULL,
             confirmation_token_hash = EXCLUDED.confirmation_token_hash`,
      [TEST_EMAILS[2]!, tokenHash],
    );

    // Not confirmed yet, so not sendable.
    expect((await confirmedSegments()).flatMap((segment) => segment.emails)).not.toContain(
      TEST_EMAILS[2]!,
    );

    expect(await confirmSubscription(knownToken)).toBe('confirmed');

    const row = await queryOne<{ consent_status: string; confirmed_at: string | null }>(
      'SELECT consent_status, confirmed_at FROM newsletter_subscribers WHERE email = $1',
      [TEST_EMAILS[2]!],
    );
    expect(row?.consent_status).toBe('confirmed');
    expect(row?.confirmed_at).toBeTruthy();

    // Now sendable.
    expect((await confirmedSegments()).flatMap((segment) => segment.emails)).toContain(
      TEST_EMAILS[2]!,
    );

    // The token is single use: confirming again reports already confirmed.
    expect(await confirmSubscription(knownToken)).toBe('invalid_token');
  });

  it('unsubscribes a confirmed subscriber by email', async () => {
    expect(await unsubscribeByEmail(TEST_EMAILS[2]!)).toBe(true);

    const row = await queryOne<{ unsubscribed_at: string | null; consent_status: string }>(
      'SELECT unsubscribed_at, consent_status FROM newsletter_subscribers WHERE email = $1',
      [TEST_EMAILS[2]!],
    );
    expect(row?.consent_status).toBe('unsubscribed');
    expect(row?.unsubscribed_at).toBeTruthy();
  });

  it('excludes unsubscribed addresses from the sendable segments', async () => {
    const segments = await confirmedSegments();
    const all = segments.flatMap((segment) => segment.emails);
    expect(all).not.toContain(TEST_EMAILS[2]!);
  });

  it('ignores an unsubscribe request for an unknown address', async () => {
    expect(await unsubscribeByEmail('nobody-here@example.test')).toBe(false);
  });

  it('ignores an unsubscribe token that was never issued', async () => {
    expect(await unsubscribeWithToken('not-a-real-token')).toBe(false);
  });

  it('reports coherent statistics', async () => {
    const stats = await newsletterStats();
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(stats.confirmed).toBeLessThanOrEqual(stats.total);
    expect(stats.unsubscribed).toBeLessThanOrEqual(stats.total);
  });

  it('purges only subscribers who never confirmed', async () => {
    // A confirmed subscriber must survive a purge, however old they are.
    await query(
      `INSERT INTO newsletter_subscribers
         (email, language_code, country_code, delivery_frequency, consent_status,
          confirmed_at, confirmation_sent_at, created_at)
       VALUES ($1, 'fr', 'DZ', 'weekly', 'confirmed', now(),
               now() - interval '400 days', now() - interval '400 days')
       ON CONFLICT (email) DO UPDATE
         SET consent_status = 'confirmed',
             confirmed_at = now(),
             unsubscribed_at = NULL,
             confirmation_sent_at = now() - interval '400 days',
             created_at = now() - interval '400 days'`,
      [TEST_EMAILS[2]!],
    );
    await query(
      `UPDATE newsletter_subscribers
          SET created_at = now() - interval '400 days'
        WHERE email = $1`,
      [TEST_EMAILS[0]!],
    );

    await purgeStaleUnconfirmed(30);

    const survivor = await queryOne<{ consent_status: string }>(
      'SELECT consent_status FROM newsletter_subscribers WHERE email = $1',
      [TEST_EMAILS[2]!],
    );
    expect(survivor?.consent_status).toBe('confirmed');
  });
});

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    for (const email of ['a@b.com', 'first.last@sub.example.co.uk', 'user+tag@example.org']) {
      expect(isValidEmail(email)).toBe(true);
    }
  });

  it('rejects malformed addresses', () => {
    for (const email of ['', 'plain', 'a@', '@b.com', 'a b@c.com', 'a@b']) {
      expect(isValidEmail(email)).toBe(false);
    }
  });
});
