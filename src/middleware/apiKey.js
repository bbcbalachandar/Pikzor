const crypto = require('crypto');

/**
 * Middleware: require a valid API key in the Authorization header.
 * Format: Authorization: Bearer sk_live_...
 * On success: sets req.user = { id, email, plan }
 */
function requireApiKey(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const raw  = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;

  if (!raw || !raw.startsWith('sk_live_')) {
    return res.status(401).json({ error: 'Missing or invalid API key', hint: 'Authorization: Bearer sk_live_...' });
  }

  let db;
  try {
    db = require('../db/db');
  } catch (err) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const row  = db.getApiKeyByHash.get(hash);

  if (!row) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Touch last_used_at — fire and forget
  setImmediate(() => db.touchApiKey.run(hash));

  req.user = { id: row.user_id, email: row.email, plan: row.plan };
  next();
}

module.exports = { requireApiKey };
