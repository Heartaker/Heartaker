-- =============================================================================
-- 0008 — Row-Level Security
--
-- Model
--   • Application server code connects as the table OWNER, which bypasses RLS
--     (standard Postgres behaviour). All authorisation in the app is enforced
--     by the service layer + these policies as defence in depth.
--   • `anon` / `authenticated` are the roles exposed to any direct data API
--     (Supabase PostgREST, Data API, generated SDKs). RLS is the *only* thing
--     standing between them and the data, so it must be correct.
--   • `service_role` exists for server jobs and holds BYPASSRLS.
--
-- Testing
--   Every policy below is exercised by tests/rls.test.ts using
--   `SET LOCAL ROLE anon` / `SET LOCAL ROLE authenticated`.
-- =============================================================================

-- Roles (Supabase already has these; CREATE is a no-op there).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Session context helpers
-- -----------------------------------------------------------------------------
-- The application sets `dealpass.user_id` per transaction via
-- `SET LOCAL dealpass.user_id = '<uuid>'`. Supabase Auth populates
-- request.jwt.claims instead, so we fall back to that.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('dealpass.user_id', true), '')::uuid,
    NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  );
$$;

CREATE OR REPLACE FUNCTION app_current_role_slug() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT r.slug
  FROM profiles p JOIN roles r ON r.id = p.role_id
  WHERE p.id = app_current_user_id() AND p.deleted_at IS NULL;
$$;

-- Granular permission check, driven by the permissions table.
CREATE OR REPLACE FUNCTION app_has_permission(p_slug text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN role_permissions rp ON rp.role_id = p.role_id
    JOIN permissions perm    ON perm.id    = rp.permission_id
    WHERE p.id = app_current_user_id()
      AND p.deleted_at IS NULL
      AND perm.slug = p_slug
  );
$$;

-- Staff = anyone holding a role other than registered_user.
CREATE OR REPLACE FUNCTION app_is_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(app_current_role_slug(), 'registered_user') <> 'registered_user';
$$;

-- -----------------------------------------------------------------------------
-- offers
-- -----------------------------------------------------------------------------
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offers_public_read ON offers;
CREATE POLICY offers_public_read ON offers
  FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL
    AND publication_status = 'published'
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS offers_staff_read ON offers;
CREATE POLICY offers_staff_read ON offers
  FOR SELECT TO authenticated
  USING (app_has_permission('offers.read'));

DROP POLICY IF EXISTS offers_staff_write ON offers;
CREATE POLICY offers_staff_write ON offers
  FOR ALL TO authenticated
  USING (app_has_permission('offers.update'))
  WITH CHECK (app_has_permission('offers.update'));

DROP POLICY IF EXISTS offers_staff_delete ON offers;
CREATE POLICY offers_staff_delete ON offers
  FOR DELETE TO authenticated
  USING (app_has_permission('offers.delete'));

-- -----------------------------------------------------------------------------
-- merchants
-- -----------------------------------------------------------------------------
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchants_public_read ON merchants;
CREATE POLICY merchants_public_read ON merchants
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL AND status = 'active');

DROP POLICY IF EXISTS merchants_staff_write ON merchants;
CREATE POLICY merchants_staff_write ON merchants
  FOR ALL TO authenticated
  USING (app_has_permission('merchants.update'))
  WITH CHECK (app_has_permission('merchants.update'));

-- -----------------------------------------------------------------------------
-- categories + translations
-- -----------------------------------------------------------------------------
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_public_read ON categories;
CREATE POLICY categories_public_read ON categories
  FOR SELECT TO anon, authenticated USING (status = 'active');

DROP POLICY IF EXISTS categories_staff_write ON categories;
CREATE POLICY categories_staff_write ON categories
  FOR ALL TO authenticated
  USING (app_has_permission('categories.update'))
  WITH CHECK (app_has_permission('categories.update'));

