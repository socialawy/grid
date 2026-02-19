/**
 * test-webgl2-modules.js — Tests for font-atlas.js and instance-buffer.js
 * ESM module. Run with: node --experimental-vm-modules tests/test-webgl2-modules.js
 * Or ensure package.json has "type": "module"
 *
 * Font atlas tests skipped in Node (no canvas API) — browser covers those.
 */

// ============================================================
// MINI TEST FRAMEWORK
// ============================================================

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEqual'}: expected ${expected}, got ${actual}`);
  }
}

function assertClose(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg || 'assertClose'}: expected ~${expected}, got ${actual} (tolerance ${tolerance})`);
  }
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   ${e.message}`);
  }
}

function skip(name, reason) {
  skipped++;
  console.log(`⏭️  ${name} — ${reason}`);
}

// ============================================================
// MODULE LOADING (ESM)
// ============================================================

import {
  FLOATS_PER_INSTANCE,
  buildInstanceBuffer,
  parseHexColor,
  getBufferByteSize
} from '../src/rendering/instance-buffer.js';

// ============================================================
// TESTS: parseHexColor
// ============================================================

console.log('\n=== parseHexColor ===\n');

test('parseHexColor — #RRGGBB white', () => {
  const [r, g, b] = parseHexColor('#ffffff');
  assertClose(r, 1, 0.001, 'red');
  assertClose(g, 1, 0.001, 'green');
  assertClose(b, 1, 0.001, 'blue');
});

test('parseHexColor — #RRGGBB black', () => {
  const [r, g, b] = parseHexColor('#000000');
  assertClose(r, 0, 0.001, 'red');
  assertClose(g, 0, 0.001, 'green');
  assertClose(b, 0, 0.001, 'blue');
});

test('parseHexColor — #RRGGBB red', () => {
  const [r, g, b] = parseHexColor('#ff0000');
  assertClose(r, 1, 0.001, 'red');
  assertClose(g, 0, 0.001, 'green');
  assertClose(b, 0, 0.001, 'blue');
});

test('parseHexColor — #RRGGBB arbitrary', () => {
  const [r, g, b] = parseHexColor('#33aaff');
  assertClose(r, 0x33 / 255, 0.001, 'red');
  assertClose(g, 0xaa / 255, 0.001, 'green');
  assertClose(b, 0xff / 255, 0.001, 'blue');
});

test('parseHexColor — #RGB shorthand', () => {
  const [r, g, b] = parseHexColor('#faf');
  assertClose(r, 0xff / 255, 0.001, 'red');
  assertClose(g, 0xaa / 255, 0.001, 'green');
  assertClose(b, 0xff / 255, 0.001, 'blue');
});

test('parseHexColor — null fallback', () => {
  const [r, g, b] = parseHexColor(null);
  assertClose(r, 0, 0.001, 'red');
  assertClose(g, 1, 0.001, 'green');
  assertClose(b, 0, 0.001, 'blue');
});

test('parseHexColor — empty string fallback', () => {
  const [r, g, b] = parseHexColor('');
  assertClose(r, 0, 0.001, 'red');
  assertClose(g, 1, 0.001, 'green');
  assertClose(b, 0, 0.001, 'blue');
});

test('parseHexColor — invalid format fallback', () => {
  const [r, g, b] = parseHexColor('not-a-color');
  assertClose(r, 0, 0.001, 'red');
  assertClose(g, 1, 0.001, 'green');
  assertClose(b, 0, 0.001, 'blue');
});

// ============================================================
// TESTS: Constants
// ============================================================

console.log('\n=== Constants ===\n');

test('FLOATS_PER_INSTANCE is 5', () => {
  assertEqual(FLOATS_PER_INSTANCE, 5);
});

// ============================================================
// TESTS: getBufferByteSize
// ============================================================

console.log('\n=== getBufferByteSize ===\n');

test('getBufferByteSize — 80x24 (terminal)', () => {
  assertEqual(getBufferByteSize(80, 24), 80 * 24 * 5 * 4);
});

test('getBufferByteSize — 200x100 (standard)', () => {
  assertEqual(getBufferByteSize(200, 100), 200 * 100 * 5 * 4);
});

