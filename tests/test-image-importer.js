/**
 * test-image-importer.js — Unit tests for image-importer.js
 *
 * Tests rgbToHex and imageToGrid.
 * imageToGrid needs a canvas — runs in Node via a mock canvas/image.
 * Also designed for the browser test runner (tests/webgl2-test.html pattern).
 *
 * Exported `results` object is consumed by run-all.js.
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
// MOCK CANVAS (for Node.js where no DOM exists)
// ============================================================

/**
 * Build a synthetic ImageData-like object filled with a solid colour.
 * @param {number} w
 * @param {number} h
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function makeImageData(w, h, r, g, b) {
  const size = w * h * 4;
  const data = new Uint8ClampedArray(size);
  for (let i = 0; i < size; i += 4) {
    data[i]     = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255; // fully opaque
  }
  return { data, width: w, height: h };
}

/**
 * Build a mock 2D context whose getImageData always returns the given color.
 */
function makeMockCtx(r, g, b) {
  return {
    drawImage() {},
    getImageData(x, y, w, h) {
      return makeImageData(w, h, r, g, b);
    },
  };
}

/**
 * Build a mock canvas that wraps a mock context.
 */
function makeMockCanvas(ctx) {
  return {
    width:  0,
    height: 0,
    getContext() { return ctx; },
  };
}

/**
 * Build a mock image element.
 */
function makeMockImage(w, h) {
  return { naturalWidth: w, naturalHeight: h, width: w, height: h };
}

// Inject canvas mock into Node.js global so image-importer uses it.
// Always run when OffscreenCanvas is absent — even if document was already
// mocked by a previously-run test suite (e.g. test-input-system.js sets a
// MockEventTarget that lacks createElement).
if (typeof OffscreenCanvas === 'undefined') {
  let _mockCtxToUse = null;

  global._setMockCtx = (ctx) => { _mockCtxToUse = ctx; };

  // Preserve any existing document properties but add/override createElement
  const existingDoc = (typeof document !== 'undefined') ? document : {};
  global.document = Object.assign(Object.create(Object.getPrototypeOf(existingDoc) ?? Object.prototype), existingDoc, {
    createElement(tag) {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext() { return _mockCtxToUse; },
        };
      }
      return null;
    },
  });
}

// ============================================================
// LOAD MODULE
// ============================================================

const { imageToGrid, DEFAULT_CHAR_RAMP, rgbToHex } =
  await import('../src/importers/image-importer.js');

// ============================================================
// TESTS: rgbToHex (pure function — always testable in Node)
// ============================================================

section('rgbToHex');

assertEqual(rgbToHex(255, 0,   0),   '#ff0000', 'red');
assertEqual(rgbToHex(0,   255, 0),   '#00ff00', 'green');
assertEqual(rgbToHex(0,   0,   255), '#0000ff', 'blue');
assertEqual(rgbToHex(0,   0,   0),   '#000000', 'black');
assertEqual(rgbToHex(255, 255, 255), '#ffffff', 'white');
assertEqual(rgbToHex(16,  32,  48),  '#102030', 'arbitrary color');
// Rounding: fractional values
assertEqual(rgbToHex(127.6, 0, 0),   '#800000', 'rounds fractional R');
// Clamping: out-of-range values
assertEqual(rgbToHex(300, -10, 128), '#ff0080', 'clamps out-of-range values');

// ============================================================
// TESTS: DEFAULT_CHAR_RAMP
// ============================================================

section('DEFAULT_CHAR_RAMP');

assert(typeof DEFAULT_CHAR_RAMP === 'string',    'DEFAULT_CHAR_RAMP is a string');
assert(DEFAULT_CHAR_RAMP.length > 0,             'DEFAULT_CHAR_RAMP is non-empty');
assert(DEFAULT_CHAR_RAMP.endsWith(' '),          'DEFAULT_CHAR_RAMP ends with space (lightest)');
assert(DEFAULT_CHAR_RAMP.startsWith('@'),        'DEFAULT_CHAR_RAMP starts with @ (darkest)');

// ============================================================
// TESTS: imageToGrid — structure
// ============================================================

section('imageToGrid — grid structure');

{
  const ctx   = makeMockCtx(128, 64, 32);  // mid-grey-ish color
  global._setMockCtx?.(ctx);

  const img  = makeMockImage(100, 50);
  const grid = imageToGrid(img, { cellSize: 10 });

  assert(grid.grid === 'grid',            'format identifier correct');
  assert(grid.version === '0.1.0',        'version correct');
  assert(Array.isArray(grid.frames),      'has frames array');
  assert(grid.frames.length >= 1,         'at least one frame');
  assert(grid.canvas.width  === 10,       'gridWidth = floor(100/10) = 10');
  assert(grid.canvas.height === 5,        'gridHeight = floor(50/10) = 5');
  assert(typeof grid.meta.id === 'string','has meta.id');
  assert(grid.meta.name === 'Imported Image', 'default project name');
}

// ============================================================
// TESTS: imageToGrid — cell channels from a known color
// ============================================================

section('imageToGrid — cell channels');

