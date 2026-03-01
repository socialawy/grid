/**
 * test-midi-output.js — Task 3.4: Web MIDI Output tests
 *
 * 26 tests covering:
 *   - Pure helpers: clampMidi, buildNoteOn, buildNoteOff, sortNoteEvents, anchorEvents
 *   - Feature detection: isAvailable, isReady
 *   - Init: success, already-init, no API, permission denied
 *   - Port management: getOutputs, selectOutput, getSelectedOutput
 *   - Immediate send: sendNoteOn, sendNoteOff, no-op when no output
 *   - Scheduler: scheduleEvents dispatches in order, note-off follows note-on,
 *                timestamps anchored correctly, stop() cancels, no output no-op
 *   - sendAllNotesOff: sends CC 123 on all 16 channels
 *   - destroy: clears all state
 *
 * Run: node tests/test-midi-output.js
 * No DOM, no browser required. All MIDI behaviour mocked.
 */

import { createMIDIOutput, buildNoteOn, buildNoteOff, clampMidi, sortNoteEvents, anchorEvents }
  from '../src/consumers/music/midi-output.js';

// ─── Minimal test harness ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, err: err.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

function assertDeepEqual(a, b, msg) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(msg || `Expected ${ja} deep-equal ${jb}`);
}

// ─── Mock MIDI infrastructure ─────────────────────────────────────────────────

/**
 * Create a mock MIDIOutput port that records all send() calls.
 */
function makeMockPort(id = 'port-1', name = 'Mock Port 1') {
  const sent = []; // { data, timestamp }
  return {
    id,
    name,
    sent,
    send(data, timestamp) {
      sent.push({ data: [...data], timestamp: timestamp ?? null });
    },
  };
}

/**
 * Create a mock MIDIAccess with a given set of output ports.
 */
function makeMockAccess(ports = []) {
  const outputs = new Map();
  for (const p of ports) outputs.set(p.id, p);
  return { outputs };
}

/**
 * Ensure global.navigator is a plain object (not undefined) so we can
 * patch properties onto it. Other test suites (e.g. test-opfs-store.js)
 * may leave global.navigator as undefined via teardown; guard against that.
 */
function ensureNavigatorObject() {
  if (typeof global.navigator !== 'object' || !global.navigator) {
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      writable: true,
      value: {},
    });
  }
}

/**
 * Patch navigator.requestMIDIAccess on the global navigator object.
 * Creates a minimal navigator stub if the global was torn down.
 */
function installMockMidi(access) {
  ensureNavigatorObject();
  Object.defineProperty(global.navigator, 'requestMIDIAccess', {
    configurable: true,
    writable: true,
    value: async () => access,
  });
}

/**
 * Remove the requestMIDIAccess mock from navigator.
 * No-op when navigator is undefined (already in the "unavailable" state).
 */
function removeMidi() {
  if (typeof global.navigator !== 'object' || !global.navigator) return;
  try {
    delete global.navigator.requestMIDIAccess;
  } catch (_) {
    Object.defineProperty(global.navigator, 'requestMIDIAccess', {
      configurable: true,
      value: undefined,
    });
  }
}

/**
 * Install a mock where MIDI access throws (permission denied).
 */
function installDeniedMidi() {
  ensureNavigatorObject();
  Object.defineProperty(global.navigator, 'requestMIDIAccess', {
    configurable: true,
    writable: true,
    value: async () => { throw new Error('Permission denied'); },
  });
}

// ─── Tests: Pure helpers ──────────────────────────────────────────────────────

test('clampMidi: clamps below min', () => {
  assertEqual(clampMidi(-5, 0, 127), 0);
});

test('clampMidi: clamps above max', () => {
  assertEqual(clampMidi(200, 0, 127), 127);
});

test('clampMidi: rounds to integer', () => {
  assertEqual(clampMidi(63.7, 0, 127), 64);
});

test('clampMidi: in-range value unchanged', () => {
  assertEqual(clampMidi(60, 0, 127), 60);
});

