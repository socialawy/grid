/**
 * test-heightmap.js — Tests for heightmap.js
 * Phase 4, Task 4.1
 *
 * Pure Node.js — zero DOM, zero Three.js dependency.
 * Run: node tests/test-heightmap.js
 * Or via: node tests/run-all.js
 */

import {
  gridToHeightmap,
  getHeightmapCell,
  getSolidCells,
  getCellsByMaterial,
  normalizeElevations,
  computeNormals,
  toElevationBuffer,
  getMaterialDescriptor,
  cellToElevation,
  cellToMaterial,
  cellToColor,
  MATERIALS,
  MATERIAL_NAMES,
  DEFAULT_MATERIAL,
  DEFAULT_COLOR,
  DEFAULT_ELEVATION,
} from '../src/consumers/spatial/heightmap.js';

// ─── MINI TEST HARNESS ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `Expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

function assertClose(a, b, eps = 1e-6, msg) {
  if (Math.abs(a - b) > eps) throw new Error(msg ?? `Expected ${a} ≈ ${b} (within ${eps})`);
}

function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  if (!threw) throw new Error(msg ?? 'Expected function to throw');
}

// ─── FIXTURES ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal valid .grid object for testing.
 */
function makeGrid(width = 4, height = 3, cells = []) {
  return {
    grid: 'grid',
    version: '0.1.0',
    meta: { id: 'test-uuid', version: '0.1.0', created: Date.now() },
    canvas: { width, height, charset: 'ascii', defaultColor: '#000000' },
    frames: [
      {
        id: 'frame_001',
        timestamp: 0,
        cells,
        layers: ['visual', 'audio', 'spatial'],
      }
    ],
    sequences: [],
    project: { bpm: 120, scale: 'major', palette: [] },
  };
}

/** Make a cell with all fields */
function makeCell(x, y, overrides = {}) {
  return {
    x, y,
    char:     overrides.char     ?? '@',
    color:    overrides.color    ?? '#00ff88',
    density:  overrides.density  ?? 0.5,
    semantic: overrides.semantic ?? 'solid',
    channel: {
      audio:   { note: 60, velocity: 80, duration: 1 },
      spatial: {
        height:   overrides.spatialHeight   ?? undefined,
        material: overrides.spatialMaterial ?? undefined,
        ...overrides.spatialExtra,
      },
    },
    ...overrides,
  };
}

// ─── TESTS: CONSTANTS ────────────────────────────────────────────────────────

test('MATERIALS has all semantic keys', () => {
  const expected = ['solid', 'void', 'fluid', 'emissive', 'entity', 'control', 'boundary'];
  for (const key of expected) {
    assert(MATERIALS[key], `Missing MATERIALS.${key}`);
  }
});

test('MATERIAL_NAMES is an array matching MATERIALS keys', () => {
  assertEqual(MATERIAL_NAMES.length, Object.keys(MATERIALS).length);
  for (const name of MATERIAL_NAMES) {
    assert(MATERIALS[name], `${name} in MATERIAL_NAMES but not MATERIALS`);
  }
});

test('DEFAULT_MATERIAL is solid', () => {
  assertEqual(DEFAULT_MATERIAL, 'solid');
});

test('DEFAULT_COLOR is a valid hex string', () => {
  assert(DEFAULT_COLOR.startsWith('#'), 'DEFAULT_COLOR must start with #');
  assertEqual(DEFAULT_COLOR.length, 7, 'DEFAULT_COLOR must be 7 chars');
});

test('DEFAULT_ELEVATION is between 0 and 1', () => {
  assert(DEFAULT_ELEVATION >= 0 && DEFAULT_ELEVATION <= 1);
});

// ─── TESTS: CELL HELPERS ──────────────────────────────────────────────────────

test('cellToElevation: null cell returns 0', () => {
  assertEqual(cellToElevation(null), 0.0);
});

