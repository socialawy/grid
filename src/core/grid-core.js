/**
 * grid-core.js — Pure Logic Library for .grid Format v0.1.0
 * Zero DOM. Zero dependencies. Pure functions.
 * Works in: Browser, Node.js, Deno, Bun
 * 
 * @module grid-core
 * @version 0.1.0
 */

// ============================================================
// CONSTANTS
// ============================================================

const VERSION = '0.1.0';
const FORMAT_ID = 'grid';

/**
 * Default density mapping by character visual weight.
 * Advisory — consumers may override.
 */
const DENSITY_MAP = {
  ' ': 0.0,
  '.': 0.05, '`': 0.05,
  '-': 0.2, ':': 0.2, "'": 0.2,
  ';': 0.3, ',': 0.3, '~': 0.35,
  '+': 0.5, '=': 0.5, '*': 0.55,
  '^': 0.45, '|': 0.4, '/': 0.4, '\\': 0.4,
  '?': 0.5, '!': 0.5, 'x': 0.55, 'o': 0.55,
  '#': 0.8, '$': 0.8, '%': 0.75, '&': 0.75,
  '@': 0.9,
  '░': 0.3, '▒': 0.55, '▓': 0.8, '█': 1.0
};

const VALID_SEMANTICS = [
  'solid', 'void', 'fluid', 'emissive', 'entity', 'control', 'boundary'
];

const VALID_LAYERS = ['visual', 'audio', 'spatial', 'narrative', 'ai'];

// ============================================================
// UUID v4 GENERATOR (no dependency)
// ============================================================

/**
 * Generate a UUID v4 string.
 * Uses crypto.randomUUID if available, falls back to manual generation.
 * @returns {string}
 */
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Secure fallback using crypto.getRandomValues
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32)
    ].join('-');
  }
  // Absolute fallback (no crypto)  timestamp-derived, still valid UUID v4 shape
  const ts = Date.now().toString(16).padStart(12, '0');
  const rnd = Array.from({ length: 20 }, (_, i) =>
    ((ts.codePointAt(i % ts.length) * 7 + i * 13) % 16).toString(16)
  ).join('');
  return `${rnd.slice(0, 8)}-${rnd.slice(8, 12)}-4${rnd.slice(13, 16)}-8${rnd.slice(17, 20)}-${ts}`;
}

// ============================================================
// CORE: GRID CREATION
// ============================================================

/**
 * Create a new .grid project object.
 * @param {number} width - Grid columns (1–1000)
 * @param {number} height - Grid rows (1–1000)
 * @param {string} [charset='@#$%&*+=-.~ '] - Available characters
 * @param {string} [defaultColor='#00ff00'] - Default cell color
 * @param {object} [options={}] - Optional overrides
 * @param {string} [options.name] - Project name
 * @param {string} [options.defaultChar] - Fill character
 * @param {string} [options.background] - Background color
 * @param {string} [options.fontFamily] - Preferred font
 * @returns {object} A valid .grid object with one empty frame
 */
function createGrid(width, height, charset, defaultColor, options = {}) {
  if (!Number.isInteger(width) || width < 1 || width > 1000) {
    throw new RangeError(`width must be integer 1–1000, got ${width}`);
  }
  if (!Number.isInteger(height) || height < 1 || height > 1000) {
    throw new RangeError(`height must be integer 1–1000, got ${height}`);
  }

  charset = charset || '@#$%&*+=-.~ ';
  defaultColor = defaultColor || '#00ff00';
  const defaultChar = options.defaultChar || ' ';
  const now = new Date().toISOString();

  const grid = {
    grid: FORMAT_ID,
    version: VERSION,
    meta: {
      id: generateId(),
      name: options.name || 'Untitled',
      created: now,
      modified: now,
      author: options.author || '',
      tags: [],
      notes: ''
    },
    canvas: {
      width,
      height,
      charset,
      defaultChar,
      defaultColor,
      background: options.background || '#000000',
      fontFamily: options.fontFamily || 'monospace'
    },
    frames: [],
    sequences: [],
    project: {
      bpm: 120,
      scale: 'chromatic',
      key: 'C',
      palette: {},
      tier: 0
    }
  };

  // Add initial empty frame
  grid.frames.push(createFrame(grid));
  return grid;
}

// ============================================================
// CORE: FRAME OPERATIONS
// ============================================================

/**
 * Create a new empty frame for a grid.
 * @param {object} grid - Parent grid object
 * @param {string} [label] - Optional frame label
 * @returns {object} A new Frame object
 */
