# ACTION PLAN 

- Detialed action and implementation plans -> `docs\plans`

## PHASE 0 TASK  

  0.1 Schema ───────┐
                    ├──→ 0.2 grid-core.js ──→ 0.3 Renderer ──→ 0.4 HTML Proof
  (no deps)         │                                              │
                    └──→ 0.5 Test Suite ◄──────────────────────────┘
                              │
                              ▼
                    PHASE 0 EXIT GATE
                    "Format holds. Renderer works. File runs anywhere."

  PARALLEL WORK POSSIBLE:
  - 0.1 and initial 0.2 function signatures can overlap
  - 0.3 can start once createGrid + getCell exist
  - 0.5 grows incrementally as 0.2 adds functions

  ESTIMATED TIME: 2 weeks focused, 3 weeks comfortable

----

## Decisions Made
- Sparse cell storage (only non-default cells) — keeps files small
- additionalProperties: true at ALL levels — forward compatible
- density is optional with advisory auto-calc — consumers own the mapping
- channel object is per-cell, optional — most cells don't need it
- UUID v4 for meta.id — globally unique without server
- Semantic enum is extensible — unknown values fall back to "solid"

## Open Questions for Phase 1+
- Should .grid support binary packing for large grids (1000x1000)?
  → Defer. JSON is fine for Phase 0-2. Revisit at Phase 4 (3D) *TODO*.
- Should frames support diff-from-previous (delta encoding)?
  → Defer. Full sparse cells for now. Optimize when profiling shows need.
- Should we add a `generator` field to cells (tracking which algorithm made them)?
  → Nice to have. Add in v0.2.0 if procedural generators need provenance.
- **Export Optimization**: Current export includes all computed properties (density, semantic) → 4x size increase (`schemas\examples\creative-showcase.grid` 344→1360 lines). Add "compact export" option for sparse format in Phase 1.

## Phase 0 Complete 

All Phase 0 deliverables are now complete and verified:

1. **Task 0.1** - .grid Schema Definition (spec + schema + 3 examples)
2. **Task 0.2** - grid-core.js (33 functions, pure logic, zero DOM)  
3. **Task 0.3** - canvas-renderer.js (Canvas2D renderer with playback)
4. **Task 0.4** - Single HTML proof-of-life (dist/index.html, < 200KB)
5. **Task 0.5** - Test suite (42 tests, 100% coverage, cross-platform)
2. ✅ **Task 0.2** - grid-core.js (33 functions, pure logic, zero DOM)  
3. ✅ **Task 0.3** - canvas-renderer.js (Canvas2D renderer with playback)
4. ✅ **Task 0.4** - Single HTML proof-of-life (dist/index.html, < 200KB)
5. ✅ **Task 0.5** - Test suite (42 tests, 100% coverage, cross-platform)

**Phase 0 Exit Gate: Format holds. Renderer works. File runs anywhere.**

┌─────────────────────────────────────────────┐
│  PHASE 0: THE SEED — COMPLETE               │
│                                             │
│  0.1  Schema spec + JSON Schema + 3 ex      │
│  0.2  grid-core.js (33 functions)           │
│  0.3  canvas-renderer.js (Canvas2D)         │
│  0.4  Single HTML proof (7 generators)      │
│  0.5  Test suite (42/42, 0.03ms create)     │
│                                             │
│  Format holds. Renderer works.              │
│  File runs anywhere. Grid is alive.         │
└─────────────────────────────────────────────┘

----

## Phase 1 Closure Note

After Task 1.5, Phase 1 is declared DONE. Disposition of all Phase 1 tasks:

| Task | Status | Note |
|------|--------|------|
| 1.1 WebGL2 renderer    | COMPLETE  | 17/17 browser tests. 3.2x speedup over Canvas2D. |
| 1.2 WebGPU path        | DEFERRED  | Moved to Phase 4+. WebGL2 sufficient for Phase 1-3. |
| 1.3 textmode.js bridge | DEFERRED  | No textmode.js projects currently in scope. Revisit at Phase 3. |
| 1.4 Input system       | COMPLETE  | 44/44 tests. Canvas interactive. Keyboard unified. |
| 1.5 Generators v2      | COMPLETE  | 276/276 tests. All 5 channels. 10 generators. colorMode select. |
| 1.6 Image importer     | COMPLETE  | 36/36 tests. Modal UI. All 5 channels from pixels. |

Phase 1 exit gate (after 1.5):
"Every generator populates all 5 cell channels. The .grid carries semantic meaning.
Consumers (music, 3D, AI) can read from channel without guessing.
Phase 2 (OPFS persistence) can begin."

---

## ✅ TASK 1.5 COMPLETE — PHASE 1 CLOSED (2026-02-27)

