/**
 * instance-buffer.js — Frame + Canvas → Float32Array for WebGL2 instancing
 * Pure function. Zero GL dependency. Zero DOM.
 *
 * Buffer layout per instance (5 floats, 20 bytes):
 *   [charIndex, fgR, fgG, fgB, density]
 *
 * Cell position derived from gl_InstanceID in vertex shader.
 * Instance order: row-major (y=0,x=0), (y=0,x=1), ... (y=H-1,x=W-1)
 *
 * @module instance-buffer
 * @version 1.0.0
 */

const FLOATS_PER_INSTANCE = 5;

/**
 * Parse a hex color string to [r, g, b] in 0.0–1.0 range.
 * Handles #RGB and #RRGGBB.
 * @param {string} hex
 * @returns {number[]} [r, g, b]
 */
function parseHexColor(hex) {
  if (!hex?.startsWith('#')) return [0, 1, 0]; // fallback green

  let r, g, b;
  if (hex.length === 4) {
    // #RGB → #RRGGBB
    r = Number.parseInt(hex[1] + hex[1], 16);
    g = Number.parseInt(hex[2] + hex[2], 16);
    b = Number.parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = Number.parseInt(hex.slice(1, 3), 16);
    g = Number.parseInt(hex.slice(3, 5), 16);
    b = Number.parseInt(hex.slice(5, 7), 16);
  } else {
    return [0, 1, 0]; // fallback green
  }

  return [r / 255, g / 255, b / 255];
}

/**
 * Default density by character visual weight.
 * Mirrors grid-core.js DENSITY_MAP. Duplicated here to keep module pure/standalone.
 * @param {string} ch
 * @returns {number}
 */
function _quickDensity(ch) {
  if (!ch || ch === ' ') return 0;
  const code = ch.codePointAt(0);
  // Block elements
  if (ch === '\u2588') return 1;
  if (ch === '\u2593') return 0.8;
  if (ch === '\u2592') return 0.55;
  if (ch === '\u2591') return 0.3;
  // Common ASCII
  if ('#@'.includes(ch)) return 0.85;
  if ('$%&'.includes(ch)) return 0.75;
  if ('*+='.includes(ch)) return 0.5;
  if (String.raw`/\|^`.includes(ch)) return 0.4;
  if ('-:;'.includes(ch)) return 0.25;
  if ('.`'.includes(ch)) return 0.05;
  if (code < 128) return 0.5;
  return 0.6;
}

/**
 * Build the instance data buffer for a frame.
 *
 * @param {object} frame - Frame object (from .grid)
 * @param {object} canvas - Canvas object (from .grid)
 * @param {Map<string, number>} charIndexMap - Char → atlas index
 * @param {number} defaultIndex - Atlas index for defaultChar
 * @returns {Float32Array} Flat buffer, length = width * height * 5
 */
function buildInstanceBuffer(frame, canvas, charIndexMap, defaultIndex) {
  const { width, height, defaultChar, defaultColor } = canvas;
  const totalCells = width * height;
  const buffer = new Float32Array(totalCells * FLOATS_PER_INSTANCE);

  // Defaults
  const defCharIdx = defaultIndex;
  const defColor = parseHexColor(defaultColor);
  const defDensity = _quickDensity(defaultChar);

  // Fill with defaults
  for (let i = 0; i < totalCells; i++) {
    const offset = i * FLOATS_PER_INSTANCE;
    buffer[offset] = defCharIdx;
    buffer[offset + 1] = defColor[0];
    buffer[offset + 2] = defColor[1];
    buffer[offset + 3] = defColor[2];
    buffer[offset + 4] = defDensity;
  }

  // Build lookup for sparse cells: key = y * width + x
  // Overwrite only the cells that exist
  for (const cell of frame.cells) {
    const { x, y } = cell;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const i = y * width + x;
    const offset = i * FLOATS_PER_INSTANCE;

    // Char index
    const idx = charIndexMap.get(cell.char);
    buffer[offset] = idx !== undefined ? idx : defaultIndex;

    // Color
    const color = cell.color ? parseHexColor(cell.color) : defColor;
    buffer[offset + 1] = color[0];
    buffer[offset + 2] = color[1];
    buffer[offset + 3] = color[2];

    // Density
    buffer[offset + 4] = cell.density !== undefined
      ? cell.density
      : _quickDensity(cell.char);
  }

  return buffer;
}

/**
 * Get the expected buffer byte size for a grid.
 * @param {number} width
 * @param {number} height
 * @returns {number} Bytes
 */
function getBufferByteSize(width, height) {
  return width * height * FLOATS_PER_INSTANCE * 4;
}

// --- Exports ---
const InstanceBuffer = {
  FLOATS_PER_INSTANCE,
  buildInstanceBuffer,
  parseHexColor,
  getBufferByteSize
};

if (module !== undefined && module.exports) {
  module.exports = InstanceBuffer;
}
if (globalThis.window !== undefined) {
  globalThis.InstanceBuffer = InstanceBuffer;
}
export { FLOATS_PER_INSTANCE, buildInstanceBuffer, parseHexColor, getBufferByteSize };