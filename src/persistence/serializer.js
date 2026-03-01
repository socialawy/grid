/**
 * serializer.js — Project serialization with compact mode and version migration
 *
 * Wraps grid-core's serializeGrid/deserializeGrid, adding:
 * - Compact mode (strip default-value fields to reduce file size)
 * - Version migration shims (v0.0.x -> v0.1.0)
 * - Extended project validation
 *
 * @module serializer
 */

import GridCore from '../core/grid-core.js';

const {
  calcDensity,
  inferSemantic,
  serializeGrid,
  deserializeGrid,
  validateGrid,
  cloneGrid,
  generateId,
  VERSION,
  FORMAT_ID,
} = GridCore;

// ============================================================
// COMPACT
// ============================================================

/**
 * Strip default-value fields from a grid to reduce size.
 * Removes density when it equals calcDensity(char), semantic when it equals
 * inferSemantic(char), and empty channel objects.
 * Never strips schema-required fields (x, y, char).
 *
 * @param {object} grid - Grid object
 * @returns {object} Deep-cloned grid with default fields stripped
 */
function compactGrid(grid) {
  const out = cloneGrid(grid);

  for (const frame of out.frames) {
    for (const cell of frame.cells) {
      // Strip density if it matches the default for this char
      if (cell.density !== undefined && cell.density === calcDensity(cell.char)) {
        delete cell.density;
      }

      // Strip semantic if it matches the default for this char
      if (cell.semantic !== undefined && cell.semantic === inferSemantic(cell.char)) {
        delete cell.semantic;
      }

      // Strip empty channel objects
      if (cell.channel) {
        // Remove empty sub-channels
        for (const key of Object.keys(cell.channel)) {
          if (cell.channel[key] && typeof cell.channel[key] === 'object' &&
              Object.keys(cell.channel[key]).length === 0) {
            delete cell.channel[key];
          }
        }
        // Remove channel itself if now empty
        if (Object.keys(cell.channel).length === 0) {
          delete cell.channel;
        }
      }
    }
  }

  return out;
}

// ============================================================
// SERIALIZE
// ============================================================

/**
 * Serialize a grid project to a JSON string.
 *
 * @param {object} grid - Grid object
 * @param {object} [opts={}]
 * @param {boolean} [opts.compact=false] - Strip default-value fields first
 * @param {boolean} [opts.pretty=true] - Pretty-print with 2-space indent
 * @returns {string} JSON string
 */
function serializeProject(grid, opts = {}) {
  const compact = opts.compact === true;
  const pretty = opts.pretty !== false; // default true

  let target = cloneGrid(grid);

  // Update modified timestamp
  target.meta.modified = new Date().toISOString();

  if (compact) {
    target = compactGrid(target);
  }

  return JSON.stringify(target, null, pretty ? 2 : 0);
}

// ============================================================
// VERSION MIGRATION
// ============================================================

/**
 * Migrate a grid object from older versions to v0.1.0.
 * @param {object} grid - Parsed grid object
 * @returns {object} Migrated grid object
 */
function migrateToV010(grid) {
  // Ensure project object
  if (!grid.project) {
    grid.project = {
      bpm: 120,
      scale: 'chromatic',
      key: 'C',
      palette: {},
      tier: 0
    };
  }

  // Ensure sequences array
  if (!grid.sequences) {
    grid.sequences = [];
  }

  // Ensure meta fields
  if (grid.meta) {
    if (!grid.meta.author && grid.meta.author !== '') grid.meta.author = '';
    if (!grid.meta.tags) grid.meta.tags = [];
    if (!grid.meta.notes && grid.meta.notes !== '') grid.meta.notes = '';
  }

  // Ensure canvas fields
  if (grid.canvas) {
    if (!grid.canvas.background) grid.canvas.background = '#000000';
    if (!grid.canvas.fontFamily) grid.canvas.fontFamily = 'monospace';
  }

  // Ensure frame fields
  if (Array.isArray(grid.frames)) {
    for (const frame of grid.frames) {
      if (!frame.layers) frame.layers = ['visual'];
      if (frame.duration === undefined) frame.duration = null;
      if (frame.label === undefined) frame.label = '';
    }
  }

  grid.version = VERSION;
  return grid;
}

// ============================================================
// DESERIALIZE
// ============================================================

/**
 * Deserialize a JSON string to a grid project object.
 * Handles version migration and re-inflates compacted cells.
 *
 * @param {string} jsonString - JSON string
 * @returns {object} Grid object with all fields populated
 * @throws {SyntaxError} If JSON is invalid
 * @throws {Error} If format identifier is missing or invalid
 */
function deserializeProject(jsonString) {
  if (typeof jsonString !== 'string') {
    throw new TypeError('deserializeProject expects a JSON string');
  }

  let grid;
  try {
    grid = JSON.parse(jsonString);
  } catch (e) {
    throw new SyntaxError(`Invalid JSON: ${e.message}`);
  }

  // Verify format identifier
  if (!grid || typeof grid !== 'object' || grid.grid !== FORMAT_ID) {
    throw new Error(
      `Not a .grid file: missing format identifier "grid", found "${grid ? grid.grid : undefined}"`
    );
  }

  // Version migration
  if (grid.version && grid.version < '0.1.0') {
    grid = migrateToV010(grid);
  } else if (!grid.version) {
    grid = migrateToV010(grid);
  }

  // Re-inflate compacted cells
  if (Array.isArray(grid.frames)) {
    for (const frame of grid.frames) {
      if (Array.isArray(frame.cells)) {
        for (const cell of frame.cells) {
          if (cell.density === undefined) {
            cell.density = calcDensity(cell.char);
          }
          if (cell.semantic === undefined) {
            cell.semantic = inferSemantic(cell.char);
          }
        }
      }
    }
  }

  return grid;
}

// ============================================================
// VALIDATE
// ============================================================

/**
 * Validate a grid project object.
 * Delegates to grid-core's validateGrid and adds extra project-level checks.
 *
 * @param {object} grid - Grid object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateProject(grid) {
  // Start with grid-core validation
  const result = validateGrid(grid);

  // If grid is null/non-object, grid-core already flagged it; return early
  if (!grid || typeof grid !== 'object') {
    result.valid = result.errors.length === 0;
    return result;
  }

  // Extra: verify project object
  if (!grid.project || typeof grid.project !== 'object') {
    result.errors.push('"project" object is required');
  }

  // Extra: verify meta.id is UUID-like
  if (grid.meta && grid.meta.id) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(grid.meta.id)) {
      result.errors.push('"meta.id" must be a valid UUID format');
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

// ============================================================
// EXPORTS
// ============================================================

const Serializer = {
  compactGrid,
  serializeProject,
  deserializeProject,
  validateProject,
};

// Universal export (ESM + CJS + global)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Serializer;
}
if (typeof window !== 'undefined') {
  window.Serializer = Serializer;
}
export { compactGrid, serializeProject, deserializeProject, validateProject };
export default Serializer;