test('cellToElevation: channel.spatial.height takes priority over density', () => {
  const cell = makeCell(0, 0, { density: 0.3, spatialHeight: 0.9 });
  assertClose(cellToElevation(cell), 0.9);
});

test('cellToElevation: falls back to density when no spatial height', () => {
  const cell = makeCell(0, 0, { density: 0.7 });
  // Remove spatial height
  cell.channel.spatial.height = undefined;
  assertClose(cellToElevation(cell), 0.7);
});

test('cellToElevation: falls back to DEFAULT_ELEVATION when no density or spatial', () => {
  const cell = { x: 0, y: 0, char: '@', color: '#fff' }; // no density, no channel
  assertClose(cellToElevation(cell), DEFAULT_ELEVATION);
});

test('cellToElevation: clamps spatial height to [0, 1]', () => {
  const cellHigh = makeCell(0, 0, { spatialHeight: 1.5 });
  const cellLow  = makeCell(0, 0, { spatialHeight: -0.5 });
  assertClose(cellToElevation(cellHigh), 1.0);
  assertClose(cellToElevation(cellLow),  0.0);
});

test('cellToElevation: clamps density to [0, 1]', () => {
  const cell = makeCell(0, 0, { density: 2.0 });
  cell.channel.spatial.height = undefined;
  assertClose(cellToElevation(cell), 1.0);
});

test('cellToElevation: ignores non-finite spatial height', () => {
  const cell = makeCell(0, 0, { density: 0.4, spatialHeight: NaN });
  assertClose(cellToElevation(cell), 0.4);
});

test('cellToMaterial: null cell returns DEFAULT_MATERIAL', () => {
  assertEqual(cellToMaterial(null), DEFAULT_MATERIAL);
});

test('cellToMaterial: channel.spatial.material takes priority', () => {
  const cell = makeCell(0, 0, { semantic: 'solid', spatialMaterial: 'fluid' });
  assertEqual(cellToMaterial(cell), 'fluid');
});

test('cellToMaterial: falls back to semantic', () => {
  const cell = makeCell(0, 0, { semantic: 'emissive' });
  cell.channel.spatial.material = undefined;
  assertEqual(cellToMaterial(cell), 'emissive');
});

test('cellToMaterial: falls back to DEFAULT_MATERIAL for unknown semantic', () => {
  const cell = makeCell(0, 0, { semantic: 'unknown_thing' });
  cell.channel.spatial.material = undefined;
  assertEqual(cellToMaterial(cell), DEFAULT_MATERIAL);
});

test('cellToMaterial: ignores unknown spatial material', () => {
  const cell = makeCell(0, 0, { semantic: 'solid', spatialMaterial: 'lava' });
  assertEqual(cellToMaterial(cell), 'solid'); // falls through to semantic
});

test('cellToColor: null cell returns DEFAULT_COLOR', () => {
  assertEqual(cellToColor(null), DEFAULT_COLOR);
});

test('cellToColor: returns cell color when valid hex', () => {
  const cell = makeCell(0, 0, { color: '#ff0000' });
  assertEqual(cellToColor(cell), '#ff0000');
});

test('cellToColor: returns DEFAULT_COLOR for non-hex color', () => {
  const cell = makeCell(0, 0, { color: 'red' });
  assertEqual(cellToColor(cell), DEFAULT_COLOR);
});

test('cellToColor: returns DEFAULT_COLOR for undefined color', () => {
  const cell = { x: 0, y: 0, char: '@' }; // no color
  assertEqual(cellToColor(cell), DEFAULT_COLOR);
});

// ─── TESTS: gridToHeightmap VALIDATION ────────────────────────────────────────

test('gridToHeightmap: throws on null grid', () => {
  assertThrows(() => gridToHeightmap(null));
});

test('gridToHeightmap: throws on grid with no canvas', () => {
  assertThrows(() => gridToHeightmap({ frames: [] }));
});

