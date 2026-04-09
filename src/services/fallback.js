/**
 * Fallback PNG — a generic Pikzor-branded card returned when rendering fails.
 * Generated once at startup by rendering a simple inline HTML template.
 * If that also fails, fallback() returns null and callers return JSON errors.
 */
const renderer = require('./renderer');
const logger   = require('../utils/logger');

let _buffer = null;
let _generating = false;

const FALLBACK_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    background: #0f172a;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .logo {
    font-size: 56px;
    font-weight: 800;
    color: #818cf8;
    letter-spacing: -2px;
    margin-bottom: 16px;
  }
  .tagline {
    font-size: 24px;
    color: #475569;
    font-weight: 400;
  }
  .bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #818cf8, #6366f1);
  }
</style>
</head>
<body>
  <div class="logo">Pikzor</div>
  <div class="tagline">OG Image Generation</div>
  <div class="bar"></div>
</body>
</html>`;

/**
 * Pre-generate the fallback buffer at startup.
 * Called from server startup — non-fatal if it fails.
 */
async function init() {
  if (_buffer || _generating) return;
  _generating = true;
  try {
    _buffer = await renderer.render(FALLBACK_HTML, 1200, 630);
    logger.info('[fallback] fallback image ready');
  } catch (err) {
    logger.warn('[fallback] could not pre-generate fallback image', { message: err.message });
  } finally {
    _generating = false;
  }
}

/**
 * Returns the fallback PNG buffer, or null if unavailable.
 */
function get() {
  return _buffer;
}

module.exports = { init, get };
