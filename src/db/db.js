const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const dbPath = path.resolve(config.db.path);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Apply schema (idempotent — CREATE TABLE IF NOT EXISTS)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// ── Users ─────────────────────────────────────────────────────────────────────

const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const getUserById    = db.prepare('SELECT * FROM users WHERE id = ?');

const createUser = db.prepare(`
  INSERT INTO users (id, email, password_hash, brand_color, logo_url)
  VALUES (@id, @email, @password_hash, @brand_color, @logo_url)
`);

const updateUserBranding = db.prepare(`
  UPDATE users
  SET brand_color = @brand_color,
      logo_url    = @logo_url,
      updated_at  = unixepoch()
  WHERE id = @id
`);

const updateUserPlan = db.prepare(`
  UPDATE users
  SET plan = @plan,
      stripe_customer_id     = @stripe_customer_id,
      stripe_subscription_id = @stripe_subscription_id,
      updated_at             = unixepoch()
  WHERE id = @id
`);

// ── API Keys ──────────────────────────────────────────────────────────────────

const getApiKeyByHash = db.prepare(`
  SELECT ak.*, u.id AS user_id, u.email, u.plan,
         u.brand_color, u.logo_url
  FROM api_keys ak
  JOIN users u ON u.id = ak.user_id
  WHERE ak.key_hash = ?
`);

const createApiKey = db.prepare(`
  INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name)
  VALUES (@id, @user_id, @key_hash, @key_prefix, @name)
`);

const touchApiKey = db.prepare(`
  UPDATE api_keys SET last_used_at = unixepoch() WHERE key_hash = ?
`);

const listApiKeys = db.prepare(`
  SELECT id, key_prefix, name, created_at, last_used_at
  FROM api_keys WHERE user_id = ? ORDER BY created_at DESC
`);

const deleteApiKey = db.prepare(`
  DELETE FROM api_keys WHERE id = ? AND user_id = ?
`);

// ── Templates ─────────────────────────────────────────────────────────────────

const getTemplateById  = db.prepare('SELECT * FROM templates WHERE id = ?');
const listPublicTemplates = db.prepare('SELECT * FROM templates WHERE is_public = 1 ORDER BY id');

const upsertTemplate = db.prepare(`
  INSERT INTO templates (id, name, category, description, html_path, variables, width, height, is_public)
  VALUES (@id, @name, @category, @description, @html_path, @variables, @width, @height, @is_public)
  ON CONFLICT(id) DO UPDATE SET
    name        = excluded.name,
    category    = excluded.category,
    description = excluded.description,
    html_path   = excluded.html_path,
    variables   = excluded.variables,
    width       = excluded.width,
    height      = excluded.height,
    is_public   = excluded.is_public
`);

// ── User Templates (tokens) ───────────────────────────────────────────────────

const getUserTemplateByToken = db.prepare(`
  SELECT ut.*,
         u.brand_color  AS user_brand_color,
         u.logo_url     AS user_logo_url,
         u.plan         AS user_plan,
         t.width        AS tpl_width,
         t.height       AS tpl_height
  FROM user_templates ut
  JOIN users     u ON u.id  = ut.user_id
  JOIN templates t ON t.id  = ut.template_id
  WHERE ut.token = ?
`);

const getUserTemplateById = db.prepare(`
  SELECT * FROM user_templates WHERE id = ? AND user_id = ?
`);

const createUserTemplate = db.prepare(`
  INSERT INTO user_templates (id, user_id, template_id, token, brand_color, logo_url, domain, label)
  VALUES (@id, @user_id, @template_id, @token, @brand_color, @logo_url, @domain, @label)
`);

const listUserTemplates = db.prepare(`
  SELECT ut.*, t.name AS template_name, t.category
  FROM user_templates ut
  JOIN templates t ON t.id = ut.template_id
  WHERE ut.user_id = ? ORDER BY ut.created_at DESC
`);

const updateUserTemplate = db.prepare(`
  UPDATE user_templates
  SET brand_color = @brand_color,
      logo_url    = @logo_url,
      domain      = @domain,
      label       = @label
  WHERE id = @id AND user_id = @user_id
`);

const deleteUserTemplate = db.prepare(`
  DELETE FROM user_templates WHERE id = ? AND user_id = ?
`);

// ── Usage ─────────────────────────────────────────────────────────────────────

const insertUsage = db.prepare(`
  INSERT INTO usage (user_id, template_id, cached)
  VALUES (@user_id, @template_id, @cached)
`);

// Upsert monthly aggregates
const upsertUsageMonthly = db.prepare(`
  INSERT INTO usage_monthly (user_id, month, render_count, cached_count)
  VALUES (@user_id, @month, @render_count, @cached_count)
  ON CONFLICT(user_id, month) DO UPDATE SET
    render_count = render_count + excluded.render_count,
    cached_count = cached_count + excluded.cached_count
`);

const getUsageMonthly = db.prepare(`
  SELECT render_count, cached_count
  FROM usage_monthly
  WHERE user_id = ? AND month = ?
`);

// Convenience: record one render (fresh or cached) and update monthly counter
const recordRender = db.transaction((userId, templateId, cached) => {
  insertUsage.run({ user_id: userId, template_id: templateId, cached: cached ? 1 : 0 });
  const month = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  upsertUsageMonthly.run({
    user_id:      userId,
    month,
    render_count: cached ? 0 : 1,
    cached_count: cached ? 1 : 0,
  });
});

// ── Password Reset ────────────────────────────────────────────────────────────

const createResetToken = db.prepare(`
  INSERT INTO password_reset_tokens (token, user_id, expires_at)
  VALUES (@token, @user_id, @expires_at)
`);

const getResetToken = db.prepare(`
  SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0
`);

const markResetTokenUsed = db.prepare(`
  UPDATE password_reset_tokens SET used = 1 WHERE token = ?
`);

const updateUserPassword = db.prepare(`
  UPDATE users SET password_hash = @password_hash, updated_at = unixepoch() WHERE id = @id
`);

module.exports = {
  db,
  // users
  getUserByEmail, getUserById, createUser, updateUserBranding, updateUserPlan,
  // api keys
  getApiKeyByHash, createApiKey, touchApiKey, listApiKeys, deleteApiKey,
  // templates
  getTemplateById, listPublicTemplates, upsertTemplate,
  // user_templates
  getUserTemplateByToken, getUserTemplateById,
  createUserTemplate, listUserTemplates, updateUserTemplate, deleteUserTemplate,
  // usage
  recordRender, getUsageMonthly,
  // password reset
  createResetToken, getResetToken, markResetTokenUsed, updateUserPassword,
};
