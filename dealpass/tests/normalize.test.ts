import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  normalizeCouponCode,
  slugify,
  extractDomain,
  toDateKey,
  normalizeCountryCodes,
} from '@/lib/normalize';

describe('normalizeUrl', () => {
  it('strips tracking parameters', () => {
    expect(normalizeUrl('https://shop.example/promo?utm_source=x&gclid=1&fbclid=2')).toBe(
      'https://shop.example/promo',
    );
  });

  it('keeps parameters that identify the destination', () => {
    const url = normalizeUrl('https://shop.example/product?id=42&utm_medium=email');
    expect(url).toContain('id=42');
    expect(url).not.toContain('utm_medium');
  });

  it('drops the fragment and lowercases the host', () => {
    expect(normalizeUrl('HTTPS://SHOP.Example/Promo#section')).toBe('https://shop.example/Promo');
  });

  it('removes a trailing slash on the path', () => {
    expect(normalizeUrl('https://shop.example/promo/')).toBe('https://shop.example/promo');
  });

  it('returns the input unchanged for an unparseable value', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('normalizeCouponCode', () => {
  it('upper-cases and trims', () => {
    expect(normalizeCouponCode('  save20  ')).toBe('SAVE20');
  });

  it('returns an empty string for a missing code', () => {
    expect(normalizeCouponCode(null)).toBe('');
    expect(normalizeCouponCode(undefined)).toBe('');
  });
});

describe('slugify', () => {
  it('produces a url-safe slug', () => {
    expect(slugify('-20% sur Tout le Site !')).toBe('20-sur-tout-le-site');
  });

  it('transliterates accents', () => {
    expect(slugify('Électronique & Maison')).toBe('electronique-maison');
  });

  it('handles Arabic text without producing an empty slug', () => {
    const slug = slugify('خصم على الرحلات');
    expect(slug.length).toBeGreaterThan(0);
    expect(slug).not.toContain(' ');
  });
});

describe('extractDomain', () => {
  it('returns the registrable host without the www label', () => {
    expect(extractDomain('https://www.example-shop.com/promo?a=1')).toBe('example-shop.com');
  });

  it('handles a host without www', () => {
    expect(extractDomain('https://example.co.uk/x')).toBe('example.co.uk');
  });
});

describe('toDateKey', () => {
  it('reduces a timestamp to a day, so an intraday change cannot fork identity', () => {
    const a = new Date('2026-05-01T00:00:01Z');
    const b = new Date('2026-05-01T23:59:59Z');
    expect(toDateKey(a)).toBe(toDateKey(b));
  });

  it('distinguishes adjacent days', () => {
    expect(toDateKey(new Date('2026-05-01T12:00:00Z'))).not.toBe(
      toDateKey(new Date('2026-05-02T12:00:00Z')),
    );
  });

  it('returns an empty marker for a missing date', () => {
    expect(toDateKey(null)).toBe('');
  });
});

describe('normalizeCountryCodes', () => {
  it('upper-cases, de-duplicates and sorts', () => {
    expect(normalizeCountryCodes(['fr', 'FR', 'be', 'dz'])).toEqual(['BE', 'DZ', 'FR']);
  });

  it('drops malformed entries rather than storing them', () => {
    expect(normalizeCountryCodes(['FR', 'FRANCE', '', '  '])).toEqual(['FR']);
  });
});
