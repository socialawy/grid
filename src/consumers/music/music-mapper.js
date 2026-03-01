/**
 * music-mapper.js
 * Grid-to-Music Mapping Engine for the GRID project.
 * Converts grid frames and cells into sequenced note events.
 */

export const SCALES = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],    // natural minor
  pentatonic: [0, 2, 4, 7, 9],
  minor_penta: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  whole_tone: [0, 2, 4, 6, 8, 10],
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToFrequency(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function midiToName(note) {
  const octave = Math.floor(note / 12) - 1;
  return NOTE_NAMES[note % 12] + octave;
}

export function columnToTime(col, bpm, subdivision) {
  // subdivision: 1 = quarter notes, 2 = eighth, 4 = sixteenth
  const beatDuration = 60 / bpm;               // seconds per beat
  const stepDuration = beatDuration / subdivision;
  return col * stepDuration;
}

export function rowToNote(row, height, scale, rootNote) {
  // row 0 = top = highest note
  // row height-1 = bottom = lowest note
  const invertedRow = (height - 1) - row;

  const scaleIntervals = SCALES[scale] || SCALES.chromatic;
  const octave = Math.floor(invertedRow / scaleIntervals.length);
  const degree = invertedRow % scaleIntervals.length;

  return rootNote + (octave * 12) + scaleIntervals[degree];
}

export function colorToChannel(color) {
  const CHANNEL_MAP = {
    '#ff0000': 0,  // red    → lead
    '#00ff00': 1,  // green  → bass
    '#0000ff': 2,  // blue   → pad
    '#ffff00': 3,  // yellow → arp
    '#ff00ff': 4,  // magenta → drums
    '#00ffff': 5,  // cyan   → fx
  };
  return CHANNEL_MAP[color?.toLowerCase()] ?? 0;
}

export function cellToNoteEvent(cell, gridWidth, gridHeight, musicOpts) {
  // Skip empty / rest cells
  if (!cell || cell.semantic === 'void') return null;

  const { bpm = 120, subdivision = 4, scale = 'chromatic', rootNote = 60 } = musicOpts || {};

  return {
    note: Math.min(127, Math.max(0, rowToNote(cell.y, gridHeight, scale, rootNote))),
    velocity: Math.min(127, Math.max(0, cell.channel?.audio?.velocity ?? Math.round((cell.density ?? 0.5) * 127))),
    time: columnToTime(cell.x, bpm, subdivision),
    duration: (cell.channel?.audio?.duration ?? 1) * (60 / bpm / subdivision),
    channel: colorToChannel(cell.color),  // color → instrument/track
    char: cell.char,                   // instrument hint for synthesis
  };
}

/**
 * Scan an entire frame and produce a sorted list of note events.
 *
 * @param {Object} grid - Full grid object
 * @param {number} frameIndex - Which frame to scan
 * @param {Object} opts - { bpm, subdivision, scale, rootNote, channelMap }
 * @returns {NoteEvent[]} - Sorted by time, then pitch
 */
export function frameToNoteEvents(grid, frameIndex, opts) {
  const frame = grid.frames[frameIndex];
  if (!frame) return [];

  const events = [];
  for (const cell of frame.cells) {
    const event = cellToNoteEvent(cell, grid.canvas.width, grid.canvas.height, opts);
    if (event) events.push(event);
  }

  return events.sort((a, b) => a.time - b.time || a.note - b.note);
}