ALTER TABLE category_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS category_translations_public_read ON category_translations;
CREATE POLICY category_translations_public_read ON category_translations
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS category_translations_staff_write ON category_translations;
CREATE POLICY category_translations_staff_write ON category_translations
  FOR ALL TO authenticated
  USING (app_has_permission('categories.update'))
  WITH CHECK (app_has_permission('categories.update'));

-- -----------------------------------------------------------------------------
-- offer_translations, offer_categories, offer_versions
-- -----------------------------------------------------------------------------
ALTER TABLE offer_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offer_translations_public_read ON offer_translations;
CREATE POLICY offer_translations_public_read ON offer_translations
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_translations.offer_id
        AND o.deleted_at IS NULL
        AND o.publication_status = 'published'
    )
  );

DROP POLICY IF EXISTS offer_translations_staff_write ON offer_translations;
CREATE POLICY offer_translations_staff_write ON offer_translations
  FOR ALL TO authenticated
  USING (app_has_permission('offers.update'))
  WITH CHECK (app_has_permission('offers.update'));

ALTER TABLE offer_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offer_categories_public_read ON offer_categories;
CREATE POLICY offer_categories_public_read ON offer_categories
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS offer_categories_staff_write ON offer_categories;
CREATE POLICY offer_categories_staff_write ON offer_categories
  FOR ALL TO authenticated
  USING (app_has_permission('offers.update'))
  WITH CHECK (app_has_permission('offers.update'));

-- Version history is staff-only, never public.
ALTER TABLE offer_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offer_versions_staff_only ON offer_versions;
CREATE POLICY offer_versions_staff_only ON offer_versions
  FOR SELECT TO authenticated
  USING (app_has_permission('offers.read'));

-- -----------------------------------------------------------------------------
-- profiles — a user sees only their own record
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self_read ON profiles;
CREATE POLICY profiles_self_read ON profiles
  FOR SELECT TO authenticated
  USING (id = app_current_user_id() OR app_has_permission('users.read'));

DROP POLICY IF EXISTS profiles_self_update ON profiles;
CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE TO authenticated
  USING (id = app_current_user_id() OR app_has_permission('users.update'))
  WITH CHECK (
    -- A user may edit their own preferences but must not escalate their role.
    id = app_current_user_id()
      AND role_id IS NOT DISTINCT FROM (SELECT p.role_id FROM profiles p WHERE p.id = app_current_user_id())
    OR app_has_permission('users.update')
  );

DROP POLICY IF EXISTS profiles_staff_delete ON profiles;
CREATE POLICY profiles_staff_delete ON profiles
  FOR DELETE TO authenticated
  USING (app_has_permission('users.delete'));

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_self_only ON sessions;
CREATE POLICY sessions_self_only ON sessions
  FOR SELECT TO authenticated
  USING (user_id = app_current_user_id());

-- -----------------------------------------------------------------------------
-- roles / permissions — readable by staff, writable by super_admin only
-- -----------------------------------------------------------------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_staff_read ON roles;
CREATE POLICY roles_staff_read ON roles
  FOR SELECT TO authenticated USING (app_is_staff());
DROP POLICY IF EXISTS roles_admin_write ON roles;
CREATE POLICY roles_admin_write ON roles
  FOR ALL TO authenticated
  USING (app_current_role_slug() = 'super_admin')
  WITH CHECK (app_current_role_slug() = 'super_admin');

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_staff_read ON permissions;
CREATE POLICY permissions_staff_read ON permissions
  FOR SELECT TO authenticated USING (app_is_staff());
DROP POLICY IF EXISTS permissions_admin_write ON permissions;
CREATE POLICY permissions_admin_write ON permissions
  FOR ALL TO authenticated
  USING (app_current_role_slug() = 'super_admin')
  WITH CHECK (app_current_role_slug() = 'super_admin');

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_staff_read ON role_permissions;
CREATE POLICY role_permissions_staff_read ON role_permissions
  FOR SELECT TO authenticated USING (app_is_staff());
DROP POLICY IF EXISTS role_permissions_admin_write ON role_permissions;
CREATE POLICY role_permissions_admin_write ON role_permissions
  FOR ALL TO authenticated
  USING (app_current_role_slug() = 'super_admin')
  WITH CHECK (app_current_role_slug() = 'super_admin');

