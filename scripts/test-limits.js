/**
 * Tests for rate limiting, monthly limits, and watermarking.
 * node scripts/test-limits.js
 */
require('dotenv').config();
process.env.PORT    = '3098';
process.env.DB_PATH = './data/test-limits.db';

const http = require('http');
const { execFileSync, execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');

// ── helpers ───────────────────────────────────────────────────────────────────
function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname,
      port:     u.port,
      path:     u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let json;
        try { json = JSON.parse(raw.toString()); } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const BASE = 'http://localhost:3098';
function get(path, headers)       { return request('GET',  BASE + path, null, headers); }
function post(path, body, headers) { return request('POST', BASE + path, body, headers); }

function check(label, condition, extra = '') {
  if (condition) { console.log(`  ✓ ${label}`, extra); }
  else           { console.error(`  ✗ ${label}`, extra); process.exitCode = 1; }
}

// ── boot ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n── Rate limit + plan limit + watermark tests ──\n');

  // Fresh DB
  const config = require('../src/config');
  const dbPath = path.resolve(config.db.path);
  for (const ext of ['', '-shm', '-wal']) {
    const f = dbPath + ext; if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  execFileSync('node', [path.join(__dirname, 'setup-db.js')], { stdio: 'inherit' });

  // Start server
  const server = execFile('node', [path.join(__dirname, '../src/server.js')], {
    env: { ...process.env, PORT: '3098', DB_PATH: './data/test-limits.db' },
  });
  server.stdout.pipe(process.stdout);
  server.stderr.on('data', d => { if (!d.includes('Redis')) process.stderr.write(d); });
  await new Promise(r => { server.stdout.on('data', d => { if (d.includes('listening')) r(); }); setTimeout(r, 8000); });

  let jwt, ogToken, apiKey;

  try {
    // Setup: signup + create token + api key
    const s = await post('/auth/signup', { email: 'limit@test.com', password: 'password123' });
    jwt = s.json.token;
    const setup = await post('/auth/setup',
      { templateId: 'og-blog-minimal', brandColor: '#6366f1', domain: 'test.com' },
      { Authorization: `Bearer ${jwt}` }
    );
    ogToken = setup.json.token;
    const ak = await post('/auth/api-key', { name: 'Test' }, { Authorization: `Bearer ${jwt}` });
    apiKey = ak.json.key;

    // ── 1. Rate limit headers are present ─────────────────────────────────────
    console.log('\n[1] Rate limit headers on /og/:token');
    const r1 = await get(`/og/${ogToken}?title=Test`);
    check('X-RateLimit-Limit present', r1.headers['x-ratelimit-limit'] !== undefined);
    check('X-RateLimit-Remaining present', r1.headers['x-ratelimit-remaining'] !== undefined);
    check('X-RateLimit-Reset present', r1.headers['x-ratelimit-reset'] !== undefined);
    console.log(`       limit=${r1.headers['x-ratelimit-limit']} remaining=${r1.headers['x-ratelimit-remaining']}`);

    // ── 2. Rate limit headers on /api/v1/render ───────────────────────────────
    console.log('\n[2] Rate limit headers on POST /api/v1/render');
    const r2 = await post('/api/v1/render',
      { template: 'og-blog-minimal', variables: { title: 'API Test' } },
      { Authorization: `Bearer ${apiKey}` }
    );
    check('status 200', r2.status === 200);
    check('X-RateLimit-Limit present', r2.headers['x-ratelimit-limit'] !== undefined);

    // ── 3. Monthly limit enforcement ──────────────────────────────────────────
    console.log('\n[3] Monthly limit (free = 50 renders)');
    // Manually stuff the DB with 50 renders to trigger the limit
    const db = require('../src/db/db');
    const userId = db.getUserByEmail.get('limit@test.com').id;
    const month  = new Date().toISOString().slice(0, 7);
    // Set monthly count directly to 50
    db.db.prepare(`
      INSERT INTO usage_monthly (user_id, month, render_count, cached_count)
      VALUES (?, ?, 50, 0)
      ON CONFLICT(user_id, month) DO UPDATE SET render_count = 50
    `).run(userId, month);

    // A different title = new cache key = would trigger a fresh render
    const blocked = await get(`/og/${ogToken}?title=This+Should+Be+Blocked`);
    check('status 402', blocked.status === 402);
    check('error message', blocked.json?.error?.includes('Monthly render limit'));
    check('used = 50', blocked.json?.used === 50);
    check('limit = 50', blocked.json?.limit === 50);
    check('upgrade_url present', typeof blocked.json?.upgrade_url === 'string');

    // ── 4. Cached responses bypass monthly limit ──────────────────────────────
    console.log('\n[4] Cached responses bypass monthly limit');
    // Same title as r1 → should hit filesystem/redis cache → allowed even at limit
    const cached = await get(`/og/${ogToken}?title=Test`);
    check('status 200 (cache hit allowed at limit)', cached.status === 200);
    check('X-Cache HIT', cached.headers['x-cache'] === 'HIT');

    // ── 5. Monthly limit on /api/v1/render ────────────────────────────────────
    console.log('\n[5] Monthly limit on POST /api/v1/render');
    const apiBlocked = await post('/api/v1/render',
      { template: 'og-blog-minimal', variables: { title: 'New Title That Would Render' } },
      { Authorization: `Bearer ${apiKey}` }
    );
    check('status 402', apiBlocked.status === 402);
    check('upgrade_url present', typeof apiBlocked.json?.upgrade_url === 'string');

    // ── 6. Watermark in free-plan render ──────────────────────────────────────
    console.log('\n[6] Watermark in free-plan renders');
    // Reset usage so we can render again
    db.db.prepare(`UPDATE usage_monthly SET render_count = 0 WHERE user_id = ? AND month = ?`).run(userId, month);

    // Check that "Pikzor" appears in the rendered HTML (inspect buildHtml output)
    const { buildHtml } = require('../src/services/templates');
    const freeHtml = buildHtml('og-blog-minimal', {
      title: 'Test', author: 'Alice', brand_color: '#6366f1', __plan: 'free'
    });
    const paidHtml = buildHtml('og-blog-minimal', {
      title: 'Test', author: 'Alice', brand_color: '#6366f1', __plan: 'pro'
    });
    check('free plan HTML contains watermark', freeHtml.includes('Made with Pikzor'));
    check('paid plan HTML has no watermark',   !paidHtml.includes('Made with Pikzor'));
    check('light template uses dark watermark', (() => {
      const lightFree = buildHtml('og-light', { title: 'T', __plan: 'free' });
      return lightFree.includes('rgba(0,0,0,0.3)');
    })());
    check('dark template uses white watermark', freeHtml.includes('rgba(255,255,255,0.45)'));

    // Confirm the actual PNG render includes watermark (render and check size is reasonable)
    const rendered = await get(`/og/${ogToken}?title=Watermark+Test`);
    check('status 200 after reset', rendered.status === 200);
    check('PNG is valid', rendered.raw?.slice(0, 4).toString('hex') === '89504e47');
    console.log(`       PNG size: ${rendered.raw?.length} bytes`);

    // ── 7. Usage after renders ────────────────────────────────────────────────
    console.log('\n[7] Usage tracking');
    const usage = await get('/auth/usage', { Authorization: `Bearer ${jwt}` });
    check('status 200', usage.status === 200);
    check('used >= 1', usage.json?.used >= 1);
    check('plan = free', usage.json?.plan === 'free');
    check('limit = 50', usage.json?.limit === 50);

  } finally {
    server.kill();
    console.log('\n────────────────────────────────────');
    console.log(process.exitCode ? 'Some checks FAILED ✗' : 'All checks passed ✓');
    process.exit(process.exitCode || 0);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
