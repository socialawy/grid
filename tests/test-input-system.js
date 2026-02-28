/**
 * test-input-system.js — Unit tests for key-bindings.js and input-system.js
 *
 * Runs in Node.js with minimal DOM mocks.
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
// MINIMAL DOM MOCKS (Node.js has no DOM)
// ============================================================

class MockEventTarget {
  constructor() { this._listeners = new Map(); }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const arr = this._listeners.get(type) ?? [];
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }

  /** Synchronously dispatch a fake event to all registered listeners. */
  dispatch(type, data = {}) {
    for (const fn of (this._listeners.get(type) ?? [])) fn(data);
  }

  /** Count registered listeners of a given type. */
  listenerCount(type) {
    return (this._listeners.get(type) ?? []).length;
  }
}

const mockWindow   = new MockEventTarget();
const mockDocument = new MockEventTarget();

// Inject globals before importing modules
if (typeof window   === 'undefined') global.window   = mockWindow;
if (typeof document === 'undefined') global.document = mockDocument;

// ============================================================
// LOAD MODULES
// ============================================================

const { createKeyBindings, DEFAULT_BINDINGS, normalizeKey } =
  await import('../src/input/key-bindings.js');

const { createInputSystem } =
  await import('../src/input/input-system.js');

// ============================================================
// HELPERS
// ============================================================

/** Build a KeyboardEvent-like object. */
function mockKey(code, { ctrlKey = false, shiftKey = false, altKey = false, metaKey = false } = {}) {
  return { code, ctrlKey, shiftKey, altKey, metaKey, target: { tagName: 'BODY' }, preventDefault() {} };
}

/** Build a mock canvas with eventToGrid(cellW=10, cellH=20). */
function createMockCanvas() {
  const canvas = new MockEventTarget();
  canvas.tagName = 'CANVAS';
  return canvas;
}

/** Build a mock renderer whose eventToGrid maps pixels to grid cells. */
function createMockRenderer(cellW = 10, cellH = 20) {
  return {
    eventToGrid({ clientX, clientY }) {
      return { gridX: Math.floor(clientX / cellW), gridY: Math.floor(clientY / cellH) };
    },
  };
}

// ============================================================
// TESTS: normalizeKey
// ============================================================

section('normalizeKey');

assertEqual(normalizeKey(mockKey('Space')),                         'Space',       'plain key');
assertEqual(normalizeKey(mockKey('KeyS', { ctrlKey: true })),      'ctrl+KeyS',   'ctrl modifier');
assertEqual(normalizeKey(mockKey('KeyZ', { shiftKey: true })),     'shift+KeyZ',  'shift modifier');
assertEqual(normalizeKey(mockKey('KeyA', { ctrlKey: true, shiftKey: true })), 'ctrl+shift+KeyA', 'ctrl+shift combo');
assertEqual(normalizeKey(mockKey('KeyS', { metaKey: true })),      'ctrl+KeyS',   'meta treated as ctrl');

// ============================================================
// TESTS: createKeyBindings — defaults
// ============================================================

section('createKeyBindings — defaults');

const kb = createKeyBindings();

assertEqual(kb.resolve(mockKey('Space')),                           'playToggle',    'Space → playToggle');
assertEqual(kb.resolve(mockKey('ArrowRight')),                      'nextFrame',     'ArrowRight → nextFrame');
assertEqual(kb.resolve(mockKey('ArrowLeft')),                       'prevFrame',     'ArrowLeft → prevFrame');
assertEqual(kb.resolve(mockKey('KeyE')),                            'eraserToggle',  'KeyE → eraserToggle');
assertEqual(kb.resolve(mockKey('Delete')),                          'clearFrame',    'Delete → clearFrame');
assertEqual(kb.resolve(mockKey('Escape')),                          'closeModal',    'Escape → closeModal');
assertEqual(kb.resolve(mockKey('KeyS', { ctrlKey: true })),        'export',        'ctrl+KeyS → export');
assertEqual(kb.resolve(mockKey('KeyO', { ctrlKey: true })),        'import',        'ctrl+KeyO → import');
assertEqual(kb.resolve(mockKey('KeyN', { ctrlKey: true })),        'newProject',    'ctrl+KeyN → newProject');
assertEqual(kb.resolve(mockKey('Digit1')),                          'selectChar:1',  'Digit1 → selectChar:1');
assertEqual(kb.resolve(mockKey('Digit9')),                          'selectChar:9',  'Digit9 → selectChar:9');
assertEqual(kb.resolve(mockKey('KeyQ')),                            null,            'Unmapped key → null');

