/**
 * Monthly render limit enforcement.
 *
 * Free:    50  renders/month
 * Starter: 1000
 * Pro:     5000
 * Business: unlimited
 *
 * Cached responses do NOT count against the monthly limit
 * (they are served before this middleware would block anything).
 *
 * Usage: apply BEFORE the actual render, AFTER auth middleware.
 * req.user must be set with { id, plan }.
 */

const MONTHLY_LIMITS = {
  free:     50,
  starter:  1000,
  pro:      5000,
  business: Infinity,
};

function enforceMonthlyLimit(req, res, next) {
  // If no user (e.g. /og/test), skip
  if (!req.user) return next();

  let db;
  try {
    db = require('../db/db');
  } catch {
    return next(); // DB unavailable — let it through
  }

  const month = new Date().toISOString().slice(0, 7);
  const row   = db.getUsageMonthly.get(req.user.id, month) || { render_count: 0 };
  const limit = MONTHLY_LIMITS[req.user.plan] ?? MONTHLY_LIMITS.free;

  if (limit !== Infinity && row.render_count >= limit) {
    return res.status(402).json({
      error:       'Monthly render limit reached',
      used:        row.render_count,
      limit,
      plan:        req.user.plan,
      upgrade_url: '/pricing',
    });
  }

  next();
}

module.exports = { enforceMonthlyLimit, MONTHLY_LIMITS };
