/**
 * Minimal file + stderr logger.
 * Writes to LOGS_DIR/error.log (defaults to ./logs/error.log).
 * Never throws — if the log file can't be written, errors go to stderr only.
 */
const fs   = require('fs');
const path = require('path');

const LOGS_DIR = path.resolve(process.env.LOGS_DIR || './logs');
const LOG_FILE = path.join(LOGS_DIR, 'error.log');
const IS_PROD  = process.env.NODE_ENV === 'production';

let dirEnsured = false;
function ensureDir() {
  if (dirEnsured) return;
  try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch { /* ignore */ }
  dirEnsured = true;
}

function fmt(level, message, meta) {
  const ts    = new Date().toISOString();
  const extra = meta ? ' ' + JSON.stringify(meta) : '';
  return `${ts} [${level}] ${message}${extra}\n`;
}

function writeFile(line) {
  ensureDir();
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* silent */ }
}

function error(message, err) {
  const meta = err
    ? { message: err.message, ...(!IS_PROD && { stack: err.stack }) }
    : undefined;
  const line = fmt('ERROR', message, meta);
  process.stderr.write(line);
  writeFile(line);
}

function warn(message, meta) {
  const line = fmt('WARN', message, meta);
  process.stderr.write(line);
  writeFile(line);
}

function info(message) {
  // In production PM2 captures stdout to out.log
  process.stdout.write(fmt('INFO', message));
}

module.exports = { error, warn, info };