function createFrame(grid, label) {
  const index = grid.frames ? grid.frames.length : 0;
  return {
    id: `frame_${String(index + 1).padStart(3, '0')}`,
    index,
    label: label || '',
    duration: null,
    cells: [],
    layers: ['visual']
  };
}

/**
 * Add a frame to a grid (immutable — returns new grid).
 * @param {object} grid - Source grid
 * @param {object} frame - Frame to add
 * @returns {object} New grid with frame added
 */
function addFrame(grid, frame) {
  const newFrame = { ...frame, index: grid.frames.length };
  return {
    ...grid,
    meta: { ...grid.meta, modified: new Date().toISOString() },
    frames: [...grid.frames, newFrame]
  };
}

/**
 * Remove a frame from a grid by ID (immutable).
 * @param {object} grid - Source grid
 * @param {string} frameId - ID of frame to remove
 * @returns {object} New grid without the specified frame
 */
function removeFrame(grid, frameId) {
  const filtered = grid.frames
    .filter(f => f.id !== frameId)
    .map((f, i) => ({ ...f, index: i }));

  if (filtered.length === grid.frames.length) {
    throw new Error(`Frame not found: ${frameId}`);
  }
  if (filtered.length === 0) {
    throw new Error('Cannot remove last frame');
  }

  return {
    ...grid,
    meta: { ...grid.meta, modified: new Date().toISOString() },
    frames: filtered
  };
}

/**
 * Get a frame by ID.
 * @param {object} grid - Grid object
 * @param {string} frameId - Frame ID
 * @returns {object|null} Frame object or null
 */
function getFrame(grid, frameId) {
  return grid.frames.find(f => f.id === frameId) || null;
}

/**
 * Get a frame by index.
 * @param {object} grid - Grid object
 * @param {number} index - Frame index
 * @returns {object|null} Frame object or null
 */
function getFrameByIndex(grid, index) {
  return grid.frames.find(f => f.index === index) || null;
}

// ============================================================
// CORE: CELL OPERATIONS
// ============================================================

/**
 * Calculate density for a character using the default mapping.
 * @param {string} char - Single character
 * @returns {number} Density value 0.0–1.0
 */
function calcDensity(char) {
  if (!char || char.length === 0) return 0.0;
  if (DENSITY_MAP[char] !== undefined) return DENSITY_MAP[char];
  // Unknown characters: estimate based on char code
  const code = char.charCodeAt(0);
  if (code < 128) return 0.5; // ASCII default
  return 0.6; // Unicode default (typically heavier glyphs)
}

/**
 * Infer semantic type from a character.
 * @param {string} char - Single character
 * @returns {string} Semantic type string
 */
function inferSemantic(char) {
  if (!char || char === ' ') return 'void';
  if ('~≈'.includes(char)) return 'fluid';
  if ('*✦✧☆★♥♦⚡'.includes(char)) return 'emissive';
  if ('@AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz'.includes(char)) return 'entity';
  if ('|─│┌┐└┘├┤┬┴┼'.includes(char)) return 'boundary';
  return 'solid';
}

/**
 * Create a fully resolved cell object.
 * Fills in density and semantic if not provided.
 * @param {number} x - Column
 * @param {number} y - Row
 * @param {string} char - Character
 * @param {object} [options={}] - Optional cell properties
 * @returns {object} Cell object
 */
function createCell(x, y, char, options = {}) {
  if (!Number.isInteger(x) || x < 0) throw new RangeError(`x must be non-negative integer, got ${x}`);
  if (!Number.isInteger(y) || y < 0) throw new RangeError(`y must be non-negative integer, got ${y}`);
  if (typeof char !== 'string' || char.length === 0 || char.length > 2) {
    throw new TypeError(`char must be 1-2 character string, got "${char}"`);
  }

  const cell = {
    x,
    y,
    char
  };

  // Optional fields — only set if provided or calculable
  if (options.color) cell.color = options.color;
  if (options.density !== undefined) {
    cell.density = options.density;
  } else {
    cell.density = calcDensity(char);
  }
  if (options.semantic) {
    cell.semantic = options.semantic;
  } else {
    cell.semantic = inferSemantic(char);
  }
  if (options.channel) cell.channel = options.channel;

  return cell;
}

