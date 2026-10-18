-- =============================================================================
-- 0007 — Full-text search, typo tolerance, analytics rollups
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Full-text search on offers.
-- 'simple' config because content is mixed French / English / Arabic and we
-- must not depend on a language-specific stemmer being installed.
-- -----------------------------------------------------------------------------
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS search_document tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(short_description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(coupon_code, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(full_description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS offers_search_idx ON offers USING gin(search_document);

-- Typo tolerance via trigram similarity (skipped automatically if pg_trgm is
-- unavailable — see 0001).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS offers_title_trgm_idx   ON offers USING gin(title gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS offers_code_trgm_idx    ON offers USING gin(coupon_code gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS merchants_name_trgm_idx ON merchants USING gin(name gin_trgm_ops);
  ELSE
    RAISE NOTICE 'pg_trgm not installed — trigram indexes skipped.';
  END IF;
END $$;

-- Merchant search
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS search_document tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(short_description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS merchants_search_idx ON merchants USING gin(search_document);

-- -----------------------------------------------------------------------------
-- search_offers() — one entry point for ranked, filtered, paginated search.
-- Used by the public site and by the newsletter builder so both stay consistent.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_offers(
  p_query        text        DEFAULT NULL,
  p_country      text        DEFAULT NULL,
  p_language     text        DEFAULT NULL,
  p_currency     text        DEFAULT NULL,
  p_category     text        DEFAULT NULL,
  p_merchant     text        DEFAULT NULL,
  p_offer_types  text[]      DEFAULT NULL,
  p_vertical     text        DEFAULT NULL,
  p_verified_only boolean    DEFAULT false,
  p_new_customer boolean     DEFAULT false,
  p_free_shipping boolean    DEFAULT false,
  p_exclusive    boolean     DEFAULT false,
  p_ending_soon  boolean     DEFAULT false,
  p_min_discount numeric     DEFAULT NULL,
  p_sort         text        DEFAULT 'popular',
  p_limit        integer     DEFAULT 24,
  p_offset       integer     DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  title          text,
  slug           text,
  short_description text,
  coupon_code    text,
  offer_type     text,
  discount_type  text,
  discount_value numeric,
  currency       text,
  expires_at     timestamptz,
  country_codes  text[],
  confidence_score integer,
  verification_status text,
  last_verified_at timestamptz,
  is_exclusive   boolean,
  is_featured    boolean,
  image_url      text,
  published_at   timestamptz,
  merchant_id    uuid,
  merchant_name  text,
  merchant_slug  text,
  merchant_logo  text,
  total_count    bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      o.*,
      m.name AS merchant_name,
      m.slug AS merchant_slug,
      m.logo_url AS merchant_logo
    FROM offers o
    JOIN merchants m ON m.id = o.merchant_id AND m.deleted_at IS NULL
    WHERE o.deleted_at IS NULL
      AND o.publication_status = 'published'
      AND (o.expires_at IS NULL OR o.expires_at > now())
      AND (p_country  IS NULL OR p_country  = ANY(o.country_codes))
      AND (p_language IS NULL OR p_language = ANY(o.language_codes))
      AND (p_currency IS NULL OR o.currency = p_currency)
      AND (p_merchant IS NULL OR m.slug = p_merchant)
      AND (p_vertical IS NULL OR m.vertical = p_vertical)
      AND (p_offer_types IS NULL OR o.offer_type = ANY(p_offer_types))
      AND (NOT p_verified_only   OR o.verification_status = 'verified')
      AND (NOT p_new_customer    OR o.offer_type = 'new_customer_offer')
      AND (NOT p_free_shipping   OR o.offer_type = 'free_shipping')
      AND (NOT p_exclusive       OR o.is_exclusive)
      AND (NOT p_ending_soon     OR (o.expires_at IS NOT NULL AND o.expires_at < now() + interval '7 days'))
      AND (p_min_discount IS NULL OR o.discount_value >= p_min_discount)
      AND (
        p_category IS NULL
        OR o.primary_category_id = (SELECT c.id FROM categories c WHERE c.slug = p_category LIMIT 1)
        OR EXISTS (
          SELECT 1 FROM offer_categories oc
          JOIN categories c ON c.id = oc.category_id
          WHERE oc.offer_id = o.id AND c.slug = p_category
        )
      )
      AND (
        p_query IS NULL OR length(trim(p_query)) = 0
        OR o.search_document @@ plainto_tsquery('simple', p_query)
        OR o.title ILIKE '%' || p_query || '%'
        OR o.coupon_code ILIKE '%' || p_query || '%'
        OR m.name ILIKE '%' || p_query || '%'
      )
  ),
  counted AS (SELECT count(*)::bigint AS n FROM base)
  SELECT
    b.id, b.title, b.slug, b.short_description, b.coupon_code, b.offer_type,
    b.discount_type, b.discount_value, b.currency, b.expires_at,
    b.country_codes, b.confidence_score, b.verification_status,
    b.last_verified_at, b.is_exclusive, b.is_featured, b.image_url,
    b.published_at, b.merchant_id, b.merchant_name, b.merchant_slug,
    b.merchant_logo,
    (SELECT n FROM counted) AS total_count
  FROM base b
  ORDER BY
    CASE WHEN p_sort = 'newest'   THEN b.published_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'discount' THEN b.discount_value END DESC NULLS LAST,
    CASE WHEN p_sort = 'ending'   THEN b.expires_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'verified' THEN b.last_verified_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'popular'  THEN (b.is_featured::int * 1000 + b.confidence_score) END DESC,
    b.is_featured DESC,
    b.confidence_score DESC,
    b.published_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION search_offers IS
  'Single source of truth for public offer listings and newsletter selection. Always excludes expired, unpublished and soft-deleted rows.';

-- -----------------------------------------------------------------------------
-- Daily click rollup — keeps analytics queries cheap as the clicks table grows.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS click_daily_stats (
  stat_date      date NOT NULL,
  offer_id       uuid REFERENCES offers(id) ON DELETE CASCADE,
  merchant_id    uuid REFERENCES merchants(id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  country_code   text,
  event_count    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date, offer_id, merchant_id, event_type, country_code)
);

CREATE INDEX IF NOT EXISTS click_daily_stats_date_idx ON click_daily_stats(stat_date DESC);
