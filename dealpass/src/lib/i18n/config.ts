import { LOCALES, type Locale } from '../types';

export const DEFAULT_LOCALE: Locale = 'fr';
export const RTL_LOCALES: readonly Locale[] = ['ar'];

/** Re-exported so consumers import locale constants from a single module. */
export { LOCALES };

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  ar: 'العربية',
};

export const HTML_LANG: Record<Locale, string> = { fr: 'fr', en: 'en', ar: 'ar' };

/** BCP-47 tags used for hreflang and Open Graph. */
export const LOCALE_BCP47: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  ar: 'ar-SA',
};

export interface CountryOption {
  code: string;
  nameFr: string;
  nameEn: string;
  nameAr: string;
  currency: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: 'DZ', nameFr: 'Algérie',            nameEn: 'Algeria',     nameAr: 'الجزائر',      currency: 'DZD' },
  { code: 'MA', nameFr: 'Maroc',              nameEn: 'Morocco',     nameAr: 'المغرب',       currency: 'MAD' },
  { code: 'TN', nameFr: 'Tunisie',            nameEn: 'Tunisia',     nameAr: 'تونس',         currency: 'TND' },
  { code: 'FR', nameFr: 'France',             nameEn: 'France',      nameAr: 'فرنسا',        currency: 'EUR' },
  { code: 'ES', nameFr: 'Espagne',            nameEn: 'Spain',       nameAr: 'إسبانيا',      currency: 'EUR' },
  { code: 'IT', nameFr: 'Italie',             nameEn: 'Italy',       nameAr: 'إيطاليا',      currency: 'EUR' },
  { code: 'DE', nameFr: 'Allemagne',          nameEn: 'Germany',     nameAr: 'ألمانيا',      currency: 'EUR' },
  { code: 'BE', nameFr: 'Belgique',           nameEn: 'Belgium',     nameAr: 'بلجيكا',       currency: 'EUR' },
  { code: 'CH', nameFr: 'Suisse',             nameEn: 'Switzerland', nameAr: 'سويسرا',       currency: 'CHF' },
  { code: 'GB', nameFr: 'Royaume-Uni',        nameEn: 'United Kingdom', nameAr: 'المملكة المتحدة', currency: 'GBP' },
  { code: 'CA', nameFr: 'Canada',             nameEn: 'Canada',      nameAr: 'كندا',         currency: 'CAD' },
  { code: 'US', nameFr: 'États-Unis',         nameEn: 'United States', nameAr: 'الولايات المتحدة', currency: 'USD' },
  { code: 'AE', nameFr: 'Émirats arabes unis',nameEn: 'United Arab Emirates', nameAr: 'الإمارات', currency: 'AED' },
  { code: 'SA', nameFr: 'Arabie saoudite',    nameEn: 'Saudi Arabia',nameAr: 'السعودية',     currency: 'SAR' },
  { code: 'QA', nameFr: 'Qatar',              nameEn: 'Qatar',       nameAr: 'قطر',          currency: 'QAR' },
  { code: 'KW', nameFr: 'Koweït',             nameEn: 'Kuwait',      nameAr: 'الكويت',       currency: 'KWD' },
  { code: 'EG', nameFr: 'Égypte',             nameEn: 'Egypt',       nameAr: 'مصر',          currency: 'EGP' },
  { code: 'TR', nameFr: 'Turquie',            nameEn: 'Türkiye',     nameAr: 'تركيا',        currency: 'TRY' },
];

export const CURRENCIES = [
  { code: 'DZD', symbol: 'DA' },
  { code: 'MAD', symbol: 'DH' },
  { code: 'TND', symbol: 'DT' },
  { code: 'EUR', symbol: '€' },
  { code: 'USD', symbol: '$' },
  { code: 'GBP', symbol: '£' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'CHF', symbol: 'CHF' },
  { code: 'AED', symbol: 'AED' },
  { code: 'SAR', symbol: 'SAR' },
  { code: 'QAR', symbol: 'QAR' },
  { code: 'KWD', symbol: 'KWD' },
  { code: 'EGP', symbol: 'E£' },
  { code: 'TRY', symbol: '₺' },
] as const;

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

export function countryName(code: string, locale: Locale): string {
  const country = COUNTRIES.find((c) => c.code === code);
  if (!country) return code;
  return locale === 'fr' ? country.nameFr : locale === 'en' ? country.nameEn : country.nameAr;
}

/** Negotiate the best supported locale from an Accept-Language header. */
export function negotiateLocale(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', q = '1'] = part.trim().split(';q=');
      return { tag: tag.trim().toLowerCase(), quality: Number(q) || 0 };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Build a localized path. The default locale is still prefixed so that every
 * URL is unambiguous for hreflang and caching — the alternative (hiding the
 * default prefix) breaks CDN keying and creates duplicate-content risk.
 */
export function localePath(locale: Locale, path = '/'): string {
  const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${clean}`;
}