test('gridToHeightmap: throws on grid with no frames', () => {
  assertThrows(() => gridToHeightmap({ canvas: { width: 4, height: 4 }, frames: [] }));
});

test('gridToHeightmap: throws on invalid canvas dimensions', () => {
  assertThrows(() => gridToHeightmap({
    canvas: { width: 0, height: 4 },
    frames: [{ cells: [] }]
  }));
});

// ─── TESTS: gridToHeightmap OUTPUT SHAPE ──────────────────────────────────────

test('gridToHeightmap: output has width and height', () => {
  const grid = makeGrid(5, 3);
  const hm = gridToHeightmap(grid);
  assertEqual(hm.width,  5);
  assertEqual(hm.height, 3);
});

test('gridToHeightmap: cells array has width*height entries', () => {
  const grid = makeGrid(4, 3);
  const hm   = gridToHeightmap(grid);
  assertEqual(hm.cells.length, 12);
});

test('gridToHeightmap: cells are row-major ordered', () => {
  const grid = makeGrid(3, 2);
  const hm   = gridToHeightmap(grid);
  // cell at index 0 should be x=0, y=0
  assertEqual(hm.cells[0].x, 0);
  assertEqual(hm.cells[0].y, 0);
  // cell at index 3 should be x=0, y=1 (start of second row)
  assertEqual(hm.cells[3].x, 0);
  assertEqual(hm.cells[3].y, 1);
});

test('gridToHeightmap: empty frame produces all-default cells', () => {
  const grid = makeGrid(2, 2, []);
  const hm   = gridToHeightmap(grid);
  for (const cell of hm.cells) {
    assert(cell.isEmpty, `Expected isEmpty for empty grid cell at (${cell.x},${cell.y})`);
  }
});

test('gridToHeightmap: cells carry x, y, elevation, material, color, char, isEmpty', () => {
  const grid = makeGrid(2, 2, [makeCell(0, 0)]);
  const hm   = gridToHeightmap(grid);
  const cell = hm.cells[0];
  assert('x'         in cell, 'missing x');
  assert('y'         in cell, 'missing y');
  assert('elevation' in cell, 'missing elevation');
  assert('material'  in cell, 'missing material');
  assert('color'     in cell, 'missing color');
  assert('char'      in cell, 'missing char');
  assert('isEmpty'   in cell, 'missing isEmpty');
});

test('gridToHeightmap: solid cell is not empty', () => {
  const grid = makeGrid(2, 2, [makeCell(0, 0, { semantic: 'solid' })]);
  const hm   = gridToHeightmap(grid);
  assertEqual(hm.cells[0].isEmpty, false);
});

test('gridToHeightmap: void cell is empty', () => {
  const grid = makeGrid(2, 2, [makeCell(0, 0, { semantic: 'void' })]);
  const hm   = gridToHeightmap(grid);
  assertEqual(hm.cells[0].isEmpty, true);
});

test('gridToHeightmap: control cell is empty', () => {
  const grid = makeGrid(2, 2, [makeCell(0, 0, { semantic: 'control' })]);
  const hm   = gridToHeightmap(grid);
  assertEqual(hm.cells[0].isEmpty, true);
});

test('gridToHeightmap: absent grid cell is empty', () => {
  const grid = makeGrid(3, 3, [makeCell(1, 1)]); // only center has a cell
  const hm   = gridToHeightmap(grid);
  // corner (0,0) should be empty
  assertEqual(hm.cells[0].isEmpty, true);
  // center (1,1) should not be empty
  assertEqual(hm.cells[1 * 3 + 1].isEmpty, false);
});

// ─── TESTS: ELEVATION MAPPING ─────────────────────────────────────────────────

test('gridToHeightmap: density maps to elevation', () => {
  const grid = makeGrid(2, 2, [makeCell(0, 0, { density: 0.8 })]);
  grid.frames[0].cells[0].channel.spatial.height = undefined;
  const hm = gridToHeightmap(grid);
  assertClose(hm.cells[0].elevation, 0.8);
});

