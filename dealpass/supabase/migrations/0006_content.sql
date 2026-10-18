-- =============================================================================
-- 0006 — Editorial pages, guides/blog, SEO redirects
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- -----------------------------------------------------------------------------
-- pages — editable editorial & legal content
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  page_type     text NOT NULL DEFAULT 'editorial',
  status        text NOT NULL DEFAULT 'draft',
  show_in_footer boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pages_type_chk CHECK (
    page_type IN ('editorial','legal','guide','faq')
  ),
  CONSTRAINT pages_status_chk CHECK (status IN ('draft','published','archived'))
);

CREATE TRIGGER pages_set_updated_at BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS page_translations (
  page_id       uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  title         text NOT NULL,
  body          text NOT NULL,
  seo_title     text,
  seo_description text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, language_code),
  CONSTRAINT page_translations_lang_chk CHECK (language_code IN ('fr','en','ar'))
);

CREATE TRIGGER page_translations_set_updated_at BEFORE UPDATE ON page_translations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- posts — blog / buying guides (unique original content, SEO surface)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  status         text NOT NULL DEFAULT 'draft',
  cover_image_url text,
  author_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  published_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_status_chk CHECK (status IN ('draft','published','archived'))
);

CREATE INDEX IF NOT EXISTS posts_published_idx ON posts(published_at DESC) WHERE status = 'published';

CREATE TRIGGER posts_set_updated_at BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS post_translations (
  post_id         uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  language_code   text NOT NULL,
  title           text NOT NULL,
  excerpt         text,
  body            text NOT NULL,
  seo_title       text,
  seo_description text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, language_code),
  CONSTRAINT post_translations_lang_chk CHECK (language_code IN ('fr','en','ar'))
);

CREATE TRIGGER post_translations_set_updated_at BEFORE UPDATE ON post_translations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- redirects — SEO redirect management (301/302) with hit counting
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS redirects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path    text NOT NULL UNIQUE,
  to_path      text NOT NULL,
  status_code  integer NOT NULL DEFAULT 301,
  hits         integer NOT NULL DEFAULT 0,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redirects_status_chk CHECK (status_code IN (301, 302, 307, 308)),
  CONSTRAINT redirects_no_loop_chk CHECK (from_path <> to_path)
);

CREATE TRIGGER redirects_set_updated_at BEFORE UPDATE ON redirects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
