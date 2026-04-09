/**
 * Redis sliding-window rate limiter.
 *
 * Per-plan request limits (per minute):
 *   free:    10 req/min
 *   starter: 30 req/min
 *   pro:     60 req/min
 *   (anything else defaults to free limit)
 *
 * If Redis is unavailable the limiter is a no-op — requests pass through.
 * Key format:  rl:{identifier}:{windowStart}
 */

const cache = require('../services/cache');

const LIMITS = {
  free:     10,
  starter:  30,
  pro:      60,
  business: 120,
};

const WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Build a rate-limit middleware.
 *
 * @param {(req) => string} identifierFn
 *   Returns a string key for this request (e.g. IP or "user:<id>").
 * @param {(req) => string} planFn
 *   Returns the plan name for this request ('free', 'pro', …).
 *   Defaults to 'free' if the function returns falsy.
 */
function createRateLimiter(identifierFn, planFn) {
  return async function rateLimitMiddleware(req, res, next) {
    let identifier, plan;
    try {
      identifier = identifierFn(req);
      plan       = planFn(req) || 'free';
    } catch {
      return next(); // can't determine identity — let it through
    }

    const limit = LIMITS[plan] ?? LIMITS.free;

    const now         = Date.now();
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    const resetAt     = Math.ceil((windowStart + WINDOW_MS) / 1000); // unix seconds

    // Always set headers — use limit as remaining when Redis is unavailable
    let count = 1;

    try {
      const redisClient = await getRedisClient();
      if (redisClient) {
        const key = `rl:${identifier}:${windowStart}`;
        count = await redisClient.incr(key);
        if (count === 1) await redisClient.pExpire(key, WINDOW_MS + 5000);
      }
    } catch (err) {
      console.warn('[rateLimit] Redis error (skipping enforcement):', err.message);
    }

    const remaining = Math.max(0, limit - count);

    res.set({
      'X-RateLimit-Limit':     String(limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset':     String(resetAt),
    });

    if (count > limit) {
      res.set('Retry-After', String(resetAt - Math.floor(now / 1000)));
      return res.status(429).json({
        error:       'Too many requests',
        limit,
        remaining:   0,
        reset:       resetAt,
        retry_after: resetAt - Math.floor(now / 1000),
      });
    }

    next();
  };
}

// ── Lazy Redis client (reuse the one from cache.js) ───────────────────────────
async function getRedisClient() {
  // Access the internal Redis client via cache module
  // We share the connection rather than opening a second one.
  const cacheModule = require('../services/cache');
  // Expose a thin getter — cache.js manages connect/availability
  if (typeof cacheModule._getClient === 'function') {
    return cacheModule._getClient();
  }
  return null;
}

// ── Pre-built middleware factories ─────────────────────────────────────────────

/**
 * Rate limit by IP (for /og/:token — user may not be authenticated yet).
 */
const byIp = createRateLimiter(
  (req) => `ip:${req.ip || req.socket.remoteAddress}`,
  (req) => req.user?.plan || 'free'
);

/**
 * Rate limit by authenticated user ID (for /api/v1/ routes).
 * Falls back to IP if req.user is not set.
 */
const byUser = createRateLimiter(
  (req) => req.user ? `user:${req.user.id}` : `ip:${req.ip}`,
  (req) => req.user?.plan || 'free'
);

module.exports = { createRateLimiter, byIp, byUser };
