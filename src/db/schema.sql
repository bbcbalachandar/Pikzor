PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                      TEXT    PRIMARY KEY,                 -- UUID
  email                   TEXT    NOT NULL UNIQUE,
  password_hash           TEXT    NOT NULL,
  plan                    TEXT    NOT NULL DEFAULT 'free',     -- free | pro | business
  logo_url                TEXT,
  brand_color             TEXT    NOT NULL DEFAULT '#3B82F6',
  stripe_customer_id      TEXT    UNIQUE,
  stripe_subscription_id  TEXT,
  created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at              INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── api_keys ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT    PRIMARY KEY,                            -- UUID
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash     TEXT    NOT NULL UNIQUE,
  key_prefix   TEXT    NOT NULL,                              -- first 12 chars of raw key (display only)
  name         TEXT    NOT NULL DEFAULT 'Default',
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER
);

-- ── templates ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id          TEXT    PRIMARY KEY,                             -- slug, e.g. 'og-blog-minimal'
  name        TEXT    NOT NULL,
  category    TEXT    NOT NULL DEFAULT 'blog',
  description TEXT,
  html_path   TEXT    NOT NULL,                               -- relative path to template.html
  variables   TEXT    NOT NULL DEFAULT '[]',                  -- JSON array of variable definitions
  width       INTEGER NOT NULL DEFAULT 1200,
  height      INTEGER NOT NULL DEFAULT 630,
  is_public   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── user_templates ────────────────────────────────────────────────────────────
-- One record per user-configured OG endpoint.
-- `token` is the short ID that goes in /og/:token URLs (e.g. "t_xK9mP2").
CREATE TABLE IF NOT EXISTS user_templates (
  id          TEXT    PRIMARY KEY,                             -- UUID
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT    NOT NULL REFERENCES templates(id),
  token       TEXT    NOT NULL UNIQUE,                        -- short URL token
  brand_color TEXT,                                           -- overrides user default
  logo_url    TEXT,                                           -- overrides user default
  domain      TEXT,
  label       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── usage ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT    NOT NULL,
  rendered_at INTEGER NOT NULL DEFAULT (unixepoch()),
  cached      INTEGER NOT NULL DEFAULT 0                      -- 0 = fresh, 1 = cache hit
);

-- ── usage_monthly ─────────────────────────────────────────────────────────────
-- Pre-aggregated monthly counters (avoids full scans on usage table).
CREATE TABLE IF NOT EXISTS usage_monthly (
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         TEXT    NOT NULL,                             -- 'YYYY-MM'
  render_count  INTEGER NOT NULL DEFAULT 0,
  cached_count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

-- ── password_reset_tokens ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token      TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);

-- ── indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_api_keys_hash         ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_user_templates_token  ON user_templates(token);
CREATE INDEX IF NOT EXISTS idx_user_templates_user   ON user_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_user            ON usage(user_id, rendered_at);
