const express = require('express');
const router  = express.Router();
const { createRateLimiter } = require('../middleware/rateLimit');

// 10 checks per IP per hour
const checkerLimit = createRateLimiter(
  (req) => `ip:checker:${req.ip || req.socket.remoteAddress}`,
  ()    => 'checker'
);

// ── Rate limit bucket for checker ─────────────────────────────────────────────
// Reuse the existing sliding-window infra but with a 1-hour window.
// We patch the limit map directly here rather than coupling config.
const CHECKER_LIMIT    = 10;
const CHECKER_WINDOW   = 60 * 60 * 1000; // 1 hour in ms

// ── Inline rate limiter (1-hour window, not 1-minute) ─────────────────────────
async function checkerRateLimit(req, res, next) {
  const cache  = require('../services/cache');
  const ip     = req.ip || req.socket.remoteAddress || 'unknown';
  const now    = Date.now();
  const win    = Math.floor(now / CHECKER_WINDOW) * CHECKER_WINDOW;
  const key    = `rl:checker:${ip}:${win}`;
  const resetAt = Math.ceil((win + CHECKER_WINDOW) / 1000);

  let count = 1;
  try {
    const c = await cache._getClient();
    if (c) {
      count = await c.incr(key);
      if (count === 1) await c.pExpire(key, CHECKER_WINDOW + 5000);
    }
  } catch { /* Redis down — skip */ }

  res.set({
    'X-RateLimit-Limit':     String(CHECKER_LIMIT),
    'X-RateLimit-Remaining': String(Math.max(0, CHECKER_LIMIT - count)),
    'X-RateLimit-Reset':     String(resetAt),
  });

  if (count > CHECKER_LIMIT) {
    res.set('Retry-After', String(resetAt - Math.floor(now / 1000)));
    return res.status(429).json({
      error:       'Too many checks. Limit: 10 per hour.',
      retry_after: resetAt - Math.floor(now / 1000),
    });
  }
  next();
}

// ── POST /checker/analyze ─────────────────────────────────────────────────────
router.post('/analyze', checkerRateLimit, async (req, res) => {
  let { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  try {
    new URL(url); // validate
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const result = await analyzeUrl(url);
    res.json(result);
  } catch (err) {
    console.error('[checker]', err.message);
    res.status(502).json({ error: 'Could not fetch URL', details: err.message });
  }
});

// ── Analysis logic ────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (compatible; Pikzor-OGChecker/1.0; +https://pikzor.com/checker)';
const FETCH_TIMEOUT = 10_000;

async function analyzeUrl(url) {
  // Fetch HTML
  let html, finalUrl, fetchError;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    finalUrl = resp.url;
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    html = await resp.text();
  } catch (err) {
    fetchError = err.name === 'AbortError' ? 'Request timed out after 10s' : err.message;
    return {
      url,
      fetchError,
      tags: {},
      issues: [{ severity: 'error', message: `Could not fetch page: ${fetchError}` }],
      score: 0,
    };
  }

  // Parse meta tags
  const tags = parseMetaTags(html, finalUrl || url);

  // Check og:image accessibility
  let imageStatus = null;
  if (tags.og_image) {
    imageStatus = await checkImage(tags.og_image);
  }

  // Generate issues
  const issues = generateIssues(tags, imageStatus, finalUrl || url);

  // Score
  const score = calculateScore(issues);

  return { url: finalUrl || url, tags, imageStatus, issues, score };
}

// ── HTML parser ───────────────────────────────────────────────────────────────

