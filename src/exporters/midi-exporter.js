/**
 * midi-exporter.js — Task 6.2: NoteEvent[] → Standard MIDI File
 *
 * Generates SMF Type 0 (single track) as a Uint8Array.
 * Pure binary buffer generation. Zero DOM. Zero Web MIDI API.
 * Output opens in any DAW (Ableton, Logic, FL Studio, GarageBand).
 *
 * @module midi-exporter
 */

function midiExportDefaults() {
  return {
    bpm: 120,
    ticksPerBeat: 480,
    trackName: 'GRID Export',
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ── Variable-length quantity encoding (MIDI spec) ────────
function writeVLQ(value) {
  if (value < 0) value = 0;
  const bytes = [];
  bytes.push(value & 0x7F);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7F) | 0x80);
    value >>= 7;
  }
  bytes.reverse();
  return bytes;
}

// ── Write big-endian uint16/uint32 ───────────────────────
function u16(v) { return [(v >> 8) & 0xFF, v & 0xFF]; }
function u32(v) { return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]; }

/**
 * Convert NoteEvent[] to a Standard MIDI File (Type 0).
 *
 * @param {Array} events - [{time, note, velocity, duration, channel}]
 * @param {Object} [opts] - {bpm, ticksPerBeat, trackName}
 * @returns {Uint8Array} SMF binary data
 */
function noteEventsToMidi(events, opts = {}) {
  const o = { ...midiExportDefaults(), ...opts };
  const { bpm, ticksPerBeat, trackName } = o;

  // ── Build track data ────────────────────────────────
  const trackBytes = [];

  // Track name meta-event: FF 03 len name
  const nameBytes = Array.from(new TextEncoder().encode(trackName));
  trackBytes.push(0x00);  // delta time 0
  trackBytes.push(0xFF, 0x03, nameBytes.length, ...nameBytes);

  // Tempo meta-event: FF 51 03 tt tt tt
  const usPerBeat = Math.round(60000000 / bpm);
  trackBytes.push(0x00);  // delta time 0
  trackBytes.push(0xFF, 0x51, 0x03);
  trackBytes.push((usPerBeat >> 16) & 0xFF, (usPerBeat >> 8) & 0xFF, usPerBeat & 0xFF);

  // Sort events by time, then by note (for deterministic output)
  const sorted = [...events].sort((a, b) => a.time - b.time || a.note - b.note);

  // Convert note events to MIDI messages with absolute tick positions
  const midiMsgs = [];
  for (const ev of sorted) {
    const note = clamp(Math.round(ev.note), 0, 127);
    const vel = clamp(Math.round(ev.velocity), 1, 127);
    const ch = clamp(ev.channel || 0, 0, 15);
    const startTick = Math.round(ev.time / (60 / bpm) * ticksPerBeat);
    const durTicks = Math.max(1, Math.round((ev.duration || 1) * ticksPerBeat));

    midiMsgs.push({ tick: startTick, data: [0x90 | ch, note, vel] });      // note on
    midiMsgs.push({ tick: startTick + durTicks, data: [0x80 | ch, note, 0] }); // note off
  }

  // Sort all messages by absolute tick
  midiMsgs.sort((a, b) => a.tick - b.tick);

  // Write messages with delta times
  let prevTick = 0;
  for (const msg of midiMsgs) {
    const delta = msg.tick - prevTick;
    trackBytes.push(...writeVLQ(delta));
    trackBytes.push(...msg.data);
    prevTick = msg.tick;
  }

  // End of track: FF 2F 00
  trackBytes.push(0x00, 0xFF, 0x2F, 0x00);

  // ── Assemble file ───────────────────────────────────
  const headerChunk = [
    0x4D, 0x54, 0x68, 0x64,  // MThd
    ...u32(6),                 // header length
    ...u16(0),                 // format type 0
    ...u16(1),                 // 1 track
    ...u16(ticksPerBeat),      // ticks per beat
  ];

  const trackChunk = [
    0x4D, 0x54, 0x72, 0x6B,   // MTrk
    ...u32(trackBytes.length),  // track length
    ...trackBytes,
  ];

  return new Uint8Array([...headerChunk, ...trackChunk]);
}

// Universal export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { noteEventsToMidi, midiExportDefaults };
}
if (typeof window !== 'undefined') {
  window.MidiExporter = { noteEventsToMidi, midiExportDefaults };
}
export { noteEventsToMidi, midiExportDefaults };