/**
 * Set a cell on a frame (immutable — returns new frame).
 * If a cell already exists at (x, y), it is replaced.
 * @param {object} frame - Source frame
 * @param {number} x - Column
 * @param {number} y - Row
 * @param {object} cellData - { char, color?, density?, semantic?, channel? }
 * @returns {object} New frame with cell set
 */
function setCell(frame, x, y, cellData) {
  const newCell = createCell(x, y, cellData.char, cellData);
  const cells = frame.cells.filter(c => !(c.x === x && c.y === y));
  cells.push(newCell);
  return { ...frame, cells };
}

/**
 * Get a cell from a frame at position (x, y).
 * Returns null if no cell exists (position uses canvas defaults).
 * @param {object} frame - Frame object
 * @param {number} x - Column
 * @param {number} y - Row
 * @returns {object|null} Cell object or null
 */
function getCell(frame, x, y) {
  return frame.cells.find(c => c.x === x && c.y === y) || null;
}

/**
 * Get a resolved cell — returns the actual cell or a default cell.
 * @param {object} frame - Frame object
 * @param {number} x - Column
 * @param {number} y - Row
 * @param {object} canvas - Canvas object (for defaults)
 * @returns {object} Cell object (never null)
 */
function getResolvedCell(frame, x, y, canvas) {
  const existing = getCell(frame, x, y);
  if (existing) return existing;
  return {
    x,
    y,
    char: canvas.defaultChar,
    color: canvas.defaultColor,
    density: calcDensity(canvas.defaultChar),
    semantic: inferSemantic(canvas.defaultChar)
  };
}

/**
 * Remove a cell from a frame (immutable).
 * @param {object} frame - Source frame
 * @param {number} x - Column
 * @param {number} y - Row
 * @returns {object} New frame without the cell at (x, y)
 */
function removeCell(frame, x, y) {
  return {
    ...frame,
    cells: frame.cells.filter(c => !(c.x === x && c.y === y))
  };
}

/**
 * Get all cells matching a semantic type.
 * @param {object} frame - Frame object
 * @param {string} semantic - Semantic type to filter by
 * @returns {object[]} Array of matching cells
 */
function getCellsBySemantic(frame, semantic) {
  return frame.cells.filter(c => c.semantic === semantic);
}

/**
 * Get all cells that have a specific channel populated.
 * @param {object} frame - Frame object
 * @param {string} channelName - 'audio' | 'spatial' | 'narrative' | 'ai'
 * @returns {object[]} Array of cells with that channel
 */
function getCellsByChannel(frame, channelName) {
  return frame.cells.filter(c => c.channel && c.channel[channelName]);
}

// ============================================================
// CORE: MAP EXTRACTORS
// ============================================================

/**
 * Extract a 2D density map from a frame.
 * @param {object} frame - Frame object
 * @param {object} canvas - Canvas object
 * @returns {number[][]} 2D array [y][x] of density values 0.0–1.0
 */
function getDensityMap(frame, canvas) {
  const map = [];
  const defaultDensity = calcDensity(canvas.defaultChar);
  for (let y = 0; y < canvas.height; y++) {
    map[y] = new Array(canvas.width).fill(defaultDensity);
  }
  for (const cell of frame.cells) {
    if (cell.y < canvas.height && cell.x < canvas.width) {
      map[cell.y][cell.x] = cell.density !== undefined ? cell.density : calcDensity(cell.char);
    }
  }
  return map;
}

/**
 * Extract a 2D semantic map from a frame.
 * @param {object} frame - Frame object
 * @param {object} canvas - Canvas object
 * @returns {string[][]} 2D array [y][x] of semantic strings
 */
function getSemanticMap(frame, canvas) {
  const defaultSemantic = inferSemantic(canvas.defaultChar);
  const map = [];
  for (let y = 0; y < canvas.height; y++) {
    map[y] = new Array(canvas.width).fill(defaultSemantic);
  }
  for (const cell of frame.cells) {
    if (cell.y < canvas.height && cell.x < canvas.width) {
      map[cell.y][cell.x] = cell.semantic || inferSemantic(cell.char);
    }
  }
  return map;
}

/**
 * Extract a 2D color map from a frame.
 * @param {object} frame - Frame object
 * @param {object} canvas - Canvas object
 * @returns {string[][]} 2D array [y][x] of hex color strings
 */
function getColorMap(frame, canvas) {
  const map = [];
  for (let y = 0; y < canvas.height; y++) {
    map[y] = new Array(canvas.width).fill(canvas.defaultColor);
  }
  for (const cell of frame.cells) {
    if (cell.y < canvas.height && cell.x < canvas.width) {
      map[cell.y][cell.x] = cell.color || canvas.defaultColor;
    }
  }
  return map;
}

