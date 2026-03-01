/**
 * synth-engine.js
 * Web Audio Synthesis Layer for the GRID project.
 * Takes NoteEvent[] from music-mapper.js and produces sound via Web Audio API.
 *
 * Task 3.2 — Zero external dependencies.
 */

import { frameToNoteEvents, midiToFrequency } from './music-mapper.js';

// ============================================================
// INSTRUMENT DEFINITIONS
// ============================================================

export const INSTRUMENTS = {
    0: { name: 'lead', wave: 'sawtooth', attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2, filterFreq: 2000 },
    1: { name: 'bass', wave: 'sine', attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.1, filterFreq: 800 },
    2: { name: 'pad', wave: 'triangle', attack: 0.3, decay: 0.3, sustain: 0.6, release: 0.5, filterFreq: 4000 },
    3: { name: 'arp', wave: 'square', attack: 0.005, decay: 0.05, sustain: 0.3, release: 0.05, filterFreq: 3000 },
    4: { name: 'drums', wave: 'noise', attack: 0.001, decay: 0.1, sustain: 0, release: 0.05, filterFreq: 8000 },
    5: { name: 'fx', wave: 'sine', attack: 0.1, decay: 0.5, sustain: 0.3, release: 1.0, filterFreq: 6000 },
};

/** Maximum simultaneous voices per column */
const MAX_POLYPHONY = 16;

// ============================================================
// NOISE BUFFER (cached)
// ============================================================

let _noiseBuffer = null;

/**
 * Create (and cache) a 2-second white noise AudioBuffer.
 */
export function createNoiseBuffer(audioCtx) {
    if (_noiseBuffer && _noiseBuffer.sampleRate === audioCtx.sampleRate) {
        return _noiseBuffer;
    }
    const length = 2 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    _noiseBuffer = buffer;
    return buffer;
}

/**
 * Reset the cached noise buffer (useful for tests).
 */
export function _resetNoiseBuffer() {
    _noiseBuffer = null;
}

// ============================================================
// ADSR ENVELOPE
// ============================================================

/**
 * Apply ADSR envelope to a GainNode.
 *
 * @param {GainNode} gainNode
 * @param {number} time      - Note start time (audioCtx seconds)
 * @param {number} velocity  - 0-127 MIDI velocity
 * @param {Object} adsr      - { attack, decay, sustain, release }
 * @param {number} duration  - Note duration in seconds
 */
export function applyADSR(gainNode, time, velocity, adsr, duration) {
    const peak = (velocity / 127) * 0.8; // scale down to avoid clipping
    const sustainLevel = peak * adsr.sustain;
    const releaseEnd = time + duration + adsr.release;

    const gain = gainNode.gain;
    gain.setValueAtTime(0, time);
    // Attack
    gain.linearRampToValueAtTime(peak, time + adsr.attack);
    // Decay → sustain
    gain.linearRampToValueAtTime(Math.max(sustainLevel, 0.001), time + adsr.attack + adsr.decay);
    // Hold sustain until release
    gain.setValueAtTime(Math.max(sustainLevel, 0.001), time + duration);
    // Release
    gain.exponentialRampToValueAtTime(0.001, releaseEnd);
}

// ============================================================
// VOICE PLAYERS
// ============================================================

/**
 * Play a tonal note (channels 0-3, 5).
 * Chain: OscillatorNode → BiquadFilter → GainNode → destination
 *
 * @returns {{ osc, filter, gain }} nodes for cleanup tracking
 */
