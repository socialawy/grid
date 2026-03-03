/**
 * GRID — Grid Description Engine (Task 5.1)
 *
 * Pure function: takes a grid + frame index → returns a structured
 * natural language description. No ML, no DOM, no network.
 *
 * Consumes grid-core.js query functions:
 *   getFrameByIndex, getDensityMap, getSemanticMap, getColorMap,
 *   getCharMap, getCellsBySemantic, getCellsByChannel, getGridStats
 *
 * @module grid-describer
 */

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Spatial labels for a 3×3 sector grid.
 * Row 0 = top, Row 2 = bottom. Col 0 = left, Col 2 = right.
 */
const SECTOR_LABELS = [
    ['top-left', 'top-center', 'top-right'],
    ['center-left', 'center', 'center-right'],
    ['bottom-left', 'bottom-center', 'bottom-right']
];

/**
 * Semantic type display names for prompt synthesis.
 */
const SEMANTIC_NAMES = {
    solid: 'solid',
    fluid: 'fluid',
    void: 'void',
    emissive: 'emissive',
    transparent: 'transparent'
};

/**
 * Hue ranges (degrees) for warmth classification.
 * Warm: 0-60, 300-360 (reds, oranges, yellows, magentas)
 * Cool: 120-240 (greens, cyans, blues)
 * Neutral: 60-120, 240-300 (yellow-green, blue-purple transitions)
 */
const WARM_HUE_RANGES = [[0, 60], [300, 360]];
const COOL_HUE_RANGES = [[120, 241]];

// ============================================================
// HELPERS: Color Analysis
// ============================================================

/**
 * Parse '#rrggbb' hex string to {r, g, b} (0-255).
 * Returns null for invalid input.
 */
function hexToRgb(hex) {
    if (typeof hex !== 'string' || hex.length !== 7 || hex[0] !== '#') return null;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
}

/**
 * Convert RGB (0-255) to HSL. Returns { h: 0-360, s: 0-1, l: 0-1 }.
 */
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s, l };
}

/**
 * Classify a hue angle as 'warm', 'cool', or 'neutral'.
 */
function classifyHue(h) {
    for (const [lo, hi] of WARM_HUE_RANGES) { if (h >= lo && h < hi) return 'warm'; }
    for (const [lo, hi] of COOL_HUE_RANGES) { if (h >= lo && h < hi) return 'cool'; }
    return 'neutral';
}

// ============================================================
// HELPERS: Region Detection (Connected Component Labeling)
// ============================================================

/**
 * Flood-fill connected component labeling on a 2D semantic grid.
 * Returns array of regions: { id, semantic, cells: [{x,y}], area }.
 *
 * Uses 4-connectivity (up/down/left/right).
 *
 * @param {string[][]} semanticGrid - 2D array [y][x] of semantic strings
 * @param {number} width
 * @param {number} height
 * @returns {Array<{id:number, semantic:string, cells:Array<{x:number,y:number}>, area:number}>}
 */
function findRegions(semanticGrid, width, height) {
    const visited = [];
    for (let y = 0; y < height; y++) {
        visited[y] = new Array(width).fill(false);
    }

    const regions = [];
    let regionId = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (visited[y][x]) continue;
            const sem = semanticGrid[y][x];
            // Skip default/empty cells (transparent or empty string)
            if (!sem || sem === 'transparent' || sem === '') {
                visited[y][x] = true;
                continue;
            }

            // BFS flood fill
            const cells = [];
            const queue = [{ x, y }];
            visited[y][x] = true;

            while (queue.length > 0) {
                const cur = queue.shift();
                cells.push(cur);

                // 4-connected neighbors
                const neighbors = [
                    { x: cur.x - 1, y: cur.y },
                    { x: cur.x + 1, y: cur.y },
                    { x: cur.x, y: cur.y - 1 },
                    { x: cur.x, y: cur.y + 1 }
                ];

                for (const n of neighbors) {
                    if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
                    if (visited[n.y][n.x]) continue;
                    if (semanticGrid[n.y][n.x] !== sem) continue;
                    visited[n.y][n.x] = true;
                    queue.push(n);
                }
            }

            regions.push({ id: regionId++, semantic: sem, cells, area: cells.length });
        }
    }

    return regions;
}

