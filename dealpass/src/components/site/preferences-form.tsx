'use client';

import { useActionState } from 'react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { updatePreferencesAction, exportMyDataAction, deleteMyAccountAction, type AuthResult } from '@/lib/auth/actions';
import { COUNTRIES, CURRENCIES, LOCALE_LABELS } from '@/lib/i18n/config';
import type { Locale } from '@/lib/types';

export function PreferencesForm({
  locale,
  defaults,
}: {
  locale: Locale;
  defaults: { language: string; country: string; currency: string };
}) {
  const t = getDictionary(locale);
  const [state, formAction] = useActionState<AuthResult | null, FormData>(updatePreferencesAction, null);

  return (
    <div className="space-y-6">
      <form action={formAction} className="grid gap-4 sm:grid-cols-3">
        <label>
          <span className="label">{t.nav.language}</span>
          <select name="language" defaultValue={defaults.language} className="input">
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
              <option key={code} value={code}>{LOCALE_LABELS[code]}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">{t.nav.country}</span>
          <select name="country" defaultValue={defaults.country} className="input">
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {locale === 'fr' ? country.nameFr : locale === 'en' ? country.nameEn : country.nameAr}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">{t.nav.currency}</span>
          <select name="currency" defaultValue={defaults.currency} className="input">
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>{currency.code}</option>
            ))}
          </select>
        </label>

        <div className="sm:col-span-3">
          <button type="submit" className="btn-primary btn-md">{t.common.save}</button>
          {state?.ok ? (
            <span role="status" className="ms-3 text-sm text-emerald-600">{t.account.saved}</span>
          ) : null}
          {state?.error ? (
            <span role="alert" className="ms-3 text-sm text-red-600">{state.error}</span>
          ) : null}
        </div>
      </form>

      <div className="border-t border-line pt-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">{t.footer.dataRequest}</h3>
        <div className="flex flex-wrap gap-2">
          <form action={exportMyDataAction}>
            <button type="submit" className="btn-outline btn-sm">{t.account.exportData}</button>
          </form>
          <form
            action={deleteMyAccountAction}
            onSubmit={(event) => {
              if (!window.confirm('Delete your account permanently? This cannot be undone.')) {
                event.preventDefault();
              }
            }}
          >
            <button type="submit" className="btn-sm bg-red-600 text-white hover:bg-red-700">
              {t.account.deleteAccount}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
