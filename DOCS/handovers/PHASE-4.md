# Implementation Plan — Phase 4: The 3D Consumer

This phase introduces a 3D consumer for the GRID project, allowing users to view their 2D grids as 3D scenes using Three.js. This includes a pure heightmap engine for data transformation, a browser-based scene builder, and integration into the existing web UI.

## Proposed Changes

### [Spatial Consumer]
Implement the data mapping from grid cells to 3D spatial data and the Three.js scene construction.

#### [NEW] [heightmap.js](file:///e:/co/GRID/src/consumers/spatial/heightmap.js)
Pure logic for converting grid frames into heightmap data (elevations, normals, materials).

#### [NEW] [scene-builder.js](file:///e:/co/GRID/src/consumers/spatial/scene-builder.js)
Three.js-based module for rendering the heightmap in the browser.

### [UI & Integration]
Integrate the 3D view into the main application.

#### [MODIFY] [index.html](file:///e:/co/GRID/dist/index.html)
- Add Three.js CDN script with fallback.
- Add 3D viewport and camera controls to the UI.
- Inline [heightmap.js](file:///e:/co/GRID/local-files/phase-4/heightmap.js) and [scene-builder.js](file:///e:/co/GRID/local-files/phase-4/scene-builder.js).
- Implement mode switching logic (Frames/Music ↔ 3D).

### [Testing]
Ensure the core logic is robust.

#### [NEW] [test-heightmap.js](file:///e:/co/GRID/tests/test-heightmap.js)
Node-compatible test suite for the heightmap engine.

#### [MODIFY] [run-all.js](file:///e:/co/GRID/tests/run-all.js)
Add [test-heightmap.js](file:///e:/co/GRID/local-files/phase-4/test-heightmap.js) to the unified test runner.

## Verification Plan

### Automated Tests
- Run the full test suite to verify the heightmap engine and ensure no regressions.
```bash
node tests/run-all.js
```

### Manual Verification
1. Open [dist/index.html](file:///e:/co/GRID/dist/index.html) in a browser.
2. Verify that the "🧊 3D" button appears in the toolbar (requires internet for Three.js CDN).
3. Click "🧊 3D" to enter 3D mode.
4. Use mouse/touch to rotate, zoom, and pan the 3D scene.
5. Verify camera presets (Orbit, Top, Fly).
6. Switch back to "Frames" mode and verify the 2D grid is still functional.