/**
 * test-serializer.js — Unit tests for serializer.js
 *
 * Pure Node.js — no DOM, no canvas, no mocks needed.
 * Tests compact mode, round-trip, version migration, and validation.
 */

// ============================================================
// MINI ASSERT LIBRARY
// ============================================================

let passed  = 0;
let failed  = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    failed++;
    failures.push(message);
  }
}

function assertEqual(a, b, message) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    console.log(`       got:      ${JSON.stringify(a)}`);
    console.log(`       expected: ${JSON.stringify(b)}`);
    failed++;
    failures.push(message);
  }
}

function assertThrows(fn, expectedSubstr, message) {
  try {
    fn();
    console.log(`  FAIL: ${message} (no error thrown)`);
    failed++;
    failures.push(message);
  } catch (e) {
    if (expectedSubstr && !e.message.includes(expectedSubstr)) {
      console.log(`  FAIL: ${message}`);
      console.log(`       error: "${e.message}" does not contain "${expectedSubstr}"`);
      failed++;
      failures.push(message);
    } else {
      console.log(`  PASS: ${message}`);
      passed++;
    }
  }
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

// ============================================================
// LOAD MODULES
// ============================================================

const GridCore = (await import('../src/core/grid-core.js')).default;
const {
  compactGrid,
  serializeProject,
  deserializeProject,
  validateProject,
} = await import('../src/persistence/serializer.js');

const { createGrid, createCell, calcDensity, inferSemantic, cloneGrid } = GridCore;

// ============================================================
// HELPERS
// ============================================================

/** Create a simple test grid with some cells */
function makeTestGrid() {
  const grid = createGrid(10, 10);
  // Add a few cells to frame 0
  const frame = grid.frames[0];
  frame.cells.push(createCell(0, 0, '#', { color: '#ff0000' }));
  frame.cells.push(createCell(1, 0, '.', { color: '#00ff00' }));
  frame.cells.push(createCell(2, 0, '@', { color: '#0000ff', density: 0.99, semantic: 'fluid' }));
  return grid;
}

// ============================================================
// TESTS: compactGrid
// ============================================================

section('compactGrid — strips default density');
{
  const grid = makeTestGrid();
  const compacted = compactGrid(grid);
  const cell0 = compacted.frames[0].cells[0]; // '#' char
  assert(cell0.density === undefined, 'density stripped for # (matches calcDensity)');
  assert(cell0.char === '#', 'char preserved');
  assert(cell0.x === 0, 'x preserved');
  assert(cell0.y === 0, 'y preserved');
  assert(cell0.color === '#ff0000', 'color preserved');
}

section('compactGrid — strips default semantic');
{
  const grid = makeTestGrid();
  const compacted = compactGrid(grid);
  const cell0 = compacted.frames[0].cells[0]; // '#'
  assert(cell0.semantic === undefined, 'semantic stripped for # (matches inferSemantic "solid")');
}

section('compactGrid — preserves non-default density');
{
  const grid = makeTestGrid();
  const compacted = compactGrid(grid);
  const cell2 = compacted.frames[0].cells[2]; // '@' with density 0.99
  assertEqual(cell2.density, 0.99, 'non-default density 0.99 preserved for @');
}

section('compactGrid — preserves non-default semantic');
{
  const grid = makeTestGrid();
  const compacted = compactGrid(grid);
  const cell2 = compacted.frames[0].cells[2]; // '@' with semantic 'fluid'
  assertEqual(cell2.semantic, 'fluid', 'non-default semantic "fluid" preserved for @');
}

section('compactGrid — does not mutate original');
{
  const grid = makeTestGrid();
  const origDensity = grid.frames[0].cells[0].density;
  compactGrid(grid);
  assertEqual(grid.frames[0].cells[0].density, origDensity, 'original grid not mutated');
}

section('compactGrid — strips empty channel objects');
{
  const grid = makeTestGrid();
  grid.frames[0].cells[0].channel = { audio: {} };
  const compacted = compactGrid(grid);
  assert(compacted.frames[0].cells[0].channel === undefined, 'empty channel object stripped');
}

section('compactGrid — preserves non-empty channels');
{
  const grid = makeTestGrid();
  grid.frames[0].cells[0].channel = { audio: { note: 60 } };
  const compacted = compactGrid(grid);
  assertEqual(compacted.frames[0].cells[0].channel.audio.note, 60, 'non-empty channel preserved');
}

section('compactGrid — always keeps x, y, char');
{
  const grid = makeTestGrid();
  const compacted = compactGrid(grid);
  for (const cell of compacted.frames[0].cells) {
    assert(cell.x !== undefined, `x present for cell at (${cell.x}, ${cell.y})`);
    assert(cell.y !== undefined, `y present for cell at (${cell.x}, ${cell.y})`);
    assert(cell.char !== undefined, `char present for cell "${cell.char}"`);
  }
}

// ============================================================
// TESTS: serializeProject
// ============================================================

section('serializeProject — returns valid JSON string');
{
  const grid = makeTestGrid();
  const json = serializeProject(grid);
  assert(typeof json === 'string', 'returns a string');
  const parsed = JSON.parse(json);
  assert(parsed.grid === 'grid', 'parsed JSON has grid identifier');
}

section('serializeProject — pretty mode (default)');
{
  const grid = makeTestGrid();
  const json = serializeProject(grid);
  assert(json.includes('\n'), 'pretty mode includes newlines');
  assert(json.includes('  '), 'pretty mode includes indentation');
}

section('serializeProject — minified mode');
{
  const grid = makeTestGrid();
  const json = serializeProject(grid, { pretty: false });
  assert(!json.includes('\n'), 'minified has no newlines');
}

section('serializeProject — compact mode strips defaults');
{
  const grid = makeTestGrid();
  const json = serializeProject(grid, { compact: true });
  const parsed = JSON.parse(json);
  const cell0 = parsed.frames[0].cells[0]; // '#'
  assert(cell0.density === undefined, 'compact strips default density');
  assert(cell0.semantic === undefined, 'compact strips default semantic');
}

section('serializeProject — updates meta.modified');
{
  const grid = makeTestGrid();
  const before = grid.meta.modified;
  // Small delay to ensure different timestamp
  const json = serializeProject(grid);
  const parsed = JSON.parse(json);
  assert(typeof parsed.meta.modified === 'string', 'modified is a string');
  assert(parsed.meta.modified.length > 0, 'modified is not empty');
}

section('serializeProject — does not mutate original grid');
{
  const grid = makeTestGrid();
  const origModified = grid.meta.modified;
  serializeProject(grid);
  assertEqual(grid.meta.modified, origModified, 'original modified unchanged');
}

// ============================================================
// TESTS: deserializeProject
// ============================================================

section('deserializeProject — basic round-trip');
{
  const grid = makeTestGrid();
  const json = serializeProject(grid);
  const restored = deserializeProject(json);
  assertEqual(restored.grid, 'grid', 'format identifier preserved');
  assertEqual(restored.canvas.width, 10, 'canvas width preserved');
  assertEqual(restored.canvas.height, 10, 'canvas height preserved');
  assertEqual(restored.frames.length, 1, 'frame count preserved');
  assertEqual(restored.frames[0].cells.length, 3, 'cell count preserved');
}

section('deserializeProject — round-trip with compact');
{
  const grid = makeTestGrid();
  const json = serializeProject(grid, { compact: true });
  const restored = deserializeProject(json);
  // Compacted cells should be re-inflated
  const cell0 = restored.frames[0].cells[0]; // '#'
  assertEqual(cell0.density, calcDensity('#'), 'density re-inflated from compact');
  assertEqual(cell0.semantic, inferSemantic('#'), 'semantic re-inflated from compact');
}

section('deserializeProject — round-trip preserves non-default values');
{
  const grid = makeTestGrid();
  const json = serializeProject(grid, { compact: true });
  const restored = deserializeProject(json);
  const cell2 = restored.frames[0].cells[2]; // '@' with density 0.99, semantic 'fluid'
  assertEqual(cell2.density, 0.99, 'non-default density survives round-trip');
  assertEqual(cell2.semantic, 'fluid', 'non-default semantic survives round-trip');
}

section('deserializeProject — deep equals on round-trip (non-compact)');
{
  const grid = makeTestGrid();
  // Fix the modified timestamp so it can round-trip cleanly
  grid.meta.modified = '2026-01-01T00:00:00.000Z';
  const json = serializeProject(grid);
  const restored = deserializeProject(json);
  // modified will have changed during serialize, so compare everything except modified
  const gridCopy = cloneGrid(grid);
  gridCopy.meta.modified = restored.meta.modified;
  assertEqual(
    JSON.stringify(restored),
    JSON.stringify(gridCopy),
    'full round-trip deep-equals (except modified timestamp)'
  );
}

section('deserializeProject — invalid JSON throws clear message');
{
  assertThrows(
    () => deserializeProject('not json at all{{{'),
    'Invalid JSON',
    'invalid JSON throws SyntaxError with clear message'
  );
}

section('deserializeProject — missing format identifier throws');
{
  assertThrows(
    () => deserializeProject('{"version":"0.1.0"}'),
    'Not a .grid file',
    'missing format identifier throws'
  );
}

section('deserializeProject — wrong format identifier throws');
{
  assertThrows(
    () => deserializeProject('{"grid":"other","version":"0.1.0"}'),
    'Not a .grid file',
    'wrong format identifier throws'
  );
}

section('deserializeProject — non-string argument throws');
{
  assertThrows(
    () => deserializeProject(42),
    'expects a JSON string',
    'non-string argument throws TypeError'
  );
}

// ============================================================
// TESTS: Version Migration (v0.0.x -> v0.1.0)
// ============================================================

section('Version migration — v0.0.1 gets project object');
{
  const oldGrid = {
    grid: 'grid',
    version: '0.0.1',
    meta: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'Old Project',
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z'
    },
    canvas: {
      width: 5, height: 5,
      charset: '#. ',
      defaultChar: ' ',
      defaultColor: '#00ff00'
    },
    frames: [{ id: 'frame_001', index: 0, cells: [] }]
  };
  const json = JSON.stringify(oldGrid);
  const restored = deserializeProject(json);
  assert(restored.project !== undefined, 'project object added by migration');
  assertEqual(restored.project.bpm, 120, 'project.bpm defaulted to 120');
  assertEqual(restored.project.scale, 'chromatic', 'project.scale defaulted');
}

