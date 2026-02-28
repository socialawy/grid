/**
 * image-importer.js — Image → .grid Converter
 *
 * Converts an image element to a .grid object by sampling pixel data per cell
 * and mapping brightness → ASCII char, RGB → hex color, and computing density
 * and semantic from the resulting character.
 *
 * Algorithm adapted from img-transform-animator (E:\co\img-transform-animator\index.tsx).
 * Pure function — no DOM side effects except OffscreenCanvas / fallback canvas creation.
 *
 * @module image-importer
 */

import GridCore from '../core/grid-core.js';

const { createGrid, setCell, inferSemantic } = GridCore;

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Default ASCII character ramp from darkest (most ink) to lightest (least ink).
 * Index 0 = densest char, last index = space (lightest).
 */
const DEFAULT_CHAR_RAMP = '@%#*+=-:. ';

// ============================================================
// HELPERS
// ============================================================

/**
 * Convert R, G, B component values (0–255) to '#rrggbb' hex string.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b]
    .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a sampling canvas from an image element.
 * Uses OffscreenCanvas when available; falls back to document.createElement('canvas').
 * @param {number} width
 * @param {number} height
 * @returns {{ canvas: OffscreenCanvas|HTMLCanvasElement, ctx: CanvasRenderingContext2D }}
 */
function makeSamplingCanvas(width, height) {
  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

// ============================================================
// MAIN EXPORT
// ============================================================

/**
 * Convert an image element to a .grid object.
 *
 * Each cell block (cellSize × cellSize pixels) is averaged to produce:
 *   - char    : from brightness → ramp index lookup
 *   - color   : '#rrggbb' from average RGB of the block
 *   - density : 1 - (adjusted_brightness / 255)  [0=light, 1=dark]
 *   - semantic: inferred from the resulting char via grid-core inferSemantic()
 *   - channel : {} (left as default)
 *
 * @param {HTMLImageElement|ImageBitmap} imageElement - A loaded image (naturalWidth/Height must be available)
 * @param {object} [options={}]
 * @param {string}  [options.charRamp='@%#*+=-:. '] - Character ramp, dark→light
 * @param {number}  [options.cellSize=10]            - Pixel block size per grid cell
 * @param {number}  [options.contrast=0]             - Contrast boost (-100 to +200)
 * @param {number}  [options.gridWidth]              - Force grid width  (overrides cellSize)
 * @param {number}  [options.gridHeight]             - Force grid height (overrides cellSize)
 * @param {string}  [options.defaultColor='#00ff00'] - Grid canvas defaultColor
 * @param {string}  [options.projectName='Imported Image'] - Grid meta.name
 * @returns {object} A valid .grid object
 */
function imageToGrid(imageElement, options = {}) {
  const {
    charRamp      = DEFAULT_CHAR_RAMP,
    cellSize      = 10,
    contrast      = 0,
    defaultColor  = '#00ff00',
    projectName   = 'Imported Image',
  } = options;

  const ramp       = [...charRamp];
  const rampLength = ramp.length;

  // --- Image dimensions ---
  const imgWidth  = imageElement.naturalWidth  ?? imageElement.width;
  const imgHeight = imageElement.naturalHeight ?? imageElement.height;

  if (!imgWidth || !imgHeight) {
    throw new Error('imageToGrid: imageElement has zero dimensions — is it loaded?');
  }

  // --- Sampling canvas ---
  const { ctx } = makeSamplingCanvas(imgWidth, imgHeight);
  ctx.drawImage(imageElement, 0, 0);

  // --- Grid dimensions ---
  let gridWidth  = options.gridWidth  ?? Math.max(1, Math.floor(imgWidth  / cellSize));
  let gridHeight = options.gridHeight ?? Math.max(1, Math.floor(imgHeight / cellSize));

  // Clamp to .grid spec limits (1–1000)
  gridWidth  = Math.min(1000, Math.max(1, gridWidth));
  gridHeight = Math.min(1000, Math.max(1, gridHeight));

  // Sampling block size per cell (may differ from cellSize if dimensions forced)
  const blockW = imgWidth  / gridWidth;
  const blockH = imgHeight / gridHeight;

  // Charset: unique chars from ramp (ensures grid can render every char)
  const charset = [...new Set(ramp)].join('') || ' ';

  // Contrast multiplier  (same formula as img-transform-animator)
  const contrastFactor = (100 + contrast) / 100;

  // --- Create grid ---
  let grid  = createGrid(gridWidth, gridHeight, charset, defaultColor, { name: projectName });
  let frame = grid.frames[0];

  // --- Sample each cell block ---
  for (let cy = 0; cy < gridHeight; cy++) {
    for (let cx = 0; cx < gridWidth; cx++) {
      const startX = Math.floor(cx * blockW);
      const startY = Math.floor(cy * blockH);
      const sampleW = Math.max(1, Math.round(blockW));
      const sampleH = Math.max(1, Math.round(blockH));

      let imageData;
      try {
        imageData = ctx.getImageData(startX, startY, sampleW, sampleH);
      } catch {
        // CORS-blocked or out-of-bounds — skip this cell
        continue;
      }

      const data  = imageData.data;
      let rSum = 0, gSum = 0, bSum = 0, count = 0;

      for (let i = 0; i < data.length; i += 4) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
        // Ignore alpha — assume fully-opaque source
        count++;
      }

      if (count === 0) continue;

      const avgR = rSum / count;
      const avgG = gSum / count;
      const avgB = bSum / count;

      // Brightness (0–255), simple average of R+G+B
      let brightness = (avgR + avgG + avgB) / 3;

      // Contrast adjustment (same formula as img-transform-animator)
      let adjusted = ((brightness - 127.5) * contrastFactor) + 127.5;
      adjusted = Math.max(0, Math.min(255, adjusted));

      // Map brightness → ramp index (0 = darkest char, last = lightest/space)
      const charIndex = rampLength > 0
        ? Math.min(rampLength - 1, Math.floor((adjusted / 255) * rampLength))
        : 0;
      const char = ramp[charIndex] ?? ' ';

      // Skip fully-transparent/space cells — keep grid sparse
      if (char === ' ') continue;

      // Color from average RGB
      const color = rgbToHex(avgR, avgG, avgB);

      // Density: 1 = dark (low brightness), 0 = light (high brightness)
      // Inverted so dense chars get density≈1, space gets density≈0
      const density = Math.max(0, Math.min(1, 1 - adjusted / 255));

      // Semantic inferred from char character class
      const semantic = inferSemantic(char);

      frame = setCell(frame, cx, cy, { char, color, density, semantic });
    }
  }

  // Replace the initial frame with the populated one
  grid.frames[0] = frame;

  return grid;
}

// ============================================================
// EXPORTS — universal (ESM + CJS + global)
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { imageToGrid, DEFAULT_CHAR_RAMP, rgbToHex };
}
if (typeof window !== 'undefined') {
  window.ImageImporter = { imageToGrid, DEFAULT_CHAR_RAMP, rgbToHex };
}
export { imageToGrid, DEFAULT_CHAR_RAMP, rgbToHex };
