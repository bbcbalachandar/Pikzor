const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { marked } = require('marked');
const router  = express.Router();
const config  = require('../config');

const POSTS_DIR = path.join(__dirname, '../../blog/posts');

// ── Parse frontmatter ─────────────────────────────────────────────────────────
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key   = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    meta[key] = value;
  }
  return { meta, content: match[2] };
}

// ── Extract title + description from markdown when no frontmatter ─────────────
function extractFromMarkdown(content) {
  const lines = content.split('\n');
  let title = '';
  let description = '';

  for (const line of lines) {
    if (!title && line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }
    if (title && !description) {
      const text = line.trim();
      if (text && !text.startsWith('#')) {
        description = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 160);
        break;
      }
    }
  }
  return { title, description };
}

// ── Load all posts ────────────────────────────────────────────────────────────
function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];

  return fs.readdirSync(POSTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(file => {
      const slug = file.replace(/\.md$/, '');
      const raw  = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
      const { meta, content } = parseFrontmatter(raw);
      const extracted = extractFromMarkdown(content);
      return {
        slug,
        title:       meta.title       || extracted.title       || slug,
        description: meta.description || extracted.description || '',
        date:        meta.date        || '',
        tag:         meta.tag         || '',
        author:      meta.author      || 'Pikzor Team',
      };
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// ── Blog index ────────────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const posts = loadPosts();

  const cards = posts.map(p => `
    <article class="post-card">
      <div class="post-meta">
        <span class="tag">${p.tag || 'Post'}</span>
        <span class="date">${p.date || ''}</span>
      </div>
      <h2><a href="/blog/${p.slug}">${p.title || p.slug}</a></h2>
      <p class="description">${p.description || ''}</p>
      <a href="/blog/${p.slug}" class="read-more">Read more →</a>
    </article>
  `).join('');

  const ogUrl = `${config.baseUrl}/og/test?template=og-gradient&title=Pikzor+Blog&author=pikzor.com`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog — Pikzor</title>
  <meta name="description" content="Guides, tutorials, and tips for OG images and social sharing.">
  <meta property="og:title" content="Pikzor Blog">
  <meta property="og:description" content="Guides, tutorials, and tips for OG images and social sharing.">
  <meta property="og:image" content="${ogUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${ogUrl}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0a0a0f; color: #e2e8f0; line-height: 1.6; }
    a { color: #818cf8; text-decoration: none; }
    a:hover { text-decoration: underline; }

    nav { position: sticky; top: 0; background: rgba(10,10,15,0.9);
          backdrop-filter: blur(12px); border-bottom: 1px solid #1e293b;
          padding: 0 2rem; display: flex; align-items: center;
          gap: 2rem; height: 56px; z-index: 100; }
    .nav-brand { font-weight: 700; font-size: 1.1rem; color: #fff; }
    .nav-links { display: flex; gap: 1.5rem; margin-left: auto; font-size: 0.9rem; }

    .page { max-width: 760px; margin: 0 auto; padding: 4rem 2rem; }
    h1 { font-size: 2rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem; }
    .subtitle { color: #64748b; margin-bottom: 3rem; }

    .post-card { padding: 2rem 0; border-bottom: 1px solid #1e293b; }
    .post-card:last-child { border-bottom: none; }
    .post-meta { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.75rem; }
    .tag { background: #1e1b4b; color: #818cf8; font-size: 0.75rem;
           padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 600; }
    .date { color: #64748b; font-size: 0.85rem; }
    .post-card h2 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.5rem; }
    .post-card h2 a { color: #f1f5f9; }
    .post-card h2 a:hover { color: #818cf8; text-decoration: none; }
    .description { color: #94a3b8; font-size: 0.95rem; margin-bottom: 1rem; }
    .read-more { font-size: 0.9rem; font-weight: 500; }

    footer { text-align: center; padding: 3rem; color: #475569; font-size: 0.85rem;
             border-top: 1px solid #1e293b; margin-top: 4rem; }
  </style>
</head>
<body>
  <nav>
    <a href="/" class="nav-brand">Pikzor</a>
    <div class="nav-links">
      <a href="/docs">Docs</a>
      <a href="/blog">Blog</a>
      <a href="/checker.html">OG Checker</a>
      <a href="/dashboard.html">Dashboard</a>
    </div>
  </nav>
  <main class="page">
    <h1>Blog</h1>
    <p class="subtitle">Guides, tutorials, and tips for OG images and social sharing.</p>
    ${cards || '<p style="color:#64748b">No posts yet.</p>'}
  </main>
  <footer>© 2026 Pikzor</footer>
</body>
</html>`);
});

// ── Individual post ───────────────────────────────────────────────────────────
router.get('/:slug', (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
  const file = path.join(POSTS_DIR, `${slug}.md`);

  if (!fs.existsSync(file)) {
    return res.status(404).send('<h1>Post not found</h1>');
  }

  const raw  = fs.readFileSync(file, 'utf8');
  const { meta, content } = parseFrontmatter(raw);
  const html = marked.parse(content);
  const extracted = extractFromMarkdown(content);

  const title   = meta.title       || extracted.title       || slug;
  const desc    = meta.description || extracted.description || '';
  const author  = meta.author      || 'Pikzor Team';
  const date    = meta.date    || '';

  const ogUrl = new URL(`${config.baseUrl}/og/test`);
  ogUrl.searchParams.set('template', 'og-gradient');
  ogUrl.searchParams.set('title', title);
  ogUrl.searchParams.set('author', author);
  if (date) ogUrl.searchParams.set('date', date);

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Pikzor</title>
  <meta name="description" content="${desc.replace(/"/g, '&quot;')}">
  <meta property="og:title" content="${title.replace(/"/g, '&quot;')}">
  <meta property="og:description" content="${desc.replace(/"/g, '&quot;')}">
  <meta property="og:image" content="${ogUrl.toString()}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${config.baseUrl}/blog/${slug}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${ogUrl.toString()}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0a0a0f; color: #e2e8f0; line-height: 1.7; }
    a { color: #818cf8; text-decoration: none; }
    a:hover { text-decoration: underline; }

    nav { position: sticky; top: 0; background: rgba(10,10,15,0.9);
          backdrop-filter: blur(12px); border-bottom: 1px solid #1e293b;
          padding: 0 2rem; display: flex; align-items: center;
          gap: 2rem; height: 56px; z-index: 100; }
    .nav-brand { font-weight: 700; font-size: 1.1rem; color: #fff; }
    .nav-links { display: flex; gap: 1.5rem; margin-left: auto; font-size: 0.9rem; }

    .post { max-width: 720px; margin: 0 auto; padding: 4rem 2rem; }

    .post-header { margin-bottom: 3rem; }
    .post-meta { display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; }
    .tag { background: #1e1b4b; color: #818cf8; font-size: 0.75rem;
           padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 600; }
    .date { color: #64748b; font-size: 0.85rem; }
    .back { color: #64748b; font-size: 0.85rem; margin-bottom: 1.5rem; display: block; }
    .back:hover { color: #818cf8; }
    h1 { font-size: 2.25rem; font-weight: 800; color: #fff; line-height: 1.2;
         margin-bottom: 0.75rem; }
    .author-line { color: #64748b; font-size: 0.9rem; }

    .post-body { font-size: 1.05rem; }
    .post-body h2 { font-size: 1.4rem; font-weight: 700; color: #f1f5f9;
                    margin: 2.5rem 0 1rem; padding-bottom: 0.5rem;
                    border-bottom: 1px solid #1e293b; }
    .post-body h3 { font-size: 1.15rem; font-weight: 600; color: #f1f5f9;
                    margin: 2rem 0 0.75rem; }
    .post-body p { margin-bottom: 1.25rem; color: #cbd5e1; }
    .post-body ul, .post-body ol { margin: 0 0 1.25rem 1.5rem; color: #cbd5e1; }
    .post-body li { margin-bottom: 0.4rem; }
    .post-body strong { color: #f1f5f9; font-weight: 600; }
    .post-body code { background: #1e293b; color: #818cf8; padding: 0.15em 0.4em;
                       border-radius: 4px; font-size: 0.9em; font-family: 'Fira Code', monospace; }
    .post-body pre { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px;
                     padding: 1.25rem; margin-bottom: 1.5rem; overflow-x: auto; }
    .post-body pre code { background: none; color: #e2e8f0; padding: 0;
                           font-size: 0.875rem; line-height: 1.6; }
    .post-body table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;
                       font-size: 0.95rem; }
    .post-body th { background: #0f172a; color: #f1f5f9; font-weight: 600;
                    padding: 0.75rem 1rem; text-align: left;
                    border-bottom: 2px solid #1e293b; }
    .post-body td { padding: 0.75rem 1rem; border-bottom: 1px solid #1e293b; color: #cbd5e1; }
    .post-body hr { border: none; border-top: 1px solid #1e293b; margin: 2.5rem 0; }
    .post-body blockquote { border-left: 3px solid #818cf8; padding: 0.75rem 1.25rem;
                             background: #0f172a; margin-bottom: 1.5rem; border-radius: 0 6px 6px 0; }

    footer { text-align: center; padding: 3rem; color: #475569; font-size: 0.85rem;
             border-top: 1px solid #1e293b; margin-top: 4rem; }
  </style>
</head>
<body>
  <nav>
    <a href="/" class="nav-brand">Pikzor</a>
    <div class="nav-links">
      <a href="/docs">Docs</a>
      <a href="/blog">Blog</a>
      <a href="/checker.html">OG Checker</a>
      <a href="/dashboard.html">Dashboard</a>
    </div>
  </nav>
  <main class="post">
    <header class="post-header">
      <a href="/blog" class="back">← Back to Blog</a>
      <div class="post-meta">
        <span class="tag">${meta.tag || 'Post'}</span>
        <span class="date">${date}</span>
      </div>
      <h1>${title}</h1>
      <p class="author-line">By ${author}</p>
    </header>
    <div class="post-body">${html}</div>
  </main>
  <footer>© 2026 Pikzor</footer>
</body>
</html>`);
});

module.exports = router;
