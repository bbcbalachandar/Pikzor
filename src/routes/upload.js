const express = require('express');
const multer  = require('multer');
const path    = require('path');
const crypto  = require('crypto');
const fs      = require('fs');
const router  = express.Router();

const config         = require('../config');
const db             = require('../db/db');
const { requireJwt } = require('../middleware/auth');
const logger         = require('../utils/logger');

const LOGOS_DIR = path.resolve(config.storage.dir, 'logos');
fs.mkdirSync(LOGOS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOGOS_DIR),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    cb(null, ok.includes(file.mimetype));
  },
});

// ── POST /upload/logo ──────────────────────────────────────────────────────────
router.post('/logo', requireJwt, upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or unsupported type (png/jpg/gif/webp/svg)' });
  }

  const logoUrl = `${config.baseUrl}/images/logos/${req.file.filename}`;

  // Persist to user record
  const user = db.getUserById.get(req.user.id);
  db.updateUserBranding.run({
    brand_color: user.brand_color,
    logo_url:    logoUrl,
    id:          req.user.id,
  });

  logger.info(`[upload/logo] user ${req.user.id} uploaded logo: ${req.file.filename}`);
  res.json({ url: logoUrl });
});

module.exports = router;
