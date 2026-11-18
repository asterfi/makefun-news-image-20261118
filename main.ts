// News image for make.fun — "Sum up 18 November's world news in one image".
// Node 22, standard library only, no network. The program draws the whole
// 1024x1024 front page itself (panels, icons, headlines in a 5x7 pixel font)
// and writes it to /output/entry.png, deterministically: same bytes every run.
//
// Run locally: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// 5x7 pixel font. Each glyph is 7 rows of 5 bits, '#' = on, '.' = off.
// Uppercase, digits and the punctuation the headlines need.
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#..##'],
  '+': ['.....', '..#..', '..#..', '.###.', '..#..', '..#..', '.....'],
  '•': ['.....', '.....', '.##..', '.##..', '.##..', '.....', '.....'],
};

// ---------------------------------------------------------------------------
// Canvas: a plain RGB buffer with rect / circle / line / text drawing.
const W = 1024;
const H = 1024;
const px = new Uint8Array(W * H * 3);

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function setPx(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, color: string): void {
  const c = rgb(color);
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setPx(i, j, c);
}
function circle(cx: number, cy: number, r: number, color: string): void {
  const c = rgb(color);
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) setPx(x, y, c);
  }
}
function ring(cx: number, cy: number, r: number, t: number, color: string): void {
  const c = rgb(color);
  for (let y = cy - r - t; y <= cy + r + t; y++) for (let x = cx - r - t; x <= cx + r + t; x++) {
    const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
    if (Math.abs(d - r) <= t / 2) setPx(x, y, c);
  }
}
function hline(x: number, y: number, w: number, t: number, color: string): void {
  rect(x, y, w, t, color);
}
function vline(x: number, y: number, h: number, t: number, color: string): void {
  rect(x, y, t, h, color);
}
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(x: number, y: number, s: string, scale: number, color: string): void {
  const c = rgb(color);
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT['?'];
    for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) {
      if (g[r][col] === '#') {
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          setPx(cx + col * scale + dx, y + r * scale + dy, c);
        }
      }
    }
    cx += 6 * scale;
  }
}
function wrapText(s: string, scale: number, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (textWidth(test, scale) <= maxW) cur = test;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawPara(x: number, y: number, s: string, scale: number, maxW: number, color: string): number {
  const lines = wrapText(s, scale, maxW);
  for (const line of lines) { drawText(x, y, line, scale, color); y += 9 * scale; }
  return y;
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (filter 0, zlib deflate, CRC32) — deterministic output.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePng(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Layout: a newspaper front page for Wednesday 18 November 2026.
// Stories verified against NDTV, The Manila Times, Japan Times and other
// outlets reporting on 18 Nov 2026 (see README.md for the story list).
const PAPER = '#f6f1e3';
const INK = '#16233f';
const NAVY = '#16233f';
const RED = '#a4242c';
const TEAL = '#0f766e';
const GOLD = '#c9a227';
const BLUE = '#1d4e89';

function tag(x: number, y: number, label: string, color: string): void {
  const w = textWidth(label, 2) + 16;
  rect(x, y, w, 26, color);
  drawText(x + 8, y + 3, label, 2, '#ffffff');
}

function panel(x: number, y: number, w: number, h: number, bg: string, border: string): void {
  rect(x, y, w, h, bg);
  rect(x, y, w, 4, border);
  rect(x, y, 4, h, border);
  rect(x + w - 4, y, 4, h, border);
  rect(x, y + h - 4, w, 4, border);
}

function draw(): void {
  rect(0, 0, W, H, PAPER);

  // Header band.
  rect(0, 0, W, 158, NAVY);
  drawText(32, 22, 'THE WORLD IN ONE PICTURE', 2, GOLD);
  drawText(32, 52, '18 NOVEMBER 2026', 6, '#ffffff');
  drawText(32, 118, 'WEDNESDAY - FIVE STORIES THAT DEFINED THE DAY', 2, '#d7dce8');

  // Hero: Trump / Quad / APEC / trilateral summit.
  panel(24, 182, 976, 218, '#ffffff', RED);
  tag(48, 202, 'SUMMITS', RED);
  drawText(48, 240, 'TRUMP IN MANILA FOR', 5, INK);
  drawText(48, 290, 'QUAD, THEN SHENZHEN', 5, INK);
  drawPara(48, 348, 'APEC opens in China. First Trump-Xi-Putin trilateral set for 19 Nov.', 2, 620, '#333333');
  // Globe icon on the right of the hero.
  circle(880, 291, 78, BLUE);
  ring(880, 291, 78, 4, '#ffffff');
  ring(880, 291, 48, 4, '#ffffff');
  hline(802, 291, 156, 4, '#ffffff');
  vline(880, 213, 156, 4, '#ffffff');
  circle(912, 258, 12, GOLD);
  circle(848, 318, 10, '#ffffff');

  // Four panels, 2 x 2.
  const gy = 424; const gh = 216; const gw = 478; const gx2 = 522;
  panel(24, gy, gw, gh, '#ffffff', TEAL);
  tag(48, gy + 18, 'UKRAINE', TEAL);
  const ukEnd = drawPara(48, gy + 58, 'UKRAINE HITS CRIMEA BRIDGE', 3, gw - 160, INK);
  drawPara(48, ukEnd + 14, 'Kyiv strikes the Kerch crossing as Russia hits bridges in Kyiv.', 2, gw - 48, '#333333');
  // Bridge icon, tucked into the headline's free space at top right.
  hline(400, gy + 70, 70, 6, TEAL);
  vline(410, gy + 70, 38, 6, TEAL);
  vline(460, gy + 70, 38, 6, TEAL);
  ring(435, gy + 92, 18, 5, TEAL);

  panel(gx2, gy, gw, gh, '#ffffff', RED);
  tag(gx2 + 24, gy + 18, 'MIDDLE EAST', RED);
  const irEnd = drawPara(gx2 + 24, gy + 58, 'IRAN HITS US RADAR IN BAHRAIN', 3, gw - 160, INK);
  drawPara(gx2 + 24, irEnd + 14, 'Drone attack, the third strike on Bahrain in five days.', 2, gw - 48, '#333333');
  // Radar icon: rings and sweep.
  ring(910, gy + 92, 34, 4, RED);
  ring(910, gy + 92, 18, 4, RED);
  circle(910, gy + 92, 6, RED);
  hline(910, gy + 92, 34, 4, RED);

  panel(24, gy + 240, gw, gh, '#ffffff', GOLD);
  tag(48, gy + 258, 'HEALTH - USA', GOLD);
  const meEnd = drawPara(48, gy + 298, 'US LOSES MEASLES-FREE STATUS', 3, gw - 160, INK);
  drawPara(48, meEnd + 14, '5,400 cases this year, the worst outbreak in 30 years.', 2, gw - 48, '#333333');
  // Virus icon: spiked circle.
  circle(435, gy + 332, 26, GOLD);
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    const x1 = 435 + Math.round(Math.cos(ang) * 26); const y1 = gy + 332 + Math.round(Math.sin(ang) * 26);
    const x2 = 435 + Math.round(Math.cos(ang) * 40); const y2 = gy + 332 + Math.round(Math.sin(ang) * 40);
    rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1) + 4, Math.abs(y2 - y1) + 4, GOLD);
  }
  circle(427, gy + 324, 5, '#ffffff');
  circle(443, gy + 340, 5, '#ffffff');

  panel(gx2, gy + 240, gw, gh, '#ffffff', BLUE);
  tag(gx2 + 24, gy + 258, 'WEATHER - INDIA', BLUE);
  const cyEnd = drawPara(gx2 + 24, gy + 298, 'CYCLONE AKVAN NEARS INDIA', 3, gw - 160, INK);
  drawPara(gx2 + 24, cyEnd + 14, 'Andhra coast braced for 120 km/h winds on 20 Nov.', 2, gw - 48, '#333333');
  // Cyclone icon: spiral rings.
  ring(910, gy + 332, 34, 5, BLUE);
  ring(910, gy + 332, 20, 5, BLUE);
  circle(910, gy + 332, 7, BLUE);
  hline(876, gy + 332, 68, 5, '#ffffff');

  // Bottom ticker: culture / sport.
  rect(24, 904, 976, 96, NAVY);
  drawText(48, 924, 'ALSO TODAY:', 2, GOLD);
  drawPara(48, 954, 'GTA VI LAUNCHES TOMORROW - DHONI RETIRES FROM IPL', 2, 928, '#ffffff');
}

draw();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePng());