test('gridToHeightmap: channel.spatial.height overrides density', () => {
  const cell = makeCell(0, 0, { density: 0.3, spatialHeight: 0.95 });
  const grid = makeGrid(2, 2, [cell]);
  const hm   = gridToHeightmap(grid);
  assertClose(hm.cells[0].elevation, 0.95);
});

test('gridToHeightmap: opts.elevationScale multiplies elevation', () => {
  const cell = makeCell(0, 0, { density: 0.5 });
  cell.channel.spatial.height = undefined;
  const grid = makeGrid(2, 2, [cell]);
  const hm   = gridToHeightmap(grid, 0, { elevationScale: 2.0 });
  assertClose(hm.cells[0].elevation, 1.0);
});

test('gridToHeightmap: opts.flattenBelow zeros cells below threshold', () => {
  const c1 = makeCell(0, 0, { density: 0.1 });
  const c2 = makeCell(1, 0, { density: 0.8 });
  c1.channel.spatial.height = undefined;
  c2.channel.spatial.height = undefined;
  const grid = makeGrid(2, 1, [c1, c2]);
  const hm   = gridToHeightmap(grid, 0, { flattenBelow: 0.3 });
  assertClose(hm.cells[0].elevation, 0.0); // 0.1 < 0.3 → flattened
  assertClose(hm.cells[1].elevation, 0.8); // 0.8 >= 0.3 → preserved
});

test('gridToHeightmap: opts.invertY flips Y axis', () => {
  // Put a cell at y=0 in the source grid
  const cell = makeCell(0, 0, { density: 0.9 });
  cell.channel.spatial.height = undefined;
  const grid = makeGrid(2, 2, [cell]);
  const hmNormal  = gridToHeightmap(grid, 0, { invertY: false });
  const hmInverted = gridToHeightmap(grid, 0, { invertY: true });
  // With invertY: cell at src y=0 appears at dst y=H-1
  assertClose(hmNormal.cells[0 * 2 + 0].elevation,   0.9); // y=0, x=0
  assertClose(hmInverted.cells[1 * 2 + 0].elevation, 0.9); // y=H-1=1, x=0
});

// ─── TESTS: STATS ────────────────────────────────────────────────────────────

test('gridToHeightmap: stats has required fields', () => {
  const grid = makeGrid(2, 2);
  const hm   = gridToHeightmap(grid);
  const s    = hm.stats;
  assert('minElevation'   in s);
  assert('maxElevation'   in s);
  assert('elevationRange' in s);
  assert('solidCount'     in s);
  assert('voidCount'      in s);
  assert('emissiveCount'  in s);
  assert('totalCells'     in s);
  assert('occupancy'      in s);
});

test('gridToHeightmap: stats.totalCells = width * height', () => {
  const grid = makeGrid(5, 4);
  const hm   = gridToHeightmap(grid);
  assertEqual(hm.stats.totalCells, 20);
});

test('gridToHeightmap: stats.minElevation <= maxElevation', () => {
  const cells = [
    makeCell(0, 0, { density: 0.2 }),
    makeCell(1, 0, { density: 0.8 }),
  ];
  cells.forEach(c => { c.channel.spatial.height = undefined; });
  const grid = makeGrid(2, 1, cells);
  const hm   = gridToHeightmap(grid);
  assert(hm.stats.minElevation <= hm.stats.maxElevation);
  assertClose(hm.stats.minElevation, 0.2);
  assertClose(hm.stats.maxElevation, 0.8);
});

test('gridToHeightmap: stats.occupancy is 0 for empty grid', () => {
  const grid = makeGrid(4, 4, []);
  const hm   = gridToHeightmap(grid);
  assertClose(hm.stats.occupancy, 0);
});

