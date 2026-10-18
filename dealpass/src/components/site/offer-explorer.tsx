import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { OfferCard } from './offer-card';
import { OfferFilters, SortSelect } from './offer-filters';
import { EmptyState } from '@/components/ui/card';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { isLocale } from '@/lib/i18n/config';
import { listCategories, listMerchants, listOffers, normalizeSort } from '@/lib/services/offers';
import { getCurrentUser } from '@/lib/auth/session';
import { getFavoriteOfferIds } from '@/lib/services/offers';
import { getVisitorPrefs } from '@/lib/prefs';
import type { Locale, OfferQuery, OfferType, Vertical } from '@/lib/types';

/**
 * Shared listing surface for /offers, /search, /travel, /best, /latest and the
 * category and merchant pages. One component keeps filtering, sorting and
 * pagination consistent everywhere.
 */

export interface ExplorerProps {
  locale: string;
  searchParams: Record<string, string | string[] | undefined>;
  vertical?: Vertical;
  fixedMerchant?: string;
  fixedCategory?: string;
  /** Locks the listing to one offer type (hotels, flights, courses…). */
  fixedOfferType?: OfferType;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyBody?: string;
  basePath?: string;
}

const param = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export async function OfferExplorer({
  locale: rawLocale,
  searchParams,
  vertical,
  fixedMerchant,
  fixedCategory,
  fixedOfferType,
  title,
  description,
  emptyTitle,
  emptyBody,
  basePath,
}: ExplorerProps) {
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale as Locale;
  const t = getDictionary(locale);
  const prefs = await getVisitorPrefs(locale);
  const user = await getCurrentUser();
  const favoriteIds = user ? await getFavoriteOfferIds(user.id) : new Set<string>();

  const query: OfferQuery = {
    query: param(searchParams.q),
    country: param(searchParams.country) ?? prefs.country,
    language: locale,
    category: fixedCategory ?? param(searchParams.category),
    merchant: fixedMerchant ?? param(searchParams.merchant),
    vertical,
    offerTypes: fixedOfferType
      ? [fixedOfferType]
      : param(searchParams.offerType)
        ? [param(searchParams.offerType) as OfferType]
        : undefined,
    verifiedOnly: param(searchParams.verified) === '1',
    exclusive: param(searchParams.exclusive) === '1',
    endingSoon: param(searchParams.endingSoon) === '1',
    freeShipping: param(searchParams.freeShipping) === '1',
    newCustomer: param(searchParams.newCustomer) === '1',
    minDiscount: param(searchParams.minDiscount) ? Number(param(searchParams.minDiscount)) : undefined,
    sort: normalizeSort(param(searchParams.sort)),
    page: param(searchParams.page) ? Number(param(searchParams.page)) : 1,
  };

  const [result, categories, merchants] = await Promise.all([
    listOffers(query),
    listCategories(vertical),
    listMerchants(vertical, 300),
  ]);

  const path = basePath ?? `/${locale}/offers`;
  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === 'string' && key !== 'page') params.set(key, value);
    }
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };

  return (
    <div className="container-page py-8">
      {title ? (
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm text-ink-muted">{description}</p> : null}
          {param(searchParams.q) ? (
            <p className="mt-2 text-sm text-ink-muted">
              {t.search.resultsFor} «&nbsp;{param(searchParams.q)}&nbsp;»
            </p>
          ) : null}
        </header>
      ) : null}

      {!fixedMerchant && !fixedCategory ? (
        <Suspense fallback={null}>
          <OfferFilters
            locale={locale}
            country={prefs.country}
            categories={categories.map((c) => ({ value: c.slug, label: c.name }))}
            merchants={merchants.map((m) => ({ value: m.slug, label: m.name }))}
          />
        </Suspense>
      ) : null}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-muted" role="status">
          {t.common.showing} {result.total} {t.common.results}
        </p>
        <SortSelect locale={locale} />
      </div>

      {result.offers.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? t.search.noResults}
          body={emptyBody ?? t.search.noResultsHint}
          action={
            <Link href={`/${locale}/offers`} className="btn-primary btn-md mt-2">
              {t.nav.allOffers}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              locale={locale}
              initialFavorite={favoriteIds.has(offer.id)}
            />
          ))}
        </div>
      )}

      {result.totalPages > 1 ? (
        <nav aria-label={t.common.page} className="mt-8 flex items-center justify-center gap-2">
          {result.page > 1 ? (
            <Link href={buildPageHref(result.page - 1)} className="btn-outline btn-sm">
              {t.common.previous}
            </Link>
          ) : null}

          <span className="px-3 text-sm text-ink-muted">
            {t.common.page} {result.page} / {result.totalPages}
          </span>

          {result.page < result.totalPages ? (
            <Link href={buildPageHref(result.page + 1)} className="btn-outline btn-sm">
              {t.common.next}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
