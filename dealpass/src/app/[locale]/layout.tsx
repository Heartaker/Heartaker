import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import '@/app/globals.css';
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { isLocale, LOCALES, dirFor, HTML_LANG, LOCALE_BCP47 } from '@/lib/i18n/config';
import { getBrandSettings, getFeatureSettings, getLocalizationSettings } from '@/lib/services/settings';
import { getVisitorPrefs } from '@/lib/prefs';
import { LOCALE_LABELS } from '@/lib/i18n/config';
import type { Locale } from '@/lib/types';

export const dynamic = 'force-dynamic'; // brand settings are editable at runtime

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

interface LayoutParams {
  params: Promise<{ locale: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const locale = raw as Locale;
  const brand = await getBrandSettings();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: `${brand.siteName} — ${brand.slogan}`,
      template: `%s · ${brand.siteName}`,
    },
    description: brand.slogan,
    applicationName: brand.siteName,
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(
        LOCALES.map((code) => [LOCALE_BCP47[code], `/${code}`]),
      ),
    },
    openGraph: {
      type: 'website',
      siteName: brand.siteName,
      title: `${brand.siteName} — ${brand.slogan}`,
      description: brand.slogan,
      locale: LOCALE_BCP47[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => LOCALE_BCP47[l]),
    },
    twitter: { card: 'summary_large_image' },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
};

export default async function LocaleLayout({ params, children }: LayoutParams) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const [brand, features, settings, prefs] = await Promise.all([
    getBrandSettings(),
    getFeatureSettings(),
    getLocalizationSettings(),
    getVisitorPrefs(locale),
  ]);

  // Brand identity is injected as CSS custom properties so an administrator can
  // recolour or refont the entire site from the dashboard without a rebuild.
  const brandStyle = {
    '--brand': brand.colors.brand,
    '--accent': brand.colors.accent,
    '--ink': brand.colors.ink,
    '--surface': brand.colors.surface,
    '--line': brand.colors.line,
    '--font-sans': `${brand.fontSans}, ui-sans-serif, system-ui, sans-serif`,
    '--font-display': `${brand.fontDisplay}, ui-sans-serif, system-ui, sans-serif`,
    '--radius-card': brand.radius,
  } as React.CSSProperties;

  const demoMode = features.demoConnectorEnabled;

  return (
    <html lang={HTML_LANG[locale]} dir={dirFor(locale)} style={brandStyle} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        {/* Applied before paint so a dark-mode visitor never sees a white flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=document.cookie.match(/dealpass_theme=(dark|light)/);if(t&&t[1]==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />

        <a href="#main" className="sr-only-focusable">
          {LOCALE_LABELS[locale] === 'Français' ? 'Aller au contenu principal' : locale === 'ar' ? 'الانتقال إلى المحتوى' : 'Skip to main content'}
        </a>

        <SiteHeader
          locale={locale}
          country={prefs.country}
          currency={prefs.currency}
          theme={prefs.theme}
          brand={brand}
        />

        <main id="main" className="flex-1">
          {children}
        </main>

        <SiteFooter locale={locale} brand={brand} demoMode={demoMode} />
      </body>
    </html>
  );
}
