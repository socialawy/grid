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

## Phase 0 Status ✅

- [x] **Schema Definition** - Complete .grid format v0.1.0 specification
- [x] **JSON Schema** - AJV-compatible validation schema
- [x] **Core Library** - Pure JavaScript logic (33 functions, zero dependencies)
- [x] **Canvas Renderer** - 2D rendering with animation support
- [x] **Example Files** - 3 validated examples (minimal, heartbeat, mist-demo)

## Files

### Core
- `grid-core.js` - Pure logic library, works in Node/Browser/Deno
- `canvas-renderer.js` - Canvas2D renderer with playback API

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

## Next Steps

See `DOCS/ACTION-PLAN.md` for the complete development roadmap. Phase 1 will focus on:

- HTML proof-of-concept editor
- Test suite implementation
- Performance optimization

## License

Proprietary - see [LICENSE](file:///e:/co/GRID/LICENSE) file for details.
Copyright (c) 2026 Socialawy. All rights reserved.

---

**GRID v0.1.0** - Phase 1 Complete ✅
