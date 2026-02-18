# PROJECT CHARTER: [GRID]

**ASCII-Core Creative Intermediate Representation Studio**

## Vision
A single character grid becomes the universal creative source format.
One file. Five outputs. Any machine. No server required.

## Guiding Principles
1. ASCII never leaves the core. Every feature traces back to the grid.
2. Offline floor holds. Nothing breaks without internet.
3. Each tier adds power, never removes capability.
4. Every phase ships a standalone, testable artifact.
5. Interoperable with textmode.js ecosystem. Never dependent on it.

## Success Criteria
- A single HTML file runs the base experience on any device
- The same project file renders to: visual, music, 3D, video, print
- Zero mandatory server dependency at any tier
- Clean handover documentation at every phase boundary

## Solo-Dev Reality Check
- No phase depends on completing ALL of the previous phase
- Every task ends with: working demo + test + doc + handover note
- Stop at any phase, what exists still works

----

# ARCHITECTURE: THE FIVE-CONSUMER GRID

## The Core Data Format: .grid

A .grid file is JSON containing:
```json
{
  "meta": { "version", "created", "device_tier" },
  "canvas": { "width", "height", "charset", "defaultColor" },
  "frames": [
    {
      "id": "frame_001",
      "timestamp": 0,
      "cells": [
        { "x": 0, "y": 0, "char": "@", "color": "#00ff00", 
          "density": 0.95, "semantic": "solid", "channel": {} }
      ],
      "layers": [ "visual", "audio", "spatial" ]
    }
  ],
  "sequences": [],
  "project": { "bpm", "scale", "palette", "ai_context" }
}
```

## Key Insight: Each cell carries multi-channel data

| Cell Property | Visual Consumer | Music Consumer | 3D Consumer | AI Consumer | Narrative Consumer |
|---------------|----------------|----------------|-------------|-------------|--------------------|
| char          | Glyph rendered | Instrument selector | Material hint | Prompt seed | Entity type |
| density       | Brightness     | Velocity       | Height      | Detail level | Importance |
| color         | Display color  | Channel/track  | Material color | Style hint | Faction/state |
| semantic      | —              | Note vs rest   | Solid vs void | Object class | Walkable vs wall |
| channel       | Layer z-index  | MIDI channel   | LOD level   | Priority   | Interaction layer |

> ONE cell. FIVE simultaneous meanings. The consumer decides which channel to read.

## System Diagram
```text
┌──────────────────────────────────────┐
│           .grid FORMAT               │
│   (JSON, human-readable, diffable)   │
└──────────┬───────────────────────────┘
           │
     ┌─────┴─────┐
     │  CORE LIB │  ← grid-core.js (pure functions, zero DOM)
     └─────┬─────┘
           │
    ┌──────┼──────┬──────────┬────────────┐
    ▼      ▼      ▼          ▼            ▼
┌──────┐┌─────┐┌─────┐┌──────────┐┌───────────┐
│VISUAL││MUSIC││ 3D  ││ AI PIPE  ││ NARRATIVE │
│render││grid→││grid→││ upscale  ││ entities  │
│WebGL2││audio││scene││ generate ││ collision │
└──────┘└─────┘└─────┘└──────────┘└───────────┘
    │      │      │          │            │
    └──────┴──────┴────┬─────┴────────────┘
                       ▼
              ┌─────────────┐
              │   EXPORT    │
              │ WebCodecs   │
              │ mp4box.js   │
              │ SVG / PNG   │
              │ MIDI / WAV  │
              │ glTF / OBJ  │
              └─────────────┘
```

## Degradation Ladder (Verified Stack from Q1-Q7)

TIER 0 — OFFLINE FLOOR (phone, airplane mode)
  Renderer:   Custom WebGL2 grid (or Canvas2D fallback)
  Storage:    OPFS (cross-browser verified Q5)
  Audio:      Web Audio API oscillators
  Export:     JSON .grid files, SVG
  AI:         None. Pure procedural.
  Footprint:  Single HTML file, < 200KB

TIER 1 — MID (laptop, browser)
  Renderer:   WebGPU auto-upgrade (Three.js r171+ pattern, Q2)
  AI:         Transformers.js v3 + ONNX Runtime Web (Q3)
              → image upscale, 0.5B SLM for prompt assist
  Video:      WebCodecs H.264 → mp4box.js (Q4)
  Audio:      Glicol WASM for graph-based DSP (Q6)
  MIDI:       Web MIDI API, Chrome-only (Q5)
  Storage:    OPFS + File System Access API (Chrome/Edge)

TIER 2 — PRO (workstation, online)
  AI:         Gemini 2.5 Flash free / Imagen 4 paid (Q7)
  Video Gen:  Veo 2/3.1 from ASCII storyboards (Q7)
  Audio Gen:  Gemini TTS for narration (Q7)
  Export:     AV1 via WebCodecs, 4K (Q4)
  Fallback:   Everything degrades to Tier 1 → Tier 0

