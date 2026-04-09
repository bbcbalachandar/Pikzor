module.exports = {
  apps: [
    {
      name: 'pikzor',
      script: 'src/server.js',
      instances: 1,        // single instance — Puppeteer browser is a singleton
      exec_mode: 'fork',
      max_memory_restart: '3G',

      // Logs
      error_file:      './logs/error.log',
      out_file:        './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs:      true,

      // Restarts
      watch:         false,
      autorestart:   true,
      restart_delay: 3000,
      max_restarts:  10,

      env: {
        NODE_ENV: 'development',
        PORT:     3000,
      },

      env_production: {
        NODE_ENV: 'production',
        PORT:     3000,
      },
    },
  ],
};