section('Version migration — v0.0.1 gets sequences array');
{
  const oldGrid = {
    grid: 'grid',
    version: '0.0.1',
    meta: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'Old',
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z'
    },
    canvas: {
      width: 5, height: 5,
      charset: '#. ',
      defaultChar: ' ',
      defaultColor: '#00ff00'
    },
    frames: [{ id: 'frame_001', index: 0, cells: [] }]
  };
  const json = JSON.stringify(oldGrid);
  const restored = deserializeProject(json);
  assert(Array.isArray(restored.sequences), 'sequences array added by migration');
  assertEqual(restored.sequences.length, 0, 'sequences defaults to empty array');
}

section('Version migration — updates version to 0.1.0');
{
  const oldGrid = {
    grid: 'grid',
    version: '0.0.1',
    meta: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'Old',
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z'
    },
    canvas: {
      width: 5, height: 5,
      charset: '#. ',
      defaultChar: ' ',
      defaultColor: '#00ff00'
    },
    frames: [{ id: 'frame_001', index: 0, cells: [] }]
  };
  const restored = deserializeProject(JSON.stringify(oldGrid));
  assertEqual(restored.version, '0.1.0', 'version migrated to 0.1.0');
}

section('Version migration — adds missing meta fields');
{
  const oldGrid = {
    grid: 'grid',
    version: '0.0.1',
    meta: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'Test',
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z'
    },
    canvas: {
      width: 5, height: 5,
      charset: '#. ',
      defaultChar: ' ',
      defaultColor: '#00ff00'
    },
    frames: [{ id: 'frame_001', index: 0, cells: [] }]
  };
  const restored = deserializeProject(JSON.stringify(oldGrid));
  assert(Array.isArray(restored.meta.tags), 'meta.tags added');
  assert(typeof restored.meta.notes === 'string', 'meta.notes added');
  assert(typeof restored.meta.author === 'string', 'meta.author added');
}