/**
 * Compute centroid and spatial label for a region.
 * @param {{cells: Array<{x:number,y:number}>, area: number}} region
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @returns {{ cx: number, cy: number, label: string }}
 */
function labelRegion(region, gridWidth, gridHeight) {
    let sumX = 0, sumY = 0;
    for (const c of region.cells) { sumX += c.x; sumY += c.y; }
    const cx = sumX / region.area;
    const cy = sumY / region.area;

    // Map centroid to 3×3 sector
    const col = gridWidth <= 1 ? 1 : Math.min(2, Math.floor((cx / gridWidth) * 3));
    const row = gridHeight <= 1 ? 1 : Math.min(2, Math.floor((cy / gridHeight) * 3));

    return { cx, cy, label: SECTOR_LABELS[row][col] };
}

/**
 * Generate natural language description for a region.
 */
function describeRegion(region, label, gridWidth, gridHeight) {
    const pct = ((region.area / (gridWidth * gridHeight)) * 100).toFixed(1);
    const semName = SEMANTIC_NAMES[region.semantic] || region.semantic;

    if (region.area < 5) {
        return `Small ${semName} cluster at ${label}`;
    } else if (parseFloat(pct) > 30) {
        return `Large ${semName} mass at ${label} (${pct}% of grid)`;
    } else if (parseFloat(pct) > 10) {
        return `${semName.charAt(0).toUpperCase() + semName.slice(1)} region at ${label} (${pct}%)`;
    } else {
        return `${semName.charAt(0).toUpperCase() + semName.slice(1)} cluster at ${label}`;
    }
}

// ============================================================
// HELPERS: Palette Extraction
// ============================================================

/**
 * Extract palette info from an array of hex color strings.
 * @param {string[]} colors - Array of '#rrggbb' strings (one per cell)
 * @returns {{ dominant: string, accent: string[], colorCount: number, warmth: string }}
 */
function extractPalette(colors) {
    if (colors.length === 0) {
        return { dominant: '#000000', accent: [], colorCount: 0, warmth: 'neutral' };
    }

    // Frequency count
    const freq = {};
    for (const c of colors) {
        freq[c] = (freq[c] || 0) + 1;
    }

    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0][0];
    const colorCount = sorted.length;

    // Hue bucketing for accents (30° buckets, 12 total)
    const buckets = new Array(12).fill(null).map(() => ({ colors: [], count: 0, hueSum: 0 }));
    let warmCount = 0, coolCount = 0, neutralCount = 0;
    let chromaCount = 0; // count of cells with saturation > 0.1

    for (const [hex, count] of sorted) {
        const rgb = hexToRgb(hex);
        if (!rgb) continue;
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

        // Warmth classification (only for chromatic colors)
        if (hsl.s > 0.1) {
            chromaCount += count;
            const cls = classifyHue(hsl.h);
            if (cls === 'warm') warmCount += count;
            else if (cls === 'cool') coolCount += count;
            else neutralCount += count;
        }

        // Bucket by hue
        const bucket = Math.min(11, Math.floor(hsl.h / 30));
        buckets[bucket].colors.push(hex);
        buckets[bucket].count += count;
        buckets[bucket].hueSum += hsl.h * count;
    }

    // Accent: top 3 buckets that don't contain the dominant color
    const dominantRgb = hexToRgb(dominant);
    const dominantBucket = dominantRgb
        ? Math.min(11, Math.floor(rgbToHsl(dominantRgb.r, dominantRgb.g, dominantRgb.b).h / 30))
        : -1;

    const accent = buckets
        .map((b, i) => ({ index: i, count: b.count, representative: b.colors[0] }))
        .filter(b => b.index !== dominantBucket && b.count > 0 && b.representative)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(b => b.representative);

    // Warmth
    let warmth = 'neutral';
    if (chromaCount > 0) {
        const warmRatio = warmCount / chromaCount;
        const coolRatio = coolCount / chromaCount;
        if (warmRatio > 0.5) warmth = 'warm';
        else if (coolRatio > 0.5) warmth = 'cool';
        else if (warmRatio > 0.3 && coolRatio > 0.3) warmth = 'mixed';
        else warmth = 'neutral';
    }

    return { dominant, accent, colorCount, warmth };
}

