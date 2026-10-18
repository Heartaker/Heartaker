import { query, queryOne } from '../db/index';
import { DEFAULT_PUBLICATION_RULES, type PublicationRules } from '../validation';
import { LOCALES, type Locale } from '../types';

/**
 * Runtime settings read from `site_settings`.
 *
 * Values are cached for the lifetime of a request only — the administration
 * dashboard writes take effect on the next request without a rebuild, which is
 * what makes brand identity editable at runtime.
 *
 * SECURITY: this table can never hold secrets. Migration 0005 installs a
 * trigger that rejects any key containing key/secret/token/password.
 */

export interface BrandSettings {
  siteName: string;
  slogan: string;
  domain: string;
  logoUrl: string;
  faviconUrl: string;
  fontSans: string;
  fontDisplay: string;
  radius: string;
  defaultTheme: 'light' | 'dark';
  colors: {
    brand: string;
    accent: string;
    ink: string;
    surface: string;
    line: string;
  };
}

export interface LocalizationSettings {
  defaultLanguage: Locale;
  defaultCountry: string;
  defaultCurrency: string;
  supportedLanguages: Locale[];
  supportedCountries: string[];
  supportedCurrencies: string[];
  autoDetect: boolean;
}

export interface FeatureSettings {
  demoConnectorEnabled: boolean;
  darkMode: boolean;
  newsletterEnabled: boolean;
  favoritesEnabled: boolean;
  reportsEnabled: boolean;
  searchAnalytics: boolean;
  maintenanceMode: boolean;
}

export interface SeoSettings {
  indexPagination: boolean;
  indexInternalSearch: boolean;
  expiredOfferStrategy: 'keep_with_notice' | 'redirect' | 'remove';
  sitemapEnabled: boolean;
  organizationName: string;
}

const DEFAULT_BRAND: BrandSettings = {
  siteName: 'DealPass',
  slogan: 'Shopping, travel, and digital-service deals—all in one place.',
  domain: 'localhost:3000',
  logoUrl: '',
  faviconUrl: '',
  fontSans: 'Inter',
  fontDisplay: 'Inter',
  radius: '0.875rem',
  defaultTheme: 'light',
  colors: {
    brand: '15 118 110',
    accent: '245 158 11',
    ink: '17 24 39',
    surface: '255 255 255',
    line: '226 232 240',
  },
};

const DEFAULT_LOCALIZATION: LocalizationSettings = {
  defaultLanguage: 'fr',
  defaultCountry: 'DZ',
  defaultCurrency: 'DZD',
  supportedLanguages: [...LOCALES],
  supportedCountries: ['DZ','MA','TN','FR','ES','IT','DE','BE','CH','GB','CA','AE','SA','EG','QA','KW','TR','US'],
  supportedCurrencies: ['DZD','MAD','TND','EUR','USD','GBP','CAD','AED','SAR','EGP','QAR','KWD','TRY','CHF'],
  autoDetect: true,
};

const DEFAULT_FEATURES: FeatureSettings = {
  demoConnectorEnabled: true,
  darkMode: true,
  newsletterEnabled: true,
  favoritesEnabled: true,
  reportsEnabled: true,
  searchAnalytics: true,
  maintenanceMode: false,
};

const DEFAULT_SEO: SeoSettings = {
  indexPagination: true,
  indexInternalSearch: false,
  expiredOfferStrategy: 'keep_with_notice',
  sitemapEnabled: true,
  organizationName: 'DealPass',
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await queryOne<{ setting_value: T }>(
    `SELECT setting_value FROM site_settings
      WHERE setting_key = $1 AND environment IN ('all', $2)
      ORDER BY CASE environment WHEN $2 THEN 0 ELSE 1 END
      LIMIT 1`,
    [key, process.env.NODE_ENV ?? 'development'],
  );
  if (!row) return fallback;
  return { ...fallback, ...(row.setting_value as object) } as T;
}

export const getBrandSettings = () => getSetting<BrandSettings>('brand', DEFAULT_BRAND);
export const getLocalizationSettings = () => getSetting<LocalizationSettings>('localization', DEFAULT_LOCALIZATION);
export const getFeatureSettings = () => getSetting<FeatureSettings>('features', DEFAULT_FEATURES);
export const getSeoSettings = () => getSetting<SeoSettings>('seo', DEFAULT_SEO);
export const getPublicationRules = () => getSetting<PublicationRules>('publication', DEFAULT_PUBLICATION_RULES);
export const getDisclosures = () =>
  getSetting<Record<Locale, string>>('affiliate_disclosure', {
    fr: 'DealPass peut percevoir une commission lorsque vous passez par un lien partenaire. Cela ne change pas le prix que vous payez.',
    en: 'DealPass may earn a commission when you use one of our partner links. This never changes the price you pay.',
    ar: 'قد تحصل ديل باس على عمولة عند استخدام أحد روابط الشركاء. لن يؤثر ذلك على السعر الذي تدفعه.',
  });

/** Persist a settings group. Rejects credential-like keys at the database level. */
export async function setSetting(
  key: string,
  value: unknown,
  updatedBy: string | null = null,
): Promise<void> {
  await query(
    `INSERT INTO site_settings (setting_key, environment, setting_value, updated_by, updated_at)
     VALUES ($1, 'all', $2::jsonb, $3, now())
     ON CONFLICT (setting_key, environment)
     DO UPDATE SET setting_value = EXCLUDED.setting_value,
                   updated_by   = EXCLUDED.updated_by,
                   updated_at   = now()`,
    [key, JSON.stringify(value), updatedBy],
  );
}

export async function allSettings(): Promise<Array<{ setting_key: string; setting_value: unknown; updated_at: string }>> {
  return query<{ setting_key: string; setting_value: unknown; updated_at: string }>(
    `SELECT setting_key, setting_value, updated_at FROM site_settings ORDER BY setting_key`,
  );
}
