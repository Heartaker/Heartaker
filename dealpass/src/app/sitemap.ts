import type { MetadataRoute } from 'next';
import { query } from '@/lib/db';
import { LOCALES } from '@/lib/i18n/config';
import { getPageSlugs } from '@/lib/services/pages';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dealpass.example';

/**
 * Only published, non-expired offers are listed. Categories, stores and
 * editorial pages come from the database so the sitemap is never stale.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [offers, categories, merchants, pages] = await Promise.all([
    query<{ slug: string; updated_at: string }>(
      `SELECT slug, updated_at FROM offers
        WHERE publication_status = 'published'
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY updated_at DESC`,
    ),
    query<{ slug: string }>('SELECT slug FROM categories WHERE status = $1', ['active']),
    query<{ slug: string }>('SELECT slug FROM merchants WHERE status = $1', ['active']),
    getPageSlugs(),
  ]);

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of LOCALES) {
    entries.push({
      url: `${BASE}/${locale}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: locale === 'fr' ? 1 : 0.8,
    });

    for (const path of ['offers', 'stores', 'categories', 'best', 'latest', 'travel', 'hotels', 'flights', 'cars', 'activities', 'courses', 'software']) {
      entries.push({
        url: `${BASE}/${locale}/${path}`,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }

    for (const category of categories) {
      entries.push({
        url: `${BASE}/${locale}/categories/${category.slug}`,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }

    for (const merchant of merchants) {
      entries.push({
        url: `${BASE}/${locale}/stores/${merchant.slug}`,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }

    for (const offer of offers) {
      entries.push({
        url: `${BASE}/${locale}/offers/${offer.slug}`,
        lastModified: new Date(offer.updated_at),
        changeFrequency: 'daily',
        priority: 0.5,
      });
    }

    for (const slug of pages) {
      entries.push({
        url: `${BASE}/${locale}/p/${slug}`,
        changeFrequency: 'monthly',
        priority: 0.3,
      });
    }
  }

  return entries;
}
