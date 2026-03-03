/**
 * GRID — Text-to-Grid Generator (Task 5.4a)
 *
 * Pure function: takes a text description → returns a .grid object.
 * Keyword-driven template engine that dispatches to existing generators
 * and a layout engine. No ML, no DOM, no network.
 *
 * @module text-to-grid
 */

// ============================================================
// VOCABULARY
// ============================================================

/**
 * Each entry maps keyword triggers to a generator name, default semantic,
 * optional color hint, and density hint.
 */
const VOCABULARY = {
    terrain: {
        triggers: ['landscape', 'terrain', 'mountain', 'hill', 'valley', 'earth', 'ground', 'rock'],
        generator: 'terrain', semantic: 'solid', colorHint: '#886644', densityHint: 0.7
    },
    water: {
        triggers: ['water', 'ocean', 'sea', 'river', 'lake', 'fluid', 'stream', 'rain', 'wave'],
        generator: 'wave', semantic: 'fluid', colorHint: '#4488cc', densityHint: 0.5
    },
    city: {
        triggers: ['city', 'town', 'building', 'wall', 'alley', 'street', 'house', 'tower', 'castle', 'fortress'],
        generator: 'geometric', semantic: 'solid', colorHint: '#888888', densityHint: 0.8
    },
    sky: {
        triggers: ['sky', 'stars', 'night', 'space', 'void', 'cosmos', 'dark', 'empty'],
        generator: 'rain', semantic: 'void', colorHint: '#112244', densityHint: 0.2
    },
    energy: {
        triggers: ['energy', 'pulse', 'glow', 'emissive', 'light', 'fire', 'flame', 'bright', 'sun', 'beacon'],
        generator: 'pulse', semantic: 'emissive', colorHint: '#ffaa00', densityHint: 0.9
    },
    pattern: {
        triggers: ['pattern', 'mandala', 'spiral', 'fractal', 'radial', 'circle', 'ring'],
        generator: 'mandala', semantic: 'solid', colorHint: '#aa44ff', densityHint: 0.6
    },
    chaos: {
        triggers: ['chaos', 'noise', 'random', 'scatter', 'static', 'storm'],
        generator: 'noise', semantic: 'solid', colorHint: '#666666', densityHint: 0.5
    },
    gradient: {
        triggers: ['gradient', 'fade', 'transition', 'horizon', 'dawn', 'dusk', 'sunset', 'sunrise'],
        generator: 'gradient', semantic: 'solid', colorHint: '#ff8844', densityHint: 0.5
    },
    forest: {
        triggers: ['forest', 'tree', 'trees', 'wood', 'jungle', 'nature', 'garden', 'plant'],
        generator: 'noise', semantic: 'solid', colorHint: '#228844', densityHint: 0.6
    },
    matrix: {
        triggers: ['matrix', 'code', 'digital', 'data', 'cyber', 'hack', 'terminal'],
        generator: 'matrix', semantic: 'emissive', colorHint: '#00ff88', densityHint: 0.4
    },
    // Doxascope-specific
    mist: {
        triggers: ['mist', 'coherence', 'dissolution', 'fracture', 'fog', 'haze'],
        generator: 'noise', semantic: 'fluid', colorHint: '#667788', densityHint: 0.4
    },
    door: {
        triggers: ['door', 'portal', 'transcendence', 'transformation', 'annihilation', 'gate', 'threshold'],
        generator: 'pulse', semantic: 'emissive', colorHint: '#d4af37', densityHint: 0.85
    }
};

/**
 * Position modifier keywords → sector assignment.
 */
const POSITION_KEYWORDS = {
    'top': 'top', 'north': 'top', 'upper': 'top', 'above': 'top',
    'bottom': 'bottom', 'south': 'bottom', 'lower': 'bottom', 'below': 'bottom',
    'left': 'left', 'west': 'left',
    'right': 'right', 'east': 'right',
    'center': 'center', 'middle': 'center', 'central': 'center'
};

/**
 * Density modifier keywords → density multiplier.
 */
const DENSITY_KEYWORDS = {
    'dense': 1.3, 'thick': 1.3, 'heavy': 1.3, 'packed': 1.4, 'solid': 1.2,
    'sparse': 0.5, 'thin': 0.5, 'light': 0.4, 'faint': 0.3, 'scattered': 0.4,
    'moderate': 0.8, 'medium': 0.8
};

/**
 * Size modifier keywords → zone size multiplier.
 */
