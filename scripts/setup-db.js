/**
 * Database setup + template seed.
 * Run once (or whenever you add a new template):
 *   node scripts/setup-db.js
 *
 * Pass --fresh to delete the existing DB and start clean:
 *   node scripts/setup-db.js --fresh
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const config = require('../src/config');
const dbPath = path.resolve(config.db.path);

// ── Optional: wipe existing DB ────────────────────────────────────────────────
if (process.argv.includes('--fresh')) {
  for (const ext of ['', '-shm', '-wal']) {
    const f = dbPath + ext;
    if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('deleted', f); }
  }
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = require('../src/db/db');

// ── Seed templates from meta.json files ───────────────────────────────────────
const TEMPLATES_DIR = path.join(__dirname, '../src/templates');
const dirs = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

let seeded = 0;
for (const dir of dirs) {
  const metaPath = path.join(TEMPLATES_DIR, dir, 'meta.json');
  if (!fs.existsSync(metaPath)) continue;

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  db.upsertTemplate.run({
    id:          meta.id,
    name:        meta.name,
    category:    meta.category || 'blog',
    description: meta.description || '',
    html_path:   `src/templates/${dir}/template.html`,
    variables:   JSON.stringify(meta.variables || []),
    width:       meta.width  || 1200,
    height:      meta.height || 630,
    is_public:   1,
  });
  console.log('✓ upserted template:', meta.id);
  seeded++;
}

console.log(`\nDone. ${seeded} template(s) seeded into ${dbPath}`);
console.log('\nNext steps:');
console.log('  1. node src/server.js');
console.log('  2. POST /auth/signup  { email, password }  → get JWT');
console.log('  3. POST /auth/setup   { templateId }       → get /og/:token URL');
