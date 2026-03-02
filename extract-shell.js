#!/usr/bin/env node
// extract-shell.js — Split working dist/index.html into src/shell/ files
// Run once, then delete this file.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const lines = readFileSync('dist/index.html', 'utf8').split(/\r?\n/);

let headLine = -1, styleOpen = -1, styleClose = -1, bodyLine = -1, scriptLine = -1;

for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t === '<head>' && headLine === -1) headLine = i;
  else if (t === '<style>' && styleOpen === -1) styleOpen = i;
  else if (t === '</style>' && styleClose === -1) styleClose = i;
  else if (t === '<body>' && bodyLine === -1) bodyLine = i;
}
// Main <script> is the last one — search backwards
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].trim() === '<script>') { scriptLine = i; break; }
}

const head  = lines.slice(headLine, styleOpen).join('\n');
const style = lines.slice(styleOpen + 1, styleClose).join('\n');
const body  = lines.slice(bodyLine, scriptLine).join('\n');

mkdirSync('src/shell', { recursive: true });
writeFileSync('src/shell/head.html', head, 'utf8');
writeFileSync('src/shell/style.css', style, 'utf8');
writeFileSync('src/shell/body.html', body, 'utf8');

console.log(`head.html: ${head.split('\n').length} lines`);
console.log(`style.css: ${style.split('\n').length} lines`);
console.log(`body.html: ${body.split('\n').length} lines`);
console.log('Done. Now run: node build.js');