test('gridToHeightmap: stats.emissiveCount counts emissive cells', () => {
  const cells = [
    makeCell(0, 0, { semantic: 'emissive' }),
    makeCell(1, 0, { semantic: 'solid' }),
    makeCell(2, 0, { semantic: 'emissive' }),
  ];
  const grid = makeGrid(3, 1, cells);
  const hm   = gridToHeightmap(grid);
  assertEqual(hm.stats.emissiveCount, 2);
});

// ─── TESTS: FRAME INDEX ───────────────────────────────────────────────────────

test('gridToHeightmap: uses frameIndex 0 by default', () => {
  const grid = makeGrid(2, 1, [makeCell(0, 0, { density: 0.7 })]);
  grid.frames[0].cells[0].channel.spatial.height = undefined;
  const hm = gridToHeightmap(grid);
  assertEqual(hm.meta.frameIndex, 0);
});

test('gridToHeightmap: clamps frameIndex to valid range', () => {
  const grid = makeGrid(2, 1, []);
  // Only 1 frame; request index 99 → should use 0
  const hm = gridToHeightmap(grid, 99);
  assertEqual(hm.meta.frameIndex, 0);
});

test('gridToHeightmap: reads correct frame when multiple frames exist', () => {
  const grid = makeGrid(2, 1, [makeCell(0, 0, { density: 0.2 })]);
  grid.frames[0].cells[0].channel.spatial.height = undefined;
  // Add a second frame with different density
  const cell2 = makeCell(0, 0, { density: 0.8 });
  cell2.channel.spatial.height = undefined;
  grid.frames.push({ id: 'frame_002', timestamp: 1, cells: [cell2], layers: [] });
  const hm0 = gridToHeightmap(grid, 0);
  const hm1 = gridToHeightmap(grid, 1);
  assertClose(hm0.cells[0].elevation, 0.2);
  assertClose(hm1.cells[0].elevation, 0.8);
});

// ─── TESTS: ACCESSOR FUNCTIONS ────────────────────────────────────────────────

test('getHeightmapCell: returns cell at valid coords', () => {
  const grid = makeGrid(3, 2, [makeCell(1, 1)]);
  const hm   = gridToHeightmap(grid);
  const cell = getHeightmapCell(hm, 1, 1);
  assert(cell !== null, 'Expected non-null cell at (1,1)');
  assertEqual(cell.x, 1);
  assertEqual(cell.y, 1);
});

test('getHeightmapCell: returns null for out-of-bounds coords', () => {
  const grid = makeGrid(3, 2);
  const hm   = gridToHeightmap(grid);
  assertEqual(getHeightmapCell(hm, -1,  0), null);
  assertEqual(getHeightmapCell(hm,  3,  0), null);
  assertEqual(getHeightmapCell(hm,  0, -1), null);
  assertEqual(getHeightmapCell(hm,  0,  2), null);
});

test('getSolidCells: returns only non-empty cells', () => {
  const cells = [
    makeCell(0, 0, { semantic: 'solid' }),
    makeCell(1, 0, { semantic: 'void' }),
    makeCell(2, 0, { semantic: 'emissive' }),
  ];
  const grid  = makeGrid(3, 1, cells);
  const hm    = gridToHeightmap(grid);
  const solid = getSolidCells(hm);
  // void is empty, solid and emissive are not
  assertEqual(solid.length, 2);
  assert(solid.every(c => !c.isEmpty));
});

test('getCellsByMaterial: filters by material name', () => {
  const cells = [
    makeCell(0, 0, { semantic: 'solid' }),
    makeCell(1, 0, { semantic: 'fluid' }),
    makeCell(2, 0, { semantic: 'solid' }),
  ];
  const grid  = makeGrid(3, 1, cells);
  const hm    = gridToHeightmap(grid);
  const fluid = getCellsByMaterial(hm, 'fluid');
  const solid = getCellsByMaterial(hm, 'solid');
  assertEqual(fluid.length, 1);
  assertEqual(solid.length, 2);
});

