import Link from 'next/link';
import { Heart, Menu, Search, User } from 'lucide-react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { CountrySelector, CurrencySelector, LanguageSelector } from './selectors';
import { ThemeToggle } from './theme-toggle';
import { SearchBar } from './search-bar';
import { getCurrentUser } from '@/lib/auth/session';
import { isStaff } from '@/lib/auth/rbac';
import type { Locale } from '@/lib/types';
import type { BrandSettings } from '@/lib/services/settings';

export interface HeaderProps {
  locale: Locale;
  country: string;
  currency: string;
  theme: 'light' | 'dark';
  brand: BrandSettings;
}

export async function SiteHeader({ locale, country, currency, theme, brand }: HeaderProps) {
  const t = getDictionary(locale);
  const user = await getCurrentUser();
  const staff = isStaff(user);

  const links = [
    { href: `/${locale}/offers`, label: t.nav.allOffers },
    { href: `/${locale}/stores`, label: t.nav.stores },
    { href: `/${locale}/travel`, label: t.nav.travel },
    { href: `/${locale}/best`, label: t.nav.best },
    { href: `/${locale}/latest`, label: t.nav.latest },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="container-page">
        <div className="flex h-16 items-center gap-3">
          {/* Brand */}
          <Link
            href={`/${locale}`}
            className="flex shrink-0 items-center gap-2 font-display text-lg font-bold text-ink"
          >
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="" className="h-8 w-auto" height={32} />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-black text-white"
              >
                {brand.siteName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="hidden sm:inline">{brand.siteName}</span>
          </Link>

          {/* Search */}
          <div className="mx-2 hidden min-w-0 flex-1 md:block">
            <SearchBar locale={locale} />
          </div>

          {/* Desktop nav */}
          <nav aria-label={t.nav.skipToContent} className="hidden items-center gap-1 lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Selectors + actions */}
          <div className="ms-auto flex items-center gap-1.5">
            <div className="hidden items-center gap-1.5 sm:flex">
              <LanguageSelector locale={locale} />
              <CountrySelector country={country} locale={locale} />
              <CurrencySelector currency={currency} />
            </div>
            <ThemeToggle initial={theme} />

            <Link
              href={`/${locale}/favorites`}
              aria-label={t.nav.favorites}
              title={t.nav.favorites}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
            >
              <Heart className="h-4 w-4" aria-hidden="true" />
            </Link>

            {user ? (
              <Link
                href={staff ? '/admin' : `/${locale}/account`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-alt"
              >
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden md:inline">{staff ? t.nav.admin : t.nav.account}</span>
              </Link>
            ) : (
              <Link
                href={`/${locale}/sign-in`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-xs font-medium text-white transition-colors hover:bg-brand-800"
              >
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden md:inline">{t.nav.signIn}</span>
              </Link>
            )}
          </div>
        </div>

        {/* Mobile search + nav */}
        <div className="flex items-center gap-2 pb-3 md:hidden">
          <SearchBar locale={locale} />
        </div>
        <nav aria-label={t.nav.openMenu} className="flex items-center gap-1 overflow-x-auto pb-3 lg:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={`/${locale}/categories`}
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
          >
            {t.nav.categories}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function MobileMenuIcon() {
  return <Menu className="h-5 w-5" aria-hidden="true" />;
}

export function SearchIcon() {
  return <Search className="h-4 w-4" aria-hidden="true" />;
}
