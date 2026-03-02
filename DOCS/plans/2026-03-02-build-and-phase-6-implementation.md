# Build System Fix + Phase 6 Export Pipeline — Implementation Plan

**Goal:** Stabilize the build system so `dist/index.html` is generated (never hand-edited), then ship 5 export formats (SVG, PNG, MIDI, glTF, MP4) behind a tabbed Export modal.

**Architecture:** Concatenation build (`node build.js`) reads `src/shell/` templates + `src/` modules in dependency order, strips ESM, deduplicates GridCore symbols, writes a single self-contained HTML file. Each exporter is a standalone `src/exporters/*.js` module (pure where possible, browser-only where required), tested in Node with mocks. The export UI replaces the current JSON-only modal with a tabbed panel.

**Tech Stack:** Vanilla JS (zero npm deps), Node `fs` for build, Web Audio, WebCodecs, THREE.js CDN, mp4box.js CDN, Standard MIDI File binary format.

---

## Current State (verified 2026-03-02)

| Item | Status | Detail |
|------|--------|--------|
| `build.js` | Working | 165 lines, ESM strip + GridCore dedup, 13/13 modules |
| `src/shell/` | Extracted | head.html (19), style.css (548), body.html (299), app.js (917) |
| Tests | 661/0/1 | All passing in Node |
| Dedup | Working | 3 `const {...} = GridCore` lines stripped at build time |
| `dist/index.html` | Generated | 6218 lines, 198.7 KB |
| Browser verify | **TESTED** | Build output confirmed in browser, many errors, not working |

### Known Issues

1. **`midi-output.js` missing from MODULES** — build.js jumps from `synth-engine.js` to `heightmap.js`, skipping midi-output. The module exists at `src/consumers/music/midi-output.js` but isn't inlined.
2. **Browser runtime not verified** — Node tests pass, but the ACTION-PLAN documents `inferSemantic already declared` and `showNewProjectModal not defined` errors from earlier build attempts. Dedup logic was added to fix these, but no browser confirmation recorded.
3. **`dist/index.html` in git** — currently tracked and modified. Once the build is trusted, this file should be `.gitignore`'d (or committed as a generated artifact with a clear "DO NOT EDIT" header).

---

## Task Dependency Graph

```
B.0  Verify build output in browser (gate)
 │
 ├─── B.1  Fix midi-output.js in MODULES list
 │
 └─── BUILD GATE ─────────────────────────────────
                                                   │
      6.1  SVG exporter (pure, Node-testable)      │
      6.2  MIDI file exporter (pure, Node-testable)│── can parallel
      6.3  PNG export (10 lines in app.js)         │
                                                   │
      6.4  glTF exporter (needs THREE.js CDN)      │── sequential
      6.5  Video exporter (WebCodecs + mp4box CDN) │── sequential
                                                   │
      6.UI Export modal tabs ──────────────────────┘
```

**Recommended order:** B.0 → B.1 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.UI

---

## Task B.0 — Verify Build Output (Gate)

**Files:**
- Read: `dist/index.html` (generated)
- Compare against: `git show HEAD:dist/index.html` (last committed hand-crafted version)

**Step 1: Run the build**

```bash
cd E:\co\GRID
node build.js
```
Expected: `✓ dist/index.html — ~6218 lines, ~198 KB`

**Step 2: Serve and test in browser**

```bash
npx serve dist -p 3000
```
Open `http://localhost:3000`. Verify:
- Grid renders with character palette
- Click to paint cells
- Generator buttons work (Random, Gradient, Maze, etc.)
- Play button works (frames mode)
- Music mode toggle + play works
- 3D button appears (if THREE.js CDN loads)
- Ctrl+S triggers save cascade
- Export button opens JSON modal
- Projects button shows OPFS browser

**Step 3: Check browser console for errors**

Open DevTools → Console. There should be zero `SyntaxError`, `ReferenceError`, or `TypeError` on load.

**Exit:** App works identically to the last hand-crafted version. Zero console errors.

**If errors found:** Document them and fix before proceeding. The dedup logic handles `const {...} = GridCore` but there may be other patterns.

---

## Task B.1 — Add midi-output.js to Build

**Files:**
- Modify: `build.js:28-31`

**Step 1: Add the missing module**

In `build.js`, after `'src/consumers/music/synth-engine.js'`, add:

```javascript
  'src/consumers/music/midi-output.js',
```

The MODULES array (lines 18-37) should read:

```javascript
const MODULES = [
  'src/core/grid-core.js',
  'src/renderers/canvas-renderer.js',
  'src/input/key-bindings.js',
  'src/input/input-system.js',
  'src/generators/generators.js',
  'src/importers/image-importer.js',
  'src/persistence/serializer.js',
  'src/persistence/opfs-store.js',
  'src/persistence/fs-access.js',
  'src/consumers/music/music-mapper.js',
  'src/consumers/music/synth-engine.js',
  'src/consumers/music/midi-output.js',       // ← was missing
  'src/consumers/spatial/heightmap.js',
  'src/consumers/spatial/scene-builder.js',
  // Phase 6 exporters — uncomment as they land:
  // 'src/exporters/svg-exporter.js',
  // ...
];
```

