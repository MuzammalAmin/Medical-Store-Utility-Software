/**
 * Draws the app icon (build/icon.png, 512×512, transparent corners) with plain
 * Node: a pharmacy-teal rounded square with a white cross (PRD §5.2 colours).
 * electron-builder turns it into the Windows .ico.
 *
 * Run: npm run icon
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const SAMPLES = 4; // 4×4 supersampling for smooth edges
const TOP = [0x14, 0xb8, 0xa6];
const BOTTOM = [0x0f, 0x76, 0x6e];

function insideRoundedSquare(x, y) {
  const m = 16;
  const r = 112;
  const min = m + r;
  const max = SIZE - m - r;
  const cx = Math.min(Math.max(x, min), max);
  const cy = Math.min(Math.max(y, min), max);
  return (
    x >= m && x <= SIZE - m && y >= m && y <= SIZE - m && (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  );
}

function insideCross(x, y) {
  const arm = 50; // half the arm width
  const len = 146; // half the arm length
  const c = SIZE / 2;
  return (
    (Math.abs(x - c) <= arm && Math.abs(y - c) <= len) ||
    (Math.abs(y - c) <= arm && Math.abs(x - c) <= len)
  );
}

const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  const t = y / (SIZE - 1);
  const teal = TOP.map((v, i) => Math.round(v + (BOTTOM[i] - v) * t));
  for (let x = 0; x < SIZE; x++) {
    let shape = 0;
    let cross = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const px = x + (sx + 0.5) / SAMPLES;
        const py = y + (sy + 0.5) / SAMPLES;
        if (insideRoundedSquare(px, py)) {
          shape += 1;
          if (insideCross(px, py)) cross += 1;
        }
      }
    }
    const n = SAMPLES * SAMPLES;
    const o = (y * SIZE + x) * 4;
    const white = shape ? cross / shape : 0;
    for (let i = 0; i < 3; i++) rgba[o + i] = Math.round(teal[i] * (1 - white) + 255 * white);
    rgba[o + 3] = Math.round((shape / n) * 255);
  }
}

// Minimal PNG encoder: IHDR + IDAT (filter 0 per row) + IEND.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++)
  rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(import.meta.dirname, '..', 'build');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'icon.png'), png);
console.log('Wrote build/icon.png');
