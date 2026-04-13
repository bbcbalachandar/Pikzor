const express = require('express');
const router  = express.Router();

const renderer  = require('../services/renderer');
const fallback  = require('../services/fallback');
const { buildHtml, listTemplates } = require('../services/templates');
const cache     = require('../services/cache');
const storage   = require('../services/storage');
const logger    = require('../utils/logger');
const { paramsHash }          = require('../utils/hash');
const { byIp }                = require('../middleware/rateLimit');
const { MONTHLY_LIMITS }      = require('../middleware/planLimits');

const IS_PROD = process.env.NODE_ENV === 'production';

// ── Input sanitization ────────────────────────────────────────────────────────
// Strip HTML tags and limit length to prevent XSS through title/author fields.
function sanitize(value, maxLen = 200) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/<[^>]*>/g, '')          // strip HTML tags
    .replace(/[&<>"'`]/g, c => ({     // encode remaining special chars
      '&': '&amp;', '<': '&lt;', '>': '&gt;',
      '"': '&quot;', "'": '&#x27;', '`': '&#x60;',
    }[c]))
    .slice(0, maxLen)
    .trim();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sendPng(res, buffer, cacheHit = false) {
  res.set({
    'Content-Type':  'image/png',
    'Cache-Control': 'public, max-age=2592000, immutable',
    'X-Cache':       cacheHit ? 'HIT' : 'MISS',
  });
  res.send(buffer);
}

function sendFallback(res) {
  const buf = fallback.get();
  if (buf) return sendPng(res, buf, false);
  res.status(500).json({ error: 'Render failed' });
}

// ── GET /og/templates ─────────────────────────────────────────────────────────
router.get('/templates', (_req, res) => {
  res.json(listTemplates());
});

// ── GET /og/test ──────────────────────────────────────────────────────────────
// Dev/preview — no auth, no plan enforcement. Rate limited by IP (free tier).
router.get('/test', byIp, async (req, res) => {
  const templateId = sanitize(req.query.template || 'og-blog-minimal', 60);

  const available = listTemplates().map(t => t.id);
  if (!available.includes(templateId)) {
    return res.status(400).json({ error: `Unknown template: ${templateId}`, available });
  }

  const params = {
    title:       sanitize(req.query.title       || 'Hello, World! This is your OG image.'),
    author:      sanitize(req.query.author      || 'Jane Doe', 80),
    date:        sanitize(req.query.date        || '', 40),
    tag:         sanitize(req.query.tag         || 'Blog Post', 40),
    description: sanitize(req.query.description || '', 300),
    brand_color: /^#[0-9A-Fa-f]{6}$/.test(req.query.brand_color)
                   ? req.query.brand_color : '#3B82F6',
    logo_url:    sanitize(req.query.logo_url    || '', 500),
    domain:      sanitize(req.query.domain      || 'example.com', 100),
    __plan:      'free',  // test renders always watermarked
  };

  try {
    const cacheKey = paramsHash(`test:${templateId}`, params);

    // Redis hit
    const redisHit = await cache.get(`og:${cacheKey}`);
    if (redisHit) return sendPng(res, redisHit, true);

    // Filesystem hit
    const diskHit = await storage.load('test', cacheKey);
    if (diskHit) {
      cache.set(`og:${cacheKey}`, diskHit).catch(() => {});
      return sendPng(res, diskHit, true);
    }

    // Fresh render
    const html   = buildHtml(templateId, params);
    const buffer = await renderer.render(html, 1200, 630);

    Promise.all([
      cache.set(`og:${cacheKey}`, buffer),
      storage.save('test', cacheKey, buffer),
    ]).catch(err => logger.error('[render /og/test] persist error', err));

    sendPng(res, buffer, false);
  } catch (err) {
    logger.error(`[render /og/test] template=${templateId}`, err);
    sendFallback(res);
  }
});

// ── GET /og/:token ────────────────────────────────────────────────────────────
router.get('/:token', byIp, async (req, res) => {
  const { token } = req.params;
  if (token === 'test' || token === 'templates') {
    return res.status(404).json({ error: 'Not found' });
  }

  // Basic token format check
  if (!/^t_[A-Za-z0-9]{7}$/.test(token)) {
    return res.status(400).json({
      error: 'Invalid token format',
      hint:  'Tokens look like t_xK9mP2. Use /og/test to preview without a token.',
    });
  }

  let db;
  try {
    db = require('../db/db');
  } catch (err) {
    logger.error('[render /:token] DB unavailable', err);
    return res.status(503).json({ error: 'Service unavailable' });
  }

  try {
    const row = db.getUserTemplateByToken.get(token);
    if (!row) {
      return res.status(404).json({
        error: 'Token not found',
        hint:  'Use /og/test to preview without a token.',
      });
    }

    const query = {
      title:  sanitize(req.query.title  || '', 200),
      author: sanitize(req.query.author || '', 80),
      date:   sanitize(req.query.date   || '', 40),
      tag:    sanitize(req.query.tag    || '', 40),
    };

    // Plan-scoped cache key (free/paid renders stored separately)
    const cacheKey = paramsHash(`tok:${token}:${row.user_plan}`, query);

    // Redis hit — always free (bypass monthly limit)
    const redisHit = await cache.get(`og:${cacheKey}`);
    if (redisHit) {
      setImmediate(() => db.recordRender(row.user_id, row.template_id, true));
      return sendPng(res, redisHit, true);
    }

    // Filesystem hit
    const diskHit = await storage.load('renders', cacheKey);
    if (diskHit) {
      cache.set(`og:${cacheKey}`, diskHit).catch(() => {});
      setImmediate(() => db.recordRender(row.user_id, row.template_id, true));
      return sendPng(res, diskHit, true);
    }

    // Monthly limit check (only for fresh renders)
    const month = new Date().toISOString().slice(0, 7);
    const usage = db.getUsageMonthly.get(row.user_id, month) || { render_count: 0 };
    const limit = MONTHLY_LIMITS[row.user_plan] ?? MONTHLY_LIMITS.free;

    if (limit !== Infinity && usage.render_count >= limit) {
      return res.status(402).json({
        error:       'Monthly render limit reached',
        used:        usage.render_count,
        limit,
        plan:        row.user_plan,
        upgrade_url: '/#pricing',
      });
    }

    // Fresh render
    const params = {
      title:       query.title,
      author:      query.author,
      date:        query.date,
      tag:         query.tag || 'Blog Post',
      brand_color: row.brand_color || row.user_brand_color || '#3B82F6',
      logo_url:    row.logo_url    || row.user_logo_url    || '',
      domain:      row.domain      || '',
      __plan:      row.user_plan,
    };

    const html   = buildHtml(row.template_id, params);
    const buffer = await renderer.render(html, row.tpl_width || 1200, row.tpl_height || 630);

    Promise.all([
      cache.set(`og:${cacheKey}`, buffer),
      storage.save('renders', cacheKey, buffer),
    ]).catch(err => logger.error('[render /:token] persist error', err));

    setImmediate(() => db.recordRender(row.user_id, row.template_id, false));
    sendPng(res, buffer, false);

  } catch (err) {
    logger.error(`[render /:token] token=${token}`, err);
    sendFallback(res);
  }
});

module.exports = router;
