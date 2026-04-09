#!/usr/bin/env bash
# deploy.sh — Deploy Pikzor to production via SSH.
#
# Usage: ./deploy.sh
# Edit SERVER and APP_DIR below before running.

set -e

SERVER="ubuntu@YOUR_VM_IP"   # <-- change this
APP_DIR="/home/pikzor/app"

echo "==> Deploying to $SERVER:$APP_DIR"

ssh "$SERVER" bash << EOF
  set -e

  cd "$APP_DIR"

  echo "--- Pulling latest code"
  git pull origin main

  echo "--- Installing dependencies"
  npm install --production

  echo "--- Running database setup"
  node scripts/setup-db.js

  echo "--- Restarting PM2"
  if pm2 list | grep -q pikzor; then
    pm2 restart pikzor
  else
    pm2 start ecosystem.config.js --env production
    pm2 save
  fi

  echo "Deployment complete"
EOF
