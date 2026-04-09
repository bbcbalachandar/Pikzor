const crypto = require('crypto');

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generate a short URL-safe token like "t_xK9mP2q" (t_ + 7 base62 chars).
 */
function generateShortToken() {
  const bytes = crypto.randomBytes(7);
  const suffix = Array.from(bytes).map(b => BASE62[b % 62]).join('');
  return `t_${suffix}`;
}

/**
 * Generate a full API key string: "sk_live_" + 40 random hex chars.
 * Returns { raw, hash, prefix }
 *   raw    — plaintext key shown to user once
 *   hash   — SHA-256 to store in DB
 *   prefix — first 12 chars of raw key (for display in key list)
 */
function generateApiKey() {
  const random = crypto.randomBytes(20).toString('hex'); // 40 hex chars
  const raw    = `sk_live_${random}`;
  const hash   = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 14); // "sk_live_" + first 6 random chars
  return { raw, hash, prefix };
}

module.exports = { generateShortToken, generateApiKey };
