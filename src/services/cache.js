const { createClient } = require('redis');
const config = require('../config');

let client = null;
let available = null;   // null = untested, true = ok, false = unavailable
let initPromise = null;

async function init() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const c = createClient({
      url: config.redis.url,
      socket: {
        reconnectStrategy: false, // degrade gracefully instead of retrying forever
      },
    });

    c.on('error', () => {}); // suppress post-connect error events

    try {
      await c.connect();
      client = c;
      available = true;
      console.log('[cache] Redis connected');
    } catch (err) {
      available = false;
      console.warn('[cache] Redis unavailable — caching disabled:', err.message);
    }
  })();

  return initPromise;
}

async function getClient() {
  if (available === null) await init();
  return available ? client : null;
}

/**
 * Get a cached PNG buffer by key. Returns null on miss or Redis down.
 */
async function get(key) {
  try {
    const c = await getClient();
    if (!c) return null;
    const raw = await c.get(key);
    return raw ? Buffer.from(raw, 'binary') : null;
  } catch {
    return null;
  }
}

/**
 * Cache a PNG buffer.
 * @param {string} key
 * @param {Buffer} buffer
 * @param {number} [ttlSeconds]  defaults to config.cache.ttlSeconds (30 days)
 */
async function set(key, buffer, ttlSeconds) {
  try {
    const c = await getClient();
    if (!c) return;
    const ttl = ttlSeconds ?? config.cache.ttlSeconds;
    await c.set(key, buffer.toString('binary'), { EX: ttl });
  } catch {
    // non-fatal
  }
}

/**
 * Delete a cached key.
 */
async function del(key) {
  try {
    const c = await getClient();
    if (!c) return;
    await c.del(key);
  } catch {
    // non-fatal
  }
}

// Expose raw client for modules that need direct Redis commands (e.g. rate limiter)
async function _getClient() {
  return getClient();
}

module.exports = { get, set, del, _getClient };
