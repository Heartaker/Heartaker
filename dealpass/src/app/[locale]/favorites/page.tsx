import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { OfferCard } from '@/components/site/offer-card';
import { EmptyState } from '@/components/ui/card';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getCurrentUser } from '@/lib/auth/session';
import { getFavoriteOffers, getFavoriteOfferIds } from '@/lib/services/offers';
import { getFeatureSettings } from '@/lib/services/settings';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);
  const features = await getFeatureSettings();

  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="container-page py-12">
        <EmptyState
          title={t.account.loginRequired}
          action={
            <Link href={`/${locale}/sign-in?next=/${locale}/favorites`} className="btn-primary btn-md mt-2">
              {t.account.signIn}
            </Link>
          }
        />
      </div>
    );
  }

  const [offers, favoriteIds] = await Promise.all([
    getFavoriteOffers(user.id, locale),
    getFavoriteOfferIds(user.id),
  ]);

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex items-center gap-2">
        <Heart className="h-5 w-5 text-red-500" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-ink">{t.account.myFavorites}</h1>
      </header>

      {!features.favoritesEnabled ? (
        <p className="card p-4 text-sm text-ink-muted">{t.common.empty}</p>
      ) : offers.length === 0 ? (
        <EmptyState
          title={t.account.noFavorites}
          action={
            <Link href={`/${locale}/offers`} className="btn-primary btn-md mt-2">
              {t.account.noFavoritesCta}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
    </div>
  );
}