test('getBufferByteSize — 1000x1000 (max spec)', () => {
  assertEqual(getBufferByteSize(1000, 1000), 1000 * 1000 * 5 * 4);
});

// ============================================================
// TESTS: buildInstanceBuffer
// ============================================================

console.log('\n=== buildInstanceBuffer ===\n');

function makeCanvas(w, h) {
  return {
    width: w, height: h,
    charset: '@#$%&*+=-.~ ',
    defaultChar: ' ',
    defaultColor: '#00ff00',
    background: '#000000',
    fontFamily: 'monospace'
  };
}

function makeFrame(cells) {
  return { id: 'frame_001', index: 0, label: '', cells: cells || [], layers: ['visual'] };
}

function makeCharIndexMap() {
  return new Map([
    [' ', 0], ['@', 1], ['#', 2], ['$', 3], ['%', 4],
    ['&', 5], ['*', 6], ['+', 7], ['=', 8], ['-', 9],
    ['.', 10], ['~', 11]
  ]);
}

test('buildInstanceBuffer — empty frame fills defaults', () => {
  const canvas = makeCanvas(3, 2);
  const frame = makeFrame([]);
  const charMap = makeCharIndexMap();
  const buf = buildInstanceBuffer(frame, canvas, charMap, 0);

  assertEqual(buf.length, 30, 'buffer length');

  for (let i = 0; i < 6; i++) {
    const o = i * 5;
    assertEqual(buf[o], 0, `cell ${i} charIndex`);
    assertClose(buf[o + 1], 0, 0.001, `cell ${i} fgR`);
    assertClose(buf[o + 2], 1, 0.001, `cell ${i} fgG`);
    assertClose(buf[o + 3], 0, 0.001, `cell ${i} fgB`);
    assertClose(buf[o + 4], 0, 0.01, `cell ${i} density`);
  }
});

test('buildInstanceBuffer — single cell override', () => {
  const canvas = makeCanvas(3, 2);
  const frame = makeFrame([
    { x: 1, y: 0, char: '#', color: '#ff0000', density: 0.8, semantic: 'solid' }
  ]);
  const charMap = makeCharIndexMap();
  const buf = buildInstanceBuffer(frame, canvas, charMap, 0);

  const o = 1 * 5;
  assertEqual(buf[o], 2, 'charIndex for #');
  assertClose(buf[o + 1], 1, 0.001, 'fgR');
  assertClose(buf[o + 2], 0, 0.001, 'fgG');
  assertClose(buf[o + 3], 0, 0.001, 'fgB');
  assertClose(buf[o + 4], 0.8, 0.001, 'density');
  assertEqual(buf[0], 0, 'cell 0 still default');
});

test('buildInstanceBuffer — cell uses default color if none specified', () => {
  const canvas = makeCanvas(2, 1);
  const frame = makeFrame([{ x: 0, y: 0, char: '@' }]);
  const charMap = makeCharIndexMap();
  const buf = buildInstanceBuffer(frame, canvas, charMap, 0);

  assertEqual(buf[0], 1, 'charIndex for @');
  assertClose(buf[1], 0, 0.001, 'fgR (default green)');
  assertClose(buf[2], 1, 0.001, 'fgG (default green)');
  assertClose(buf[3], 0, 0.001, 'fgB (default green)');
});

test('buildInstanceBuffer — auto density for known char', () => {
  const canvas = makeCanvas(1, 1);
  const frame = makeFrame([{ x: 0, y: 0, char: '@' }]);
  const charMap = makeCharIndexMap();
  const buf = buildInstanceBuffer(frame, canvas, charMap, 0);

  assertClose(buf[4], 0.85, 0.05, 'auto density for @');
});

test('buildInstanceBuffer — out of bounds cells ignored', () => {
  const canvas = makeCanvas(2, 2);
  const frame = makeFrame([
    { x: 5, y: 0, char: '#' },
    { x: 0, y: 5, char: '#' },
    { x: -1, y: 0, char: '#' }
  ]);
  const charMap = makeCharIndexMap();
  const buf = buildInstanceBuffer(frame, canvas, charMap, 0);

  for (let i = 0; i < 4; i++) {
    assertEqual(buf[i * 5], 0, `cell ${i} should be default`);
  }
});

