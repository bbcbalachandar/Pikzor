require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');

const config         = require('./config');
const logger         = require('./utils/logger');
const renderer       = require('./services/renderer');
const fallback       = require('./services/fallback');
const renderRouter   = require('./routes/render');
const authRouter     = require('./routes/auth');
const apiRouter      = require('./routes/api');
const checkerRouter  = require('./routes/checker');
const blogRouter     = require('./routes/blog');
const billingRouter  = require('./routes/billing');
const uploadRouter   = require('./routes/upload');
const requestLogger  = require('./middleware/requestLogger');

// ── Ensure runtime directories exist ─────────────────────────────────────────
for (const dir of [
  config.storage.dir,
  path.join(config.storage.dir, 'logos'),
  config.logs.dir,
  path.dirname(config.db.path),
]) {
  fs.mkdirSync(path.resolve(dir), { recursive: true });
}

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// Trust proxy headers from nginx
app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────────────────────
// /og/* — images must be embeddable anywhere (social crawlers, external sites)
app.use('/og', cors({ origin: '*', methods: ['GET', 'HEAD'] }));

// /api/* — allow all origins (API callable from any frontend)
app.use('/api', cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));

// /checker/* — allow all origins
app.use('/checker', cors({ origin: '*' }));

// /upload/* — allow all origins (called from dashboard JS)
app.use('/upload', cors({ origin: '*', methods: ['POST', 'OPTIONS'] }));

// /auth/*, /billing/*, /dashboard/* — same-origin only (no CORS header = browser blocks cross-origin)

// ── General middleware ────────────────────────────────────────────────────────
app.use(compression());
app.use(express.json());
app.use(requestLogger);

// ── Static files ──────────────────────────────────────────────────────────────
// logos sub-directory — served under /images/logos/
app.use('/images', express.static(path.resolve(config.storage.dir), {
  maxAge: '30d',
  immutable: true,
}));

app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1h',
  etag: true,
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/og',      renderRouter);
app.use('/auth',    authRouter);
app.use('/api/v1',  apiRouter);
app.use('/checker', checkerRouter);
app.use('/blog',    blogRouter);
app.use('/billing', billingRouter);
app.use('/upload',  uploadRouter);

app.get('/docs', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/docs.html')));

app.get('/dashboard', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/dashboard.html')));

app.get('/signup', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/dashboard.html')));

app.get('/login', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/dashboard.html')));

app.get('/checker', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/checker.html')));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', uptime: process.uptime(), ts: new Date().toISOString() }));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Error handler ─────────────────────────────────────────────────────────────
const IS_PROD = config.nodeEnv === 'production';
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logger.error(`[server] unhandled error on ${req.method} ${req.path}`, err);
  const payload = { error: 'Internal server error' };
  if (!IS_PROD) payload.details = err.message;
  res.status(500).json(payload);
});

// ── Template seeding ──────────────────────────────────────────────────────────
// Sync filesystem templates → DB so /auth/setup can validate templateId and
// user_templates foreign-key constraint is satisfied.
function seedTemplates() {
  try {
    const { listTemplates } = require('./services/templates');
    const { upsertTemplate } = require('./db/db');
    const templates = listTemplates();
    for (const meta of templates) {
      upsertTemplate.run({
        id:          meta.id,
        name:        meta.name        || meta.id,
        category:    meta.category    || 'blog',
        description: meta.description || '',
        html_path:   path.join('templates', meta.id, 'template.html'),
        variables:   JSON.stringify(meta.variables || []),
        width:       meta.width       || 1200,
        height:      meta.height      || 630,
        is_public:   meta.is_public !== false ? 1 : 0,
      });
    }
    logger.info(`[server] seeded ${templates.length} template(s) into DB`);
  } catch (err) {
    logger.error('[server] template seeding failed', err);
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  seedTemplates();

  try {
    await renderer.getBrowser();
    logger.info('[server] renderer ready');
  } catch (err) {
    logger.error('[server] renderer failed to start', err);
  }

  fallback.init().catch(() => {});

  app.listen(config.port, () => {
    logger.info(`[server] listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });
}

start();

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`[server] ${signal} received — shutting down`);
  try { await renderer.shutdown(); } catch { /* ignore */ }
  try {
    const cache = require('./services/cache');
    const client = await cache._getClient();
    if (client) await client.quit();
  } catch { /* ignore */ }
  try {
    const { db } = require('./db/db');
    db.close();
  } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
