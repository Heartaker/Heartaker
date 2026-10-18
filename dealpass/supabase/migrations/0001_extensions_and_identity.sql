-- =============================================================================
-- 0001 — Extensions, roles, permissions, profiles
-- DealPass · PostgreSQL 15+ (runs unmodified on Supabase and on PGlite)
-- =============================================================================

-- Extensions are optional: if a hosting provider forbids one, we log and
-- continue rather than aborting the whole migration.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pgcrypto unavailable: %', SQLERRM; END $$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_trgm unavailable (typo-tolerant search disabled): %', SQLERRM; END $$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'unaccent unavailable: %', SQLERRM; END $$;

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- roles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  description   text,
  rank          integer NOT NULL DEFAULT 100,   -- lower = more privileged
  is_system     boolean NOT NULL DEFAULT true,  -- system roles cannot be deleted
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE roles IS
  'Administrative roles. Seeded with super_admin, admin, editor, reviewer, analyst, support, registered_user.';

-- -----------------------------------------------------------------------------
-- permissions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  resource    text NOT NULL,
  action      text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permissions_resource_action_chk CHECK (
    resource IN ('offers','merchants','categories','integrations','users','newsletters','analytics','settings','audit_logs','pages','connectors')
  ),
  CONSTRAINT permissions_action_chk CHECK (
    action IN ('read','create','update','delete','publish','review','export','sync','configure')
  )
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- Extends Supabase auth.users. On PGlite (local dev) the same table is used by
-- the built-in credential auth, so application code is identical everywhere.
CREATE TABLE IF NOT EXISTS profiles (
  id                 uuid PRIMARY KEY,
  email              text NOT NULL UNIQUE,
  display_name       text,
  role_id            uuid REFERENCES roles(id) ON DELETE SET NULL,
  preferred_language text NOT NULL DEFAULT 'fr',
  preferred_country  text NOT NULL DEFAULT 'DZ',
  preferred_currency text NOT NULL DEFAULT 'DZD',
  email_verified_at  timestamptz,
  password_hash      text,          -- local credential auth only; NULL for SSO/Supabase auth
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT profiles_language_chk CHECK (preferred_language IN ('fr','en','ar')),
  CONSTRAINT profiles_country_chk  CHECK (preferred_country  ~ '^[A-Z]{2}$'),
  CONSTRAINT profiles_currency_chk CHECK (preferred_currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS profiles_role_idx       ON profiles(role_id);
CREATE INDEX IF NOT EXISTS profiles_deleted_idx    ON profiles(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON COLUMN profiles.password_hash IS
  'scrypt hash, local dev auth only. Production should use Supabase Auth or another managed IdP.';

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- sessions — server-side session store for the built-in auth.
-- Stores a hash of the token, never the token itself.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  user_agent    text,
  ip_hash       text   -- privacy-preserving hash only, never a raw IP
);

CREATE INDEX IF NOT EXISTS sessions_user_idx    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
