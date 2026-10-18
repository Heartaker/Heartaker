import type { Metadata } from 'next';
import Link from 'next/link';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { isLocale } from '@/lib/i18n/config';
import { listMerchants } from '@/lib/services/offers';
import { VERTICALS, type Locale, type Vertical } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const t = getDictionary(raw as Locale);
  return { title: t.nav.stores, alternates: { canonical: `/${raw}/stores` } };
}

const VERTICAL_LABELS: Record<Vertical, Record<Locale, string>> = {
  shopping: { fr: 'Shopping', en: 'Shopping', ar: 'تسوق' },
  travel: { fr: 'Voyage', en: 'Travel', ar: 'سفر' },
  courses: { fr: 'Formations', en: 'Courses', ar: 'دورات' },
  software: { fr: 'Logiciels', en: 'Software', ar: 'برمجيات' },
};

export default async function StoresPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return null;
  const locale = raw as Locale;
  const t = getDictionary(locale);
  const merchants = await listMerchants(undefined, 300);

  const grouped = VERTICALS.map((vertical) => ({
    vertical,
    label: VERTICAL_LABELS[vertical][locale],
    items: merchants.filter((m) => m.vertical === vertical),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="container-page py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t.nav.stores}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {merchants.length} {t.home.statsMerchants}
        </p>
      </header>

      {grouped.map((group) => (
        <section key={group.vertical} className="mb-10" aria-labelledby={`stores-${group.vertical}`}>
          <h2 id={`stores-${group.vertical}`} className="mb-4 text-lg font-semibold text-ink">
            {group.label}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {group.items.map((merchant) => (
              <li key={merchant.id}>
                <Link
                  href={`/${locale}/stores/${merchant.slug}`}
                  className="card flex h-full flex-col items-center gap-2 p-4 text-center transition-colors hover:border-brand-400"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-base font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-200"
                  >
                    {merchant.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate text-sm font-medium text-ink">{merchant.name}</span>
                  <span className="text-xs text-ink-muted">
                    {merchant.offer_count} {t.common.results}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
