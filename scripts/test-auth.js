/**
 * HTTP integration test for the auth + render system.
 * Starts the server internally, runs all checks, shuts down.
 * Run: node scripts/test-auth.js
 */
require('dotenv').config();
process.env.PORT   = '3099';            // isolated test port
process.env.DB_PATH = './data/test.db'; // isolated test DB (won't conflict with dev DB)

const http = require('http');

// ── helpers ───────────────────────────────────────────────────────────────────
function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3099,
      path,
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

function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✓ ${label}`, extra);
  } else {
    console.error(`  ✗ ${label}`, extra);
    process.exitCode = 1;
  }
}

// ── boot server ───────────────────────────────────────────────────────────────
async function boot() {
  // Fresh DB for this test run
  const fs   = require('fs');
  const path = require('path');
  const config = require('../src/config');
  const dbPath = path.resolve(config.db.path);
  for (const ext of ['', '-shm', '-wal']) {
    const f = dbPath + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  // Re-seed templates
  const db = require('../src/db/db');
  const TEMPLATES_DIR = path.join(__dirname, '../src/templates');
  for (const dir of fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
    const metaPath = path.join(TEMPLATES_DIR, dir, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    db.upsertTemplate.run({ id: meta.id, name: meta.name, category: meta.category || 'blog',
      description: meta.description || '', html_path: `src/templates/${dir}/template.html`,
      variables: JSON.stringify(meta.variables || []), width: meta.width || 1200, height: meta.height || 630, is_public: 1 });
  }

  // Start app
  const renderer   = require('../src/services/renderer');
  const app        = require('../src/server');  // server.js calls start() — we need a different approach

  return db;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n── Auth + Render integration test ──\n');

  const { execFile } = require('child_process');
  const path = require('path');
  const fs   = require('fs');

  // ── Reset DB before starting server ────────────────────────────────────────
  const config = require('../src/config');
  const dbPath = path.resolve(config.db.path);
  for (const ext of ['', '-shm', '-wal']) {
    const f = dbPath + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  // Re-seed templates via setup-db (synchronous child process)
  const { execFileSync } = require('child_process');
  execFileSync('node', [path.join(__dirname, 'setup-db.js')], { stdio: 'inherit' });

  const server = execFile('node', [path.join(__dirname, '../src/server.js')], {
    env: { ...process.env, PORT: '3099' },
  });
  server.stdout.pipe(process.stdout);
  server.stderr.pipe(process.stderr);

  // Wait for "listening"
  await new Promise((resolve) => {
    server.stdout.on('data', (d) => {
      if (d.includes('listening')) resolve();
    });
    setTimeout(resolve, 8000); // fallback
  });

  let jwt, ogToken, apiKey;

  try {
    // 1. Signup
    console.log('\n[1] POST /auth/signup');
    const s = await request('POST', '/auth/signup', { email: 'test@example.com', password: 'password123' });
    check('status 201', s.status === 201);
    check('has token', typeof s.json?.token === 'string');
    check('user.plan = free', s.json?.user?.plan === 'free');
    check('no password_hash in response', !s.json?.user?.password_hash);
    jwt = s.json?.token;

    // 2. Duplicate signup
    console.log('\n[2] Duplicate signup');
    const dup = await request('POST', '/auth/signup', { email: 'test@example.com', password: 'password123' });
    check('status 409', dup.status === 409);

    // 3. Login
    console.log('\n[3] POST /auth/login');
    const l = await request('POST', '/auth/login', { email: 'test@example.com', password: 'password123' });
    check('status 200', l.status === 200);
    check('has token', typeof l.json?.token === 'string');

    // 4. Wrong password
    console.log('\n[4] Wrong password');
    const lw = await request('POST', '/auth/login', { email: 'test@example.com', password: 'wrong' });
    check('status 401', lw.status === 401);

    // 5. /auth/me
    console.log('\n[5] GET /auth/me');
    const me = await request('GET', '/auth/me', null, { Authorization: `Bearer ${jwt}` });
    check('status 200', me.status === 200);
    check('email matches', me.json?.email === 'test@example.com');

    // 6. /auth/me without token
    const me2 = await request('GET', '/auth/me', null);
    check('401 without token', me2.status === 401);

    // 7. Create API key
    console.log('\n[6] POST /auth/api-key');
    const ak = await request('POST', '/auth/api-key', { name: 'Test Key' }, { Authorization: `Bearer ${jwt}` });
    check('status 201', ak.status === 201);
    check('key starts with sk_live_', ak.json?.key?.startsWith('sk_live_'));
    check('has warning', typeof ak.json?.warning === 'string');
    apiKey = ak.json?.key;

    // 8. List API keys (should not expose hash)
    console.log('\n[7] GET /auth/api-keys');
    const aks = await request('GET', '/auth/api-keys', null, { Authorization: `Bearer ${jwt}` });
    check('status 200', aks.status === 200);
    check('1 key', aks.json?.length === 1);
    check('no key_hash exposed', !aks.json?.[0]?.key_hash);

    // 9. Setup (create user_template)
    console.log('\n[8] POST /auth/setup');
    const setup = await request('POST', '/auth/setup',
      { templateId: 'og-gradient', brandColor: '#6366f1', domain: 'myblog.com' },
      { Authorization: `Bearer ${jwt}` }
    );
    check('status 201', setup.status === 201);
    check('token starts with t_', setup.json?.token?.startsWith('t_'));
    check('url contains token', setup.json?.url?.includes(setup.json?.token));
    ogToken = setup.json?.token;

    // 10. Render via token (MISS — fresh render)
    console.log('\n[9] GET /og/:token (first — MISS)');
    const r1 = await request('GET', `/og/${ogToken}?title=Hello+World&author=Alice`);
    check('status 200', r1.status === 200);
    check('content-type image/png', r1.headers['content-type'] === 'image/png');
    check('PNG magic bytes', r1.raw?.slice(0, 4).toString('hex') === '89504e47');
    check('X-Cache MISS', r1.headers['x-cache'] === 'MISS');

    // 11. Same params → cache hit
    console.log('\n[10] GET /og/:token (second — HIT)');
    const r2 = await request('GET', `/og/${ogToken}?title=Hello+World&author=Alice`);
    check('status 200', r2.status === 200);
    check('X-Cache HIT', r2.headers['x-cache'] === 'HIT');
    check('same bytes', r1.raw?.length === r2.raw?.length);

    // 12. Different params → new MISS
    console.log('\n[11] GET /og/:token (different title — MISS)');
    const r3 = await request('GET', `/og/${ogToken}?title=Different+Title`);
    check('X-Cache MISS', r3.headers['x-cache'] === 'MISS');

    // 13. Usage
    console.log('\n[12] GET /auth/usage');
    const usage = await request('GET', '/auth/usage', null, { Authorization: `Bearer ${jwt}` });
    check('status 200', usage.status === 200);
    check('used >= 2', usage.json?.used >= 2);
    check('limit = 50', usage.json?.limit === 50);
    check('plan = free', usage.json?.plan === 'free');
    console.log(`       renders used: ${usage.json?.used}, cached: ${usage.json?.cached}`);

    // 14. POST /api/v1/render with API key
    console.log('\n[13] POST /api/v1/render (API key)');
    const ar = await request('POST', '/api/v1/render',
      { template: 'og-bold', variables: { title: 'API Test', author: 'Bob', brand_color: '#f59e0b' } },
      { Authorization: `Bearer ${apiKey}` }
    );
    check('status 200', ar.status === 200);
    check('success = true', ar.json?.success === true);
    check('has url', typeof ar.json?.url === 'string');
    check('cached = false', ar.json?.cached === false);

    // 15. Unknown token
    console.log('\n[14] GET /og/unknown_token');
    const unk = await request('GET', '/og/t_unknown123');
    check('status 404', unk.status === 404);

  } finally {
    server.kill();
    console.log('\n────────────────────────────────────');
    if (process.exitCode) {
      console.log('Some checks FAILED ✗');
    } else {
      console.log('All checks passed ✓');
    }
    process.exit(process.exitCode || 0);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
