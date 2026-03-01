#!/usr/bin/env node
/**
 * generate-icons.js — Creates minimal PNG icons for the GRID PWA
 * Uses only Node.js built-ins (zlib, fs, path). No dependencies.
 *
 * Generates solid dark background with a green "G" letter pattern.
 */

import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = join(__dirname, '..', 'dist');

// Colors
const BG = [0x0a, 0x0a, 0x1a, 0xff];
const FG = [0x00, 0xff, 0x88, 0xff];

// Simple "G" glyph as a 7x7 pattern (1 = foreground, 0 = background)
const GLYPH = [
  [0,1,1,1,1,1,0],
  [1,1,0,0,0,0,1],
  [1,1,0,0,0,0,0],
  [1,1,0,0,1,1,1],
  [1,1,0,0,0,1,1],
  [1,1,0,0,0,1,1],
  [0,1,1,1,1,1,0],
];

// Also draw a small grid pattern in the background
function isGridLine(x, y, size) {
  const spacing = Math.floor(size / 8);
  if (spacing < 2) return false;
  return (x % spacing === 0) || (y % spacing === 0);
}

function createPNG(size) {
  const glyphScale = Math.floor(size / 10);
  const glyphW = 7 * glyphScale;
  const glyphH = 7 * glyphScale;
  const offsetX = Math.floor((size - glyphW) / 2);
  const offsetY = Math.floor((size - glyphH) / 2);
  const gridDim = [0x0a, 0x14, 0x1a, 0xff]; // very dim grid lines

  // Raw pixel data with filter byte per row
  const rawData = Buffer.alloc((size * 4 + 1) * size);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (size * 4 + 1);
    rawData[rowOffset] = 0; // filter: None

    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 4;

      // Check if in glyph area
      const gx = Math.floor((x - offsetX) / glyphScale);
      const gy = Math.floor((y - offsetY) / glyphScale);

      let color;
      if (gx >= 0 && gx < 7 && gy >= 0 && gy < 7 && GLYPH[gy][gx]) {
        color = FG;
      } else if (isGridLine(x, y, size)) {
        color = gridDim;
      } else {
        color = BG;
      }

      rawData[px]     = color[0];
      rawData[px + 1] = color[1];
      rawData[px + 2] = color[2];
      rawData[px + 3] = color[3];
    }
  }

  const compressed = deflateSync(rawData, { level: 9 });

  // Build PNG file
  const chunks = [];

  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  chunks.push(makeChunk('IHDR', ihdr));

  // IDAT
  chunks.push(makeChunk('IDAT', compressed));

  // IEND
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const crc = crc32(crcData);

  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc, 0);

  return Buffer.concat([len, typeB, data, crcB]);
}

// CRC-32 (PNG spec)
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate
const icon192 = createPNG(192);
const icon512 = createPNG(512);

writeFileSync(join(distDir, 'icon-192.png'), icon192);
writeFileSync(join(distDir, 'icon-512.png'), icon512);

console.log(`Generated icon-192.png (${icon192.length} bytes)`);
console.log(`Generated icon-512.png (${icon512.length} bytes)`);
