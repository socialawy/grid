/**
 * midi-output.js — Task 3.4: Web MIDI Output
 *
 * Maps NoteEvent[] (from music-mapper) → MIDI messages via Web MIDI API.
 * Tier 1 feature: Chrome/Edge only. Degrades silently when unavailable.
 *
 * Scheduling strategy: lookahead 50ms, tick every 25ms.
 * performance.now() drives all timestamps.
 *
 * Usage:
 *   const midi = createMIDIOutput();
 *   if (midi.isAvailable()) {
 *     await midi.init();
 *     midi.selectOutput(midi.getOutputs()[0].id);
 *     midi.scheduleEvents(noteEvents, bpm);
 *     // later:
 *     midi.stop();
 *     midi.destroy();
 *   }
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Lookahead window in seconds — how far ahead to schedule events */
const LOOKAHEAD_SEC = 0.05;

/** Scheduler tick interval in milliseconds */
const TICK_MS = 25;

/** MIDI status byte bases */
const NOTE_ON  = 0x90;
const NOTE_OFF = 0x80;

// ─── Pure Helpers (exported for testing) ─────────────────────────────────────

/**
 * Clamp v to [min, max] and round to integer.
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampMidi(v, min, max) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Build a MIDI note-on byte array.
 * channel is clamped 0-15, note and velocity 0-127.
 * @param {number} channel
 * @param {number} note
 * @param {number} velocity
 * @returns {number[]}
 */
function buildNoteOn(channel, note, velocity) {
  return [
    NOTE_ON  | clampMidi(channel, 0, 15),
    clampMidi(note, 0, 127),
    clampMidi(velocity, 0, 127),
  ];
}

/**
 * Build a MIDI note-off byte array.
 * channel clamped 0-15, note 0-127, velocity always 0.
 * @param {number} channel
 * @param {number} note
 * @returns {number[]}
 */
function buildNoteOff(channel, note) {
  return [
    NOTE_OFF | clampMidi(channel, 0, 15),
    clampMidi(note, 0, 127),
    0,
  ];
}

/**
 * Sort NoteEvent[] by time ascending, then pitch ascending.
 * Returns a new array — does not mutate input.
 * @param {object[]} events
 * @returns {object[]}
 */
function sortNoteEvents(events) {
  return [...events].sort((a, b) => a.time - b.time || a.note - b.note);
}

/**
 * Convert beat-relative NoteEvent times (seconds) to wall-clock ms
 * anchored to startMs (a performance.now() value).
 * Adds absoluteMs (note-on time) and noteOffMs (note-off time) to each event.
 * Does not mutate input.
 * @param {object[]} events   NoteEvent[] with time + duration in seconds
 * @param {number}   startMs  performance.now() at playback start
 * @returns {object[]}
 */
