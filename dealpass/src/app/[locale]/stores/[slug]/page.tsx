import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Globe, MapPin, Tag } from 'lucide-react';
import { OfferCard } from '@/components/site/offer-card';
import { Badge } from '@/components/ui/badge';
import { isLocale, countryName } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getMerchantBySlug, getMerchantOffers, listMerchants } from '@/lib/services/offers';
import { getCurrentUser } from '@/lib/auth/session';
import { getFavoriteOfferIds } from '@/lib/services/offers';
import { getDisclosures } from '@/lib/services/settings';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) return {};
  const merchant = await getMerchantBySlug(slug);
  if (!merchant) return {};
  return {
    title: `${merchant.name} — codes promo et offres`,
    description: merchant.short_description ?? undefined,
    alternates: { canonical: `/${raw}/stores/${slug}` },
  };
}

export default async function MerchantPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);
  const disclosures = await getDisclosures();

  const merchant = await getMerchantBySlug(slug);
  if (!merchant) notFound();

  const [offers, user, alternatives] = await Promise.all([
    getMerchantOffers(merchant.id, locale, 60),
    getCurrentUser(),
    listMerchants(merchant.vertical, 300),
  ]);
  const favoriteIds = user ? await getFavoriteOfferIds(user.id) : new Set<string>();

  const otherMerchants = alternatives
    .filter((m) => m.id !== merchant.id && m.offer_count > 0)
    .slice(0, 6);

  // Organization structured data — helps search engines understand the brand
  // and is required for a well-formed merchant page.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: merchant.name,
    url: merchant.official_website_url ?? undefined,
    description: merchant.short_description ?? undefined,
    areaServed: merchant.country_codes.map((code) => ({ '@type': 'Country', name: countryName(code, locale) })),
  };

  return (
    <div className="container-page py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <ol className="flex items-center gap-2">
          <li>
            <Link href={`/${locale}`} className="hover:text-ink hover:underline">
              {t.nav.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/${locale}/stores`} className="hover:text-ink hover:underline">
              {t.nav.stores}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">
            {merchant.name}
          </li>
        </ol>
      </nav>

      {/* ------------------------------------------------------- header */}
      <header className="card mb-8 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-xl font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-200"
            >
              {merchant.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-ink">{merchant.name}</h1>
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">{merchant.short_description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                  {offers.length} {t.common.results}
                </span>
                {merchant.country_codes.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.offer.validIn} {merchant.country_codes.slice(0, 5).join(', ')}
                    {merchant.country_codes.length > 5 ? ` +${merchant.country_codes.length - 5}` : ''}
                  </span>
                ) : null}
                {merchant.official_website_url ? (
                  <a
                    href={merchant.official_website_url}
                    target="_blank"
                    rel="nofollow noopener"
                    className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300"
                  >
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.offer.visitStore}
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          {merchant.is_verified ? <Badge tone="success">{t.offer.verified}</Badge> : null}
        </div>

        {merchant.full_description ? (
          <p className="mt-5 border-t border-line pt-5 text-sm leading-relaxed text-ink-muted">
            {merchant.full_description}
          </p>
        ) : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* ------------------------------------------------------ offers */}
        <section aria-labelledby="merchant-offers">
          <h2 id="merchant-offers" className="mb-4 text-lg font-semibold text-ink">
            {t.offer.otherOffers}
          </h2>
          {offers.length === 0 ? (
            <p className="card p-6 text-sm text-ink-muted">{t.common.empty}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {offers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  locale={locale}
                  initialFavorite={favoriteIds.has(offer.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------- aside */}
        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 text-base font-semibold text-ink">{t.offer.howToUse}</h2>
            <p className="text-sm leading-relaxed text-ink-muted">{t.offer.howToUseBody}</p>
          </section>

          {merchant.country_codes.length > 0 ? (
            <section className="card p-5">
              <h2 className="mb-3 text-base font-semibold text-ink">{t.offer.validIn}</h2>
              <ul className="flex flex-wrap gap-1.5">
                {merchant.country_codes.map((code) => (
                  <li key={code}>
                    <Badge tone="neutral">{countryName(code, locale)}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {otherMerchants.length > 0 ? (
            <section className="card p-5">
              <h2 className="mb-3 text-base font-semibold text-ink">{t.search.alternativeMerchants}</h2>
              <ul className="space-y-2">
                {otherMerchants.map((other) => (
                  <li key={other.id}>
                    <Link
                      href={`/${locale}/stores/${other.slug}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-surface-alt"
                    >
                      <span className="truncate">{other.name}</span>
                      <span className="shrink-0 text-xs text-ink-muted">{other.offer_count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="rounded-card border border-line bg-surface-alt p-4 text-xs text-ink-muted">
            <strong className="font-semibold text-ink">{t.disclosure.label} : </strong>
            {disclosures[locale]}
          </p>
        </aside>
      </div>
    </div>
  );
}
