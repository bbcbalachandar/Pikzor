#!/usr/bin/env node
/**
 * Pikzor end-to-end test script
 *
 * Usage:
 *   node test.js                          # test localhost:3000
 *   BASE_URL=https://pikzor.com node test.js
 *
 * All tests run in sequence. Exits 0 if all pass, 1 if any fail.
 */

const BASE_URL    = process.env.BASE_URL || 'http://localhost:3000';
const TEST_EMAIL  = `test+${Date.now()}@example.com`;
const TEST_PASS   = 'testpassword123';

let passed = 0;
let failed = 0;
let jwt    = null;
let apiKey = null;
let ogToken = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(name, detail = '') {
  console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? '  \x1b[2m' + detail + '\x1b[0m' : ''}`);
  passed++;
}

function fail(name, reason) {
  console.log(`  \x1b[31m✗\x1b[0m ${name}  \x1b[31m${reason}\x1b[0m`);
  failed++;
}

async function api(method, path, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  const opts    = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r    = await fetch(`${BASE_URL}${path}`, opts);
    let   data = null;
    const ct   = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await r.json();
    return { status: r.status, data, headers: r.headers };
  } catch (err) {
    return { status: 0, data: null, headers: new Headers(), error: err.message };
  }
}

function authHdr()          { return jwt    ? { Authorization: `Bearer ${jwt}` }    : {}; }
function apiKeyHdr(key = apiKey) { return key ? { Authorization: `Bearer ${key}` } : {}; }

// ── Test sections ─────────────────────────────────────────────────────────────

async function testHealth() {
  console.log('\n── 1. Health ──────────────────────────────────────────────────');
  const r = await api('GET', '/health');
  r.status === 200 && r.data?.status === 'ok'
    ? ok('GET /health', `uptime=${r.data.uptime?.toFixed(1)}s`)
    : fail('GET /health', `status=${r.status}`);
}

async function testSignup() {
  console.log('\n── 2. Signup ──────────────────────────────────────────────────');

  let r = await api('POST', '/auth/signup', {});
  r.status === 400
    ? ok('Missing fields → 400')
    : fail('Missing fields', `status=${r.status}`);

  r = await api('POST', '/auth/signup', { email: TEST_EMAIL, password: 'short' });
  r.status === 400
    ? ok('Short password → 400')
    : fail('Short password', `status=${r.status}`);

  r = await api('POST', '/auth/signup', { email: 'notanemail', password: TEST_PASS });
  r.status === 400
    ? ok('Invalid email → 400')
    : fail('Invalid email', `status=${r.status}`);

  r = await api('POST', '/auth/signup', { email: TEST_EMAIL, password: TEST_PASS });
  if (r.status === 201 && r.data?.token) {
    jwt = r.data.token;
    ok('Signup success → 201 with token');
  } else {
    fail('Signup success', `status=${r.status} body=${JSON.stringify(r.data)}`);
  }

  r = await api('POST', '/auth/signup', { email: TEST_EMAIL, password: TEST_PASS });
  r.status === 409
    ? ok('Duplicate email → 409')
    : fail('Duplicate email', `status=${r.status}`);
}

async function testLogin() {
  console.log('\n── 3. Login ───────────────────────────────────────────────────');

  let r = await api('POST', '/auth/login', { email: TEST_EMAIL, password: 'wrongpass' });
  r.status === 401
    ? ok('Wrong password → 401')
    : fail('Wrong password', `status=${r.status}`);

  r = await api('POST', '/auth/login', { email: 'nobody@example.com', password: TEST_PASS });
  r.status === 401
    ? ok('Non-existent email → 401')
    : fail('Non-existent email', `status=${r.status}`);

  r = await api('POST', '/auth/login', { email: TEST_EMAIL, password: TEST_PASS });
  if (r.status === 200 && r.data?.token) {
    jwt = r.data.token;
    ok('Login success → 200 with token');
  } else {
    fail('Login success', `status=${r.status}`);
  }

  // /auth/me
  r = await api('GET', '/auth/me', null, authHdr());
  r.status === 200 && r.data?.email === TEST_EMAIL
    ? ok('GET /auth/me → correct email')
    : fail('GET /auth/me', `status=${r.status} email=${r.data?.email}`);
}

async function testTemplates() {
  console.log('\n── 4. Templates ───────────────────────────────────────────────');
  const r = await api('GET', '/og/templates');
  if (r.status === 200 && Array.isArray(r.data) && r.data.length > 0) {
    ok(`GET /og/templates → ${r.data.length} template(s)`, r.data.map(t => t.id).join(', '));
    return r.data;
  } else {
    fail('GET /og/templates', `status=${r.status} count=${r.data?.length ?? 0}`);
    return [];
  }
}

async function testOgTest() {
  console.log('\n── 5. OG Test Render (/og/test) ───────────────────────────────');

  // Valid render
  let r = await fetch(`${BASE_URL}/og/test?template=og-blog-minimal&title=Test+Post&author=Tester&brand_color=%236366f1`);
  r.status === 200 && (r.headers.get('content-type') || '').includes('image/png')
    ? ok('GET /og/test → 200 PNG', `X-Cache=${r.headers.get('x-cache')}`)
    : fail('GET /og/test', `status=${r.status} ct=${r.headers.get('content-type')}`);

  // Invalid template
  r = await api('GET', '/og/test?template=nonexistent');
  r.status === 400
    ? ok('Unknown template → 400')
    : fail('Unknown template', `status=${r.status}`);
}

async function testSetup(templates) {
  console.log('\n── 6. Dashboard Setup (POST /auth/setup) ──────────────────────');

  if (!jwt) { fail('POST /auth/setup', 'skipped — no JWT'); return; }

  const templateId = templates[0]?.id || 'og-blog-minimal';

  const r = await api('POST', '/auth/setup', {
    templateId,
    brandColor: '#6366f1',
    domain:     'test.example.com',
    label:      'Test endpoint',
  }, authHdr());

  if (r.status === 201 && r.data?.token) {
    ogToken = r.data.token;
    ok(`POST /auth/setup → 201`, `token=${ogToken} url=${r.data.url}`);
  } else {
    fail('POST /auth/setup', `status=${r.status} body=${JSON.stringify(r.data)}`);
  }

  // Free plan: second endpoint should be blocked
  const r2 = await api('POST', '/auth/setup', {
    templateId,
    brandColor: '#ff0000',
    domain:     'second.example.com',
  }, authHdr());
  r2.status === 403
    ? ok('Free plan 2nd endpoint → 403')
    : fail('Free plan 2nd endpoint limit', `status=${r2.status}`);
}

async function testOgToken() {
  console.log('\n── 7. OG Token Render (/og/:token) ────────────────────────────');

  if (!ogToken) { fail('OG token render', 'skipped — no token from setup'); return; }

  // First render (cache miss)
  const url = `${BASE_URL}/og/${ogToken}?title=My+Blog+Post&author=Test+User`;
  const r1  = await fetch(url);
  if (r1.status === 200 && (r1.headers.get('content-type') || '').includes('image/png')) {
    ok(`GET /og/${ogToken} → 200 PNG`, `X-Cache=${r1.headers.get('x-cache')}`);
  } else if (r1.status === 429) {
    ok(`GET /og/${ogToken} → 429 (rate limit working — IP shared with /og/test renders)`);
    return;
  } else {
    fail(`GET /og/${ogToken}`, `status=${r1.status}`);
    return;
  }

  // Second identical request → cache hit
  const r2 = await fetch(url);
  r2.headers.get('x-cache') === 'HIT'
    ? ok('Cache hit on repeat request')
    : fail('Cache hit', `X-Cache=${r2.headers.get('x-cache')}`);

  // Different params → cache miss
  const r3 = await fetch(`${BASE_URL}/og/${ogToken}?title=Different+Title&author=Other`);
  r3.headers.get('x-cache') === 'MISS'
    ? ok('Cache miss on different params')
    : fail('Cache miss', `X-Cache=${r3.headers.get('x-cache')}`);

  // Invalid token format
  const r4 = await api('GET', '/og/not_a_valid_token');
  r4.status === 400
    ? ok('Invalid token format → 400')
    : fail('Invalid token format', `status=${r4.status}`);
}

async function testUsage() {
  console.log('\n── 8. Usage ───────────────────────────────────────────────────');

  if (!jwt) { fail('Usage', 'skipped — no JWT'); return; }

  const r = await api('GET', '/auth/usage', null, authHdr());
  if (r.status === 200 && typeof r.data?.used === 'number') {
    ok('GET /auth/usage → ok', `used=${r.data.used}/${r.data.limit} plan=${r.data.plan}`);
  } else {
    fail('GET /auth/usage', `status=${r.status} data=${JSON.stringify(r.data)}`);
  }
}

async function testApiKey() {
  console.log('\n── 9. API Key ─────────────────────────────────────────────────');

  if (!jwt) { fail('API key', 'skipped — no JWT'); return; }

  // Generate
  const r = await api('POST', '/auth/api-key', { name: 'Test key' }, authHdr());
  if (r.status === 201 && r.data?.key?.startsWith('sk_live_')) {
    apiKey = r.data.key;
    ok('POST /auth/api-key → 201', `prefix=${r.data.prefix}`);
  } else {
    fail('POST /auth/api-key', `status=${r.status} data=${JSON.stringify(r.data)}`);
    return;
  }

  // List
  const r2 = await api('GET', '/auth/api-keys', null, authHdr());
  r2.status === 200 && Array.isArray(r2.data) && r2.data.length >= 1
    ? ok(`GET /auth/api-keys → ${r2.data.length} key(s)`)
    : fail('GET /auth/api-keys', `status=${r2.status}`);
}

async function testApiRender() {
  console.log('\n── 10. API v1 Render (POST /api/v1/render) ────────────────────');

  // No key → 401
  let r = await api('POST', '/api/v1/render', { template: 'og-blog-minimal', variables: { title: 'Test' } });
  r.status === 401
    ? ok('No API key → 401')
    : fail('No API key', `status=${r.status}`);

  if (!apiKey) { fail('API render with key', 'skipped — no API key'); return; }

  // Invalid template
  r = await api('POST', '/api/v1/render',
    { template: 'nonexistent', variables: {} },
    apiKeyHdr());
  r.status === 400
    ? ok('Invalid template → 400')
    : fail('Invalid template', `status=${r.status}`);

  // Valid render
  r = await api('POST', '/api/v1/render',
    { template: 'og-blog-minimal', variables: { title: 'API Test', author: 'Bot' } },
    apiKeyHdr());
  if (r.status === 200 && r.data?.success && r.data?.url) {
    ok('POST /api/v1/render → 200', `cached=${r.data.cached} url=${r.data.url}`);
  } else {
    fail('POST /api/v1/render', `status=${r.status} data=${JSON.stringify(r.data)}`);
  }

  // GET /api/v1/templates
  r = await api('GET', '/api/v1/templates');
  r.status === 200 && Array.isArray(r.data)
    ? ok(`GET /api/v1/templates → ${r.data.length} template(s)`)
    : fail('GET /api/v1/templates', `status=${r.status}`);
}

async function testChecker() {
  console.log('\n── 11. OG Checker (POST /checker/analyze) ─────────────────────');

  // Missing URL → 400
  let r = await api('POST', '/checker/analyze', {});
  r.status === 400
    ? ok('Missing url → 400')
    : fail('Missing url', `status=${r.status}`);

  // Invalid URL → 400
  r = await api('POST', '/checker/analyze', { url: 'not a url' });
  r.status === 400
    ? ok('Invalid URL → 400')
    : fail('Invalid URL', `status=${r.status}`);

  // Real URL
  r = await api('POST', '/checker/analyze', { url: 'https://example.com' });
  if (r.status === 200 && typeof r.data?.score === 'number') {
    ok('Analyze example.com → ok', `score=${r.data.score} issues=${r.data.issues?.length}`);
  } else if (r.status === 429) {
    ok('Analyze example.com → 429 rate limited (expected in CI)');
  } else if (r.status === 502) {
    ok('Analyze example.com → 502 (network unavailable)');
  } else {
    fail('Analyze example.com', `status=${r.status} data=${JSON.stringify(r.data)}`);
  }
}

async function testBilling() {
  console.log('\n── 12. Billing ────────────────────────────────────────────────');

  if (!jwt) { fail('Billing', 'skipped — no JWT'); return; }

  // Status
  const r = await api('GET', '/billing/status', null, authHdr());
  r.status === 200 && r.data?.plan
    ? ok('GET /billing/status → ok', `plan=${r.data.plan}`)
    : fail('GET /billing/status', `status=${r.status}`);

  // Checkout without Stripe configured → 503
  const r2 = await api('POST', '/billing/checkout', { plan: 'starter' }, authHdr());
  if (r2.status === 503) {
    ok('POST /billing/checkout (no Stripe) → 503');
  } else if (r2.status === 200 && r2.data?.url) {
    ok('POST /billing/checkout → 200 with Stripe URL');
  } else {
    fail('POST /billing/checkout', `status=${r2.status}`);
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\x1b[1mPikzor E2E Tests\x1b[0m  ${BASE_URL}`);
  console.log(`Test email: ${TEST_EMAIL}`);

  await testHealth();
  await testSignup();
  await testLogin();
  const templates = await testTemplates();
  await testOgTest();
  await testSetup(templates);
  await testOgToken();
  await testUsage();
  await testApiKey();
  await testApiRender();
  await testChecker();
  await testBilling();

  console.log('\n──────────────────────────────────────────────────────────────');
  const total = passed + failed;
  if (failed === 0) {
    console.log(`\x1b[32m✓ All ${total} tests passed\x1b[0m`);
  } else {
    console.log(`\x1b[31m✗ ${failed} of ${total} tests failed\x1b[0m`);
  }
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\nTest runner crashed:', err.message);
  process.exit(1);
});
