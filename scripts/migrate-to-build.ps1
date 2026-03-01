#!/usr/bin/env pwsh
<#
.SYNOPSIS
    GRID Build Migration — Task B.1
    Extracts src/shell/{head.html, style.css, body.html, app.js} from
    the current dist/index.html, then writes build.js at project root.

.USAGE
    cd E:\co\GRID
    .\scripts\migrate-to-build.ps1

.WHAT IT DOES
    1. Reads dist/index.html (current 3155-line monolith)
    2. Extracts 4 shell source files into src/shell/
    3. Writes build.js at project root
    4. Adds build/dev scripts to package.json
    5. Runs node build.js to verify output
    6. Does NOT delete dist/index.html until you verify manually

.WHAT IT DOES NOT DO
    - Modify any src/ modules
    - Run tests (do that yourself after: node tests/run-all.js)
    - Delete anything (safe to re-run)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Config ────────────────────────────────────────────────────────────
$ROOT      = Split-Path -Parent $PSScriptRoot   # project root (scripts/ is one level down)
$SRC_HTML  = Join-Path $ROOT 'dist\index.html'
$SHELL_DIR = Join-Path $ROOT 'src\shell'

# Verified line numbers from analysis (1-based, inclusive)
# Head:   lines  4–22   (<head> content, excludes <html> wrapper)
# Style:  lines 24–571  (CSS content, excludes <style> tags)
# Body:   lines 575–873 (<body> through end of HTML, excludes <script> tag)
# App:    lines 2060–3152 (APPLICATION STATE through end of JS, excludes </script></body>)

$HEAD_START  = 4;    $HEAD_END  = 22
$STYLE_START = 24;   $STYLE_END = 571
$BODY_START  = 575;  $BODY_END  = 873
$APP_START   = 2060; $APP_END   = 3152

# ── Helpers ───────────────────────────────────────────────────────────

function Write-Step([string]$msg) {
    Write-Host "  → $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "  ⚠ $msg" -ForegroundColor Yellow
}

function Extract-Lines {
    param([string[]]$lines, [int]$from, [int]$to)
    # $from/$to are 1-based inclusive
    $lines[($from - 1)..($to - 1)] -join "`n"
}

# ── Read source ───────────────────────────────────────────────────────

Write-Host "`n[GRID] Build Migration — Task B.1" -ForegroundColor White
Write-Host "=" * 50

if (-not (Test-Path $SRC_HTML)) {
    Write-Error "dist/index.html not found at: $SRC_HTML"
    exit 1
}

Write-Step "Reading dist/index.html..."
# Read as UTF-8, split on any newline
$raw   = [System.IO.File]::ReadAllText($SRC_HTML, [System.Text.Encoding]::UTF8)
$lines = $raw -split "`r?`n"
$total = $lines.Count
Write-Ok "$total lines read"

if ($total -lt 3150) {
    Write-Warn "Line count ($total) lower than expected (~3155). Verify file is correct."
}

# ── Create output directory ───────────────────────────────────────────

Write-Step "Creating src/shell/..."
New-Item -ItemType Directory -Path $SHELL_DIR -Force | Out-Null
Write-Ok "src/shell/ ready"

# ── Extract: head.html ────────────────────────────────────────────────
# Content of <head> tag (meta, CDN script) without the <head> wrapper tags themselves
# build.js will wrap in <head>...</head>

Write-Step "Extracting src/shell/head.html (lines $HEAD_START-$HEAD_END)..."
$headContent = Extract-Lines $lines $HEAD_START $HEAD_END
$headPath    = Join-Path $SHELL_DIR 'head.html'
[System.IO.File]::WriteAllText($headPath, $headContent, [System.Text.Encoding]::UTF8)
$headLines   = ($headContent -split "`n").Count
Write-Ok "head.html — $headLines lines"

# ── Extract: style.css ────────────────────────────────────────────────
# CSS content without <style>...</style> wrapper tags
# build.js will wrap in <style>...</style>

Write-Step "Extracting src/shell/style.css (lines $STYLE_START-$STYLE_END)..."
$styleContent = Extract-Lines $lines $STYLE_START $STYLE_END
$stylePath    = Join-Path $SHELL_DIR 'style.css'
[System.IO.File]::WriteAllText($stylePath, $styleContent, [System.Text.Encoding]::UTF8)
$styleLines   = ($styleContent -split "`n").Count
Write-Ok "style.css — $styleLines lines"

# ── Extract: body.html ────────────────────────────────────────────────
# Full <body> HTML structure (toolbar, sidebar, canvas, modals)
# Excludes the <script> block that follows it
# build.js will inject this verbatim

Write-Step "Extracting src/shell/body.html (lines $BODY_START-$BODY_END)..."
$bodyContent = Extract-Lines $lines $BODY_START $BODY_END
$bodyPath    = Join-Path $SHELL_DIR 'body.html'
[System.IO.File]::WriteAllText($bodyPath, $bodyContent, [System.Text.Encoding]::UTF8)
$bodyLines   = ($bodyContent -split "`n").Count
Write-Ok "body.html — $bodyLines lines"

