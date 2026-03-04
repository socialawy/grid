/**
 * SVG Exporter tests — Task 6.1
 * Pure Node, zero DOM.
 */

import { gridToSvg, svgExportDefaults } from '../src/exporters/svg-exporter.js';
import GridCore from '../src/core/grid-core.js';

const { createGrid, setCell, createFrame } = GridCore;

let passed = 0, failed = 0;
const testOutputs = [];

function assert(cond, msg) {
  if (cond) { passed++; testOutputs.push({ status: 'pass', name: msg }); }
  else { failed++; testOutputs.push({ status: 'fail', name: msg }); console.error('  FAIL:', msg); }
}

function makeGrid(w, h) {
  return createGrid(w, h, '@#. ', '#00ff88', { name: 'test' });
}

console.log('\n🧪 SVG Exporter (Task 6.1)\n' + '='.repeat(50));

// --- defaults ---
{
  const d = svgExportDefaults();
  assert(d.fontSize === 14, 'default fontSize is 14');
  assert(d.fontFamily.includes('monospace'), 'default fontFamily includes monospace');
  assert(d.background === '#0a0a1a', 'default background is dark');
  assert(d.includeGrid === false, 'grid lines off by default');
  assert(d.frameIndex === 0, 'default frame is 0');
}

// --- empty grid ---
{
  const g = makeGrid(3, 2);
  const svg = gridToSvg(g);
  assert(svg.startsWith('<svg'), 'output starts with <svg');
  assert(svg.endsWith('</svg>'), 'output ends with </svg>');
  assert(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'has SVG namespace');
  assert(!svg.includes('<text'), 'empty grid has no <text> elements');
}

// --- single cell ---
{
  const g = makeGrid(5, 5);
  g.frames[0] = setCell(g.frames[0], 0, 0, { char: '@', color: '#ff0000' });
  const svg = gridToSvg(g);
  assert(svg.includes('<text'), 'has <text> element');
  assert(svg.includes('fill="#ff0000"'), 'cell color as fill');
  assert(svg.includes('>@</text>'), 'cell char as text content');
}

// --- viewBox dimensions ---
{
  const g = makeGrid(10, 8);
  const svg = gridToSvg(g, { fontSize: 16 });
  assert(svg.includes('viewBox="0 0 96 128"'), 'viewBox matches grid dimensions x fontSize');
}

// --- custom background ---
{
  const g = makeGrid(2, 2);
  const svg = gridToSvg(g, { background: '#ffffff' });
  assert(svg.includes('fill="#ffffff"'), 'custom background color in rect');
}

// --- transparent background ---
{
  const g = makeGrid(2, 2);
  const svg = gridToSvg(g, { background: 'transparent' });
  assert(!svg.includes('<rect'), 'no background rect when transparent');
}

// --- grid lines ---
{
  const g = makeGrid(3, 3);
  const svg = gridToSvg(g, { includeGrid: true });
  assert(svg.includes('<line'), 'grid lines rendered as <line> elements');
}

// --- no grid lines by default ---
{
  const g = makeGrid(3, 3);
  const svg = gridToSvg(g);
  assert(!svg.includes('<line'), 'no grid lines by default');
}

// --- multiple cells preserve order ---
{
  const g = makeGrid(4, 4);
  g.frames[0] = setCell(g.frames[0], 0, 0, { char: 'A', color: '#ff0000' });
  g.frames[0] = setCell(g.frames[0], 0, 1, { char: 'B', color: '#00ff00' });
  g.frames[0] = setCell(g.frames[0], 0, 2, { char: 'C', color: '#0000ff' });
  const svg = gridToSvg(g);
  const aIdx = svg.indexOf('>A</text>');
  const bIdx = svg.indexOf('>B</text>');
  const cIdx = svg.indexOf('>C</text>');
  assert(aIdx < bIdx && bIdx < cIdx, 'cells rendered in row-major order');
}

// --- frame index selects correct frame ---
{
  const g = makeGrid(3, 3);
  g.frames[0] = setCell(g.frames[0], 0, 0, { char: 'X', color: '#111111' });
  const f1 = createFrame(g, 'second');
  f1.cells = [{ x: 0, y: 0, char: 'Y', color: '#222222', density: 0.5, semantic: 'solid' }];
  g.frames.push(f1);
  const svg0 = gridToSvg(g, { frameIndex: 0 });
  const svg1 = gridToSvg(g, { frameIndex: 1 });
  assert(svg0.includes('>X</text>'), 'frame 0 has X');
  assert(svg1.includes('>Y</text>'), 'frame 1 has Y');
  assert(!svg0.includes('>Y</text>'), 'frame 0 does not have Y');
}

// --- special chars are XML-escaped ---
{
  const g = makeGrid(3, 3);
  g.frames[0] = setCell(g.frames[0], 0, 0, { char: '<', color: '#aaaaaa' });
  g.frames[0] = setCell(g.frames[0], 1, 0, { char: '&', color: '#bbbbbb' });
  const svg = gridToSvg(g);
  assert(svg.includes('&lt;'), '< is escaped to &lt;');
  assert(svg.includes('&amp;'), '& is escaped to &amp;');
}

// --- font family option ---
{
  const g = makeGrid(2, 2);
  const svg = gridToSvg(g, { fontFamily: 'IBM Plex Mono' });
  assert(svg.includes('font-family="IBM Plex Mono"'), 'custom font family applied');
}

// --- output is valid standalone SVG ---
{
  const g = makeGrid(2, 2);
  g.frames[0] = setCell(g.frames[0], 0, 0, { char: '#', color: '#00ff88' });
  const svg = gridToSvg(g);
  assert(svg.includes('xmlns'), 'has xmlns');
  assert(svg.split('<text').length === 2, 'exactly one <text> element for one cell');
}

// --- density does not affect SVG output ---
{
  const g = makeGrid(3, 3);
  g.frames[0] = setCell(g.frames[0], 0, 0, { char: '@', color: '#ff0000', density: 0.1 });
  g.frames[0] = setCell(g.frames[0], 1, 0, { char: '@', color: '#ff0000', density: 0.9 });
  const svg = gridToSvg(g);
  const matches = svg.match(/<text/g);
  assert(matches && matches.length === 2, 'both cells rendered regardless of density');
}

// --- large grid does not crash ---
{
  const g = makeGrid(200, 100);
  g.frames[0] = setCell(g.frames[0], 0, 0, { char: 'X', color: '#ffffff' });
  g.frames[0] = setCell(g.frames[0], 199, 99, { char: 'Y', color: '#ffffff' });
  const svg = gridToSvg(g);
  assert(svg.includes('>X</text>'), 'first cell in large grid');
  assert(svg.includes('>Y</text>'), 'last cell in large grid');
}

// --- out of range frameIndex falls back to frame 0 ---
{
  const g = makeGrid(3, 3);
  g.frames[0] = setCell(g.frames[0], 0, 0, { char: 'Z', color: '#ffffff' });
  const svg = gridToSvg(g, { frameIndex: 99 });
  assert(svg.includes('>Z</text>'), 'out-of-range frameIndex falls back to frame 0');
}

console.log(`\ntest-svg-exporter.js: ${passed} passed, ${failed} failed\n`);
export const results = {
  passed,
  failed,
  skipped: 0,
  summary: `SVG Exporter: ${passed} passed, ${failed} failed`
};