// ============================================================
// TESTS: createKeyBindings — custom overrides
// ============================================================

section('createKeyBindings — custom bindings');

const kb2 = createKeyBindings({ 'KeyZ': 'undo', 'ctrl+KeyZ': 'undo' });
assertEqual(kb2.resolve(mockKey('KeyZ')), 'undo', 'custom KeyZ → undo');
// Defaults still work
assertEqual(kb2.resolve(mockKey('Space')), 'playToggle', 'default still active after custom');

// ============================================================
// TESTS: bind / unbind
// ============================================================

section('createKeyBindings — bind / unbind');

const kb3 = createKeyBindings();
kb3.bind('KeyQ', 'quit');
assertEqual(kb3.resolve(mockKey('KeyQ')), 'quit', 'bind() adds new key');
kb3.unbind('KeyQ');
assertEqual(kb3.resolve(mockKey('KeyQ')), null,   'unbind() removes key');

// Overwrite existing binding
kb3.bind('Space', 'customPlay');
assertEqual(kb3.resolve(mockKey('Space')), 'customPlay', 'bind() overrides default');

// getAll returns copy
const all = kb3.getAll();
assert(typeof all === 'object',                    'getAll() returns object');
assert(all['Space'] === 'customPlay',              'getAll() reflects overrides');

// ============================================================
// TESTS: createInputSystem — cellDown
// ============================================================

section('createInputSystem — cellDown');

{
  const canvas   = createMockCanvas();
  const renderer = createMockRenderer(10, 20);
  const input    = createInputSystem(canvas, renderer);

  const events = [];
  input.on('cellDown', e => events.push(e));

  canvas.dispatch('mousedown', { clientX: 15, clientY: 25, button: 0 });

  assert(events.length === 1,                            'cellDown fires on mousedown');
  assertEqual(events[0], { x: 1, y: 1, button: 0 },     'cellDown coords correct');

  input.destroy();
}

// ============================================================
// TESTS: createInputSystem — cellMove only while dragging
// ============================================================

section('createInputSystem — cellMove / cellHover');

{
  const canvas   = createMockCanvas();
  const renderer = createMockRenderer(10, 20);
  const input    = createInputSystem(canvas, renderer);

  const moves  = [];
  const hovers = [];
  input.on('cellMove',  e => moves.push(e));
  input.on('cellHover', e => hovers.push(e));

  // Hover without drag
  canvas.dispatch('mousemove', { clientX: 25, clientY: 20 });
  assertEqual(moves.length,  0, 'no cellMove before drag');
  assertEqual(hovers.length, 1, 'cellHover on passive mousemove');

  // Start drag and move to a different cell
  canvas.dispatch('mousedown', { clientX: 10, clientY: 20, button: 0 });
  canvas.dispatch('mousemove', { clientX: 25, clientY: 20 });
  assert(moves.length === 1,                   'cellMove fires while dragging');
  assertEqual(moves[0], { x: 2, y: 1 },        'cellMove coords correct');

  // Same cell — should NOT fire again
  canvas.dispatch('mousemove', { clientX: 22, clientY: 22 });
  assert(moves.length === 1,                   'no duplicate cellMove for same cell');

  input.destroy();
}

// ============================================================
// TESTS: createInputSystem — cellUp
// ============================================================

section('createInputSystem — cellUp');