export function playTonalNote(audioCtx, destination, event, instrument) {
    const osc = audioCtx.createOscillator();
    osc.type = instrument.wave;
    osc.frequency.setValueAtTime(midiToFrequency(event.note), event.time);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(instrument.filterFreq, event.time);
    filter.Q.setValueAtTime(1, event.time);

    const gain = audioCtx.createGain();
    applyADSR(gain, event.time, event.velocity, instrument, event.duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    const stopTime = event.time + event.duration + instrument.release + 0.01;
    osc.start(event.time);
    osc.stop(stopTime);

    return { osc, filter, gain, stopTime };
}

/**
 * Play a drum hit (channel 4). No samples needed — synthesis only.
 * Note range determines drum type:
 *   >80 = hi-hat (filtered noise burst)
 *   >50 = snare  (noise + pitched tone)
 *   ≤50 = kick   (sine with pitch sweep)
 *
 * @returns {{ nodes, stopTime }} for cleanup
 */
export function playDrum(audioCtx, destination, event) {
    const v = (event.velocity / 127) * 0.8;
    const time = event.time;
    const nodes = [];

    if (event.note > 80) {
        // ---- Hi-hat: short noise burst through high-pass ----
        const buffer = createNoiseBuffer(audioCtx);
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;

        const hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(8000, time);

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(v * 0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

        src.connect(hp);
        hp.connect(gain);
        gain.connect(destination);

        src.start(time);
        src.stop(time + 0.06);
        nodes.push(src, hp, gain);
        return { nodes, stopTime: time + 0.06 };

    } else if (event.note > 50) {
        // ---- Snare: noise + pitched sine ----
        const buffer = createNoiseBuffer(audioCtx);
        const noiseSrc = audioCtx.createBufferSource();
        noiseSrc.buffer = buffer;

        const bp = audioCtx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(3000, time);

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(v * 0.4, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

        noiseSrc.connect(bp);
        bp.connect(noiseGain);
        noiseGain.connect(destination);

        noiseSrc.start(time);
        noiseSrc.stop(time + 0.12);

        // Tone component
        const osc = audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, time);
        osc.frequency.exponentialRampToValueAtTime(80, time + 0.07);

        const toneGain = audioCtx.createGain();
        toneGain.gain.setValueAtTime(v * 0.5, time);
        toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

        osc.connect(toneGain);
        toneGain.connect(destination);

        osc.start(time);
        osc.stop(time + 0.12);

        nodes.push(noiseSrc, bp, noiseGain, osc, toneGain);
        return { nodes, stopTime: time + 0.12 };

    } else {
        // ---- Kick: sine with pitch sweep ----
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(v * 0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

        osc.connect(gain);
        gain.connect(destination);

        osc.start(time);
        osc.stop(time + 0.3);

        nodes.push(osc, gain);
        return { nodes, stopTime: time + 0.3 };
    }
}

// ============================================================
// POLYPHONY LIMITER
// ============================================================

/**
 * Group events by column (time), then cap each column at MAX_POLYPHONY.
 * Drop lowest-velocity events when over the cap.
 */
export function limitPolyphony(events, maxVoices = MAX_POLYPHONY) {
    if (events.length <= maxVoices) return events;

    // Group by time
    const byTime = new Map();
    for (const e of events) {
        const key = e.time.toFixed(6);
        if (!byTime.has(key)) byTime.set(key, []);
        byTime.get(key).push(e);
    }

    const result = [];
    for (const [, group] of byTime) {
        if (group.length <= maxVoices) {
            result.push(...group);
        } else {
            // Sort by velocity descending, keep top N
            group.sort((a, b) => b.velocity - a.velocity);
            result.push(...group.slice(0, maxVoices));
        }
    }

    // Re-sort by time, then note
    return result.sort((a, b) => a.time - b.time || a.note - b.note);
}

// ============================================================
// SYNTH ENGINE FACTORY
// ============================================================

/**
 * Create a synth engine that plays NoteEvents through Web Audio.
 *
 * @param {AudioContext} audioCtx
 * @returns {Object} synth engine API
 */
export function createSynthEngine(audioCtx) {
    // ---- State ----
    let isPlaying = false;
    let isPaused = false;
    let playStartTime = 0;
    let currentColumn = -1;
    let animFrameId = null;
    let activeNodes = [];           // { osc/src, gain, stopTime } for cleanup
    let instruments = { ...INSTRUMENTS };

    // ---- Master volume node ----
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.7, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);

    // ---- Internal helpers ----

    function clearActiveNodes() {
        for (const node of activeNodes) {
            try {
                if (node.osc) { node.osc.disconnect(); }
                if (node.filter) { node.filter.disconnect(); }
                if (node.gain) { node.gain.disconnect(); }
                if (node.nodes) {
                    for (const n of node.nodes) {
                        try { n.disconnect(); } catch (_) { /* already disconnected */ }
                    }
                }
            } catch (_) { /* already disconnected */ }
        }
        activeNodes = [];
    }

    function cancelCursorTick() {
        if (animFrameId !== null) {
            // In Node (tests), cancelAnimationFrame may not exist
            if (typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(animFrameId);
            }
            animFrameId = null;
        }
    }

    // ---- Public API ----

    /**
     * Schedule all note events for playback at the given audioContext time offset.
     *
     * @param {NoteEvent[]} noteEvents
     * @param {number} startTime - audioContext time to begin playback
     */
    function scheduleFrame(noteEvents, startTime) {
        const limited = limitPolyphony(noteEvents);

        for (const event of limited) {
            // Offset event times relative to startTime
            const scheduled = { ...event, time: startTime + event.time };
            const inst = instruments[event.channel] ?? instruments[0];

            if (event.channel === 4) {
                // Drum channel
                const result = playDrum(audioCtx, masterGain, scheduled);
                activeNodes.push(result);
            } else {
                // Tonal channel
                const result = playTonalNote(audioCtx, masterGain, scheduled, inst);
                activeNodes.push(result);
            }
        }
    }

    /**
     * Play a grid frame. Scan → schedule → start cursor tick.
     *
     * @param {Object} grid
     * @param {number} frameIndex
     * @param {Object} opts - { bpm, subdivision, scale, rootNote, loop, onColumnChange }
     */
    function play(grid, frameIndex, opts) {
        if (isPlaying) stop();

        const noteEvents = frameToNoteEvents(grid, frameIndex, opts);
        const bpm = opts.bpm || 120;
        const subdivision = opts.subdivision || 4;
        const stepDuration = 60 / bpm / subdivision;
        const gridWidth = grid.canvas?.width || 1;

        playStartTime = audioCtx.currentTime;
        isPlaying = true;
        isPaused = false;
        currentColumn = -1;

        scheduleFrame(noteEvents, playStartTime);

        // ---- Cursor tick via requestAnimationFrame ----
        function tick() {
            if (!isPlaying || isPaused) return;

            const elapsed = audioCtx.currentTime - playStartTime;
            const newCol = Math.floor(elapsed / stepDuration);

            if (newCol !== currentColumn) {
                currentColumn = newCol;

                if (currentColumn >= gridWidth) {
                    if (opts.loop) {
                        // Loop: reset and reschedule
                        currentColumn = 0;
                        clearActiveNodes();
                        playStartTime = audioCtx.currentTime;
                        scheduleFrame(noteEvents, playStartTime);
                    } else {
                        stop();
                        return;
                    }
                }

                if (typeof opts.onColumnChange === 'function') {
                    opts.onColumnChange(currentColumn);
                }
            }

            // In Node (tests), requestAnimationFrame may not exist
            if (typeof requestAnimationFrame === 'function') {
                animFrameId = requestAnimationFrame(tick);
            }
        }

        // Start the tick loop
        if (typeof requestAnimationFrame === 'function') {
            animFrameId = requestAnimationFrame(tick);
        }
    }

    /**
     * Stop all playback. Clear scheduled nodes, reset state.
     */
    function stop() {
        isPlaying = false;
        isPaused = false;
        currentColumn = -1;
        cancelCursorTick();
        clearActiveNodes();
    }

    /**
     * Pause playback (suspend AudioContext).
     */
    function pause() {
        if (!isPlaying || isPaused) return;
        isPaused = true;
        cancelCursorTick();
        if (typeof audioCtx.suspend === 'function') {
            audioCtx.suspend();
        }
    }

    /**
     * Resume from pause.
     */
    function resume() {
        if (!isPlaying || !isPaused) return;
        isPaused = false;
        if (typeof audioCtx.resume === 'function') {
            audioCtx.resume();
        }
        // Restart the tick loop
        if (typeof requestAnimationFrame === 'function') {
            animFrameId = requestAnimationFrame(function tick() {
                if (!isPlaying || isPaused) return;
                const elapsed = audioCtx.currentTime - playStartTime;
                const stepDuration = 60 / 120 / 4; // fallback; real values captured in play()
                const newCol = Math.floor(elapsed / stepDuration);
                if (newCol !== currentColumn) {
                    currentColumn = newCol;
                }
                if (typeof requestAnimationFrame === 'function') {
                    animFrameId = requestAnimationFrame(tick);
                }
            });
        }
    }

    /**
     * Set master volume (0–1).
     */
    function setMasterVolume(v) {
        const clamped = Math.max(0, Math.min(1, v));
        masterGain.gain.setValueAtTime(clamped, audioCtx.currentTime);
    }

    /**
     * Override an instrument definition for a channel.
     */
    function setInstrument(channel, instrumentDef) {
        instruments[channel] = { ...instruments[channel], ...instrumentDef };
    }

    /**
     * Clean up: stop playback, disconnect master, close context.
     */
    function destroy() {
        stop();
        masterGain.disconnect();
    }

    // ---- Return public interface ----

    return {
        scheduleFrame,
        play,
        stop,
        pause,
        resume,
        setMasterVolume,
        setInstrument,
        destroy,

        get isPlaying() { return isPlaying; },
        get isPaused() { return isPaused; },
        get currentTime() { return isPlaying ? audioCtx.currentTime - playStartTime : 0; },
        get currentColumn() { return currentColumn; },
    };
}