test('buildNoteOn: correct status byte and clamped values', () => {
  assertDeepEqual(buildNoteOn(0, 60, 100), [0x90, 60, 100]);
});

test('buildNoteOn: channel clamped to 15', () => {
  assertEqual(buildNoteOn(20, 60, 100)[0], 0x90 | 15);
});

test('buildNoteOn: note clamped to 127', () => {
  assertEqual(buildNoteOn(0, 200, 100)[1], 127);
});

test('buildNoteOn: velocity clamped to 0', () => {
  assertEqual(buildNoteOn(0, 60, -10)[2], 0);
});

test('buildNoteOff: correct status byte', () => {
  assertDeepEqual(buildNoteOff(2, 64), [0x80 | 2, 64, 0]);
});

test('buildNoteOff: velocity is always 0', () => {
  assertEqual(buildNoteOff(0, 60)[2], 0);
});

test('sortNoteEvents: sorts by time then pitch', () => {
  const events = [
    { time: 1, note: 60 },
    { time: 0, note: 64 },
    { time: 0, note: 60 },
  ];
  const sorted = sortNoteEvents(events);
  assertDeepEqual(
    sorted.map(e => [e.time, e.note]),
    [[0, 60], [0, 64], [1, 60]]
  );
});

test('sortNoteEvents: does not mutate input array', () => {
  const events = [{ time: 1, note: 60 }, { time: 0, note: 60 }];
  sortNoteEvents(events);
  assertEqual(events[0].time, 1); // original order preserved
});

test('anchorEvents: absoluteMs = startMs + time*1000', () => {
  const events = [{ time: 0.5, duration: 0.25, note: 60, channel: 0, velocity: 80 }];
  const anchored = anchorEvents(events, 1000);
  assertEqual(anchored[0].absoluteMs, 1500);
});

test('anchorEvents: noteOffMs = startMs + (time+duration)*1000', () => {
  const events = [{ time: 0.5, duration: 0.25, note: 60, channel: 0, velocity: 80 }];
  const anchored = anchorEvents(events, 1000);
  assertEqual(anchored[0].noteOffMs, 1750);
});

test('anchorEvents: does not mutate input', () => {
  const events = [{ time: 1, duration: 0.5, note: 60, channel: 0, velocity: 80 }];
  anchorEvents(events, 0);
  assert(!('absoluteMs' in events[0]), 'input should not have absoluteMs');
});

// ─── Tests: Feature detection ─────────────────────────────────────────────────

test('isAvailable: false when no navigator.requestMIDIAccess', () => {
  removeMidi(); // remove requestMIDIAccess
  const midi = createMIDIOutput();
  assertEqual(midi.isAvailable(), false);
});

test('isAvailable: true when navigator.requestMIDIAccess present', () => {
  installMockMidi(makeMockAccess());
  const midi = createMIDIOutput();
  assertEqual(midi.isAvailable(), true);
  removeMidi();
});

test('isReady: false before init', () => {
  const midi = createMIDIOutput();
  assertEqual(midi.isReady(), false);
});

// ─── Tests: Init ─────────────────────────────────────────────────────────────

test('init: returns ok:false when Web MIDI unavailable', async () => {
  removeMidi();
  const midi = createMIDIOutput();
  const result = await midi.init();
  assertEqual(result.ok, false);
  assert(typeof result.error === 'string');
});

test('init: returns ok:true when access granted', async () => {
  const port = makeMockPort();
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  const result = await midi.init();
  assertEqual(result.ok, true);
  midi.destroy();
  removeMidi();
});

test('init: returns ok:false when permission denied', async () => {
  installDeniedMidi();
  const midi = createMIDIOutput();
  const result = await midi.init();
  assertEqual(result.ok, false);
  assert(result.error.length > 0);
  removeMidi();
});

test('init: second call returns ok:true without re-requesting', async () => {
  let callCount = 0;
  Object.defineProperty(global.navigator, 'requestMIDIAccess', {
    configurable: true, writable: true,
    value: async () => { callCount++; return makeMockAccess(); },
  });
  const midi = createMIDIOutput();
  await midi.init();
  const r2 = await midi.init();
  assertEqual(r2.ok, true);
  assertEqual(callCount, 1); // only called once
  midi.destroy();
  removeMidi();
});

