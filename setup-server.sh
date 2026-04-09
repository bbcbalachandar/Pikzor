#!/usr/bin/env bash
# setup-server.sh — One-time setup for a fresh Ubuntu 24.04 VM.
# Run as root or with sudo: sudo bash setup-server.sh

set -e

echo "==> Updating apt"
apt-get update -y
apt-get upgrade -y

echo "==> Installing Node.js 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> Installing nginx, Redis, Certbot"
apt-get install -y nginx redis-server certbot python3-certbot-nginx

echo "==> Installing Chrome / Puppeteer system dependencies"
apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    wget \
    xdg-utils

echo "==> Installing PM2 globally"
npm install -g pm2

echo "==> Creating app directories"
mkdir -p /home/pikzor/app/storage
mkdir -p /home/pikzor/app/logs
mkdir -p /home/pikzor/app/data

echo "==> Enabling and starting Redis"
systemctl enable redis-server
systemctl start redis-server

echo "==> Enabling and starting nginx"
systemctl enable nginx
systemctl start nginx

echo ""
echo "=========================================="
echo "Server setup complete. Next steps:"
echo "=========================================="
echo ""
echo "1. Clone your repo into /home/pikzor/app"
echo "   git clone https://github.com/YOUR_USER/pikzor.git /home/pikzor/app"
echo ""
echo "2. Copy .env.example to .env and fill in values"
echo "   cp /home/pikzor/app/.env.example /home/pikzor/app/.env"
echo "   nano /home/pikzor/app/.env"
echo ""
echo "3. Run npm install --production"
echo "   cd /home/pikzor/app && npm install --production"
echo ""
echo "4. Run node scripts/setup-db.js to initialize database"
echo "   node /home/pikzor/app/scripts/setup-db.js"
echo ""
echo "5. Copy nginx/pikzor.conf to /etc/nginx/sites-available/pikzor"
echo "   cp /home/pikzor/app/nginx/pikzor.conf /etc/nginx/sites-available/pikzor"
echo ""
echo "6. Run: sudo ln -s /etc/nginx/sites-available/pikzor /etc/nginx/sites-enabled/"
echo ""
echo "7. Remove default: sudo rm /etc/nginx/sites-enabled/default"
echo ""
echo "8. Run: sudo certbot --nginx -d pikzor.com -d www.pikzor.com"
echo ""
echo "9. Run: pm2 start ecosystem.config.js --env production"
echo ""
echo "10. Run: pm2 save && pm2 startup"
echo "    (then run the printed command to enable PM2 on boot)"
echo ""
