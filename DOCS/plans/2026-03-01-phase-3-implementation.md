# TASK: Fix music-mapper.js bugs + fill test gaps

You are working on the GRID project. Task 3.1 (music-mapper.js) has been code-reviewed. There are 2 bugs to fix and 7 missing tests to add. Do ALL items below. Do not skip any.

---

## BUG FIX 1: Clamp MIDI note to 0-127

**File**: `src/consumers/music/music-mapper.js`
**Function**: `cellToNoteEvent`
**Problem**: `rowToNote` can return values above 127 (e.g. a 200-row chromatic grid with root 60 → note 259). MIDI notes must be 0-127. The synth engine will receive invalid frequencies.

**Fix**: Clamp the note value:
```js
note: Math.min(127, Math.max(0, rowToNote(cell.y, gridHeight, musicOpts.scale, musicOpts.rootNote))),
```

Also clamp velocity for safety (density could theoretically be > 1 from a bad import):
```js
velocity: Math.min(127, Math.max(0, cell.channel?.audio?.velocity ?? Math.round((cell.density ?? 0.5) * 127))),
```

---

## BUG FIX 2: Default opts in cellToNoteEvent

**File**: `src/consumers/music/music-mapper.js`
**Function**: `cellToNoteEvent`
**Problem**: If `musicOpts` has missing fields (e.g. `{}`), then `bpm`, `subdivision`, `scale`, `rootNote` are all `undefined`. This produces `NaN` for time and note — silent data corruption, no error thrown.

**Fix**: Destructure with defaults at the top of `cellToNoteEvent`:
```js
export function cellToNoteEvent(cell, gridWidth, gridHeight, musicOpts) {
  if (!cell || cell.semantic === 'void') return null;
  
  const { bpm = 120, subdivision = 4, scale = 'chromatic', rootNote = 60 } = musicOpts;
  
  return {
    note:     Math.min(127, Math.max(0, rowToNote(cell.y, gridHeight, scale, rootNote))),
    velocity: Math.min(127, Math.max(0, cell.channel?.audio?.velocity ?? Math.round((cell.density ?? 0.5) * 127))),
    time:     columnToTime(cell.x, bpm, subdivision),
    duration: (cell.channel?.audio?.duration ?? 1) * (60 / bpm / subdivision),
    channel:  colorToChannel(cell.color),
    char:     cell.char,
  };
}
```

Do NOT change `frameToNoteEvents` — it passes opts through, so cellToNoteEvent's defaults handle it.

---

## MISSING TESTS — Add to `tests/test-music-mapper.js`

Add these 7 tests AFTER the existing 8. Use the same `runner.test()` pattern. Each test is independent.

### Test 9: frameToNoteEvents — empty frame
```
- Create a grid with one frame that has an empty cells array: `cells: []`
- Call frameToNoteEvents(grid, 0, opts)
- Assert result is an array with length 0
```

### Test 10: frameToNoteEvents — invalid frame index
```
- Create a grid with 1 frame
- Call frameToNoteEvents(grid, 5, opts)  ← out of bounds
- Assert result is an array with length 0
- Also test frameToNoteEvents(grid, -1, opts) → length 0
```

### Test 11: density fallback when channel.audio is missing
```
- Create a cell with density: 0.8, NO channel property at all
- Call cellToNoteEvent with valid opts
- Assert velocity === Math.round(0.8 * 127) === 102
- Create another cell with density: 0, no channel
- Assert velocity === 0
```

### Test 12: Unknown scale falls back to chromatic
```
- Call rowToNote(0, 12, 'nonexistent_scale', 60)
- Assert result === 71 (same as chromatic: 60 + 11)
- This tests the `SCALES[scale] || SCALES.chromatic` fallback
```

### Test 13: MIDI note clamping at boundaries
```
- Create a cell at y=0 in a 200-row grid, chromatic, rootNote 60
- Call cellToNoteEvent → note should be 127 (clamped), NOT 259
- Create a cell at y=199 in a 200-row grid, chromatic, rootNote 0
- Call cellToNoteEvent → note should be 0 (clamped), NOT negative
```

### Test 14: Pentatonic scale row mapping
```
- pentatonic = [0,2,4,7,9], 5 degrees per octave
- 5-row grid, root 60:
  - row 4 (bottom, invertedRow=0) → 60 + 0 = 60
  - row 3 (invertedRow=1) → 60 + 2 = 62
  - row 0 (top, invertedRow=4) → 60 + 9 = 69
- 10-row grid tests octave wrap:
  - row 0 (invertedRow=9) → 60 + 12 + 9 = 81 (octave 1, degree 4)
```

### Test 15: Default opts — cellToNoteEvent with empty opts
```
- Create a cell: { x: 0, y: 0, char: '@', semantic: 'solid', density: 0.5 }
- Call cellToNoteEvent(cell, 10, 10, {})  ← empty opts
- Assert event is NOT null
- Assert event.note is a finite number (not NaN)
- Assert event.time is a finite number (not NaN)  
- Assert event.velocity is a finite number (not NaN)
- Assert event.duration is a finite number (not NaN)
- Use: Assert.isTrue(Number.isFinite(event.note), 'note should be finite')
```

---

## VERIFICATION

After making all changes, run:
```bash
node tests/test-music-mapper.js
```

Expected output: 15 tests, 0 failures.

Then run the full suite:
```bash
node tests/run-all.js
```

All existing suites must still pass. Do not modify any test files other than `test-music-mapper.js`. Do not modify any source files other than `music-mapper.js`.

---

## CHECKLIST — Confirm each item before declaring done

- [ ] cellToNoteEvent clamps note to 0-127
- [ ] cellToNoteEvent clamps velocity to 0-127
- [ ] cellToNoteEvent defaults: bpm=120, subdivision=4, scale='chromatic', rootNote=60
- [ ] Test 9 added and passing (empty frame)
- [ ] Test 10 added and passing (invalid frame index)
- [ ] Test 11 added and passing (density fallback)
- [ ] Test 12 added and passing (unknown scale fallback)
- [ ] Test 13 added and passing (MIDI clamp)
- [ ] Test 14 added and passing (pentatonic mapping)
- [ ] Test 15 added and passing (default opts / no NaN)
- [ ] `node tests/test-music-mapper.js` → 15 passed, 0 failed
- [ ] `node tests/run-all.js` → all suites green
- [ ] No other files modified

UPDATE DOCS\ACTION-PLAN.md with the changes.

--

## HANDOVER: Task 3.1 — Grid-to-Music Mapping Engine

### Delivered
- `src/consumers/music/music-mapper.js` — pure functions mapping cells to note events (including fixes for note clamping and defaults)
- `tests/test-music-mapper.js` — 15 test cases passing cleanly

### Verification
- Tested all 10 scales.
- Chromatic/quantized row mapping functions seamlessly.
- Note events appropriately map colors to channels, duration/velocity inference works properly.
- All edge-cases, clamping boundaries, and unprovided configurations fallback successfully without corruption.
- Fully integrated into `tests/run-all.js` making 15 added music mapper tests pass in node environment zero DOM.