// ─── Tests: Port management ───────────────────────────────────────────────────

test('getOutputs: returns [] before init', () => {
  // No init called — _access is null, so outputs returns []
  const midi = createMIDIOutput();
  assertDeepEqual(midi.getOutputs(), []);
});

test('getOutputs: lists ports after init', async () => {
  const port = makeMockPort('p1', 'Synth');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  const outputs = midi.getOutputs();
  assertEqual(outputs.length, 1);
  assertEqual(outputs[0].id, 'p1');
  assertEqual(outputs[0].name, 'Synth');
  midi.destroy();
  removeMidi();
});

test('selectOutput: returns false for unknown id', async () => {
  installMockMidi(makeMockAccess([]));
  const midi = createMIDIOutput();
  await midi.init();
  assertEqual(midi.selectOutput('nonexistent'), false);
  midi.destroy();
  removeMidi();
});

test('selectOutput: returns true and makes isReady true', async () => {
  const port = makeMockPort('p1');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  const ok = midi.selectOutput('p1');
  assertEqual(ok, true);
  assertEqual(midi.isReady(), true);
  midi.destroy();
  removeMidi();
});

test('getSelectedOutput: returns null before selection', async () => {
  installMockMidi(makeMockAccess([]));
  const midi = createMIDIOutput();
  await midi.init();
  assertEqual(midi.getSelectedOutput(), null);
  midi.destroy();
  removeMidi();
});

test('getSelectedOutput: returns {id, name} after selection', async () => {
  const port = makeMockPort('p1', 'My Synth');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  midi.selectOutput('p1');
  const sel = midi.getSelectedOutput();
  assertEqual(sel.id, 'p1');
  assertEqual(sel.name, 'My Synth');
  midi.destroy();
  removeMidi();
});

// ─── Tests: Immediate send ────────────────────────────────────────────────────

test('sendNoteOn: no-op when no output selected', async () => {
  installMockMidi(makeMockAccess([]));
  const midi = createMIDIOutput();
  await midi.init();
  // Should not throw
  midi.sendNoteOn(0, 60, 100);
  midi.destroy();
  removeMidi();
});

test('sendNoteOn: sends correct bytes to port', async () => {
  const port = makeMockPort('p1');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  midi.selectOutput('p1');
  midi.sendNoteOn(1, 64, 80);
  assertEqual(port.sent.length, 1);
  assertDeepEqual(port.sent[0].data, [0x91, 64, 80]);
  midi.destroy();
  removeMidi();
});

test('sendNoteOff: sends correct bytes to port', async () => {
  const port = makeMockPort('p1');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  midi.selectOutput('p1');
  midi.sendNoteOff(0, 60);
  assertDeepEqual(port.sent[0].data, [0x80, 60, 0]);
  midi.destroy();
  removeMidi();
});

test('sendAllNotesOff: sends CC 123 on all 16 channels', async () => {
  const port = makeMockPort('p1');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  midi.selectOutput('p1');
  midi.sendAllNotesOff();
  assertEqual(port.sent.length, 16);
  for (let ch = 0; ch < 16; ch++) {
    assertDeepEqual(port.sent[ch].data, [0xB0 | ch, 123, 0]);
  }
  midi.destroy();
  removeMidi();
});

// ─── Tests: Scheduler ─────────────────────────────────────────────────────────

test('scheduleEvents: no-op when no output selected', async () => {
  installMockMidi(makeMockAccess([]));
  const midi = createMIDIOutput();
  await midi.init();
  // Should not throw or set up a ticker
  midi.scheduleEvents([{ time: 0, duration: 0.5, note: 60, velocity: 80, channel: 0 }], 120);
  midi.destroy();
  removeMidi();
});

test('scheduleEvents: no-op with empty events array', async () => {
  const port = makeMockPort('p1');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  midi.selectOutput('p1');
  midi.scheduleEvents([], 120);
  assertEqual(port.sent.length, 0);
  midi.destroy();
  removeMidi();
});

