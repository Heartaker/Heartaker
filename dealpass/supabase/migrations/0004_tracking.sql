-- =============================================================================
-- 0004 — Click tracking, conversions, reports, favourites, link checks, search
-- =============================================================================

-- -----------------------------------------------------------------------------
-- clicks
-- -----------------------------------------------------------------------------
-- Privacy by design: no raw IP is ever stored. `session_hash` is a salted,
-- rotating, privacy-preserving identifier; `ip_hash` is only populated when
-- fraud prevention requires it and is purged by the retention job.
CREATE TABLE IF NOT EXISTS clicks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id             uuid REFERENCES offers(id) ON DELETE SET NULL,
  merchant_id          uuid REFERENCES merchants(id) ON DELETE SET NULL,
  session_hash         text NOT NULL,
  event_type           text NOT NULL DEFAULT 'click',
  country_code         text,
  language_code        text,
  device_type          text NOT NULL DEFAULT 'unknown',
  referrer             text,
  campaign             text,
  sub_id               text NOT NULL,
  ip_hash              text,
  clicked_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clicks_event_chk CHECK (
    event_type IN ('view','code_reveal','code_copy','click','newsletter_click')
  ),
  CONSTRAINT clicks_device_chk CHECK (
    device_type IN ('mobile','tablet','desktop','bot','unknown')
  )
);

CREATE INDEX IF NOT EXISTS clicks_offer_idx    ON clicks(offer_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS clicks_merchant_idx ON clicks(merchant_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS clicks_sub_idx      ON clicks(sub_id);
CREATE INDEX IF NOT EXISTS clicks_time_idx     ON clicks(clicked_at DESC);
CREATE INDEX IF NOT EXISTS clicks_country_idx  ON clicks(country_code, clicked_at DESC);

COMMENT ON COLUMN clicks.sub_id IS
  'Opaque tracking identifier sent to the affiliate network. Contains no personal data — see docs/SECURITY.md.';

-- -----------------------------------------------------------------------------
-- conversions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id             uuid REFERENCES affiliate_networks(id) ON DELETE SET NULL,
  merchant_id            uuid REFERENCES merchants(id) ON DELETE SET NULL,
  offer_id               uuid REFERENCES offers(id) ON DELETE SET NULL,
  external_transaction_id text,
  click_sub_id           text,
  order_value            numeric(12,2),
  commission_amount      numeric(12,2),
  currency               text NOT NULL DEFAULT 'EUR',
  conversion_status      text NOT NULL DEFAULT 'pending',
  transaction_at         timestamptz,
  validated_at           timestamptz,
  raw_payload            jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversions_status_chk CHECK (
    conversion_status IN ('pending','approved','rejected','cancelled','refunded')
  )
);

-- Idempotency: the same external transaction may never be imported twice.
CREATE UNIQUE INDEX IF NOT EXISTS conversions_external_uq
  ON conversions(network_id, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversions_offer_idx    ON conversions(offer_id);
CREATE INDEX IF NOT EXISTS conversions_merchant_idx ON conversions(merchant_id);
CREATE INDEX IF NOT EXISTS conversions_status_idx   ON conversions(conversion_status);
CREATE INDEX IF NOT EXISTS conversions_time_idx     ON conversions(transaction_at DESC);

CREATE TRIGGER conversions_set_updated_at BEFORE UPDATE ON conversions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- coupon_reports — visitor reports of invalid/expired coupons
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupon_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id              uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  reason                text NOT NULL,
  comment               text,
  reporter_email        text,
  reporter_hash         text,
  status                text NOT NULL DEFAULT 'open',
  resolution_note       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  reviewed_at           timestamptz,
  resolved_at           timestamptz,
  resolved_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT coupon_reports_reason_chk CHECK (
    reason IN ('expired','code_invalid','code_not_working','misleading_terms',
               'broken_link','not_available_in_country','other')
  ),
  CONSTRAINT coupon_reports_status_chk CHECK (
    status IN ('open','reviewing','resolved','dismissed')
  )
);

CREATE INDEX IF NOT EXISTS coupon_reports_offer_idx   ON coupon_reports(offer_id);
CREATE INDEX IF NOT EXISTS coupon_reports_status_idx  ON coupon_reports(status, created_at DESC);

-- -----------------------------------------------------------------------------
-- favorites
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  offer_id   uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, offer_id)
);

CREATE INDEX IF NOT EXISTS favorites_offer_idx ON favorites(offer_id);

-- -----------------------------------------------------------------------------
-- link_checks — results of the daily link-validation workflow
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS link_checks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id          uuid REFERENCES offers(id) ON DELETE CASCADE,
  url               text NOT NULL,
  http_status       integer,
  final_url         text,
  outcome           text NOT NULL,
  response_ms       integer,
  checked_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT link_checks_outcome_chk CHECK (
    outcome IN ('ok','redirect','client_error','server_error','timeout',
                'rate_limited','bot_protected','dns_error','unknown')
  )
);

CREATE INDEX IF NOT EXISTS link_checks_offer_idx ON link_checks(offer_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS link_checks_outcome_idx ON link_checks(outcome, checked_at DESC);

-- -----------------------------------------------------------------------------
-- search_queries — aggregate, non-personal search analytics
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_queries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query         text NOT NULL,
  language_code text,
  country_code  text,
  result_count  integer NOT NULL DEFAULT 0,
  session_hash  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_queries_query_idx  ON search_queries(query);
CREATE INDEX IF NOT EXISTS search_queries_time_idx   ON search_queries(created_at DESC);
