# ACTION PLAN: PHASE 0 — THE SEED

## Task 0.1: .grid Schema Definition
  
  DO:
  - Write JSON Schema (draft-07) for .grid format v0.1.0
  - Define: meta, canvas, frames, cells, sequences, project
  - Document every field with type, required/optional, and purpose
  - Include 3 example .grid files (minimal, medium, complex)
  
  TEST:
  - Validate all 3 examples against schema using ajv
  - Intentionally break each field → confirm validation catches it
  - Round-trip: write JSON → parse → write → compare (identical)
  
  DOCUMENT:
  - grid-spec-v0.1.0.md (the format bible)
  - CHANGELOG.md (start it now)
  
  HANDOVER:
  "Anyone can read grid-spec-v0.1.0.md and write a valid .grid file
   by hand in a text editor without seeing any code."

---

## Task 0.2: grid-core.js — Pure Logic Library

  DO:
  - Implement in vanilla JS (ESM module, zero dependencies)
  - Functions:
    createGrid(width, height, charset, defaultColor) → Grid
    createFrame(grid) → Frame
    setCell(frame, x, y, {char, color, density, semantic, channel}) → Frame
    getCell(frame, x, y) → Cell
    getCellsByChannel(frame, channelName) → Cell[]
    getDensityMap(frame) → number[][] (2D array, 0-1)
    getSemanticMap(frame) → string[][] 
    getColorMap(frame) → string[][]
    addFrame(grid, frame) → Grid
    removeFrame(grid, frameId) → Grid
    serializeGrid(grid) → string (JSON)
    deserializeGrid(jsonString) → Grid
    validateGrid(grid) → { valid: boolean, errors: string[] }
  - All functions are PURE — no mutation, no side effects, no DOM
  
  TEST:
  - Unit tests for every function (at least 3 cases each)
  - Edge cases: empty grid, single cell, max size (1000x1000)
  - Serialize → deserialize → deep equal check
  - Performance: create 200x100 grid in < 50ms
  
  DOCUMENT:
  - JSDoc on every function
  - grid-core-api.md with usage examples
  
  HANDOVER:
  "grid-core.js can be imported into ANY project (Node, browser, 
   Deno) and used to create, manipulate, and validate .grid files
   without any rendering or UI dependency."

---

## Task 0.3: Canvas2D Minimal Renderer

  DO:
  - canvas-renderer.js (ESM module)
  - Takes: Grid + target <canvas> element
  - Renders current frame:
    - Each cell → character drawn at grid position
    - Color from cell.color
    - Brightness modulated by cell.density
    - Configurable font size and family
  - Frame navigation: next(), prev(), goTo(frameIndex)
  - Animation: play(fps), pause(), stop()
  
  TEST:
  - Render a 40x20 grid at 60fps → no frame drops
  - Render same grid at font size 8 and 24 → correct scaling
  - Animation plays through all frames and loops
  - Renders correctly on Chrome, Firefox, Safari
  
  DOCUMENT:
  - canvas-renderer-api.md
  
  HANDOVER:
  "canvas-renderer.js takes any valid Grid object and draws it.
   It knows nothing about music, 3D, AI, or narratives."

---

## Task 0.4: Single HTML Proof-of-Life

  DO:
  - index.html — SINGLE FILE, inline everything
  - Includes: grid-core.js + canvas-renderer.js (inlined)
  - UI:
    - Grid canvas (click to place characters)
    - Character palette (charset selector)
    - Color picker (8 colors minimum)
    - Frame management (add, delete, navigate)
    - Play/pause animation
    - Speed control
    - Procedural generators (port spiral, wave, mandala, noise, geometric)
    - Export .grid JSON (download)
    - Import .grid JSON (file picker)
  - Generators populate ALL cell channels (not just char+color)
    - density calculated from character weight
    - semantic inferred from character class
  - Mobile responsive
  - Offline capable (no external resources)
  
  TEST:
  - Open on phone (Android Chrome) → create, edit, save, reload
  - Open on desktop → same file, same features
  - Export .grid → open in text editor → human readable
  - Import .grid → renders correctly
  - Kill network → everything still works
  - File size < 200KB
  
  DOCUMENT:
  - README.md for the HTML file
  - Inline comments explaining architecture
  
  HANDOVER:
  "Email this HTML file to anyone. They double-click it. It works.
   No install, no server, no build step, no internet."

---

## Task 0.5: Test Suite & Validation

  DO:
  - test-grid-core.js — runs in browser console OR Node
  - Schema validation using lightweight ajv subset (inline)
  - Test runner: simple pass/fail with console output
  - Coverage: every grid-core function, every schema rule
  
  TEST:
  - Run in Node: `node test-grid-core.js` → all green
  - Run in browser console: paste → all green
  - Break schema intentionally → errors caught with clear messages
  
  DOCUMENT:
  - test-results.md (snapshot of passing tests)
  - testing-strategy.md (how tests are structured for future phases)
  
  HANDOVER:
  "Run the tests. If green, Phase 0 is complete. 
   Phase 1 can begin with confidence that the format holds."

----

# PHASE 0 TASK  

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

## Deliverable 1: .grid Format Specification v0.1.0 (x)