**Step 2: Rebuild and verify**

```bash
node build.js
```
Expected: `Modules inlined: 14/14` (was 13/13).

**Step 3: Run tests**

```bash
node tests/run-all.js
```
Expected: 661 passed, 0 failed.

**Step 4: Commit**

```bash
git add build.js
git commit -m "fix(build): add midi-output.js to MODULES list"
```

---

## Task 6.1 — SVG Exporter

**Files:**
- Create: `src/exporters/svg-exporter.js`
- Create: `tests/test-svg-exporter.js`
- Modify: `build.js` (uncomment SVG line)
- Modify: `tests/run-all.js` (add suite)

**What it does:** Takes a grid + frame index → produces a complete `<svg>...</svg>` string. Each non-empty cell becomes a `<text>` element positioned on a character grid. Pure string generation, zero DOM.

### Step 1: Write the test file

```javascript
// tests/test-svg-exporter.js
/**
 * SVG Exporter tests — Task 6.1
 * Pure Node, zero DOM.
 */

import { gridToSvg, svgExportDefaults } from '../src/exporters/svg-exporter.js';
import GridCore from '../src/core/grid-core.js';

const { createGrid, setCell } = GridCore;

let passed = 0, failed = 0;
const results = [];

function assert(cond, msg) {
  if (cond) { passed++; results.push({ status: 'pass', name: msg }); }
  else { failed++; results.push({ status: 'fail', name: msg }); console.error('  FAIL:', msg); }
}

// ── Helpers ───────────────────────────────────────────────
function makeGrid(w, h) {
  return createGrid(w, h, '@#. ', '#00ff88', { name: 'test' });
}

// ── Tests ─────────────────────────────────────────────────
console.log('\n🧪 SVG Exporter (Task 6.1)\n' + '='.repeat(50));

// --- defaults ---
{
  const d = svgExportDefaults();
  assert(d.fontSize === 14, 'default fontSize is 14');
  assert(d.fontFamily.includes('monospace'), 'default fontFamily includes monospace');
  assert(d.background === '#0a0a1a', 'default background is dark');
  assert(d.includeGrid === false, 'grid lines off by default');
  assert(d.frameIndex === 0, 'default frame is 0');
}

// --- empty grid ---
{
  const g = makeGrid(3, 2);
  const svg = gridToSvg(g);
  assert(svg.startsWith('<svg'), 'output starts with <svg');
  assert(svg.endsWith('</svg>'), 'output ends with </svg>');
  assert(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'has SVG namespace');
  assert(!svg.includes('<text'), 'empty grid has no <text> elements');
}

// --- single cell ---
{
  const g = makeGrid(5, 5);
  setCell(g, 0, 0, 0, { char: '@', color: '#ff0000' });
  const svg = gridToSvg(g);
  assert(svg.includes('<text'), 'has <text> element');
  assert(svg.includes('fill="#ff0000"'), 'cell color as fill');
  assert(svg.includes('>@</text>'), 'cell char as text content');
}

// --- viewBox dimensions ---
{
  const g = makeGrid(10, 8);
  const svg = gridToSvg(g, { fontSize: 16 });
  // viewBox should be "0 0 (10*16*0.6) (8*16)" = "0 0 96 128"
  // charWidth = fontSize * 0.6
  assert(svg.includes('viewBox="0 0 96 128"'), 'viewBox matches grid dimensions x fontSize');
}

// --- custom background ---
{
  const g = makeGrid(2, 2);
  const svg = gridToSvg(g, { background: '#ffffff' });
  assert(svg.includes('fill="#ffffff"'), 'custom background color in rect');
}

// --- transparent background ---
{
  const g = makeGrid(2, 2);
  const svg = gridToSvg(g, { background: 'transparent' });
  assert(!svg.includes('<rect'), 'no background rect when transparent');
}

// --- grid lines ---
{
  const g = makeGrid(3, 3);
  const svg = gridToSvg(g, { includeGrid: true });
  assert(svg.includes('<line'), 'grid lines rendered as <line> elements');
}

// --- no grid lines by default ---
{
  const g = makeGrid(3, 3);
  const svg = gridToSvg(g);
  assert(!svg.includes('<line'), 'no grid lines by default');
}

// --- multiple cells preserve order ---
{
  const g = makeGrid(4, 4);
  setCell(g, 0, 0, 0, { char: 'A', color: '#ff0000' });
  setCell(g, 0, 1, 0, { char: 'B', color: '#00ff00' });
  setCell(g, 0, 2, 1, { char: 'C', color: '#0000ff' });
  const svg = gridToSvg(g);
  const aIdx = svg.indexOf('>A</text>');
  const bIdx = svg.indexOf('>B</text>');
  const cIdx = svg.indexOf('>C</text>');
  assert(aIdx < bIdx && bIdx < cIdx, 'cells rendered in row-major order');
}

// --- frame index selects correct frame ---
{
  const g = makeGrid(3, 3);
  setCell(g, 0, 0, 0, { char: 'X', color: '#111111' });
  // Add a second frame
  const f1 = { id: GridCore.generateId(), cells: [{ x: 0, y: 0, char: 'Y', color: '#222222' }] };
  g.frames.push(f1);
  const svg0 = gridToSvg(g, { frameIndex: 0 });
  const svg1 = gridToSvg(g, { frameIndex: 1 });
  assert(svg0.includes('>X</text>'), 'frame 0 has X');
  assert(svg1.includes('>Y</text>'), 'frame 1 has Y');
  assert(!svg0.includes('>Y</text>'), 'frame 0 does not have Y');
}

// --- special chars are XML-escaped ---
{
  const g = makeGrid(3, 3);
  setCell(g, 0, 0, 0, { char: '<', color: '#aaaaaa' });
  setCell(g, 0, 1, 0, { char: '&', color: '#bbbbbb' });
  const svg = gridToSvg(g);
  assert(svg.includes('&lt;'), '< is escaped to &lt;');
  assert(svg.includes('&amp;'), '& is escaped to &amp;');
}

// --- font family option ---
{
  const g = makeGrid(2, 2);
  const svg = gridToSvg(g, { fontFamily: 'IBM Plex Mono' });
  assert(svg.includes('font-family="IBM Plex Mono"'), 'custom font family applied');
}

// --- output is valid standalone SVG ---
{
  const g = makeGrid(2, 2);
  setCell(g, 0, 0, 0, { char: '#', color: '#00ff88' });
  const svg = gridToSvg(g);
  assert(svg.includes('xmlns'), 'has xmlns');
  assert(svg.split('<text').length === 2, 'exactly one <text> element for one cell');
}

// ── Summary ───────────────────────────────────────────────
console.log(`\ntest-svg-exporter.js: ${passed} passed, ${failed} failed\n`);
export { results, passed, failed };
```

