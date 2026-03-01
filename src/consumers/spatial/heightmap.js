/**
 * heightmap.js — Grid-to-Heightmap Engine
 * Phase 4, Task 4.1
 *
 * Pure functions. Zero DOM. Zero Three.js dependency.
 * Reads channel.spatial from .grid cells → produces heightmap data
 * consumable by scene-builder.js (Three.js) or any 3D consumer.
 *
 * Cell → Heightmap mapping:
 *   density       → elevation (0.0–1.0)
 *   semantic      → material type (solid/void/fluid/emissive/entity/control/boundary)
 *   color         → material color hint (hex string)
 *   char          → surface detail hint
 *   channel.spatial.height   → override elevation if present
 *   channel.spatial.material → override material if present
 */

// ─── MATERIAL DEFINITIONS ───────────────────────────────────────────────────

/**
 * Canonical material table.
 * Each semantic maps to a default THREE-friendly material descriptor.
 * scene-builder.js translates these to actual Three.js materials.
 */
const MATERIALS = {
  solid:    { type: 'standard', roughness: 0.8, metalness: 0.0, receiveShadow: true,  castShadow: true  },
  void:     { type: 'none'    , roughness: 1.0, metalness: 0.0, receiveShadow: false, castShadow: false },
  fluid:    { type: 'standard', roughness: 0.1, metalness: 0.0, receiveShadow: true,  castShadow: false, transparent: true, opacity: 0.75 },
  emissive: { type: 'standard', roughness: 0.5, metalness: 0.2, receiveShadow: false, castShadow: true,  emissiveIntensity: 1.0 },
  entity:   { type: 'standard', roughness: 0.4, metalness: 0.6, receiveShadow: true,  castShadow: true  },
  control:  { type: 'none'    , roughness: 1.0, metalness: 0.0, receiveShadow: false, castShadow: false },
  boundary: { type: 'standard', roughness: 0.9, metalness: 0.1, receiveShadow: true,  castShadow: true  },
};

const MATERIAL_NAMES = Object.keys(MATERIALS);
const DEFAULT_MATERIAL = 'solid';
const DEFAULT_COLOR    = '#888888';
const DEFAULT_ELEVATION = 0.5;

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Clamp a value to [min, max].
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/**
 * Resolve elevation for a single cell.
 * Priority: channel.spatial.height → density → DEFAULT_ELEVATION
 * @param {object} cell
 * @returns {number} 0.0–1.0
 */
function cellToElevation(cell) {
  if (!cell) return 0.0;

  // Explicit spatial height takes priority
  const spatialHeight = cell.channel?.spatial?.height;
  if (typeof spatialHeight === 'number' && isFinite(spatialHeight)) {
    return clamp(spatialHeight, 0.0, 1.0);
  }

  // Fall back to density
  const density = cell.density;
  if (typeof density === 'number' && isFinite(density)) {
    return clamp(density, 0.0, 1.0);
  }

  return DEFAULT_ELEVATION;
}

/**
 * Resolve material name for a single cell.
 * Priority: channel.spatial.material → semantic → DEFAULT_MATERIAL
 * @param {object} cell
 * @returns {string} one of MATERIAL_NAMES
 */
function cellToMaterial(cell) {
  if (!cell) return DEFAULT_MATERIAL;

  const spatialMat = cell.channel?.spatial?.material;
  if (spatialMat && MATERIAL_NAMES.includes(spatialMat)) {
    return spatialMat;
  }

  const semantic = cell.semantic;
  if (semantic && MATERIAL_NAMES.includes(semantic)) {
    return semantic;
  }

  return DEFAULT_MATERIAL;
}

/**
 * Resolve the display color for a cell.
 * Priority: cell.color → DEFAULT_COLOR
 * @param {object} cell
 * @returns {string} hex color string e.g. '#00ff88'
 */
function cellToColor(cell) {
  if (!cell) return DEFAULT_COLOR;
  return (typeof cell.color === 'string' && cell.color.startsWith('#'))
    ? cell.color
    : DEFAULT_COLOR;
}

// ─── CORE API ───────────────────────────────────────────────────────────────