test('getCellsByMaterial: returns empty array for missing material', () => {
  const grid   = makeGrid(2, 2, [makeCell(0, 0)]);
  const hm     = gridToHeightmap(grid);
  const result = getCellsByMaterial(hm, 'emissive');
  assertEqual(result.length, 0);
});

// ─── TESTS: normalizeElevations ────────────────────────────────────────────────

test('normalizeElevations: returns new object, does not mutate', () => {
  const cells = [
    makeCell(0, 0, { density: 0.2 }),
    makeCell(1, 0, { density: 0.8 }),
  ];
  cells.forEach(c => { c.channel.spatial.height = undefined; });
  const grid = makeGrid(2, 1, cells);
  const hm   = gridToHeightmap(grid);
  const norm = normalizeElevations(hm);
  assert(norm !== hm, 'Should return a new object');
  assertClose(hm.cells[0].elevation, 0.2, 1e-6, 'Original must not be mutated');
});

test('normalizeElevations: maps min to 0 and max to 1', () => {
  const cells = [
    makeCell(0, 0, { density: 0.2 }),
    makeCell(1, 0, { density: 0.8 }),
  ];
  cells.forEach(c => { c.channel.spatial.height = undefined; });
  const grid = makeGrid(2, 1, cells);
  const hm   = gridToHeightmap(grid);
  const norm = normalizeElevations(hm);
  const solidNorm = norm.cells.filter(c => !c.isEmpty);
  const elevs = solidNorm.map(c => c.elevation);
  assertClose(Math.min(...elevs), 0.0);
  assertClose(Math.max(...elevs), 1.0);
});

test('normalizeElevations: flat grid stays at 0', () => {
  const cells = [
    makeCell(0, 0, { density: 0.5 }),
    makeCell(1, 0, { density: 0.5 }),
  ];
  cells.forEach(c => { c.channel.spatial.height = undefined; });
  const grid = makeGrid(2, 1, cells);
  const hm   = gridToHeightmap(grid);
  const norm = normalizeElevations(hm);
  for (const cell of norm.cells) {
    assertClose(cell.elevation, 0.0);
  }
});

test('normalizeElevations: updates stats correctly', () => {
  const cells = [
    makeCell(0, 0, { density: 0.2 }),
    makeCell(1, 0, { density: 0.6 }),
  ];
  cells.forEach(c => { c.channel.spatial.height = undefined; });
  const grid = makeGrid(2, 1, cells);
  const hm   = gridToHeightmap(grid);
  const norm = normalizeElevations(hm);
  assertClose(norm.stats.minElevation, 0.0);
  assertClose(norm.stats.maxElevation, 1.0);
  assertClose(norm.stats.elevationRange, 1.0);
});

// ─── TESTS: computeNormals ────────────────────────────────────────────────────

test('computeNormals: returns Float32Array of correct length', () => {
  const grid = makeGrid(4, 3, [makeCell(1, 1)]);
  const hm   = gridToHeightmap(grid);
  const n    = computeNormals(hm);
  assert(n instanceof Float32Array);
  assertEqual(n.length, 4 * 3 * 3); // width * height * 3
});

test('computeNormals: flat grid normals point up (0, 1, 0)', () => {
  const cells = [
    makeCell(0, 0, { density: 0.5 }),
    makeCell(1, 0, { density: 0.5 }),
    makeCell(0, 1, { density: 0.5 }),
    makeCell(1, 1, { density: 0.5 }),
  ];
  cells.forEach(c => { c.channel.spatial.height = undefined; });
  const grid = makeGrid(2, 2, cells);
  const hm   = gridToHeightmap(grid);
  const n    = computeNormals(hm);
  // Interior cell (1,1) on a flat grid: normal should be (0,1,0)
  const idx = (1 * 2 + 1) * 3;
  assertClose(n[idx],     0.0, 1e-5);
  assertClose(n[idx + 1], 1.0, 1e-5);
  assertClose(n[idx + 2], 0.0, 1e-5);
});