**Step 2: Run test — verify it fails**

```bash
node tests/test-svg-exporter.js
```
Expected: `Error: Cannot find module '../src/exporters/svg-exporter.js'`

**Step 3: Create the exporter**

Create `src/exporters/svg-exporter.js`:

```javascript
/**
 * svg-exporter.js — Task 6.1: Grid → SVG
 *
 * Pure string generation. Zero DOM. Works in Node and browser.
 * Each non-empty cell → <text> element. Grid lines optional.
 *
 * @module svg-exporter
 */

const CHAR_WIDTH_RATIO = 0.6;  // monospace char width ≈ 0.6 × fontSize

function svgExportDefaults() {
  return {
    fontSize: 14,
    fontFamily: 'Courier New, monospace',
    background: '#0a0a1a',
    includeGrid: false,
    frameIndex: 0,
  };
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert a .grid frame to an SVG string.
 *
 * @param {Object} grid - A .grid object
 * @param {Object} [opts] - Export options (see svgExportDefaults)
 * @returns {string} Complete <svg>...</svg> markup
 */
function gridToSvg(grid, opts = {}) {
  const o = { ...svgExportDefaults(), ...opts };
  const { fontSize, fontFamily, background, includeGrid, frameIndex } = o;

  const cols = grid.canvas.width;
  const rows = grid.canvas.height;
  const charW = fontSize * CHAR_WIDTH_RATIO;
  const charH = fontSize;
  const w = cols * charW;
  const h = rows * charH;

  const parts = [];

  // SVG open tag
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
    `width="${w}" height="${h}" font-family="${fontFamily}" font-size="${fontSize}">`
  );

  // Background rect
  if (background !== 'transparent') {
    parts.push(`<rect width="${w}" height="${h}" fill="${background}"/>`);
  }

  // Grid lines
  if (includeGrid) {
    const lineColor = '#333';
    for (let x = 0; x <= cols; x++) {
      parts.push(`<line x1="${x * charW}" y1="0" x2="${x * charW}" y2="${h}" stroke="${lineColor}" stroke-width="0.5"/>`);
    }
    for (let y = 0; y <= rows; y++) {
      parts.push(`<line x1="0" y1="${y * charH}" x2="${w}" y2="${y * charH}" stroke="${lineColor}" stroke-width="0.5"/>`);
    }
  }

  // Cells — read from the selected frame
  const frame = grid.frames[frameIndex] || grid.frames[0];
  if (frame && frame.cells) {
    // Sort cells row-major for deterministic output
    const sorted = [...frame.cells].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const cell of sorted) {
      const cx = cell.x * charW + charW * 0.5;
      const cy = cell.y * charH + charH * 0.85;  // baseline offset
      const fill = cell.color || grid.canvas.defaultColor || '#ffffff';
      parts.push(
        `<text x="${cx}" y="${cy}" fill="${fill}" text-anchor="middle">` +
        `${escapeXml(cell.char)}</text>`
      );
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// Universal export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { gridToSvg, svgExportDefaults };
}
if (typeof window !== 'undefined') {
  window.SvgExporter = { gridToSvg, svgExportDefaults };
}
export { gridToSvg, svgExportDefaults };
```

