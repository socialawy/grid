/* scripts/make-doxascope.mjs */
import fs from 'fs';
import path from 'path';

// ---- Load modules ----
const coreModule = await import('../src/core/grid-core.js');
const GridCore = coreModule.default;
global.GridCore = GridCore;

const textToGridModule = await import('../src/consumers/ai/text-to-grid.js');
const { textToGrid } = textToGridModule;

// ---- Configuration ----
const WIDTH = 60;
const HEIGHT = 30;
const NAME = "Chapter 1 - Awakening";

// ---- Helper: Add cell to frame ----
function addCell(frame, x, y, char, color, semantic = 'void') {
    frame.cells.push({ x, y, char, color, semantic });
}

// 1. Initialize Project (GridCore is an object, use createGrid)
const g = GridCore.createGrid(WIDTH, HEIGHT, '@#$%&*+=-.~ ', '#00ff00', { name: NAME });

// Override project settings
g.project.bpm = 60;
g.project.scale = 'minor';
g.project.key = 'A';
g.project.ai_context = {
    description: "Adam wakes in The Mist. The world materializes around him."
};

// Frame 1: The Void
const f1 = g.frames[0];
f1.id = "frame_001";
f1.name = "The Void";
addCell(f1, 28, 14, '.', '#334455');
addCell(f1, 31, 15, ':', '#334455');
addCell(f1, 30, 16, '.', '#334455');
addCell(f1, 29, 13, ':', '#334455');

// Frame 2: The Mist Stirs
const gen2 = textToGrid('mist sparse', { width: WIDTH, height: HEIGHT, seed: 123 });
const f2 = gen2.grid.frames[0];
f2.id = "frame_002";
f2.name = "The Mist Stirs";
f2.index = 1; // Correct index
// Erase edges (keep center clusters)
f2.cells = f2.cells.filter(c =>
    c.x >= 15 && c.x < 45 && c.y >= 7 && c.y < 22
);
// Ensure characters and colors are thematic
f2.cells.forEach(c => {
    c.char = Math.random() > 0.5 ? '~' : '-';
    c.color = '#667788';
});
g.frames.push(f2);

// Frame 3: Raf Appears
const f3 = JSON.parse(JSON.stringify(f2)); // Deep copy
f3.id = "frame_003";
f3.name = "Raf Appears";
f3.index = 2;
// Raf at (40, 15)
addCell(f3, 40, 15, '@', '#d4af37', 'emissive');
addCell(f3, 41, 15, '@', '#d4af37', 'emissive');
addCell(f3, 40, 16, '@', '#d4af37', 'emissive');
// Signal
addCell(f3, 42, 14, '*', '#00ff88', 'emissive');
g.frames.push(f3);

// Frame 4: The World Forms
const gen4 = textToGrid('terrain center, mist south, energy north sparse', { width: WIDTH, height: HEIGHT, seed: 456 });
const f4 = gen4.grid.frames[0];
f4.id = "frame_004";
f4.name = "The World Forms";
f4.index = 3;
// Hand-edit simulation: preserve Raf
addCell(f4, 40, 15, '@', '#d4af37', 'emissive');
addCell(f4, 41, 15, '@', '#d4af37', 'emissive');
addCell(f4, 40, 16, '@', '#d4af37', 'emissive');
// Densify terrain chars
f4.cells.forEach(c => {
    if (c.x > 25 && c.x < 35 && c.y > 10 && c.y < 20) {
        if (Math.random() > 0.7) c.char = '#';
        if (Math.random() > 0.85) c.char = '@';
    }
});
g.frames.push(f4);

// Frame 5: Adam Stands
const f5 = JSON.parse(JSON.stringify(f4));
f5.id = "frame_005";
f5.name = "Adam Stands";
f5.index = 4;
// Adam at (30, 15)
addCell(f5, 30, 15, '@', '#ffffff', 'void');
// Awareness radius in #aaaaaa
addCell(f5, 29, 15, '*', '#aaaaaa');
addCell(f5, 31, 15, '*', '#aaaaaa');
addCell(f5, 30, 14, '*', '#aaaaaa');
addCell(f5, 30, 16, '*', '#aaaaaa');
g.frames.push(f5);

// Ensure all cells have IDs (some textToGrid cells might not if generated directly)
g.frames.forEach(f => {
    f.cells.forEach(c => {
        if (!c.id) c.id = GridCore.generateId();
    });
});

// Final serialization
const exportPath = path.join('schemas', 'examples', 'doxascope-ch1.grid');
const json = GridCore.serializeGrid(g, true);
fs.writeFileSync(exportPath, json);

console.log(`Successfully generated valid .grid: ${exportPath}`);
