-- =============================================================================
-- 0002 — Affiliate networks, merchants, categories
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- -----------------------------------------------------------------------------
-- affiliate_networks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_networks (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text NOT NULL,
  slug                      text NOT NULL UNIQUE,
  integration_type          text NOT NULL DEFAULT 'api',
  status                    text NOT NULL DEFAULT 'disabled',
  synchronization_frequency text NOT NULL DEFAULT 'every_6_hours',
  config                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_env              text[] NOT NULL DEFAULT '{}',
  compliance_notes          text,
  last_sync_at              timestamptz,
  last_success_at           timestamptz,
  health_status             text NOT NULL DEFAULT 'unknown',
  is_demo                   boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT networks_integration_chk CHECK (
    integration_type IN ('api','feed','csv','webhook','manual','demo')
  ),
  CONSTRAINT networks_status_chk CHECK (
    status IN ('enabled','disabled','pending_approval','error','suspended')
  ),
  CONSTRAINT networks_frequency_chk CHECK (
    synchronization_frequency IN ('hourly','every_3_hours','every_6_hours','every_12_hours','daily','weekly','manual')
  ),
  CONSTRAINT networks_health_chk CHECK (
    health_status IN ('healthy','degraded','failing','unknown','not_configured')
  )
);

COMMENT ON COLUMN affiliate_networks.required_env IS
  'Environment variable names this connector needs. Used to show a masked configured/not-configured status without ever displaying the secret.';
COMMENT ON COLUMN affiliate_networks.config IS
  'Non-secret configuration only. Secrets live in the environment and are never persisted here.';

CREATE TRIGGER networks_set_updated_at BEFORE UPDATE ON affiliate_networks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- merchants
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchants (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id            text,
  network_id             uuid REFERENCES affiliate_networks(id) ON DELETE SET NULL,
  name                   text NOT NULL,
  slug                   text NOT NULL UNIQUE,
  logo_url               text,
  short_description      text,
  full_description       text,
  official_website_url   text,
  affiliate_program_url  text,
  country_codes          text[] NOT NULL DEFAULT '{}',
  supported_languages    text[] NOT NULL DEFAULT '{fr,en,ar}',
  default_currency       text NOT NULL DEFAULT 'EUR',
  status                 text NOT NULL DEFAULT 'draft',
  is_verified            boolean NOT NULL DEFAULT false,
  verified_at            timestamptz,
  vertical               text NOT NULL DEFAULT 'shopping',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz,
  CONSTRAINT merchants_status_chk    CHECK (status IN ('draft','active','suspended','archived')),
  CONSTRAINT merchants_vertical_chk  CHECK (vertical IN ('shopping','travel','courses','software')),
  CONSTRAINT merchants_currency_chk  CHECK (default_currency ~ '^[A-Z]{3}$')
);

-- One external id per network must map to exactly one merchant.
CREATE UNIQUE INDEX IF NOT EXISTS merchants_external_uq
  ON merchants(network_id, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS merchants_network_idx  ON merchants(network_id);
CREATE INDEX IF NOT EXISTS merchants_status_idx   ON merchants(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS merchants_vertical_idx ON merchants(vertical) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS merchants_countries_idx ON merchants USING gin(country_codes);

CREATE TRIGGER merchants_set_updated_at BEFORE UPDATE ON merchants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     uuid REFERENCES categories(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  icon          text,
  description   text,
  seo_title     text,
  seo_description text,
  display_order integer NOT NULL DEFAULT 100,
  status        text NOT NULL DEFAULT 'active',
  vertical      text NOT NULL DEFAULT 'shopping',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_status_chk   CHECK (status IN ('active','hidden','archived')),
  CONSTRAINT categories_vertical_chk CHECK (vertical IN ('shopping','travel','courses','software'))
);

CREATE INDEX IF NOT EXISTS categories_parent_idx  ON categories(parent_id);
CREATE INDEX IF NOT EXISTS categories_order_idx   ON categories(display_order, name);

CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- category_translations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS category_translations (
  category_id     uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  language_code   text NOT NULL,
  name            text NOT NULL,
  slug            text NOT NULL,
  description     text,
  seo_title       text,
  seo_description text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, language_code),
  CONSTRAINT category_translations_lang_chk CHECK (language_code IN ('fr','en','ar'))
);

CREATE UNIQUE INDEX IF NOT EXISTS category_translations_slug_uq
  ON category_translations(language_code, slug);

CREATE TRIGGER category_translations_set_updated_at BEFORE UPDATE ON category_translations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
