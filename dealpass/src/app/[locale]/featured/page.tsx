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
  return { title: t.nav.featured, alternates: { canonical: `/${raw}/featured` } };
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

  const merged = { ...sp };
  if (!merged.sort) merged.sort = 'popular';

  if (!merged.exclusive) merged.exclusive = '1';

  return (
    <OfferExplorer
      locale={locale}
      searchParams={merged}
      title={t.nav.featured}
      basePath={`/${locale}/featured`}
    />
  );
}
