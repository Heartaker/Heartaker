'use client';

import { useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { COUNTRIES, CURRENCIES, LOCALE_LABELS, type Locale } from '@/lib/i18n/config';
import type { Locale as LocaleType } from '@/lib/types';

function patchCookie(key: string, value: string) {
  return fetch('/api/preferences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  });
}

/** Language selector. Switching language rewrites the /[locale] path segment. */
export function LanguageSelector({ locale }: { locale: LocaleType }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label className="relative">
      <span className="sr-only">Language</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as LocaleType;
          const segments = pathname.split('/');
          if (segments[1] && (segments[1] === 'fr' || segments[1] === 'en' || segments[1] === 'ar')) {
            segments[1] = next;
          } else {
            segments.splice(1, 0, next);
          }
          const target = segments.join('/') || `/${next}`;
          void patchCookie('language', next).then(() => startTransition(() => router.push(target)));
        }}
        className="appearance-none rounded-lg border border-line bg-surface py-1.5 pe-7 ps-2.5 text-xs font-medium text-ink hover:bg-surface-alt"
      >
        {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CountrySelector({ country, locale }: { country: string; locale: LocaleType }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="relative">
      <span className="sr-only">Country</span>
      <select
        value={country}
        disabled={pending}
        onChange={(event) => {
          void patchCookie('country', event.target.value).then(() => startTransition(() => router.refresh()));
        }}
        className="appearance-none rounded-lg border border-line bg-surface py-1.5 pe-7 ps-2.5 text-xs font-medium text-ink hover:bg-surface-alt"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {locale === 'fr' ? c.nameFr : locale === 'en' ? c.nameEn : c.nameAr}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CurrencySelector({ currency }: { currency: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="relative">
      <span className="sr-only">Currency</span>
      <select
        value={currency}
        disabled={pending}
        onChange={(event) => {
          void patchCookie('currency', event.target.value).then(() => startTransition(() => router.refresh()));
        }}
        className="appearance-none rounded-lg border border-line bg-surface py-1.5 pe-7 ps-2.5 text-xs font-medium text-ink hover:bg-surface-alt"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} {c.symbol}
          </option>
        ))}
      </select>
    </label>
  );
}