**Step 4: Run test — verify it passes**

```bash
node tests/test-svg-exporter.js
```
Expected: all tests pass.

**Step 5: Wire into build and test runner**

In `build.js`, uncomment the SVG exporter line:
```javascript
  'src/exporters/svg-exporter.js',
```

In `tests/run-all.js`, add:
```javascript
import('./test-svg-exporter.js'),
```

**Step 6: Full build + test**

```bash
node build.js && node tests/run-all.js
```
Expected: 14+ modules inlined, all tests pass.

**Step 7: Commit**

```bash
git add src/exporters/svg-exporter.js tests/test-svg-exporter.js build.js tests/run-all.js
git commit -m "feat(export): add SVG exporter — grid frame to vector SVG"
```

---

## Task 6.2 — MIDI File Exporter

**Files:**
- Create: `src/exporters/midi-exporter.js`
- Create: `tests/test-midi-exporter.js`
- Modify: `build.js` (uncomment MIDI line)
- Modify: `tests/run-all.js` (add suite)

**What it does:** Takes `NoteEvent[]` (from music-mapper) + BPM → produces a `Uint8Array` containing a Standard MIDI File (Type 0, single track). Pure binary buffer generation, zero DOM, zero Web MIDI API.

### Step 1: Write the test file

```javascript
// tests/test-midi-exporter.js
/**
 * MIDI File Exporter tests — Task 6.2
 * Pure Node, zero DOM. Tests SMF binary generation.
 */

import { noteEventsToMidi, midiExportDefaults } from '../src/exporters/midi-exporter.js';

let passed = 0, failed = 0;
const results = [];

function assert(cond, msg) {
  if (cond) { passed++; results.push({ status: 'pass', name: msg }); }
  else { failed++; results.push({ status: 'fail', name: msg }); console.error('  FAIL:', msg); }
}

function assertEq(a, b, msg) {
  assert(a === b, `${msg} (got ${a}, expected ${b})`);
}

console.log('\n🧪 MIDI File Exporter (Task 6.2)\n' + '='.repeat(50));

// ── Helpers ────────────────────────────────────────
function makeEvent(col, note, velocity = 100, duration = 1, channel = 0) {
  return { column: col, note, velocity, duration, channel };
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

// ── multiple notes sorted by column ────────────────
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
  for (let i = 14; i < buf.length; i++) {
    if ((buf[i] & 0xF0) === 0x90 && buf[i + 2] > 0) noteOns++;
    if ((buf[i] & 0xF0) === 0x80) noteOffs++;
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
export { results, passed, failed };
```

**Step 2: Run test — verify it fails**

```bash
node tests/test-midi-exporter.js
```
Expected: module not found error.

**Step 3: Implement the exporter**

Create `src/exporters/midi-exporter.js`:

```javascript
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
 * @param {Array} events - [{column, note, velocity, duration, channel}]
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

  // Sort events by column, then by note (for deterministic output)
  const sorted = [...events].sort((a, b) => a.column - b.column || a.note - b.note);

  // Convert note events to MIDI messages with absolute tick positions
  const midiMsgs = [];
  for (const ev of sorted) {
    const note = clamp(Math.round(ev.note), 0, 127);
    const vel = clamp(Math.round(ev.velocity), 1, 127);
    const ch = clamp(ev.channel || 0, 0, 15);
    const startTick = ev.column * ticksPerBeat;
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
```

**Step 4: Run test — verify it passes**

```bash
node tests/test-midi-exporter.js
```
Expected: all tests pass.

**Step 5: Wire into build and test runner**

In `build.js`, uncomment the MIDI exporter line. In `tests/run-all.js`, add the import.

**Step 6: Full build + test**

```bash
node build.js && node tests/run-all.js
```

**Step 7: Commit**

```bash
git add src/exporters/midi-exporter.js tests/test-midi-exporter.js build.js tests/run-all.js
git commit -m "feat(export): add MIDI file exporter — NoteEvent[] to .mid binary"
```

---

## Task 6.3 — PNG Export (inline)

**Files:**
- Modify: `src/shell/app.js` (add ~10 lines)

**What it does:** Downloads the current canvas as a PNG file. No separate module — it's `canvas.toBlob()` + download link.

### Step 1: Add the function to app.js

After the `downloadJson()` function in `src/shell/app.js`, add:

```javascript
    function exportPng() {
      const canvas = document.getElementById('gridCanvas');
      if (!canvas) return;
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (grid.meta.name || 'grid').replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';
        a.click();
        URL.revokeObjectURL(url);
        setStatus('PNG downloaded');
      }, 'image/png');
    }
```

