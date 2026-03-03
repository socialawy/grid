// scripts/create-cinematic-demo.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'schemas', 'examples');

// --- Helpers ---

function createGrid(width, height, meta = {}) {
    return {
        grid: "grid",
        version: "0.1.0",
        meta: {
            id: crypto.randomUUID(),
            name: meta.name || "Untitled",
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            author: "GRID Demo Script",
            notes: "A cinematic score. Play in 'Music Mode' for video+audio sync.",
            ...meta
        },
        canvas: { width, height, charset: " .,:;+*?%@#", defaultChar: " ", defaultColor: "#00ff00", background: "#000000" },
        frames: [{ id: "frame_0", index: 0, cells: [] }],
        project: { bpm: 120, scale: "minor", key: "A" }
    };
}

function addCell(grid, x, y, char, color, density, semantic, channel) {
    if (x < 0 || x >= grid.canvas.width || y < 0 || y >= grid.canvas.height) return;
    grid.frames[0].cells.push({ x, y, char, color, density, semantic, channel });
}

// --- GENERATOR: "The Heist" ---

function createTheHeist() {
    const W = 240; // ~60 seconds at 120bpm (4 beats/col? No, 1 col = 1 beat roughly? 120bpm = 2 beats/sec. 240 cols = 120s = 2min. Let's do 30s = 60 cols?)
    // Actually, standard MIDI mapping: 1 col = 1 beat usually. 
    // Let's do 120 cols for 1 minute.
    const W_final = 120;
    const H = 20;
    const grid = createGrid(W_final, H, { name: "The Heist - Cinematic Score" });
    grid.project.bpm = 128;

    // -- ACT 1: STEALTH (Cols 0-30) --
    // Sparse, low notes, dark colors.
    for (let x = 0; x < 30; x += 4) {
        // Bass pulse (row 18)
        addCell(grid, x, 18, '=', '#003300', 0.4, 'solid', { audio: { velocity: 40 }, spatial: { height: 0.2 } });

        // Random glitch (high pitch, low velocity)
        if (Math.random() > 0.7) {
            const y = 2 + Math.floor(Math.random() * 5);
            addCell(grid, x, y, '.', '#110000', 0.2, 'void', { audio: { velocity: 20 } });
        }
    }

    // -- ACT 2: THE ALARM (Cols 30-50) --
    // Sudden density, "red" alarms, rapid drums.
    for (let x = 30; x < 50; x++) {
        // Alarm pattern (Top rows)
        const alarmY = (x % 2 === 0) ? 2 : 3;
        addCell(grid, x, alarmY, '!', '#ff0000', 1.0, 'emissive', { audio: { velocity: 100 }, spatial: { height: 1.0 } });

        // Rapid Snare (Row 15)
        if (x % 2 === 0) addCell(grid, x, 15, 's', '#ff00ff', 0.8, 'solid', { audio: { velocity: 80 } });

        // Bass chug
        if (x % 4 === 0) addCell(grid, x, 18, '=', '#00ff00', 0.9, 'solid', { audio: { velocity: 110 } });
    }

    // -- ACT 3: THE CHASE (Cols 50-90) --
    // Driving beat, ascending melody.
    for (let x = 50; x < 90; x++) {
        // Kick drum (Row 19)
        if (x % 2 === 0) addCell(grid, x, 19, 'K', '#ff00ff', 1.0, 'solid', { audio: { velocity: 120 } });

        // Hi-hat (Row 10)
        addCell(grid, x, 10, 'h', '#ffff00', 0.5, 'solid', { audio: { velocity: 40 } });

        // Driving Bass
        addCell(grid, x, 17, '=', '#00ff00', 0.8, 'solid', { audio: { velocity: 90 } });

        // Ascending Lead
        const leadY = 8 - Math.floor((x - 50) / 5); // Rising pitch
        if (x % 4 === 0) addCell(grid, x, leadY, '*', '#ffffff', 1.0, 'emissive', { audio: { velocity: 100 } });
    }

    // -- ACT 4: FADE OUT (Cols 90-120) --
    for (let x = 90; x < 120; x += 2) {
        // Fading bass
        addCell(grid, x, 18, '.', '#001100', 0.2, 'void', { audio: { velocity: 20 } });
    }

    return grid;
}

// --- MAIN ---
const demo = createTheHeist();
const outFile = path.join(outDir, 'the-heist.grid');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(demo, null, 2));
console.log(`✓ Cinematic Demo created: ${outFile}`);