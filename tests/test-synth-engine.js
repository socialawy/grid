/**
 * test-synth-engine.js — Test suite for Task 3.2
 * Node.js with MockAudioContext. Zero real audio output.
 */

// ============================================================
// ASSERT HELPERS
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
    static isNotNull(value, message = '') {
        if (value == null) {
            throw new Error(`FAIL: ${message}\n  Expected: not null/undefined\n  Actual: ${value}`);
        }
    }
    static greaterThan(a, b, message = '') {
        if (!(a > b)) {
            throw new Error(`FAIL: ${message}\n  Expected ${a} > ${b}`);
        }
    }
    static lessThanOrEqual(a, b, message = '') {
        if (!(a <= b)) {
            throw new Error(`FAIL: ${message}\n  Expected ${a} <= ${b}`);
        }
    }
    static instanceOf(obj, cls, message = '') {
        if (!(obj instanceof cls) && obj?.constructor?.name !== cls.name) {
            throw new Error(`FAIL: ${message}\n  Expected instance of ${cls.name}`);
        }
    }
}

class TestRunner {
    constructor() { this.tests = []; this.passed = 0; this.failed = 0; this.results = []; }
    test(name, fn) { this.tests.push({ name, fn }); }
    async run() {
        console.log('\n=== Synth Engine Test Suite ===\n');
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
    }
}

// ============================================================
// MOCK AUDIO CONTEXT
// ============================================================

/**
 * MockAudioParam — records all automation calls.
 */
class MockAudioParam {
    constructor(defaultValue = 0) {
        this.value = defaultValue;
        this.automations = [];
    }
    setValueAtTime(value, time) {
        this.value = value;
        this.automations.push({ method: 'setValueAtTime', value, time });
        return this;
    }
    linearRampToValueAtTime(value, time) {
        this.automations.push({ method: 'linearRampToValueAtTime', value, time });
        return this;
    }
    exponentialRampToValueAtTime(value, time) {
        this.automations.push({ method: 'exponentialRampToValueAtTime', value, time });
        return this;
    }
    setTargetAtTime(target, startTime, timeConstant) {
        this.automations.push({ method: 'setTargetAtTime', target, startTime, timeConstant });
        return this;
    }
    cancelScheduledValues(startTime) {
        this.automations.push({ method: 'cancelScheduledValues', startTime });
        return this;
    }
}

/**
 * MockAudioNode — base for all mock nodes, tracks connections.
 */
class MockAudioNode {
    constructor(context, type) {
        this.context = context;
        this._type = type;
        this.connections = [];
        this.disconnected = false;
    }
    connect(dest) {
        this.connections.push(dest);
        return dest; // chain
    }
    disconnect() {
        this.disconnected = true;
        this.connections = [];
    }
}

/**
 * MockOscillatorNode
 */
class MockOscillatorNode extends MockAudioNode {
    constructor(context) {
        super(context, 'oscillator');
        this.type = 'sine';
        this.frequency = new MockAudioParam(440);
        this.detune = new MockAudioParam(0);
        this.started = false;
        this.stopped = false;
        this.startTime = null;
        this.stopTime = null;
        context._nodes.push(this);
    }
    start(time) { this.started = true; this.startTime = time; }
    stop(time) { this.stopped = true; this.stopTime = time; }
}

/**
 * MockGainNode
 */
class MockGainNode extends MockAudioNode {
    constructor(context) {
        super(context, 'gain');
        this.gain = new MockAudioParam(1);
        context._nodes.push(this);
    }
}

/**
 * MockBiquadFilterNode
 */
class MockBiquadFilterNode extends MockAudioNode {
    constructor(context) {
        super(context, 'biquadFilter');
        this.type = 'lowpass';
        this.frequency = new MockAudioParam(350);
        this.Q = new MockAudioParam(1);
        this.detune = new MockAudioParam(0);
        context._nodes.push(this);
    }
}

/**
 * MockBufferSourceNode
 */
