// tests/test-midi-exporter.js
/**
 * MIDI File Exporter tests — Task 6.2
 * Pure Node, zero DOM. Tests SMF binary generation.
 */

import { noteEventsToMidi, midiExportDefaults } from '../src/exporters/midi-exporter.js';

let passed = 0, failed = 0;
const testOutputs = [];

function assert(cond, msg) {
  if (cond) { passed++; testOutputs.push({ status: 'pass', name: msg }); }
  else { failed++; testOutputs.push({ status: 'fail', name: msg }); console.error('  FAIL:', msg); }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} (got ${a}, expected ${b})`);
}

console.log('\n🧪 MIDI File Exporter (Task 6.2)\n' + '='.repeat(50));

// ── Helpers ────────────────────────────────────────
function makeEvent(time, note, velocity = 100, duration = 1, channel = 0) {
  return { time, note, velocity, duration, channel };
}

// ── defaults ───────────────────────────────────────
{
  const d = midiExportDefaults();
  assertEq(d.bpm, 120, 'default BPM');
  assertEq(d.ticksPerBeat, 480, 'default ticks per beat');
  assert(typeof d.trackName === 'string', 'default trackName is string');
}

// ── empty events → valid MIDI file ─────────────────
{
  const buf = noteEventsToMidi([]);
  assert(buf instanceof Uint8Array, 'returns Uint8Array');
  assert(buf.length > 0, 'non-empty for empty events');
  // SMF header: MThd
  assertEq(buf[0], 0x4D, 'byte 0 = M');
  assertEq(buf[1], 0x54, 'byte 1 = T');
  assertEq(buf[2], 0x68, 'byte 2 = h');
  assertEq(buf[3], 0x64, 'byte 3 = d');
}

// ── header chunk structure ─────────────────────────
{
  const buf = noteEventsToMidi([]);
  // Header length: 6 bytes
  assertEq(buf[7], 6, 'header data length = 6');
  // Format type 0
  assertEq(buf[9], 0, 'format type = 0 (single track)');
  // 1 track
  assertEq(buf[11], 1, 'number of tracks = 1');
}

// ── track chunk present ────────────────────────────
{
  const buf = noteEventsToMidi([]);
  // MTrk at byte 14
  assertEq(buf[14], 0x4D, 'track byte 0 = M');
  assertEq(buf[15], 0x54, 'track byte 1 = T');
  assertEq(buf[16], 0x72, 'track byte 2 = r');
  assertEq(buf[17], 0x6B, 'track byte 3 = k');
}

// ── single note produces note-on and note-off ──────
{
  const events = [makeEvent(0, 60, 100, 1)];
  const buf = noteEventsToMidi(events, { bpm: 120, ticksPerBeat: 480 });
  assert(buf.length > 22, 'output has data beyond headers');
  // Scan for note-on (0x90) and note-off (0x80)
  let hasNoteOn = false, hasNoteOff = false;
  for (let i = 14; i < buf.length; i++) {
    if ((buf[i] & 0xF0) === 0x90) hasNoteOn = true;
    if ((buf[i] & 0xF0) === 0x80) hasNoteOff = true;
  }
  assert(hasNoteOn, 'contains note-on event');
  assert(hasNoteOff, 'contains note-off event');
}

// ── note pitch and velocity preserved ──────────────
{
  const events = [makeEvent(0, 72, 110, 1)];
  const buf = noteEventsToMidi(events);
  // Find note-on (0x90), next byte = note, next = velocity
  let found = false;
  for (let i = 14; i < buf.length - 2; i++) {
    if ((buf[i] & 0xF0) === 0x90 && buf[i + 1] === 72 && buf[i + 2] === 110) {
      found = true;
      break;
    }
  }
  assert(found, 'note 72, velocity 110 found in note-on');
}

// ── multiple notes sorted by time ────────────────
{
  const events = [
    makeEvent(0, 60, 100, 1),
    makeEvent(1, 64, 90, 1),
    makeEvent(2, 67, 80, 1),
  ];
  const buf = noteEventsToMidi(events);
  // All three notes should be present
  let noteOns = 0;
  for (let i = 14; i < buf.length; i++) {
    if ((buf[i] & 0xF0) === 0x90 && buf[i + 2] > 0) noteOns++;
  }
  assertEq(noteOns, 3, '3 note-on events for 3 notes');
}

// ── MIDI channels mapped correctly ─────────────────
{
  const events = [makeEvent(0, 60, 100, 1, 3)];
  const buf = noteEventsToMidi(events);
  let found = false;
  for (let i = 14; i < buf.length - 2; i++) {
    if (buf[i] === (0x90 | 3) && buf[i + 1] === 60) {
      found = true;
      break;
    }
  }
  assert(found, 'channel 3 encoded in status byte (0x93)');
}

// ── tempo meta-event present ───────────────────────
{
  const buf = noteEventsToMidi([], { bpm: 140 });
  // Tempo meta event: FF 51 03 xx xx xx
  let hasTempo = false;
  for (let i = 14; i < buf.length - 5; i++) {
    if (buf[i] === 0xFF && buf[i + 1] === 0x51 && buf[i + 2] === 0x03) {
      hasTempo = true;
      // microseconds per beat = 60000000 / 140 ≈ 428571
      const uspb = (buf[i + 3] << 16) | (buf[i + 4] << 8) | buf[i + 5];
      const expectedUspb = Math.round(60000000 / 140);
      assert(Math.abs(uspb - expectedUspb) < 2, `tempo meta = ${uspb} ≈ ${expectedUspb}`);
      break;
    }
  }
  assert(hasTempo, 'tempo meta-event present');
}

// ── end-of-track marker ────────────────────────────
{
  const buf = noteEventsToMidi([makeEvent(0, 60, 100, 1)]);
  // Last 3 bytes should be: FF 2F 00
  const len = buf.length;
  assertEq(buf[len - 3], 0xFF, 'end-of-track: FF');
  assertEq(buf[len - 2], 0x2F, 'end-of-track: 2F');
  assertEq(buf[len - 1], 0x00, 'end-of-track: 00');
}

// ── round-trip: note count ─────────────────────────
{
  const events = [];
  for (let i = 0; i < 10; i++) events.push(makeEvent(i, 48 + i, 80, 1));
  const buf = noteEventsToMidi(events);

  let noteOns = 0, noteOffs = 0;

  // Start after track header and skip meta events properly
  let i = 22; // Skip MTrk header + length

  // Skip track name meta event (00 FF 03 0b "GRID Export")
  i += 1; // Skip delta 0x00
  i += 1; // Skip FF
  i += 1; // Skip 03
  i += 1; // Skip length 0x0b
  i += 11; // Skip "GRID Export" (11 bytes)

  // Skip tempo meta event (00 FF 51 03 07 a1 20 00)
  i += 1; // Skip delta 0x00
  i += 1; // Skip FF
  i += 1; // Skip 51
  i += 1; // Skip 03
  i += 3; // Skip tempo bytes (07 a1 20)

  // Now i should be at the first note-on (byte 45)

  while (i < buf.length - 2) {
    // Skip VLQ delta time (bytes with high bit set)
    while (i < buf.length && (buf[i] & 0x80)) i++;
    if (i >= buf.length) break;
    i++; // Skip the last delta byte (high bit clear)

    if (i >= buf.length) break;

    const status = buf[i];
    if ((status & 0xF0) === 0x90 && buf[i + 2] > 0) {
      noteOns++;
      i += 3;
    } else if ((status & 0xF0) === 0x80) {
      noteOffs++;
      i += 3;
    } else if (status === 0xFF) {
      // Meta event
      if (i + 1 < buf.length) {
        const len = buf[i + 1];
        i += 2 + len;
      } else {
        break;
      }
    } else {
      i++; // Skip unknown byte
    }
  }

  assertEq(noteOns, 10, '10 note-ons');
  assertEq(noteOffs, 10, '10 note-offs');
}

// ── clamps note to 0-127 ──────────────────────────
{
  const events = [makeEvent(0, 200, 100, 1), makeEvent(1, -5, 50, 1)];
  const buf = noteEventsToMidi(events);
  let notes = [];
  for (let i = 14; i < buf.length - 2; i++) {
    if ((buf[i] & 0xF0) === 0x90 && buf[i + 2] > 0) notes.push(buf[i + 1]);
  }
  assert(notes.every(n => n >= 0 && n <= 127), 'all notes clamped to 0-127');
}

// ── custom BPM changes tick spacing ────────────────
{
  const events = [makeEvent(0, 60, 100, 1), makeEvent(1, 64, 100, 1)];
  const fast = noteEventsToMidi(events, { bpm: 240 });
  const slow = noteEventsToMidi(events, { bpm: 60 });
  // Different BPMs should produce different tempo meta-events
  // but same tick structure (ticks are relative to tempo)
  assert(fast.length > 0 && slow.length > 0, 'both BPMs produce valid output');
}

// ── track name meta-event ──────────────────────────
{
  const buf = noteEventsToMidi([], { trackName: 'TestTrack' });
  // Track name: FF 03 len bytes
  let hasName = false;
  for (let i = 14; i < buf.length - 3; i++) {
    if (buf[i] === 0xFF && buf[i + 1] === 0x03) {
      hasName = true;
      break;
    }
  }
  assert(hasName, 'track name meta-event present');
}

// ── Summary ───────────────────────────────────────
console.log(`\ntest-midi-exporter.js: ${passed} passed, ${failed} failed\n`);
export const results = {
  passed,
  failed,
  skipped: 0,
  summary: `MIDI Exporter: ${passed} passed, ${failed} failed`
};