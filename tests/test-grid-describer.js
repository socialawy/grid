/**
 * GRID — Tests for grid-describer.js (Task 5.1)
 *
 * Pure Node tests. Zero DOM.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ---- Load modules ----
// ---- Load modules ----
const coreModule = await import('../src/core/grid-core.js');
const GridCore = coreModule.default;
// Make GridCore available globally (grid-describer reads it)
global.GridCore = GridCore;

const describerModule = await import('../src/consumers/ai/grid-describer.js');
const { describeGrid, _internals } = describerModule;
const {
    hexToRgb, rgbToHsl, classifyHue, findRegions, labelRegion,
    describeRegion, extractPalette, classifyDensity, midiToNoteName,
    analyzeAudio, analyzeSpatial
} = _internals;

let passed = 0, failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; }
    else { failed++; console.error(`  FAIL: ${msg}`); }
}
function assertEqual(a, b, msg) {
    if (a === b) { passed++; }
    else { failed++; console.error(`  FAIL: ${msg} — got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }
}
function assertClose(a, b, epsilon, msg) {
    if (Math.abs(a - b) < epsilon) { passed++; }
    else { failed++; console.error(`  FAIL: ${msg} — got ${a}, expected ~${b} (±${epsilon})`); }
}

console.log('\n🧪 Grid Describer (Task 5.1)');

// ============================================================
// hexToRgb
// ============================================================
console.log('\n--- hexToRgb ---');
{
    const r1 = hexToRgb('#ff0000');
    assertEqual(r1.r, 255, 'red channel');
    assertEqual(r1.g, 0, 'green channel');
    assertEqual(r1.b, 0, 'blue channel');

    const r2 = hexToRgb('#00ff88');
    assertEqual(r2.r, 0, 'green hex r');
    assertEqual(r2.g, 255, 'green hex g');
    assertEqual(r2.b, 136, 'green hex b');

    assertEqual(hexToRgb(null), null, 'null input');
    assertEqual(hexToRgb('invalid'), null, 'invalid string');
    assertEqual(hexToRgb('#xyz'), null, 'short invalid');
}

// ============================================================
// rgbToHsl
// ============================================================
console.log('\n--- rgbToHsl ---');
{
    const red = rgbToHsl(255, 0, 0);
    assertClose(red.h, 0, 1, 'red hue');
    assertClose(red.s, 1, 0.01, 'red saturation');
    assertClose(red.l, 0.5, 0.01, 'red lightness');

    const green = rgbToHsl(0, 255, 0);
    assertClose(green.h, 120, 1, 'green hue');

    const blue = rgbToHsl(0, 0, 255);
    assertClose(blue.h, 240, 1, 'blue hue');

    const white = rgbToHsl(255, 255, 255);
    assertEqual(white.s, 0, 'white has no saturation');
    assertClose(white.l, 1, 0.01, 'white lightness');

    const black = rgbToHsl(0, 0, 0);
    assertEqual(black.s, 0, 'black no saturation');
    assertClose(black.l, 0, 0.01, 'black lightness');
}

// ============================================================
// classifyHue
// ============================================================
console.log('\n--- classifyHue ---');
{
    assertEqual(classifyHue(0), 'warm', 'hue 0 = warm (red)');
    assertEqual(classifyHue(30), 'warm', 'hue 30 = warm (orange)');
    assertEqual(classifyHue(59), 'warm', 'hue 59 = warm (yellow)');
    assertEqual(classifyHue(120), 'cool', 'hue 120 = cool (green)');
    assertEqual(classifyHue(180), 'cool', 'hue 180 = cool (cyan)');
    assertEqual(classifyHue(239), 'cool', 'hue 239 = cool (blue)');
    assertEqual(classifyHue(300), 'warm', 'hue 300 = warm (magenta)');
    assertEqual(classifyHue(90), 'neutral', 'hue 90 = neutral');
    assertEqual(classifyHue(270), 'neutral', 'hue 270 = neutral');
}

// ============================================================
// classifyDensity
// ============================================================
console.log('\n--- classifyDensity ---');
{
    assertEqual(classifyDensity(0.1, 0.05), 'sparse', 'low fill = sparse');
    assertEqual(classifyDensity(0.2, 0.5), 'sparse', 'low avg = sparse');
    assertEqual(classifyDensity(0.4, 0.5), 'moderate', 'mid avg = moderate');
    assertEqual(classifyDensity(0.7, 0.8), 'heavy', 'high avg = heavy');
    assertEqual(classifyDensity(0.9, 0.95), 'saturated', 'very high = saturated');
}

// ============================================================
// midiToNoteName
// ============================================================
console.log('\n--- midiToNoteName ---');
{
    assertEqual(midiToNoteName(60), 'C4', 'middle C');
    assertEqual(midiToNoteName(69), 'A4', 'A440');
    assertEqual(midiToNoteName(0), 'C-1', 'lowest MIDI');
    assertEqual(midiToNoteName(127), 'G9', 'highest MIDI');
}

// ============================================================
// extractPalette
// ============================================================
console.log('\n--- extractPalette ---');
{
    // Empty
    const empty = extractPalette([]);
    assertEqual(empty.dominant, '#000000', 'empty → black dominant');
    assertEqual(empty.colorCount, 0, 'empty → 0 colors');
    assertEqual(empty.warmth, 'neutral', 'empty → neutral');

    // Single color
    const single = extractPalette(['#ff0000', '#ff0000', '#ff0000']);
    assertEqual(single.dominant, '#ff0000', 'single color dominant');
    assertEqual(single.colorCount, 1, 'single unique color');
    assertEqual(single.warmth, 'warm', 'red = warm');

    // Cool palette
    const cool = extractPalette(['#0000ff', '#0000ff', '#00ffff', '#0088ff']);
    assertEqual(cool.warmth, 'cool', 'blue palette = cool');
    assert(cool.colorCount >= 2, 'multiple unique colors');

    // Mixed palette
    const mixed = extractPalette(['#ff0000', '#ff0000', '#0000ff', '#0000ff', '#00ff00']);
    assert(['mixed', 'warm', 'cool'].includes(mixed.warmth), 'mixed warmth is valid');

    // Accent extraction
    const accented = extractPalette([
        '#000000', '#000000', '#000000', '#000000', '#000000',
        '#ff0000', '#ff0000',
        '#00ff00',
        '#0000ff'
    ]);
    assertEqual(accented.dominant, '#000000', 'black dominant');
    assert(accented.accent.length > 0, 'has accent colors');
    assert(accented.accent.length <= 3, 'max 3 accents');
}

// ============================================================
// findRegions
// ============================================================
console.log('\n--- findRegions ---');
{
    // Empty grid
    const empty = [['', '', ''], ['', '', ''], ['', '', '']];
    assertEqual(findRegions(empty, 3, 3).length, 0, 'empty grid → 0 regions');

    // Single block
    const single = [
        ['solid', 'solid', ''],
        ['solid', 'solid', ''],
        ['', '', '']
    ];
    const r1 = findRegions(single, 3, 3);
    assertEqual(r1.length, 1, 'single block → 1 region');
    assertEqual(r1[0].area, 4, 'block has 4 cells');
    assertEqual(r1[0].semantic, 'solid', 'block is solid');

    // Two separate regions
    const two = [
        ['solid', '', 'fluid'],
        ['solid', '', 'fluid'],
        ['', '', '']
    ];
    const r2 = findRegions(two, 3, 3);
    assertEqual(r2.length, 2, 'two separate regions');

    // Diagonal NOT connected (4-connectivity)
    const diag = [
        ['solid', '', ''],
        ['', 'solid', ''],
        ['', '', 'solid']
    ];
    const r3 = findRegions(diag, 3, 3);
    assertEqual(r3.length, 3, 'diagonal = 3 separate regions (4-connected)');

    // Transparent cells skipped
    const withTransparent = [
        ['transparent', 'solid', ''],
        ['', 'solid', ''],
        ['', '', '']
    ];
    const r4 = findRegions(withTransparent, 3, 3);
    assertEqual(r4.length, 1, 'transparent skipped');
    assertEqual(r4[0].semantic, 'solid', 'only solid counted');
}

// ============================================================
// labelRegion
// ============================================================
console.log('\n--- labelRegion ---');
{
    // Top-left region
    const tl = labelRegion({ cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }], area: 2 }, 30, 30);
    assertEqual(tl.label, 'top-left', 'top-left label');

    // Center region
    const c = labelRegion({ cells: [{ x: 15, y: 15 }], area: 1 }, 30, 30);
    assertEqual(c.label, 'center', 'center label');

    // Bottom-right region
    const br = labelRegion({ cells: [{ x: 28, y: 28 }], area: 1 }, 30, 30);
    assertEqual(br.label, 'bottom-right', 'bottom-right label');

    // Top-center
    const tc = labelRegion({ cells: [{ x: 15, y: 2 }], area: 1 }, 30, 30);
    assertEqual(tc.label, 'top-center', 'top-center label');

    // Bottom-left
    const bl = labelRegion({ cells: [{ x: 2, y: 28 }], area: 1 }, 30, 30);
    assertEqual(bl.label, 'bottom-left', 'bottom-left label');
}

// ============================================================
// analyzeAudio
// ============================================================
console.log('\n--- analyzeAudio ---');
{
    const empty = analyzeAudio([]);
    assertEqual(empty.noteRange, 'none', 'empty audio → no range');
    assertEqual(empty.avgVelocity, 0, 'empty audio → 0 velocity');

    const notes = [
        { note: 60, velocity: 100 },
        { note: 72, velocity: 80 },
        { note: 48, velocity: 120 }
    ];
    const result = analyzeAudio(notes);
    assertEqual(result.noteRange, 'C3–C5', 'note range C3–C5');
    assertEqual(result.avgVelocity, 100, 'avg velocity = 100');
}

// ============================================================
// analyzeSpatial
// ============================================================
console.log('\n--- analyzeSpatial ---');
{
    const empty = analyzeSpatial([], 10, 10);
    assertEqual(empty.avgHeight, 0, 'empty → 0 height');
    assertEqual(empty.peakRegion, 'none', 'empty → no peak');

    const cells = [
        { height: 0.5, material: 'solid', x: 5, y: 5 },
        { height: 0.9, material: 'fluid', x: 8, y: 8 },
        { height: 0.3, material: 'solid', x: 2, y: 2 }
    ];
    const result = analyzeSpatial(cells, 10, 10);
    assert(result.avgHeight > 0.5, 'avg height > 0.5');
    assertEqual(result.peakRegion, 'bottom-right', 'peak at bottom-right (8,8 in 10x10)');
    assert(result.materialBreakdown.solid > 0, 'has solid material');
    assert(result.materialBreakdown.fluid > 0, 'has fluid material');
}

// ============================================================
// describeGrid — full integration
// ============================================================
console.log('\n--- describeGrid (integration) ---');
{
    // Empty grid
    const emptyGrid = GridCore.createGrid(10, 10, '@#.', '#000000');
    const d0 = describeGrid(emptyGrid);
    assert(d0.summary.includes('10×10'), 'summary has dimensions');
    assertEqual(d0.composition.cellCount, 0, 'no cells');
    assertEqual(d0.composition.fillRatio, 0, 'zero fill');
    assert(d0.prompt.length > 0, 'prompt generated');

    // Single-cell grid
    const oneCell = GridCore.createGrid(5, 5, '@#.', '#000000');
    oneCell.frames[0] = GridCore.setCell(oneCell.frames[0], 2, 2, {
        char: '@', color: '#ff0000', density: 0.9, semantic: 'solid'
    });
    const d1 = describeGrid(oneCell);
    assertEqual(d1.composition.cellCount, 1, 'one cell');
    assert(d1.palette.dominant === '#ff0000', 'red dominant');
    assert(d1.semantics.solid > 0, 'solid semantic present');

    // Multi-cell grid with regions
    const multi = GridCore.createGrid(10, 10, '@#.-~', '#000000');
    let frame = multi.frames[0];
    // Top solid block
    for (let x = 3; x < 7; x++) {
        for (let y = 0; y < 3; y++) {
            frame = GridCore.setCell(frame, x, y, {
                char: '@', color: '#00ff00', density: 0.8, semantic: 'solid'
            });
        }
    }
    // Bottom fluid block
    for (let x = 2; x < 8; x++) {
        for (let y = 7; y < 10; y++) {
            frame = GridCore.setCell(frame, x, y, {
                char: '~', color: '#0000ff', density: 0.5, semantic: 'fluid'
            });
        }
    }
    multi.frames[0] = frame;

    const d2 = describeGrid(multi);
    assertEqual(d2.composition.cellCount, 30, '12 solid + 18 fluid = 30');
    assert(d2.regions.length >= 2, 'at least 2 regions');
    assert(d2.semantics.solid > 0, 'solid present');
    assert(d2.semantics.fluid > 0, 'fluid present');
    assert(d2.semantics.distribution.includes('solid') || d2.semantics.distribution.includes('fluid'),
        'distribution mentions types');
    assert(d2.prompt.includes('composition'), 'prompt has composition word');

    // Brief detail — no regions
    const d3 = describeGrid(multi, 0, { detail: 'brief' });
    assertEqual(d3.regions.length, 0, 'brief has no regions');

    // Full detail — includes audio and spatial
    const withChannels = GridCore.createGrid(5, 5, '@', '#000000');
    let chFrame = withChannels.frames[0];
    chFrame = GridCore.setCell(chFrame, 2, 2, {
        char: '@', color: '#ff0000', density: 0.9, semantic: 'solid',
        channel: {
            audio: { note: 60, velocity: 100, duration: 1 },
            spatial: { height: 0.8, material: 'solid' }
        }
    });
    withChannels.frames[0] = chFrame;

    const d4 = describeGrid(withChannels, 0, { detail: 'full' });
    assert(d4.audio !== undefined, 'full detail includes audio');
    assert(d4.spatial !== undefined, 'full detail includes spatial');
    assert(d4.audio.noteRange !== 'none', 'audio has note range');
    assert(d4.spatial.avgHeight > 0, 'spatial has height');
}

// ============================================================
// describeGrid — overloaded call signature
// ============================================================
console.log('\n--- describeGrid (overloaded signature) ---');
{
    const g = GridCore.createGrid(5, 5, '@', '#000000');
    // describeGrid(grid, options) — no frameIndex
    const d = describeGrid(g, { detail: 'brief' });
    assertEqual(d.regions.length, 0, 'overloaded call works with brief');
    assert(d.summary.includes('5×5'), 'overloaded call gets correct grid');
}

// ============================================================
// describeGrid — invalid frame index
// ============================================================
console.log('\n--- describeGrid (invalid frame) ---');
{
    const g = GridCore.createGrid(5, 5, '@', '#000000');
    const d = describeGrid(g, 99);
    assert(d.summary.includes('no frame'), 'invalid frame noted in summary');
    assertEqual(d.composition.cellCount, 0, 'no cells for invalid frame');
}

// ============================================================
// RESULTS
// ============================================================
console.log(`\nGrid Describer: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);