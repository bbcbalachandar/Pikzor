const crypto = require('crypto');

/**
 * Compute a stable SHA-256 hash from a namespace string + params object.
 * Params are JSON-serialised with sorted keys for determinism.
 * Returns a 32-char hex string (truncated from 64 — still ~2^128 collision space).
 */
function paramsHash(namespace, params) {
  const stable = JSON.stringify(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .sort(([a], [b]) => a.localeCompare(b))
    )
  );
  return crypto
    .createHash('sha256')
    .update(`${namespace}:${stable}`)
    .digest('hex')
    .slice(0, 32);
}

module.exports = { paramsHash };
