const logger = require('../utils/logger');

module.exports = function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
};