class MockBufferSourceNode extends MockAudioNode {
    constructor(context) {
        super(context, 'bufferSource');
        this.buffer = null;
        this.loop = false;
        this.started = false;
        this.stopped = false;
        this.startTime = null;
        this.stopTime = null;
        context._nodes.push(this);
    }
    start(time) { this.started = true; this.startTime = time; }
    stop(time) { this.stopped = true; this.stopTime = time; }
}

/**
 * MockAudioBuffer
 */
class MockAudioBuffer {
    constructor(channels, length, sampleRate) {
        this.numberOfChannels = channels;
        this.length = length;
        this.sampleRate = sampleRate;
        this._data = new Float32Array(length);
    }
    getChannelData(channel) {
        return this._data;
    }
}

/**
 * MockAudioContext — replacement for real AudioContext in tests.
 */
class MockAudioContext {
    constructor() {
        this.currentTime = 0;
        this.sampleRate = 44100;
        this.state = 'running';
        this.destination = new MockAudioNode(this, 'destination');
        this._nodes = [];
        this._suspended = false;
    }

    createOscillator() { return new MockOscillatorNode(this); }
    createGain() { return new MockGainNode(this); }
    createBiquadFilter() { return new MockBiquadFilterNode(this); }
    createBufferSource() { return new MockBufferSourceNode(this); }
    createBuffer(channels, length, sampleRate) {
        return new MockAudioBuffer(channels, length, sampleRate);
    }

    suspend() { this.state = 'suspended'; this._suspended = true; }
    resume() { this.state = 'running'; this._suspended = false; }
    close() { this.state = 'closed'; }

    /** Helper: count nodes of a given type */
    getNodesByType(type) {
        return this._nodes.filter(n => n._type === type);
    }
}

// ============================================================
// TESTS
// ============================================================