# ── Extract: app.js ───────────────────────────────────────────────────
# APPLICATION STATE through end of all app logic
# Includes: state vars, init, input setup, generators UI, image import UI,
#           3D mode functions, modals, auto-save, settings
# Does NOT include the inlined module blocks (876-2059) — build.js re-injects those
# Does NOT include the </script></body></html> trailer

Write-Step "Extracting src/shell/app.js (lines $APP_START-$APP_END)..."
$appContent = Extract-Lines $lines $APP_START $APP_END
$appPath    = Join-Path $SHELL_DIR 'app.js'
[System.IO.File]::WriteAllText($appPath, $appContent, [System.Text.Encoding]::UTF8)
$appLines   = ($appContent -split "`n").Count
Write-Ok "app.js — $appLines lines"

# ── Write: build.js ───────────────────────────────────────────────────

Write-Step "Writing build.js..."
$buildJs = @'
#!/usr/bin/env node
/**
 * build.js — GRID concatenation build
 * Reads src/ modules in dependency order, strips ESM import/export,
 * wraps in HTML shell, writes dist/index.html.
 *
 * Usage:  node build.js
 * Output: dist/index.html
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Module list — dependency order ────────────────────────────────────
// Each module is read, ESM-stripped, and injected before app.js.
// Add new modules here as phases progress.
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

// ── Strip ESM import/export declarations ──────────────────────────────
function stripEsm(src) {
  return src
    // Remove: import ... from '...'
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    // Remove: export default
    .replace(/^export\s+default\s+/gm, '')
    // Remove: export function/const/class/let/var
    .replace(/^export\s+(async\s+)?(function|const|let|var|class)\s+/gm, '$1$2 ')
    // Remove: export { ... }
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .trim();
}

// ── Read a src module, strip ESM, wrap in section comment ─────────────
function inlineModule(relPath) {
  const full = join(__dirname, relPath);
  if (!existsSync(full)) {
    console.warn(`  ⚠  Missing: ${relPath} — skipped`);
    return `\n    // ⚠ MISSING MODULE: ${relPath}\n`;
  }
  const src  = readFileSync(full, 'utf8');
  const name = relPath.replace(/^src\//, '').replace(/\.js$/, '');
  const sep  = '='.repeat(60);
  return `\n    // ${sep}\n    // ${name}\n    // ${sep}\n${stripEsm(src)}\n`;
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

const html = `<!DOCTYPE html>
<html lang="en">
${head}
<style>
${style}
</style>
</head>
${body}
  <script>
${modules}
    // ============================================================
    // APP
    // ============================================================
${app}
  </script>
</body>
</html>`;

const outPath = join(__dirname, OUT);
writeFileSync(outPath, html, 'utf8');

const lineCount = html.split('\n').length;
const kb        = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`  ✓  dist/index.html — ${lineCount} lines, ${kb} KB`);
console.log(`  ✓  Modules inlined: ${MODULES.filter(m => existsSync(join(__dirname, m))).length}/${MODULES.length}`);
'@

$buildPath = Join-Path $ROOT 'build.js'
[System.IO.File]::WriteAllText($buildPath, $buildJs, [System.Text.Encoding]::UTF8)
Write-Ok "build.js written"

# ── Update package.json ───────────────────────────────────────────────

Write-Step "Updating package.json scripts..."
$pkgPath = Join-Path $ROOT 'package.json'
$pkg     = Get-Content $pkgPath -Raw | ConvertFrom-Json

# Add build and dev scripts
$pkg.scripts | Add-Member -NotePropertyName 'build' -NotePropertyValue 'node build.js' -Force
$pkg.scripts | Add-Member -NotePropertyName 'dev'   -NotePropertyValue 'node build.js && npx serve dist -p 3000' -Force

$pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding UTF8
Write-Ok "package.json updated (added: build, dev)"

# ── Verify: run build.js ──────────────────────────────────────────────

Write-Host "`n[GRID] Running node build.js to verify..." -ForegroundColor White
Push-Location $ROOT
try {
    $result = node build.js 2>&1
    Write-Host $result
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "build.js exited with code $LASTEXITCODE — check output above"
    } else {
        Write-Ok "Build succeeded"
    }
} finally {
    Pop-Location
}

# ── Summary ───────────────────────────────────────────────────────────

Write-Host "`n[GRID] Migration complete" -ForegroundColor Green
Write-Host "=" * 50
Write-Host "  Created:"
Write-Host "    src/shell/head.html   ($headLines lines)"
Write-Host "    src/shell/style.css   ($styleLines lines)"
Write-Host "    src/shell/body.html   ($bodyLines lines)"
Write-Host "    src/shell/app.js      ($appLines lines)"
Write-Host "    build.js              (root)"
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1. Open dist/index.html in browser — verify it looks identical"
Write-Host "    2. node tests/run-all.js — verify 661 pass"
Write-Host "    3. If both pass: the old dist/index.html is now generated, not hand-edited"
Write-Host "    4. Add 'node build.js' to your commit workflow"
Write-Host ""
Write-Host "  DO NOT manually edit dist/index.html after this point."
Write-Host "  Edit src/shell/app.js or src/shell/style.css instead."
Write-Host "  Run 'node build.js' to regenerate."
