/**
 * generators.js — Procedural Cell Generators v2
 *
 * Pure functions. Zero DOM. Zero side effects. Works in Node and browser.
 * Each generator takes (width, height, options) and returns Cell[].
 *
 * All 5 cell channels are populated:
 *   char     — from charset + brightness/pattern
 *   color    — resolved by colorMode (fixed | mono | derived)
 *   density  — 0=void/light, 1=solid/dark
 *   semantic — inferred from char or biome zone
 *   channel  — { audio: { note, velocity, duration }, spatial: { height, material } }
 *
 * @module generators
 */

import GridCore from '../core/grid-core.js';

const { inferSemantic } = GridCore;

// ============================================================
// UTILITIES
// ============================================================

/** Clamp value to [0, 1]. */
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Mulberry32 seeded PRNG — fast, good distribution, no imports.
 * @param {number} seed
 * @returns {function(): number} Returns values in [0, 1)
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert HSL to hex color string.
 * @param {number} h - Hue in degrees [0, 360)
 * @param {number} s - Saturation [0, 1]
 * @param {number} l - Lightness [0, 1]
 * @returns {string} '#rrggbb'
 */
function hslToHex(h, s, l) {
  s = clamp01(s);
  l = clamp01(l);
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * clamp01(c)).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Extract the hue from a hex color, then return a new color with lightness
 * modulated by density. Dense (1) → dark; light (0) → bright.
 * @param {string} hex - '#rrggbb'
 * @param {number} density - [0, 1]
 * @returns {string} '#rrggbb'
 */
function monoFromHex(hex, density) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lBase = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = lBase > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  // density 1 → lightness 0.15, density 0 → lightness 0.85
  const newL = Math.max(0.15, 0.85 - density * 0.70);
  return hslToHex(h * 360, s, newL);
}

/**
 * Resolve the cell color based on colorMode option.
 * - 'fixed'   → opts.color as-is (default)
 * - 'mono'    → same hue as opts.color, brightness by density
 * - 'derived' → hue from generator geometry (derivedHue), fixed saturation/lightness
 * @param {object} opts - Generator options
 * @param {number} derivedHue - Hue in degrees (used only for 'derived' mode)
 * @param {number} density - [0, 1]
 * @returns {string} '#rrggbb'
 */
function resolveColor(opts, derivedHue, density) {
  const base = opts.color || '#00ff88';
  if (opts.colorMode === 'mono') return monoFromHex(base, density);
  if (opts.colorMode === 'derived') return hslToHex(derivedHue % 360, 0.8, 0.5);
  return base; // 'fixed' (default)
}

/**
 * Pick a character from a charset at normalized position t.
 * @param {string} charset
 * @param {number} t - [0, 1]; 0 = first (densest), 1 = last (lightest)
 * @returns {string}
 */
function pickChar(charset, t) {
  if (!charset || charset.length === 0) return ' ';
  const idx = Math.min(charset.length - 1, Math.floor(clamp01(t) * charset.length));
  return charset[idx];
}

/**
 * Build a fully-channeled cell with audio and spatial data.
 * channel.audio.note comes from Y position (top=high, bottom=low in MIDI terms,
 * but we use bottom=0, top=127 so lower rows = bass).
 * channel.spatial.height mirrors density.
 *
 * @param {number} x
 * @param {number} y
 * @param {string} char
 * @param {string} color - '#rrggbb'
 * @param {number} density - [0, 1]
 * @param {string|null} semantic - null to auto-infer
 * @param {object|null} extraChannel - merged into channel if provided
 * @param {number} H - Grid height (for MIDI note mapping)
 * @returns {object} Cell object
 */
function buildCell(x, y, char, color, density, semantic, extraChannel, H) {
  const d = clamp01(density);
  const sem = semantic || inferSemantic(char);
  const note = Math.round((1 - y / Math.max(1, H - 1)) * 127); // top row = 127, bottom = 0
  const velocity = Math.round(d * 127);
  const cell = {
    x, y, char, color,
    density: d,
    semantic: sem,
    channel: {
      audio: { note, velocity, duration: 1 },
      spatial: { height: d, material: sem },
    },
  };
  if (extraChannel) Object.assign(cell.channel, extraChannel);
  return cell;
}

// ============================================================
// GENERATORS
// ============================================================

/**
 * Spiral — angle + distance from center drives character and density.
 * @param {number} W @param {number} H @param {object} [opts]
 * @returns {object[]} cells
 */
function spiral(W, H, opts = {}) {
  const charset = opts.charset || '@#$%&*+=-.~ ';
  const cx = W / 2, cy = H / 2;
  const cells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const angle = Math.atan2(y - cy, x - cx);
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const t = ((angle + dist * 0.3) % (Math.PI * 2)) / (Math.PI * 2);
      const char = pickChar(charset, t);
      if (char === ' ') continue;
      const density = 1 - t;
      const hue = ((angle / (Math.PI * 2) + 1) * 180) % 360;
      cells.push(buildCell(x, y, char, resolveColor(opts, hue, density), density, null, null, H));
    }
  }
  return cells;
}

