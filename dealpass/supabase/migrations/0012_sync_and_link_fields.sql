-- =============================================================================
-- 0012 — Sync-log "skipped" status and affiliate link-health columns
--
-- Two gaps surfaced the moment the automation workflows were wired up:
--
--   1. sync_logs.status had no way to say "deliberately not run". Without it,
--      a workflow that skipped a connector because its mapping is unverified
--      had to lie and claim success. That is exactly the kind of quiet
--      dishonesty this schema is designed to prevent.
--
--   2. Link validation had nowhere to record its findings. The workflow needs
--      to remember when it last checked a URL, what it saw, and how many
--      consecutive failures preceded this one.
-- =============================================================================

-- 1. Allow an honest "skipped" outcome ---------------------------------------
ALTER TABLE sync_logs DROP CONSTRAINT IF EXISTS sync_logs_status_chk;

ALTER TABLE sync_logs
  ADD CONSTRAINT sync_logs_status_chk
  CHECK (status IN ('running', 'success', 'partial', 'failed', 'cancelled', 'skipped'));

COMMENT ON COLUMN sync_logs.status IS
  'running | success | partial | failed | cancelled | skipped. "skipped" means the run deliberately did nothing (for example, a connector whose API mapping has not been verified).';

-- 2. Affiliate link health ---------------------------------------------------
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS link_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_status text NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS link_error_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offers_link_status_chk'
  ) THEN
    ALTER TABLE offers
      ADD CONSTRAINT offers_link_status_chk
      CHECK (link_status IN ('unchecked', 'ok', 'broken', 'unknown'));
  END IF;
END
$$;

COMMENT ON COLUMN offers.link_status IS
  'unchecked | ok | broken | unknown. "unknown" means the destination rejected the probe (403/429 are common for affiliate networks blocking datacenter IPs) — the link is probably fine for a real visitor.';
COMMENT ON COLUMN offers.link_error_count IS
  'Consecutive failed probes. Reset to zero on a success. An offer is suspended after three.';

CREATE INDEX IF NOT EXISTS offers_link_check_idx
  ON offers (link_last_checked_at NULLS FIRST)
  WHERE deleted_at IS NULL;

-- Expose link health in the admin list without a second query.
CREATE OR REPLACE VIEW offers_link_health AS
  SELECT
    o.id,
    o.slug,
    o.title,
    o.affiliate_url,
    o.link_status,
    o.link_error_count,
    o.link_last_checked_at,
    m.name AS merchant_name
  FROM offers o
  LEFT JOIN merchants m ON m.id = o.merchant_id
  WHERE o.deleted_at IS NULL
    AND o.link_status <> 'unchecked';