section('Version migration — adds missing canvas fields');
{
  const oldGrid = {
    grid: 'grid',
    version: '0.0.1',
    meta: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'Test',
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z'
    },
    canvas: {
      width: 5, height: 5,
      charset: '#. ',
      defaultChar: ' ',
      defaultColor: '#00ff00'
    },
    frames: [{ id: 'frame_001', index: 0, cells: [] }]
  };
  const restored = deserializeProject(JSON.stringify(oldGrid));
  assertEqual(restored.canvas.background, '#000000', 'canvas.background added');
  assertEqual(restored.canvas.fontFamily, 'monospace', 'canvas.fontFamily added');
}

section('Version migration — adds missing frame fields');
{
  const oldGrid = {
    grid: 'grid',
    version: '0.0.1',
    meta: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'Test',
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z'
    },
    canvas: {
      width: 5, height: 5,
      charset: '#. ',
      defaultChar: ' ',
      defaultColor: '#00ff00'
    },
    frames: [{ id: 'frame_001', index: 0, cells: [] }]
  };
  const restored = deserializeProject(JSON.stringify(oldGrid));
  const frame = restored.frames[0];
  assertEqual(frame.layers, ['visual'], 'frame.layers added');
  assertEqual(frame.duration, null, 'frame.duration added');
  assertEqual(frame.label, '', 'frame.label added');
}

