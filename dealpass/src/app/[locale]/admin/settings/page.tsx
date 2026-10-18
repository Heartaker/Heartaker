import { notFound } from 'next/navigation';
import { SettingsForms } from '@/components/admin/settings-forms';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { requirePermission, can } from '@/lib/auth/rbac';
import { getCurrentUser } from '@/lib/auth/session';
import {
  getBrandSettings,
  getPublicationRules,
  getLocalizationSettings,
  getFeatureSettings,
  getDisclosures,
} from '@/lib/services/settings';
import { CURRENCIES } from '@/lib/i18n/config';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  await requirePermission('settings.read');
  const user = await getCurrentUser();

  const [brand, publication, localization, features, disclosures] = await Promise.all([
    getBrandSettings(),
    getPublicationRules(),
    getLocalizationSettings(),
    getFeatureSettings(),
    getDisclosures(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{t.admin.settings}</h2>
        {!can(user, 'settings.configure') ? (
          <p className="mt-1 text-xs text-amber-600">
            You can view these settings but your role cannot change them.
          </p>
        ) : null}
      </div>

      <SettingsForms
        locale={locale}
        canConfigure={can(user, 'settings.configure')}
        initial={{
          brand,
          publication,
          localization,
          features: { ...features },
          disclosures,
        }}
        labels={{
          brand: t.admin.brand,
          siteName: t.admin.siteName,
          slogan: t.admin.slogan,
          domain: t.admin.domain,
          logoUrl: t.admin.logoUrl,
          colors: t.admin.colors,
          fonts: t.admin.fonts,
          radius: t.admin.radius,
          thresholds: t.admin.thresholds,
          autoPublish: t.admin.autoPublish,
          reviewThreshold: t.admin.reviewThreshold,
          rejectBelow: t.admin.rejectBelow,
          requireTerms: t.admin.requireTerms,
          requireCountry: t.admin.requireCountry,
          localization: t.admin.localization,
          features: t.admin.features,
          disclosure: t.admin.disclosure,
          save: t.admin.save,
          saved: t.admin.saved,
        }}
      />

      <p className="text-xs text-ink-muted">
        Supported currencies: {CURRENCIES.map((c) => c.code).join(', ')}
      </p>
    </div>
  );
}
