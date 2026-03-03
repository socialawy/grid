# GRID - ASCII-core Creative Intermediate Representation

A lightweight, human-readable format for creative ASCII art and animations with multi-channel support.

## What is GRID?

GRID is a JSON-based format that bridges creative coding, ASCII art, and multi-media experiences. It stores:

- **Visual** ASCII characters with colors and density
- **Audio** channels for musical notation and sound design
- **Spatial** properties for 3D positioning and physics
- **Narrative** metadata for storytelling and game logic
- **AI** prompts for generative content

## Quick Start

```javascript
import GridCore from './grid-core.js';
import { createRenderer } from './canvas-renderer.js';

// Create a new grid
const grid = GridCore.createGrid(20, 10, '@#$%&*+=-.~ ', '#00ff00', {
  name: 'My First Grid'
});

// Set some cells
const frame = grid.frames[0];
const updatedFrame = GridCore.setCell(frame, 5, 5, { char: '@', color: '#ff0044' });

// Render to canvas
const canvas = document.getElementById('grid-canvas');
const renderer = createRenderer(canvas, grid);
renderer.renderFrame();
```

### Specification
- `schemas/grid.schema.json` - JSON Schema for validation
- `schemas/grid-spec-v0.1.0.md` - Complete format specification
- `schemas/examples/` - Example .grid files

### Documentation
- `DOCS/ACTION-PLAN.md` - Development roadmap and task tracking
- `DOCS/ARCHITECTURE.md` - System architecture and design decisions

## Validation

```bash
cd schemas
npm install
node validate-examples.js
```

## Format Structure

```json
{
  "grid": "grid",
  "version": "0.1.0",
  "meta": {
    "id": "uuid-v4",
    "name": "Project Name",
    "created": "2026-02-17T12:00:00Z",
    "modified": "2026-02-17T12:00:00Z"
  },
  "canvas": {
    "width": 20,
    "height": 10,
    "charset": "@#$%&*+=-.~ ",
    "defaultChar": " ",
    "defaultColor": "#00ff00"
  },
  "frames": [
    {
      "id": "frame_001",
      "index": 0,
      "cells": [
        {
          "x": 5,
          "y": 5,
          "char": "@",
          "color": "#ff0044",
          "density": 0.9,
          "semantic": "emissive",
          "channel": {
            "audio": { "note": "C", "octave": 4 },
            "spatial": { "height": 2.0, "material": "glowing" }
          }
        }
      ]
    }
  ]
}
```

## Ensure tests can find ESM — check/create root package.json with type:module

- Create package.json with ES module type at project root

## For browser test — serve the project
cd E:\co\GRID; npx serve . -p 3000

- PWA: `http://localhost:3000/dist`

- WebGL2: `http://localhost:3000/tests/webgl2-test.html`

## Phase 4 (The 3D Consumer) is now complete. I have integrated the Three.js-based 3D spatial view into the GRID application.

## What Already Exists (Foundation from Phases 0–4 + 6)

| Asset | Detail | Phase 5 Uses It For |
| --- | --- | --- |
| getGridStats(grid) | Cell count, frame count, canvas size | 5.1 composition summary |
| getDensityMap(frame, canvas) | 2D float array [0-1] | 5.1 region detection, 5.2 upscale source |
| getSemanticMap(frame, canvas) | 2D string array | 5.1 semantic composition |
| getColorMap(frame, canvas) | 2D hex array | 5.1 palette extraction |
| getCharMap(frame, canvas) | 2D char array | 5.1 pattern detection |
| getCellsBySemantic(frame, s) | Filter cells by type | 5.1 region counting |
| getCellsByChannel(frame, ch) | Filter by channel | 5.1 audio/spatial summary |
| imageToGrid(img, opts) | Image → .grid (pixel sampling) | 5.4b builds on top |
| Schema: channel.ai | additionalProperties: true | 5.4 stores AI metadata per cell |
| Schema: project | additionalProperties: true | 5.1 writes ai_context here |
| CDN pattern | Three.js dynamic inject + feature detect | 5.2/5.3 model loading |
| Zero npm deps | package.json has "dependencies": {} | 5.2 CDN-only, no npm |
| 667 tests, 0 failures | Clean baseline | Phase 5 adds ~200 tests |
| Build: 18 modules, 803-line app.js | Room for 3-4 new modules | AI consumer slots in at position 15-17 |

### Key insight:
- The reading infrastructure is complete. grid-core.js has every query function Phase 5 needs. The schema already reserves channel.ai and allows additionalProperties on project. No schema changes required. The browser confirmed full functionality.

## License

Proprietary - see [LICENSE](file:///e:/co/GRID/LICENSE) file for details.
Copyright (c) 2026 Socialawy. All rights reserved.

---

**GRID v0.1.0** - Phases 0, 1, 2, 3, 4, 6 Complete ✅
5 -> 7 -> 8