## Project Structure
Build with progress — folders added as phases needed:
```text
GRID/
├── DOCS/
│   ├── ACTION-PLAN.md
│   ├── ARCHITECTURE.md
│   └── HANDOVERS/
│       └── phase-0.md
├── schemas/
│   ├── examples/
│   │   ├── minimal.grid
│   │   ├── heartbeat.grid
│   │   └── mist-demo.grid
│   ├── grid-spec-v0.1.0.md
│   ├── grid.schema.json
│   └── validate-examples.js
├── src/
│   ├── core/
│   │   └── grid-core.js
│   └── renderers/
│       └── canvas-renderer.js
├── tests/
│   ├── test-grid-core.js
│   ├── test-runner.html
│   ├── package.json
│   └── README.md
├── dist/
│   └── index.html
├── README.md
├── .gitignore
└── .windsurf/
    └── workflows/
```
- Don't pre-create Phase 3+ folders. When music lands, src/consumers/music/ appears. When 3D lands, src/consumers/spatial/ appears. The tree grows like a recursive tree — branches only when the depth demands it.
----

# PHASED ROADMAP

## PHASE 0: THE SEED (x) 2026-02-18
"A grid format that holds, and a renderer that proves it"

  0.1  Define .grid JSON schema (versioned, documented)
  0.2  Build grid-core.js — pure functions, zero DOM dependency
       - createGrid(), setCell(), getCell(), getFrame()
       - serializeGrid(), deserializeGrid()
       - getDensityMap(), getSemanticMap(), getColorMap()
  0.3  Build minimal Canvas2D renderer (the absolute floor)
       - Render .grid frames to <canvas>
       - Charset rendering, color support, density-to-brightness
  0.4  Single HTML file proof: load/edit/save/play .grid files
  0.5  Test suite: schema validation, round-trip serialize/deserialize

  EXIT CRITERIA:
  ✓ .grid format spec documented
  ✓ grid-core.js passes all unit tests
  ✓ Single HTML file renders and animates frames
  ✓ File loads on phone browser offline
  ✓ Handover doc written

---

## PHASE 1: THE RENDERER (~)
"WebGL2 grid engine with progressive WebGPU upgrade"

  1.1  Custom WebGL2 instanced grid renderer
       - Character atlas texture (runtime font loading)
       - Per-cell color, density, animation
       - Layer compositing (z-ordered grid layers)
  1.2  WebGPU upgrade path (feature-detect, auto-fallback)
  1.3  textmode.js interop bridge
       - Import: read textmode.js sketch format → .grid
       - Export: write .grid → textmode.js compatible format
  1.4  Input system (keyboard, mouse, touch — unified)
  1.5  Procedural generators (port from your HTML proof-of-concept)
       - Spiral, wave, mandala, noise, geometric
       - New: density-aware generators (respect semantic channel)

  EXIT CRITERIA:
  ✓ 60fps grid rendering at 200x100 cells
  ✓ WebGL2 → WebGPU auto-switch works
  ✓ textmode.js project imports successfully
  ✓ Touch works on mobile
  ✓ Procedural generators populate all 5 cell channels

---

## PHASE 2: PERSISTENCE & PROJECT (Week 6-7)
"Save, load, organize — offline forever"

  2.1  OPFS storage layer (cross-browser)
       - Project save/load/delete/list
       - Auto-save with debounce
  2.2  File System Access API (Chrome/Edge pro tier)
       - Save .grid to user filesystem
       - Register as file handler for .grid files
  2.3  Project structure
       - Multiple sequences per project
       - Timeline metadata (BPM, duration, markers)
       - Asset references (fonts, palettes, presets)
  2.4  JSON import/export (universal fallback)
  2.5  PWA manifest + service worker (offline shell)

  EXIT CRITERIA:
  ✓ Create project → close browser → reopen → project intact
  ✓ Works in Firefox, Safari, Chrome
  ✓ PWA installable on Android/desktop
  ✓ .grid files are human-readable in any text editor

---

## PHASE 3: THE MUSIC CONSUMER (Week 8-11)
"The grid plays"

  3.1  Grid-to-music mapping engine
       - X-axis = time (columns = beats, subdivided by BPM)
       - Y-axis = pitch (rows = notes in configurable scale)
       - Density = velocity
       - Color = channel/instrument
       - Semantic = note vs rest vs control
  3.2  Web Audio synthesis layer
       - Oscillator bank (sine, saw, square, triangle)
       - Basic envelopes (ADSR per channel)
       - Drum synthesis (noise-based, no samples needed)
  3.3  Glicol WASM integration (Tier 1 upgrade)
       - Graph-based DSP from grid patterns
       - Filter chains, delay, reverb
  3.4  Web MIDI output (Chrome, Tier 1)
       - Grid patterns → MIDI messages
       - External hardware/DAW integration
  3.5  Orca-compatible grid mode
       - Orca operator subset running in .grid cells
       - Respect Orca's spatial programming paradigm

  EXIT CRITERIA:
  ✓ Draw on grid → hear music in real-time
  ✓ Procedural generators create playable compositions
  ✓ MIDI output to external DAW verified
  ✓ Offline: Web Audio only. Online: Glicol upgrade.
  ✓ Orca grid imports produce matching MIDI output