test('scheduleEvents: sends note-on and note-off with anchored timestamps', async () => {
  // Use fake performance.now by mocking globally
  let fakeNow = 0;
  global.performance = { now: () => fakeNow };

  const port = makeMockPort('p1');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  midi.selectOutput('p1');

  // Event at time=0, duration=0.5 → note-on at fakeNow, note-off at fakeNow+500ms
  const events = [{ time: 0, duration: 0.5, note: 60, velocity: 100, channel: 0 }];
  midi.scheduleEvents(events, 120);

  // Advance time past lookahead and tick manually by advancing fakeNow
  fakeNow = 100; // now well past absoluteMs=0 + lookahead
  // Wait for the setInterval to fire (TICK_MS = 25ms real time in tests — use a short timeout)
  await new Promise(resolve => setTimeout(resolve, 80));

  // Should have sent note-on [0x90, 60, 100] and note-off [0x80, 60, 0]
  const noteOns  = port.sent.filter(s => (s.data[0] & 0xF0) === 0x90);
  const noteOffs = port.sent.filter(s => (s.data[0] & 0xF0) === 0x80);
  assertEqual(noteOns.length, 1);
  assertEqual(noteOffs.length, 1);
  assertEqual(noteOns[0].data[1], 60);
  assert(noteOffs[0].timestamp > noteOns[0].timestamp,
    'note-off timestamp should follow note-on');

  midi.destroy();
  removeMidi();
  delete global.performance;
});

test('scheduleEvents: events sent in time order', async () => {
  let fakeNow = 0;
  global.performance = { now: () => fakeNow };

  const port = makeMockPort('p1');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  midi.selectOutput('p1');

  // Intentionally unsorted
  const events = [
    { time: 0.2, duration: 0.1, note: 64, velocity: 80, channel: 0 },
    { time: 0.0, duration: 0.1, note: 60, velocity: 80, channel: 0 },
  ];
  midi.scheduleEvents(events, 120);
  fakeNow = 400; // past both absolute times even with lookahead
  await new Promise(resolve => setTimeout(resolve, 80));

  const noteOns = port.sent.filter(s => (s.data[0] & 0xF0) === 0x90);
  assertEqual(noteOns.length, 2);
  // First note-on should be note 60 (time=0), second note 64 (time=0.2)
  assertEqual(noteOns[0].data[1], 60);
  assertEqual(noteOns[1].data[1], 64);

  midi.destroy();
  removeMidi();
  delete global.performance;
});

test('stop: cancels pending playback', async () => {
  const port = makeMockPort('p1');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  midi.selectOutput('p1');

  // Event far in the future (10 seconds)
  const events = [{ time: 10, duration: 0.5, note: 60, velocity: 80, channel: 0 }];
  midi.scheduleEvents(events, 120);
  midi.stop();

  // Wait longer than TICK_MS to confirm no events were sent
  await new Promise(resolve => setTimeout(resolve, 80));
  assertEqual(port.sent.length, 0);

  midi.destroy();
  removeMidi();
});

// ─── Tests: Destroy ───────────────────────────────────────────────────────────

test('destroy: isReady returns false after destroy', async () => {
  const port = makeMockPort('p1');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  midi.selectOutput('p1');
  assertEqual(midi.isReady(), true);
  midi.destroy();
  assertEqual(midi.isReady(), false);
  removeMidi();
});

test('destroy: getOutputs returns [] after destroy', async () => {
  const port = makeMockPort('p1');
  installMockMidi(makeMockAccess([port]));
  const midi = createMIDIOutput();
  await midi.init();
  midi.destroy();
  assertDeepEqual(midi.getOutputs(), []);
  removeMidi();
});

// ─── Results ──────────────────────────────────────────────────────────────────

const summary = `midi-output: ${passed} passed, ${failed} failed`;
console.log(`\n${summary}`);
if (failures.length) {
  console.log('\nFailed tests:');
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.err}`);
}

export const results = { passed, failed, skipped: 0, summary };