**Step 2: Rebuild**

```bash
node build.js
```

**Step 3: Commit**

```bash
git add src/shell/app.js
git commit -m "feat(export): add PNG export — canvas.toBlob download"
```

---

## Task 6.4 — glTF Exporter

**Files:**
- Create: `src/exporters/gltf-exporter.js`
- Create: `tests/test-gltf-exporter.js`
- Modify: `src/shell/head.html` (add GLTFExporter CDN)
- Modify: `build.js` (uncomment glTF line)
- Modify: `tests/run-all.js`

**What it does:** Wraps THREE.GLTFExporter to export the current 3D scene (from scene-builder.js) as a `.glb` or `.gltf` file. Browser-only (THREE.js required), but the wrapper logic is testable with mocks.

### Step 1: Write the test file

```javascript
// tests/test-gltf-exporter.js
/**
 * glTF Exporter tests — Task 6.4
 * Uses mock THREE objects. Tests wrapper logic, not THREE internals.
 */

let passed = 0, failed = 0;
const results = [];

function assert(cond, msg) {
  if (cond) { passed++; results.push({ status: 'pass', name: msg }); }
  else { failed++; results.push({ status: 'fail', name: msg }); console.error('  FAIL:', msg); }
}

// ── Mock THREE.GLTFExporter ──────────────────────
class MockGLTFExporter {
  parse(scene, onDone, onError, opts) {
    if (scene._fail) { onError(new Error('mock fail')); return; }
    if (opts && opts.binary) {
      onDone(new ArrayBuffer(8));  // mock .glb
    } else {
      onDone({ asset: { version: '2.0' } });  // mock .gltf JSON
    }
  }
}

// Setup global mocks
global.window = global.window || {};
global.THREE = global.THREE || {};
global.THREE.GLTFExporter = MockGLTFExporter;

import { sceneToGltf, isGltfExportAvailable, gltfExportDefaults } from '../src/exporters/gltf-exporter.js';

console.log('\n🧪 glTF Exporter (Task 6.4)\n' + '='.repeat(50));

// ── availability ──────────────────────────────────
{
  assert(isGltfExportAvailable() === true, 'available when THREE.GLTFExporter exists');
}

// ── defaults ──────────────────────────────────────
{
  const d = gltfExportDefaults();
  assert(d.binary === true, 'default binary = true (.glb)');
  assert(d.onlyVisible === true, 'default onlyVisible = true');
}

// ── binary export → ArrayBuffer ───────────────────
{
  const scene = { type: 'Scene' };
  const result = await sceneToGltf(scene, { binary: true });
  assert(result.ok === true, 'binary export succeeds');
  assert(result.data instanceof ArrayBuffer, 'binary export returns ArrayBuffer');
}

// ── JSON export → object ──────────────────────────
{
  const scene = { type: 'Scene' };
  const result = await sceneToGltf(scene, { binary: false });
  assert(result.ok === true, 'JSON export succeeds');
  assert(typeof result.data === 'object', 'JSON export returns object');
  assert(result.data.asset.version === '2.0', 'glTF version 2.0');
}

// ── error handling ────────────────────────────────
{
  const scene = { type: 'Scene', _fail: true };
  const result = await sceneToGltf(scene);
  assert(result.ok === false, 'failed export returns ok:false');
  assert(typeof result.error === 'string', 'error message present');
}

// ── unavailable when no GLTFExporter ──────────────
{
  const saved = global.THREE.GLTFExporter;
  delete global.THREE.GLTFExporter;
  // Re-check availability (function reads global at call time)
  // Note: isGltfExportAvailable checks window.THREE or global.THREE
  assert(isGltfExportAvailable() === false, 'unavailable when GLTFExporter missing');
  global.THREE.GLTFExporter = saved;
}

console.log(`\ntest-gltf-exporter.js: ${passed} passed, ${failed} failed\n`);
export { results, passed, failed };
```

**Step 2: Create the exporter**

Create `src/exporters/gltf-exporter.js`:

