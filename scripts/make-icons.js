// Generates the app icons (flame on solid orange) as PNGs with no dependencies.
// Usage: node scripts/make-icons.js
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const BG = [234, 88, 12];        // #ea580c
const OUTER = [255, 247, 237];   // #fff7ed
const INNER = [251, 146, 60];    // #fb923c

// Flame paths in a 100x100 box (cubic Béziers), same shape as the in-app flame.
const OUTER_PATH = [
  [50, 8],
  ['C', 55, 26, 78, 36, 78, 62], ['C', 78, 80, 66, 92, 50, 92], ['C', 34, 92, 22, 80, 22, 62],
  ['C', 22, 48, 29, 40, 36, 32], ['C', 37, 41, 41, 47, 47, 50], ['C', 44, 34, 47, 20, 50, 8],
];
const INNER_PATH = [
  [50, 48],
  ['C', 54, 58, 64, 63, 64, 74], ['C', 64, 83, 58, 89, 50, 89], ['C', 42, 89, 36, 83, 36, 74],
  ['C', 36, 64, 46, 58, 50, 48],
];

function flatten(path, scale, ox, oy) {
  const pts = [];
  let [x0, y0] = path[0];
  pts.push([x0, y0]);
  for (const seg of path.slice(1)) {
    const [, x1, y1, x2, y2, x3, y3] = seg;
    for (let i = 1; i <= 32; i++) {
      const t = i / 32, u = 1 - t;
      pts.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      ]);
    }
    [x0, y0] = [x3, y3];
  }
  return pts.map(([x, y]) => [ox + x * scale, oy + y * scale]);
}

// Coverage mask via scanline fill at SS× supersampling.
function mask(poly, size, SS = 4) {
  const N = size * SS;
  const cov = new Float32Array(size * size);
  const scaled = poly.map(([x, y]) => [x * SS, y * SS]);
  for (let row = 0; row < N; row++) {
    const y = row + 0.5;
    const xs = [];
    for (let i = 0; i < scaled.length; i++) {
      const [ax, ay] = scaled[i];
      const [bx, by] = scaled[(i + 1) % scaled.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(N - 1, Math.floor(xs[k + 1] - 0.5));
      for (let col = from; col <= to; col++) {
        cov[((row / SS) | 0) * size + ((col / SS) | 0)] += 1 / (SS * SS);
      }
    }
  }
  return cov;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}
function png(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB, no alpha
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size) {
  // Flame occupies ~66% of the icon, centred (stays inside maskable/rounded-corner safe zones).
  const scale = (size * 0.66) / 84;
  const ox = size / 2 - 50 * scale;
  const oy = size / 2 - 50 * scale;
  const outer = mask(flatten(OUTER_PATH, scale, ox, oy), size);
  const inner = mask(flatten(INNER_PATH, scale, ox, oy), size);
  const rgb = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    const a = Math.min(1, outer[i]);
    const b = Math.min(1, inner[i]);
    for (let c = 0; c < 3; c++) {
      let v = BG[c] * (1 - a) + OUTER[c] * a;
      v = v * (1 - b) + INNER[c] * b;
      rgb[i * 3 + c] = Math.round(v);
    }
  }
  return png(size, rgb);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  writeFileSync(join(OUT, name), render(size));
  console.log(`wrote icons/${name} (${size}x${size})`);
}
