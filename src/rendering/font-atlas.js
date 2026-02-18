/**
 * font-atlas.js — Charset → Font Atlas Texture + UV Lookup
 * Pure logic (uses OffscreenCanvas or DOM canvas for glyph rendering).
 * No WebGL dependency — outputs ImageData + metadata.
 *
 * @module font-atlas
 * @version 1.0.0
 */

/**
 * Build a font atlas from a charset string.
 * Renders each unique character into a grid-packed texture.
 * White text on transparent black — shader multiplies by fg color.
 *
 * @param {string} charset - Characters to include in atlas
 * @param {object} [options={}]
 * @param {number} [options.fontSize=16] - Font size in pixels
 * @param {string} [options.fontFamily='monospace'] - Font family
 * @param {string} [options.defaultChar=' '] - Fallback character
 * @returns {{
 *   imageData: ImageData,
 *   canvas: HTMLCanvasElement|OffscreenCanvas,
 *   charIndexMap: Map<string, number>,
 *   uvMap: Map<string, {u: number, v: number, w: number, h: number}>,
 *   cols: number,
 *   rows: number,
 *   cellW: number,
 *   cellH: number,
 *   atlasWidth: number,
 *   atlasHeight: number,
 *   defaultIndex: number
 * }}
 */
function buildFontAtlas(charset, options = {}) {
  const fontSize = options.fontSize || 16;
  const fontFamily = options.fontFamily || 'monospace';
  const defaultChar = options.defaultChar || ' ';

  // --- Deduplicate charset, ensure defaultChar is included ---
  const charSet = new Set();
  // Index 0 is always space (void)
  charSet.add(' ');
  // Index 1+ from charset
  for (const ch of charset) {
    charSet.add(ch);
  }
  // Ensure defaultChar is in the set
  charSet.add(defaultChar);

  const chars = Array.from(charSet);

  // --- Measure cell dimensions ---
  const measureCanvas = _createCanvas(fontSize * 2, fontSize * 2);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${fontSize}px ${fontFamily}`;
  measureCtx.textBaseline = 'top';

  // Measure widest character
  let maxWidth = 0;
  for (const ch of chars) {
    const m = measureCtx.measureText(ch);
    const w = Math.ceil(m.width);
    if (w > maxWidth) maxWidth = w;
  }

  // Cell dimensions (monospace assumption — use max for safety)
  const cellW = Math.max(maxWidth, Math.ceil(fontSize * 0.6));
  const cellH = Math.ceil(fontSize * 1.2);

  // --- Atlas grid layout ---
  const count = chars.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  // Power-of-2 atlas dimensions
  const rawW = cols * cellW;
  const rawH = rows * cellH;
  const atlasWidth = _nextPow2(rawW);
  const atlasHeight = _nextPow2(rawH);

  // --- Render glyphs ---
  const atlasCanvas = _createCanvas(atlasWidth, atlasHeight);
  const ctx = atlasCanvas.getContext('2d');

  // Transparent black background (default)
  ctx.clearRect(0, 0, atlasWidth, atlasHeight);

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff'; // White glyphs — shader tints with fg color

  const charIndexMap = new Map();
  const uvMap = new Map();
  let defaultIndex = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const px = col * cellW;
    const py = row * cellH;

    // Center glyph in cell
    const m = ctx.measureText(ch);
    const glyphW = m.width;
    const offsetX = Math.floor((cellW - glyphW) / 2);

    ctx.fillText(ch, px + offsetX, py);

    charIndexMap.set(ch, i);

    // UV coordinates normalized to atlas dimensions
    uvMap.set(ch, {
      u: px / atlasWidth,
      v: py / atlasHeight,
      w: cellW / atlasWidth,
      h: cellH / atlasHeight
    });

    if (ch === defaultChar) defaultIndex = i;
  }


  // Clear the space character cell to guarantee no subpixel artifacts
  const spaceIdx = charIndexMap.get(' ');
  if (spaceIdx !== undefined) {
    const spCol = spaceIdx % cols;
    const spRow = Math.floor(spaceIdx / cols);
    ctx.clearRect(spCol * cellW, spRow * cellH, cellW, cellH);
  }
  const imageData = ctx.getImageData(0, 0, atlasWidth, atlasHeight);

  return {
    imageData,
    canvas: atlasCanvas,
    charIndexMap,
    uvMap,
    chars,
    cols,
    rows,
    cellW,
    cellH,
    atlasWidth,
    atlasHeight,
    defaultIndex
  };
}

/**
 * Get the atlas index for a character, with fallback.
 * @param {Map<string, number>} charIndexMap
 * @param {string} char
 * @param {number} defaultIndex
 * @returns {number}
 */
function getCharIndex(charIndexMap, char, defaultIndex) {
  const idx = charIndexMap.get(char);
  return idx ?? defaultIndex;
}

// --- Internal helpers ---

/**
 * Create a canvas (OffscreenCanvas if available, else DOM).
 * @param {number} w
 * @param {number} h
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function _createCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  throw new Error('No canvas API available');
}

/**
 * Next power of 2 >= n.
 * @param {number} n
 * @returns {number}
 */
function _nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// --- Exports ---
const FontAtlas = { buildFontAtlas, getCharIndex };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FontAtlas;
}
if (globalThis.window !== undefined) {
  globalThis.FontAtlas = FontAtlas;
}
export { buildFontAtlas, getCharIndex };
