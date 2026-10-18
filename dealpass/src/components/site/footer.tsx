import Link from 'next/link';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/types';
import type { BrandSettings } from '@/lib/services/settings';

const LEGAL_PAGES = [
  { slug: 'privacy', key: 'privacy' },
  { slug: 'cookies', key: 'cookies' },
  { slug: 'terms', key: 'terms' },
  { slug: 'affiliate-disclosure', key: 'affiliate' },
] as const;

export function SiteFooter({
  locale,
  brand,
  demoMode,
}: {
  locale: Locale;
  brand: BrandSettings;
  demoMode: boolean;
}) {
  const t = getDictionary(locale);

  return (
    <footer className="mt-16 border-t border-line bg-surface-alt">
      <div className="container-page py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-base font-bold text-ink">{brand.siteName}</p>
            <p className="mt-2 max-w-xs text-sm text-ink-muted">{brand.slogan}</p>
          </div>

          <nav aria-label={t.footer.about}>
            <p className="mb-3 text-sm font-semibold text-ink">{t.nav.categories}</p>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li><Link className="hover:text-ink hover:underline" href={`/${locale}/about`}>{t.footer.about}</Link></li>
              <li><Link className="hover:text-ink hover:underline" href={`/${locale}/faq`}>{t.nav.faq}</Link></li>
              <li><Link className="hover:text-ink hover:underline" href={`/${locale}/contact`}>{t.footer.contact}</Link></li>
              <li><Link className="hover:text-ink hover:underline" href={`/${locale}/guides`}>{t.nav.guides}</Link></li>
            </ul>
          </nav>

          <nav aria-label={t.footer.legal}>
            <p className="mb-3 text-sm font-semibold text-ink">{t.footer.legal}</p>
            <ul className="space-y-2 text-sm text-ink-muted">
              {LEGAL_PAGES.map((page) => (
                <li key={page.slug}>
                  <Link className="hover:text-ink hover:underline" href={`/${locale}/p/${page.slug}`}>
                    {t.footer[page.key]}
                  </Link>
                </li>
              ))}
              <li>
                <Link className="hover:text-ink hover:underline" href={`/${locale}/data-request`}>
                  {t.footer.dataRequest}
                </Link>
              </li>
              <li>
                <Link className="hover:text-ink hover:underline" href={`/${locale}/newsletter/unsubscribe`}>
                  {t.footer.unsubscribe}
                </Link>
              </li>
            </ul>
          </nav>

          <div>
            <p className="mb-3 text-sm font-semibold text-ink">{t.disclosure.label}</p>
            <p className="text-sm text-ink-muted">{t.disclosure.text}</p>
            <p className="mt-3 text-xs text-ink-muted">{t.disclosure.prices}</p>
            {demoMode ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {t.footer.demoNotice}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-8 border-t border-line pt-6 text-center text-xs text-ink-muted">
          © {new Date().getFullYear()} {brand.siteName}. {t.footer.rights}
        </div>
      </div>
    </footer>
  );
}