function parseMetaTags(html, pageUrl) {
  const get = (pattern) => {
    const m = html.match(pattern);
    return m ? decode(m[1]) : null;
  };

  // og: tags
  const og_title       = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const og_description = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  const og_image       = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const og_image_width = get(/<meta[^>]+property=["']og:image:width["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:width["']/i);
  const og_image_height= get(/<meta[^>]+property=["']og:image:height["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:height["']/i);
  const og_url         = get(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
  const og_type        = get(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:type["']/i);

  // twitter: tags
  const tw_card        = get(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:card["']/i);
  const tw_title       = get(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["']/i);
  const tw_description = get(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:description["']/i);
  const tw_image       = get(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
                      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

  // Fallbacks
  const title_tag  = get(/<title[^>]*>([^<]+)<\/title>/i);
  const meta_desc  = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                  || get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

  // Resolve relative og:image to absolute
  let og_image_resolved = og_image;
  if (og_image && !/^https?:\/\//i.test(og_image)) {
    try {
      og_image_resolved = new URL(og_image, pageUrl).href;
    } catch { /* leave as-is */ }
  }

  return {
    og_title, og_description, og_image, og_image_resolved, og_image_width, og_image_height,
    og_url, og_type,
    tw_card, tw_title, tw_description, tw_image,
    title_tag, meta_desc,
    // Effective values (og first, then fallback)
    effective_title:       og_title       || tw_title       || title_tag,
    effective_description: og_description || tw_description || meta_desc,
    effective_image:       og_image_resolved || tw_image,
  };
}

// ── Image HEAD check ──────────────────────────────────────────────────────────

async function checkImage(imageUrl) {
  // Resolve relative URL — but we already do that in parseMetaTags
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(imageUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    return {
      accessible: resp.ok,
      status:     resp.status,
      contentType: resp.headers.get('content-type') || null,
      contentLength: resp.headers.get('content-length') || null,
    };
  } catch (err) {
    return { accessible: false, error: err.message };
  }
}

// ── Issue generation ──────────────────────────────────────────────────────────

function generateIssues(tags, imageStatus, pageUrl) {
  const issues = [];

  // og:image
  if (!tags.og_image) {
    issues.push({ severity: 'error', code: 'NO_OG_IMAGE', message: 'No og:image found. Social platforms will not show a preview image.' });
  } else {
    // Relative URL check
    if (!/^https?:\/\//i.test(tags.og_image)) {
      issues.push({ severity: 'warning', code: 'RELATIVE_OG_IMAGE', message: `og:image uses a relative URL. Use an absolute URL (https://...).` });
    }

    // Accessibility
    if (imageStatus && !imageStatus.accessible) {
      issues.push({ severity: 'error', code: 'OG_IMAGE_INACCESSIBLE', message: `og:image URL is not accessible (${imageStatus.status || imageStatus.error}).` });
    }

    // Dimensions from tags
    const w = parseInt(tags.og_image_width,  10) || 0;
    const h = parseInt(tags.og_image_height, 10) || 0;

    if (!tags.og_image_width || !tags.og_image_height) {
      issues.push({ severity: 'info', code: 'MISSING_DIMENSIONS', message: 'og:image:width and og:image:height tags are missing. Add them to help crawlers avoid re-downloading the image.' });
    } else if (w < 600 || h < 315) {
      issues.push({ severity: 'warning', code: 'SMALL_IMAGE', message: `og:image is only ${w}×${h}px. Recommended size: 1200×630px.` });
    } else if (w < 1200 || h < 630) {
      issues.push({ severity: 'warning', code: 'SUBOPTIMAL_IMAGE', message: `og:image is ${w}×${h}px. For best quality use 1200×630px.` });
    }
  }

  // og:title
  if (!tags.og_title) {
    if (tags.title_tag) {
      issues.push({ severity: 'warning', code: 'NO_OG_TITLE', message: 'No og:title found. Platforms will fall back to the <title> tag.' });
    } else {
      issues.push({ severity: 'error', code: 'NO_TITLE', message: 'No og:title or <title> tag found.' });
    }
  }

  // og:description
  if (!tags.og_description) {
    issues.push({ severity: 'warning', code: 'NO_OG_DESCRIPTION', message: 'No og:description found. Add one for a better link preview.' });
  }

  // twitter:card
  if (!tags.tw_card) {
    issues.push({ severity: 'warning', code: 'NO_TWITTER_CARD', message: 'No twitter:card tag found. Twitter will show a small preview instead of a large image card.' });
  } else if (tags.tw_card !== 'summary_large_image' && tags.og_image) {
    issues.push({ severity: 'info', code: 'TWITTER_CARD_TYPE', message: `twitter:card is "${tags.tw_card}". Use "summary_large_image" for a large image preview.` });
  }

  // og:url
  if (!tags.og_url) {
    issues.push({ severity: 'info', code: 'NO_OG_URL', message: 'No og:url tag found. Add it to specify the canonical URL.' });
  }

  return issues;
}

// ── Score calculation ─────────────────────────────────────────────────────────

function calculateScore(issues) {
  const deductions = { error: 25, warning: 10, info: 3 };
  let score = 100;
  for (const issue of issues) {
    score -= deductions[issue.severity] ?? 0;
  }
  return Math.max(0, Math.min(100, score));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decode(str) {
  return str
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&#x27;/g, "'")
    .trim();
}

module.exports = router;