/**
 * Extract a 2D character map from a frame.
 * @param {object} frame - Frame object
 * @param {object} canvas - Canvas object
 * @returns {string[][]} 2D array [y][x] of characters
 */
function getCharMap(frame, canvas) {
  const map = [];
  for (let y = 0; y < canvas.height; y++) {
    map[y] = new Array(canvas.width).fill(canvas.defaultChar);
  }
  for (const cell of frame.cells) {
    if (cell.y < canvas.height && cell.x < canvas.width) {
      map[cell.y][cell.x] = cell.char;
    }
  }
  return map;
}

// ============================================================
// CORE: SERIALIZATION
// ============================================================

/**
 * Serialize a grid object to JSON string.
 * @param {object} grid - Grid object
 * @param {boolean} [pretty=true] - Pretty-print with indentation
 * @returns {string} JSON string
 */
function serializeGrid(grid, pretty = true) {
  return JSON.stringify(grid, null, pretty ? 2 : 0);
}

/**
 * Deserialize a JSON string to a grid object.
 * @param {string} jsonString - JSON string
 * @returns {object} Grid object
 * @throws {SyntaxError} If JSON is invalid
 * @throws {Error} If format identifier is missing
 */
function deserializeGrid(jsonString) {
  const obj = JSON.parse(jsonString);
  if (obj.grid !== FORMAT_ID) {
    throw new Error(`Not a .grid file: missing format identifier "grid", found "${obj.grid}"`);
  }
  return obj;
}

// ============================================================
// CORE: VALIDATION
// ============================================================

/**
 * Validate a grid object against the spec.
 * Lightweight validation without full JSON Schema (no ajv dependency).
 * @param {object} grid - Object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateGrid(grid) {
  const errors = [];

  // Top-level
  if (!grid || typeof grid !== 'object') {
    return { valid: false, errors: ['Grid must be an object'] };
  }
  if (grid.grid !== FORMAT_ID) errors.push(`"grid" field must be "${FORMAT_ID}"`);
  if (typeof grid.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(grid.version)) {
    errors.push('"version" must be a semver string (e.g., "0.1.0")');
  }

  // Meta
  if (!grid.meta || typeof grid.meta !== 'object') {
    errors.push('"meta" object is required');
  } else {
    if (!grid.meta.id) errors.push('"meta.id" is required');
    if (!grid.meta.name) errors.push('"meta.name" is required');
    if (!grid.meta.created) errors.push('"meta.created" is required');
    if (!grid.meta.modified) errors.push('"meta.modified" is required');
  }

  // Canvas
  if (!grid.canvas || typeof grid.canvas !== 'object') {
    errors.push('"canvas" object is required');
  } else {
    const c = grid.canvas;
    if (!Number.isInteger(c.width) || c.width < 1 || c.width > 1000) {
      errors.push('"canvas.width" must be integer 1–1000');
    }
    if (!Number.isInteger(c.height) || c.height < 1 || c.height > 1000) {
      errors.push('"canvas.height" must be integer 1–1000');
    }
    if (typeof c.charset !== 'string' || c.charset.length === 0) {
      errors.push('"canvas.charset" must be a non-empty string');
    }
    if (typeof c.defaultChar !== 'string' || c.defaultChar.length === 0 || c.defaultChar.length > 2) {
      errors.push('"canvas.defaultChar" must be 1-2 characters');
    }
    if (typeof c.defaultColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c.defaultColor)) {
      errors.push('"canvas.defaultColor" must be hex color (#RRGGBB)');
    }
  }

  // Frames
  if (!Array.isArray(grid.frames)) {
    errors.push('"frames" must be an array');
  } else if (grid.frames.length === 0) {
    errors.push('"frames" must contain at least one frame');
  } else {
    const frameIds = new Set();
    for (let i = 0; i < grid.frames.length; i++) {
      const f = grid.frames[i];
      const prefix = `frames[${i}]`;
      if (!f.id) errors.push(`${prefix}.id is required`);
      if (frameIds.has(f.id)) errors.push(`${prefix}.id "${f.id}" is duplicate`);
      frameIds.add(f.id);
      if (typeof f.index !== 'number') errors.push(`${prefix}.index is required`);
      if (!Array.isArray(f.cells)) errors.push(`${prefix}.cells must be an array`);
      else {
        for (let j = 0; j < f.cells.length; j++) {
          const cell = f.cells[j];
          const cp = `${prefix}.cells[${j}]`;
          if (typeof cell.x !== 'number' || cell.x < 0) errors.push(`${cp}.x must be non-negative integer`);
          if (typeof cell.y !== 'number' || cell.y < 0) errors.push(`${cp}.y must be non-negative integer`);
          if (typeof cell.char !== 'string' || cell.char.length === 0) errors.push(`${cp}.char is required`);
          if (grid.canvas) {
            if (cell.x >= grid.canvas.width) errors.push(`${cp}.x (${cell.x}) exceeds canvas width (${grid.canvas.width})`);
            if (cell.y >= grid.canvas.height) errors.push(`${cp}.y (${cell.y}) exceeds canvas height (${grid.canvas.height})`);
          }
          if (cell.density !== undefined && (cell.density < 0 || cell.density > 1)) {
            errors.push(`${cp}.density must be 0.0–1.0`);
          }
          if (cell.semantic && !VALID_SEMANTICS.includes(cell.semantic)) {
            errors.push(`${cp}.semantic "${cell.semantic}" is not a recognized type`);
          }
        }
      }
      if (f.layers) {
        for (const layer of f.layers) {
          if (!VALID_LAYERS.includes(layer)) {
            errors.push(`${prefix}.layers contains unknown layer "${layer}"`);
          }
        }
      }
    }
  }

  // Sequences
  if (grid.sequences && Array.isArray(grid.sequences)) {
    const frameIds = new Set(grid.frames.map(f => f.id));
    for (let i = 0; i < grid.sequences.length; i++) {
      const s = grid.sequences[i];
      const sp = `sequences[${i}]`;
      if (!s.id) errors.push(`${sp}.id is required`);
      if (!s.name) errors.push(`${sp}.name is required`);
      if (!Array.isArray(s.frameIds) || s.frameIds.length === 0) {
        errors.push(`${sp}.frameIds must be a non-empty array`);
      } else {
        for (const fid of s.frameIds) {
          if (!frameIds.has(fid)) {
            errors.push(`${sp}.frameIds references unknown frame "${fid}"`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================
// CORE: UTILITIES
// ============================================================

/**
 * Deep clone a grid object (safe copy, no shared references).
 * @param {object} grid - Grid object
 * @returns {object} Deep copy
 */
