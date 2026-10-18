-- =============================================================================
-- 0010 — Offer constraint corrections
-- =============================================================================

-- 1. A rejected record must be storable even when it violates a business rule.
--    Previously the coupon-code CHECK made it impossible to persist the very
--    offers the validator rejected *for* having no code, so they vanished
--    instead of appearing in the moderation queue with a reason.
--    The relaxation applies only to publication_status = 'rejected': anything
--    that is, or ever becomes, publishable still needs a real code.
ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_code_type_chk;

ALTER TABLE offers ADD CONSTRAINT offers_code_type_chk CHECK (
  offer_type <> 'coupon_code'
  OR (coupon_code IS NOT NULL AND length(btrim(coupon_code)) > 0)
  OR publication_status = 'rejected'
);

COMMENT ON CONSTRAINT offers_code_type_chk ON offers IS
  'A coupon_code offer must carry a code, unless it is rejected — rejected records are kept so the moderation queue can explain why they failed.';

-- 2. Guarantee that a rejected offer can never silently become published while
--    still missing its code.
CREATE OR REPLACE FUNCTION guard_published_offer_completeness() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.publication_status IN ('published', 'approved', 'scheduled') THEN
    IF NEW.offer_type = 'coupon_code'
       AND (NEW.coupon_code IS NULL OR length(btrim(NEW.coupon_code)) = 0) THEN
      RAISE EXCEPTION
        'Cannot set publication_status=% on a coupon_code offer without a code (offer %)',
        NEW.publication_status, NEW.id;
    END IF;
    IF NEW.destination_url IS NULL OR NEW.destination_url !~ '^https?://' THEN
      RAISE EXCEPTION
        'Cannot publish an offer without a valid destination_url (offer %)', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offers_publish_guard ON offers;
CREATE TRIGGER offers_publish_guard BEFORE INSERT OR UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION guard_published_offer_completeness();

COMMENT ON TRIGGER offers_publish_guard ON offers IS
  'Defence in depth: even if application logic misjudges an offer, the database refuses to publish one that lacks a code or a usable destination.';
