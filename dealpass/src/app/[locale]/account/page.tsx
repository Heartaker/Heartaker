import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { PreferencesForm } from '@/components/site/preferences-form';
import { isLocale, COUNTRIES, CURRENCIES } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getCurrentUser } from '@/lib/auth/session';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/sign-in?next=/${locale}/account`);

  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-2xl font-bold text-ink">{t.account.myAccount}</h1>
      <p className="mt-1 text-sm text-ink-muted">{user.email}</p>

      <nav className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link href={`/${locale}/favorites`} className="card p-4 text-sm font-medium text-ink hover:border-brand-400">
          {t.account.myFavorites}
        </Link>
        <Link href={`/${locale}/data-request`} className="card p-4 text-sm font-medium text-ink hover:border-brand-400">
          {t.footer.dataRequest}
        </Link>
        <Link href={`/${locale}/newsletter/unsubscribe`} className="card p-4 text-sm font-medium text-ink hover:border-brand-400">
          {t.footer.unsubscribe}
        </Link>
      </nav>

      <section className="mt-8">
        <h2 className="mb-4 text-base font-semibold text-ink">{t.account.preferences}</h2>
        <div className="card p-5">
          <PreferencesForm
            locale={locale}
            defaults={{
              language: user.preferredLanguage,
              country: user.preferredCountry,
              currency: user.preferredCurrency,
            }}
          />
        </div>
      </section>
    </div>
  );
}