```javascript
/**
 * gltf-exporter.js — Task 6.4: THREE.Scene → glTF/glb
 *
 * Thin wrapper around THREE.GLTFExporter.
 * Browser-only (requires THREE.js CDN). Promisified parse.
 *
 * @module gltf-exporter
 */

function gltfExportDefaults() {
  return { binary: true, onlyVisible: true };
}

function _getGLTFExporter() {
  if (typeof THREE !== 'undefined' && THREE.GLTFExporter) return THREE.GLTFExporter;
  if (typeof window !== 'undefined' && window.THREE && window.THREE.GLTFExporter) return window.THREE.GLTFExporter;
  if (typeof global !== 'undefined' && global.THREE && global.THREE.GLTFExporter) return global.THREE.GLTFExporter;
  return null;
}

function isGltfExportAvailable() {
  return _getGLTFExporter() !== null;
}

/**
 * Export a THREE.Scene to glTF or glb.
 *
 * @param {Object} scene - THREE.Scene
 * @param {Object} [opts] - { binary: true, onlyVisible: true }
 * @returns {Promise<{ok: boolean, data?: ArrayBuffer|Object, error?: string}>}
 */
function sceneToGltf(scene, opts = {}) {
  const o = { ...gltfExportDefaults(), ...opts };
  const Exporter = _getGLTFExporter();
  if (!Exporter) {
    return Promise.resolve({ ok: false, error: 'THREE.GLTFExporter not available' });
  }
  return new Promise(resolve => {
    const exporter = new Exporter();
    exporter.parse(
      scene,
      data => resolve({ ok: true, data }),
      err => resolve({ ok: false, error: err.message || String(err) }),
      { binary: o.binary, onlyVisible: o.onlyVisible }
    );
  });
}

// Universal export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sceneToGltf, isGltfExportAvailable, gltfExportDefaults };
}
if (typeof window !== 'undefined') {
  window.GltfExporter = { sceneToGltf, isGltfExportAvailable, gltfExportDefaults };
}
export { sceneToGltf, isGltfExportAvailable, gltfExportDefaults };
```

**Step 3: Add GLTFExporter CDN to head.html**

In `src/shell/head.html`, after the Three.js CDN loader `s.onload` block, add the GLTFExporter loader inside the same `s.onload` callback:

```javascript
s.onload = () => {
  const btn = document.getElementById('mode3dBtn');
  if (btn) btn.hidden = false;
  // Load GLTFExporter addon
  const ge = document.createElement('script');
  ge.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js';
  document.head.appendChild(ge);
};
```

**Step 4: Run tests, wire into build, commit**

Same pattern as 6.1: run test, uncomment in build.js, add to run-all.js, full build + test.

```bash
git add src/exporters/gltf-exporter.js tests/test-gltf-exporter.js src/shell/head.html build.js tests/run-all.js
git commit -m "feat(export): add glTF exporter — 3D scene to .glb/.gltf"
```

---

## Task 6.5 — Video Exporter (WebCodecs)

**Files:**
- Create: `src/exporters/video-exporter.js`
- Create: `tests/test-video-exporter.js`
- Modify: `src/shell/head.html` (add mp4box.js CDN)
- Modify: `build.js`, `tests/run-all.js`

**What it does:** Renders each grid frame to an OffscreenCanvas, encodes via WebCodecs VideoEncoder (H.264), muxes with mp4box.js into an MP4 Blob. Browser-only, Chrome/Edge only. Degrades silently.

This is the most complex exporter. The implementation details are browser-API-heavy and should be developed and tested in-browser with the mock suite covering the wrapper logic only.

### Key API surface:

```javascript
isVideoExportAvailable()  → boolean  // feature-detect VideoEncoder
videoExportDefaults()     → { fps, width, height, codec, bitrate }
gridToMp4(grid, renderer, opts, onProgress) → Promise<Blob>
```

### Step 1: Write tests with mock VideoEncoder + mp4box

Test the scheduling logic, progress callbacks, and error handling. Mock `VideoEncoder`, `VideoFrame`, and `MP4Box.createFile()`.

### Step 2: Implement

The pipeline: for each frame → render to OffscreenCanvas → `new VideoFrame(canvas)` → `encoder.encode(frame)` → `encoder.flush()` → mp4box mux → `Blob`.

### Step 3: Add mp4box.js CDN

In `src/shell/head.html`, add conditional load (only if WebCodecs available):

```javascript
if (typeof VideoEncoder !== 'undefined') {
  const mp4 = document.createElement('script');
  mp4.src = 'https://cdn.jsdelivr.net/npm/mp4box/dist/mp4box.all.min.js';
  document.head.appendChild(mp4);
}
```

### Step 4: Wire, test, commit

Same pattern as previous tasks.

```bash
git commit -m "feat(export): add video exporter — WebCodecs MP4 encoding"
```

**Note:** This task has the highest risk of scope creep. If WebCodecs proves too fiddly, defer and ship 6.UI without the Video tab. The other 4 export formats already deliver high value.

---

## Task 6.UI — Export Modal with Tabs

**Files:**
- Modify: `src/shell/body.html` (replace JSON modal with tabbed export panel)
- Modify: `src/shell/style.css` (tab styles)
- Modify: `src/shell/app.js` (wire export functions to tabs)

**What it does:** Replaces the current JSON-only export modal with a tabbed panel offering: JSON, SVG, PNG, MIDI, glTF, Video. Conditional enables: MIDI only when music data exists, glTF only when 3D mode has been used, Video only when WebCodecs available.

### Step 1: Update body.html — export modal

Replace the `jsonModal` contents with a tabbed layout:

