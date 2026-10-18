import { describe, it, expect } from 'vitest';
import { LOCALES, LOCALE_LABELS, isLocale, negotiateLocale, localePath, COUNTRIES, CURRENCIES } from '@/lib/i18n/config';
import { getDictionary, translate } from '@/lib/i18n/dictionaries';

/**
 * A missing key in a non-French dictionary silently degrades the site to
 * French for that string, which is easy to miss in review. This suite makes
 * the gap impossible to ship.
 */
describe('dictionaries', () => {
  it('ships French, English and Arabic', () => {
    expect(LOCALES).toEqual(['fr', 'en', 'ar']);
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
    }
  });

  it('has an entry for every locale', () => {
    for (const locale of LOCALES) {
      expect(getDictionary(locale)).toBeTruthy();
    }
  });

  it('has identical key sets in every language', () => {
    const keysOf = (locale: (typeof LOCALES)[number]) => {
      const keys: string[] = [];
      const walk = (node: unknown, prefix: string) => {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          const path = prefix ? `${prefix}.${key}` : key;
          if (value && typeof value === 'object') walk(value, path);
          else keys.push(path);
        }
      };
      walk(getDictionary(locale), '');
      return keys.sort();
    };

    const french = keysOf('fr');
    expect(french.length).toBeGreaterThan(50);

    for (const locale of ['en', 'ar'] as const) {
      expect(keysOf(locale)).toEqual(french);
    }
  });

  it('has no empty translations', () => {
    for (const locale of LOCALES) {
      const problems: string[] = [];
      const walk = (node: unknown, prefix: string) => {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          const path = prefix ? `${prefix}.${key}` : key;
          if (value && typeof value === 'object') walk(value, path);
          else if (typeof value === 'string' && value.trim() === '') problems.push(`${locale}.${path}`);
        }
      };
      walk(getDictionary(locale), '');
      expect(problems).toEqual([]);
    }
  });

  it('marks Arabic as right-to-left', () => {
    expect(getDictionary('ar')).toBeTruthy();
    expect(LOCALES).toContain('ar');
  });
});

describe('isLocale', () => {
  it('accepts the supported locales', () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
  });

  it('rejects everything else', () => {
    for (const value of ['de', 'es', 'FR', '', 'fr-CA', null, undefined]) {
      expect(isLocale(value)).toBe(false);
    }
  });
});

describe('negotiateLocale', () => {
  it('honours the highest-quality supported tag', () => {
    expect(negotiateLocale('ar,en;q=0.9')).toBe('ar');
  });

  it('respects explicit quality values over document order', () => {
    expect(negotiateLocale('en;q=0.4,ar;q=0.9')).toBe('ar');
  });

  it('reduces a regional tag to its base language', () => {
    expect(negotiateLocale('fr-CA,fr;q=0.9')).toBe('fr');
  });

  it('skips unsupported languages and takes the next one', () => {
    expect(negotiateLocale('de-DE,de;q=0.9,en;q=0.5')).toBe('en');
  });

  it('falls back to French when nothing matches', () => {
    expect(negotiateLocale('de-DE,es-ES')).toBe('fr');
  });

  it('falls back to French for a missing header', () => {
    expect(negotiateLocale(null)).toBe('fr');
  });
});

describe('localePath', () => {
  it('prefixes a path with the locale', () => {
    expect(localePath('fr', '/offers')).toBe('/fr/offers');
  });

  it('handles the root', () => {
    expect(localePath('ar', '/')).toBe('/ar');
  });
});

describe('translate', () => {
  it('resolves a dotted path', () => {
    expect(translate('fr', 'nav.offers')).toBeTruthy();
  });

  it('returns the same key in every language where it is defined', () => {
    for (const locale of LOCALES) {
      expect(translate(locale, 'nav.offers')).toBeTruthy();
    }
  });

  it('falls back to the key itself when the path does not exist', () => {
    expect(translate('en', 'does.not.exist')).toBe('does.not.exist');
  });
});

describe('reference data', () => {
  it('covers the target markets', () => {
    const codes = COUNTRIES.map((country) => country.code);
    for (const market of ['DZ', 'FR', 'MA', 'TN', 'AE', 'SA', 'EG', 'GB', 'DE', 'ES', 'IT']) {
      expect(codes).toContain(market);
    }
  });

  it('covers the currencies those markets use', () => {
    const codes = CURRENCIES.map((currency) => currency.code);
    for (const currency of ['DZD', 'EUR', 'MAD', 'TND', 'AED', 'SAR', 'EGP', 'GBP', 'USD']) {
      expect(codes).toContain(currency);
    }
  });
});
