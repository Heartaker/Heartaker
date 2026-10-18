import type { Metadata } from 'next';
import { OfferExplorer } from '@/components/site/offer-explorer';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { isLocale } from '@/lib/i18n/config';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const t = getDictionary(raw as Locale);
  return { title: t.nav.hotels, alternates: { canonical: `/${raw}/hotels` } };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = getDictionary(locale as Locale);
  return (
    <OfferExplorer
      locale={locale}
      searchParams={sp}
      fixedOfferType="hotel_deal"
      title={t.nav.hotels}
      basePath={`/${locale}/hotels`}
    />
  );
}
