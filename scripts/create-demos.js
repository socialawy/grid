// scripts/create-demos.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Minimal implementation of grid-core functions needed for generation
// (To avoid ESM import issues running directly from Node without a bundler)
function createGrid(width, height, meta = {}) {
    return {
        grid: "grid",
        version: "0.1.0",
        meta: {
            id: crypto.randomUUID(),
            name: meta.name || "Untitled",
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            ...meta
        },
        canvas: {
            width,
            height,
            charset: " .:-=+*#%@",
            defaultChar: " ",
            defaultColor: "#00ff00",
            background: "#000000"
        },
        frames: [],
        project: {
            bpm: 120,
            scale: "minor",
            key: "A"
        }
    };
}

function addFrame(grid, cells = [], index = 0) {
    grid.frames.push({
        id: `frame_${index}`,
        index: index,
        cells: cells
    });
}

function setCell(grid, frameIndex, x, y, char, color, density, semantic, channel) {
    if (!grid.frames[frameIndex]) return;

    // Clamp values
    const w = grid.canvas.width;
    const h = grid.canvas.height;
    if (x < 0 || x >= w || y < 0 || y >= h) return;

    grid.frames[frameIndex].cells.push({
        x, y, char, color, density, semantic, channel
    });
}

// --- DEMO GENERATORS ---

function createNeonCircuit() {
    const W = 64, H = 32;
    const grid = createGrid(W, H, { name: "Neon Circuit" });
    grid.project.bpm = 128;
    grid.project.scale = "minor_penta"; // A minor pentatonic

    addFrame(grid, [], 0);

    // Helper to draw a synth line
    const drawLine = (x1, x2, y, color, char = '#') => {
        for (let x = x1; x <= x2; x++) {
            // Add some variation
            let currentY = y;
            if (Math.random() > 0.7) currentY += (Math.random() > 0.5 ? 1 : -1);

            setCell(grid, 0, x, currentY, char, color, 0.9, 'solid', {
                audio: { velocity: 100 },
                spatial: { height: 0.8 }
            });
        }
    };

    // Bass line (Bottom rows)
    for (let i = 0; i < 8; i++) {
        drawLine(i * 8, i * 8 + 4, 28, '#00ff00', '='); // Green Bass
    }

    // Lead line (Middle)
    for (let i = 0; i < 16; i++) {
        const y = 10 + Math.floor(Math.sin(i * 0.5) * 5);
        drawLine(i * 4, i * 4 + 2, y, '#ffff00', '*'); // Yellow Lead
    }

    // Drums (Top and scattered)
    for (let x = 0; x < W; x += 4) {
        setCell(grid, 0, x, 1, '#ff00ff', '@', 1.0, 'emissive', { audio: { velocity: 127 } }); // Hi-hats
        if (x % 8 === 0) setCell(grid, 0, x, 2, '#ff00ff', 'O', 1.0, 'emissive', { audio: { velocity: 127 } }); // Kick
    }

    return grid;
}

function createSkyIslands() {
    const W = 40, H = 20;
    const grid = createGrid(W, H, { name: "Sky Islands" });
    addFrame(grid, [], 0);

    // Generate terrain using simple sine waves
    for (let x = 0; x < W; x++) {
        // Island 1
        const h1 = 10 + Math.floor(Math.sin(x * 0.2) * 4);
        for (let y = h1; y < H; y++) {
            const isSurface = (y === h1);
            const isWater = (y > 17);

            if (isWater) {
                setCell(grid, 0, x, y, '~', '#0088ff', 0.3, 'fluid', { spatial: { height: 0.1, material: 'water' } });
            } else {
                setCell(grid, 0, x, y, isSurface ? '#' : '.', isSurface ? '#00ff88' : '#553300',
                    isSurface ? 1.0 : 0.5,
                    isSurface ? 'solid' : 'void',
                    {
                        spatial: { height: (H - y) / H, material: isSurface ? 'grass' : 'dirt' }
                    });
            }
        }
    }

    return grid;
}

function createTheSignal() {
    const W = 40, H = 15;
    const grid = createGrid(W, H, { name: "The Signal" });
    grid.project.bpm = 60; // 1 frame per second roughly

    // 24 frames animation
    for (let f = 0; f < 24; f++) {
        addFrame(grid, [], f);
        const pulseX = Math.floor((f / 24) * W);

        for (let y = 0; y < H; y++) {
            // Draw background static noise (low density)
            if (Math.random() > 0.8) {
                setCell(grid, f, Math.floor(Math.random() * W), y, '.', '#111111', 0.1, 'void');
            }

            // Draw the pulse
            const waveHeight = Math.floor(Math.sin(y * 0.5 + f * 0.2) * 3);
            setCell(grid, f, pulseX, y, '|', '#ffffff', 1.0, 'emissive', {
                audio: { note: 60 + y, velocity: 50 } // Ascending glissando
            });

            // Draw wave tail
            if (pulseX > 0) setCell(grid, f, pulseX - 1, y, ':', '#00ffff', 0.5, 'emissive');
        }
    }
    return grid;
}

// --- MAIN ---

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'schemas', 'examples');

const demos = [
    { name: 'neon-circuit.grid', data: createNeonCircuit() },
    { name: 'sky-islands.grid', data: createSkyIslands() },
    { name: 'the-signal.grid', data: createTheSignal() }
];

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

demos.forEach(demo => {
    const filePath = path.join(outDir, demo.name);
    fs.writeFileSync(filePath, JSON.stringify(demo.data, null, 2));
    console.log(`✓ Generated ${demo.name}`);
});

console.log("Demos created successfully.");