-- =============================================================================
-- 0003 — Offers, translations, taxonomy, version history
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- -----------------------------------------------------------------------------
-- offers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id          text,
  source_fingerprint   text NOT NULL,
  merchant_id          uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  network_id           uuid REFERENCES affiliate_networks(id) ON DELETE SET NULL,
  primary_category_id  uuid REFERENCES categories(id) ON DELETE SET NULL,

  title                text NOT NULL,
  slug                 text NOT NULL,
  short_description    text,
  full_description     text,

  coupon_code          text,
  offer_type           text NOT NULL DEFAULT 'coupon_code',
  discount_type        text NOT NULL DEFAULT 'unknown',
  discount_value       numeric(12,2),
  discount_unit        text NOT NULL DEFAULT 'none',

  original_price       numeric(12,2),
  final_price          numeric(12,2),
  currency             text NOT NULL DEFAULT 'EUR',

  destination_url      text NOT NULL,
  affiliate_url        text,
  image_url            text,

  start_at             timestamptz,
  expires_at           timestamptz,
  country_codes        text[] NOT NULL DEFAULT '{}',
  language_codes       text[] NOT NULL DEFAULT '{fr,en,ar}',

  terms_and_conditions text,
  eligibility_rules    text,

  source_type          text NOT NULL DEFAULT 'demo',
  source_reference     text,
  verification_status  text NOT NULL DEFAULT 'unverified',
  publication_status   text NOT NULL DEFAULT 'imported',
  confidence_score     integer NOT NULL DEFAULT 0,

  is_exclusive         boolean NOT NULL DEFAULT false,
  is_featured          boolean NOT NULL DEFAULT false,

  last_verified_at     timestamptz,
  imported_at          timestamptz NOT NULL DEFAULT now(),
  published_at         timestamptz,
  expired_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,

  CONSTRAINT offers_offer_type_chk CHECK (offer_type IN (
    'coupon_code','automatic_discount','flash_sale','seasonal_sale','cashback',
    'free_shipping','exclusive_offer','new_customer_offer','price_drop',
    'travel_deal','hotel_deal','flight_deal','car_rental_deal',
    'activity_deal','course_deal','software_deal'
  )),
  CONSTRAINT offers_publication_chk CHECK (publication_status IN (
    'imported','pending_validation','approved','scheduled','published',
    'rejected','expired','suspended','archived'
  )),
  CONSTRAINT offers_verification_chk CHECK (
    verification_status IN ('unverified','pending','verified','failed','stale')
  ),
  CONSTRAINT offers_discount_type_chk CHECK (
    discount_type IN ('percentage','fixed_amount','unknown','none')
  ),
  CONSTRAINT offers_discount_unit_chk CHECK (
    discount_unit IN ('percent','currency','none')
  ),
  CONSTRAINT offers_source_type_chk CHECK (
    source_type IN ('api','feed','csv','webhook','manual','demo')
  ),
  CONSTRAINT offers_confidence_chk  CHECK (confidence_score BETWEEN 0 AND 100),
  CONSTRAINT offers_currency_chk    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT offers_dates_chk       CHECK (expires_at IS NULL OR start_at IS NULL OR expires_at > start_at),
  CONSTRAINT offers_prices_chk      CHECK (
    original_price IS NULL OR final_price IS NULL OR final_price <= original_price
  ),
  CONSTRAINT offers_code_type_chk   CHECK (
    offer_type <> 'coupon_code' OR (coupon_code IS NOT NULL AND length(trim(coupon_code)) > 0)
  )
);

-- The deduplication guarantee: one fingerprint may exist only once.
CREATE UNIQUE INDEX IF NOT EXISTS offers_fingerprint_uq
  ON offers(source_fingerprint)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offers_slug_uq
  ON offers(slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS offers_merchant_idx    ON offers(merchant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS offers_network_idx     ON offers(network_id);
CREATE INDEX IF NOT EXISTS offers_category_idx    ON offers(primary_category_id);
CREATE INDEX IF NOT EXISTS offers_status_idx      ON offers(publication_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS offers_expires_idx     ON offers(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS offers_published_idx   ON offers(published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS offers_verified_idx    ON offers(last_verified_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS offers_confidence_idx  ON offers(confidence_score) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS offers_countries_idx   ON offers USING gin(country_codes);
CREATE INDEX IF NOT EXISTS offers_featured_idx    ON offers(is_featured, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS offers_external_idx    ON offers(network_id, external_id);

-- Composite index powering the default public listing query.
CREATE INDEX IF NOT EXISTS offers_public_list_idx
  ON offers(publication_status, expires_at, published_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN offers.source_fingerprint IS
  'Stable hash of network + merchant + external id + normalised code + normalised destination URL + country + offer type + expiry. Guarantees idempotent imports.';
COMMENT ON COLUMN offers.confidence_score IS
  '0-100 data-quality score computed by the validation engine. >=90 auto-publish, 70-89 publish if complete, <70 human review.';

CREATE TRIGGER offers_set_updated_at BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- offer_translations
-- -----------------------------------------------------------------------------
-- Editorial text only. Factual commercial data (code, price, dates, countries)
-- lives on `offers` and is NEVER overwritten by a translation or by AI.
CREATE TABLE IF NOT EXISTS offer_translations (
  offer_id                     uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  language_code                text NOT NULL,
  translated_title             text,
  translated_short_description text,
  translated_full_description  text,
  translated_terms             text,
  generated_by_ai              boolean NOT NULL DEFAULT false,
  ai_provider                  text,
  reviewed_at                  timestamptz,
  reviewed_by                  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, language_code),
  CONSTRAINT offer_translations_lang_chk CHECK (language_code IN ('fr','en','ar'))
);

CREATE TRIGGER offer_translations_set_updated_at BEFORE UPDATE ON offer_translations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE offer_translations IS
  'AI-generated or human editorial copy, kept strictly separate from source facts. generated_by_ai / ai_provider / reviewed_at record provenance.';

-- -----------------------------------------------------------------------------
-- offer_categories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offer_categories (
  offer_id    uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, category_id)
);

CREATE INDEX IF NOT EXISTS offer_categories_category_idx ON offer_categories(category_id);

-- -----------------------------------------------------------------------------
-- offer_versions — audit history for every imported/updated offer
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offer_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id     uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  snapshot     jsonb NOT NULL,
  change_note  text,
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, version)
);

CREATE INDEX IF NOT EXISTS offer_versions_offer_idx ON offer_versions(offer_id, version DESC);

-- Capture a snapshot on every offer change (idempotent imports included).
CREATE OR REPLACE FUNCTION capture_offer_version() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  next_version integer;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
    FROM offer_versions WHERE offer_id = NEW.id;

  INSERT INTO offer_versions (offer_id, version, snapshot, change_note)
  VALUES (
    NEW.id,
    next_version,
    to_jsonb(NEW),
    CASE TG_OP
      WHEN 'INSERT' THEN 'created by ' || NEW.source_type
      ELSE 'updated by ' || NEW.source_type
    END
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER offers_version_capture AFTER INSERT OR UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION capture_offer_version();
