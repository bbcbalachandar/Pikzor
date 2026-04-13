const express  = require('express');
const crypto   = require('crypto');
const router   = express.Router();
const bcrypt   = require('bcrypt');

const db                = require('../db/db');
const { requireJwt, signJwt } = require('../middleware/auth');
const { generateApiKey, generateShortToken } = require('../utils/tokens');
const { byIp }                = require('../middleware/rateLimit');
const config            = require('../config');

const BCRYPT_ROUNDS = 12;

// Plan limits (renders / month)
const PLAN_LIMITS = { free: 50, pro: 2000, business: Infinity };

// ── POST /auth/signup ─────────────────────────────────────────────────────────
router.post('/signup', byIp, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const existing = db.getUserByEmail.get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const id = crypto.randomUUID();

    db.createUser.run({
      id,
      email:         email.toLowerCase(),
      password_hash: passwordHash,
      brand_color:   '#3B82F6',
      logo_url:      null,
    });

    const user = db.getUserById.get(id);
    const token = signJwt(user);

    res.status(201).json({ token, user: safeUser(user) });

    // Fire-and-forget welcome email
    const emailService = require('../services/email');
    emailService.sendWelcome(user.email).catch(() => {});
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error('[auth/signup]', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', byIp, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = db.getUserByEmail.get(email.toLowerCase());
  if (!user) {
    // Timing-safe: hash a dummy value so response time doesn't leak user existence
    await bcrypt.hash(password, BCRYPT_ROUNDS);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.json({ token: signJwt(user), user: safeUser(user) });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', requireJwt, (req, res) => {
  const user = db.getUserById.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(safeUser(user));
});

// ── POST /auth/api-key ────────────────────────────────────────────────────────
// Generate a new API key. The plaintext is returned ONCE — it is never stored.
router.post('/api-key', requireJwt, (req, res) => {
  const { name = 'Default' } = req.body;
  const { raw, hash, prefix } = generateApiKey();
  const id = crypto.randomUUID();

  db.createApiKey.run({
    id,
    user_id:    req.user.id,
    key_hash:   hash,
    key_prefix: prefix,
    name,
  });

  res.status(201).json({
    key:    raw,   // shown ONCE
    prefix,
    name,
    id,
    warning: 'Save this key — it will not be shown again.',
  });
});

// ── GET /auth/api-keys ────────────────────────────────────────────────────────
router.get('/api-keys', requireJwt, (req, res) => {
  const keys = db.listApiKeys.all(req.user.id);
  res.json(keys);
});

// ── DELETE /auth/api-key/:id ──────────────────────────────────────────────────
router.delete('/api-key/:id', requireJwt, (req, res) => {
  const result = db.deleteApiKey.run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Key not found' });
  res.json({ deleted: true });
});

// ── POST /auth/setup ──────────────────────────────────────────────────────────
// Create a user_template — returns the short token for the /og/:token URL.
router.post('/setup', requireJwt, (req, res) => {
  const { templateId, logoUrl, brandColor, domain, label } = req.body;

  if (!templateId) {
    return res.status(400).json({ error: 'templateId is required' });
  }

  const template = db.getTemplateById.get(templateId);
  if (!template) {
    return res.status(404).json({ error: `Template not found: ${templateId}` });
  }

  const user  = db.getUserById.get(req.user.id);

  // Free plan: max 1 OG endpoint
  if (user.plan === 'free') {
    const existing = db.listUserTemplates.all(req.user.id);
    if (existing.length >= 1) {
      return res.status(403).json({
        error: 'Free plan is limited to 1 OG endpoint. Upgrade to create more.',
        upgrade_url: '/#pricing',
      });
    }
  }
  const id    = crypto.randomUUID();
  let   token = generateShortToken();

  // Extremely unlikely collision — retry once just in case
  try {
    db.createUserTemplate.run({
      id,
      user_id:     req.user.id,
      template_id: templateId,
      token,
      brand_color: brandColor || user.brand_color || '#3B82F6',
      logo_url:    logoUrl    || user.logo_url    || null,
      domain:      domain     || null,
      label:       label      || template.name,
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      token = generateShortToken();
      db.createUserTemplate.run({
        id, user_id: req.user.id, template_id: templateId, token,
        brand_color: brandColor || user.brand_color,
        logo_url:    logoUrl    || user.logo_url || null,
        domain:      domain     || null,
        label:       label      || template.name,
      });
    } else {
      throw err;
    }
  }

  res.status(201).json({
    token,
    url:     `${config.baseUrl}/og/${token}?title=Your+Title`,
    id,
    templateId,
  });
});

// ── GET /auth/setup ───────────────────────────────────────────────────────────
// List all user_templates for the logged-in user.
router.get('/setup', requireJwt, (req, res) => {
  const rows = db.listUserTemplates.all(req.user.id);
  res.json(rows.map(r => ({
    ...r,
    url: `${config.baseUrl}/og/${r.token}?title=Your+Title`,
  })));
});

// ── DELETE /auth/setup/:id ────────────────────────────────────────────────────
router.delete('/setup/:id', requireJwt, (req, res) => {
  const result = db.deleteUserTemplate.run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

// ── PATCH /auth/brand ─────────────────────────────────────────────────────────
// Update user's default brand settings.
router.patch('/brand', requireJwt, (req, res) => {
  const { brandColor, logoUrl } = req.body;

  if (brandColor && !/^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
    return res.status(400).json({ error: 'brandColor must be a 6-digit hex code like #3B82F6' });
  }

  const updates = {};
  if (brandColor) updates.brand_color = brandColor;
  if (logoUrl !== undefined) updates.logo_url = logoUrl || null;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nothing to update. Send brandColor and/or logoUrl.' });
  }

  const current = db.getUserById.get(req.user.id);
  db.updateUserBranding.run({
    brand_color: updates.brand_color || current.brand_color,
    logo_url:    'logo_url' in updates ? updates.logo_url : current.logo_url,
    id:          req.user.id,
  });

  const user = db.getUserById.get(req.user.id);
  res.json(safeUser(user));
});

// ── GET /api/usage ────────────────────────────────────────────────────────────
// Mounted here for convenience (also available at /api/usage — see server.js).
router.get('/usage', requireJwt, (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const row   = db.getUsageMonthly.get(req.user.id, month) || { render_count: 0, cached_count: 0 };
  const plan  = req.user.plan;
  const limit = PLAN_LIMITS[plan] ?? 50;

  res.json({
    used:   row.render_count,
    cached: row.cached_count,
    limit:  limit === Infinity ? null : limit,
    plan,
    month,
  });
});

// ── POST /auth/forgot-password ────────────────────────────────────────────────
router.post('/forgot-password', byIp, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  // Always return 200 to avoid leaking whether email exists
  res.json({ message: 'If that email is registered you will receive a reset link.' });

  const user = db.getUserByEmail.get(email.toLowerCase());
  if (!user) return;

  try {
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
    db.createResetToken.run({ token, user_id: user.id, expires_at: expiresAt });

    const email_service = require('../services/email');
    await email_service.sendPasswordReset(user.email, token);
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error('[auth/forgot-password]', err);
  }
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const row = db.getResetToken.get(token);
  if (!row) return res.status(400).json({ error: 'Invalid or expired reset token' });
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(400).json({ error: 'Reset token has expired' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.updateUserPassword.run({ password_hash: passwordHash, id: row.user_id });
    db.markResetTokenUsed.run(token);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error('[auth/reset-password]', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────
function safeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

module.exports = router;
