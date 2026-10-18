import { OfferExplorer } from '@/components/site/offer-explorer';

export const dynamic = 'force-dynamic';

/**
 * Internal search results.
 * Noindexed via robots metadata: indexing internal search pages creates
 * low-value, near-duplicate pages (spec: "No indexing of low-value internal
 * search pages").
 */
export const metadata = { robots: { index: false, follow: true } };

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  return <OfferExplorer locale={locale} searchParams={sp} basePath={`/${locale}/search`} />;
}
