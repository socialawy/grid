/**
 * test-grid-core.js — Comprehensive test suite for GRID v0.1.0
 * Works in both Node.js and browser environments
 * Zero external dependencies
 * 
 * Usage:
 *   Node: node tests/test-grid-core.js
 *   Browser: Open tests/test-runner.html
 */

// ============================================================
// MAIN TEST FUNCTION (async for top-level await support)
// ============================================================
async function runTests() {
// ============================================================
// ENVIRONMENT DETECTION
// ============================================================
const isNode = typeof window === 'undefined';
const isBrowser = !isNode;

// ============================================================
// LIGHTWEIGHT ASSERTION LIBRARY
// ============================================================
class Assert {
  static equal(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`FAIL: ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
    }
  }

  static notEqual(actual, expected, message = '') {
    if (actual === expected) {
      throw new Error(`FAIL: ${message}\n  Expected not: ${expected}\n  Actual: ${actual}`);
    }
  }

  static deepEqual(actual, expected, message = '') {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(`FAIL: ${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
    }
  }

  static throws(fn, message = '') {
    try {
      fn();
      throw new Error(`FAIL: ${message}\n  Expected function to throw`);
    } catch (e) {
      if (e.message.startsWith('FAIL:')) {
        throw e;
      }
      // Expected behavior - function threw
    }
  }

  static isTrue(value, message = '') {
    if (value !== true) {
      throw new Error(`FAIL: ${message}\n  Expected: true\n  Actual: ${value}`);
    }
  }

  static isFalse(value, message = '') {
    if (value !== false) {
      throw new Error(`FAIL: ${message}\n  Expected: false\n  Actual: ${value}`);
    }
  }

  static isNull(value, message = '') {
    if (value !== null) {
      throw new Error(`FAIL: ${message}\n  Expected: null\n  Actual: ${value}`);
    }
  }

  static notNull(value, message = '') {
    if (value === null) {
      throw new Error(`FAIL: ${message}\n  Expected: not null\n  Actual: null`);
    }
  }

  static matches(value, pattern, message = '') {
    if (!pattern.test(value)) {
      throw new Error(`FAIL: ${message}\n  Expected pattern: ${pattern}\n  Actual: ${value}`);
    }
  }
}

// ============================================================
// TEST RUNNER
// ============================================================
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.results = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('=== GRID Core Test Suite ===\n');
    
    for (const test of this.tests) {
      try {
        await test.fn();
        this.passed++;
        this.results.push({ name: test.name, status: 'PASS' });
        console.log(`✅ ${test.name}`);
      } catch (error) {
        this.failed++;
        this.results.push({ name: test.name, status: 'FAIL', error: error.message });
        console.log(`❌ ${test.name}`);
        console.log(`   ${error.message}`);
      }
    }

    this.printSummary();
    return this.results;
  }

  printSummary() {
    console.log(`\n=== Test Results ===`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Total: ${this.tests.length}`);
    console.log(`Success Rate: ${((this.passed / this.tests.length) * 100).toFixed(1)}%`);
  }
}

// ============================================================
// LOAD GRID CORE (ENVIRONMENT-SPECIFIC)
// ============================================================
let GridCore;

if (isNode) {
  // Node.js environment - use dynamic import for ESM
  try {
    const coreModule = await import('../src/core/grid-core.js');
    GridCore = coreModule.default;
  } catch (error) {
    console.error('Failed to load grid-core.js:', error);
    throw error;
  }
} else {
  // Browser environment - GridCore should be global
  GridCore = globalThis.GridCore;
}

// ============================================================
// TEST DATA
// ============================================================
const testGrids = {
  minimal: {
    grid: "grid",
    version: "0.1.0",
    meta: {
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      name: "Minimal Test",
      created: "2026-02-17T12:00:00Z",
      modified: "2026-02-17T12:00:00Z"
    },
    canvas: {
      width: 10,
      height: 5,
      charset: "@#$%&*+=-.  ",
      defaultChar: ".",
      defaultColor: "#00ff00"
    },
    frames: [
      {
        id: "frame_001",
        index: 0,
        cells: [
          { x: 4, y: 2, char: "@" },
          { x: 5, y: 2, char: "@" }
        ]
      }
    ]
  }
};

// ============================================================
// TEST SUITE
// ============================================================
const runner = new TestRunner();

// ============================================================
// CREATION FUNCTIONS TESTS
// ============================================================
runner.test('createGrid - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5, '@#$', '#00ff00');
  
  Assert.equal(grid.grid, 'grid');
  Assert.equal(grid.version, '0.1.0');
  Assert.equal(grid.canvas.width, 10);
  Assert.equal(grid.canvas.height, 5);
  Assert.equal(grid.canvas.charset, '@#$');
  Assert.equal(grid.canvas.defaultColor, '#00ff00');
  Assert.equal(grid.frames.length, 1);
  Assert.equal(grid.frames[0].cells.length, 0);
});

runner.test('createGrid - with options', () => {
  const grid = GridCore.createGrid(20, 10, '@#$', '#ff0000', {
    name: 'Test Project',
    defaultChar: ' ',
    background: '#000000',
    fontFamily: 'Courier New'
  });
  
  Assert.equal(grid.meta.name, 'Test Project');
  Assert.equal(grid.canvas.defaultChar, ' ');
  Assert.equal(grid.canvas.background, '#000000');
  Assert.equal(grid.canvas.fontFamily, 'Courier New');
});

runner.test('createGrid - invalid dimensions', () => {
  Assert.throws(() => GridCore.createGrid(0, 10, '@#$', '#00ff00'));
  Assert.throws(() => GridCore.createGrid(10, 0, '@#$', '#00ff00'));
  Assert.throws(() => GridCore.createGrid(1001, 10, '@#$', '#00ff00'));
  Assert.throws(() => GridCore.createGrid(10, 1001, '@#$', '#00ff00'));
});

runner.test('createFrame - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = GridCore.createFrame(grid, 'Test Frame');
  
  Assert.equal(frame.id, 'frame_002');
  Assert.equal(frame.index, 1);
  Assert.equal(frame.label, 'Test Frame');
  Assert.equal(frame.cells.length, 0);
  Assert.deepEqual(frame.layers, ['visual']);
});

runner.test('createCell - basic functionality', () => {
  const cell = GridCore.createCell(5, 3, '@', { color: '#ff0000' });
  
  Assert.equal(cell.x, 5);
  Assert.equal(cell.y, 3);
  Assert.equal(cell.char, '@');
  Assert.equal(cell.color, '#ff0000');
  Assert.equal(cell.semantic, 'entity');
  Assert.equal(cell.density, 0.9);
});

runner.test('createCell - invalid coordinates', () => {
  Assert.throws(() => GridCore.createCell(-1, 0, '@'));
  Assert.throws(() => GridCore.createCell(0, -1, '@'));
  Assert.throws(() => GridCore.createCell(1.5, 0, '@'));
});

runner.test('createCell - invalid character', () => {
  Assert.throws(() => GridCore.createCell(0, 0, ''));
  Assert.throws(() => GridCore.createCell(0, 0, 'abc'));
});

runner.test('generateId - UUID v4 format', () => {
  const id = GridCore.generateId();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  
  Assert.matches(id, uuidPattern);
});

runner.test('addFrame - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = GridCore.createFrame(grid);
  
  // Small delay to ensure different timestamp
  if (isNode) {
    const { performance } = require('perf_hooks');
    const start = performance.now();
    while (performance.now() - start < 1) {
      // Wait at least 1ms
    }
  }
  
  const newGrid = GridCore.addFrame(grid, frame);
  
  Assert.equal(newGrid.frames.length, 2);
  Assert.equal(newGrid.frames[1].index, 1);
  Assert.isTrue(newGrid.meta.modified !== grid.meta.modified);
});

runner.test('removeFrame - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = GridCore.createFrame(grid);
  const gridWithFrame = GridCore.addFrame(grid, frame);
  const newGrid = GridCore.removeFrame(gridWithFrame, frame.id);
  
  Assert.equal(newGrid.frames.length, 1);
  Assert.equal(newGrid.frames[0].index, 0);
});

runner.test('removeFrame - error cases', () => {
  const grid = GridCore.createGrid(10, 5);
  
  Assert.throws(() => GridCore.removeFrame(grid, 'nonexistent'));
  Assert.throws(() => {
    const singleFrame = GridCore.createGrid(10, 5);
    GridCore.removeFrame(singleFrame, singleFrame.frames[0].id);
  });
});

runner.test('getFrame - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = GridCore.getFrame(grid, grid.frames[0].id);
  
  Assert.notNull(frame);
  Assert.equal(frame.id, grid.frames[0].id);
});

runner.test('getFrame - not found', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = GridCore.getFrame(grid, 'nonexistent');
  
  Assert.isNull(frame);
});

runner.test('getFrameByIndex - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = GridCore.getFrameByIndex(grid, 0);
  
  Assert.notNull(frame);
  Assert.equal(frame.index, 0);
});

// ============================================================
// CELL OPERATIONS TESTS
// ============================================================
runner.test('setCell - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = grid.frames[0];
  const newFrame = GridCore.setCell(frame, 5, 3, { char: '@', color: '#ff0000' });
  
  Assert.equal(newFrame.cells.length, 1);
  const cell = newFrame.cells[0];
  Assert.equal(cell.x, 5);
  Assert.equal(cell.y, 3);
  Assert.equal(cell.char, '@');
  Assert.equal(cell.color, '#ff0000');
});

runner.test('setCell - replace existing', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = grid.frames[0];
  const frame1 = GridCore.setCell(frame, 5, 3, { char: '@', color: '#ff0000' });
  const frame2 = GridCore.setCell(frame1, 5, 3, { char: '#', color: '#00ff00' });
  
  Assert.equal(frame2.cells.length, 1);
  Assert.equal(frame2.cells[0].char, '#');
  Assert.equal(frame2.cells[0].color, '#00ff00');
});

runner.test('getCell - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = grid.frames[0];
  const newFrame = GridCore.setCell(frame, 5, 3, { char: '@' });
  
  const cell = GridCore.getCell(newFrame, 5, 3);
  Assert.notNull(cell);
  Assert.equal(cell.char, '@');
  
  const empty = GridCore.getCell(newFrame, 0, 0);
  Assert.isNull(empty);
});

runner.test('getResolvedCell - existing cell', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = grid.frames[0];
  const newFrame = GridCore.setCell(frame, 5, 3, { char: '@', color: '#ff0000' });
  
  const cell = GridCore.getResolvedCell(newFrame, 5, 3, grid.canvas);
  Assert.equal(cell.char, '@');
  Assert.equal(cell.color, '#ff0000');
});

runner.test('getResolvedCell - default cell', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = grid.frames[0];
  
  const cell = GridCore.getResolvedCell(frame, 0, 0, grid.canvas);
  Assert.equal(cell.char, grid.canvas.defaultChar);
  Assert.equal(cell.color, grid.canvas.defaultColor);
});

runner.test('removeCell - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = grid.frames[0];
  const frame1 = GridCore.setCell(frame, 5, 3, { char: '@' });
  const frame2 = GridCore.removeCell(frame1, 5, 3);
  
  Assert.equal(frame2.cells.length, 0);
});

runner.test('getCellsBySemantic - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = grid.frames[0];
  const frame1 = GridCore.setCell(frame, 0, 0, { char: '@' }); // entity
  const frame2 = GridCore.setCell(frame1, 1, 0, { char: '~' }); // fluid
  
  const entityCells = GridCore.getCellsBySemantic(frame2, 'entity');
  const fluidCells = GridCore.getCellsBySemantic(frame2, 'fluid');
  
  Assert.equal(entityCells.length, 1);
  Assert.equal(fluidCells.length, 1);
  Assert.equal(entityCells[0].char, '@');
  Assert.equal(fluidCells[0].char, '~');
});

runner.test('getCellsByChannel - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const frame = grid.frames[0];
  const frame1 = GridCore.setCell(frame, 0, 0, { 
    char: '@',
    channel: { audio: { note: 'C', octave: 4 } }
  });
  
  const audioCells = GridCore.getCellsByChannel(frame1, 'audio');
  const spatialCells = GridCore.getCellsByChannel(frame1, 'spatial');
  
  Assert.equal(audioCells.length, 1);
  Assert.equal(spatialCells.length, 0);
  Assert.equal(audioCells[0].channel.audio.note, 'C');
});

// ============================================================
// UTILITY FUNCTIONS TESTS
// ============================================================
runner.test('calcDensity - known characters', () => {
  Assert.equal(GridCore.calcDensity(' '), 0.0);
  Assert.equal(GridCore.calcDensity('@'), 0.9);
  Assert.equal(GridCore.calcDensity('#'), 0.8);
  Assert.equal(GridCore.calcDensity('.'), 0.05);
});

runner.test('calcDensity - unknown characters', () => {
  Assert.equal(GridCore.calcDensity('A'), 0.5); // ASCII default
  Assert.equal(GridCore.calcDensity('€'), 0.6); // Unicode default
  Assert.equal(GridCore.calcDensity(''), 0.0); // Empty string
});

runner.test('inferSemantic - known patterns', () => {
  Assert.equal(GridCore.inferSemantic(' '), 'void');
  Assert.equal(GridCore.inferSemantic('~'), 'fluid');
  Assert.equal(GridCore.inferSemantic('*'), 'emissive');
  Assert.equal(GridCore.inferSemantic('@'), 'entity');
  Assert.equal(GridCore.inferSemantic('|'), 'boundary');
  Assert.equal(GridCore.inferSemantic('#'), 'solid');
});

// ============================================================
// MAP EXTRACTORS TESTS
// ============================================================
runner.test('getDensityMap - basic functionality', () => {
  const grid = GridCore.createGrid(5, 3);
  const frame = grid.frames[0];
  const frame1 = GridCore.setCell(frame, 1, 1, { char: '@' });
  
  const map = GridCore.getDensityMap(frame1, grid.canvas);
  
  Assert.equal(map.length, 3);
  Assert.equal(map[0].length, 5);
  Assert.equal(map[1][1], 0.9); // @ character
  Assert.equal(map[0][0], 0.0); // default space
});

runner.test('getSemanticMap - basic functionality', () => {
  const grid = GridCore.createGrid(5, 3);
  const frame = grid.frames[0];
  const frame1 = GridCore.setCell(frame, 1, 1, { char: '@' });
  
  const map = GridCore.getSemanticMap(frame1, grid.canvas);
  
  Assert.equal(map.length, 3);
  Assert.equal(map[0].length, 5);
  Assert.equal(map[1][1], 'entity'); // @ character
  Assert.equal(map[0][0], 'void'); // default space
});

runner.test('getColorMap - basic functionality', () => {
  const grid = GridCore.createGrid(5, 3);
  const frame = grid.frames[0];
  const frame1 = GridCore.setCell(frame, 1, 1, { char: '@', color: '#ff0000' });
  
  const map = GridCore.getColorMap(frame1, grid.canvas);
  
  Assert.equal(map.length, 3);
  Assert.equal(map[0].length, 5);
  Assert.equal(map[1][1], '#ff0000'); // custom color
  Assert.equal(map[0][0], '#00ff00'); // default color
});

runner.test('getCharMap - basic functionality', () => {
  const grid = GridCore.createGrid(5, 3);
  const frame = grid.frames[0];
  const frame1 = GridCore.setCell(frame, 1, 1, { char: '@' });
  
  const map = GridCore.getCharMap(frame1, grid.canvas);
  
  Assert.equal(map.length, 3);
  Assert.equal(map[0].length, 5);
  Assert.equal(map[1][1], '@'); // custom character
  Assert.equal(map[0][0], ' '); // default character
});

// ============================================================
// SERIALIZATION TESTS
// ============================================================
runner.test('serializeGrid - basic functionality', () => {
  const grid = GridCore.createGrid(5, 3);
  const json = GridCore.serializeGrid(grid);
  
  Assert.isTrue(typeof json === 'string');
  Assert.isTrue(json.includes('"grid": "grid"'));
  Assert.isTrue(json.includes('"version": "0.1.0"'));
});

runner.test('deserializeGrid - basic functionality', () => {
  const json = JSON.stringify(testGrids.minimal);
  const grid = GridCore.deserializeGrid(json);
  
  Assert.equal(grid.grid, 'grid');
  Assert.equal(grid.version, '0.1.0');
  Assert.equal(grid.meta.name, 'Minimal Test');
});

runner.test('deserializeGrid - invalid format', () => {
  Assert.throws(() => GridCore.deserializeGrid('{"not": "grid"}'));
  Assert.throws(() => GridCore.deserializeGrid('invalid json'));
});

// ============================================================
// VALIDATION TESTS
// ============================================================
runner.test('validateGrid - valid grid', () => {
  const result = GridCore.validateGrid(testGrids.minimal);
  
  Assert.isTrue(result.valid);
  Assert.equal(result.errors.length, 0);
});

runner.test('validateGrid - missing required fields', () => {
  const invalid = { ...testGrids.minimal };
  delete invalid.grid;
  
  const result = GridCore.validateGrid(invalid);
  
  Assert.isFalse(result.valid);
  Assert.isTrue(result.errors.length > 0);
});

runner.test('validateGrid - invalid canvas dimensions', () => {
  const invalid = JSON.parse(JSON.stringify(testGrids.minimal));
  invalid.canvas.width = 0;
  
  const result = GridCore.validateGrid(invalid);
  
  Assert.isFalse(result.valid);
  Assert.isTrue(result.errors.some(e => e.includes('width')));
});

// ============================================================
// UTILITY FUNCTIONS TESTS
// ============================================================
runner.test('cloneGrid - basic functionality', () => {
  const grid = GridCore.createGrid(5, 3);
  const clone = GridCore.cloneGrid(grid);
  
  Assert.deepEqual(grid, clone);
  Assert.notEqual(grid, clone); // Different objects
  Assert.notEqual(grid.meta, clone.meta); // Deep clone
});

runner.test('touchGrid - basic functionality', () => {
  const grid = GridCore.createGrid(5, 3);
  const originalModified = grid.meta.modified;
  
  // Small delay to ensure different timestamp
  if (isNode) {
    const { performance } = require('perf_hooks');
    const start = performance.now();
    while (performance.now() - start < 1) {
      // Wait at least 1ms
    }
  }
  
  const touched = GridCore.touchGrid(grid);
  
  Assert.isTrue(touched.meta.modified !== originalModified);
});

runner.test('getGridStats - basic functionality', () => {
  const grid = GridCore.createGrid(10, 5);
  const stats = GridCore.getGridStats(grid);
  
  Assert.equal(stats.frameCount, 1);
  Assert.equal(stats.totalCells, 0);
  Assert.equal(stats.canvasSize, '10x5');
  Assert.equal(stats.version, '0.1.0');
});

// ============================================================
// ROUND-TRIP TESTS
// ============================================================
runner.test('round-trip serialization', () => {
  const original = GridCore.createGrid(10, 5, '@#$', '#ff0000', {
    name: 'Round Trip Test'
  });
  
  // Add some cells
  const frame = original.frames[0];
  original.frames[0] = GridCore.setCell(frame, 2, 3, { char: '@', color: '#00ff00' });
  
  const serialized = GridCore.serializeGrid(original);
  const deserialized = GridCore.deserializeGrid(serialized);
  
  Assert.deepEqual(original, deserialized);
});

// ============================================================
// PERFORMANCE TESTS
// ============================================================
runner.test('performance - grid creation', () => {
  const start = isNode ? process.hrtime.bigint() : performance.now();
  
  const grid = GridCore.createGrid(200, 100);
  
  const end = isNode ? process.hrtime.bigint() : performance.now();
  const duration = isNode ? Number(end - start) / 1000000 : end - start;
  
  console.log(`    Grid creation time: ${duration.toFixed(2)}ms`);
  Assert.isTrue(duration < 50, `Grid creation took ${duration}ms, expected < 50ms`);
});

runner.test('performance - cell operations', () => {
  const grid = GridCore.createGrid(100, 50);
  let frame = grid.frames[0];
  
  const start = isNode ? process.hrtime.bigint() : performance.now();
  
  // Add 1000 cells
  for (let i = 0; i < 1000; i++) {
    frame = GridCore.setCell(frame, i % 100, Math.floor(i / 100), { 
      char: '@#$%&*+='[i % 8] 
    });
  }
  
  const end = isNode ? process.hrtime.bigint() : performance.now();
  const duration = isNode ? Number(end - start) / 1000000 : end - start;
  
  console.log(`    1000 cell operations time: ${duration.toFixed(2)}ms`);
  Assert.isTrue(duration < 100, `Cell operations took ${duration}ms, expected < 100ms`);
});

// ============================================================
// SCHEMA VALIDATION TESTS (Node only)
// ============================================================
if (isNode) {
  runner.test('schema validation - example files', async () => {
    const fs = require('fs');
    const path = require('path');
    
    const examplesDir = path.join(__dirname, '..', 'schemas', 'examples');
    const files = ['minimal.grid', 'heartbeat.grid', 'mist-demo.grid'];
    
    for (const file of files) {
      const filePath = path.join(examplesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const grid = GridCore.deserializeGrid(content);
      const validation = GridCore.validateGrid(grid);
      
      Assert.isTrue(validation.valid, `Schema validation failed for ${file}: ${validation.errors.join(', ')}`);
    }
  });
}

// ============================================================
// RUN TESTS
// ============================================================

// Export results for unified runner
export const results = { passed: 0, failed: 0, skipped: 0 };

// Main execution
if (isNode) {
  // Run the async test function
  (async () => {
    try {
      const runResults = await runner.run();
      results.passed = runResults.filter(r => r.status === 'PASS').length;
      results.failed = runResults.filter(r => r.status === 'FAIL').length;
      results.skipped = runResults.filter(r => r.status === 'SKIP').length;
      
      // Only exit if running directly (not when imported)
      if (import.meta.url === `file://${process.argv[1]}`) {
        process.exit(results.failed > 0 ? 1 : 0);
      }
    } catch (error) {
      console.error('Test runner error:', error);
      if (import.meta.url === `file://${process.argv[1]}`) {
        process.exit(1);
      }
    }
  })();
} else {
  // Browser - expose to global
  globalThis.GridTestRunner = runner;
  globalThis.runTests = () => runner.run();
}

// Close the async function
}