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
 └─── BUILD GATE ──────────────────────────────────
                                                   │
      6.1  SVG exporter (pure, easy win)           │
      6.2  MIDI exporter (pure, fix time→ticks)    │── can parallel
      6.3  PNG export (10 lines in app.js)         │
                                                   │
      6.UI Export modal tabs ──────────────────────┘
                                                   │
      6.4  glTF exporter (browser-only, needs 3D)  │── sequential
      6.5  Video exporter (defer)                  │── sequential
```

**Recommended order:** B.0 → B.1 → 6.1 → 6.2 → 6.3 → 6.UI → 6.4 → 6.5

---

## Task B.0 — Verify Build Output (Gate) (x)

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

## Task B.1 — Add midi-output.js to Build (x)

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

## Task 6.1 — SVG Exporter (x)

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
```

**Step 2: Run test — verify it fails**

```bash
node tests/test-svg-exporter.js
```
Expected: `Error: Cannot find module '../src/exporters/svg-exporter.js'`

### Step 3: Create the exporter

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
```

### Step 4: Run test — verify it passes

```bash
node tests/test-svg-exporter.js
```
Expected: all tests pass.

### Step 5: Wire into build and test runner

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

## Task 6.2 — MIDI File Exporter (x)

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
```

### Step 2: Run test — verify it fails

```bash
node tests/test-midi-exporter.js
```
Expected: module not found error.

### Step 3: Implement the exporter

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

```

### Step 4: Run test — verify it passes

```bash
node tests/test-midi-exporter.js
```
Expected: all tests pass.

### Step 5: Wire into build and test runner

In `build.js`, uncomment the MIDI exporter line. In `tests/run-all.js`, add the import.

### Step 6: Full build + test

```bash
node build.js && node tests/run-all.js
```

**Step 7: Commit**

```bash
git add src/exporters/midi-exporter.js tests/test-midi-exporter.js build.js tests/run-all.js
git commit -m "feat(export): add MIDI file exporter — NoteEvent[] to .mid binary"
```

---

## Task 6.3 — PNG Export (inline) (x)

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

## Task 6.4 — glTF Exporter (x)

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
```

### Step 2: Create the exporter

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
      const hasMidi = true; // MIDI export always available (uses frameToNoteEvents)
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
      const events = frameToNoteEvents(grid, renderer.current, {
        bpm: grid.project.bpm || 120,
        scale: grid.project.scale || 'chromatic',
        rootNote: keyToMidi(grid.project.key || 'C'),
        subdivision: 4
      });
      if (!events.length) { setStatus('No notes in frame', true); return; }
      const buf = noteEventsToMidi(events, {
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
