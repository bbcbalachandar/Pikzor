/**
 * Seed the database with a test user, API key, and token.
 * Run once: node scripts/seed.js
 *
 * Outputs:
 *   Test token URL : GET /og/tok_test?title=Hello+World
 *   Test API key   : sk_test_000...  (use in Authorization: Bearer header)
 */
require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Ensure data dir exists before requiring db
const config = require('../src/config');
fs.mkdirSync(path.dirname(path.resolve(config.db.path)), { recursive: true });

const db = require('../src/db/db');

// ── Idempotent seed ───────────────────────────────────────────────────────────

// 1. Test user
let user = db.getUserByEmail.get('test@example.com');
if (!user) {
  const passwordHash = crypto.createHash('sha256').update('test-password').digest('hex');
  db.createUser.run({
    email:        'test@example.com',
    password_hash: passwordHash,
    brand_color:  '#6366f1',
    logo_url:     null,
    domain:       'example.com',
  });
  user = db.getUserByEmail.get('test@example.com');
  console.log('✓ Created test user  id=%d', user.id);
} else {
  console.log('· Test user exists   id=%d', user.id);
}

// 2. Test API key  (raw key → stored as SHA-256 hash)
const RAW_API_KEY = 'sk_test_00000000000000000000000000000000';
const keyHash = crypto.createHash('sha256').update(RAW_API_KEY).digest('hex');
const existingKey = db.getApiKeyByHash.get(keyHash);
if (!existingKey) {
  db.createApiKey.run({ user_id: user.id, key_hash: keyHash, name: 'Test Key' });
  console.log('✓ Created API key    %s', RAW_API_KEY);
} else {
  console.log('· API key exists     %s', RAW_API_KEY);
}

// 3. Test token — one per template so you can try each
const testTokens = [
  { token: 'tok_minimal',  template_id: 'og-blog-minimal', brand_color: '#6366f1', domain: 'myblog.com' },
  { token: 'tok_gradient', template_id: 'og-gradient',     brand_color: '#6366f1', domain: 'myblog.com' },
  { token: 'tok_split',    template_id: 'og-split',        brand_color: '#10b981', domain: 'saas.io'    },
  { token: 'tok_bold',     template_id: 'og-bold',         brand_color: '#f59e0b', domain: 'startup.co' },
  { token: 'tok_light',    template_id: 'og-light',        brand_color: '#3b82f6', domain: 'devblog.io' },
];

for (const t of testTokens) {
  const existing = db.getTokenByValue.get(t.token);
  if (!existing) {
    db.createToken.run({
      user_id:     user.id,
      token:       t.token,
      template_id: t.template_id,
      brand_color: t.brand_color,
      logo_url:    null,
      domain:      t.domain,
      label:       `Test — ${t.template_id}`,
    });
    console.log('✓ Created token      %s → %s', t.token, t.template_id);
  } else {
    console.log('· Token exists       %s → %s', t.token, t.template_id);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
const port = process.env.PORT || 3000;
console.log('\n─────────────────────────────────────────────────');
console.log('Token URLs (start server first):');
for (const t of testTokens) {
  console.log(`  http://localhost:${port}/og/${t.token}?title=Hello+World&author=Jane`);
}
console.log('\nAPI key (POST /api/v1/render):');
console.log(`  Authorization: Bearer ${RAW_API_KEY}`);
console.log('─────────────────────────────────────────────────\n');
