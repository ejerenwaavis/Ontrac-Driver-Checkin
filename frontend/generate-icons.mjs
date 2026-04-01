/**
 * Generates icon-192.png and icon-512.png in public/icons/
 * Uses only Node built-ins — no extra packages required.
 * Design: #CC0000 red background, white shield with checkmark (matches favicon.svg).
 */
import { mkdirSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CRC32 ──────────────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

// ── PNG builder ────────────────────────────────────────────────────────────────
function makePNG(size) {
  const s = size;
  // RGBA pixel buffer
  const pixels = new Uint8Array(s * s * 4);

  const cx = s / 2, cy = s / 2;
  const pad = s * 0.08;  // outer padding
  const R = s / 2 - pad; // outer radius of the rounded rect

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const idx = (y * s + x) * 4;

      // Rounded square: distance from centre for corner rounding
      const dx = Math.abs(x - cx) - (R - s * 0.15);
      const dy = Math.abs(y - cy) - (R - s * 0.15);
      const cornerDist = Math.sqrt(Math.max(0, dx) ** 2 + Math.max(0, dy) ** 2);
      const inRounded = (dx <= 0 || dy <= 0) ? true : cornerDist < s * 0.15;
      const inSquare = Math.abs(x - cx) <= R && Math.abs(y - cy) <= R && inRounded;

      if (!inSquare) {
        // transparent outside
        pixels[idx] = pixels[idx+1] = pixels[idx+2] = pixels[idx+3] = 0;
        continue;
      }

      // Default: brand red background
      pixels[idx]   = 204;
      pixels[idx+1] = 0;
      pixels[idx+2] = 0;
      pixels[idx+3] = 255;

      // Shield outline (white)
      const shieldScale = s * 0.28;
      const sx = (x - cx) / shieldScale;
      const sy = (y - cy) / shieldScale;

      // Shield path approximation: top arc + tapered bottom
      const shieldOuter = isInShield(sx, sy, 1.0);
      const shieldInner = isInShield(sx * 1.15, sy * 1.15 - 0.05, 1.0);

      if (shieldOuter && !shieldInner) {
        pixels[idx]   = 255;
        pixels[idx+1] = 255;
        pixels[idx+2] = 255;
      }

      // Checkmark (white) — starts at ~(-0.35, 0.1) to (0, 0.55) to (0.55, -0.25)
      if (isOnCheckmark(sx, sy, s)) {
        pixels[idx]   = 255;
        pixels[idx+1] = 255;
        pixels[idx+2] = 255;
      }
    }
  }

  // --- convert RGBA → RGB with filter bytes ---
  const rowStride = 1 + s * 3;
  const raw = Buffer.alloc(s * rowStride);
  for (let y = 0; y < s; y++) {
    raw[y * rowStride] = 0; // filter: None
    for (let x = 0; x < s; x++) {
      const src = (y * s + x) * 4;
      const dst = y * rowStride + 1 + x * 3;
      // Blend with white background for transparent pixels
      const a = pixels[src + 3] / 255;
      raw[dst]   = Math.round(pixels[src]   * a + 255 * (1 - a));
      raw[dst+1] = Math.round(pixels[src+1] * a + 255 * (1 - a));
      raw[dst+2] = Math.round(pixels[src+2] * a + 255 * (1 - a));
    }
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(s, 0); ihdrData.writeUInt32BE(s, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; // 8-bit RGB

  const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Shield shape (normalised coords, centred at 0,0) ──────────────────────────
function isInShield(nx, ny, scale) {
  // Top half: roughly circular / arched
  // Bottom half: tapers to a point at ny ≈ 0.85
  if (Math.abs(nx) > 0.75 * scale) return false;
  if (ny < -0.85 * scale) return false;

  // Top arch
  if (ny > 0.7 * scale) {
    const rx = nx / (0.75 * scale);
    const ry = (ny - 0.7 * scale) / (0.35 * scale);
    return (rx * rx + ry * ry) < 1;
  }
  // Bottom taper: width narrows linearly from 0.75 at ny=0.7 down to 0 at ny=-0.85
  const fraction = (ny + 0.85 * scale) / (1.55 * scale);
  const halfWidth = 0.75 * scale * fraction;
  return Math.abs(nx) < halfWidth;
}

// ── Checkmark segments ─────────────────────────────────────────────────────────
function isOnCheckmark(nx, ny, size) {
  const thickness = 0.11;
  // Left leg: from (-0.38, 0.08) to (-0.02, 0.52)
  const d1 = distToSegment(nx, ny, -0.38, 0.08, -0.02, 0.52);
  // Right leg: from (-0.02, 0.52) to (0.52, -0.22)
  const d2 = distToSegment(nx, ny, -0.02, 0.52, 0.52, -0.22);
  return d1 < thickness || d2 < thickness;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx2 = ax + t * dx, cy2 = ay + t * dy;
  return Math.sqrt((px - cx2) ** 2 + (py - cy2) ** 2);
}

// ── Write icons ────────────────────────────────────────────────────────────────
const iconsDir = join(__dirname, 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

console.log('Generating 192×192…');
writeFileSync(join(iconsDir, 'icon-192.png'), makePNG(192));
console.log('Generating 512×512…');
writeFileSync(join(iconsDir, 'icon-512.png'), makePNG(512));
console.log('Done → frontend/public/icons/');