test('computeNormals: normals are unit length', () => {
  const cells = [
    makeCell(0, 0, { density: 0.2 }),
    makeCell(1, 0, { density: 0.8 }),
    makeCell(0, 1, { density: 0.5 }),
    makeCell(1, 1, { density: 0.3 }),
  ];
  cells.forEach(c => { c.channel.spatial.height = undefined; });
  const grid = makeGrid(2, 2, cells);
  const hm   = gridToHeightmap(grid);
  const n    = computeNormals(hm);
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.sqrt(n[i] ** 2 + n[i+1] ** 2 + n[i+2] ** 2);
    assertClose(len, 1.0, 1e-5, `Normal at index ${i} is not unit length: ${len}`);
  }
});

// ─── TESTS: toElevationBuffer ─────────────────────────────────────────────────

test('toElevationBuffer: returns Float32Array of width*height', () => {
  const grid = makeGrid(4, 3);
  const hm   = gridToHeightmap(grid);
  const buf  = toElevationBuffer(hm);
  assert(buf instanceof Float32Array);
  assertEqual(buf.length, 12);
});

test('toElevationBuffer: elevation values match cells', () => {
  const cells = [makeCell(0, 0, { density: 0.7 })];
  cells[0].channel.spatial.height = undefined;
  const grid = makeGrid(2, 1, cells);
  const hm   = gridToHeightmap(grid);
  const buf  = toElevationBuffer(hm);
  assertClose(buf[0], hm.cells[0].elevation);
});

// ─── TESTS: getMaterialDescriptor ────────────────────────────────────────────

test('getMaterialDescriptor: returns object for known materials', () => {
  for (const name of MATERIAL_NAMES) {
    const desc = getMaterialDescriptor(name);
    assert(typeof desc === 'object', `Expected object for ${name}`);
    assert('type' in desc, `Missing type for ${name}`);
  }
});

test('getMaterialDescriptor: returns copy (safe to mutate)', () => {
  const desc1 = getMaterialDescriptor('solid');
  const desc2 = getMaterialDescriptor('solid');
  desc1.roughness = 99;
  assertEqual(desc2.roughness, MATERIALS.solid.roughness, 'Mutation leaked through');
});

test('getMaterialDescriptor: unknown name falls back to DEFAULT_MATERIAL', () => {
  const desc    = getMaterialDescriptor('unknown_xyz');
  const default_ = getMaterialDescriptor(DEFAULT_MATERIAL);
  assertEqual(desc.type, default_.type);
});

test('getMaterialDescriptor: void type is none', () => {
  const desc = getMaterialDescriptor('void');
  assertEqual(desc.type, 'none');
});

test('getMaterialDescriptor: fluid type is standard with transparent', () => {
  const desc = getMaterialDescriptor('fluid');
  assertEqual(desc.type, 'standard');
  assertEqual(desc.transparent, true);
  assert(desc.opacity < 1);
});

// ─── TESTS: META PASSTHROUGH ──────────────────────────────────────────────────

test('gridToHeightmap: meta.frameIndex matches requested index', () => {
  const grid = makeGrid(2, 1, []);
  const hm   = gridToHeightmap(grid, 0);
  assertEqual(hm.meta.frameIndex, 0);
});

test('gridToHeightmap: meta.canvasMeta references original canvas', () => {
  const grid = makeGrid(5, 7);
  const hm   = gridToHeightmap(grid);
  assertEqual(hm.meta.canvasMeta.width,  5);
  assertEqual(hm.meta.canvasMeta.height, 7);
});

// ─── RESULTS ──────────────────────────────────────────────────────────────────

console.log(`\ntest-heightmap.js: ${passed} passed, ${failed} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.error}`);
}

export const results = {
  passed,
  failed,
  skipped: 0,
  summary: `test-heightmap.js: ${passed} passed, ${failed} failed`,
};
