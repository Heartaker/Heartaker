import type { Metadata } from 'next';
import Link from 'next/link';
import { Tag } from 'lucide-react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { isLocale } from '@/lib/i18n/config';
import { listCategories } from '@/lib/services/offers';
import { VERTICALS, type Locale, type Vertical } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const t = getDictionary(raw as Locale);
  return { title: t.nav.categories, alternates: { canonical: `/${raw}/categories` } };
}

const VERTICAL_LABELS: Record<Vertical, Record<Locale, string>> = {
  shopping: { fr: 'Shopping', en: 'Shopping', ar: 'تسوق' },
  travel: { fr: 'Voyage', en: 'Travel', ar: 'سفر' },
  courses: { fr: 'Formations', en: 'Courses', ar: 'دورات' },
  software: { fr: 'Logiciels', en: 'Software', ar: 'برمجيات' },
};

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return null;
  const locale = raw as Locale;
  const t = getDictionary(locale);
  const categories = await listCategories();

  return (
    <div className="container-page py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t.nav.categories}</h1>
      </header>

      {VERTICALS.map((vertical) => {
        const items = categories.filter((c) => c.vertical === vertical);
        if (items.length === 0) return null;
        return (
          <section key={vertical} className="mb-10" aria-labelledby={`cat-${vertical}`}>
            <h2 id={`cat-${vertical}`} className="mb-4 text-lg font-semibold text-ink">
              {VERTICAL_LABELS[vertical][locale]}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/${locale}/categories/${category.slug}`}
                    className="card flex items-center gap-3 p-4 transition-colors hover:border-brand-400"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200">
                      <Tag className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{category.name}</span>
                      <span className="block text-xs text-ink-muted">{category.offer_count}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