---

## PHASE 4: THE 3D CONSUMER (Week 12-14)
"The grid builds worlds"

  4.1  Grid-to-heightmap engine
       - Density = elevation
       - Semantic = material type (~water, ^peak, #wall)
       - Color = material color/texture hint
  4.2  Three.js scene generator
       - Instanced geometry from grid data
       - Material assignment from semantic channel
       - Camera presets (orbit, flyover, first-person)
  4.3  VirtuaStudio Pro bridge
       - Export .grid heightmap as VSP module input
       - Import VSP camera paths for grid-guided animation
  4.4  glTF export (static scenes)

  EXIT CRITERIA:
  ✓ ASCII art of a landscape → navigable 3D scene
  ✓ Real-time: edit grid → 3D updates live
  ✓ glTF exports open in Blender
  ✓ VirtuaStudio Pro consumes .grid as module source

---

## PHASE 5: THE AI CONSUMER (Week 15-18)
"The grid imagines"

  5.1  ASCII → Image description engine
       - Grid frame → natural language scene description
       - Runs locally via Transformers.js 0.5B SLM (Tier 1)
  5.2  Image upscale pipeline
       - ASCII frame render → ONNX upscaler → HD output
       - Client-side, no server (verified Q3)
  5.3  Gemini API integration (Tier 2)
       - Grid description → Imagen 4 image generation
       - Grid storyboard → Veo video generation
       - Rate-limit handling + graceful fallback to Tier 1
  5.4  AI-assisted grid generation
       - Text prompt → .grid frame (local SLM)
       - Image input → .grid conversion (density mapping)
       - Reference image → ASCII art (bidirectional)
  5.5  Gemini free-tier circuit breaker
       - Track quota usage
       - Auto-switch to local models when quota depleted
       - Queue system for paid tier

  EXIT CRITERIA:
  ✓ Offline: image→ASCII and ASCII→upscaled image works
  ✓ Online: text prompt generates .grid frames via Gemini
  ✓ Circuit breaker activates when free tier depleted
  ✓ All AI features degrade gracefully to non-AI fallback

---

## PHASE 6: THE EXPORT PIPELINE (Week 19-21)
"The grid ships"

  6.1  Video export via WebCodecs
       - Animate .grid frames → H.264 encoded video
       - mp4box.js for MP4 container
       - AV1 optional upgrade path
       - No FFmpeg, no WASM codecs
  6.2  Image export
       - PNG (rasterized grid)
       - SVG (vector glyphs — print quality)
       - GIF (animated sequences)
  6.3  Audio export
       - WAV render from music consumer
       - MIDI file export
  6.4  3D export
       - glTF from 3D consumer
       - OBJ fallback
  6.5  Combined media export
       - Video + audio mux
       - Project archive (.grid + all exports bundled)
  6.6  VideoFormation bridge
       - Export .grid storyboard as VF blueprint
       - Grid-generated assets → VF asset registry

  EXIT CRITERIA:
  ✓ Single button: grid project → MP4 video with audio
  ✓ SVG export opens in Illustrator at poster resolution
  ✓ MIDI export opens in any DAW
  ✓ All exports work in Chrome without server

---

## PHASE 7: THE NARRATIVE CONSUMER (Week 22-24)
"The grid tells stories"

  7.1  Entity system on grid
       - Characters, objects, triggers as semantic cell types
       - Collision detection on grid
       - State machines per entity
  7.2  Doxascope bridge
       - .grid maps as game level data
       - Entity states feed Doxascope profiling engine
       - Narrative triggers from grid position/interaction
  7.3  MAKTABA bridge
       - Scene descriptions generate .grid visualizations
       - World map from MAKTABA geography → .grid layout
  7.4  Interactive mode
       - Player cursor on grid
       - Real-time entity interaction
       - Branching narrative from grid state

  EXIT CRITERIA:
  ✓ Roguelike navigation on ASCII grid with entities
  ✓ Doxascope game loads .grid as level source
  ✓ MAKTABA world data renders as explorable grid map

---

## PHASE 8: THE STUDIO (Week 25-28)
"Everything under one roof"

  8.1  Unified UI shell
       - Tab-based workspace (Visual, Music, 3D, AI, Narrative)
       - All consumers view same .grid project simultaneously
       - Edit in one tab → updates propagate
  8.2  Timeline / sequencer
       - Multi-track: visual + audio + narrative aligned
       - Keyframe system for grid state changes
       - BPM-synced playback across all consumers
  8.3  Preset / template library
       - Built-in starter grids
       - Community format for sharing .grid projects
  8.4  Settings & device tier detection
       - Auto-detect Tier 0/1/2
       - Feature flags per tier
       - Manual override
  8.5  Documentation site
       - .grid format spec
       - API reference
       - Tutorials per consumer

  EXIT CRITERIA:
  ✓ Open studio → create grid → hear it + see it in 3D + export video
  ✓ Same project file opens on phone (Tier 0) and workstation (Tier 2)
  ✓ Documentation covers all consumers and export formats