function cloneGrid(grid) {
  return JSON.parse(JSON.stringify(grid));
}

/**
 * Update meta.modified timestamp.
 * @param {object} grid - Grid object
 * @returns {object} New grid with updated timestamp
 */
function touchGrid(grid) {
  return {
    ...grid,
    meta: { ...grid.meta, modified: new Date().toISOString() }
  };
}

/**
 * Get grid stats.
 * @param {object} grid - Grid object
 * @returns {object} { frameCount, totalCells, canvasSize, version }
 */
function getGridStats(grid) {
  return {
    frameCount: grid.frames.length,
    totalCells: grid.frames.reduce((sum, f) => sum + f.cells.length, 0),
    canvasSize: `${grid.canvas.width}x${grid.canvas.height}`,
    sparsity: grid.frames.map(f => {
      const total = grid.canvas.width * grid.canvas.height;
      return { frameId: f.id, filled: f.cells.length, total, percent: ((f.cells.length / total) * 100).toFixed(1) + '%' };
    }),
    version: grid.version
  };
}

// ============================================================
// EXPORTS
// ============================================================

const GridCore = {
  // Constants
  VERSION,
  FORMAT_ID,
  DENSITY_MAP,
  VALID_SEMANTICS,
  VALID_LAYERS,

  // Creation
  createGrid,
  createFrame,
  createCell,
  generateId,

  // Frame ops
  addFrame,
  removeFrame,
  getFrame,
  getFrameByIndex,

  // Cell ops
  setCell,
  getCell,
  getResolvedCell,
  removeCell,
  getCellsBySemantic,
  getCellsByChannel,
  calcDensity,
  inferSemantic,

  // Map extractors
  getDensityMap,
  getSemanticMap,
  getColorMap,
  getCharMap,

  // Serialization
  serializeGrid,
  deserializeGrid,

  // Validation
  validateGrid,

  // Utilities
  cloneGrid,
  touchGrid,
  getGridStats
};

// Universal export (ESM + CJS + global)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GridCore;
}
if (typeof window !== 'undefined') {
  window.GridCore = GridCore;
}
export default GridCore;
