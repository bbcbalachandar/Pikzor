const express = require('express');
const router  = express.Router();

const renderer  = require('../services/renderer');
const { buildHtml, listTemplates } = require('../services/templates');
const cache     = require('../services/cache');
const storage   = require('../services/storage');
const logger    = require('../utils/logger');
const { requireApiKey }       = require('../middleware/apiKey');
const { requireJwt }          = require('../middleware/auth');
const { byUser }              = require('../middleware/rateLimit');
const { MONTHLY_LIMITS }      = require('../middleware/planLimits');
const { paramsHash }          = require('../utils/hash');
const config                  = require('../config');

const IS_PROD = process.env.NODE_ENV === 'production';

// ── GET /api/v1/templates ─────────────────────────────────────────────────────
router.get('/templates', (_req, res) => {
  res.json(listTemplates());
});

// ── GET /api/v1/usage ─────────────────────────────────────────────────────────
router.get('/usage', requireJwt, (req, res) => {
  const db    = require('../db/db');
  const month = new Date().toISOString().slice(0, 7);
  const row   = db.getUsageMonthly.get(req.user.id, month) || { render_count: 0, cached_count: 0 };
  const limit = MONTHLY_LIMITS[req.user.plan] ?? MONTHLY_LIMITS.free;

  res.json({
    used:        row.render_count,
    cached:      row.cached_count,
    limit:       limit === Infinity ? null : limit,
    plan:        req.user.plan,
    month,
  });
});

// ── POST /api/v1/render ───────────────────────────────────────────────────────
// API-key auth. Rate limited per user. Monthly limit enforced (non-cached only).
router.post('/render', requireApiKey, byUser, async (req, res) => {
  const db = require('../db/db');

  try {
    const { template = 'og-blog-minimal', variables = {} } = req.body;

    if (typeof variables !== 'object' || Array.isArray(variables)) {
      return res.status(400).json({ error: '`variables` must be a plain object' });
    }

    const available = listTemplates().map(t => t.id);
    if (!available.includes(template)) {
      return res.status(400).json({ error: `Unknown template: ${template}`, available });
    }

    const cacheKey = paramsHash(`api:${req.user.id}:${template}:${req.user.plan}`, variables);

    // ── Cache hits bypass monthly limit ───────────────────────────────────────
    const redisHit = await cache.get(`og:${cacheKey}`);
    if (redisHit) {
      if (!storage.exists('api', cacheKey)) await storage.save('api', cacheKey, redisHit);
      setImmediate(() => db.recordRender(req.user.id, template, true));
      return res.json({ success: true, url: `${config.baseUrl}${storage.urlPath('api', cacheKey)}`, cached: true });
    }

    const diskHit = await storage.load('api', cacheKey);
    if (diskHit) {
      cache.set(`og:${cacheKey}`, diskHit).catch(() => {});
      setImmediate(() => db.recordRender(req.user.id, template, true));
      return res.json({ success: true, url: `${config.baseUrl}${storage.urlPath('api', cacheKey)}`, cached: true });
    }

    // ── Monthly limit check (fresh renders only) ──────────────────────────────
    const month = new Date().toISOString().slice(0, 7);
    const usage = db.getUsageMonthly.get(req.user.id, month) || { render_count: 0 };
    const limit = MONTHLY_LIMITS[req.user.plan] ?? MONTHLY_LIMITS.free;

    if (limit !== Infinity && usage.render_count >= limit) {
      return res.status(402).json({
        error:       'Monthly render limit reached',
        used:        usage.render_count,
        limit,
        plan:        req.user.plan,
        upgrade_url: '/#pricing',
      });
    }

    // ── Fresh render ──────────────────────────────────────────────────────────
    const varsWithPlan = { ...variables, __plan: req.user.plan };
    const html   = buildHtml(template, varsWithPlan);
    const buffer = await renderer.render(html, 1200, 630);

    await storage.save('api', cacheKey, buffer);
    cache.set(`og:${cacheKey}`, buffer).catch(() => {});
    setImmediate(() => db.recordRender(req.user.id, template, false));

    return res.json({
      success: true,
      url:     `${config.baseUrl}${storage.urlPath('api', cacheKey)}`,
      cached:  false,
    });
  } catch (err) {
    logger.error('[api /render]', err);
    const payload = { error: 'Render failed' };
    if (!IS_PROD) payload.details = err.message;
    res.status(500).json(payload);
  }
});

module.exports = router;
