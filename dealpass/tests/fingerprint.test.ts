import { describe, it, expect } from 'vitest';
import { buildFingerprint, fingerprintForOffer } from '@/lib/fingerprint';
import type { NormalizedOffer } from '@/lib/types';

/**
 * The fingerprint is the single thing that keeps imports idempotent. If it
 * ever becomes non-deterministic, re-running an import would duplicate every
 * offer in the catalogue — so it gets the strictest tests in the suite.
 */

function makeOffer(overrides: Partial<NormalizedOffer> = {}): NormalizedOffer {
  return {
    externalId: 'ext-1',
    merchantExternalId: 'merchant-1',
    title: '-20% sitewide',
    offerType: 'coupon_code',
    couponCode: 'SAVE20',
    discountType: 'percentage',
    discountValue: 20,
    currency: 'EUR',
    destinationUrl: 'https://shop.example/promo',
    countryCodes: ['FR'],
    languageCodes: ['fr'],
    sourceType: 'api',
    ...overrides,
  };
}

describe('buildFingerprint', () => {
  it('is deterministic for the same input', () => {
    const a = fingerprintForOffer(makeOffer(), 'demo');
    const b = fingerprintForOffer(makeOffer(), 'demo');
    expect(a).toBe(b);
  });

  it('is stable regardless of key insertion order', () => {
    const offer = makeOffer();
    const reversed: NormalizedOffer = Object.fromEntries(
      Object.entries(offer).reverse(),
    ) as NormalizedOffer;
    expect(fingerprintForOffer(reversed, 'demo')).toBe(fingerprintForOffer(offer, 'demo'));
  });

  it('changes when the network changes', () => {
    expect(fingerprintForOffer(makeOffer(), 'network-a')).not.toBe(
      fingerprintForOffer(makeOffer(), 'network-b'),
    );
  });

  it('changes when the coupon code changes', () => {
    expect(fingerprintForOffer(makeOffer({ couponCode: 'SAVE20' }), 'demo')).not.toBe(
      fingerprintForOffer(makeOffer({ couponCode: 'SAVE30' }), 'demo'),
    );
  });

  it('changes when the merchant changes', () => {
    expect(fingerprintForOffer(makeOffer({ merchantExternalId: 'm1' }), 'demo')).not.toBe(
      fingerprintForOffer(makeOffer({ merchantExternalId: 'm2' }), 'demo'),
    );
  });

  it('changes when the destination URL changes', () => {
    expect(
      fingerprintForOffer(makeOffer({ destinationUrl: 'https://a.example/p' }), 'demo'),
    ).not.toBe(fingerprintForOffer(makeOffer({ destinationUrl: 'https://b.example/p' }), 'demo'));
  });

  it('ignores cosmetic whitespace and casing in the code', () => {
    expect(fingerprintForOffer(makeOffer({ couponCode: 'save20' }), 'demo')).toBe(
      fingerprintForOffer(makeOffer({ couponCode: ' SAVE20 ' }), 'demo'),
    );
  });

  it('ignores volatile tracking parameters on the destination URL', () => {
    const base = makeOffer({ destinationUrl: 'https://shop.example/promo' });
    const tracked = makeOffer({
      destinationUrl: 'https://shop.example/promo?utm_source=x&fbclid=abc123&gclid=zzz',
    });
    expect(fingerprintForOffer(tracked, 'demo')).toBe(fingerprintForOffer(base, 'demo'));
  });
});