/**
 * Convert a single .grid frame to a HeightmapData object.
 *
 * HeightmapData schema:
 * {
 *   width:    number,          // canvas width
 *   height:   number,          // canvas height (grid rows)
 *   cells:    HeightmapCell[], // flat array, row-major [y * width + x]
 *   stats:    HeightmapStats,
 *   meta:     object,          // original canvas meta passthrough
 * }
 *
 * HeightmapCell schema:
 * {
 *   x:         number,
 *   y:         number,
 *   elevation: number,   // 0.0–1.0
 *   material:  string,   // MATERIAL_NAMES key
 *   color:     string,   // hex
 *   char:      string,   // original char (surface detail hint)
 *   isEmpty:   boolean,  // true for void/control cells (skip geometry)
 * }
 *
 * @param {object} grid      — full .grid object (grid-core format)
 * @param {number} frameIndex — which frame to convert (default 0)
 * @param {object} opts
 * @param {number} opts.elevationScale — multiplier applied to elevation (default 1.0)
 * @param {number} opts.flattenBelow  — cells with elevation below this are flattened to 0 (default 0)
 * @param {boolean} opts.invertY      — flip Y axis (default false; grid Y=0 is top, 3D may want flip)
 * @returns {HeightmapData}
 */
function gridToHeightmap(grid, frameIndex = 0, opts = {}) {
  const {
    elevationScale = 1.0,
    flattenBelow   = 0,
    invertY        = false,
  } = opts;

  if (!grid || !grid.canvas) {
    throw new Error('gridToHeightmap: grid must have a canvas property');
  }

  const W = grid.canvas.width;
  const H = grid.canvas.height;

  if (!Number.isFinite(W) || W < 1 || !Number.isFinite(H) || H < 1) {
    throw new Error(`gridToHeightmap: invalid canvas dimensions ${W}x${H}`);
  }

  const frames = grid.frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('gridToHeightmap: grid has no frames');
  }

  const idx = clamp(frameIndex, 0, frames.length - 1);
  const frame = frames[idx];

  // Build a fast lookup: "x,y" → cell
  const cellMap = new Map();
  if (Array.isArray(frame.cells)) {
    for (const cell of frame.cells) {
      cellMap.set(`${cell.x},${cell.y}`, cell);
    }
  }

  // Stats accumulators
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  let solidCount   = 0;
  let voidCount    = 0;
  let emissiveCount = 0;

  // Build flat cell array in row-major order
  const cells = new Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const srcY   = invertY ? (H - 1 - y) : y;
      const cell   = cellMap.get(`${x},${srcY}`);
      const index  = y * W + x;

      let elevation = cellToElevation(cell) * elevationScale;

      // Flatten option: cells below threshold sit at 0
      if (elevation < flattenBelow) elevation = 0;

      elevation = clamp(elevation, 0.0, Infinity); // clamp to >= 0; no upper bound (scale can exceed 1)

      const material = cellToMaterial(cell);
      const isEmpty  = (material === 'void' || material === 'control' || !cell);
      const color    = cellToColor(cell);
      const char     = cell?.char ?? ' ';

      if (!isEmpty) {
        if (elevation < minElevation) minElevation = elevation;
        if (elevation > maxElevation) maxElevation = elevation;
      }

      if (!cell || material === 'void' || material === 'control') voidCount++;
      else solidCount++;
      if (!cell) {
        // no-op — absent cells counted as void above
      } else if (material === 'emissive') emissiveCount++;

      cells[index] = { x, y, elevation, material, color, char, isEmpty };
    }
  }

  if (!isFinite(minElevation)) minElevation = 0;
  if (!isFinite(maxElevation)) maxElevation = 0;

  const stats = {
    minElevation,
    maxElevation,
    elevationRange: maxElevation - minElevation,
    solidCount,
    voidCount,
    emissiveCount,
    totalCells: W * H,
    occupancy: solidCount / (W * H),
  };

  return {
    width:  W,
    height: H,
    cells,
    stats,
    meta: {
      frameIndex: idx,
      frameId: frame.id ?? null,
      canvasMeta: grid.canvas,
      elevationScale,
      invertY,
    },
  };
}

/**
 * Get a single HeightmapCell by (x, y) coordinate.
 * @param {HeightmapData} heightmap
 * @param {number} x
 * @param {number} y
 * @returns {HeightmapCell|null}
 */
function getHeightmapCell(heightmap, x, y) {
  if (x < 0 || x >= heightmap.width || y < 0 || y >= heightmap.height) return null;
  return heightmap.cells[y * heightmap.width + x] ?? null;
}

/**
 * Extract all non-empty cells from a heightmap.
 * Convenience for 3D scene builders that only want geometry cells.
 * @param {HeightmapData} heightmap
 * @returns {HeightmapCell[]}
 */
function getSolidCells(heightmap) {
  return heightmap.cells.filter(c => !c.isEmpty);
}

/**
 * Extract cells matching a specific material type.
 * @param {HeightmapData} heightmap
 * @param {string} material — one of MATERIAL_NAMES
 * @returns {HeightmapCell[]}
 */