{
  const canvas   = createMockCanvas();
  const renderer = createMockRenderer(10, 20);
  const input    = createInputSystem(canvas, renderer);

  const ups = [];
  input.on('cellUp', e => ups.push(e));

  canvas.dispatch('mousedown', { clientX: 10, clientY: 20, button: 0 });
  // mouseup is on window, not canvas
  mockWindow.dispatch('mouseup', { clientX: 30, clientY: 40 });

  assert(ups.length === 1,  'cellUp fires on window mouseup');
  assert('x' in ups[0],     'cellUp has x');
  assert('y' in ups[0],     'cellUp has y');

  // mouseup without prior mousedown → should be ignored
  const before = ups.length;
  mockWindow.dispatch('mouseup', { clientX: 10, clientY: 10 });
  assertEqual(ups.length, before, 'no cellUp without prior cellDown');

  input.destroy();
}

// ============================================================
// TESTS: createInputSystem — keyboard action
// ============================================================

section('createInputSystem — keyboard actions');

{
  const canvas   = createMockCanvas();
  const renderer = createMockRenderer();
  const input    = createInputSystem(canvas, renderer);

  const actions = [];
  input.on('action', e => actions.push(e));

  // Space → playToggle
  mockDocument.dispatch('keydown', {
    code: 'Space', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    target: { tagName: 'BODY' },
    preventDefault() {},
  });
  assert(actions.length === 1,                              'action fires for mapped key');
  assertEqual(actions[0], { name: 'playToggle', payload: null }, 'playToggle action');

  // Digit3 → selectChar:3 (with payload)
  mockDocument.dispatch('keydown', {
    code: 'Digit3', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    target: { tagName: 'BODY' },
    preventDefault() {},
  });
  assertEqual(actions[1], { name: 'selectChar', payload: '3' }, 'selectChar payload parsed');

  // Ctrl+S → export
  mockDocument.dispatch('keydown', {
    code: 'KeyS', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false,
    target: { tagName: 'BODY' },
    preventDefault() {},
  });
  assertEqual(actions[2], { name: 'export', payload: null }, 'ctrl+KeyS → export');

  // Unmapped key → no action
  const before = actions.length;
  mockDocument.dispatch('keydown', {
    code: 'F10', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    target: { tagName: 'BODY' },
    preventDefault() {},
  });
  assertEqual(actions.length, before, 'unmapped key fires no action');

  input.destroy();
}

// ============================================================
// TESTS: createInputSystem — no action in form fields
// ============================================================

section('createInputSystem — form field suppression');

{
  const canvas   = createMockCanvas();
  const renderer = createMockRenderer();
  const input    = createInputSystem(canvas, renderer);

  const actions = [];
  input.on('action', e => actions.push(e));

  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    mockDocument.dispatch('keydown', {
      code: 'Space', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
      target: { tagName: tag },
      preventDefault() {},
    });
  }
  assertEqual(actions.length, 0, 'no actions fired when typing in form fields');

  input.destroy();
}

// ============================================================
// TESTS: off() removes handler
// ============================================================

section('createInputSystem — on() / off()');

{
  const canvas   = createMockCanvas();
  const renderer = createMockRenderer();
  const input    = createInputSystem(canvas, renderer);

  const events   = [];
  const handler  = e => events.push(e);
  input.on('cellDown', handler);
  input.off('cellDown', handler);

  canvas.dispatch('mousedown', { clientX: 10, clientY: 20, button: 0 });
  assertEqual(events.length, 0, 'off() prevents handler from firing');

  input.destroy();
}

// ============================================================
// TESTS: destroy() removes all DOM listeners
// ============================================================

section('createInputSystem — destroy()');

{
  const canvas   = createMockCanvas();
  const renderer = createMockRenderer();
  const input    = createInputSystem(canvas, renderer);

  const events   = [];
  input.on('cellDown', e => events.push(e));
  input.destroy();

  // After destroy, mousedown should no longer reach our handler
  canvas.dispatch('mousedown', { clientX: 10, clientY: 20, button: 0 });
  assertEqual(events.length, 0, 'destroy() stops event emission');

  // Verify canvas listeners were removed
  assert(canvas.listenerCount('mousedown') === 0, 'destroy() removes canvas mousedown listener');
}

// ============================================================
// RESULTS
// ============================================================

console.log(`\n${'='.repeat(50)}`);
console.log(`Input System: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('Failed tests:', failures.join('; '));
}

export const results = {
  passed,
  failed,
  skipped: 0,
  summary: `Input System: ${passed} passed, ${failed} failed`,
};
