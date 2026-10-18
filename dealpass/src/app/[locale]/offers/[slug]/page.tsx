import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Flag, Info } from 'lucide-react';
import { OfferCard } from '@/components/site/offer-card';
import { OfferCodeBox } from '@/components/site/offer-code-box';
import { Badge } from '@/components/ui/badge';
import { ReportForm } from '@/components/site/report-form';
import { isLocale, countryName } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getOfferBySlug, getSimilarOffers } from '@/lib/services/offers';
import { getCurrentUser } from '@/lib/auth/session';
import { getFavoriteOfferIds, isFavorite } from '@/lib/services/offers';
import { getDisclosures } from '@/lib/services/settings';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) return {};
  const offer = await getOfferBySlug(slug);
  if (!offer) return {};
  const expired = offer.expires_at ? new Date(offer.expires_at) <= new Date() : false;
  return {
    title: offer.title,
    description: offer.short_description ?? undefined,
    alternates: { canonical: `/${raw}/offers/${slug}` },
    // An expired offer has no lasting search value once it is dead, but while
    // it still explains the merchant and lists alternatives it stays indexable.
    robots: { index: !expired, follow: true },
  };
}

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);
  const disclosures = await getDisclosures();

  const offer = await getOfferBySlug(slug);
  if (!offer) notFound();

  const isExpired = offer.expires_at ? new Date(offer.expires_at) <= new Date() : false;
  const hasCode = Boolean(offer.coupon_code && offer.coupon_code.trim());
  const user = await getCurrentUser();
  const favoriteIds = user ? await getFavoriteOfferIds(user.id) : new Set<string>();
  const favorited = user ? await isFavorite(user.id, offer.id) : false;
  const similar = await getSimilarOffers(offer, 4);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Offer',
    name: offer.title,
    description: offer.short_description ?? undefined,
    availability: isExpired
      ? 'https://schema.org/OutOfStock'
      : 'https://schema.org/InStock',
    businessFunction: 'https://schema.org/Sell',
    category: offer.category_name ?? undefined,
    priceCurrency: offer.currency,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/${locale}/offers/${offer.slug}`,
    ...(offer.expires_at ? { priceValidUntil: offer.expires_at.slice(0, 10) } : {}),
  };

  return (
    <div className="container-page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href={`/${locale}`} className="hover:text-ink hover:underline">{t.nav.home}</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href={`/${locale}/stores/${offer.merchant_slug}`} className="hover:text-ink hover:underline">{offer.merchant_name}</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="max-w-xs truncate text-ink">{offer.title}</li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* -------------------------------------------------------- main */}
        <div>
          {isExpired ? (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-card border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-red-800 dark:text-red-200">{t.offer.expired}</p>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">{t.offer.expiredNotice}</p>
              </div>
            </div>
          ) : null}

          <header className="card mb-6 p-6">
            <div className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-lg font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-200"
              >
                {offer.merchant_name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <Link
                  href={`/${locale}/stores/${offer.merchant_slug}`}
                  className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  {offer.merchant_name}
                </Link>
                <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">{offer.title}</h1>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {offer.discount_value !== null ? (
                    <Badge tone="accent">
                      {offer.discount_type === 'percentage'
                        ? `-${offer.discount_value}%`
                        : `-${offer.discount_value} ${offer.currency}`}
                    </Badge>
                  ) : null}
                  {offer.verification_status === 'verified' && !isExpired ? (
                    <Badge tone="success">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      {t.offer.verified}
                    </Badge>
                  ) : null}
                  {offer.is_exclusive ? <Badge tone="brand">{t.offer.exclusive}</Badge> : null}
                  {offer.source_type === 'demo' ? <Badge tone="warning">{t.offer.demoBadge}</Badge> : null}
                </div>
              </div>
            </div>

            {offer.full_description ? (
              <p className="mt-5 border-t border-line pt-5 text-sm leading-relaxed text-ink-muted">
                {offer.full_description}
              </p>
            ) : null}
          </header>

          {/* code box, only when live */}
          {!isExpired && hasCode ? (
            <div className="mb-6">
              <OfferCodeBox code={offer.coupon_code!} offerId={offer.id} locale={locale} />
            </div>
          ) : null}

          {!isExpired && !hasCode ? (
            <div className="card mb-6 flex items-center justify-between gap-4 p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <Info className="h-4 w-4 text-brand-600" aria-hidden="true" />
                {t.offer.autoApplied}
              </p>
              <a
                href={`/go/${offer.id}`}
                target="_blank"
                rel="nofollow sponsored noopener"
                className="btn-primary btn-md"
              >
                {t.offer.getDeal}
              </a>
            </div>
          ) : null}

          {/* terms */}
          {offer.terms_and_conditions ? (
            <section className="card mb-6 p-5">
              <h2 className="mb-2 text-base font-semibold text-ink">{t.offer.terms}</h2>
              <p className="text-sm leading-relaxed text-ink-muted">{offer.terms_and_conditions}</p>
            </section>
          ) : null}

          {/* how to use */}
          <section className="card mb-6 p-5">
            <h2 className="mb-2 text-base font-semibold text-ink">{t.offer.howToUse}</h2>
            <p className="text-sm leading-relaxed text-ink-muted">{t.offer.howToUseBody}</p>
          </section>

          {/* similar */}
          {similar.length > 0 ? (
            <section aria-labelledby="similar-offers" className="mt-8">
              <h2 id="similar-offers" className="mb-4 text-lg font-semibold text-ink">
                {t.offer.similarOffers}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {similar.map((item) => (
                  <OfferCard
                    key={item.id}
                    offer={item}
                    locale={locale}
                    initialFavorite={favoriteIds.has(item.id)}
                    compact
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* ------------------------------------------------------- aside */}
        <aside className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-3 text-base font-semibold text-ink">{t.offer.terms}</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">{t.nav.stores}</dt>
                <dd className="text-end font-medium text-ink">
                  <Link href={`/${locale}/stores/${offer.merchant_slug}`} className="hover:underline">
                    {offer.merchant_name}
                  </Link>
                </dd>
              </div>

              {offer.expires_at ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">{t.offer.expiresOn}</dt>
                  <dd className="text-end font-medium text-ink">{formatDate(offer.expires_at, locale)}</dd>
                </div>
              ) : null}

              {offer.last_verified_at ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">{t.offer.lastVerified}</dt>
                  <dd className="text-end font-medium text-ink">{formatDate(offer.last_verified_at, locale)}</dd>
                </div>
              ) : null}

              {offer.country_codes.length > 0 ? (
                <div>
                  <dt className="mb-1.5 text-ink-muted">{t.offer.validIn}</dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {offer.country_codes.map((code) => (
                      <Badge key={code} tone="neutral">
                        {countryName(code, locale)}
                      </Badge>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {!isExpired ? (
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
                <Flag className="h-4 w-4" aria-hidden="true" />
                {t.offer.reportTitle}
              </h2>
              <ReportForm offerId={offer.id} locale={locale} />
            </section>
          ) : null}

          <p className="rounded-card border border-line bg-surface-alt p-4 text-xs text-ink-muted">
            <strong className="font-semibold text-ink">{t.disclosure.label} : </strong>
            {disclosures[locale]} {t.disclosure.prices}
          </p>
        </aside>
      </div>
    </div>
  );
}