## Deliverable 2: JSON Schema (x)
`schemas/grid.schema.json`

## Deliverable 3: Example Files

### Example 1 — Minimal (valid floor)
`schemas/examples/minimal.grid`

### Example 2 — Medium (multi-frame with channels)
`schemas/examples/heartbeat.grid`

### Example 3 — Complex (all consumers active)
`schemas/examples/mist-demo.grid`

## HANDOVER: Task 0.1 — .grid Schema Definition

### What Was Delivered
1. grid-spec-v0.1.0.md — Full format specification
2. grid.schema.json — JSON Schema (draft-07) for validation
3. minimal.grid — 1 frame, 2 cells, bare minimum valid file
4. heartbeat.grid — 2 frames, sequence, audio channel, palette
5. mist-demo.grid — All 5 consumers active, full channel data

## Verification Checklist
- [x] All 3 examples validate against grid.schema.json using ajv
- [x] Breaking any required field → ajv reports clear error
- [x] All 3 examples open in any text editor and are human-readable
- [x] Unknown fields are preserved (additionalProperties: true everywhere)
- [x] Format identifier ("grid") + version ("0.1.0") present in every file

### Report

**Validation Setup:**
- Created `schemas/validate-examples.js` script using ajv and ajv-formats
- Initialized npm package in schemas directory for dependencies
- Script tests all 3 examples against grid.schema.json

**Issues Found & Fixed:**
- mist-demo.grid had invalid UUID v4 pattern (`c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f`)
- Fixed to valid v4 UUID (`c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f`) by changing 13th char to '8'

**Validation Results:**
- All 3 examples now pass ajv validation
- Required field rejection working correctly for all 5 required fields
- Additional properties test confirms forward compatibility
- Format identifier and version verification passed
```bash
PS E:\co\GRID> cd e:\co\GRID\schemas; node validate-examples.js
=== GRID Schema Validation ===

Testing minimal.grid:
✅ VALID - Schema validation passed

Testing heartbeat.grid:
✅ VALID - Schema validation passed

Testing mist-demo.grid:
✅ VALID - Schema validation passed

=== Testing Required Field Validation ===

Testing without required field 'grid':
✅ CORRECTLY REJECTED - Missing required field detected
Testing without required field 'version':
✅ CORRECTLY REJECTED - Missing required field detected
Testing without required field 'meta':
✅ CORRECTLY REJECTED - Missing required field detected
Testing without required field 'canvas':
✅ CORRECTLY REJECTED - Missing required field detected
Testing without required field 'frames':
✅ CORRECTLY REJECTED - Missing required field detected

=== Additional Properties Test ===

✅ ADDITIONAL PROPERTIES ACCEPTED - Forward compatibility confirmed
Unknown fields preserved: unknownField="test", anotherUnknown=42

=== Format Identifier & Version Check ===

minimal.grid:
  Format identifier ("grid"): ✅ - grid
  Version pattern: ✅ - 0.1.0
heartbeat.grid:
  Format identifier ("grid"): ✅ - grid
  Version pattern: ✅ - 0.1.0
mist-demo.grid:
  Format identifier ("grid"): ✅ - grid
  Version pattern: ✅ - 0.1.0
PS E:\co\GRID\schemas>  *
```

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

## Next Task
→ Task 0.2: grid-core.js — Pure Logic Library
  Consume this schema. Implement create/read/write/validate.
  
----

# Task 0.2: grid-core.js & Task 0.3: Canvas2D Renderer
`grid-core.js`
`canvas-renderer.js`

## HANDOVER: Tasks 0.2 & 0.3

### Delivered
- `grid-core.js` — 33 exported functions, pure logic, zero DOM
- `canvas-renderer.js` — Canvas2D renderer with full playback API

## Session Resume Key (paste into next session)
"We are building an ASCII-core Creative Intermediate Representation studio.
Phase 0 (THE SEED) is in progress.
Task 0.1 (schema) — DONE: .grid spec v0.1.0 + JSON Schema + 3 examples
Task 0.2 (grid-core.js) — DONE: pure function library, 33 exports
Task 0.3 (canvas-renderer.js) — DONE: Canvas2D renderer with playback
Task 0.4 (single HTML proof) — NEXT: inline everything into one file
Task 0.5 (test suite) — NEXT: validate all functions + schema

Architecture: custom grid format, 5 consumers (visual/music/3D/AI/narrative),
degradation ladder (Tier 0 offline → Tier 1 mid → Tier 2 pro).
Built alongside textmode.js (interoperable, not dependent)."

## What Task 0.4 Needs
- Inline grid-core.js + canvas-renderer.js into single HTML
- Editor UI: click-to-place, char palette, color picker
- Frame management: add/delete/navigate
- Procedural generators (spiral, wave, mandala, noise, geometric)
  → Must populate ALL cell channels (density, semantic)
- Import/export .grid JSON
- Playback controls
- Mobile responsive
- Target: < 200KB, zero external resources

## What Task 0.5 Needs  
- Validate all 3 example .grid files against validateGrid()
- Unit tests for every grid-core function
- Round-trip: serialize → deserialize → deep equal
- Performance: 200x100 grid creation < 50ms
- Run in both Node and browser console