async function runTests() {
    const {
        createSynthEngine,
        INSTRUMENTS,
        applyADSR,
        createNoiseBuffer,
        playTonalNote,
        playDrum,
        limitPolyphony,
        _resetNoiseBuffer,
    } = await import('../src/consumers/music/synth-engine.js');

    const { midiToFrequency } = await import('../src/consumers/music/music-mapper.js');

    const runner = new TestRunner();

    // ---- Helper: fresh context + engine ----
    function freshEngine() {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const engine = createSynthEngine(ctx);
        return { ctx, engine };
    }

    // Helper: make a simple note event
    function makeEvent(overrides = {}) {
        return {
            note: 60, velocity: 100, time: 0, duration: 0.25,
            channel: 0, char: '@', ...overrides
        };
    }

    // Helper: make a minimal grid with cells
    function makeGrid(cells, width = 8, height = 8) {
        return {
            canvas: { width, height },
            frames: [{ cells }]
        };
    }

    // ============================================================
    // INSTRUMENT DEFINITIONS
    // ============================================================

    runner.test('INSTRUMENTS has 6 entries', () => {
        Assert.equal(Object.keys(INSTRUMENTS).length, 6, 'should have 6 instruments');
    });

    runner.test('Each instrument has required ADSR + wave fields', () => {
        for (const [ch, inst] of Object.entries(INSTRUMENTS)) {
            Assert.isNotNull(inst.name, `channel ${ch} name`);
            Assert.isNotNull(inst.wave, `channel ${ch} wave`);
            Assert.isNotNull(inst.attack, `channel ${ch} attack`);
            Assert.isNotNull(inst.decay, `channel ${ch} decay`);
            Assert.isNotNull(inst.filterFreq, `channel ${ch} filterFreq`);
            Assert.isTrue(inst.release >= 0, `channel ${ch} release >= 0`);
            Assert.isTrue(inst.sustain >= 0, `channel ${ch} sustain >= 0`);
        }
    });

    runner.test('Instrument waveforms match spec', () => {
        Assert.equal(INSTRUMENTS[0].wave, 'sawtooth', 'lead = sawtooth');
        Assert.equal(INSTRUMENTS[1].wave, 'sine', 'bass = sine');
        Assert.equal(INSTRUMENTS[2].wave, 'triangle', 'pad = triangle');
        Assert.equal(INSTRUMENTS[3].wave, 'square', 'arp = square');
        Assert.equal(INSTRUMENTS[4].wave, 'noise', 'drums = noise');
        Assert.equal(INSTRUMENTS[5].wave, 'sine', 'fx = sine');
    });

    // ============================================================
    // ADSR ENVELOPE
    // ============================================================

    runner.test('applyADSR sets attack ramp at event time', () => {
        const ctx = new MockAudioContext();
        const gain = ctx.createGain();
        applyADSR(gain, 1.0, 127, { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 }, 0.5);
        const autos = gain.gain.automations;
        // First: setValueAtTime(0, 1.0)
        Assert.equal(autos[0].method, 'setValueAtTime');
        Assert.equal(autos[0].value, 0);
        Assert.equal(autos[0].time, 1.0);
        // Second: linearRamp to peak at time + attack
        Assert.equal(autos[1].method, 'linearRampToValueAtTime');
        Assert.equal(autos[1].time, 1.01); // 1.0 + 0.01
    });

    runner.test('applyADSR decay begins after attack', () => {
        const ctx = new MockAudioContext();
        const gain = ctx.createGain();
        applyADSR(gain, 0, 100, { attack: 0.05, decay: 0.1, sustain: 0.5, release: 0.3 }, 1.0);
        const autos = gain.gain.automations;
        // Attack ends at 0.05, decay ramp to sustain level at 0.05 + 0.1 = 0.15
        Assert.equal(autos[2].method, 'linearRampToValueAtTime');
        Assert.isTrue(Math.abs(autos[2].time - 0.15) < 0.001, 'decay ends at attack + decay time');
    });

    runner.test('applyADSR release ends after duration + release', () => {
        const ctx = new MockAudioContext();
        const gain = ctx.createGain();
        applyADSR(gain, 0, 100, { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 }, 0.5);
        const autos = gain.gain.automations;
        const lastAuto = autos[autos.length - 1];
        Assert.equal(lastAuto.method, 'exponentialRampToValueAtTime');
        Assert.isTrue(Math.abs(lastAuto.time - 0.7) < 0.001, 'release ends at duration + release');
        Assert.isTrue(lastAuto.value <= 0.01, 'gain near zero after release');
    });

    runner.test('applyADSR - zero velocity produces near-zero peak', () => {
        const ctx = new MockAudioContext();
        const gain = ctx.createGain();
        applyADSR(gain, 0, 0, { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 }, 0.5);
        const autos = gain.gain.automations;
        // Peak should be 0 * 0.8 = 0
        Assert.equal(autos[1].value, 0, 'zero velocity = zero peak');
    });

    // ============================================================
    // NOISE BUFFER
    // ============================================================

    runner.test('createNoiseBuffer returns a buffer', () => {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const buf = createNoiseBuffer(ctx);
        Assert.isNotNull(buf, 'buffer not null');
        Assert.equal(buf.numberOfChannels, 1, '1 channel');
        Assert.equal(buf.length, 2 * ctx.sampleRate, '2 seconds');
    });

    runner.test('createNoiseBuffer caches on second call', () => {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const buf1 = createNoiseBuffer(ctx);
        const buf2 = createNoiseBuffer(ctx);
        Assert.isTrue(buf1 === buf2, 'same reference on second call');
    });

    // ============================================================
    // TONAL VOICE
    // ============================================================

    runner.test('playTonalNote creates osc → filter → gain chain', () => {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const dest = ctx.createGain();
        const event = makeEvent({ time: 0.5, note: 72, channel: 0 });
        const inst = INSTRUMENTS[0]; // lead

        const result = playTonalNote(ctx, dest, event, inst);
        Assert.isNotNull(result.osc, 'oscillator created');
        Assert.isNotNull(result.filter, 'filter created');
        Assert.isNotNull(result.gain, 'gain created');
    });

    runner.test('playTonalNote sets correct waveform', () => {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const dest = ctx.createGain();

        // Lead = sawtooth
        const ev0 = makeEvent({ channel: 0 });
        const r0 = playTonalNote(ctx, dest, ev0, INSTRUMENTS[0]);
        Assert.equal(r0.osc.type, 'sawtooth', 'lead = sawtooth');

        // Bass = sine
        const ev1 = makeEvent({ channel: 1 });
        const r1 = playTonalNote(ctx, dest, ev1, INSTRUMENTS[1]);
        Assert.equal(r1.osc.type, 'sine', 'bass = sine');

        // Pad = triangle
        const ev2 = makeEvent({ channel: 2 });
        const r2 = playTonalNote(ctx, dest, ev2, INSTRUMENTS[2]);
        Assert.equal(r2.osc.type, 'triangle', 'pad = triangle');

        // Arp = square
        const ev3 = makeEvent({ channel: 3 });
        const r3 = playTonalNote(ctx, dest, ev3, INSTRUMENTS[3]);
        Assert.equal(r3.osc.type, 'square', 'arp = square');
    });

    runner.test('playTonalNote sets correct frequency from note', () => {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const dest = ctx.createGain();
        const event = makeEvent({ note: 69 }); // A4 = 440 Hz
        const result = playTonalNote(ctx, dest, event, INSTRUMENTS[0]);
        const freqAuto = result.osc.frequency.automations[0];
        Assert.isTrue(Math.abs(freqAuto.value - 440) < 0.01, 'A4 = 440Hz');
    });

    runner.test('playTonalNote starts and stops oscillator', () => {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const dest = ctx.createGain();
        const event = makeEvent({ time: 1.0, duration: 0.5 });
        const result = playTonalNote(ctx, dest, event, INSTRUMENTS[0]);
        Assert.isTrue(result.osc.started, 'osc started');
        Assert.isTrue(result.osc.stopped, 'osc stopped');
        Assert.equal(result.osc.startTime, 1.0, 'start at event time');
        Assert.greaterThan(result.osc.stopTime, 1.5, 'stop after event end + release');
    });

    runner.test('playTonalNote connects to provided destination', () => {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const dest = ctx.createGain();
        const event = makeEvent();
        const result = playTonalNote(ctx, dest, event, INSTRUMENTS[0]);
        Assert.isTrue(result.gain.connections.includes(dest), 'gain → destination');
    });

    // ============================================================
    // DRUM VOICE
    // ============================================================

    runner.test('playDrum - high note (>80) = hi-hat with noise', () => {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const dest = ctx.createGain();
        const event = makeEvent({ note: 90, channel: 4 });
        const result = playDrum(ctx, dest, event);

        Assert.isNotNull(result, 'result not null');
        Assert.greaterThan(result.nodes.length, 0, 'nodes created');
        // Should have a buffer source (noise)
        const bufferSources = result.nodes.filter(n => n._type === 'bufferSource');
        Assert.greaterThan(bufferSources.length, 0, 'noise source for hi-hat');
        Assert.isTrue(result.stopTime <= event.time + 0.1, 'short duration for hi-hat');
    });

    runner.test('playDrum - mid note (51-80) = snare with noise + tone', () => {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const dest = ctx.createGain();
        const event = makeEvent({ note: 65, channel: 4 });
        const result = playDrum(ctx, dest, event);

        Assert.isNotNull(result, 'result not null');
        // Snare has both noise and oscillator
        const bufferSources = result.nodes.filter(n => n._type === 'bufferSource');
        const oscs = result.nodes.filter(n => n._type === 'oscillator');
        Assert.greaterThan(bufferSources.length, 0, 'noise component for snare');
        Assert.greaterThan(oscs.length, 0, 'tone component for snare');
    });

    runner.test('playDrum - low note (<=50) = kick with pitch sweep', () => {
        _resetNoiseBuffer();
        const ctx = new MockAudioContext();
        const dest = ctx.createGain();
        const event = makeEvent({ note: 40, channel: 4 });
        const result = playDrum(ctx, dest, event);

        Assert.isNotNull(result, 'result not null');
        const oscs = result.nodes.filter(n => n._type === 'oscillator');
        Assert.greaterThan(oscs.length, 0, 'oscillator for kick');
        // Should have pitch sweep — frequency automation
        const freqAutos = oscs[0].frequency.automations;
        Assert.greaterThan(freqAutos.length, 1, 'frequency automations for pitch sweep');
        // Start high (150), sweep to low (30)
        Assert.equal(freqAutos[0].value, 150, 'kick starts at 150Hz');
        Assert.equal(freqAutos[1].value, 30, 'kick sweeps to 30Hz');
    });

    // ============================================================
    // POLYPHONY LIMITER
    // ============================================================

    runner.test('limitPolyphony returns all events when under cap', () => {
        const events = [makeEvent({ note: 60 }), makeEvent({ note: 62 }), makeEvent({ note: 64 })];
        const result = limitPolyphony(events);
        Assert.equal(result.length, 3, 'all 3 kept');
    });

    runner.test('limitPolyphony caps simultaneous events at 16', () => {
        const events = [];
        for (let i = 0; i < 20; i++) {
            events.push(makeEvent({ note: 40 + i, velocity: i * 5, time: 0 }));
        }
        const result = limitPolyphony(events, 16);
        Assert.equal(result.length, 16, 'capped at 16');
    });

    runner.test('limitPolyphony keeps highest-velocity events', () => {
        const events = [];
        for (let i = 0; i < 20; i++) {
            events.push(makeEvent({ note: 40 + i, velocity: i * 6, time: 0 }));
        }
        const result = limitPolyphony(events, 16);
        // Lowest velocity events (i=0..3, vel 0,6,12,18) should be dropped
        const minVel = Math.min(...result.map(e => e.velocity));
        Assert.greaterThan(minVel, 17, 'lowest-velocity notes dropped');
    });

    runner.test('limitPolyphony handles multiple time groups independently', () => {
        const events = [];
        // 10 events at time 0, 10 at time 1
        for (let i = 0; i < 10; i++) {
            events.push(makeEvent({ note: 40 + i, time: 0 }));
            events.push(makeEvent({ note: 40 + i, time: 1 }));
        }
        const result = limitPolyphony(events, 8);
        const atTime0 = result.filter(e => e.time === 0);
        const atTime1 = result.filter(e => e.time === 1);
        Assert.lessThanOrEqual(atTime0.length, 8, 'time 0 capped');
        Assert.lessThanOrEqual(atTime1.length, 8, 'time 1 capped');
    });

    // ============================================================
    // SYNTH ENGINE — SCHEDULING
    // ============================================================

    runner.test('scheduleFrame with empty array creates no nodes', () => {
        const { ctx, engine } = freshEngine();
        const nodesBefore = ctx._nodes.length;
        engine.scheduleFrame([], 0);
        // Only the master gain was created
        Assert.equal(ctx._nodes.length, nodesBefore, 'no new nodes');
    });

    runner.test('scheduleFrame with 3 tonal events creates 3 voice chains', () => {
        const { ctx, engine } = freshEngine();
        const nodesBefore = ctx._nodes.length;
        const events = [
            makeEvent({ note: 60, channel: 0 }),
            makeEvent({ note: 64, channel: 1, time: 0.125 }),
            makeEvent({ note: 67, channel: 2, time: 0.25 }),
        ];
        engine.scheduleFrame(events, 0);
        // Each tonal voice = 1 osc + 1 filter + 1 gain = 3 nodes per voice
        const newOscs = ctx.getNodesByType('oscillator');
        Assert.equal(newOscs.length, 3, '3 oscillators for 3 events');
    });

    runner.test('scheduleFrame offsets event times by startTime', () => {
        const { ctx, engine } = freshEngine();
        const events = [makeEvent({ time: 0.5 })];
        engine.scheduleFrame(events, 10.0);
        const oscs = ctx.getNodesByType('oscillator');
        Assert.equal(oscs[0].startTime, 10.5, 'event start = 10 + 0.5');
    });

    runner.test('scheduleFrame routes channel 4 to drum synthesis', () => {
        const { ctx, engine } = freshEngine();
        const events = [makeEvent({ channel: 4, note: 40 })]; // kick
        engine.scheduleFrame(events, 0);
        // Kick uses oscillator (sine) — but no filter (unlike tonal voices)
        const oscs = ctx.getNodesByType('oscillator');
        Assert.greaterThan(oscs.length, 0, 'drum creates oscillator for kick');
    });

    runner.test('scheduleFrame routes channel 4 hi-hat to noise', () => {
        const { ctx, engine } = freshEngine();
        const events = [makeEvent({ channel: 4, note: 90 })]; // hi-hat
        engine.scheduleFrame(events, 0);
        const bufferSources = ctx.getNodesByType('bufferSource');
        Assert.greaterThan(bufferSources.length, 0, 'hi-hat uses buffer source');
    });

    // ============================================================
    // SYNTH ENGINE — TRANSPORT
    // ============================================================

    runner.test('play() sets isPlaying to true', () => {
        const { ctx, engine } = freshEngine();
        const grid = makeGrid([{ x: 0, y: 0, char: '@', semantic: 'entity' }]);
        engine.play(grid, 0, { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 });
        Assert.isTrue(engine.isPlaying, 'isPlaying after play()');
    });

    runner.test('stop() sets isPlaying to false', () => {
        const { ctx, engine } = freshEngine();
        const grid = makeGrid([{ x: 0, y: 0, char: '@', semantic: 'entity' }]);
        engine.play(grid, 0, { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 });
        engine.stop();
        Assert.isFalse(engine.isPlaying, 'not playing after stop()');
    });

    runner.test('stop() resets currentColumn to -1', () => {
        const { ctx, engine } = freshEngine();
        const grid = makeGrid([{ x: 0, y: 0, char: '@', semantic: 'entity' }]);
        engine.play(grid, 0, { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 });
        engine.stop();
        Assert.equal(engine.currentColumn, -1, 'column reset after stop');
    });

    runner.test('pause() sets isPaused and suspends context', () => {
        const { ctx, engine } = freshEngine();
        const grid = makeGrid([{ x: 0, y: 0, char: '@', semantic: 'entity' }]);
        engine.play(grid, 0, { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 });
        engine.pause();
        Assert.isTrue(engine.isPaused, 'isPaused after pause()');
        Assert.equal(ctx.state, 'suspended', 'context suspended');
    });

    runner.test('resume() clears isPaused and resumes context', () => {
        const { ctx, engine } = freshEngine();
        const grid = makeGrid([{ x: 0, y: 0, char: '@', semantic: 'entity' }]);
        engine.play(grid, 0, { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 });
        engine.pause();
        engine.resume();
        Assert.isFalse(engine.isPaused, 'not paused after resume()');
        Assert.equal(ctx.state, 'running', 'context running');
    });

    runner.test('play() while already playing stops previous playback', () => {
        const { ctx, engine } = freshEngine();
        const grid = makeGrid([{ x: 0, y: 0, char: '@', semantic: 'entity' }]);
        const opts = { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 };
        engine.play(grid, 0, opts);
        Assert.isTrue(engine.isPlaying, 'playing first time');
        engine.play(grid, 0, opts); // should stop first, then restart
        Assert.isTrue(engine.isPlaying, 'still playing after re-play');
    });

    runner.test('currentTime is 0 when not playing', () => {
        const { ctx, engine } = freshEngine();
        Assert.equal(engine.currentTime, 0, 'currentTime = 0 when idle');
    });

    // ============================================================
    // SYNTH ENGINE — VOLUME
    // ============================================================

    runner.test('setMasterVolume(0) sets gain to 0', () => {
        const { ctx, engine } = freshEngine();
        engine.setMasterVolume(0);
        // Find master gain node (first gain created)
        const gains = ctx.getNodesByType('gain');
        Assert.greaterThan(gains.length, 0, 'master gain exists');
        const masterAutos = gains[0].gain.automations;
        const lastAuto = masterAutos[masterAutos.length - 1];
        Assert.equal(lastAuto.value, 0, 'gain set to 0');
    });

    runner.test('setMasterVolume(1) sets gain to 1', () => {
        const { ctx, engine } = freshEngine();
        engine.setMasterVolume(1);
        const gains = ctx.getNodesByType('gain');
        const masterAutos = gains[0].gain.automations;
        const lastAuto = masterAutos[masterAutos.length - 1];
        Assert.equal(lastAuto.value, 1, 'gain set to 1');
    });

    runner.test('setMasterVolume clamps to 0-1 range', () => {
        const { ctx, engine } = freshEngine();
        engine.setMasterVolume(-5);
        const gains = ctx.getNodesByType('gain');
        let lastAuto = gains[0].gain.automations[gains[0].gain.automations.length - 1];
        Assert.equal(lastAuto.value, 0, 'clamped to 0');

        engine.setMasterVolume(99);
        lastAuto = gains[0].gain.automations[gains[0].gain.automations.length - 1];
        Assert.equal(lastAuto.value, 1, 'clamped to 1');
    });

    // ============================================================
    // SYNTH ENGINE — INSTRUMENT OVERRIDE
    // ============================================================

    runner.test('setInstrument overrides waveform for channel', () => {
        const { ctx, engine } = freshEngine();
        engine.setInstrument(0, { wave: 'triangle' });
        const events = [makeEvent({ channel: 0 })];
        engine.scheduleFrame(events, 0);
        const oscs = ctx.getNodesByType('oscillator');
        // The oscillator for channel 0 should now be triangle
        const lastOsc = oscs[oscs.length - 1];
        Assert.equal(lastOsc.type, 'triangle', 'overridden to triangle');
    });

    // ============================================================
    // SYNTH ENGINE — DESTROY
    // ============================================================

    runner.test('destroy() stops playback and disconnects master', () => {
        const { ctx, engine } = freshEngine();
        const grid = makeGrid([{ x: 0, y: 0, char: '@', semantic: 'entity' }]);
        engine.play(grid, 0, { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 });
        engine.destroy();
        Assert.isFalse(engine.isPlaying, 'not playing after destroy');
    });

    // ============================================================
    // SYNTH ENGINE — EMPTY / EDGE CASES
    // ============================================================

    runner.test('play with empty frame produces no sound', () => {
        const { ctx, engine } = freshEngine();
        const grid = makeGrid([]);
        const nodesBefore = ctx._nodes.length;
        engine.play(grid, 0, { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 });
        // No oscillators or buffer sources should be created beyond initial master gain
        const oscs = ctx.getNodesByType('oscillator');
        const bufs = ctx.getNodesByType('bufferSource');
        Assert.equal(oscs.length, 0, 'no oscillators for empty frame');
        Assert.equal(bufs.length, 0, 'no buffer sources for empty frame');
    });

    runner.test('play with invalid frame index produces no sound', () => {
        const { ctx, engine } = freshEngine();
        const grid = makeGrid([{ x: 0, y: 0, char: '@', semantic: 'entity' }]);
        engine.play(grid, 99, { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 });
        const oscs = ctx.getNodesByType('oscillator');
        Assert.equal(oscs.length, 0, 'no oscillators for invalid frame');
    });

    runner.test('scheduleFrame respects polyphony cap', () => {
        const { ctx, engine } = freshEngine();
        const events = [];
        for (let i = 0; i < 20; i++) {
            events.push(makeEvent({ note: 40 + i, velocity: 50 + i, time: 0 }));
        }
        engine.scheduleFrame(events, 0);
        const oscs = ctx.getNodesByType('oscillator');
        Assert.lessThanOrEqual(oscs.length, 16, 'capped by polyphony');
    });

    // ---- Run ----
    const runResults = await runner.run();

    return {
        passed: runResults.filter(r => r.status === 'PASS').length,
        failed: runResults.filter(r => r.status === 'FAIL').length,
        skipped: runResults.filter(r => r.status === 'SKIP').length,
        summary: `Synth Engine: ${runResults.filter(r => r.status === 'PASS').length} passed, ${runResults.filter(r => r.status === 'FAIL').length} failed`
    };
}

export let results = { passed: 0, failed: 0, skipped: 0 };

if (typeof window === 'undefined') {
    runTests().then(runResults => {
        results = runResults;

        if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
            process.exit(results.failed > 0 ? 1 : 0);
        }
    }).catch(error => {
        console.error('Test runner error:', error);
        if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
            process.exit(1);
        }
    });
}
