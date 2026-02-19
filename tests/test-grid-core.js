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
// ENVIRONMENT DETECTION
// ============================================================
const isNode = typeof globalThis.window === 'undefined';

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
// MAIN TEST FUNCTION
// ============================================================
async function runTests() {
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

  runner.test('generateId - UUID v4 format', () => {
    const id = GridCore.generateId();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    
    Assert.matches(id, uuidPattern);
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

  runner.test('getCell - basic functionality', () => {
    const grid = GridCore.createGrid(10, 5);
    const frame = grid.frames[0];
    const frame1 = GridCore.setCell(frame, 5, 3, { char: '@', color: '#ff0000' });
    
    const cell = GridCore.getCell(frame1, 5, 3);
    Assert.notNull(cell);
    Assert.equal(cell.char, '@');
    Assert.equal(cell.color, '#ff0000');
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

  // ============================================================
  // VALIDATION TESTS
  // ============================================================
  runner.test('validateGrid - valid grid', () => {
    const result = GridCore.validateGrid(testGrids.minimal);
    
    Assert.isTrue(result.valid);
    Assert.equal(result.errors.length, 0);
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

  // ============================================================
  // RUN TESTS AND RETURN RESULTS
  // ============================================================
  const runResults = await runner.run();
  
  // Export results for unified runner
  const results = {
    passed: runResults.filter(r => r.status === 'PASS').length,
    failed: runResults.filter(r => r.status === 'FAIL').length,
    skipped: runResults.filter(r => r.status === 'SKIP').length,
    summary: `GRID Core: ${runResults.filter(r => r.status === 'PASS').length} passed, ${runResults.filter(r => r.status === 'FAIL').length} failed, ${runResults.filter(r => r.status === 'SKIP').length} skipped`
  };

  return results;
}

// ============================================================
// EXPORT AND EXECUTION
// ============================================================

// Export for unified runner
export let results = { passed: 0, failed: 0, skipped: 0 };

// Main execution
if (isNode) {
  // Run tests and update results
  runTests().then(runResults => {
    results = runResults;
    
    // Only exit if running directly (not when imported)
    if (import.meta.url === `file://${process.argv[1]}`) {
      process.exit(results.failed > 0 ? 1 : 0);
    }
  }).catch(error => {
    console.error('Test runner error:', error);
    if (import.meta.url === `file://${process.argv[1]}`) {
      process.exit(1);
    }
  });
} else {
  // Browser - expose to global
  globalThis.GridTestRunner = { run: runTests };
  globalThis.runTests = () => runTests();
}
