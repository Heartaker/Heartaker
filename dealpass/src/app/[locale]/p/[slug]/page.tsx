import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isLocale, LOCALES } from '@/lib/i18n/config';
import { getPage, renderMarkdown } from '@/lib/services/pages';
import { getSetting } from '@/lib/services/settings';
import { localePath } from '@/lib/i18n/config';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const page = await getPage(slug, locale as Locale);
  if (!page) return { title: 'Page not found' };
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? undefined,
  };
}

export default async function EditorialPage({ params }: Params) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const page = await getPage(slug, locale);
  if (!page) notFound();

  const siteName = (await getSetting<string>('brand.site_name', 'DealPass')) ?? 'DealPass';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title,
    description: page.seoDescription ?? undefined,
    inLanguage: locale,
    publisher: { '@type': 'Organization', name: siteName },
  };

  return (
    <div className="container-page max-w-3xl py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1 className="text-3xl font-bold text-ink">{page.title}</h1>

      {/* Content is authored in the admin dashboard. Only a small Markdown
          subset is accepted, and it is escaped before the subset is applied. */}
      <div
        className="mt-6 leading-relaxed text-ink"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(page.body) }}
      />

      <p className="mt-10 rounded-lg border border-line bg-surface-alt p-3 text-xs text-ink-muted">
        This page is managed from the administration dashboard.
      </p>
    </div>
  );
}