```html
<!-- Export Modal -->
<div class="modal-overlay" id="exportModal">
  <div class="modal" style="max-width:520px">
    <h2>Export</h2>
    <div class="export-tabs">
      <button class="export-tab active" data-tab="json">JSON</button>
      <button class="export-tab" data-tab="svg">SVG</button>
      <button class="export-tab" data-tab="png">PNG</button>
      <button class="export-tab" data-tab="midi" id="midiTabBtn">MIDI</button>
      <button class="export-tab" data-tab="gltf" id="gltfTabBtn">glTF</button>
      <button class="export-tab" data-tab="video" id="videoTabBtn">Video</button>
    </div>
    <div class="export-panels">
      <!-- JSON panel (existing behavior) -->
      <div class="export-panel active" id="exportJson">
        <textarea id="jsonArea" rows="10"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
          <button onclick="copyJson()">Copy</button>
          <button onclick="downloadJson()">Download .grid</button>
        </div>
      </div>
      <!-- SVG panel -->
      <div class="export-panel" id="exportSvg">
        <label>Font size: <input type="number" id="svgFontSize" value="14" min="8" max="48" style="width:60px"> px</label>
        <label>Background: <input type="color" id="svgBg" value="#0a0a1a" style="width:40px">
          <label><input type="checkbox" id="svgTransparent"> Transparent</label>
        </label>
        <label><input type="checkbox" id="svgGridLines"> Show grid lines</label>
        <div style="margin-top:8px"><button onclick="doExportSvg()">Download .svg</button></div>
      </div>
      <!-- PNG panel -->
      <div class="export-panel" id="exportPng">
        <p style="color:var(--dim)">Downloads the current canvas view as a PNG image.</p>
        <div style="margin-top:8px"><button onclick="exportPng()">Download .png</button></div>
      </div>
      <!-- MIDI panel -->
      <div class="export-panel" id="exportMidi">
        <p style="color:var(--dim)">Export note events as a Standard MIDI File (.mid).<br>Play the grid in Music mode first to generate note data.</p>
        <div style="margin-top:8px"><button onclick="doExportMidi()" id="midiExportBtn">Download .mid</button></div>
      </div>
      <!-- glTF panel -->
      <div class="export-panel" id="exportGltf">
        <label><input type="checkbox" id="gltfBinary" checked> Binary (.glb) — smaller, Blender-ready</label>
        <div style="margin-top:8px"><button onclick="doExportGltf()" id="gltfExportBtn">Download .glb</button></div>
      </div>
      <!-- Video panel -->
      <div class="export-panel" id="exportVideo">
        <label>FPS: <input type="number" id="videoFps" value="10" min="1" max="60" style="width:60px"></label>
        <label>Bitrate: <input type="number" id="videoBitrate" value="2000000" step="500000" style="width:100px"> bps</label>
        <div id="videoProgress" style="display:none;margin-top:8px">
          <progress id="videoBar" value="0" max="100" style="width:100%"></progress>
          <span id="videoStatus">Encoding...</span>
        </div>
        <div style="margin-top:8px"><button onclick="doExportVideo()" id="videoExportBtn">Encode MP4</button></div>
      </div>
    </div>
    <div style="text-align:right;margin-top:8px">
      <button onclick="closeModal('exportModal')">Close</button>
    </div>
  </div>
</div>
```

### Step 2: Add CSS for tabs

In `src/shell/style.css`:

```css
.export-tabs { display: flex; gap: 2px; margin-bottom: 12px; flex-wrap: wrap; }
.export-tab {
  padding: 4px 10px; background: var(--surface); border: 1px solid var(--border);
  color: var(--dim); cursor: pointer; font-size: 12px;
}
.export-tab.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.export-tab:disabled { opacity: 0.3; cursor: not-allowed; }
.export-panel { display: none; }
.export-panel.active { display: block; }
.export-panel label { display: block; margin: 6px 0; font-size: 13px; }
```

### Step 3: Wire export functions in app.js

Add to `src/shell/app.js`:

