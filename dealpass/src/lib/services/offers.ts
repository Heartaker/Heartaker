import { query, queryOne } from '../db/index';
import type { Locale, OfferQuery, PublicMerchant, PublicOffer, SortOption } from '../types';
import { getLocalizationSettings } from './settings';

/**
 * Public read models.
 *
 * Every public listing goes through the `search_offers()` SQL function, which
 * hard-excludes unpublished, expired and soft-deleted rows. A bug elsewhere in
 * the application therefore cannot leak a rejected offer onto the site.
 */

export const PER_PAGE = 24;

export interface OfferListResult {
  offers: PublicOffer[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

interface RawOfferRow {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  coupon_code: string | null;
  offer_type: string;
  discount_type: string;
  discount_value: string | null;
  currency: string;
  expires_at: string | null;
  country_codes: string[];
  confidence_score: number;
  verification_status: string;
  last_verified_at: string | null;
  is_exclusive: boolean;
  is_featured: boolean;
  image_url: string | null;
  published_at: string | null;
  merchant_id: string;
  merchant_name: string;
  merchant_slug: string;
  merchant_logo: string | null;
  total_count: string;
}

function mapRow(row: RawOfferRow): PublicOffer {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    short_description: row.short_description,
    coupon_code: row.coupon_code,
    offer_type: row.offer_type as PublicOffer['offer_type'],
    discount_type: row.discount_type as PublicOffer['discount_type'],
    discount_value: row.discount_value === null ? null : Number(row.discount_value),
    currency: row.currency,
    expires_at: row.expires_at,
    country_codes: row.country_codes ?? [],
    confidence_score: row.confidence_score,
    verification_status: row.verification_status as PublicOffer['verification_status'],
    last_verified_at: row.last_verified_at,
    is_exclusive: row.is_exclusive,
    is_featured: row.is_featured,
    image_url: row.image_url,
    published_at: row.published_at,
    merchant_id: row.merchant_id,
    merchant_name: row.merchant_name,
    merchant_slug: row.merchant_slug,
    merchant_logo: row.merchant_logo,
    total_count: Number(row.total_count),
  };
}

const SORTS: SortOption[] = ['popular', 'newest', 'discount', 'ending', 'verified'];

export function normalizeSort(value: string | undefined | null): SortOption {
  return SORTS.includes(value as SortOption) ? (value as SortOption) : 'popular';
}

export async function listOffers(input: OfferQuery = {}): Promise<OfferListResult> {
  const loc = await getLocalizationSettings();
  const page = Math.max(1, input.page ?? 1);
  const perPage = Math.min(60, input.perPage ?? PER_PAGE);

  const rows = await query<RawOfferRow>(
    `SELECT * FROM search_offers(
       $1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
     )`,
    [
      input.query?.trim() || null,
      input.country ?? null,
      input.language ?? loc.defaultLanguage,
      input.currency ?? null,
      input.category ?? null,
      input.merchant ?? null,
      input.offerTypes?.length ? input.offerTypes : null,
      input.vertical ?? null,
      input.verifiedOnly ?? false,
      input.newCustomer ?? false,
      input.freeShipping ?? false,
      input.exclusive ?? false,
      input.endingSoon ?? false,
      input.minDiscount ?? null,
      normalizeSort(input.sort),
      perPage,
      (page - 1) * perPage,
    ],
  );

  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
  return {
    offers: rows.map(mapRow),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Lightweight listing for homepage carousels. */
async function listOffersSimple(
  fnArgs: Partial<OfferQuery>,
  limit: number,
): Promise<PublicOffer[]> {
  const result = await listOffers({ ...fnArgs, perPage: limit, page: 1 });
  return result.offers;
}

export const popularOffers = (locale: Locale, country: string, limit = 8) =>
  listOffersSimple({ language: locale, country, sort: 'popular' }, limit);

export const recentlyVerifiedOffers = (locale: Locale, country: string, limit = 8) =>
  listOffersSimple({ language: locale, country, sort: 'verified', verifiedOnly: true }, limit);

export const endingSoonOffers = (locale: Locale, country: string, limit = 6) =>
  listOffersSimple({ language: locale, country, sort: 'ending', endingSoon: true }, limit);

export const travelOffers = (locale: Locale, country: string, limit = 6) =>
  listOffersSimple({ language: locale, country, vertical: 'travel', sort: 'popular' }, limit);

export const latestOffers = (locale: Locale, country: string, limit = 12) =>
  listOffersSimple({ language: locale, country, sort: 'newest' }, limit);

export const bestOffers = (locale: Locale, country: string, limit = 12) =>
  listOffersSimple({ language: locale, country, sort: 'discount' }, limit);

// ---------------------------------------------------------------------------
// Single offer
// ---------------------------------------------------------------------------

export interface OfferDetail extends PublicOffer {
  full_description: string | null;
  terms_and_conditions: string | null;
  affiliate_url: string | null;
  destination_url: string;
  source_type: string;
  start_at: string | null;
  merchant_website: string | null;
  merchant_vertical: string;
  category_slug: string | null;
  category_name: string | null;
}

/**
 * Fetch a single published offer by slug.
 * Expired offers are still returned — they need to render an honest
 * "this offer has expired" page with alternatives, per the SEO strategy.
 */
export async function getOfferBySlug(slug: string): Promise<OfferDetail | null> {
  const row = await queryOne<OfferDetail>(
    `SELECT o.id, o.title, o.slug, o.short_description, o.full_description,
            o.coupon_code, o.offer_type, o.discount_type, o.discount_value,
            o.currency, o.expires_at, o.start_at, o.country_codes,
            o.confidence_score, o.verification_status, o.last_verified_at,
            o.is_exclusive, o.is_featured, o.image_url, o.published_at,
            o.terms_and_conditions, o.affiliate_url, o.destination_url, o.source_type,
            m.id AS merchant_id, m.name AS merchant_name, m.slug AS merchant_slug,
            m.logo_url AS merchant_logo, m.official_website_url AS merchant_website,
            m.vertical AS merchant_vertical,
            c.slug AS category_slug, c.name AS category_name
       FROM offers o
       JOIN merchants m ON m.id = o.merchant_id AND m.deleted_at IS NULL
       LEFT JOIN categories c ON c.id = o.primary_category_id
      WHERE o.slug = $1 AND o.deleted_at IS NULL
        AND o.publication_status IN ('published','expired','suspended')
      LIMIT 1`,
    [slug],
  );
  if (!row) return null;
  return { ...row, discount_value: row.discount_value === null ? null : Number(row.discount_value) };
}

export async function getSimilarOffers(offer: OfferDetail, limit = 4): Promise<PublicOffer[]> {
  const result = await listOffers({
    category: offer.category_slug ?? undefined,
    language: 'fr',
    perPage: limit + 1,
    sort: 'popular',
  });
  return result.offers.filter((o) => o.id !== offer.id).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Merchants & categories
// ---------------------------------------------------------------------------

export interface MerchantDetail extends PublicMerchant {
  full_description: string | null;
  official_website_url: string | null;
  supported_languages: string[];
  default_currency: string;
  offer_count: number;
  is_verified: boolean;
}

export async function listMerchants(
  vertical?: string,
  limit = 200,
): Promise<Array<PublicMerchant & { offer_count: number }>> {
  return query<PublicMerchant & { offer_count: number }>(
    `SELECT m.id, m.name, m.slug, m.logo_url, m.short_description, m.country_codes,
            m.vertical, m.is_verified,
            (SELECT count(*)::int FROM offers o
              WHERE o.merchant_id = m.id AND o.deleted_at IS NULL
                AND o.publication_status = 'published'
                AND (o.expires_at IS NULL OR o.expires_at > now())) AS offer_count
       FROM merchants m
      WHERE m.deleted_at IS NULL AND m.status = 'active'
        AND ($1::text IS NULL OR m.vertical = $1)
      ORDER BY offer_count DESC, m.name
      LIMIT $2`,
    [vertical ?? null, limit],
  );
}

export async function getMerchantBySlug(slug: string): Promise<MerchantDetail | null> {
  const row = await queryOne<MerchantDetail>(
    `SELECT m.id, m.name, m.slug, m.logo_url, m.short_description, m.full_description,
            m.country_codes, m.vertical, m.is_verified, m.official_website_url,
            m.supported_languages, m.default_currency,
            (SELECT count(*)::int FROM offers o
              WHERE o.merchant_id = m.id AND o.deleted_at IS NULL
                AND o.publication_status = 'published'
                AND (o.expires_at IS NULL OR o.expires_at > now())) AS offer_count
       FROM merchants m
      WHERE m.slug = $1 AND m.deleted_at IS NULL
      LIMIT 1`,
    [slug],
  );
  return row ?? null;
}

export async function getMerchantOffers(merchantId: string, locale: Locale, limit = 50): Promise<PublicOffer[]> {
  const result = await listOffers({ language: locale, perPage: limit, sort: 'popular' });
  return result.offers.filter((o) => o.merchant_id === merchantId);
}

export interface CategoryPublic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  vertical: string;
  offer_count: number;
}

export async function listCategories(vertical?: string): Promise<CategoryPublic[]> {
  const rows = await query<CategoryPublic>(
    `SELECT c.id, c.name, c.slug, c.description, c.icon, c.display_order, c.vertical,
            (SELECT count(*)::int FROM offer_categories oc
               JOIN offers o ON o.id = oc.offer_id
              WHERE oc.category_id = c.id AND o.deleted_at IS NULL
                AND o.publication_status = 'published'
                AND (o.expires_at IS NULL OR o.expires_at > now())) AS offer_count
       FROM categories c
      WHERE c.status = 'active' AND ($1::text IS NULL OR c.vertical = $1)
      ORDER BY c.display_order, c.name`,
    [vertical ?? null],
  );
  return rows;
}

export async function getCategoryBySlug(slug: string): Promise<CategoryPublic | null> {
  return queryOne<CategoryPublic>(
    `SELECT c.id, c.name, c.slug, c.description, c.icon, c.display_order, c.vertical, 0 AS offer_count
       FROM categories c WHERE c.slug = $1 AND c.status = 'active' LIMIT 1`,
    [slug],
  );
}

/** Resolve a localized category slug (from category_translations) to the canonical one. */
export async function resolveCategorySlug(slug: string, locale: Locale): Promise<string | null> {
  const row = await queryOne<{ slug: string }>(
    `SELECT c.slug FROM categories c
      WHERE c.slug = $1
         OR c.id = (SELECT category_id FROM category_translations WHERE language_code = $2 AND slug = $1 LIMIT 1)
      LIMIT 1`,
    [slug, locale],
  );
  return row?.slug ?? null;
}

// ---------------------------------------------------------------------------
// Homepage aggregate
// ---------------------------------------------------------------------------

export async function getHomeStats(): Promise<{ offers: number; merchants: number; countries: number }> {
  const row = await queryOne<{ offers: string; merchants: string; countries: string }>(
    `SELECT
       (SELECT count(*)::text FROM offers WHERE deleted_at IS NULL
          AND publication_status = 'published'
          AND (expires_at IS NULL OR expires_at > now())) AS offers,
       (SELECT count(*)::text FROM merchants WHERE status = 'active' AND deleted_at IS NULL) AS merchants,
       (SELECT count(*)::text FROM (
          SELECT DISTINCT unnest(country_codes)
            FROM offers
           WHERE deleted_at IS NULL AND publication_status = 'published'
        ) distinct_countries) AS countries`,
  );
  return {
    offers: Number(row?.offers ?? 0),
    merchants: Number(row?.merchants ?? 0),
    countries: Number(row?.countries ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Favourites
// ---------------------------------------------------------------------------

export async function getFavoriteOffers(userId: string, locale: Locale): Promise<PublicOffer[]> {
  const rows = await query<RawOfferRow>(
    `SELECT o.id, o.title, o.slug, o.short_description, o.coupon_code, o.offer_type,
            o.discount_type, o.discount_value, o.currency, o.expires_at, o.country_codes,
            o.confidence_score, o.verification_status, o.last_verified_at,
            o.is_exclusive, o.is_featured, o.image_url, o.published_at,
            m.id AS merchant_id, m.name AS merchant_name, m.slug AS merchant_slug,
            m.logo_url AS merchant_logo, 0::text AS total_count
       FROM favorites f
       JOIN offers o  ON o.id = f.offer_id AND o.deleted_at IS NULL
       JOIN merchants m ON m.id = o.merchant_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function toggleFavorite(userId: string, offerId: string): Promise<boolean> {
  const existing = await queryOne<{ offer_id: string }>(
    'SELECT offer_id FROM favorites WHERE user_id = $1 AND offer_id = $2',
    [userId, offerId],
  );
  if (existing) {
    await query('DELETE FROM favorites WHERE user_id = $1 AND offer_id = $2', [userId, offerId]);
    return false;
  }
  await query(
    'INSERT INTO favorites (user_id, offer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, offerId],
  );
  return true;
}

export async function isFavorite(userId: string, offerId: string): Promise<boolean> {
  const row = await queryOne('SELECT 1 AS ok FROM favorites WHERE user_id = $1 AND offer_id = $2', [userId, offerId]);
  return Boolean(row);
}

/** Set of offer ids a user has favourited — for cheap membership checks. */
export async function getFavoriteOfferIds(userId: string): Promise<Set<string>> {
  const rows = await query<{ offer_id: string }>(
    'SELECT offer_id FROM favorites WHERE user_id = $1',
    [userId],
  );
  return new Set(rows.map((r) => r.offer_id));
}
