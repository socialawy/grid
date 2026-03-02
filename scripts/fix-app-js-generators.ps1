#!/usr/bin/env pwsh
<#
.SYNOPSIS
    GRID Build Fix -- Remove duplicate generators block from src/shell/app.js
    
.PROBLEM
    build.js inlines src/generators/generators.js as a module.
    The same generators code (GENERATORS const + helpers) was also captured
    inside src/shell/app.js (original lines 2535-2709, app.js lines 476-650).
    This causes: "SyntaxError: Identifier 'inferSemantic' has already been declared"

.WHAT IT DOES
    1. Removes lines 476-650 from src/shell/app.js (the duplicate generators block)
    2. Runs node build.js to regenerate dist/index.html
    3. Reports line counts before/after

.USAGE
    cd E:\co\GRID
    .\scripts\fix-app-js-generators.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT    = Split-Path -Parent $PSScriptRoot
$APP_JS  = Join-Path $ROOT 'src\shell\app.js'

# Lines to remove from app.js (1-based, inclusive)
# These correspond to the GENERATORS module block (original file lines 2535-2709)
$REMOVE_FROM = 476
$REMOVE_TO   = 650

Write-Host ""
Write-Host "[GRID] Fix: Remove duplicate generators from src/shell/app.js" -ForegroundColor White
Write-Host ("=" * 55)

if (-not (Test-Path $APP_JS)) {
    Write-Error "src/shell/app.js not found: $APP_JS"
    exit 1
}

# Read current app.js
$raw   = [System.IO.File]::ReadAllText($APP_JS, [System.Text.Encoding]::UTF8)
$lines = $raw -split "`r?`n"
$before = $lines.Count

Write-Host "  app.js before: $before lines"

# Verify the block we're removing looks right
$checkLine = $lines[$REMOVE_FROM - 1]  # 0-based index
if ($checkLine -notmatch "GENERATORS") {
    Write-Host "  !! Line $REMOVE_FROM does not contain 'GENERATORS'" -ForegroundColor Yellow
    Write-Host "  !! Found: $checkLine" -ForegroundColor Yellow
    Write-Host "  !! Aborting -- check line numbers manually" -ForegroundColor Red
    exit 1
}

Write-Host "  Line $REMOVE_FROM confirmed: $($checkLine.Trim())" -ForegroundColor Cyan

# Remove lines 476-650 (convert to 0-based: 475..649)
$kept = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
    $lineNum = $i + 1  # 1-based
    if ($lineNum -ge $REMOVE_FROM -and $lineNum -le $REMOVE_TO) {
        continue  # skip this line
    }
    $kept += $lines[$i]
}

$after = $kept.Count
$removed = $before - $after

Write-Host "  Removed $removed lines ($REMOVE_FROM-$REMOVE_TO)"
Write-Host "  app.js after:  $after lines" -ForegroundColor Green

# Write back
$newContent = $kept -join "`n"
[System.IO.File]::WriteAllText($APP_JS, $newContent, [System.Text.Encoding]::UTF8)

Write-Host "  app.js saved" -ForegroundColor Green

# Rebuild
Write-Host ""
Write-Host "[GRID] Running node build.js..." -ForegroundColor White
Push-Location $ROOT
$output = node build.js 2>&1
$exit   = $LASTEXITCODE
Pop-Location

Write-Host $output

if ($exit -ne 0) {
    Write-Host "  !! build.js failed -- check output above" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[GRID] Fix applied successfully" -ForegroundColor Green
Write-Host ("=" * 55)
Write-Host "  Next: open browser, verify app works, then node tests/run-all.js"