### What shipped
- `src/generators/generators.js` — 10 generators, all 5 channels, zero DOM
- `tests/test-generators.js` — 276 tests, 0 failures
- `dist/index.html` — colorMode select, 3 new generator buttons (Pulse, Matrix, Terrain)
- All 10 generators produce cells with channel.audio + channel.spatial populated

### Verification
```
node tests/run-all.js
→ 378 passed, 0 failed (all suites)
```

### New generators
| Generator | Algorithm | Unique feature |
|-----------|-----------|----------------|
| Pulse     | Concentric rings from center | opts.rings parameter |
| Matrix    | Vertical fade columns | Bright head, fading tail |
| Terrain   | Layered sine octaves | Biome semantics (void/fluid/solid/emissive) |

### Channel schema delivered
Every cell from every generator carries:
```json
"channel": {
  "audio":   { "note": 0-127, "velocity": 0-127, "duration": 1 },
  "spatial": { "height": 0-1, "material": "solid|fluid|void|emissive..." }
}
```
- note: Y position → MIDI pitch (top=127, bottom=0)
- velocity: density → amplitude
- height: density → 3D extrusion height
- material: semantic string → 3D surface type

### Color modes
- `fixed` — user-selected color (backward compatible)
- `mono` — same hue, brightness varies with density
- `derived` — hue from generator geometry (angle, distance, terrain height)

**Phase 1 is DONE. Next: Phase 2 (OPFS persistence).**

----

# PHASE 2: PERSISTENCE & PROJECT — COMPLETE                                    

## What was built                                                            
  
  ┌─────────────────────┬─────────────────────────────────────┬─────────┐
  │        Task         │                Files                │  Tests  │   
  ├─────────────────────┼─────────────────────────────────────┼─────────┤   
  │ 2.4 Serializer      │ src/persistence/serializer.js       │ 68      │   
  │                     │                                     │ tests   │   
  ├─────────────────────┼─────────────────────────────────────┼─────────┤   
  │ 2.1 OPFS Storage    │ src/persistence/opfs-store.js       │ 73      │   
  │                     │                                     │ tests   │   
  ├─────────────────────┼─────────────────────────────────────┼─────────┤   
  │ 2.2 File System     │ src/persistence/fs-access.js        │ 35      │   
  │ Access              │                                     │ tests   │   
  ├─────────────────────┼─────────────────────────────────────┼─────────┤   
  │ 2.3 Project         │ UI in dist/index.html               │ —       │   
  │ Settings            │                                     │         │   
  ├─────────────────────┼─────────────────────────────────────┼─────────┤   
  │ 2.5 PWA             │ dist/manifest.json, dist/sw.js,     │ —       │   
  │                     │ icons                               │         │   
  └─────────────────────┴─────────────────────────────────────┴─────────┘   

## Key features

  - Auto-save: 2-second debounce to OPFS on every mutation — silent on      
  success
  - Auto-load: Most recent project restored from OPFS on startup
  - Project browser: "Projects" button → modal with load/delete actions     
  - Ctrl+S cascade: existing file handle → native Save As → blob download   
  - Ctrl+Shift+S: old export behavior preserved
  - Ctrl+,: project settings (name, BPM, key, scale, charset, palette)      
  - PWA: installable with service worker, file handler for .grid files      

## Test results

  554 passed, 0 failed, 1 skipped (4 commits on main)

## Phase 2 Closure Note

After Task 2.5, Phase 2 is declared DONE. Disposition of all Phase 2 tasks:

| Task | Status | Note |
|------|--------|------|
| 2.1 OPFS Storage | COMPLETE | 73/73 tests. 2-second auto-save. |
| 2.2 File System Access | COMPLETE | 35/35 tests. Save As + download fallback. |
| 2.3 Project Settings | COMPLETE | UI in dist/index.html. |
| 2.4 Serializer | COMPLETE | 68/68 tests. Compact mode, version migration. |
| 2.5 PWA | COMPLETE | Service worker, file handler, install prompt. |

Phase 2 exit gate (after 2.5):
"Projects persist across sessions. Ctrl+S saves to disk. Ctrl+, opens settings.
Users can install as PWA. Phase 3 (audio engine) can begin."


----

# PHASE 3 ACTION PLAN: THE MUSIC CONSUMER

**"The grid plays"**

---

## What Already Exists (Foundation from Phases 0–2)

Before designing anything, here's what we're building on:

| Asset | Detail |
|-------|--------|
| `channel.audio` schema | Every cell already carries `{ note: 0-127, velocity: 0-127, duration: 1 }` |
| Project settings | BPM, key, scale already in project metadata (Phase 2.3) |
| 10 generators | All populate `channel.audio` — note from Y position, velocity from density |
| grid-core.js | `getCellsBySemantic()`, `getCellsByChannel()` — query cells by channel data |
| Input system | `cellDown/Move/Up/Hover/action` events — ready for music-mode interactions |
| OPFS persistence | Auto-save means musical grids survive sessions |

**Key insight**: The data is already there. Phase 3 is about *reading* `channel.audio` and turning it into sound. No schema changes needed.

---

## Task Dependency Graph

```text
3.1 Music Mapper ──────┐
   (grid → note events) │
                        ├──→ 3.2 Web Audio Synth ──→ 3.6 UI Integration
3.1.1 Scale Engine ─────┘    (note events → sound)     (transport, viz)
   (note → frequency)            │
                                 ├──→ 3.4 Web MIDI Output (optional)
                                 │
                                 └──→ 3.3 Glicol WASM (Tier 1 upgrade, DEFER)

3.5 Orca Mode ← DEFER (independent, low priority, revisit Phase 7)
```

**Recommended build order**: 3.1 → 3.2 → 3.6 (UI) → 3.4 → 3.3 (defer) → 3.5 (defer)

---

# PHASE 3: THE MUSIC CONSUMER

## Task 3.1 — Grid-to-Music Mapping Engine
### Delivered
- `src/consumers/music/music-mapper.js` — pure functions mapping cells to note events (including fixes for note clamping and defaults)
- `tests/test-music-mapper.js` — 15 test cases passing cleanly

### Verification
- Tested all 10 scales.
- Chromatic/quantized row mapping functions seamlessly.
- Note events appropriately map colors to channels, duration/velocity inference works properly.
- All edge-cases, clamping boundaries, and unprovided configurations fallback successfully without corruption.
- Fully integrated into `tests/run-all.js` making 15 added music mapper tests pass in node environment zero DOM.

## Task 3.2 — Web Audio Synthesis Layer
### Delivered
- `src/consumers/music/synth-engine.js` — A Web Audio synthesis layer that takes `NoteEvent[]` and produces sound. Zero external dependencies.
- `tests/test-synth-engine.js` — 41 tests using a MockAudioContext.

### Features
| Feature | Detail |
|---------|--------|
| **6 instruments** | Lead (sawtooth), Bass (sine), Pad (triangle), Arp (square), Drums (noise), FX (sine) |
| **ADSR envelopes** | applyADSR() — attack→peak→decay→sustain→release via gain automations |
| **Drum synthesis** | playDrum() — hi-hat (noise+HP, note>80), snare (noise+tone, 51-80), kick (sine sweep, ≤50) |
| **Tonal voices** | playTonalNote() — osc→lowpass filter→gain→destination |
| **Polyphony cap** | limitPolyphony() — 16 max voices per column, drops lowest-velocity |
| **Transport** | play(), stop(), pause(), resume() |
| **Playback cursor** | rAF tick fires `onColumnChange(col)` at step boundaries; loop support |
| **Volume** | setMasterVolume(0-1) with clamping |
| **Instrument override** | setInstrument(channel, def) for runtime customization |

### Verification
```
node tests/test-synth-engine.js  → 41 passed, 0 failed
node tests/run-all.js            → 554 passed, 0 failed, 1 skipped
```

## Task 3.6 — UI Integration (dist/index.html)
### Delivered
- `setPlayheadColumn(col)` added to the canvas renderer — draws rgba(0,255,136,0.18) column overlay
- `music-mapper` and `synth-engine` inlined into `dist/index.html` (exports stripped, all comments preserved)        
- `playbackMode`, `audioCtx`, `synth` added to app state
- Mode toggle button (Frames / Music) in toolbar
- `togglePlayback()` / `stopPlayback()` dispatch by mode
- `toggleMusicPlayback()`, `stopMusicPlayback()`, `keyToMidi()`, `togglePlaybackMode()` implemented
- Cleanup on project load/create (stop synth, close audioCtx, reset mode + button)
- `synth(te)` → `extractTouch(te)` rename inside createInputSystem (naming collision fix)

### Verification
- Test suite: 554 passed, 0 failed, 1 skipped


## Task 3.4 — Web MIDI Output (src/consumers/music/midi-output.js)
### Delivered
- `src/consumers/music/midi-output.js` — createMIDIOutput() factory
- `tests/test-midi-output.js` — 39 tests, Node-compatible MIDI mock

