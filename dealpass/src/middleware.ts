import { NextResponse, type NextRequest } from 'next/server';
import { LOCALES, DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config';

/**
 * Language negotiation.
 *
 * Rules from the specification:
 *   • Suggest a language automatically, but NEVER force a redirect without
 *     letting the visitor change it afterwards. Every page therefore carries
 *     visible language / country / currency selectors.
 *   • The URL always contains the locale, so a shared link renders in the
 *     sender's language rather than silently switching for the recipient.
 */

const LOCALE_COOKIE = 'dealpass_lang';

/** Paths that must never be locale-rewritten. */
const PUBLIC_PREFIXES = ['/api', '/go', '/_next', '/favicon', '/robots.txt', '/sitemap.xml', '/admin'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Leave API routes, asset paths and the outbound redirector alone.
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Already localized?
  const firstSegment = pathname.split('/')[1];
  if (firstSegment && isLocale(firstSegment)) {
    return NextResponse.next();
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const chosen = isLocale(cookieLocale)
    ? cookieLocale
    : negotiateFromHeader(request.headers.get('accept-language')) ?? DEFAULT_LOCALE;

  const url = request.nextUrl.clone();
  url.pathname = `/${chosen}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

function negotiateFromHeader(header: string | null): string | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', q = '1'] = part.trim().split(';q=');
      return { tag: tag.trim().toLowerCase(), quality: Number(q) || 0 };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if (LOCALES.includes(base as (typeof LOCALES)[number])) return base;
  }
  return null;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'],
};
