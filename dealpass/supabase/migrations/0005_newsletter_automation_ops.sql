-- =============================================================================
-- 0005 — Newsletter subscribers, sync logs, audit logs, notifications, settings
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- -----------------------------------------------------------------------------
-- newsletter_subscribers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text NOT NULL UNIQUE,
  brevo_contact_id     text,
  language_code        text NOT NULL DEFAULT 'fr',
  country_code         text NOT NULL DEFAULT 'DZ',
  preferred_categories uuid[] NOT NULL DEFAULT '{}',
  preferred_merchants  uuid[] NOT NULL DEFAULT '{}',
  delivery_frequency   text NOT NULL DEFAULT 'weekly',
  consent_status       text NOT NULL DEFAULT 'pending',
  consent_source       text NOT NULL DEFAULT 'website_form',
  consent_at           timestamptz NOT NULL DEFAULT now(),
  confirmation_token_hash text,
  confirmation_sent_at timestamptz,
  confirmed_at         timestamptz,
  unsubscribed_at      timestamptz,
  unsubscribe_token_hash text,
  bounce_count         integer NOT NULL DEFAULT 0,
  complaint_count      integer NOT NULL DEFAULT 0,
  last_campaign_at     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscribers_language_chk CHECK (language_code IN ('fr','en','ar')),
  CONSTRAINT subscribers_country_chk  CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT subscribers_frequency_chk CHECK (delivery_frequency IN ('daily','weekly','monthly')),
  CONSTRAINT subscribers_consent_chk CHECK (
    consent_status IN ('pending','confirmed','unsubscribed','bounced','complained','suppressed')
  )
);

CREATE INDEX IF NOT EXISTS subscribers_status_idx   ON newsletter_subscribers(consent_status);
CREATE INDEX IF NOT EXISTS subscribers_confirmed_idx ON newsletter_subscribers(confirmed_at)
  WHERE confirmed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscribers_lang_country_idx
  ON newsletter_subscribers(language_code, country_code)
  WHERE consent_status = 'confirmed';

-- A subscriber is only marketable once double opt-in completed. Enforced in the
-- database so no code path (n8n, admin, API) can accidentally mail a pending
-- contact.
CREATE OR REPLACE FUNCTION assert_marketable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.consent_status = 'confirmed' AND NEW.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'consent_status=confirmed requires confirmed_at (double opt-in not completed)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER subscribers_consent_guard BEFORE INSERT OR UPDATE ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION assert_marketable();

COMMENT ON COLUMN newsletter_subscribers.confirmation_token_hash IS
  'Only the hash of the double opt-in token is stored; the token itself is emailed and never persisted.';

CREATE TRIGGER subscribers_set_updated_at BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- sync_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id      uuid REFERENCES affiliate_networks(id) ON DELETE CASCADE,
  workflow_name   text NOT NULL,
  execution_id    text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  status          text NOT NULL DEFAULT 'running',
  imported_count  integer NOT NULL DEFAULT 0,
  updated_count   integer NOT NULL DEFAULT 0,
  rejected_count  integer NOT NULL DEFAULT 0,
  expired_count   integer NOT NULL DEFAULT 0,
  warning_count   integer NOT NULL DEFAULT 0,
  error_message   text,
  error_details   jsonb,
  CONSTRAINT sync_logs_status_chk CHECK (
    status IN ('running','success','partial','failed','cancelled')
  )
);

CREATE INDEX IF NOT EXISTS sync_logs_network_idx ON sync_logs(network_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sync_logs_status_idx  ON sync_logs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS sync_logs_workflow_idx ON sync_logs(workflow_name, started_at DESC);

COMMENT ON COLUMN sync_logs.error_message IS
  'Must be sanitised by the connector before being written — see sanitizeError() in src/lib/connectors/errors.ts.';

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_email   text,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     text,
  previous_value jsonb,
  new_value     jsonb,
  request_id    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_idx    ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx  ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_time_idx    ON audit_logs(created_at DESC);

-- -----------------------------------------------------------------------------
-- notifications — in-app administrator alerts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type   text NOT NULL,
  severity            text NOT NULL DEFAULT 'info',
  title               text NOT NULL,
  message             text NOT NULL,
  related_entity_type text,
  related_entity_id   text,
  status              text NOT NULL DEFAULT 'unread',
  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  resolved_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT notifications_type_chk CHECK (
    notification_type IN ('sync_failure','connector_error','broken_link','review_queue',
                          'report_received','expiration_spike','security','system')
  ),
  CONSTRAINT notifications_severity_chk CHECK (
    severity IN ('info','warning','critical')
  ),
  CONSTRAINT notifications_status_chk CHECK (
    status IN ('unread','read','resolved','dismissed')
  )
);

CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_severity_idx ON notifications(severity, created_at DESC);

-- -----------------------------------------------------------------------------
-- site_settings
-- -----------------------------------------------------------------------------
-- Brand identity, publication thresholds and runtime configuration.
-- NEVER store API secrets here — there is a guard trigger below.
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key   text NOT NULL,
  environment   text NOT NULL DEFAULT 'all',
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (setting_key, environment)
);

CREATE OR REPLACE FUNCTION guard_site_settings_secrets() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  forbidden text[] := ARRAY['key','secret','token','password','api_key','apikey','private'];
  k text;
  f text;
BEGIN
  k := lower(NEW.setting_key);
  FOREACH f IN ARRAY forbidden LOOP
    IF k LIKE '%' || f || '%' THEN
      RAISE EXCEPTION
        'Refusing to store credential-like setting "%" in site_settings. Use environment variables.',
        NEW.setting_key;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER site_settings_no_secrets BEFORE INSERT OR UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION guard_site_settings_secrets();

CREATE TRIGGER site_settings_set_updated_at BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE site_settings IS
  'Non-secret runtime configuration (brand identity, thresholds, feature flags). A trigger blocks any key that looks like a credential.';
