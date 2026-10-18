import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OfferExplorer } from '@/components/site/offer-explorer';
import { isLocale } from '@/lib/i18n/config';
import { listCategories, resolveCategorySlug } from '@/lib/services/offers';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) return {};
  const canonicalSlug = await resolveCategorySlug(slug, raw);
  if (!canonicalSlug) return {};
  const categories = await listCategories();
  const category = categories.find((c) => c.slug === canonicalSlug);
  if (!category) return {};
  return {
    title: category.name,
    description: category.description ?? undefined,
    alternates: { canonical: `/${raw}/categories/${canonicalSlug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  const canonicalSlug = await resolveCategorySlug(slug, locale as 'fr' | 'en' | 'ar');
  if (!canonicalSlug) notFound();

  const categories = await listCategories();
  const category = categories.find((c) => c.slug === canonicalSlug);
  if (!category) notFound();

  return (
    <OfferExplorer
      locale={locale}
      searchParams={sp}
      fixedCategory={canonicalSlug}
      title={category.name}
      description={category.description ?? undefined}
      basePath={`/${locale}/categories/${canonicalSlug}`}
    />
  );
}
