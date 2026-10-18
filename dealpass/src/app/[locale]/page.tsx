import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, BadgeCheck, Clock, Compass, Sparkles, Store, Tag } from 'lucide-react';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { OfferCard } from '@/components/site/offer-card';
import { NewsletterForm } from '@/components/site/newsletter-form';
import { SearchBar } from '@/components/site/search-bar';
import { getVisitorPrefs } from '@/lib/prefs';
import {
  bestOffers,
  endingSoonOffers,
  getHomeStats,
  listCategories,
  listMerchants,
  popularOffers,
  recentlyVerifiedOffers,
  travelOffers,
} from '@/lib/services/offers';
import { getCurrentUser } from '@/lib/auth/session';
import { getFavoriteOfferIds } from '@/lib/services/offers';
import { cn } from '@/lib/cn';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);
  const prefs = await getVisitorPrefs(locale);
  const user = await getCurrentUser();
  const favoriteIds = user ? await getFavoriteOfferIds(user.id) : new Set<string>();

  const [popular, verified, merchants, categories, travel, ending, stats] = await Promise.all([
    popularOffers(locale, prefs.country, 8),
    recentlyVerifiedOffers(locale, prefs.country, 4),
    listMerchants(undefined, 12),
    listCategories(),
    travelOffers(locale, prefs.country, 6),
    endingSoonOffers(locale, prefs.country, 4),
    getHomeStats(),
  ]);

  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-brand-50 to-surface dark:from-brand-950 dark:to-surface">
        <div className="container-page py-14 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold leading-tight text-ink sm:text-5xl">
              {t.home.heroTitle}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-ink-muted sm:text-lg">
              {t.home.heroSubtitle}
            </p>

            <div className="mx-auto mt-8 max-w-2xl">
              <SearchBar locale={locale} />
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-4">
              {[
                { value: stats.offers, label: t.home.statsOffers, icon: Tag },
                { value: stats.merchants, label: t.home.statsMerchants, icon: Store },
                { value: stats.countries, label: t.home.statsCountries, icon: Compass },
              ].map((stat) => (
                <div key={stat.label} className="rounded-card border border-line bg-surface p-4">
                  <stat.icon className="mx-auto mb-2 h-5 w-5 text-brand-600" aria-hidden="true" />
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block text-2xl font-bold text-ink">{stat.value}</span>
                    <span className="block text-xs text-ink-muted">{stat.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="container-page space-y-14 py-12">
        {/* -------------------------------------------------------- Popular */}
        <Section
          title={t.home.popular}
          href={`/${locale}/offers`}
          cta={t.home.viewAll}
          icon={<Sparkles className="h-5 w-5 text-accent-500" aria-hidden="true" />}
        >
          <OfferGrid>
            {popular.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                locale={locale}
                initialFavorite={favoriteIds.has(offer.id)}
              />
            ))}
          </OfferGrid>
        </Section>

        {/* --------------------------------------------------- Ending soon */}
        {ending.length > 0 ? (
          <Section
            title={t.home.endingSoon}
            href={`/${locale}/offers?endingSoon=1`}
            cta={t.home.viewAll}
            icon={<Clock className="h-5 w-5 text-accent-500" aria-hidden="true" />}
          >
            <OfferGrid>
              {ending.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  locale={locale}
                  initialFavorite={favoriteIds.has(offer.id)}
                />
              ))}
            </OfferGrid>
          </Section>
        ) : null}

        {/* ---------------------------------------------------- Categories */}
        <Section title={t.home.browseCategories} href={`/${locale}/categories`} cta={t.home.viewAll}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.slice(0, 12).map((category) => (
              <li key={category.id}>
                <Link
                  href={`/${locale}/categories/${category.slug}`}
                  className="card flex flex-col items-center gap-2 p-4 text-center transition-colors hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200">
                    {category.icon ? <Tag className="h-4 w-4" aria-hidden="true" /> : <Tag className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <span className="text-sm font-medium text-ink">{category.name}</span>
                  <span className="text-xs text-ink-muted">{category.offer_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        {/* ------------------------------------------------------- Travel */}
        {travel.length > 0 ? (
          <Section
            title={t.home.travelOffers}
            href={`/${locale}/travel`}
            cta={t.home.viewAll}
            icon={<Compass className="h-5 w-5 text-accent-500" aria-hidden="true" />}
          >
            <OfferGrid>
              {travel.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  locale={locale}
                  initialFavorite={favoriteIds.has(offer.id)}
                />
              ))}
            </OfferGrid>
          </Section>
        ) : null}

        {/* ------------------------------------------------------ Verified */}
        {verified.length > 0 ? (
          <Section
            title={t.home.recentlyVerified}
            icon={<BadgeCheck className="h-5 w-5 text-emerald-500" aria-hidden="true" />}
          >
            <OfferGrid>
              {verified.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  locale={locale}
                  initialFavorite={favoriteIds.has(offer.id)}
                />
              ))}
            </OfferGrid>
          </Section>
        ) : null}

        {/* ----------------------------------------------------- Merchants */}
        <Section title={t.home.popularMerchants} href={`/${locale}/stores`} cta={t.home.viewAll}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {merchants.slice(0, 12).map((merchant) => (
              <li key={merchant.id}>
                <Link
                  href={`/${locale}/stores/${merchant.slug}`}
                  className="card flex flex-col items-center gap-2 p-4 text-center transition-colors hover:border-brand-400"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-alt text-sm font-bold text-ink"
                  >
                    {merchant.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate text-sm font-medium text-ink">{merchant.name}</span>
                  <span className="text-xs text-ink-muted">{merchant.offer_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        {/* ---------------------------------------------------- Newsletter */}
        <section className="card overflow-hidden">
          <div className="grid gap-6 p-8 sm:grid-cols-2 sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-ink">{t.home.newsletterTitle}</h2>
              <p className="mt-2 text-sm text-ink-muted">{t.home.newsletterSubtitle}</p>
            </div>
            <NewsletterForm locale={locale} />
          </div>
        </section>

        {/* --------------------------------------------------- How it works */}
        <Section title={t.home.howTitle}>
          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              { title: t.home.how1Title, body: t.home.how1Body, step: '1' },
              { title: t.home.how2Title, body: t.home.how2Body, step: '2' },
              { title: t.home.how3Title, body: t.home.how3Body, step: '3' },
            ].map((item) => (
              <li key={item.step} className="card p-6">
                <span
                  aria-hidden="true"
                  className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white"
                >
                  {item.step}
                </span>
                <h3 className="text-base font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{item.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* ----------------------------------------------------- Disclosure */}
        <p className="rounded-card border border-line bg-surface-alt p-4 text-xs text-ink-muted">
          <strong className="font-semibold text-ink">{t.disclosure.label} : </strong>
          {t.disclosure.text} {t.disclosure.prices}
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  href,
  cta,
  icon,
  children,
}: {
  title: string;
  href?: string;
  cta?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2
          id={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}
          className="flex items-center gap-2 text-xl font-bold text-ink"
        >
          {icon}
          {title}
        </h2>
        {href && cta ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            {cta}
            <ArrowRight className="h-4 w-4 rtl-flip" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function OfferGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}>
      {children}
    </div>
  );
}