const SIZE_KEYWORDS = {
    'large': 1.5, 'big': 1.5, 'huge': 2.0, 'vast': 2.0, 'wide': 1.5, 'expansive': 1.8,
    'small': 0.5, 'tiny': 0.4, 'narrow': 0.5, 'little': 0.5
};

// ============================================================
// SEEDED PRNG (mulberry32 — matches generators.js)
// ============================================================

function mulberry32(seed) {
    let t = (seed >>> 0) + 0x6D2B79F5;
    return function () {
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ============================================================
// TOKENIZER & PARSER
// ============================================================

/**
 * Tokenize prompt into lowercase words, stripping punctuation.
 */
function tokenize(prompt) {
    if (typeof prompt !== 'string') return [];
    return prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0);
}

/**
 * Parse tokens into zone intents.
 *
 * Strategy:
 * 1. Scan tokens left-to-right
 * 2. Match vocabulary triggers → create zone intent
 * 3. Attach nearby modifiers (position, density, size) to the most recent zone
 * 4. Return array of zone intents
 *
 * @param {string[]} tokens
 * @returns {Array<{vocab: string, generator: string, semantic: string,
 *   colorHint: string, densityHint: number, position: string|null,
 *   densityMod: number, sizeMod: number}>}
 */
function parseTokens(tokens) {
    const zones = [];
    let currentZone = null;

    for (const token of tokens) {
        // Check vocabulary
        let matched = false;
        for (const [vocabKey, entry] of Object.entries(VOCABULARY)) {
            if (entry.triggers.includes(token)) {
                currentZone = {
                    vocab: vocabKey,
                    generator: entry.generator,
                    semantic: entry.semantic,
                    colorHint: entry.colorHint,
                    densityHint: entry.densityHint,
                    position: null,
                    densityMod: 1.0,
                    sizeMod: 1.0
                };
                zones.push(currentZone);
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // Check position modifiers
        if (POSITION_KEYWORDS[token]) {
            if (currentZone) {
                currentZone.position = mergePosition(currentZone.position, POSITION_KEYWORDS[token]);
            } else {
                // Position before any vocab — create pending position
                currentZone = {
                    vocab: null, generator: null, semantic: null,
                    colorHint: null, densityHint: 0.5,
                    position: POSITION_KEYWORDS[token],
                    densityMod: 1.0, sizeMod: 1.0
                };
                // Don't push yet — wait for a vocab match
            }
            continue;
        }

        // Check density modifiers
        if (DENSITY_KEYWORDS[token] !== undefined) {
            if (currentZone) currentZone.densityMod = DENSITY_KEYWORDS[token];
            continue;
        }

        // Check size modifiers
        if (SIZE_KEYWORDS[token] !== undefined) {
            if (currentZone) currentZone.sizeMod = SIZE_KEYWORDS[token];
            continue;
        }

        // Unknown word — ignored
    }

    // Filter out placeholder zones with no vocab
    return zones.filter(z => z.vocab !== null);
}

/**
 * Merge two position fragments into a compound position.
 * e.g. 'top' + 'left' → 'top-left', 'center' + anything → 'center'
 */
function mergePosition(existing, incoming) {
    if (!existing) return incoming;
    if (existing === 'center' || incoming === 'center') return 'center';

    const verticals = ['top', 'bottom'];
    const horizontals = ['left', 'right'];

    const existV = verticals.includes(existing);
    const existH = horizontals.includes(existing);
    const incomV = verticals.includes(incoming);
    const incomH = horizontals.includes(incoming);

    if (existV && incomH) return `${existing}-${incoming}`;
    if (existH && incomV) return `${incoming}-${existing}`;

    // Same axis — keep the latest
    return incoming;
}

// ============================================================
// LAYOUT ENGINE
// ============================================================

/**
 * Sector definitions for a 3×3 grid layout.
 * Each sector defines its fractional bounds within the grid.
 *
 * @param {number} W - Grid width
 * @param {number} H - Grid height
 */
function getSectorBounds(position, W, H) {
    const thirds = {
        x: [0, Math.floor(W / 3), Math.floor(2 * W / 3), W],
        y: [0, Math.floor(H / 3), Math.floor(2 * H / 3), H]
    };

    const sectorMap = {
        'top-left': { x0: thirds.x[0], x1: thirds.x[1], y0: thirds.y[0], y1: thirds.y[1] },
        'top-center': { x0: thirds.x[1], x1: thirds.x[2], y0: thirds.y[0], y1: thirds.y[1] },
        'top': { x0: thirds.x[0], x1: thirds.x[3], y0: thirds.y[0], y1: thirds.y[1] },
        'top-right': { x0: thirds.x[2], x1: thirds.x[3], y0: thirds.y[0], y1: thirds.y[1] },
        'center-left': { x0: thirds.x[0], x1: thirds.x[1], y0: thirds.y[1], y1: thirds.y[2] },
        'center': { x0: thirds.x[1], x1: thirds.x[2], y0: thirds.y[1], y1: thirds.y[2] },
        'center-right': { x0: thirds.x[2], x1: thirds.x[3], y0: thirds.y[1], y1: thirds.y[2] },
        'bottom-left': { x0: thirds.x[0], x1: thirds.x[1], y0: thirds.y[2], y1: thirds.y[3] },
        'bottom-center': { x0: thirds.x[1], x1: thirds.x[2], y0: thirds.y[2], y1: thirds.y[3] },
        'bottom': { x0: thirds.x[0], x1: thirds.x[3], y0: thirds.y[2], y1: thirds.y[3] },
        'bottom-right': { x0: thirds.x[2], x1: thirds.x[3], y0: thirds.y[2], y1: thirds.y[3] },
        'left': { x0: thirds.x[0], x1: thirds.x[1], y0: thirds.y[0], y1: thirds.y[3] },
        'right': { x0: thirds.x[2], x1: thirds.x[3], y0: thirds.y[0], y1: thirds.y[3] },
        'full': { x0: 0, x1: W, y0: 0, y1: H }
    };

    return sectorMap[position] || sectorMap['full'];
}

/**
 * Assign zone intents to grid sectors.
 * Returns array of { zone, bounds } where bounds = { x0, y0, x1, y1 }.
 *
 * Layout rules:
 * 1. Zones with explicit position → assigned to that sector
 * 2. Zones without position → distributed across remaining space
 * 3. If only one zone with no position → full grid
 */
function layoutZones(zones, W, H) {
    const positioned = zones.filter(z => z.position);
    const unpositioned = zones.filter(z => !z.position);
    const assignments = [];

    // Assign positioned zones
    for (const z of positioned) {
        const bounds = getSectorBounds(z.position, W, H);
        // Apply size modifier
        if (z.sizeMod !== 1.0) {
            const midX = (bounds.x0 + bounds.x1) / 2;
            const midY = (bounds.y0 + bounds.y1) / 2;
            const halfW = ((bounds.x1 - bounds.x0) * z.sizeMod) / 2;
            const halfH = ((bounds.y1 - bounds.y0) * z.sizeMod) / 2;
            bounds.x0 = Math.max(0, Math.floor(midX - halfW));
            bounds.x1 = Math.min(W, Math.ceil(midX + halfW));
            bounds.y0 = Math.max(0, Math.floor(midY - halfH));
            bounds.y1 = Math.min(H, Math.ceil(midY + halfH));
        }
        assignments.push({ zone: z, bounds });
    }

    // Assign unpositioned zones
    if (unpositioned.length === 0) {
        // Nothing to do
    } else if (unpositioned.length === 1 && positioned.length === 0) {
        // Single zone, no others → full grid
        assignments.push({ zone: unpositioned[0], bounds: { x0: 0, y0: 0, x1: W, y1: H } });
    } else {
        // Stack unpositioned zones vertically, evenly divided
        const rowHeight = Math.max(1, Math.floor(H / unpositioned.length));
        for (let i = 0; i < unpositioned.length; i++) {
            const y0 = i * rowHeight;
            const y1 = (i === unpositioned.length - 1) ? H : (i + 1) * rowHeight;
            assignments.push({ zone: unpositioned[i], bounds: { x0: 0, y0, x1: W, y1 } });
        }
    }

    return assignments;
}

// ============================================================
// ZONE RENDERING
// ============================================================

/**
 * Character ramps per semantic type.
 */
const CHAR_RAMPS = {
    solid: ['@', '#', '%', '&', '*', '+', '='],
    fluid: ['~', '≈', '-', '.', ','],
    void: ['.', ' ', '·', ':'],
    emissive: ['*', '+', '°', '·', '.'],
    default: ['@', '#', '*', '+', '-', '.']
};

/**
 * Fill a zone in the frame using a generator-like approach.
 * This is a simplified inline generator that doesn't depend on generators.js
 * (to keep the module self-contained and pure).
 *
 * @param {object} frame - Grid frame to mutate
 * @param {object} bounds - { x0, y0, x1, y1 }
 * @param {object} zone - Zone intent
 * @param {function} rng - Seeded PRNG function
 * @param {number} gridWidth - Total grid width
 * @param {number} gridHeight - Total grid height
 * @returns {object} Updated frame
 */
function fillZone(frame, bounds, zone, rng, gridWidth, gridHeight) {
    const { x0, y0, x1, y1 } = bounds;
    const zW = x1 - x0;
    const zH = y1 - y0;
    if (zW <= 0 || zH <= 0) return frame;

    const ramp = CHAR_RAMPS[zone.semantic] || CHAR_RAMPS.default;
    const color = zone.colorHint || '#888888';
    const baseDensity = zone.densityHint * zone.densityMod;

    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            // Local coordinates (0-1)
            const lx = zW > 1 ? (x - x0) / (zW - 1) : 0.5;
            const ly = zH > 1 ? (y - y0) / (zH - 1) : 0.5;

            let density = baseDensity;
            let skipCell = false;

            // Generator-specific density patterns
            switch (zone.generator) {
                case 'terrain': {
                    // Layered sine — higher at center, lower at edges
                    const t1 = Math.sin(lx * Math.PI) * Math.sin(ly * Math.PI);
                    const t2 = Math.sin(lx * 3.7 + 0.3) * 0.3;
                    density = baseDensity * (t1 * 0.7 + t2 * 0.3 + rng() * 0.15);
                    break;
                }
                case 'wave': {
                    const wave = Math.sin(lx * Math.PI * 2 + ly * 3) * 0.5 + 0.5;
                    density = baseDensity * (wave * 0.8 + rng() * 0.2);
                    break;
                }
                case 'geometric': {
                    // Grid-like pattern
                    const gx = (x - x0) % 3 === 0 ? 1 : 0;
                    const gy = (y - y0) % 3 === 0 ? 1 : 0;
                    density = baseDensity * ((gx || gy) ? 0.9 : 0.3 + rng() * 0.2);
                    break;
                }
                case 'rain': {
                    // Sparse vertical drops
                    if (rng() > baseDensity * 0.6) { skipCell = true; break; }
                    density = baseDensity * (0.3 + rng() * 0.7);
                    break;
                }
                case 'pulse': {
                    // Concentric rings from zone center
                    const dx = lx - 0.5, dy = ly - 0.5;
                    const dist = Math.sqrt(dx * dx + dy * dy) * 2;
                    const ring = Math.sin(dist * Math.PI * 4) * 0.5 + 0.5;
                    density = baseDensity * (ring * 0.8 + 0.2);
                    if (density < 0.1) skipCell = true;
                    break;
                }
                case 'mandala': {
                    const dx = lx - 0.5, dy = ly - 0.5;
                    const angle = Math.atan2(dy, dx);
                    const dist = Math.sqrt(dx * dx + dy * dy) * 2;
                    const sym = Math.sin(angle * 6) * 0.5 + 0.5;
                    density = baseDensity * (sym * 0.6 + dist * 0.3 + 0.1);
                    if (dist > 0.95) skipCell = true;
                    break;
                }
                case 'noise': {
                    density = baseDensity * rng();
                    if (density < 0.08) skipCell = true;
                    break;
                }
                case 'gradient': {
                    density = baseDensity * ly;
                    if (density < 0.05) skipCell = true;
                    break;
                }
                case 'matrix': {
                    // Vertical columns with random fade
                    if (rng() > 0.3) { skipCell = true; break; }
                    density = baseDensity * (1 - ly * 0.7) * (0.5 + rng() * 0.5);
                    break;
                }
                default: {
                    density = baseDensity * (0.5 + rng() * 0.5);
                    break;
                }
            }

            if (skipCell) continue;
            density = Math.max(0, Math.min(1, density));
            if (density < 0.03) continue;

            // Character from ramp based on density
            const charIdx = Math.min(ramp.length - 1, Math.floor(density * ramp.length));
            const char = ramp[charIdx];

            // Slight color variation
            const variation = Math.floor((rng() - 0.5) * 30);
            const variedColor = varyColor(color, variation);

            const semantic = zone.semantic || 'solid';
            const note = Math.round((1 - y / gridHeight) * 127);
            const velocity = Math.round(density * 127);

            frame = GridCore.setCell(frame, x, y, {
                char,
                color: variedColor,
                density,
                semantic,
                channel: {
                    audio: { note, velocity, duration: 1 },
                    spatial: { height: density, material: semantic }
                }
            });
        }
    }

    return frame;
}

/**
 * Apply a brightness variation to a hex color.
 */
function varyColor(hex, amount) {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + amount));
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
}

