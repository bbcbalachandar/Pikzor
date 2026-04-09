const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Middleware: require a valid JWT in the Authorization header.
 * Format: Authorization: Bearer <jwt>
 * On success: sets req.user = { id, email, plan }
 */
function requireJwt(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing token', hint: 'Authorization: Bearer <jwt>' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, email: payload.email, plan: payload.plan };
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: msg });
  }
}

/**
 * Issue a signed JWT for a user row.
 */
function signJwt(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, plan: user.plan },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

module.exports = { requireJwt, signJwt };
