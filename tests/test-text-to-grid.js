/**
 * GRID — Tests for text-to-grid.js (Task 5.4a)
 *
 * Pure Node tests. Zero DOM.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ---- Load modules ----
const coreModule = await import('../src/core/grid-core.js');
const GridCore = coreModule.default;
// Make GridCore available globally (text-to-grid might read it)
global.GridCore = GridCore;

const textToGridModule = await import('../src/consumers/ai/text-to-grid.js');
const { textToGrid, _internals } = textToGridModule;
const {
    VOCABULARY, POSITION_KEYWORDS, DENSITY_KEYWORDS, SIZE_KEYWORDS,
    tokenize, parseTokens, mergePosition, layoutZones, getSectorBounds,
    fillZone, varyColor, mulberry32
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

console.log('\n🧪 Text-to-Grid Generator (Task 5.4a)');

// ============================================================
// tokenize
// ============================================================
console.log('\n--- tokenize ---');
{
    const t1 = tokenize('A mountain landscape with river');
    assert(t1.includes('mountain'), 'has mountain');
    assert(t1.includes('landscape'), 'has landscape');
    assert(t1.includes('river'), 'has river');
    assert(!t1.includes('A'), 'lowercased');
    assert(t1.includes('a'), 'articles kept (they are just ignored by parser)');
    assertEqual(t1[0], 'a', 'first token is a');

    const t2 = tokenize('');
    assertEqual(t2.length, 0, 'empty prompt → empty tokens');

    const t3 = tokenize(null);
    assertEqual(t3.length, 0, 'null prompt → empty tokens');

    const t4 = tokenize('Fire!!! and... water???');
    assert(t4.includes('fire'), 'strips punctuation');
    assert(t4.includes('water'), 'strips question marks');
}

// ============================================================
// parseTokens
// ============================================================
console.log('\n--- parseTokens ---');
{
    // Single keyword
    const z1 = parseTokens(['ocean']);
    assertEqual(z1.length, 1, 'one keyword → one zone');
    assertEqual(z1[0].vocab, 'water', 'ocean → water vocab');
    assertEqual(z1[0].generator, 'wave', 'water → wave generator');

    // Multiple keywords
    const z2 = parseTokens(['mountain', 'river']);
    assertEqual(z2.length, 2, 'two keywords → two zones');
    assertEqual(z2[0].vocab, 'terrain', 'mountain → terrain');
    assertEqual(z2[1].vocab, 'water', 'river → water');

    // Position modifier
    const z3 = parseTokens(['mountain', 'north']);
    assertEqual(z3.length, 1, 'mountain north → one zone');
    assertEqual(z3[0].position, 'top', 'north → top position');

    // Density modifier
    const z4 = parseTokens(['forest', 'dense']);
    assertEqual(z4.length, 1, 'forest dense → one zone');
    assert(z4[0].densityMod > 1, 'dense increases density');

    // Size modifier
    const z5 = parseTokens(['city', 'large']);
    assertEqual(z5.length, 1, 'city large → one zone');
    assert(z5[0].sizeMod > 1, 'large increases size');

    // Unknown words ignored
    const z6 = parseTokens(['the', 'big', 'mountain', 'is', 'beautiful']);
    assertEqual(z6.length, 1, 'filters to one zone');
    assertEqual(z6[0].vocab, 'terrain', 'mountain matched');

    // No vocab → empty
    const z7 = parseTokens(['hello', 'world', 'foo']);
    assertEqual(z7.length, 0, 'no vocab matches → empty');

    // Doxascope keywords
    const z8 = parseTokens(['mist']);
    assertEqual(z8.length, 1, 'mist matched');
    assertEqual(z8[0].vocab, 'mist', 'mist → mist vocab');
    assertEqual(z8[0].semantic, 'fluid', 'mist → fluid semantic');

    const z9 = parseTokens(['portal']);
    assertEqual(z9.length, 1, 'portal matched');
    assertEqual(z9[0].vocab, 'door', 'portal → door vocab');
    assertEqual(z9[0].semantic, 'emissive', 'door → emissive');
}

// ============================================================
// mergePosition
// ============================================================
console.log('\n--- mergePosition ---');
{
    assertEqual(mergePosition(null, 'top'), 'top', 'null + top = top');
    assertEqual(mergePosition('top', 'left'), 'top-left', 'top + left = top-left');
    assertEqual(mergePosition('left', 'top'), 'top-left', 'left + top = top-left');
    assertEqual(mergePosition('center', 'top'), 'center', 'center overrides');
    assertEqual(mergePosition('top', 'bottom'), 'bottom', 'same axis → latest');
}

// ============================================================
// getSectorBounds
// ============================================================
console.log('\n--- getSectorBounds ---');
{
    const b1 = getSectorBounds('top', 30, 30);
    assertEqual(b1.x0, 0, 'top: x starts at 0');
    assertEqual(b1.x1, 30, 'top: full width');
    assertEqual(b1.y0, 0, 'top: starts at row 0');
    assert(b1.y1 <= 10, 'top: ends at ~1/3 height');

    const b2 = getSectorBounds('center', 30, 30);
    assert(b2.x0 > 0, 'center: x offset');
    assert(b2.y0 > 0, 'center: y offset');

    const b3 = getSectorBounds('full', 30, 30);
    assertEqual(b3.x0, 0, 'full: x=0');
    assertEqual(b3.y0, 0, 'full: y=0');
    assertEqual(b3.x1, 30, 'full: x1=W');
    assertEqual(b3.y1, 30, 'full: y1=H');
}

// ============================================================
// layoutZones
// ============================================================
console.log('\n--- layoutZones ---');
{
    // Single zone, no position → full grid
    const a1 = layoutZones([{ position: null, sizeMod: 1.0 }], 40, 20);
    assertEqual(a1.length, 1, 'one zone → one assignment');
    assertEqual(a1[0].bounds.x0, 0, 'full x0');
    assertEqual(a1[0].bounds.y1, 20, 'full y1');

    // Two zones, no position → stacked vertically
    const a2 = layoutZones([
        { position: null, sizeMod: 1.0 },
        { position: null, sizeMod: 1.0 }
    ], 40, 20);
    assertEqual(a2.length, 2, 'two zones');
    assert(a2[0].bounds.y1 <= a2[1].bounds.y0 + 1, 'stacked vertically');

    // Positioned zone
    const a3 = layoutZones([{ position: 'top', sizeMod: 1.0 }], 40, 20);
    assertEqual(a3[0].bounds.y0, 0, 'top zone starts at 0');
}

// ============================================================
// varyColor
// ============================================================
console.log('\n--- varyColor ---');
{
    const v1 = varyColor('#808080', 10);
    assertEqual(v1, '#8a8a8a', 'brightened grey');

    const v2 = varyColor('#ff0000', 20);
    assertEqual(v2, '#ff1414', 'brightened red');

    const v3 = varyColor('#000000', -10);
    assertEqual(v3, '#000000', 'clamped at 0');

    const v4 = varyColor('#ffffff', 10);
    assertEqual(v4, '#ffffff', 'clamped at 255');

    const v5 = varyColor('invalid', 10);
    assertEqual(v5, 'invalid', 'invalid passthrough');
}

// ============================================================
// mulberry32 (determinism)
// ============================================================
console.log('\n--- mulberry32 ---');
{
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    const seq1 = [rng1(), rng1(), rng1()];
    const seq2 = [rng2(), rng2(), rng2()];
    assertEqual(seq1[0], seq2[0], 'same seed → same first value');
    assertEqual(seq1[1], seq2[1], 'same seed → same second value');
    assertEqual(seq1[2], seq2[2], 'same seed → same third value');

    const rng3 = mulberry32(99);
    const val3 = rng3();
    assert(val3 !== seq1[0], 'different seed → different value');
}

// ============================================================
// textToGrid — full integration
// ============================================================
console.log('\n--- textToGrid (integration) ---');
{
    // Basic: single keyword
    const r1 = textToGrid('ocean', { width: 20, height: 10, seed: 42 });
    assert(r1.grid, 'returns grid');
    assert(r1.interpretation, 'returns interpretation');
    assertEqual(r1.grid.canvas.width, 20, 'width=20');
    assertEqual(r1.grid.canvas.height, 10, 'height=10');
    assert(r1.grid.frames[0].cells.length > 0, 'has cells');
    assertEqual(r1.interpretation.tokensMatched[0], 'water', 'ocean → water matched');
    assert(!r1.interpretation.fallbackUsed, 'no fallback');

    // Check cells have full channel data
    const cell = r1.grid.frames[0].cells[0];
    assert(cell.char, 'cell has char');
    assert(cell.color, 'cell has color');
    assert(typeof cell.density === 'number', 'cell has density');
    assert(cell.semantic, 'cell has semantic');
    assert(cell.channel, 'cell has channel');
    assert(cell.channel.audio, 'cell has audio channel');
    assert(cell.channel.spatial, 'cell has spatial channel');

    // Determinism
    const r2 = textToGrid('ocean', { width: 20, height: 10, seed: 42 });
    assertEqual(r1.grid.frames[0].cells.length, r2.grid.frames[0].cells.length, 'deterministic cell count');

    // Multi-keyword with positions
    const r3 = textToGrid('mountain north, water south', { width: 30, height: 20, seed: 100 });
    assert(r3.grid.frames[0].cells.length > 0, 'multi-zone has cells');
    assertEqual(r3.interpretation.zones.length, 2, 'two zones');
    assertEqual(r3.interpretation.zones[0].vocab, 'terrain', 'first = terrain');
    assertEqual(r3.interpretation.zones[1].vocab, 'water', 'second = water');

    // Fallback: no vocab matched
    const r4 = textToGrid('xyzzy blorp fnord', { width: 10, height: 10, seed: 1 });
    assert(r4.grid.frames[0].cells.length > 0, 'fallback produces cells');
    assert(r4.interpretation.fallbackUsed, 'fallback noted');

    // Density modifier
    const r5a = textToGrid('sparse forest', { width: 20, height: 10, seed: 55 });
    const r5b = textToGrid('dense forest', { width: 20, height: 10, seed: 55 });
    assert(r5b.grid.frames[0].cells.length >= r5a.grid.frames[0].cells.length,
        'dense has >= cells than sparse');

    // ai_context stored
    const r6 = textToGrid('The Mist', { width: 15, height: 15, seed: 777 });
    assert(r6.grid.project.ai_context, 'ai_context exists');
    assertEqual(r6.grid.project.ai_context.prompt, 'The Mist', 'prompt stored');
    assertEqual(r6.grid.project.ai_context.seed, 777, 'seed stored');
    assert(r6.grid.project.ai_context.zones.length > 0, 'zones stored');

    // Doxascope: mist
    const r7 = textToGrid('mist', { width: 20, height: 10, seed: 42 });
    assertEqual(r7.interpretation.tokensMatched[0], 'mist', 'mist matched');
    // Check semantic is fluid
    const fluidCells = r7.grid.frames[0].cells.filter(c => c.semantic === 'fluid');
    assert(fluidCells.length > 0, 'mist produces fluid cells');

    // Width/height respected
    const r8 = textToGrid('stars', { width: 5, height: 3, seed: 1 });
    assertEqual(r8.grid.canvas.width, 5, 'small grid width');
    assertEqual(r8.grid.canvas.height, 3, 'small grid height');

    // Empty prompt
    const r9 = textToGrid('', { width: 10, height: 10, seed: 1 });
    assert(r9.grid, 'empty prompt → still returns grid');
    assert(r9.interpretation.fallbackUsed, 'empty prompt → fallback');
}

// ============================================================
// All 12 vocabulary entries produce valid grids
// ============================================================
console.log('\n--- vocabulary coverage ---');
{
    const vocabKeys = Object.keys(VOCABULARY);
    for (const key of vocabKeys) {
        const trigger = VOCABULARY[key].triggers[0];
        const r = textToGrid(trigger, { width: 15, height: 10, seed: 42 });
        assert(r.grid.frames[0].cells.length > 0, `vocab '${key}' (trigger: ${trigger}) produces cells`);
    }
}

// ============================================================
// RESULTS
// ============================================================
console.log(`\nText-to-Grid: ${passed} passed, ${failed} failed`);

// Export results for run-all.js aggregation
const results = { passed, failed, skipped: 0 };
export { results };
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { results };
}

if (failed > 0) process.exit(1);