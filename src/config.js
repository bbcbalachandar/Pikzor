require('dotenv').config();

module.exports = {
  port:    process.env.PORT    || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',

  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  },

  db: {
    path: process.env.DB_PATH || './data/app.db',
  },

  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,

  storage: {
    // Support both STORAGE_PATH and legacy STORAGE_DIR
    dir: process.env.STORAGE_PATH || process.env.STORAGE_DIR || './storage',
  },

  logs: {
    dir: process.env.LOGS_DIR || './logs',
  },

  renderer: {
    maxConcurrent: 3,
    restartAfter:  100,
    timeoutMs:     10000,
  },

  cache: {
    ttlSeconds: 60 * 60 * 24 * 30, // 30 days
  },

  cors: {
    allowedOrigins: [
      ...(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
      process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
    ],
  },

  stripe: {
    secretKey:      process.env.STRIPE_SECRET_KEY      || '',
    webhookSecret:  process.env.STRIPE_WEBHOOK_SECRET  || '',
    priceStarter:   process.env.STRIPE_PRICE_STARTER   || '',
    pricePro:       process.env.STRIPE_PRICE_PRO       || '',
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
  },
};
