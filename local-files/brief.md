# SESSION: GRID Project

## Who I Am
Solo developer, last 2 years, 25+ projects (React, TypeScript, Python, Three.js, 
Gemini API). Built production pipelines (VideoFormation, AudioFormation), 
3D engines (VirtuaStudio Pro), Interactive games (Doxascope), Arabic novel platform 
(MAKTABA). All serving one creative universe called Doxascope/The Next Place
(novel + game + show). I ship schema-driven, offline-first, validation-gated 
tools. Published VideoFormation Schema on GitHub (socialawy).

## What We're Building now
An ASCII-core Creative Intermediate Representation studio.
One character grid → five simultaneous outputs: visual, music, 3D, AI-upscaled 
media, and interactive narrative. Scales from a single offline HTML file on a 
phone to a pro AI-assisted production workstation. The .grid JSON format is the 
center of gravity — not the renderer.

## Guiding Principles
1. ASCII never leaves the core — every feature traces back to the grid
2. Offline floor holds — nothing breaks without internet  
3. Built ALONGSIDE textmode.js (interoperable, not dependent)
4. Each phase ships standalone testable artifacts
5. Every task ends with: working demo + test + doc + handover
6. Immutable pure functions in core. DOM only in renderers/UI.
7. Degradation ladder: Tier 0 (offline/phone) → Tier 1 (laptop/WebGPU) → Tier 2 (pro/Gemini API)

## Verified Tech Stack (researched Feb 2026)
- Renderer: Custom WebGL2 grid, WebGPU auto-upgrade (Three.js r171+ pattern)
- In-browser AI: Transformers.js v3 + ONNX Runtime Web + WebGPU
- Video export: WebCodecs H.264 → mp4box.js (no FFmpeg)
- Storage: OPFS (cross-browser), File System Access API (Chrome)
- Audio DSP: Web Audio API (floor), Glicol WASM (mid tier)
- Online AI: Gemini 2.5 Flash free / Imagen 4 paid / Veo 2-3.1
- No one occupies this space — grid→music/3D/video is wide open

## Architecture: The Five-Consumer Grid
Each cell carries: char, color, density (0-1), semantic (solid/void/fluid/
emissive/entity/control/boundary), and optional channel overrides (audio/
spatial/narrative/ai). Sparse storage — only non-default cells stored.
Consumers read the channels they need, ignore the rest.

## Current Status
### Phase 0 — COMPLETE (verified)
- .grid spec v0.1.0 + JSON Schema + 3 examples (ajv validated)
- grid-core.js: 33 pure functions, zero DOM, 42/42 tests passing
- canvas-renderer.js: Canvas2D with playback API
- dist/index.html: single-file editor, 7 generators, import/export
- Performance: 200×100 grid in 0.03ms, 1000 cells in 7.85ms
- Tested: desktop + mobile, offline, all 3 examples import clean
- File structure: src/core/, src/renderers/, schemas/, tests/, dist/

### Next: Phase 1 — THE RENDERER
Task 1.1: Custom WebGL2 instanced grid renderer
Task 1.2: WebGPU upgrade path (auto-fallback)
Task 1.3: textmode.js interop bridge
Task 1.4: Unified input system (keyboard, mouse, touch)
Task 1.5: Procedural generators v2 (density-aware, all channels)

## Phases Ahead (high-level plan exists, detailed action plans built per-phase)
1-Renderer (WebGL2/WebGPU) → 2-Persistence (OPFS/PWA) → 3-Music consumer → 
4-3D consumer → 5-AI consumer → 6-Export pipeline → 7-Narrative consumer → 
8-Studio (unified UI)

## Project Location
E:\co\GRID\

## Key Files
- schemas/grid-spec-v0.1.0.md (format bible)
- schemas/grid.schema.json (JSON Schema draft-07)
- src/core/grid-core.js (pure logic)
- src/renderers/canvas-renderer.js (Canvas2D)
- DOCS/ACTION-PLAN.md (full phased roadmap)
- DOCS/ARCHITECTURE.md (system design)

## Working Style
- Don't rush — 25-year idea, 75% built in 2 years
- Schema-first, validate-everything
- I test and fact-check between sessions
- Keep responses fast unless detailed explanation is needed