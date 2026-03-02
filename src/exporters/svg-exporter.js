/**
 * svg-exporter.js — Task 6.1: Grid → SVG
 *
 * Pure string generation. Zero DOM. Works in Node and browser.
 * Each non-empty cell → <text> element. Grid lines optional.
 *
 * @module svg-exporter
 */

const CHAR_WIDTH_RATIO = 0.6;

function svgExportDefaults() {
  return {
    fontSize: 14,
    fontFamily: 'Courier New, monospace',
    background: '#0a0a1a',
    includeGrid: false,
    frameIndex: 0,
  };
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert a .grid frame to an SVG string.
 *
 * @param {Object} grid - A .grid object
 * @param {Object} [opts] - Export options (see svgExportDefaults)
 * @returns {string} Complete <svg>...</svg> markup
 */
function gridToSvg(grid, opts = {}) {
  const o = { ...svgExportDefaults(), ...opts };
  const { fontSize, fontFamily, background, includeGrid, frameIndex } = o;

  const cols = grid.canvas.width;
  const rows = grid.canvas.height;
  const charW = fontSize * CHAR_WIDTH_RATIO;
  const charH = fontSize;
  const w = cols * charW;
  const h = rows * charH;

  const parts = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
    `width="${w}" height="${h}" font-family="${fontFamily}" font-size="${fontSize}">`
  );

  if (background !== 'transparent') {
    parts.push(`<rect width="${w}" height="${h}" fill="${background}"/>`);
  }

  if (includeGrid) {
    const lineColor = '#333';
    for (let x = 0; x <= cols; x++) {
      parts.push(`<line x1="${x * charW}" y1="0" x2="${x * charW}" y2="${h}" stroke="${lineColor}" stroke-width="0.5"/>`);
    }
    for (let y = 0; y <= rows; y++) {
      parts.push(`<line x1="0" y1="${y * charH}" x2="${w}" y2="${y * charH}" stroke="${lineColor}" stroke-width="0.5"/>`);
    }
  }

  const frame = grid.frames[frameIndex] || grid.frames[0];
  if (frame && frame.cells) {
    const sorted = [...frame.cells].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const cell of sorted) {
      const cx = cell.x * charW + charW * 0.5;
      const cy = cell.y * charH + charH * 0.85;
      const fill = cell.color || grid.canvas.defaultColor || '#ffffff';
      parts.push(
        `<text x="${cx}" y="${cy}" fill="${fill}" text-anchor="middle">${escapeXml(cell.char)}</text>`
      );
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { gridToSvg, svgExportDefaults, escapeXml };
}
if (typeof window !== 'undefined') {
  window.SvgExporter = { gridToSvg, svgExportDefaults, escapeXml };
}
export { gridToSvg, svgExportDefaults, escapeXml };