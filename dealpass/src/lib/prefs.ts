import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, COUNTRIES, currencySymbol } from './i18n/config';
import { getLocalizationSettings } from './services/settings';
import { getCurrentUser } from './auth/session';
import type { Locale } from './types';

/**
 * Resolve the visitor's effective language, country and currency.
 *
 * Precedence:
 *   1. explicit cookie choice (the visitor picked it)
 *   2. signed-in profile preference
 *   3. site default from the administration settings
 *
 * Never a forced redirect: a suggestion is only ever applied to rendering, and
 * the visitor can change every value from the header at any time.
 */

export interface VisitorPrefs {
  locale: Locale;
  country: string;
  currency: string;
  theme: 'light' | 'dark';
  source: 'cookie' | 'profile' | 'default';
}

export async function getVisitorPrefs(routeLocale?: Locale): Promise<VisitorPrefs> {
  const store = await cookies();
  const settings = await getLocalizationSettings();
  const user = await getCurrentUser();

  const cookieLang = store.get('dealpass_lang')?.value;
  const cookieCountry = store.get('dealpass_country')?.value;
  const cookieCurrency = store.get('dealpass_currency')?.value;
  const cookieTheme = store.get('dealpass_theme')?.value;

  const validCountry = (value?: string) =>
    value && COUNTRIES.some((c) => c.code === value) ? value : undefined;

  // An explicit route segment always wins for language — the URL is the most
  // reliable signal for both the visitor and search engines.
  const locale: Locale =
    routeLocale ??
    ((['fr', 'en', 'ar'] as const).includes(cookieLang as Locale)
      ? (cookieLang as Locale)
      : user?.preferredLanguage ?? settings.defaultLanguage ?? DEFAULT_LOCALE);

  const country =
    validCountry(cookieCountry) ??
    (user ? validCountry(user.preferredCountry) : undefined) ??
    validCountry(settings.defaultCountry) ??
    'DZ';

  const currency =
    cookieCurrency ?? (user ? user.preferredCurrency : undefined) ?? settings.defaultCurrency ?? 'DZD';

  return {
    locale,
    country,
    currency,
    theme: cookieTheme === 'dark' ? 'dark' : 'light',
    source: cookieLang || cookieCountry ? 'cookie' : user ? 'profile' : 'default',
  };
}

export { currencySymbol };
