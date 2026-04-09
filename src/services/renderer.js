const puppeteer = require('puppeteer');
const config = require('../config');
const logger = require('../utils/logger');

// ── Semaphore ─────────────────────────────────────────────────────────────────
class Semaphore {
  constructor(max) {
    this.max = max;
    this.count = 0;
    this.queue = [];
  }

  acquire() {
    return new Promise((resolve) => {
      if (this.count < this.max) {
        this.count++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.count--;
    if (this.queue.length > 0) {
      this.count++;
      this.queue.shift()();
    }
  }
}

// ── Renderer ──────────────────────────────────────────────────────────────────
class Renderer {
  constructor() {
    this.browser = null;
    this.renderCount = 0;
    this.semaphore = new Semaphore(config.renderer.maxConcurrent);
    this.launching = false;
    this.launchPromise = null;
  }

  async getBrowser() {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }
    return this._launch();
  }

  async _launch() {
    // Deduplicate concurrent launch calls
    if (this.launchPromise) return this.launchPromise;

    this.launchPromise = (async () => {
      if (this.browser) {
        try { await this.browser.close(); } catch { /* ignore */ }
        this.browser = null;
      }

      logger.info('[renderer] launching browser');
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      this.renderCount = 0;
      logger.info('[renderer] browser ready');
    })();

    try {
      await this.launchPromise;
    } finally {
      this.launchPromise = null;
    }

    return this.browser;
  }

  async _restartInBackground() {
    setImmediate(() => {
      this._launch().catch((err) => logger.error('[renderer] background restart failed', err));
    });
  }

  /**
   * Render an HTML string to a PNG buffer.
   * @param {string} html     Full HTML document string
   * @param {number} width    Viewport / clip width  (default 1200)
   * @param {number} height   Viewport / clip height (default 630)
   * @returns {Promise<Buffer>} PNG image buffer
   */
  async render(html, width = 1200, height = 630) {
    await this.semaphore.acquire();
    let page;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });

      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: config.renderer.timeoutMs,
      });

      const buffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width, height },
      });

      this.renderCount++;
      if (this.renderCount >= config.renderer.restartAfter) {
        logger.info('[renderer] render limit reached — scheduling restart');
        this._restartInBackground();
      }

      return buffer;
    } finally {
      if (page) {
        try { await page.close(); } catch { /* ignore */ }
      }
      this.semaphore.release();
    }
  }

  async shutdown() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new Renderer();
