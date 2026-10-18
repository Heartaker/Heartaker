import { describe, it, expect } from 'vitest';
import { validateOffer, type PublicationRules } from '@/lib/validation';
import type { NormalizedOffer } from '@/lib/types';

/**
 * The validation engine is the gate between a connector and the public site.
 * These tests pin down the two behaviours the specification is explicit about:
 * confidence scoring with configurable thresholds, and automatic rejection for
 * offers that are impossible to trust.
 */

const RULES: PublicationRules = {
  autoPublishThreshold: 90,
  reviewThreshold: 70,
  rejectBelow: 70,
  requireTerms: true,
  requireCountry: true,
  requireExpiryOrOngoing: false,
  maxDaysUntilExpiry: 365,
  autoExpireEnabled: true,
  staleAfterDays: 30,
  allowUnverifiedPublish: false,
};

function makeOffer(overrides: Partial<NormalizedOffer> = {}): NormalizedOffer {
  return {
    externalId: 'ext-1',
    merchantExternalId: 'merchant-1',
    title: '-20% sitewide at Example Shop',
    shortDescription: 'Twenty percent off everything, all week.',
    fullDescription: 'Twenty percent off everything in the shop, for one week only.',
    termsAndConditions: 'Valid once per customer. Cannot be combined with other offers.',
    offerType: 'coupon_code',
    couponCode: 'SAVE20',
    discountType: 'percentage',
    discountValue: 20,
    currency: 'EUR',
    destinationUrl: 'https://www.example-shop.com/promo',
    affiliateUrl: 'https://www.example-shop.com/promo?ref=dealpass',
    countryCodes: ['FR', 'BE'],
    languageCodes: ['fr'],
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    startAt: new Date(Date.now() - 86_400_000),
    sourceType: 'api',
    ...overrides,
  };
}

const evaluate = (overrides: Partial<NormalizedOffer> = {}) =>
  validateOffer({
    offer: makeOffer(overrides),
    merchantDomains: ['example-shop.com'],
    merchantRecognized: true,
    isDuplicate: false,
    rules: RULES,
  });

describe('validateOffer', () => {
  it('auto-publishes a complete, coherent offer', () => {
    const result = evaluate();
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.decision).toBe('publish');
    expect(result.status).toBe('approved');
  });

  it('rejects a coupon_code offer that carries no code', () => {
    const result = evaluate({ couponCode: null });
    expect(result.decision).toBe('reject');
    expect(result.issues.some((issue) => issue.code.includes('code'))).toBe(true);
  });

  it('rejects an offer whose end date is before its start date', () => {
    const start = new Date(Date.now() + 10 * 86_400_000);
    const end = new Date(Date.now() - 5 * 86_400_000);
    const result = evaluate({ startAt: start, expiresAt: end });
    expect(result.decision).toBe('reject');
  });

  it('rejects an offer that has already expired', () => {
    const result = evaluate({ expiresAt: new Date(Date.now() - 86_400_000) });
    expect(result.decision).toBe('reject');
  });

  it('rejects an offer whose destination is not the merchant domain', () => {
    const result = evaluate({ destinationUrl: 'https://totally-different.example/deal' });
    expect(result.decision).toBe('reject');
  });

  it('rejects an unrecognised source', () => {
    const result = validateOffer({
      offer: makeOffer({ sourceType: 'unknown' as never }),
      merchantDomains: ['example-shop.com'],
      merchantRecognized: true,
      isDuplicate: false,
      rules: RULES,
    });
    expect(result.decision).toBe('reject');
  });

  it('sends a high-scoring offer to review when a required field is missing', () => {
    // Complete except for the terms. The score stays high, but the
    // critical-field gate overrides it: "missing critical information
    // requires review" is a rule of its own, not a points deduction.
    const result = evaluate({ termsAndConditions: null });
    expect(result.decision).toBe('review');
    expect(result.status).toBe('pending_validation');
    expect(result.score).toBeGreaterThan(90);
    expect(result.issues.some((issue) => issue.code === 'critical_field_missing')).toBe(true);
  });

  it('sends an offer with no country to human review when countries are required', () => {
    const result = evaluate({ countryCodes: [] });
    expect(result.decision).toBe('review');
  });

  it('honours configurable thresholds', () => {
    const lenient = validateOffer({
      offer: makeOffer({ termsAndConditions: null }),
      merchantDomains: ['example-shop.com'],
      merchantRecognized: true,
      isDuplicate: false,
      rules: { ...RULES, autoPublishThreshold: 50, reviewThreshold: 30, requireTerms: false },
    });
    expect(lenient.decision).not.toBe('reject');
  });

  it('never returns a score outside 0–100', () => {
    for (const offer of [
      makeOffer(),
      makeOffer({ termsAndConditions: null }),
      makeOffer({ shortDescription: null, fullDescription: null }),
      makeOffer({ countryCodes: [] }),
    ]) {
      const result = validateOffer({
        offer,
        merchantDomains: ['example-shop.com'],
        merchantRecognized: true,
        isDuplicate: false,
        rules: RULES,
      });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it('reports every reason it rejected an offer', () => {
    const result = evaluate({ couponCode: null, termsAndConditions: null, countryCodes: [] });
    expect(result.decision).toBe('reject');
    expect(result.issues.filter((issue) => issue.severity === 'error').length).toBeGreaterThan(0);
  });
});