// ============================================================
// TESTS: validateProject
// ============================================================

section('validateProject — valid grid passes');
{
  const grid = makeTestGrid();
  const result = validateProject(grid);
  assert(result.valid === true, 'valid grid passes validation');
  assertEqual(result.errors.length, 0, 'no errors for valid grid');
}

section('validateProject — missing project object fails');
{
  const grid = makeTestGrid();
  delete grid.project;
  const result = validateProject(grid);
  assert(result.valid === false, 'missing project is invalid');
  assert(result.errors.some(e => e.includes('project')), 'error mentions project');
}

section('validateProject — invalid meta.id format fails');
{
  const grid = makeTestGrid();
  grid.meta.id = 'not-a-uuid';
  const result = validateProject(grid);
  assert(result.valid === false, 'bad UUID is invalid');
  assert(result.errors.some(e => e.includes('UUID')), 'error mentions UUID');
}

section('validateProject — valid UUID passes');
{
  const grid = makeTestGrid();
  grid.meta.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const result = validateProject(grid);
  // Should pass UUID check (may have other errors, just check UUID is not flagged)
  assert(!result.errors.some(e => e.includes('UUID')), 'valid UUID not flagged');
}

section('validateProject — includes grid-core validation errors');
{
  const grid = makeTestGrid();
  grid.canvas.width = -1;
  const result = validateProject(grid);
  assert(result.valid === false, 'invalid canvas width caught');
  assert(result.errors.some(e => e.includes('canvas.width')), 'error from grid-core validation');
}

section('validateProject — null grid fails');
{
  const result = validateProject(null);
  assert(result.valid === false, 'null grid fails validation');
}

// ============================================================
// SUMMARY
// ============================================================

const summary = `Serializer: ${passed} passed, ${failed} failed`;
console.log('\n' + summary);
if (failures.length) {
  console.log('Failures:');
  failures.forEach(f => console.log('  - ' + f));
}
export const results = { passed, failed, skipped: 0, summary };
