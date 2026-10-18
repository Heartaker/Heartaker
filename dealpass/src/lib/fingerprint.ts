import { sha256, normalizeCouponCode, normalizeUrl, toDateKey, normalizeCountryCodes } from './normalize';
import type { NormalizedOffer } from './types';

/**
 * Stable identity for an offer.
 *
 * Built from the eight components named in the specification. Two imports of
 * the same real-world promotion — even via different connectors or on
 * different days — must produce the same fingerprint, so the import can be
 * idempotent and duplicates are impossible at the database level.
 *
 * The expiration date is reduced to a day key: a connector that reports
 * "ends 2026-05-01T23:59:59Z" one run and "ends 2026-05-01T00:00:01Z" the
 * next must not create two rows.
 *
 * This function is deliberately pure and synchronous so it is trivially
 * testable and usable from both the importer and the test-suite.
 */
export function buildFingerprint(input: {
  networkSlug: string;
  merchantExternalId: string;
  externalId: string;
  couponCode?: string | null;
  destinationUrl: string;
  countryCodes: string[];
  offerType: string;
  expiresAt?: Date | null;
}): string {
  const parts = [
    'dealpass-v1',
    (input.networkSlug || '').trim().toLowerCase(),
    (input.merchantExternalId || '').trim(),
    (input.externalId || '').trim(),
    normalizeCouponCode(input.couponCode),
    normalizeUrl(input.destinationUrl),
    normalizeCountryCodes(input.countryCodes).join('|'),
    (input.offerType || '').trim().toLowerCase(),
    toDateKey(input.expiresAt),
  ];

  return sha256(parts.join('\u241f')); // ASCII unit separator
}

export function fingerprintForOffer(
  offer: NormalizedOffer,
  networkSlug: string,
): string {
  return buildFingerprint({
    networkSlug,
    merchantExternalId: offer.merchantExternalId,
    externalId: offer.externalId,
    couponCode: offer.couponCode ?? null,
    destinationUrl: offer.destinationUrl,
    countryCodes: offer.countryCodes,
    offerType: offer.offerType,
    expiresAt: offer.expiresAt ?? null,
  });
}

/**
 * A looser identity used to catch near-duplicates that a connector reports
 * with a changed external id (common when a provider rotates its own keys).
 * Same merchant + code + destination + country, ignoring the external id.
 */
export function buildLooseFingerprint(input: {
  networkSlug: string;
  merchantExternalId: string;
  couponCode?: string | null;
  destinationUrl: string;
  countryCodes: string[];
}): string {
  return sha256(
    [
      'dealpass-loose-v1',
      (input.networkSlug || '').trim().toLowerCase(),
      (input.merchantExternalId || '').trim(),
      normalizeCouponCode(input.couponCode),
      normalizeUrl(input.destinationUrl),
      normalizeCountryCodes(input.countryCodes).join('|'),
    ].join('\u241f'),
  );
}