// ============================================================
// HELPERS: Density Classification
// ============================================================

/**
 * Classify density average into a human-readable category.
 */
function classifyDensity(avg, fillRatio) {
    if (fillRatio < 0.1) return 'sparse';
    if (avg < 0.3) return 'sparse';
    if (avg < 0.55) return 'moderate';
    if (avg < 0.8) return 'heavy';
    return 'saturated';
}

// ============================================================
// HELPERS: Audio/Spatial Summary
// ============================================================

/**
 * MIDI note number → note name.
 */
function midiToNoteName(midi) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    return names[midi % 12] + octave;
}

/**
 * Analyze audio channel data from cells.
 * @param {Array} audioCells - Array of {cell, channel} from getCellsByChannel
 * @returns {object} Audio summary
 */
function analyzeAudio(audioCells) {
    if (audioCells.length === 0) {
        return { noteRange: 'none', avgVelocity: 0, channelDistribution: {} };
    }

    let minNote = 127, maxNote = 0;
    let velSum = 0;
    const channelCounts = {};

    for (const entry of audioCells) {
        const audio = entry.channel || entry;
        const note = audio.note ?? audio.audio?.note;
        const vel = audio.velocity ?? audio.audio?.velocity;

        if (typeof note === 'number') {
            minNote = Math.min(minNote, note);
            maxNote = Math.max(maxNote, note);
        }
        if (typeof vel === 'number') {
            velSum += vel;
        }

        // Channel from cell color → rough instrument mapping
        // This mirrors music-mapper.js color→channel logic
        const color = entry.color || '';
        if (color) {
            channelCounts[color] = (channelCounts[color] || 0) + 1;
        }
    }

    const noteRange = minNote <= maxNote
        ? `${midiToNoteName(minNote)}–${midiToNoteName(maxNote)}`
        : 'none';

    return {
        noteRange,
        avgVelocity: Math.round(velSum / audioCells.length),
        cellCount: audioCells.length
    };
}

/**
 * Analyze spatial channel data from cells.
 * @param {Array} spatialCells - Cells with channel.spatial data
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @returns {object} Spatial summary
 */
function analyzeSpatial(spatialCells, gridWidth, gridHeight) {
    if (spatialCells.length === 0) {
        return { avgHeight: 0, peakRegion: 'none', materialBreakdown: {} };
    }

    let heightSum = 0;
    let maxHeight = 0;
    let peakX = 0, peakY = 0;
    const materials = {};

    for (const entry of spatialCells) {
        const spatial = entry.channel?.spatial || entry.spatial || entry;
        const h = spatial.height ?? 0;
        heightSum += h;
        if (h > maxHeight) {
            maxHeight = h;
            peakX = entry.x ?? 0;
            peakY = entry.y ?? 0;
        }
        const mat = spatial.material || 'unknown';
        materials[mat] = (materials[mat] || 0) + 1;
    }

    // Peak sector label
    const col = gridWidth <= 1 ? 1 : Math.min(2, Math.floor((peakX / gridWidth) * 3));
    const row = gridHeight <= 1 ? 1 : Math.min(2, Math.floor((peakY / gridHeight) * 3));
    const peakRegion = SECTOR_LABELS[row][col];

    // Normalize material counts to fractions
    const total = spatialCells.length;
    const materialBreakdown = {};
    for (const [mat, count] of Object.entries(materials)) {
        materialBreakdown[mat] = parseFloat((count / total).toFixed(3));
    }

    return {
        avgHeight: parseFloat((heightSum / spatialCells.length).toFixed(3)),
        peakRegion,
        materialBreakdown
    };
}