// ============================================================
// MAIN: textToGrid
// ============================================================

/**
 * Generate a .grid object from a natural language prompt.
 *
 * @param {string} prompt - Natural language description
 * @param {object} [options={}]
 * @param {number} [options.width=40] - Grid width
 * @param {number} [options.height=20] - Grid height
 * @param {string} [options.charset] - Character set (auto-derived if omitted)
 * @param {number} [options.seed] - PRNG seed for deterministic output
 * @param {string} [options.defaultColor='#0a0a1a'] - Background color
 * @returns {{ grid: object, interpretation: object }}
 */
function textToGrid(prompt, options) {
    options = options || {};
    const W = options.width || 40;
    const H = options.height || 20;
    const seed = options.seed ?? (Date.now() ^ 0xDEADBEEF);
    const defaultColor = options.defaultColor || '#0a0a1a';
    const rng = mulberry32(seed);

    // Parse prompt
    const tokens = tokenize(prompt);
    const zones = parseTokens(tokens);

    // Fallback: no vocabulary matched → single noise zone
    if (zones.length === 0) {
        zones.push({
            vocab: 'chaos',
            generator: 'noise',
            semantic: 'solid',
            colorHint: '#666666',
            densityHint: 0.5,
            position: null,
            densityMod: 1.0,
            sizeMod: 1.0
        });
    }

    // Layout
    const assignments = layoutZones(zones, W, H);

    // Build charset from all semantic ramps used
    const allChars = new Set();
    for (const a of assignments) {
        const ramp = CHAR_RAMPS[a.zone.semantic] || CHAR_RAMPS.default;
        for (const c of ramp) allChars.add(c);
    }
    const charset = options.charset || [...allChars].join('') || '@#*+-.';

    // Create grid
    const grid = GridCore.createGrid(W, H, charset, defaultColor, {
        name: `Generated: ${prompt.slice(0, 50)}`
    });
    let frame = grid.frames[0];

    // Fill zones
    for (const { zone, bounds } of assignments) {
        frame = fillZone(frame, bounds, zone, rng, W, H);
    }

    grid.frames[0] = frame;

    // Store prompt in project.ai_context
    grid.project = grid.project || {};
    grid.project.ai_context = {
        prompt,
        tokens,
        zones: zones.map(z => ({
            vocab: z.vocab,
            generator: z.generator,
            semantic: z.semantic,
            position: z.position
        })),
        seed,
        generated: new Date().toISOString()
    };

    // Interpretation for UI
    const interpretation = {
        tokensMatched: zones.map(z => z.vocab),
        tokensIgnored: tokens.filter(t => {
            for (const entry of Object.values(VOCABULARY)) {
                if (entry.triggers.includes(t)) return false;
            }
            if (POSITION_KEYWORDS[t]) return false;
            if (DENSITY_KEYWORDS[t] !== undefined) return false;
            if (SIZE_KEYWORDS[t] !== undefined) return false;
            return true;
        }),
        zones: assignments.map(a => ({
            vocab: a.zone.vocab,
            generator: a.zone.generator,
            position: a.zone.position || 'auto',
            bounds: a.bounds
        })),
        seed,
        fallbackUsed: zones.length === 1 && zones[0].vocab === 'chaos' &&
            !Object.values(VOCABULARY).some(v => v.triggers.some(t => tokens.includes(t)))
    };

    return { grid, interpretation };
}

// ============================================================
// EXPORTS
// ============================================================

const _textToGridInternals = {
    VOCABULARY,
    POSITION_KEYWORDS,
    DENSITY_KEYWORDS,
    SIZE_KEYWORDS,
    CHAR_RAMPS,
    tokenize,
    parseTokens,
    mergePosition,
    layoutZones,
    getSectorBounds,
    fillZone,
    varyColor,
    mulberry32
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { textToGrid, _internals: _textToGridInternals };
}
if (typeof window !== 'undefined') {
    window.TextToGrid = { textToGrid, _internals: _textToGridInternals };
}
export { textToGrid, _textToGridInternals as _internals };