/**
 * Wave — sine × cosine interference pattern.
 * @param {number} W @param {number} H @param {object} [opts]
 * @returns {object[]} cells
 */
function wave(W, H, opts = {}) {
  const charset = opts.charset || '@#$%&*+=-.~ ';
  const phase = (opts.seed ?? 0) * 0.1;
  const cells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (Math.sin(x * 0.2 + phase) * Math.cos(y * 0.15) + 1) * 0.5;
      const char = pickChar(charset, t);
      if (char === ' ') continue;
      const hue = (x / Math.max(1, W - 1)) * 240;
      cells.push(buildCell(x, y, char, resolveColor(opts, hue, t), t, null, null, H));
    }
  }
  return cells;
}

/**
 * Mandala — radially symmetric pattern using angle × distance.
 * @param {number} W @param {number} H @param {object} [opts]
 * @returns {object[]} cells
 */
function mandala(W, H, opts = {}) {
  const charset = opts.charset || '@#$%&*+=-.~ ';
  const cx = W / 2, cy = H / 2;
  const symmetry = opts.symmetry ?? 8;
  const cells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = Math.min(cx, cy);
      if (dist >= radius) continue;
      const angle = Math.atan2(dy, dx);
      const pattern = Math.sin(angle * symmetry) * Math.cos(dist * 0.5);
      const t = (pattern + 1) * 0.5;
      const char = pickChar(charset, t);
      if (char === ' ') continue;
      const hue = ((angle / (Math.PI * 2) + 1) * 360) % 360;
      cells.push(buildCell(x, y, char, resolveColor(opts, hue, t), t, null, null, H));
    }
  }
  return cells;
}

/**
 * Noise — seeded random scatter.
 * @param {number} W @param {number} H @param {object} [opts]
 * @returns {object[]} cells
 */
function noise(W, H, opts = {}) {
  const rng = mulberry32(opts.seed ?? 12345);
  const charset = opts.charset || '@#$%&*+=-.~ ';
  const fill = opts.fill ?? 0.7; // fraction of cells attempted
  const cells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (rng() > fill) continue;
      const t = rng();
      const char = pickChar(charset, t);
      if (char === ' ') continue;
      const hue = rng() * 360;
      cells.push(buildCell(x, y, char, resolveColor(opts, hue, t), t, null, null, H));
    }
  }
  return cells;
}

/**
 * Geometric — diamond, cross, or frame shape chosen by seed.
 * @param {number} W @param {number} H @param {object} [opts]
 * @returns {object[]} cells
 */
function geometric(W, H, opts = {}) {
  const rng = mulberry32(opts.seed ?? 42);
  const charset = opts.charset || '@#$%&*+=-.~ ';
  const cx = W / 2, cy = H / 2;
  const shapes = ['diamond', 'cross', 'frame'];
  const shape = shapes[Math.floor(rng() * shapes.length)];
  const cells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let draw = false;
      switch (shape) {
        case 'diamond': draw = Math.abs(x - cx) + Math.abs(y - cy) < Math.min(cx, cy) * 0.8; break;
        case 'cross':   draw = Math.abs(x - cx) < 3 || Math.abs(y - cy) < 2; break;
        case 'frame':   draw = x < 3 || x >= W - 3 || y < 2 || y >= H - 2; break;
      }
      if (!draw) continue;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      const t = Math.max(0.1, 1 - dist / maxDist);
      const char = pickChar(charset, t);
      if (char === ' ') continue;
      const hue = (dist / maxDist) * 240;
      cells.push(buildCell(x, y, char, resolveColor(opts, hue, t), t, null, null, H));
    }
  }
  return cells;
}

/**
 * Rain — vertical streaks falling from random heights.
 * @param {number} W @param {number} H @param {object} [opts]
 * @returns {object[]} cells
 */
function rain(W, H, opts = {}) {
  const rng = mulberry32(opts.seed ?? 99);
  const charset = opts.charset || '@#$%&*+=-.~ ';
  const cells = [];
  for (let x = 0; x < W; x++) {
    if (rng() > 0.6) continue;
    const length = Math.floor(rng() * (H * 0.7)) + 2;
    const startY = Math.floor(rng() * H);
    for (let i = 0; i < length && startY + i < H; i++) {
      const t = 1 - i / length;
      const char = pickChar(charset, t);
      if (char === ' ') continue;
      const hue = 120 + rng() * 40; // green spectrum
      cells.push(buildCell(x, startY + i, char, resolveColor(opts, hue, t), t, null, null, H));
    }
  }
  return cells;
}

/**
 * Gradient — left-to-right linear ramp.
 * @param {number} W @param {number} H @param {object} [opts]
 * @returns {object[]} cells
 */
function gradient(W, H, opts = {}) {
  const charset = opts.charset || '@#$%&*+=-.~ ';
  const cells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = x / Math.max(1, W - 1);
      const char = pickChar(charset, t);
      if (char === ' ') continue;
      const hue = t * 270;
      cells.push(buildCell(x, y, char, resolveColor(opts, hue, t), t, null, null, H));
    }
  }
  return cells;
}

/**
 * Pulse — concentric rings radiating from center.
 * opts.rings controls ring density (default 5).
 * @param {number} W @param {number} H @param {object} [opts]
 * @returns {object[]} cells
 */
