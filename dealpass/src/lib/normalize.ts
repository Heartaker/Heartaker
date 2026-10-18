import { createHash } from 'node:crypto';
import { LOCALES, type Locale } from './types';

/**
 * Pure normalization helpers.
 *
 * These are the single source of truth for "what makes two records the same
 * thing". Every connector must route its raw payload through them before the
 * record reaches the database.
 */

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/** Query parameters that carry no commercial meaning and must not affect identity. */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_name', 'utm_reader', 'utm_brand', 'utm_social',
  'gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid', 'igshid',
  'mc_cid', 'mc_eid', 'yclid', 'ttclid', 's_kwcid',
  '_ga', '_gl', 'ref', 'ref_src', 'source', 'sourceid',
]);

/**
 * Authorised affiliate redirect hosts. A destination URL may legitimately
 * land on one of these instead of the merchant's own domain — that is how
 * affiliate networks attribute a click. Anything else is treated as suspect.
 */
const AUTHORIZED_TRACKING_HOSTS = new Set([
  // Awin
  'awin1.com', 'www.awin1.com',
  // CJ Affiliate
  'cj.com', 'www.cj.com', 'www.qksrv.net', 'www.jdoqocy.com', 'www.tkqlhce.com',
  'www.dpbolvw.net', 'www.emjcd.com', 'www.anrdoezrs.net', 'www.kqzyfj.com',
  'www.lduhtrp.net', 'www.pntra.com', 'www.pntrac.com', 'www.tqlkg.com',
  // Rakuten
  'click.linksynergy.com', 'linksynergy.com', 'www.linksynergy.com', 'redirectingat.com',
  'go.redirectingat.com', 'click.linksynergy.com',
  // Impact
  'impact.com', 'www.impact.com', 'goto.impact.com',
  // ShareASale / others
  'shareasale.com', 'www.shareasale.com', 'shrsl.com',
  // Travelpayouts
  'tp.media', 'www.tp.media', 'c55.travelpayouts.com',
  // Amazon short links
  'amzn.to', 'amzn.eu',
  // eBay
  'rover.ebay.com', 'www.ebay.com',
  // Generic partner sub-domains pattern handled by suffix matching below
]);

/** Host suffixes that are always acceptable as an affiliate hop. */
const AUTHORIZED_TRACKING_SUFFIXES = [
  '.awin1.com',
  '.linksynergy.com',
  '.impact.com',
  '.cj.com',
  '.shareasale.com',
  '.tp.media',
  '.travelpayouts.com',
  '.ebay.com',
  '.amazon.',
  '.aliexpress.com',
  '.temu.com',
  '.klook.com',
  '.booking.com',
  '.agoda.com',
  '.expedia.',
  '.trip.com',
  '.discovercars.com',
];