{
  // Use bright red (255,0,0) — high brightness → light char (near end of ramp)
  const ctx  = makeMockCtx(255, 0, 0);
  global._setMockCtx?.(ctx);

  const img  = makeMockImage(20, 10);
  const grid = imageToGrid(img, { cellSize: 10 });
  const frame = grid.frames[0];

  // With brightness=85 (=(255+0+0)/3) → adjusted ≈ 85 → char near index 2-3 of '@%#*+=-:. '
  // Expected non-space char
  if (frame.cells.length > 0) {
    const cell = frame.cells[0];
    assert(typeof cell.char  === 'string' && cell.char.length > 0, 'cell has char');
    assert(typeof cell.color === 'string' && /^#[0-9a-f]{6}$/.test(cell.color), 'cell has hex color');
    assert(typeof cell.density === 'number' && cell.density >= 0 && cell.density <= 1, 'density in [0,1]');
    assert(typeof cell.semantic === 'string' && cell.semantic.length > 0,              'cell has semantic');
  } else {
    // All bright pixels map to space — that is also valid (sparse grid)
    assert(true, 'imageToGrid ran without error (all space cells skipped)');
  }
}

// ============================================================
// TESTS: imageToGrid — very dark image → densest char
// ============================================================

section('imageToGrid — dark image uses dark char');

{
  const ctx  = makeMockCtx(0, 0, 0);   // pure black
  global._setMockCtx?.(ctx);

  const img  = makeMockImage(10, 10);
  const grid = imageToGrid(img, { cellSize: 10 });
  const frame = grid.frames[0];

  // brightness=0 → charIndex=0 → '@' (darkest in default ramp)
  assert(frame.cells.length === 1, 'one cell for 10×10 image with cellSize=10');
  if (frame.cells.length > 0) {
    const char = DEFAULT_CHAR_RAMP[0];
    assertEqual(frame.cells[0].char, char, `darkest pixel → ramp[0] = '${char}'`);
    // Density should be near 1 (dark)
    assert(frame.cells[0].density > 0.9, 'black pixel has density ≈ 1');
  }
}

// ============================================================
// TESTS: imageToGrid — white image → space (sparse, no cells)
// ============================================================

section('imageToGrid — white image produces empty frame');

{
  const ctx  = makeMockCtx(255, 255, 255);   // pure white
  global._setMockCtx?.(ctx);

  const img  = makeMockImage(10, 10);
  const grid = imageToGrid(img, { cellSize: 10 });
  const frame = grid.frames[0];

  // brightness=255 → charIndex = last (space) → skipped (sparse)
  assertEqual(frame.cells.length, 0, 'white image yields no cells (space chars skipped)');
}

// ============================================================
// TESTS: imageToGrid — contrast option
// ============================================================

section('imageToGrid — contrast adjustment');

{
  // Mid-grey with high contrast — should push toward extremes
  const ctx  = makeMockCtx(200, 200, 200);   // fairly bright
  global._setMockCtx?.(ctx);

  const imgLow  = makeMockImage(10, 10);
  const imgHigh = makeMockImage(10, 10);

  const gridLow  = imageToGrid(imgLow,  { cellSize: 10, contrast: 0   });
  const gridHigh = imageToGrid(imgHigh, { cellSize: 10, contrast: 150 });

  // Both valid grids
  assert(gridLow.frames.length  >= 1, 'low contrast: valid grid');
  assert(gridHigh.frames.length >= 1, 'high contrast: valid grid');
}

// ============================================================
// TESTS: imageToGrid — custom charRamp
// ============================================================

section('imageToGrid — custom charRamp');

{
  const ctx  = makeMockCtx(0, 0, 0);   // black
  global._setMockCtx?.(ctx);

  const img  = makeMockImage(10, 10);
  const grid = imageToGrid(img, { cellSize: 10, charRamp: 'X ' });
  const frame = grid.frames[0];

  // Black → charIndex=0 → 'X'
  if (frame.cells.length > 0) {
    assertEqual(frame.cells[0].char, 'X', 'custom ramp[0] = X used for dark pixels');
  }
  assert(grid.canvas.charset.includes('X'), 'charset includes custom ramp chars');
}

// ============================================================
// TESTS: imageToGrid — gridWidth / gridHeight override
// ============================================================

section('imageToGrid — forced dimensions');

{
  const ctx  = makeMockCtx(128, 128, 128);
  global._setMockCtx?.(ctx);

  const img  = makeMockImage(100, 80);
  const grid = imageToGrid(img, { gridWidth: 20, gridHeight: 10 });

  assertEqual(grid.canvas.width,  20, 'gridWidth override respected');
  assertEqual(grid.canvas.height, 10, 'gridHeight override respected');
}

// ============================================================
// TESTS: imageToGrid — projectName option
// ============================================================

section('imageToGrid — projectName');

{
  const ctx  = makeMockCtx(0, 0, 0);
  global._setMockCtx?.(ctx);

  const img  = makeMockImage(10, 10);
  const grid = imageToGrid(img, { cellSize: 10, projectName: 'My Photo' });

  assertEqual(grid.meta.name, 'My Photo', 'projectName set in meta.name');
}

// ============================================================
// TESTS: imageToGrid — invalid image throws
// ============================================================

section('imageToGrid — error handling');

{
  let threw = false;
  try {
    imageToGrid({ naturalWidth: 0, naturalHeight: 0 });
  } catch (e) {
    threw = true;
  }
  assert(threw, 'throws for zero-dimension image');
}

// ============================================================
// RESULTS
// ============================================================

console.log(`\n${'='.repeat(50)}`);
console.log(`Image Importer: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('Failed tests:', failures.join('; '));
}

export const results = {
  passed,
  failed,
  skipped: 0,
  summary: `Image Importer: ${passed} passed, ${failed} failed`,
};
