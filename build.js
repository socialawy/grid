#!/usr/bin/env node
/**
 * build.js — GRID concatenation build
 * Reads src/ modules in dependency order, strips ESM import/export,
 * deduplicates module destructuring, wraps in HTML shell, writes dist/index.html.
 *
 * Usage:  node build.js
 * Output: dist/index.html
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Module list — dependency order ────────────────────────────────────
const MODULES = [
  'src/core/grid-core.js',
  'src/renderers/canvas-renderer.js',
  'src/input/key-bindings.js',
  'src/input/input-system.js',
  'src/generators/generators.js',
  'src/importers/image-importer.js',
  'src/persistence/serializer.js',
  'src/persistence/opfs-store.js',
  'src/persistence/fs-access.js',
  'src/consumers/music/music-mapper.js',
  'src/consumers/music/synth-engine.js',
  'src/consumers/music/midi-output.js',
  'src/consumers/spatial/heightmap.js',
  'src/consumers/spatial/scene-builder.js',
  // Phase 6 exporters — uncomment as they land:
  // 'src/exporters/svg-exporter.js',
  // 'src/exporters/midi-exporter.js',
  // 'src/exporters/gltf-exporter.js',
  // 'src/exporters/video-exporter.js',
];

const SHELL = {
  head:  'src/shell/head.html',
  style: 'src/shell/style.css',
  body:  'src/shell/body.html',
  app:   'src/shell/app.js',
};

const OUT = 'dist/index.html';

// ── Normalize CRLF + strip ESM ────────────────────────────────────────
// Normalizes Windows line endings before regex processing.
// Strips: import ... from '...'
//         export default / export function / export { ... }
function stripEsm(src) {
  return src
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s+(async\s+)?(function|const|let|var|class)\s+/gm, '$1$2 ')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .trim();
}

// ── Strip module destructuring ────────────────────────────────────────
// src/ modules import from each other and destructure:
//   const { inferSemantic } = GridCore;              // single-line
//   const { serializeProject, deserializeProject } = Serializer;
//   const {\n  calcDensity,\n  ...\n} = GridCore;   // multi-line
//
// After stripEsm removes the import, these redeclare symbols already
// in scope from the inlined module above. Strip them all with one regex.
// Pattern: const { ...anything... } = CapitalizedName;
// The 's' flag makes '.' match newlines, handling multi-line blocks.
function stripModuleDestructuring(src) {
  return src.replace(
    /const\s*\{[^}]*\}\s*=\s*[A-Z][a-zA-Z]*\s*;/gs,
    '// [build:dedup] module destructuring — symbols provided by inlined module'
  );
}

// ── Inline a module ───────────────────────────────────────────────────
function inlineModule(relPath) {
  const full = join(__dirname, relPath);
  if (!existsSync(full)) {
    console.warn(`  ⚠  Missing: ${relPath} — skipped`);
    return `\n    // ⚠ MISSING MODULE: ${relPath}\n`;
  }
  const raw  = readFileSync(full, 'utf8');
  const src  = stripModuleDestructuring(stripEsm(raw));
  const name = relPath.replace(/^src\//, '').replace(/\.js$/, '');
  const sep  = '='.repeat(60);
  return `\n    // ${sep}\n    // ${name}\n    // ${sep}\n${src}\n`;
}

// ── Read shell files ──────────────────────────────────────────────────
function readShell(key) {
  const full = join(__dirname, SHELL[key]);
  if (!existsSync(full)) {
    console.error(`  ✗  Missing shell file: ${SHELL[key]}`);
    process.exit(1);
  }
  return readFileSync(full, 'utf8');
}

// ── Build ─────────────────────────────────────────────────────────────
console.log('[GRID] Building dist/index.html...');

const head    = readShell('head');
const style   = readShell('style');
const body    = readShell('body');
const app     = stripEsm(readShell('app'));
const modules = MODULES.map(inlineModule).join('\n');

const html = [
  '<!DOCTYPE html>',
  '<!-- GENERATED — do not edit. Source: src/shell/ + src/ modules. Run: node build.js -->',
  '<html lang="en">',
  head,
  '<style>',
  style,
  '</style>',
  '</head>',
  body,
  '  <script>',
  modules,
  '    // ============================================================',
  '    // APP',
  '    // ============================================================',
  app,
  '  </script>',
  '</body>',
  '</html>',
].join('\n');

const outPath = join(__dirname, OUT);
writeFileSync(outPath, html, 'utf8');

const lineCount = html.split('\n').length;
const kb        = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
const present   = MODULES.filter(m => existsSync(join(__dirname, m))).length;
console.log(`  ✓  dist/index.html — ${lineCount} lines, ${kb} KB`);
console.log(`  ✓  Modules inlined: ${present}/${MODULES.length}`);