// ============================================================
// MAIN: describeGrid
// ============================================================

/**
 * Produce a structured natural language description of a grid frame.
 *
 * @param {object} grid - A valid .grid object
 * @param {number} [frameIndex=0] - Frame to describe
 * @param {object} [options={}]
 * @param {string} [options.detail='standard'] - 'brief' | 'standard' | 'full'
 * @param {boolean} [options.includeAudio=false] - Include audio channel summary
 * @param {boolean} [options.includeSpatial=false] - Include spatial channel summary
 * @param {number} [options.maxRegions=8] - Max regions to report
 * @returns {object} GridDescription
 */
function describeGrid(grid, frameIndex, options) {
    // Handle overloaded call: describeGrid(grid, options) with no frameIndex
    if (typeof frameIndex === 'object' && frameIndex !== null && !options) {
        options = frameIndex;
        frameIndex = 0;
    }
    frameIndex = frameIndex ?? 0;
    options = options || {};

    const detail = options.detail || 'standard';
    const includeAudio = options.includeAudio || detail === 'full';
    const includeSpatial = options.includeSpatial || detail === 'full';
    const maxRegions = options.maxRegions ?? 8;

    const W = grid.canvas.width;
    const H = grid.canvas.height;
    const frame = GridCore.getFrameByIndex(grid, frameIndex);

    if (!frame) {
        return {
            summary: `Empty grid (${W}×${H}, no frame at index ${frameIndex})`,
            composition: { dimensions: `${W}×${H}`, cellCount: 0, fillRatio: 0, densityAvg: 0, densityDistribution: 'sparse' },
            palette: { dominant: grid.canvas.defaultColor || '#000000', accent: [], colorCount: 0, warmth: 'neutral' },
            semantics: { distribution: 'empty' },
            regions: [],
            prompt: `An empty ${W}×${H} grid.`
        };
    }

    // ---- Composition ----
    const cellCount = frame.cells.length;
    const totalCells = W * H;
    const fillRatio = totalCells > 0 ? parseFloat((cellCount / totalCells).toFixed(3)) : 0;

    // Density
    const densityMap = GridCore.getDensityMap(frame, grid.canvas);
    let densitySum = 0, densityCellCount = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (densityMap[y][x] > 0) {
                densitySum += densityMap[y][x];
                densityCellCount++;
            }
        }
    }
    const densityAvg = densityCellCount > 0
        ? parseFloat((densitySum / densityCellCount).toFixed(3))
        : 0;
    const densityDistribution = classifyDensity(densityAvg, fillRatio);

    const composition = {
        dimensions: `${W}×${H}`,
        cellCount,
        fillRatio,
        densityAvg,
        densityDistribution
    };

    // ---- Palette ----
    const colorMap = GridCore.getColorMap(frame, grid.canvas);
    const allColors = [];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const c = colorMap[y][x];
            if (c && c !== grid.canvas.defaultColor) {
                allColors.push(c);
            }
        }
    }
    // Also include cells with explicit colors
    for (const cell of frame.cells) {
        if (cell.color) allColors.push(cell.color);
    }
    const palette = extractPalette(allColors);

    // ---- Semantics ----
    const semanticMap = GridCore.getSemanticMap(frame, grid.canvas);
    const semCounts = {};
    let semTotal = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const s = semanticMap[y][x];
            if (s && s !== 'transparent' && s !== '') {
                semCounts[s] = (semCounts[s] || 0) + 1;
                semTotal++;
            }
        }
    }

    const semantics = {};
    for (const [s, count] of Object.entries(semCounts)) {
        semantics[s] = parseFloat((count / Math.max(1, semTotal)).toFixed(3));
    }

    // Distribution description
    const semSorted = Object.entries(semCounts).sort((a, b) => b[1] - a[1]);
    let semDescription = 'empty';
    if (semSorted.length > 0) {
        const primary = semSorted[0][0];
        if (semSorted.length === 1) {
            semDescription = `entirely ${primary}`;
        } else {
            const secondary = semSorted[1][0];
            semDescription = `${primary}-dominant with ${secondary} areas`;
        }
    }
    semantics.distribution = semDescription;

    // ---- Regions ----
    let regions = [];
    if (detail !== 'brief') {
        const rawRegions = findRegions(semanticMap, W, H);
        const topRegions = rawRegions
            .sort((a, b) => b.area - a.area)
            .slice(0, maxRegions);

        regions = topRegions.map(r => {
            const { cx, cy, label } = labelRegion(r, W, H);
            return {
                id: r.id,
                label,
                semantic: r.semantic,
                area: r.area,
                description: describeRegion(r, label, W, H)
            };
        });
    }

    // ---- Audio (optional) ----
    let audio = undefined;
    if (includeAudio) {
        const audioCells = [];
        for (const cell of frame.cells) {
            if (cell.channel && cell.channel.audio) {
                audioCells.push({
                    ...cell.channel.audio,
                    color: cell.color,
                    x: cell.x,
                    y: cell.y
                });
            }
        }
        audio = analyzeAudio(audioCells);
    }

    // ---- Spatial (optional) ----
    let spatial = undefined;
    if (includeSpatial) {
        const spatialCells = [];
        for (const cell of frame.cells) {
            if (cell.channel && cell.channel.spatial) {
                spatialCells.push({
                    ...cell.channel.spatial,
                    x: cell.x,
                    y: cell.y
                });
            }
        }
        spatial = analyzeSpatial(spatialCells, W, H);
    }

    // ---- Summary ----
    const summary = `A ${W}×${H} ${densityDistribution} grid with ${cellCount.toLocaleString()} cells (${(fillRatio * 100).toFixed(1)}% fill). ${palette.warmth.charAt(0).toUpperCase() + palette.warmth.slice(1)}-toned, ${semDescription}.`;

    // ---- Prompt Synthesis ----
    const bgDesc = palette.dominant !== '#000000'
        ? `on ${palette.dominant} background`
        : 'on dark background';

    const regionDescs = regions.slice(0, 3).map(r => r.description).join('. ');
    const accentDesc = palette.accent.length > 0
        ? `Accent colors: ${palette.accent.join(', ')}.`
        : '';

    const prompt = [
        `A ${palette.warmth}-toned ${densityDistribution} composition ${bgDesc}.`,
        regionDescs ? regionDescs + '.' : '',
        accentDesc
    ].filter(Boolean).join(' ').replace(/\.\./g, '.').trim();

    // ---- Assemble ----
    const result = {
        summary,
        composition,
        palette,
        semantics,
        regions,
        prompt
    };

    if (audio) result.audio = audio;
    if (spatial) result.spatial = spatial;

    return result;
}

// ============================================================
// EXPORTS
// ============================================================

// Expose internals for testing
const _describerInternals = {
    hexToRgb,
    rgbToHsl,
    classifyHue,
    findRegions,
    labelRegion,
    describeRegion,
    extractPalette,
    classifyDensity,
    midiToNoteName,
    analyzeAudio,
    analyzeSpatial
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { describeGrid, _internals: _describerInternals };
}
if (typeof window !== 'undefined') {
    window.GridDescriber = { describeGrid, _internals: _describerInternals };
}
export { describeGrid, _describerInternals as _internals };