-- -----------------------------------------------------------------------------
-- clicks / conversions — staff only, never public
-- -----------------------------------------------------------------------------
ALTER TABLE clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clicks_insert_public ON clicks;
CREATE POLICY clicks_insert_public ON clicks
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS clicks_staff_read ON clicks;
CREATE POLICY clicks_staff_read ON clicks
  FOR SELECT TO authenticated USING (app_has_permission('analytics.read'));

ALTER TABLE conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversions_staff_only ON conversions;
CREATE POLICY conversions_staff_only ON conversions
  FOR ALL TO authenticated
  USING (app_has_permission('analytics.read'))
  WITH CHECK (app_has_permission('integrations.sync'));

ALTER TABLE click_daily_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS click_daily_stats_staff_only ON click_daily_stats;
CREATE POLICY click_daily_stats_staff_only ON click_daily_stats
  FOR SELECT TO authenticated USING (app_has_permission('analytics.read'));

-- -----------------------------------------------------------------------------
-- favorites — strictly per-user
-- -----------------------------------------------------------------------------
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS favorites_owner_rw ON favorites;
CREATE POLICY favorites_owner_rw ON favorites
  FOR ALL TO authenticated
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

-- -----------------------------------------------------------------------------
-- coupon_reports — anyone may file a report; only staff may read or resolve
-- -----------------------------------------------------------------------------
ALTER TABLE coupon_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coupon_reports_insert_public ON coupon_reports;
CREATE POLICY coupon_reports_insert_public ON coupon_reports
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS coupon_reports_staff_rw ON coupon_reports;
CREATE POLICY coupon_reports_staff_rw ON coupon_reports
  FOR SELECT TO authenticated USING (app_has_permission('offers.review'));
DROP POLICY IF EXISTS coupon_reports_staff_update ON coupon_reports;
CREATE POLICY coupon_reports_staff_update ON coupon_reports
  FOR UPDATE TO authenticated
  USING (app_has_permission('offers.review'))
  WITH CHECK (app_has_permission('offers.review'));

-- -----------------------------------------------------------------------------
-- newsletter_subscribers — no public read at all (email addresses)
-- -----------------------------------------------------------------------------
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscribers_insert_public ON newsletter_subscribers;
CREATE POLICY subscribers_insert_public ON newsletter_subscribers
  FOR INSERT TO anon, authenticated WITH CHECK (consent_status = 'pending');
DROP POLICY IF EXISTS subscribers_staff_rw ON newsletter_subscribers;
CREATE POLICY subscribers_staff_rw ON newsletter_subscribers
  FOR ALL TO authenticated
  USING (app_has_permission('newsletters.read'))
  WITH CHECK (app_has_permission('newsletters.update'));

-- -----------------------------------------------------------------------------
-- affiliate_networks, sync_logs, audit_logs, notifications
-- -----------------------------------------------------------------------------
ALTER TABLE affiliate_networks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS networks_staff_rw ON affiliate_networks;
CREATE POLICY networks_staff_rw ON affiliate_networks
  FOR ALL TO authenticated
  USING (
    app_has_permission('integrations.read')
    OR app_has_permission('connectors.read')
  )
  WITH CHECK (app_has_permission('integrations.configure'));

ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_logs_staff_rw ON sync_logs;
CREATE POLICY sync_logs_staff_rw ON sync_logs
  FOR ALL TO authenticated
  USING (app_has_permission('integrations.read'))
  WITH CHECK (app_has_permission('integrations.sync'));

-- Audit logs are immutable: SELECT + INSERT only, no UPDATE/DELETE.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_read ON audit_logs;
CREATE POLICY audit_logs_read ON audit_logs
  FOR SELECT TO authenticated USING (app_has_permission('audit_logs.read'));
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_staff_rw ON notifications;
CREATE POLICY notifications_staff_rw ON notifications
  FOR ALL TO authenticated
  USING (app_is_staff())
  WITH CHECK (app_is_staff());