```javascript
    // ── Export modal tab switching ────────────────────
    function showExportModal() {
      // Set initial state
      document.getElementById('jsonArea').value = serializeGrid(grid);
      // Conditional enables
      const hasMidi = synth && synth._lastNoteEvents;
      const hasGltf = isGltfExportAvailable() && sceneBuilder;
      const hasVideo = typeof VideoEncoder !== 'undefined';
      document.getElementById('midiTabBtn').disabled = !hasMidi;
      document.getElementById('gltfTabBtn').disabled = !hasGltf;
      document.getElementById('videoTabBtn').disabled = !hasVideo;
      switchExportTab('json');
      openModal('exportModal');
    }

    function switchExportTab(tab) {
      document.querySelectorAll('.export-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.export-panel').forEach(p => p.classList.toggle('active', p.id === 'export' + tab.charAt(0).toUpperCase() + tab.slice(1)));
    }

    // Wire tab clicks
    document.querySelectorAll('.export-tab').forEach(btn => {
      btn.addEventListener('click', () => { if (!btn.disabled) switchExportTab(btn.dataset.tab); });
    });

    function doExportSvg() {
      const opts = {
        fontSize: +document.getElementById('svgFontSize').value || 14,
        background: document.getElementById('svgTransparent').checked
          ? 'transparent' : document.getElementById('svgBg').value,
        includeGrid: document.getElementById('svgGridLines').checked,
        frameIndex: renderer ? renderer.current : 0,
      };
      const svg = gridToSvg(grid, opts);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      downloadBlob(blob, (grid.meta.name || 'grid') + '.svg');
    }

    function doExportMidi() {
      if (!synth || !synth._lastNoteEvents) { setStatus('Play in Music mode first', true); return; }
      const buf = noteEventsToMidi(synth._lastNoteEvents, {
        bpm: grid.project.bpm || 120,
        trackName: grid.meta.name || 'GRID Export',
      });
      const blob = new Blob([buf], { type: 'audio/midi' });
      downloadBlob(blob, (grid.meta.name || 'grid') + '.mid');
    }

    async function doExportGltf() {
      if (!sceneBuilder) { setStatus('Enter 3D mode first', true); return; }
      const binary = document.getElementById('gltfBinary').checked;
      const result = await sceneToGltf(sceneBuilder.getScene(), { binary });
      if (!result.ok) { setStatus('glTF export failed: ' + result.error, true); return; }
      const ext = binary ? '.glb' : '.gltf';
      const type = binary ? 'model/gltf-binary' : 'model/gltf+json';
      const data = binary ? result.data : JSON.stringify(result.data, null, 2);
      const blob = new Blob([data], { type });
      downloadBlob(blob, (grid.meta.name || 'grid') + ext);
    }

    async function doExportVideo() {
      if (typeof gridToMp4 !== 'function') { setStatus('Video export not available', true); return; }
      const btn = document.getElementById('videoExportBtn');
      const bar = document.getElementById('videoBar');
      const status = document.getElementById('videoStatus');
      const prog = document.getElementById('videoProgress');
      btn.disabled = true;
      prog.style.display = 'block';
      try {
        const blob = await gridToMp4(grid, renderer, {
          fps: +document.getElementById('videoFps').value || 10,
          bitrate: +document.getElementById('videoBitrate').value || 2000000,
        }, (done, total) => {
          bar.value = (done / total) * 100;
          status.textContent = `Encoding... ${done}/${total}`;
        });
        downloadBlob(blob, (grid.meta.name || 'grid') + '.mp4');
        setStatus('MP4 exported');
      } catch (e) {
        setStatus('Video export error: ' + e.message, true);
      }
      btn.disabled = false;
      prog.style.display = 'none';
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      a.click();
      URL.revokeObjectURL(url);
    }
```

### Step 4: Update exportGrid() and the toolbar

Change `exportGrid()` to call `showExportModal()` instead.
Update `importGrid()` references if the modal ID changed.

### Step 5: Full build + browser test

```bash
node build.js && node tests/run-all.js
```
Open in browser. Verify each tab works.

### Step 6: Commit

```bash
git add src/shell/body.html src/shell/style.css src/shell/app.js
git commit -m "feat(export): tabbed export modal with SVG, PNG, MIDI, glTF, Video"
```

---

## Recommendations

### 1. Skip video exporter initially

WebCodecs + mp4box.js is the highest-risk task. Ship SVG/PNG/MIDI/glTF first — those 4 cover the most valuable use cases. Add video in a follow-up.

### 2. Store note events for MIDI export

The synth engine currently plays notes but doesn't save the `NoteEvent[]` array. Add a `synth._lastNoteEvents = events` property in the `play()` method of synth-engine.js so the MIDI exporter can access them. This is a 1-line change.

### 3. Don't `.gitignore` dist/index.html yet

The generated file IS the deliverable. Keep it committed so GitHub Pages / direct download works. Add a `<!-- GENERATED FILE — DO NOT EDIT. Run: node build.js -->` comment at the top (build.js should inject this).

### 4. Add `--watch` to build.js later

Not needed now, but after Phase 6, a `node build.js --watch` using `fs.watch()` on `src/` would improve the dev loop. Defer until the exporter count justifies it.

### 5. Import modal stays separate

The current `importGrid()` function uses the `jsonModal` for import. When the export modal changes, keep the import path on its own modal (or reuse `jsonModal` for import only). Don't break Ctrl+O / Import button.

---

## Phase 6 Exit Criteria

```
[ ] node build.js produces working dist/index.html from src/ (14+ modules)
[ ] SVG export → .svg file opens in Illustrator/Inkscape at any resolution
[ ] PNG export → .png file downloads current canvas view
[ ] MIDI export → .mid file opens in any DAW
[ ] glTF export → .glb file opens in Blender
[ ] Video export → .mp4 with correct frame sequence (or deferred)
[ ] Export modal: tabbed, conditional enable for MIDI/glTF/Video
[ ] All new code has Node-passing test suites
[ ] node tests/run-all.js → 0 failures
[ ] Browser verification: zero console errors, all tabs functional
```
