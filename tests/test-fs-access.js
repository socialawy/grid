/**
 * test-fs-access.js — Unit tests for fs-access.js
 *
 * Pure Node.js — uses mocked File System Access API objects.
 * Exported `results` object is consumed by run-all.js.
 */

// ============================================================
// MINI ASSERT LIBRARY
// ============================================================

let passed = 0;
let failed = 0;
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

async function assertRejects(asyncFn, expectedSubstr, message) {
  try {
    await asyncFn();
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
// MOCK HELPERS
// ============================================================

/**
 * Create a mock writable stream that captures written data.
 */
function createMockWritable() {
  const writable = {
    _chunks: [],
    _closed: false,
    async write(data) { writable._chunks.push(data); },
    async close() { writable._closed = true; },
  };
  return writable;
}

/**
 * Create a mock FileSystemFileHandle.
 * @param {string} name - File name
 * @param {string} [content=''] - Initial file content (for reading)
 */
function createMockFileHandle(name, content = '') {
  const writable = createMockWritable();
  const handle = {
    kind: 'file',
    name,
    _writable: writable,
    _content: content,
    async getFile() {
      return {
        name: handle.name,
        async text() { return handle._content; },
      };
    },
    async createWritable() {
      // Reset chunks for each new writable
      writable._chunks = [];
      writable._closed = false;
      return writable;
    },
  };
  return handle;
}

/**
 * Build a minimal valid grid object for testing.
 */
function makeTestGrid(name = 'TestProject') {
  return {
    grid: 'grid',
    version: '0.1.0',
    meta: {
      id: '00000000-0000-0000-0000-000000000000',
      name,
      created: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:00.000Z',
      author: '',
      tags: [],
      notes: '',
    },
    canvas: {
      width: 2,
      height: 2,
      cellWidth: 10,
      cellHeight: 18,
      fontSize: 16,
      background: '#000000',
      fontFamily: 'monospace',
    },
    frames: [
      {
        id: 'f0',
        cells: [
          { x: 0, y: 0, char: '#', color: '#00ff00', density: 0.95, semantic: 'solid' },
        ],
        layers: ['visual'],
        duration: null,
        label: '',
      },
    ],
    sequences: [],
    project: {
      bpm: 120,
      scale: 'chromatic',
      key: 'C',
      palette: {},
      tier: 0,
    },
  };
}

// ============================================================
// SETUP GLOBALS (mock window, document, etc.)
// ============================================================

// Blob and URL mocks (must be set before any module import)
if (typeof Blob === 'undefined') {
  globalThis.Blob = class Blob {
    constructor(parts, opts) {
      this._parts = parts;
      this.type = (opts && opts.type) || '';
    }
  };
}
// Patch URL.createObjectURL / revokeObjectURL (always override for test)
URL.createObjectURL = () => 'blob:mock-url';
URL.revokeObjectURL = () => {};

// Save originals
const origWindow = globalThis.window;
const origDocument = globalThis.document;

function setupMockWindow(overrides = {}) {
  // Only include picker properties if explicitly provided
  const win = {};
  if (overrides.showSaveFilePicker) win.showSaveFilePicker = overrides.showSaveFilePicker;
  if (overrides.showOpenFilePicker) win.showOpenFilePicker = overrides.showOpenFilePicker;
  if (overrides.launchQueue) win.launchQueue = overrides.launchQueue;
  Object.assign(win, overrides);
  globalThis.window = win;

  // Minimal document mock for downloadFallback
  const removedChildren = [];
  const clickedLinks = [];
  globalThis.document = {
    createElement(tag) {
      if (tag === 'a') {
        const el = { href: '', download: '', style: {}, click() { clickedLinks.push(el); } };
        return el;
      }
      return {};
    },
    body: {
      appendChild() {},
      removeChild(el) { removedChildren.push(el); },
    },
    _removedChildren: removedChildren,
    _clickedLinks: clickedLinks,
  };

}

function teardownMockWindow() {
  globalThis.window = origWindow;
  globalThis.document = origDocument;
}

// ============================================================
// TESTS
// ============================================================

async function runTests() {
  // We need to set up window BEFORE importing the module so the import
  // sees window and can attach globals. But isFsAccessAvailable is checked
  // at call time, so we can toggle window between tests.

  // Set up basic window for module import
  setupMockWindow({});

  // Dynamic import so mocks are in place
  const mod = await import('../src/persistence/fs-access.js');
  const {
    isFsAccessAvailable,
    saveAs,
    saveToHandle,
    openFile,
    registerFileHandler,
    downloadFallback,
    saveCascade,
    getCurrentHandle,
    clearCurrentHandle,
  } = mod;

  // ----------------------------------------------------------
  section('isFsAccessAvailable');
  // ----------------------------------------------------------

  // Test 1: returns false when showSaveFilePicker is missing
  delete globalThis.window.showSaveFilePicker;
  assert(!isFsAccessAvailable(), 'false when showSaveFilePicker missing');

  // Test 2: returns true when showSaveFilePicker is present
  globalThis.window.showSaveFilePicker = async () => {};
  assert(isFsAccessAvailable(), 'true when showSaveFilePicker present');

  // Test 3: returns false when window is undefined
  const savedWin = globalThis.window;
  globalThis.window = undefined;
  assert(!isFsAccessAvailable(), 'false when window is undefined');
  globalThis.window = savedWin;

  // ----------------------------------------------------------
  section('getCurrentHandle / clearCurrentHandle');
  // ----------------------------------------------------------

  // Test 4: handle is null initially (or after clear)
  clearCurrentHandle();
  assert(getCurrentHandle() === null, 'handle is null after clear');

  // ----------------------------------------------------------
  section('saveAs');
  // ----------------------------------------------------------

  const grid = makeTestGrid('MySave');

  // Test 5: saveAs writes serialized JSON and stores handle
  const mockHandle = createMockFileHandle('MySave.grid');
  globalThis.window.showSaveFilePicker = async (opts) => {
    // Verify options
    mockHandle._pickerOpts = opts;
    return mockHandle;
  };

  clearCurrentHandle();
  const result = await saveAs(grid);
  assert(result === mockHandle, 'saveAs returns the handle');
  assert(getCurrentHandle() === mockHandle, 'saveAs stores handle as current');
  assert(mockHandle._writable._closed, 'writable was closed');
  const written = mockHandle._writable._chunks.join('');
  assert(written.includes('"grid": "grid"'), 'written JSON contains format identifier');
  assert(written.includes('"MySave"'), 'written JSON contains project name');

  // Test 6: saveAs uses suggestedName from grid.meta.name
  assert(
    mockHandle._pickerOpts.suggestedName === 'MySave.grid',
    'suggestedName is grid.meta.name + .grid'
  );

  // Test 7: saveAs returns null on user cancel (AbortError)
  clearCurrentHandle();
  const abortErr = new DOMException('User cancelled', 'AbortError');
  // Node.js may not have DOMException — use a plain error with name
  const cancelErr = new Error('User cancelled');
  cancelErr.name = 'AbortError';
  globalThis.window.showSaveFilePicker = async () => { throw cancelErr; };
  const cancelResult = await saveAs(grid);
  assert(cancelResult === null, 'saveAs returns null on AbortError');
  assert(getCurrentHandle() === null, 'handle remains null after cancel');

  // Test 8: saveAs re-throws non-AbortError
  const otherErr = new Error('Permission denied');
  otherErr.name = 'NotAllowedError';
  globalThis.window.showSaveFilePicker = async () => { throw otherErr; };
  await assertRejects(() => saveAs(grid), 'Permission denied', 'saveAs re-throws non-AbortError');

  // ----------------------------------------------------------
  section('saveToHandle');
  // ----------------------------------------------------------

  // Test 9: saveToHandle writes to existing handle without dialog
  const handle2 = createMockFileHandle('existing.grid');
  await saveToHandle(grid, handle2);
  assert(handle2._writable._closed, 'saveToHandle closes writable');
  const written2 = handle2._writable._chunks.join('');
  assert(written2.includes('"grid": "grid"'), 'saveToHandle writes valid JSON');

  // Test 10: saveToHandle throws if handle is null
  await assertRejects(
    () => saveToHandle(grid, null),
    'requires a valid file handle',
    'saveToHandle throws on null handle'
  );

  // Test 11: saveToHandle respects compact option
  const handle3 = createMockFileHandle('compact.grid');
  await saveToHandle(grid, handle3, { compact: true });
  assert(handle3._writable._closed, 'compact save closes writable');

  // ----------------------------------------------------------
  section('openFile');
  // ----------------------------------------------------------

  // Test 12: openFile reads and deserializes a .grid file
  clearCurrentHandle();
  const gridJson = JSON.stringify(makeTestGrid('Opened'));
  const openHandle = createMockFileHandle('Opened.grid', gridJson);
  globalThis.window.showOpenFilePicker = async () => [openHandle];

  const opened = await openFile();
  assert(opened !== null, 'openFile returns a grid');
  assertEqual(opened.meta.name, 'Opened', 'openFile deserializes name correctly');
  assert(getCurrentHandle() === openHandle, 'openFile stores handle as current');

  // Test 13: openFile returns null on cancel
  clearCurrentHandle();
  const openCancelErr = new Error('User cancelled');
  openCancelErr.name = 'AbortError';
  globalThis.window.showOpenFilePicker = async () => { throw openCancelErr; };
  const openCancel = await openFile();
  assert(openCancel === null, 'openFile returns null on AbortError');

  // Test 14: openFile re-throws non-AbortError
  const openOtherErr = new Error('Disk error');
  globalThis.window.showOpenFilePicker = async () => { throw openOtherErr; };
  await assertRejects(() => openFile(), 'Disk error', 'openFile re-throws non-AbortError');

  // ----------------------------------------------------------
  section('registerFileHandler');
  // ----------------------------------------------------------

  // Test 15: registerFileHandler registers launchQueue consumer
  let consumerFn = null;
  globalThis.window.launchQueue = {
    setConsumer(fn) { consumerFn = fn; },
  };

  let handlerGrid = null;
  registerFileHandler((g) => { handlerGrid = g; });
  assert(typeof consumerFn === 'function', 'registerFileHandler sets consumer');

  // Test 16: consumer processes launched files
  const launchJson = JSON.stringify(makeTestGrid('Launched'));
  const launchHandle = createMockFileHandle('Launched.grid', launchJson);
  await consumerFn({ files: [launchHandle] });
  assert(handlerGrid !== null, 'file handler callback was called');
  assertEqual(handlerGrid.meta.name, 'Launched', 'handler receives correct grid');
  assert(getCurrentHandle() === launchHandle, 'handler stores handle as current');

  // Test 17: consumer ignores empty files list
  clearCurrentHandle();
  handlerGrid = null;
  await consumerFn({ files: [] });
  assert(handlerGrid === null, 'handler not called for empty files');

  // Test 18: registerFileHandler is a no-op when launchQueue absent
  delete globalThis.window.launchQueue;
  // Should not throw
  registerFileHandler(() => {});
  assert(true, 'registerFileHandler is no-op without launchQueue');

  // ----------------------------------------------------------
  section('downloadFallback');
  // ----------------------------------------------------------

  // Test 19: downloadFallback creates and clicks a download link
  setupMockWindow({}); // re-setup document mock
  downloadFallback(grid);
  assert(
    globalThis.document._clickedLinks.length > 0,
    'downloadFallback clicks a link'
  );
  const link = globalThis.document._clickedLinks[0];
  assert(link.download === 'MySave.grid', 'download filename from grid.meta.name');
  assert(link.href === 'blob:mock-url', 'link href is a blob URL');

  // Test 20: downloadFallback uses "untitled" when no name
  const noNameGrid = makeTestGrid();
  noNameGrid.meta.name = undefined;
  globalThis.document._clickedLinks.length = 0;
  downloadFallback(noNameGrid);
  const link2 = globalThis.document._clickedLinks[0];
  assert(link2.download === 'untitled.grid', 'fallback name is untitled.grid');

  // ----------------------------------------------------------
  section('saveCascade');
  // ----------------------------------------------------------

  // Test 21: cascade uses saveToHandle when handle exists
  clearCurrentHandle();
  const cascadeHandle = createMockFileHandle('cascade.grid');
  // Set current handle by doing a saveAs first
  globalThis.window.showSaveFilePicker = async () => cascadeHandle;
  await saveAs(grid); // sets _currentFileHandle
  cascadeHandle._writable._chunks = [];
  cascadeHandle._writable._closed = false;

  await saveCascade(grid);
  assert(cascadeHandle._writable._closed, 'cascade silent-saves to existing handle');

  // Test 22: cascade uses saveAs when no handle but FSAPI available
  clearCurrentHandle();
  let saveAsDialogShown = false;
  const cascadeHandle2 = createMockFileHandle('cascade2.grid');
  globalThis.window.showSaveFilePicker = async () => {
    saveAsDialogShown = true;
    return cascadeHandle2;
  };
  await saveCascade(grid);
  assert(saveAsDialogShown, 'cascade shows saveAs dialog when no handle');

  // Test 23: cascade uses downloadFallback when FSAPI unavailable
  clearCurrentHandle();
  delete globalThis.window.showSaveFilePicker;
  setupMockWindow({}); // no showSaveFilePicker
  globalThis.document._clickedLinks.length = 0;
  await saveCascade(grid);
  assert(
    globalThis.document._clickedLinks.length > 0,
    'cascade falls back to download when no FSAPI'
  );

  // ----------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------
  teardownMockWindow();
}

// ============================================================
// RUN
// ============================================================

await runTests();

const summary = `FS Access: ${passed} passed, ${failed} failed`;
console.log('\n' + summary);
if (failures.length) {
  console.log('Failures:');
  failures.forEach((f) => console.log('  - ' + f));
}

export const results = { passed, failed, skipped: 0, summary };
