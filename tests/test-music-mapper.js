/**
 * test-music-mapper.js — Test suite for Task 3.1
 * Node.js, zero DOM.
 */

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

    static deepEqual(actual, expected, message = '') {
        const actualStr = JSON.stringify(actual);
        const expectedStr = JSON.stringify(expected);
        if (actualStr !== expectedStr) {
            throw new Error(`FAIL: ${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
        }
    }

    static isTrue(value, message = '') {
        if (value !== true) {
            throw new Error(`FAIL: ${message}\n  Expected: true\n  Actual: ${value}`);
        }
    }

    static isNull(value, message = '') {
        if (value !== null) {
            throw new Error(`FAIL: ${message}\n  Expected: null\n  Actual: ${value}`);
        }
    }

    static isNotNull(value, message = '') {
        if (value === null) {
            throw new Error(`FAIL: ${message}\n  Expected: not null\n  Actual: null`);
        }
    }
}

class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
        this.results = [];
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('\n=== Music Mapper Test Suite ===\n');
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

async function runTests() {
    const mapper = await import('../src/consumers/music/music-mapper.js');

    const runner = new TestRunner();

    runner.test('Scale engine - definitions', () => {
        Assert.equal(Object.keys(mapper.SCALES).length, 10);
        Assert.equal(mapper.SCALES.major.length, 7);
        Assert.isTrue(mapper.midiToFrequency(69) === 440);
        Assert.isTrue(Math.abs(mapper.midiToFrequency(60) - 261.63) < 0.1);
        Assert.equal(mapper.midiToName(60), 'C4');
        Assert.equal(mapper.midiToName(69), 'A4');
    });

    runner.test('rowToNote - chromatic mapping', () => {
        // 12 rows (0-11). Row 0 is highest pitch.
        let note = mapper.rowToNote(0, 12, 'chromatic', 60);
        Assert.equal(note, 71); // 60 + 11

        // Bottom row = lowest pitch
        note = mapper.rowToNote(11, 12, 'chromatic', 60);
        Assert.equal(note, 60);
    });

    runner.test('rowToNote - scale quantization', () => {
        // 7 rows, major scale. Top row (0) = 7th degree (index 6 = 11 semitones)
        let note = mapper.rowToNote(0, 7, 'major', 60);
        Assert.equal(note, 71); // 60 + 11

        // Octave wrapping
        note = mapper.rowToNote(0, 14, 'major', 60);
        Assert.equal(note, 83); // 60 + 12 + 11
    });

    runner.test('columnToTime', () => {
        Assert.equal(mapper.columnToTime(0, 120, 4), 0);
        Assert.equal(mapper.columnToTime(1, 120, 4), 0.125); // 1 sixteenth
        Assert.equal(mapper.columnToTime(16, 120, 4), 2.0); // 1 bar (16 sixteenths)
    });

    runner.test('colorToChannel', () => {
        Assert.equal(mapper.colorToChannel('#ff0000'), 0);
        Assert.equal(mapper.colorToChannel('#00ff00'), 1);
        Assert.equal(mapper.colorToChannel('#UNKNOWN'), 0);
        Assert.equal(mapper.colorToChannel(null), 0);
    });

    runner.test('cellToNoteEvent - empty or void', () => {
        Assert.isNull(mapper.cellToNoteEvent(null, 10, 10, {}));
        Assert.isNull(mapper.cellToNoteEvent({ semantic: 'void' }, 10, 10, {}));
    });

    runner.test('cellToNoteEvent - valid cell', () => {
        const cell = {
            x: 1, y: 11, char: '@', semantic: 'entity', density: 0.5, color: '#ff0000',
            channel: { audio: { duration: 2 } } // override duration
        };
        const opts = { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 };

        const event = mapper.cellToNoteEvent(cell, 16, 12, opts);
        Assert.isNotNull(event);
        Assert.equal(event.note, 60); // y=11 is bottom row -> note 60
        Assert.equal(event.time, 0.125);
        Assert.equal(event.duration, 0.25); // 2 sixteenths
        Assert.equal(event.channel, 0); // red -> 0
        Assert.equal(event.velocity, 64); // 0.5 * 127
    });

    runner.test('frameToNoteEvents - basic sorting', () => {
        const grid = {
            canvas: { width: 4, height: 4 },
            frames: [
                {
                    cells: [
                        { x: 1, y: 1, char: '@', semantic: 'entity' },
                        { x: 1, y: 0, char: '@', semantic: 'entity' }, // Same time, higher pitch
                        { x: 0, y: 3, char: '@', semantic: 'entity' }  // Earlier time
                    ]
                }
            ]
        };

        const opts = { bpm: 120, subdivision: 1, scale: 'chromatic', rootNote: 60 };
        const events = mapper.frameToNoteEvents(grid, 0, opts);

        Assert.equal(events.length, 3);
        Assert.equal(events[0].time, 0); // col 0
        Assert.equal(events[0].note, 60); // row 3

        // Identical times should sort by pitch
        Assert.equal(events[1].time, 0.5); // col 1, 1 bpm/sub = 0.5s
        Assert.equal(events[1].note, 62); // row 1

        Assert.equal(events[2].time, 0.5); // col 1
        Assert.equal(events[2].note, 63); // row 0
    });

    runner.test('Test 9: frameToNoteEvents - empty frame', () => {
        const grid = {
            canvas: { width: 4, height: 4 },
            frames: [{ cells: [] }]
        };
        const opts = { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 };
        const events = mapper.frameToNoteEvents(grid, 0, opts);
        Assert.equal(events.length, 0);
    });

    runner.test('Test 10: frameToNoteEvents - invalid frame index', () => {
        const grid = {
            canvas: { width: 4, height: 4 },
            frames: [{ cells: [{ x: 0, y: 0, char: '@', semantic: 'entity' }] }]
        };
        const opts = { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 };
        Assert.equal(mapper.frameToNoteEvents(grid, 5, opts).length, 0);
        Assert.equal(mapper.frameToNoteEvents(grid, -1, opts).length, 0);
    });

    runner.test('Test 11: density fallback when channel.audio is missing', () => {
        const cell1 = { x: 0, y: 0, semantic: 'entity', density: 0.8 };
        const cell2 = { x: 0, y: 0, semantic: 'entity', density: 0 };
        const opts = { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 };

        const event1 = mapper.cellToNoteEvent(cell1, 10, 10, opts);
        Assert.equal(event1.velocity, 102); // Math.round(0.8 * 127)

        const event2 = mapper.cellToNoteEvent(cell2, 10, 10, opts);
        Assert.equal(event2.velocity, 0);
    });

    runner.test('Test 12: Unknown scale falls back to chromatic', () => {
        const note = mapper.rowToNote(0, 12, 'nonexistent_scale', 60);
        Assert.equal(note, 71); // 60 + 11
    });

    runner.test('Test 13: MIDI note clamping at boundaries', () => {
        const cellHigh = { x: 0, y: 0, semantic: 'entity', density: 0.5 };
        const cellLow = { x: 0, y: 199, semantic: 'entity', density: 0.5 };
        const optsHigh = { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 60 };
        const optsLow = { bpm: 120, subdivision: 4, scale: 'chromatic', rootNote: 0 };

        const eventHigh = mapper.cellToNoteEvent(cellHigh, 10, 200, optsHigh);
        Assert.equal(eventHigh.note, 127);

        const eventLow = mapper.cellToNoteEvent(cellLow, 10, 200, optsLow);
        Assert.equal(eventLow.note, 0);
    });

    runner.test('Test 14: Pentatonic scale row mapping', () => {
        Assert.equal(mapper.rowToNote(4, 5, 'pentatonic', 60), 60);
        Assert.equal(mapper.rowToNote(3, 5, 'pentatonic', 60), 62);
        Assert.equal(mapper.rowToNote(0, 5, 'pentatonic', 60), 69);

        Assert.equal(mapper.rowToNote(0, 10, 'pentatonic', 60), 81); // 60 + 12 + 9 = 81
    });

    runner.test('Test 15: Default opts - cellToNoteEvent with empty opts', () => {
        const cell = { x: 0, y: 0, char: '@', semantic: 'solid', density: 0.5 };
        const event = mapper.cellToNoteEvent(cell, 10, 10, {});

        Assert.isNotNull(event);
        Assert.isTrue(Number.isFinite(event.note), 'note should be finite');
        Assert.isTrue(Number.isFinite(event.time), 'time should be finite');
        Assert.isTrue(Number.isFinite(event.velocity), 'velocity should be finite');
        Assert.isTrue(Number.isFinite(event.duration), 'duration should be finite');
    });

    const runResults = await runner.run();

    return {
        passed: runResults.filter(r => r.status === 'PASS').length,
        failed: runResults.filter(r => r.status === 'FAIL').length,
        skipped: runResults.filter(r => r.status === 'SKIP').length,
        summary: `Music Mapper: ${runResults.filter(r => r.status === 'PASS').length} passed, ${runResults.filter(r => r.status === 'FAIL').length} failed`
    };
}

export let results = { passed: 0, failed: 0, skipped: 0 };

if (typeof window === 'undefined') {
    // We're in Node
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
