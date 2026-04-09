const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '../templates');

// In-process template cache (cleared on restart)
const templateCache = new Map();

function loadTemplate(templateId) {
  if (templateCache.has(templateId)) return templateCache.get(templateId);

  const dir = path.join(TEMPLATES_DIR, templateId);
  const htmlPath = path.join(dir, 'template.html');
  const metaPath = path.join(dir, 'meta.json');

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const entry = { html, meta };

  templateCache.set(templateId, entry);
  return entry;
}

/** List all available templates (reads meta.json from each subfolder). */
function listTemplates() {
  const dirs = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  return dirs
    .filter(name => fs.existsSync(path.join(TEMPLATES_DIR, name, 'meta.json')))
    .map(name => {
      try {
        const { meta } = loadTemplate(name);
        return meta;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Replace {{variable}} placeholders in an HTML string.
 * Unknown placeholders are left as-is.
 */
function injectVariables(html, variables) {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = variables[key];
    return val !== undefined && val !== null ? String(val) : match;
  });
}

// Watermark HTML injected for free-plan renders (appended before </body>)
const WATERMARK_HTML = `
<div style="
  position: fixed;
  bottom: 14px;
  right: 18px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.45);
  letter-spacing: 0.3px;
  pointer-events: none;
  z-index: 9999;
  text-shadow: 0 1px 3px rgba(0,0,0,0.4);
">Made with Pikzor</div>`;

const WATERMARK_HTML_DARK = `
<div style="
  position: fixed;
  bottom: 14px;
  right: 18px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: rgba(0,0,0,0.3);
  letter-spacing: 0.3px;
  pointer-events: none;
  z-index: 9999;
">Made with Pikzor</div>`;

// Templates that have a light background — use dark watermark text
const LIGHT_TEMPLATES = new Set(['og-light']);

/**
 * Build the final HTML string ready for Puppeteer.
 *
 * Handles:
 *  - Merging meta.json defaults with provided params
 *  - Dynamic title font-size based on character count
 *  - Synthetic logo_html  (img tag or brand text fallback)
 *  - Synthetic author_initial
 *  - Date auto-formatting
 *  - Synthetic description_html (for og-light)
 *  - Free-plan watermark (pass plan: 'free' in params)
 */
function buildHtml(templateId, params) {
  const { html, meta } = loadTemplate(templateId);

  // 1. Merge defaults from meta.json with caller params
  const vars = {};
  for (const v of meta.variables || []) {
    vars[v.key] = params[v.key] !== undefined && params[v.key] !== ''
      ? params[v.key]
      : (v.default ?? '');
  }

  // 2. Synthetic: logo_html
  if (vars.logo_url) {
    vars.logo_html = `<img class="logo-img" src="${escapeAttr(vars.logo_url)}" alt="logo" />`;
  } else {
    const display = vars.domain || 'Your Brand';
    vars.logo_html = `<span class="logo-text">${escapeHtml(display)}</span>`;
  }

  // 3. Synthetic: author_initial
  const author = String(vars.author || '').trim();
  vars.author_initial = author ? author[0].toUpperCase() : '?';

  // 4. Synthetic: date auto-format
  if (!vars.date) {
    vars.date = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  // 5. Synthetic: title_size — shrink font for long titles
  const titleLen = String(vars.title || '').length;
  if      (titleLen <= 35)  vars.title_size = 68;
  else if (titleLen <= 55)  vars.title_size = 58;
  else if (titleLen <= 80)  vars.title_size = 50;
  else if (titleLen <= 110) vars.title_size = 44;
  else                      vars.title_size = 38;

  // 6. Synthetic: description_html (og-light uses this placeholder)
  if (vars.description) {
    vars.description_html =
      `<p class="description">${escapeHtml(vars.description)}</p>`;
  } else {
    vars.description_html = '';
  }

  let finalHtml = injectVariables(html, vars);

  // 7. Free-plan watermark — injected into the rendered HTML before </body>
  if (params.__plan === 'free') {
    const wm = LIGHT_TEMPLATES.has(templateId) ? WATERMARK_HTML_DARK : WATERMARK_HTML;
    finalHtml = finalHtml.replace('</body>', `${wm}\n</body>`);
  }

  return finalHtml;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

module.exports = { loadTemplate, listTemplates, injectVariables, buildHtml };
