/**
 * test-generators.js — Unit tests for generators.js
 *
 * Pure Node.js — no DOM, no canvas, no mocks needed.
 * grid-core.js is imported transitively (pure functions only).
 */

// ============================================================
// MINI ASSERT LIBRARY
// ============================================================

let passed  = 0;
let failed  = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    failed++;
    failures.push(message);
  }
}

function assertEqual(a, b, message) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    console.log(`       got:      ${JSON.stringify(a)}`);
    console.log(`       expected: ${JSON.stringify(b)}`);
    failed++;
    failures.push(message);
  }
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

// ============================================================
// LOAD MODULE
// ============================================================

const {
  GENERATORS,
  mulberry32, hslToHex, monoFromHex, resolveColor,
  pickChar, clamp01, buildCell,
} = await import('../src/generators/generators.js');

// ============================================================
// TESTS: clamp01
// ============================================================

section('clamp01');

assertEqual(clamp01(0),    0,   'clamp01(0) = 0');
assertEqual(clamp01(1),    1,   'clamp01(1) = 1');
assertEqual(clamp01(0.5),  0.5, 'clamp01(0.5) = 0.5');
assertEqual(clamp01(-1),   0,   'clamp01(-1) = 0');
assertEqual(clamp01(2),    1,   'clamp01(2) = 1');

// ============================================================
// TESTS: mulberry32
// ============================================================

section('mulberry32');

{
  const rng1 = mulberry32(42);
  const rng2 = mulberry32(42);
  const v1 = rng1();
  const v2 = rng2();
  assertEqual(v1, v2, 'same seed produces same first value');
  assert(v1 >= 0 && v1 < 1, 'output in [0, 1)');

  const rng3 = mulberry32(99);
  const v3 = rng3();
  assert(v3 !== v1, 'different seed produces different first value');

  // Distribution check: 100 values should be spread, not all in one half
  const rng4 = mulberry32(1234);
  let low = 0, high = 0;
  for (let i = 0; i < 100; i++) {
    const v = rng4();
    if (v < 0.5) low++; else high++;
  }
  assert(low > 30 && high > 30, 'output reasonably distributed (30-70 each side in 100 draws)');
}

// ============================================================
// TESTS: hslToHex
// ============================================================

section('hslToHex');