function anchorEvents(events, startMs) {
  return events.map(e => ({
    ...e,
    absoluteMs: startMs + e.time * 1000,
    noteOffMs:  startMs + (e.time + e.duration) * 1000,
  }));
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a Web MIDI output controller.
 * All public methods no-op gracefully when MIDI is unavailable or not init'd.
 *
 * @returns {object}
 */
function createMIDIOutput() {
  /** @type {MIDIAccess|null} */
  let _access = null;

  /** @type {MIDIOutput|null} */
  let _output = null;

  /** @type {number|null} setInterval handle */
  let _tickId = null;

  /** @type {object[]} anchored events waiting to be dispatched */
  let _pending = [];

  /** @type {number} cursor into _pending for the scheduler */
  let _cursor = 0;

  // ── Feature detection ──────────────────────────────────────────────────────

  /**
   * Returns true when navigator.requestMIDIAccess is present.
   * Does NOT guarantee the user will grant permission.
   * @returns {boolean}
   */
  function isAvailable() {
    return typeof navigator !== 'undefined' &&
           typeof navigator.requestMIDIAccess === 'function';
  }

  /**
   * Returns true when init() succeeded AND an output port is selected.
   * @returns {boolean}
   */
  function isReady() {
    return _access !== null && _output !== null;
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  /**
   * Request Web MIDI access.
   * Resolves { ok: true } on success.
   * Resolves { ok: false, error: string } on any failure — never rejects.
   * Safe to call multiple times; re-uses existing access object.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async function init() {
    if (_access) return { ok: true };

    if (!isAvailable()) {
      return { ok: false, error: 'Web MIDI API not supported in this browser' };
    }

    try {
      _access = await navigator.requestMIDIAccess({ sysex: false });
      return { ok: true };
    } catch (err) {
      _access = null;
      return { ok: false, error: err.message || 'MIDI access denied' };
    }
  }

  // ── Port management ────────────────────────────────────────────────────────

  /**
   * List all available MIDI output ports.
   * Returns [] when not initialised or no ports present.
   * @returns {Array<{id: string, name: string}>}
   */
  function getOutputs() {
    if (!_access) return [];
    const list = [];
    _access.outputs.forEach(port => {
      list.push({ id: port.id, name: port.name || port.id });
    });
    return list;
  }

  /**
   * Select a MIDI output port by id (from getOutputs()).
   * @param {string} id
   * @returns {boolean} true if port was found and selected
   */
  function selectOutput(id) {
    if (!_access) return false;
    const port = _access.outputs.get(id);
    if (!port) return false;
    _output = port;
    return true;
  }

  /**
   * Return the currently selected output as { id, name }, or null.
   * @returns {{id: string, name: string}|null}
   */
  function getSelectedOutput() {
    if (!_output) return null;
    return { id: _output.id, name: _output.name || _output.id };
  }

  // ── Immediate send ─────────────────────────────────────────────────────────

  /**
   * Send a note-on immediately (no timestamp scheduling).
   * No-op when no output is selected.
   * @param {number} channel   0-15
   * @param {number} note      0-127
   * @param {number} velocity  0-127
   */
  function sendNoteOn(channel, note, velocity) {
    if (!_output) return;
    _output.send(buildNoteOn(channel, note, velocity));
  }

  /**
   * Send a note-off immediately.
   * No-op when no output is selected.
   * @param {number} channel  0-15
   * @param {number} note     0-127
   */
  function sendNoteOff(channel, note) {
    if (!_output) return;
    _output.send(buildNoteOff(channel, note));
  }

  /**
   * Send MIDI CC 123 (All Notes Off) on all 16 channels.
   * Use for a clean hard-stop.
   */
  function sendAllNotesOff() {
    if (!_output) return;
    for (let ch = 0; ch < 16; ch++) {
      _output.send([0xB0 | ch, 123, 0]);
    }
  }

  // ── Scheduler ──────────────────────────────────────────────────────────────

  /**
   * Stop any in-progress scheduled playback and clear all pending events.
   * Does NOT send note-offs for already-dispatched notes —
   * call sendAllNotesOff() first if you need silence immediately.
   */
  function stop() {
    if (_tickId !== null) {
      clearInterval(_tickId);
      _tickId = null;
    }
    _pending = [];
    _cursor  = 0;
  }

  /**
   * Schedule a NoteEvent[] for MIDI output, starting immediately.
   * Replaces any in-progress playback.
   *
   * NoteEvent shape (from music-mapper.frameToNoteEvents):
   *   { note, velocity, time, duration, channel }
   *   time and duration are in seconds (beat-relative from bar start).
   *
   * The scheduler uses a 50ms lookahead window checked every 25ms.
   * Each note-on and note-off are passed to MIDIOutput.send() with an
   * explicit DOMHighResTimestamp so the browser's MIDI subsystem handles
   * the fine-grained timing.
   *
   * @param {object[]} noteEvents  NoteEvent[] from frameToNoteEvents()
   * @param {number}   _bpm        reserved (loop duration, Phase 3.5+)
   */
  function scheduleEvents(noteEvents, _bpm) {
    stop();
    if (!_output || !noteEvents || noteEvents.length === 0) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    _pending = anchorEvents(sortNoteEvents(noteEvents), now);
    _cursor  = 0;

    _tickId = setInterval(() => {
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const horizon = t + LOOKAHEAD_SEC * 1000;

      while (_cursor < _pending.length && _pending[_cursor].absoluteMs <= horizon) {
        const e = _pending[_cursor++];
        try {
          _output.send(buildNoteOn(e.channel, e.note, e.velocity), e.absoluteMs);
          _output.send(buildNoteOff(e.channel, e.note), e.noteOffMs);
        } catch (_err) {
          // Port disconnected — bail out silently
          stop();
          return;
        }
      }

      // All events dispatched — self-stop
      if (_cursor >= _pending.length) {
        stop();
      }
    }, TICK_MS);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Stop playback and release all references.
   * The instance is unusable after destroy().
   */
  function destroy() {
    stop();
    _output = null;
    _access = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    // Lifecycle
    init,
    destroy,
    // Detection
    isAvailable,
    isReady,
    // Ports
    getOutputs,
    selectOutput,
    getSelectedOutput,
    // Immediate send
    sendNoteOn,
    sendNoteOff,
    sendAllNotesOff,
    // Scheduled playback
    scheduleEvents,
    stop,
    // Pure helpers exposed for unit tests
    _buildNoteOn:    buildNoteOn,
    _buildNoteOff:   buildNoteOff,
    _clampMidi:      clampMidi,
    _sortNoteEvents: sortNoteEvents,
    _anchorEvents:   anchorEvents,
  };
}

// ─── Universal export ─────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createMIDIOutput,
    buildNoteOn,
    buildNoteOff,
    clampMidi,
    sortNoteEvents,
    anchorEvents,
  };
}
if (typeof window !== 'undefined') {
  window.MIDIOutput = {
    createMIDIOutput,
    buildNoteOn,
    buildNoteOff,
    clampMidi,
    sortNoteEvents,
    anchorEvents,
  };
}
export {
  createMIDIOutput,
  buildNoteOn,
  buildNoteOff,
  clampMidi,
  sortNoteEvents,
  anchorEvents,
};