function pulse(W, H, opts = {}) {
  const charset = opts.charset || '@#$%&*+=-.~ ';
  const cx = W / 2, cy = H / 2;
  const rings = opts.rings ?? 5;
  const phase = (opts.seed ?? 0) * 0.1;
  const cells = [];
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const t = (Math.sin(dist * (rings / Math.max(1, maxDist)) * Math.PI * 2 + phase) + 1) * 0.5;
      const char = pickChar(charset, t);
      if (char === ' ') continue;
      const hue = (dist / Math.max(1, maxDist)) * 360;
      cells.push(buildCell(x, y, char, resolveColor(opts, hue, t), t, null, null, H));
    }
  }
  return cells;
}

/**
 * Matrix — digital rain columns with bright heads and fading tails.
 * @param {number} W @param {number} H @param {object} [opts]
 * @returns {object[]} cells
 */
function matrix(W, H, opts = {}) {
  const rng = mulberry32(opts.seed ?? 7);
  const charset = opts.charset || '@#$%&*+=-.~ ';
  const cells = [];
  for (let x = 0; x < W; x++) {
    const colSeed = rng();
    const headY = Math.floor(colSeed * H);
    const tailLen = Math.floor(3 + rng() * (H * 0.5));
    for (let i = 0; i < tailLen; i++) {
      const y = (headY + i) % H;
      const t = 1 - i / tailLen;
      // Head character: bright (dense), tail fades to lighter chars
      const charT = i === 0 ? 0.05 : clamp01(1 - t * 0.6);
      const char = pickChar(charset, charT);
      if (char === ' ') continue;
      const hue = 120; // green — classic matrix
      cells.push(buildCell(x, y, char, resolveColor(opts, hue, t), t, null, null, H));
    }
  }
  return cells;
}

/**
 * Terrain — layered sine waves approximate 2D noise to produce a heightmap.
 * Biome zones: void (water), fluid (shore), solid (land), emissive (peaks).
 * @param {number} W @param {number} H @param {object} [opts]
 * @returns {object[]} cells
 */
function terrain(W, H, opts = {}) {
  const rng = mulberry32(opts.seed ?? 314);
  const charset = opts.charset || '@#$%&*+=-.~ ';
  const waterLevel = opts.waterLevel ?? 0.35;

  // Three octaves of sine waves — cheap approximation of 2D fractal noise
  const octaves = [
    [rng() * 100, rng() * 100, rng() * 0.05 + 0.02, rng() * 0.05 + 0.02, 1.00],
    [rng() * 100, rng() * 100, rng() * 0.10 + 0.05, rng() * 0.10 + 0.05, 0.50],
    [rng() * 100, rng() * 100, rng() * 0.20 + 0.10, rng() * 0.20 + 0.10, 0.25],
  ];
  const totalAmp = octaves.reduce((s, o) => s + o[4], 0);

  function heightAt(x, y) {
    let h = 0;
    for (const [ox, oy, fx, fy, amp] of octaves) {
      h += Math.sin((x + ox) * fx) * Math.cos((y + oy) * fy) * amp;
    }
    return (h / totalAmp + 1) * 0.5; // normalize to [0, 1]
  }

  const cells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const h = heightAt(x, y);
      let semantic, charT, hue;

      if (h < waterLevel) {
        // Deep water — sparse (skip most to stay light)
        if (h > waterLevel * 0.7) {
          semantic = 'void'; charT = 0.15; hue = 220;
        } else {
          continue; // very deep water = empty cell
        }
      } else if (h < waterLevel + 0.08) {
        semantic = 'fluid'; charT = 0.30; hue = 180; // teal shore
      } else if (h > 0.82) {
        semantic = 'emissive'; charT = 0.02; hue = 30; // warm bright peaks
      } else {
        semantic = 'solid';
        charT = 0.12 + (h - waterLevel) * 0.65;
        hue = 100 - (h - waterLevel) * 60; // green → olive highland
      }

      const char = pickChar(charset, charT);
      if (char === ' ') continue;
      cells.push(buildCell(x, y, char, resolveColor(opts, hue, h), h, semantic, null, H));
    }
  }
  return cells;
}

// ============================================================
// REGISTRY
// ============================================================

/**
 * All available generators, keyed by name.
 * Each entry: (width, height, options) → Cell[]
 */
const GENERATORS = {
  spiral,
  wave,
  mandala,
  noise,
  geometric,
  rain,
  gradient,
  pulse,
  matrix,
  terrain,
};

// ============================================================
// EXPORTS — universal (ESM + CJS + global)
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GENERATORS,
    mulberry32, hslToHex, monoFromHex, resolveColor,
    pickChar, clamp01, buildCell,
  };
}
if (typeof window !== 'undefined') {
  window.Generators = {
    GENERATORS,
    mulberry32, hslToHex, monoFromHex, resolveColor,
    pickChar, clamp01, buildCell,
  };
}

export {
  GENERATORS,
  mulberry32, hslToHex, monoFromHex, resolveColor,
  pickChar, clamp01, buildCell,
};