ALTER TABLE link_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS link_checks_staff_rw ON link_checks;
CREATE POLICY link_checks_staff_rw ON link_checks
  FOR ALL TO authenticated
  USING (app_has_permission('integrations.read'))
  WITH CHECK (app_has_permission('integrations.sync'));

ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS search_queries_insert ON search_queries;
CREATE POLICY search_queries_insert ON search_queries
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS search_queries_staff_read ON search_queries;
CREATE POLICY search_queries_staff_read ON search_queries
  FOR SELECT TO authenticated USING (app_has_permission('analytics.read'));

-- -----------------------------------------------------------------------------
-- site_settings — public may read brand settings only
-- -----------------------------------------------------------------------------
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settings_public_brand_read ON site_settings;
CREATE POLICY settings_public_brand_read ON site_settings
  FOR SELECT TO anon, authenticated
  USING (setting_key IN ('brand', 'localization', 'features'));
DROP POLICY IF EXISTS settings_staff_rw ON site_settings;
CREATE POLICY settings_staff_rw ON site_settings
  FOR ALL TO authenticated
  USING (app_has_permission('settings.read'))
  WITH CHECK (app_has_permission('settings.configure'));

-- -----------------------------------------------------------------------------
-- pages / posts / redirects
-- -----------------------------------------------------------------------------
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pages_public_read ON pages;
CREATE POLICY pages_public_read ON pages
  FOR SELECT TO anon, authenticated USING (status = 'published');
DROP POLICY IF EXISTS pages_staff_rw ON pages;
CREATE POLICY pages_staff_rw ON pages
  FOR ALL TO authenticated
  USING (app_has_permission('pages.update') OR app_has_permission('settings.configure'))
  WITH CHECK (app_has_permission('pages.update') OR app_has_permission('settings.configure'));

ALTER TABLE page_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS page_translations_public_read ON page_translations;
CREATE POLICY page_translations_public_read ON page_translations
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM pages p WHERE p.id = page_translations.page_id AND p.status = 'published'));
DROP POLICY IF EXISTS page_translations_staff_rw ON page_translations;
CREATE POLICY page_translations_staff_rw ON page_translations
  FOR ALL TO authenticated
  USING (app_has_permission('pages.update') OR app_has_permission('settings.configure'))
  WITH CHECK (app_has_permission('pages.update') OR app_has_permission('settings.configure'));

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posts_public_read ON posts;
CREATE POLICY posts_public_read ON posts
  FOR SELECT TO anon, authenticated USING (status = 'published');
DROP POLICY IF EXISTS posts_staff_rw ON posts;
CREATE POLICY posts_staff_rw ON posts
  FOR ALL TO authenticated
  USING (app_has_permission('pages.update') OR app_has_permission('settings.configure'))
  WITH CHECK (app_has_permission('pages.update') OR app_has_permission('settings.configure'));

ALTER TABLE post_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_translations_public_read ON post_translations;
CREATE POLICY post_translations_public_read ON post_translations
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_translations.post_id AND p.status = 'published'));
DROP POLICY IF EXISTS post_translations_staff_rw ON post_translations;
CREATE POLICY post_translations_staff_rw ON post_translations
  FOR ALL TO authenticated
  USING (app_has_permission('pages.update') OR app_has_permission('settings.configure'))
  WITH CHECK (app_has_permission('pages.update') OR app_has_permission('settings.configure'));

ALTER TABLE redirects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS redirects_staff_rw ON redirects;
CREATE POLICY redirects_staff_rw ON redirects
  FOR ALL TO authenticated
  USING (app_has_permission('settings.configure'))
  WITH CHECK (app_has_permission('settings.configure'));

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
GRANT SELECT ON offers, merchants, categories, category_translations,
                 offer_translations, offer_categories, site_settings,
                 pages, page_translations, posts, post_translations TO anon;
GRANT INSERT ON clicks, coupon_reports, newsletter_subscribers, search_queries TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- Audit logs must never be updated or deleted, even by staff.
REVOKE UPDATE, DELETE ON audit_logs FROM authenticated;