/**
 * Normalize a URL for identity comparison:
 * lowercase scheme/host, drop `www.`, drop tracking params, drop fragment,
 * drop default ports, sort remaining params, drop trailing slash.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a parseable absolute URL — fall back to light cleanup.
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const port = url.port && url.port !== '80' && url.port !== '443' ? `:${url.port}` : '';

  const params = new URLSearchParams();
  const kept: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    if (TRACKING_PARAMS.has(key.toLowerCase())) return;
    kept.push([key, value]);
  });
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  for (const [k, v] of kept) params.append(k, v);

  const search = params.toString();
  const pathname = url.pathname.replace(/\/+$/, '');

  return `${url.protocol}//${host}${port}${pathname}${search ? `?${search}` : ''}`;
}

/** Registrable-ish host: lowercase, no `www.`, no port. */
export function extractDomain(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Is this destination acceptable for the given merchant?
 * True when the URL lands on the merchant's own domain, or on a known
 * authorised affiliate redirect host.
 */
export function isAuthorizedDestination(
  destinationUrl: string,
  merchantDomains: string[],
): boolean {
  const domain = extractDomain(destinationUrl);
  if (!domain) return false;

  for (const candidate of merchantDomains) {
    const normalizedMerchantDomain = extractDomain(
      candidate.includes('://') ? candidate : `https://${candidate}`,
    );
    if (!normalizedMerchantDomain) continue;
    if (
      domain === normalizedMerchantDomain ||
      domain.endsWith(`.${normalizedMerchantDomain}`)
    ) {
      return true;
    }
  }

  if (AUTHORIZED_TRACKING_HOSTS.has(domain)) return true;
  return AUTHORIZED_TRACKING_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

/** Very cheap heuristic for obviously bogus or dangerous URLs. */
export function isSuspiciousUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (!/^https?:\/\//.test(lower)) return true;
  if (lower.includes('javascript:') || lower.includes('data:')) return true;
  // Raw IP destination is a strong signal of a throwaway redirect domain.
  if (/^https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(lower)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Coupon codes
// ---------------------------------------------------------------------------

/**
 * Normalize a coupon code for comparison.
 * Trims, strips all whitespace, uppercases.
 * Punctuation is preserved on purpose: some programmes treat `A-B` and `AB`
 * as different codes, and collapsing them would merge distinct offers.
 */
export function normalizeCouponCode(code: string | null | undefined): string {
  if (!code) return '';
  return code.replace(/\s+/g, '').trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    // Accept both seconds and milliseconds epochs.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export interface DateCoherence {
  ok: boolean;
  reason?: string;
}

export function checkDateCoherence(startAt: Date | null, expiresAt: Date | null, now = new Date()): DateCoherence {
  if (startAt && Number.isNaN(startAt.getTime())) return { ok: false, reason: 'invalid_start_date' };
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { ok: false, reason: 'invalid_expiry_date' };
  if (startAt && expiresAt && expiresAt <= startAt) {
    return { ok: false, reason: 'expiry_before_start' };
  }
  if (expiresAt && expiresAt <= now) return { ok: false, reason: 'already_expired' };
  if (startAt && startAt > new Date(now.getTime() + 365 * 24 * 3600 * 1000)) {
    return { ok: false, reason: 'start_too_far_in_future' };
  }
  return { ok: true };
}

/** Truncate to `YYYY-MM-DD` so re-imports on the same day produce one identity. */
export function toDateKey(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Geography & currency
// ---------------------------------------------------------------------------

const ISO2 = /^[A-Z]{2}$/;
const ISO3 = /^[A-Z]{3}$/;

export function normalizeCountryCodes(input: unknown): string[] {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : String(input).split(/[,\s]+/);
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const code = item.trim().toUpperCase();
    if (ISO2.test(code)) out.add(code);
  }
  return [...out].sort();
}

/** Normalise a 2-letter country code, returning null when it is not valid. */
export function normalizeCountry(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return ISO2.test(code) ? code : null;
}

export function isValidCurrency(input: unknown): boolean {
  return typeof input === 'string' && ISO3.test(input.trim().toUpperCase());
}

export function normalizeCurrency(input: unknown, fallback = 'EUR'): string {
  if (typeof input === 'string') {
    const c = input.trim().toUpperCase();
    if (ISO3.test(c)) return c;
  }
  return fallback;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Text & slugs
// ---------------------------------------------------------------------------

/**
 * URL-safe slug. Transliterates Latin accents, preserves Arabic characters
 * (RFC 3988 permits them percent-encoded; browsers display them natively).
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

/** Collapse messy whitespace and trim, without touching content. */
export function cleanText(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Mask a secret for display: never show more than the last 4 characters. */
export function maskSecret(value: string | undefined | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(value.length - 4, 8))}${value.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Privacy-preserving identifier for click / session correlation.
 * Salted with DATA_ENCRYPTION_KEY so the stored value cannot be reversed to
 * the original input, and rotated daily so it is not a long-lived pseudonym.
 */
export function privacyHash(input: string, salt: string, dayBucket = false): string {
  const bucket = dayBucket
    ? new Date().toISOString().slice(0, 10)
    : 'static';
  return sha256(`${salt}|${bucket}|${input}`).slice(0, 32);
}
