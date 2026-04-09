const fs = require('fs');
const path = require('path');
const config = require('../config');

const BASE_DIR = path.resolve(config.storage.dir);
fs.mkdirSync(BASE_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolvedPath(namespace, filename) {
  const dir = path.join(BASE_DIR, namespace);
  fs.mkdirSync(dir, { recursive: true });
  // Ensure filename has .png extension
  const name = filename.endsWith('.png') ? filename : `${filename}.png`;
  return path.join(dir, name);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a PNG buffer to ./storage/{namespace}/{filename}.png
 */
async function save(namespace, filename, buffer) {
  const filePath = resolvedPath(namespace, filename);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Load a PNG buffer from ./storage/{namespace}/{filename}.png
 * Returns null if the file does not exist.
 */
async function load(namespace, filename) {
  const filePath = resolvedPath(namespace, filename);
  try {
    return await fs.promises.readFile(filePath);
  } catch {
    return null;
  }
}

/**
 * Check if a file exists without reading it.
 */
function exists(namespace, filename) {
  return fs.existsSync(resolvedPath(namespace, filename));
}

/**
 * Return the absolute filesystem path for a file.
 */
function getPath(namespace, filename) {
  return resolvedPath(namespace, filename);
}

/**
 * Return the public URL path segment for static serving.
 * e.g.  urlPath('renders', 'abc123') → '/images/renders/abc123.png'
 */
function urlPath(namespace, filename) {
  const name = filename.endsWith('.png') ? filename : `${filename}.png`;
  return `/images/${namespace}/${name}`;
}

module.exports = { save, load, exists, getPath, urlPath };