function getCellsByMaterial(heightmap, material) {
  return heightmap.cells.filter(c => c.material === material);
}

/**
 * Normalize elevation values across the heightmap to [0, 1].
 * Returns a new HeightmapData — does not mutate input.
 * Useful when elevationScale produced out-of-range values.
 * @param {HeightmapData} heightmap
 * @returns {HeightmapData}
 */
function normalizeElevations(heightmap) {
  const { minElevation, maxElevation } = heightmap.stats;
  const range = maxElevation - minElevation;

  const cells = heightmap.cells.map(cell => {
    if (cell.isEmpty || range === 0) return { ...cell, elevation: 0 };
    return { ...cell, elevation: (cell.elevation - minElevation) / range };
  });

  return {
    ...heightmap,
    cells,
    stats: {
      ...heightmap.stats,
      minElevation: 0,
      maxElevation: range === 0 ? 0 : 1,
      elevationRange: range === 0 ? 0 : 1,
    },
  };
}

/**
 * Compute smooth normals for each cell using finite differences.
 * Returns a Float32Array of [nx, ny, nz] per cell (flat, stride 3).
 * Useful for lighting in the 3D consumer.
 *
 * @param {HeightmapData} heightmap
 * @returns {Float32Array} length = width * height * 3
 */
function computeNormals(heightmap) {
  const { width, height, cells } = heightmap;
  const normals = new Float32Array(width * height * 3);

  const getElev = (x, y) => {
    const cx = x < 0 ? 0 : x >= width  ? width  - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return cells[cy * width + cx].elevation;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      // Central differences
      const dx = getElev(x + 1, y) - getElev(x - 1, y);
      const dy = getElev(x, y + 1) - getElev(x, y - 1);

      // Normal = cross(-dx, 1, 0) × (0, 1, -dy)
      // Simplified: (-dx, 1, -dy) normalized
      const nx = -dx;
      const ny = 1.0;
      const nz = -dy;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      normals[idx]     = nx / len;
      normals[idx + 1] = ny / len;
      normals[idx + 2] = nz / len;
    }
  }

  return normals;
}

/**
 * Produce a flat Float32Array of elevation values (row-major).
 * Useful for Three.js PlaneGeometry displacement maps.
 * @param {HeightmapData} heightmap
 * @returns {Float32Array}
 */
function toElevationBuffer(heightmap) {
  const buf = new Float32Array(heightmap.width * heightmap.height);
  for (let i = 0; i < heightmap.cells.length; i++) {
    buf[i] = heightmap.cells[i].elevation;
  }
  return buf;
}

/**
 * Get material descriptor for a material name.
 * Returns a copy (safe to mutate for scene-builder customization).
 * @param {string} name
 * @returns {object}
 */
function getMaterialDescriptor(name) {
  const base = MATERIALS[name] ?? MATERIALS[DEFAULT_MATERIAL];
  return { ...base };
}

// ─── MODULE EXPORT ──────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Core conversion
    gridToHeightmap,
    // Cell accessors
    getHeightmapCell,
    getSolidCells,
    getCellsByMaterial,
    // Transforms
    normalizeElevations,
    computeNormals,
    toElevationBuffer,
    // Material system
    getMaterialDescriptor,
    MATERIALS,
    MATERIAL_NAMES,
    // Cell-level helpers (exported for testing)
    cellToElevation,
    cellToMaterial,
    cellToColor,
    // Constants
    DEFAULT_MATERIAL,
    DEFAULT_COLOR,
    DEFAULT_ELEVATION,
  };
}

if (typeof window !== 'undefined') {
  window.HeightmapEngine = {
    gridToHeightmap,
    getHeightmapCell,
    getSolidCells,
    getCellsByMaterial,
    normalizeElevations,
    computeNormals,
    toElevationBuffer,
    getMaterialDescriptor,
    MATERIALS,
    MATERIAL_NAMES,
    cellToElevation,
    cellToMaterial,
    cellToColor,
    DEFAULT_MATERIAL,
    DEFAULT_COLOR,
    DEFAULT_ELEVATION,
  };
}

export {
  gridToHeightmap,
  getHeightmapCell,
  getSolidCells,
  getCellsByMaterial,
  normalizeElevations,
  computeNormals,
  toElevationBuffer,
  getMaterialDescriptor,
  MATERIALS,
  MATERIAL_NAMES,
  cellToElevation,
  cellToMaterial,
  cellToColor,
  DEFAULT_MATERIAL,
  DEFAULT_COLOR,
  DEFAULT_ELEVATION,
};