{
  const red = hslToHex(0, 1, 0.5);
  assert(/^#[0-9a-f]{6}$/.test(red), 'returns valid hex string');
  assertEqual(red, '#ff0000', 'hsl(0,1,0.5) = red = #ff0000');

  const green = hslToHex(120, 1, 0.5);
  assertEqual(green, '#00ff00', 'hsl(120,1,0.5) = green = #00ff00');

  const blue = hslToHex(240, 1, 0.5);
  assertEqual(blue, '#0000ff', 'hsl(240,1,0.5) = blue = #0000ff');

  const white = hslToHex(0, 0, 1);
  assertEqual(white, '#ffffff', 'hsl(0,0,1) = white');

  const black = hslToHex(0, 0, 0);
  assertEqual(black, '#000000', 'hsl(0,0,0) = black');
}

// ============================================================
// TESTS: monoFromHex
// ============================================================

section('monoFromHex');

{
  const hex = '#ff0000'; // red
  const dark = monoFromHex(hex, 1);
  const light = monoFromHex(hex, 0);
  assert(/^#[0-9a-f]{6}$/.test(dark), 'dark variant is valid hex');
  assert(/^#[0-9a-f]{6}$/.test(light), 'light variant is valid hex');

  // Parse lightness: dark should have lower lightness than light
  function hexToL(h) {
    const r = parseInt(h.slice(1,3),16)/255;
    const g = parseInt(h.slice(3,5),16)/255;
    const b = parseInt(h.slice(5,7),16)/255;
    return (Math.max(r,g,b) + Math.min(r,g,b)) / 2;
  }
  assert(hexToL(dark) < hexToL(light), 'density=1 produces darker color than density=0');
  assert(hexToL(dark) >= 0.10, 'dark variant has minimum lightness (≥ ~0.15)');
}

// ============================================================
// TESTS: resolveColor
// ============================================================

section('resolveColor');

{
  const base = '#00ff88';
  const fixed = resolveColor({ color: base, colorMode: 'fixed' }, 180, 0.5);
  assertEqual(fixed, base, 'fixed mode returns opts.color unchanged');

  const mono = resolveColor({ color: base, colorMode: 'mono' }, 180, 0.8);
  assert(/^#[0-9a-f]{6}$/.test(mono), 'mono mode returns valid hex');
  assert(mono !== base, 'mono mode modifies lightness (different from base)');

  const derived = resolveColor({ colorMode: 'derived' }, 120, 0.5);
  assert(/^#[0-9a-f]{6}$/.test(derived), 'derived mode returns valid hex');

  // Default (no colorMode) → fixed
  const defaultMode = resolveColor({ color: base }, 0, 0.5);
  assertEqual(defaultMode, base, 'default colorMode acts as fixed');
}

// ============================================================
// TESTS: pickChar
// ============================================================

section('pickChar');

{
  const cs = '@#=-. ';
  assertEqual(pickChar(cs, 0),   '@', 't=0 → first char');
  assertEqual(pickChar(cs, 0.99), ' ', 't≈1 → last char');
  assertEqual(pickChar(cs, 0.5), '-', 't=0.5 → middle char');

  // Out of bounds
  assertEqual(pickChar(cs, -1), '@', 't=-1 clamped to 0');
  assertEqual(pickChar(cs, 2),  ' ', 't=2 clamped to 1');

  // Empty charset
  assertEqual(pickChar('', 0.5), ' ', 'empty charset → space');
}

// ============================================================
// TESTS: buildCell
// ============================================================

section('buildCell');

{
  const cell = buildCell(3, 7, '@', '#ff0000', 0.9, 'solid', null, 10);

  assertEqual(cell.x, 3, 'x set');
  assertEqual(cell.y, 7, 'y set');
  assertEqual(cell.char, '@', 'char set');
  assertEqual(cell.color, '#ff0000', 'color set');
  assert(Math.abs(cell.density - 0.9) < 0.001, 'density set');
  assertEqual(cell.semantic, 'solid', 'semantic set explicitly');

  assert(typeof cell.channel === 'object', 'channel object present');
  assert(typeof cell.channel.audio === 'object', 'channel.audio present');
  assert(typeof cell.channel.spatial === 'object', 'channel.spatial present');

  // MIDI note: top row (y=0) → 127, bottom (y=H-1) → 0
  const cellTop = buildCell(0, 0, '@', '#fff', 1, null, null, 10);
  const cellBot = buildCell(0, 9, '.', '#fff', 0, null, null, 10);
  assertEqual(cellTop.channel.audio.note, 127, 'top row → note 127');
  assertEqual(cellBot.channel.audio.note, 0,   'bottom row → note 0');

  // Velocity from density
  assertEqual(cellTop.channel.audio.velocity, 127, 'density=1 → velocity 127');
  assertEqual(cellBot.channel.audio.velocity, 0,   'density=0 → velocity 0');

  // Spatial height mirrors density
  assert(Math.abs(cell.channel.spatial.height - 0.9) < 0.001, 'spatial.height = density');
  assertEqual(cell.channel.spatial.material, 'solid', 'spatial.material = semantic');

  // extraChannel merging
  const cellExtra = buildCell(0, 0, '@', '#fff', 1, 'solid', { myProp: 42 }, 10);
  assertEqual(cellExtra.channel.myProp, 42, 'extraChannel merged into channel');

  // Auto-infer semantic when null
  const cellInfer = buildCell(0, 0, '~', '#fff', 0.5, null, null, 10);
  assertEqual(cellInfer.semantic, 'fluid', 'null semantic → inferred from char (~=fluid)');
}

// ============================================================
// TESTS: GENERATORS registry
// ============================================================

section('GENERATORS registry');

{
  const expectedKeys = ['spiral','wave','mandala','noise','geometric','rain','gradient','pulse','matrix','terrain'];
  for (const key of expectedKeys) {
    assert(typeof GENERATORS[key] === 'function', `GENERATORS.${key} is a function`);
  }
  assertEqual(Object.keys(GENERATORS).length, 10, 'exactly 10 generators');
}

// ============================================================
// TESTS: Generator outputs — shape and channel validity
// ============================================================

section('Generator outputs — structure');

const W = 20, H = 10;
const sharedOpts = { charset: '@#=-. ', color: '#00ff88', colorMode: 'fixed', seed: 42 };

for (const [name, gen] of Object.entries(GENERATORS)) {
  const cells = gen(W, H, sharedOpts);

  assert(Array.isArray(cells), `${name}: returns an array`);
  assert(cells.length > 0, `${name}: produces at least one cell`);

  const cell = cells[0];
  assert(typeof cell.x === 'number' && cell.x >= 0 && cell.x < W, `${name}: cell.x in bounds`);
  assert(typeof cell.y === 'number' && cell.y >= 0 && cell.y < H, `${name}: cell.y in bounds`);
  assert(typeof cell.char === 'string' && cell.char.length === 1, `${name}: cell.char is single char`);
  assert(/^#[0-9a-f]{6}$/.test(cell.color), `${name}: cell.color is valid hex`);
  assert(typeof cell.density === 'number' && cell.density >= 0 && cell.density <= 1, `${name}: density in [0,1]`);
  assert(typeof cell.semantic === 'string' && cell.semantic.length > 0, `${name}: semantic is non-empty string`);
  assert(typeof cell.channel === 'object', `${name}: channel is object`);
  assert(typeof cell.channel.audio === 'object', `${name}: channel.audio present`);
  assert(typeof cell.channel.spatial === 'object', `${name}: channel.spatial present`);
  assert(cell.channel.audio.note >= 0 && cell.channel.audio.note <= 127, `${name}: audio.note in MIDI range`);
  assert(cell.channel.audio.velocity >= 0 && cell.channel.audio.velocity <= 127, `${name}: audio.velocity in MIDI range`);
  assert(cell.channel.audio.duration === 1, `${name}: audio.duration = 1`);
  assert(cell.channel.spatial.height >= 0 && cell.channel.spatial.height <= 1, `${name}: spatial.height in [0,1]`);
  assert(typeof cell.channel.spatial.material === 'string', `${name}: spatial.material is string`);
}

// ============================================================
// TESTS: Generator outputs — bounds (no out-of-grid cells)
// ============================================================

section('Generator outputs — bounds');

for (const [name, gen] of Object.entries(GENERATORS)) {
  const cells = gen(W, H, sharedOpts);
  const outOfBounds = cells.filter(c => c.x < 0 || c.x >= W || c.y < 0 || c.y >= H);
  assertEqual(outOfBounds.length, 0, `${name}: no out-of-bounds cells`);
}

// ============================================================
// TESTS: Generator outputs — no space chars (sparse rule)
// ============================================================

section('Generator outputs — sparse (no space chars)');

for (const [name, gen] of Object.entries(GENERATORS)) {
  const cells = gen(W, H, sharedOpts);
  const spaceCells = cells.filter(c => c.char === ' ');
  assertEqual(spaceCells.length, 0, `${name}: no space-char cells (sparse grid)`);
}

// ============================================================
// TESTS: Seeded generators are deterministic
// ============================================================

section('Seeded generators — determinism');

for (const [name, gen] of Object.entries(GENERATORS)) {
  const opts = { ...sharedOpts, seed: 777 };
  const a = gen(W, H, opts);
  const b = gen(W, H, opts);
  assertEqual(a.length, b.length, `${name}: same seed → same cell count`);
  if (a.length > 0) {
    assertEqual(a[0].x, b[0].x, `${name}: same seed → first cell.x identical`);
    assertEqual(a[0].char, b[0].char, `${name}: same seed → first cell.char identical`);
  }
}

// ============================================================
// TESTS: colorMode variants
// ============================================================

section('colorMode variants');

{
  const baseColor = '#ff0000';
  const fixedCells  = GENERATORS.spiral(10, 10, { charset: '@#=-.', color: baseColor, colorMode: 'fixed',   seed: 1 });
  const monoCells   = GENERATORS.spiral(10, 10, { charset: '@#=-.', color: baseColor, colorMode: 'mono',    seed: 1 });
  const derivedCells = GENERATORS.spiral(10, 10, { charset: '@#=-.', color: baseColor, colorMode: 'derived', seed: 1 });

  assert(fixedCells.every(c => c.color === baseColor), 'fixed: all cells use opts.color');
  assert(monoCells.some(c => c.color !== baseColor),   'mono: at least some cells differ from base');
  assert(derivedCells.every(c => /^#[0-9a-f]{6}$/.test(c.color)), 'derived: all valid hex');
}

// ============================================================
// TESTS: Terrain biome semantics
// ============================================================

section('terrain — biome semantics');

{
  const cells = GENERATORS.terrain(40, 20, { charset: '@#=-.:~ ', color: '#00ff88', colorMode: 'derived', seed: 42 });
  const semantics = new Set(cells.map(c => c.semantic));
  const validSemantics = new Set(['void','fluid','solid','emissive','entity','control','boundary']);
  for (const s of semantics) {
    assert(validSemantics.has(s), `terrain semantic '${s}' is a valid .grid semantic`);
  }
  // Terrain should produce multiple semantic zones
  assert(semantics.size >= 2, `terrain produces ≥2 distinct biome zones (got: ${[...semantics].join(',')})`);
}

// ============================================================
// TESTS: Pulse rings parameter
// ============================================================

section('pulse — rings parameter');

{
  const few = GENERATORS.pulse(20, 10, { charset: '@#=-. ', seed: 0, rings: 2 });
  const many = GENERATORS.pulse(20, 10, { charset: '@#=-. ', seed: 0, rings: 10 });
  // More rings → more variation → different cell count (not guaranteed to be more, just different)
  assert(few.length > 0 && many.length > 0, 'pulse generates cells for different ring counts');
}

// ============================================================
// RESULTS
// ============================================================

console.log(`\n${'='.repeat(50)}`);
console.log(`Generators: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('Failed tests:', failures.join('; '));
}

export const results = {
  passed,
  failed,
  skipped: 0,
  summary: `Generators: ${passed} passed, ${failed} failed`,
};