test('buildInstanceBuffer — unknown char falls back to defaultIndex', () => {
  const canvas = makeCanvas(1, 1);
  const frame = makeFrame([{ x: 0, y: 0, char: 'Z' }]);
  const charMap = makeCharIndexMap();
  const buf = buildInstanceBuffer(frame, canvas, charMap, 0);

  assertEqual(buf[0], 0, 'unknown char → defaultIndex');
});

test('buildInstanceBuffer — row-major order', () => {
  const canvas = makeCanvas(3, 2);
  const frame = makeFrame([
    { x: 0, y: 0, char: '@' },
    { x: 2, y: 0, char: '#' },
    { x: 1, y: 1, char: '$' }
  ]);
  const charMap = makeCharIndexMap();
  const buf = buildInstanceBuffer(frame, canvas, charMap, 0);

  assertEqual(buf[0 * 5], 1, '(0,0) → @=1');
  assertEqual(buf[2 * 5], 2, '(2,0) → #=2');
  assertEqual(buf[4 * 5], 3, '(1,1) → $=3');
});

// ============================================================
// TESTS: Performance
// ============================================================

console.log('\n=== Performance ===\n');

test('performance — 200×100 buffer build < 10ms', () => {
  const canvas = makeCanvas(200, 100);
  const cells = [];
  for (let i = 0; i < 500; i++) {
    cells.push({
      x: Math.floor(Math.random() * 200),
      y: Math.floor(Math.random() * 100),
      char: '#', color: '#ff00ff', density: 0.7
    });
  }
  const frame = makeFrame(cells);
  const charMap = makeCharIndexMap();

  const start = performance.now();
  const buf = buildInstanceBuffer(frame, canvas, charMap, 0);
  const elapsed = performance.now() - start;

  console.log(`    200×100 (500 cells): ${elapsed.toFixed(2)}ms`);
  assert(buf.length === 200 * 100 * 5, 'buffer length');
  assert(elapsed < 10, `Expected < 10ms, got ${elapsed.toFixed(2)}ms`);
});

test('performance — 500×500 buffer build < 50ms', () => {
  const canvas = makeCanvas(500, 500);
  const cells = [];
  for (let i = 0; i < 2000; i++) {
    cells.push({
      x: Math.floor(Math.random() * 500),
      y: Math.floor(Math.random() * 500),
      char: '@', color: '#00ffff'
    });
  }
  const frame = makeFrame(cells);
  const charMap = makeCharIndexMap();

  const start = performance.now();
  const buf = buildInstanceBuffer(frame, canvas, charMap, 0);
  const elapsed = performance.now() - start;

  console.log(`    500×500 (2000 cells): ${elapsed.toFixed(2)}ms`);
  assert(buf.length === 500 * 500 * 5, 'buffer length');
  assert(elapsed < 50, `Expected < 50ms, got ${elapsed.toFixed(2)}ms`);
});

test('performance — 1000×1000 buffer build < 200ms', () => {
  const canvas = makeCanvas(1000, 1000);
  const cells = [];
  for (let i = 0; i < 5000; i++) {
    cells.push({
      x: Math.floor(Math.random() * 1000),
      y: Math.floor(Math.random() * 1000),
      char: '*', density: 0.5
    });
  }
  const frame = makeFrame(cells);
  const charMap = makeCharIndexMap();

  const start = performance.now();
  const buf = buildInstanceBuffer(frame, canvas, charMap, 0);
  const elapsed = performance.now() - start;

  console.log(`    1000×1000 (5000 cells): ${elapsed.toFixed(2)}ms`);
  assert(buf.length === 1000 * 1000 * 5, 'buffer length');
  assert(elapsed < 200, `Expected < 200ms, got ${elapsed.toFixed(2)}ms`);
});

// ============================================================
// Font Atlas — skip in Node
// ============================================================

console.log('\n=== Font Atlas ===\n');
skip('Font Atlas tests', 'No canvas API in Node.js — run webgl2-test.html in browser');

// ============================================================
// RESULTS
// ============================================================

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Skipped: ${skipped}`);
console.log(`Total: ${passed + failed}`);
console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

// Export results for unified runner
export const results = {
  passed,
  failed,
  skipped,
  summary: `WebGL2 Modules: ${passed} passed, ${failed} failed, ${skipped} skipped`
};

if (failed > 0) process.exit(1);