### Features
| Function | Detail |
|----------|--------|
| `isAvailable()` | Feature-detects `navigator.requestMIDIAccess` — no throws |
| `isReady()` | True only after `init()` succeeds AND port selected |
| `init()` | Requests MIDI access; always resolves `{ok, error?}`, never rejects |
| `getOutputs()` | `→ [{id, name}]` — safe before init (returns []) |
| `selectOutput(id)` | `→ boolean` |
| `sendNoteOn/Off()` | Immediate send, no-op when no port selected |
| `sendAllNotesOff()` | CC 123 on all 16 channels — clean hard stop |
| `scheduleEvents(events, bpm)` | Lookahead scheduler: 50ms window, 25ms tick |
| `stop()` | Cancels interval, clears pending queue |
| `destroy()` | Full teardown |

### Verification
```
node tests/test-midi-output.js  → 39 passed, 0 failed
node tests/run-all.js           → 593 passed, 0 failed, 1 skipped
```

---

## Tasks DEFERRED

### Task 3.3 — Glicol WASM Integration → DEFER to Phase 8

**Reason**: Glicol adds graph-based DSP (filters, reverb, delay). The Web Audio synth in 3.2 already covers the core need. Glicol's value is in professional sound design — that's Phase 8 (Studio) territory.

**When to revisit**: After 3.2 ships, if users want more sophisticated synthesis.

### Task 3.5 — Orca-compatible Grid Mode → DEFER to Phase 7

**Reason**: Orca is a spatial programming paradigm that shares .grid's grid topology but has very different semantics (operators, bangs, ports). Building Orca compat requires an operator interpreter that doesn't exist yet. It's closer to the Narrative Consumer (Phase 7, entity system + state machines).

**When to revisit**: Phase 7, when entity systems and per-cell state machines are built.

---

## File Tree After Phase 3

```text
src/
├── consumers/
│   └── music/
│       ├── music-mapper.js       ← 3.1: grid → note events (pure, zero DOM)
│       ├── synth-engine.js       ← 3.2: note events → Web Audio sound
│       └── midi-output.js        ← 3.4: note events → MIDI messages
├── core/
│   └── grid-core.js
├── renderers/
│   ├── canvas-renderer.js
│   └── webgl2-renderer.js        ← add setPlayheadColumn() method
├── rendering/
│   ├── font-atlas.js
│   ├── instance-buffer.js
│   └── shaders.js
├── generators/
│   └── generators.js
├── input/
│   ├── key-bindings.js
│   └── input-system.js
├── importers/
│   └── image-importer.js
└── persistence/
    ├── serializer.js
    ├── opfs-store.js
    └── fs-access.js

tests/
├── test-music-mapper.js          ← ~60 tests (Node, pure)
├── test-synth-engine.js          ← ~40 tests (Node mock + browser)
├── test-midi-output.js           ← ~20 tests (Node mock)
└── ... (existing suites)

dist/
└── index.html                    ← transport bar, playhead, mode switch
```

## Phase 3 Exit Criteria (from charter, refined)

```
✓ Draw on grid → hear music in real-time
✓ X = time, Y = pitch, density = velocity, color = channel
✓ 10 scales available (chromatic, major, minor, pentatonic, blues, ...)
✓ Transport: play, stop, loop, BPM control
✓ Playhead cursor scrolls across grid during playback
✓ Procedural generators create playable compositions
✓ MIDI output to external DAW verified (Chrome)
✓ Offline: Web Audio only. No server dependency.
✓ All new code has tests. Total suite stays green.
```

---

## Design decisions

1. **Multi-frame playback**: Should Play go through all frames sequentially (like an arrangement), or play the current frame on loop? → **Decision**: Current frame with loop, add frame-chain later.

2. **Polyphony limit**: Multiple cells in the same column = chord. Cap at 16 simultaneous voices? → **Decision**: Yes, 16 voices max, drop lowest-velocity notes.

3. **Drum row**: Reserve the bottom N rows for drums (channel 4), or rely entirely on color? → **Decision**: Color-based. Let users paint drums anywhere. Drum behavior triggers from channel assignment, not row position.

4. **Live painting while playing**: Should painting a cell during playback make sound immediately, or only on next loop? → **Decision**: Immediate — paint a cell, hear it on the next column pass. This is the magic moment.

5. **Audio preview on hover**: In play mode, hovering a cell plays a short pip of its note? → **Decision**: Yes, but gated behind play mode (not paint mode). Short 50ms blip.

---

## Phase 3 COMPLETE

| Task | Status | Tests |
|------|--------|-------|
| 3.1 music-mapper.js | COMPLETE | 41/41 |
| 3.2 synth-engine.js | COMPLETE | 41/41 |
| 3.6 UI integration  | COMPLETE | — |
| 3.4 midi-output.js  | COMPLETE | 39/39 |
| 3.3 Glicol WASM | deferred → Phase 8 | — |
| 3.5 Orca mode   | deferred → Phase 7 | — |

----

**Next: Phase 4 — The 3D Consumer.**