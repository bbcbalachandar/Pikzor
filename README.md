# Pikzor

Pikzor is an automated OG image generation API. Add a single URL to your site's `og:image` meta tag and every page gets a unique, cached, branded social preview card — without any per-post manual work. Pikzor renders cards with Puppeteer, caches them in Redis and on disk, and serves them as static PNGs with 30-day immutable cache headers.

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET to a random string

# 3. Initialize the database
node scripts/setup-db.js

# 4. Start the server
npm start
```

Server starts at **http://localhost:3000**. Redis is optional — the app renders without it.

Quick test: http://localhost:3000/og/test?template=og-gradient&title=Hello&author=Jane

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | no | HTTP port (default: 3000) |
| `NODE_ENV` | no | `production` hides error details from API responses |
| `BASE_URL` | yes (prod) | Public URL, used in generated image URLs |
| `DB_PATH` | no | SQLite file path (default: `./data/app.db`) |
| `REDIS_URL` | no | Redis connection (default: `redis://127.0.0.1:6379`) |
| `JWT_SECRET` | **yes** | Long random string — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `STORAGE_PATH` | no | Directory for persisted PNG files (default: `./storage`) |
| `LOGS_DIR` | no | Log file directory (default: `./logs`) |
| `CORS_ALLOWED_ORIGINS` | no | Extra comma-separated origins for `/api/*` |
| `STRIPE_SECRET_KEY` | no | Stripe live secret key |
| `STRIPE_WEBHOOK_SECRET` | no | Stripe webhook signing secret |
| `STRIPE_PRICE_STARTER` | no | Stripe price ID for Starter plan |
| `STRIPE_PRICE_PRO` | no | Stripe price ID for Pro plan |
| `RESEND_API_KEY` | no | Resend API key for transactional email |

## Deployment

### 1. Provision a fresh Ubuntu 24.04 VM (Azure, DigitalOcean, etc.)

```bash
# On the server (as root or with sudo)
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/pikzor/main/setup-server.sh | sudo bash
```

Or copy `setup-server.sh` to the server and run `sudo bash setup-server.sh`. This installs Node 20, nginx, Redis, PM2, Certbot, and all Chrome dependencies.

### 2. Deploy the app

```bash
# On the server
git clone https://github.com/YOUR_USER/pikzor.git /home/pikzor/app
cd /home/pikzor/app
cp .env.example .env
nano .env   # fill in JWT_SECRET, BASE_URL=https://pikzor.com, etc.
npm install --production
node scripts/setup-db.js
```

### 3. Configure nginx and SSL

```bash
sudo cp nginx/pikzor.conf /etc/nginx/sites-available/pikzor
sudo ln -s /etc/nginx/sites-available/pikzor /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo certbot --nginx -d pikzor.com -d www.pikzor.com
sudo systemctl reload nginx
```

### 4. Start with PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # run the printed command to enable auto-start on reboot
```

### Subsequent deploys

From your local machine (edit `SERVER` in deploy.sh first):
```bash
bash deploy.sh
```

## Architecture

| Layer | Technology |
|-------|-----------|
| HTTP server | Node.js 20 + Express 4 |
| Image rendering | Puppeteer v24 (headless Chrome) |
| Database | SQLite via better-sqlite3 |
| Cache | Redis (optional, graceful degradation) |
| Storage | Local filesystem (`./storage/`) |
| Auth | JWT (7-day) + bcrypt API keys |
| Process manager | PM2 |
| Reverse proxy | nginx + Let's Encrypt |

Templates are plain HTML/CSS files in `src/templates/`. The renderer injects title, author, brand color, and logo via `{{variable}}` placeholders, then takes a Puppeteer screenshot.

## Project structure

```
src/
  server.js           Entry point
  config.js           All env-var config
  routes/             render, auth, api, checker, blog
  services/           renderer, templates, cache, storage, fallback
  middleware/         auth, apiKey, rateLimit, planLimits
  db/                 schema.sql, db.js
  utils/              hash, tokens, logger
public/               index.html, dashboard.html, docs.html, checker.html
blog/posts/           Markdown blog posts
src/templates/        5 OG image HTML templates
nginx/pikzor.conf     nginx config
scripts/              setup-db.js, test-auth.js, test-limits.js
```
