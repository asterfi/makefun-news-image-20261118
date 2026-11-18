// News image v2 for make.fun — "Sum up 18 November's world news in one image".
// Node 22, standard library only, no network. The program draws the whole
// 1024x1024 front page itself (panels, a world map, icons, headlines in a
// 5x7 pixel font) and writes it to /output/entry.png, deterministically:
// same bytes every run.
//
// v2 is a dense edition: 37 distinct stories across 6 continents, a world
// map with flashpoint dots, 6 featured panels and 30 more stories in
// region lists, plus a ticker.
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
// Layout: a dense newspaper front page for Wednesday 18 November 2026.
// 37 distinct stories, 6 continents, a world map, 6 featured panels,
// 30 more stories in region lists, and a ticker. Stories verified against
// NDTV, The Manila Times, The Hindu, Philstar, CNA, Bangkok Post, The
// Japan Times and other outlets reporting on 18 Nov 2026 (see README.md).
const PAPER = '#f6f1e3';
const INK = '#16233f';
const NAVY = '#16233f';
const RED = '#a4242c';
const TEAL = '#0f766e';
const GOLD = '#c9a227';
const BLUE = '#1d4e89';
const GREEN = '#2f7d32';
const BROWN = '#8a5a00';
const LAND = '#4a7c59';
const DOT = '#e5484d';

function tag(x: number, y: number, label: string, color: string): void {
  const w = textWidth(label, 2) + 16;
  rect(x, y, w, 26, color);
  drawText(x + 8, y + 3, label, 2, '#ffffff');
}
function smallTag(x: number, y: number, label: string, color: string): void {
  const w = textWidth(label, 1) + 12;
  rect(x, y, w, 18, color);
  drawText(x + 6, y + 5, label, 1, '#ffffff');
}
function panel(x: number, y: number, w: number, h: number, bg: string, border: string): void {
  rect(x, y, w, h, bg);
  rect(x, y, w, 4, border);
  rect(x, y, 4, h, border);
  rect(x + w - 4, y, 4, h, border);
  rect(x, y + h - 4, w, 4, border);
}

// Small icons drawn inside featured panels (bottom-right corner).
function iconBridge(cx: number, cy: number, color: string): void {
  hline(cx - 22, cy - 6, 44, 4, color);
  vline(cx - 16, cy - 6, 18, 4, color);
  vline(cx + 12, cy - 6, 18, 4, color);
  ring(cx, cy + 4, 10, 3, color);
}
function iconRadar(cx: number, cy: number, color: string): void {
  ring(cx, cy, 20, 3, color);
  ring(cx, cy, 11, 3, color);
  circle(cx, cy, 4, color);
  hline(cx, cy, 20, 3, color);
}
function iconVirus(cx: number, cy: number, color: string): void {
  circle(cx, cy, 14, color);
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    const x1 = cx + Math.round(Math.cos(ang) * 14); const y1 = cy + Math.round(Math.sin(ang) * 14);
    const x2 = cx + Math.round(Math.cos(ang) * 22); const y2 = cy + Math.round(Math.sin(ang) * 22);
    rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1) + 3, Math.abs(y2 - y1) + 3, color);
  }
  circle(cx - 4, cy - 4, 3, '#ffffff');
  circle(cx + 5, cy + 5, 3, '#ffffff');
}
function iconCyclone(cx: number, cy: number, color: string): void {
  ring(cx, cy, 20, 3, color);
  ring(cx, cy, 12, 3, color);
  circle(cx, cy, 4, color);
  hline(cx - 20, cy, 40, 3, '#ffffff');
}
function iconHouse(cx: number, cy: number, color: string): void {
  rect(cx - 16, cy - 2, 32, 18, color);
  rect(cx - 10, cy - 10, 20, 8, color);
  rect(cx - 4, cy - 16, 8, 6, color);
  rect(cx - 4, cy + 6, 8, 10, '#ffffff');
}
function iconLeaf(cx: number, cy: number, color: string): void {
  circle(cx, cy - 4, 13, color);
  vline(cx, cy + 8, 12, 3, color);
  circle(cx - 6, cy - 8, 3, '#ffffff');
  circle(cx + 5, cy + 1, 3, '#ffffff');
}
const ICONS: Record<string, (cx: number, cy: number, color: string) => void> = {
  bridge: iconBridge, radar: iconRadar, virus: iconVirus,
  cyclone: iconCyclone, house: iconHouse, leaf: iconLeaf,
};

// Stylised world map: blobby continents on navy, red flashpoint dots.
function drawMap(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, NAVY);
  // Land blobs (cx, cy, r) in map-local coordinates.
  const blobs: [number, number, number][] = [
    // North America
    [70, 34, 20], [100, 26, 18], [130, 34, 16], [95, 54, 14],
    // South America
    [160, 64, 14], [175, 80, 10],
    // Europe
    [305, 22, 12], [325, 20, 10], [340, 30, 8],
    // Africa
    [320, 50, 16], [335, 64, 12],
    // Asia
    [395, 26, 22], [445, 22, 20], [495, 34, 18], [535, 44, 14], [455, 54, 12],
    // Oceania
    [535, 74, 10], [565, 78, 8],
  ];
  for (const [bx, by, br] of blobs) circle(x + bx, y + by, br, LAND);
  // Flashpoint dots.
  const dots: [number, number, string][] = [
    [480, 48, 'MANILA'], [468, 40, 'SHENZHEN'], [360, 26, 'CRIMEA'],
    [392, 46, 'BAHRAIN'], [368, 42, 'GAZA'], [448, 56, 'ANDHRA'],
  ];
  for (const [dx, dy] of dots) {
    circle(x + dx, y + dy, 5, DOT);
    ring(x + dx, y + dy, 5, 2, '#ffffff');
  }
  // Labels, placed clear of their dots.
  drawText(x + 488, y + 44, 'MANILA', 1, '#ffffff');
  drawText(x + 400, y + 30, 'SHENZHEN', 1, '#ffffff');
  drawText(x + 330, y + 12, 'CRIMEA', 1, '#ffffff');
  drawText(x + 400, y + 52, 'BAHRAIN', 1, '#ffffff');
  drawText(x + 330, y + 52, 'GAZA', 1, '#ffffff');
  drawText(x + 456, y + 64, 'ANDHRA', 1, '#ffffff');
  drawText(x + 12, y + 8, 'THE WORLD TODAY', 1, GOLD);
}

// ---------------------------------------------------------------------------
// Stories. 1 hero + 6 featured + 30 in region lists = 37 distinct stories.
interface Featured { tag: string; color: string; head: string; sub: string; icon: string }
const FEATURED: Featured[] = [
  { tag: 'UKRAINE', color: TEAL, head: 'UKRAINE HITS CRIMEA BRIDGE', sub: 'Second night in a row; Russia hits Kyiv bridges too.', icon: 'bridge' },
  { tag: 'MIDDLE EAST', color: RED, head: 'IRAN HITS US RADAR IN BAHRAIN', sub: 'Third strike on Bahrain in five days.', icon: 'radar' },
  { tag: 'HEALTH - USA', color: GOLD, head: 'US LOSES MEASLES-FREE STATUS', sub: '5,400 cases this year, worst in 30 years.', icon: 'virus' },
  { tag: 'WEATHER - INDIA', color: BLUE, head: 'CYCLONE AKVAN NEARS INDIA', sub: 'Severe storm; landfall on 20 Nov, 120 km/h winds.', icon: 'cyclone' },
  { tag: 'GAZA', color: BROWN, head: 'UN WARNS OF COLD DEATHS IN GAZA', sub: '1.7M displaced face winter with little shelter.', icon: 'house' },
  { tag: 'CLIMATE', color: GREEN, head: 'COP31: 144 ITEMS STILL DISPUTED', sub: 'Antalya talks enter final days; ends 20 Nov.', icon: 'leaf' },
];

interface Story { head: string; sub: string }
interface Region { name: string; color: string; stories: Story[] }
const REGIONS: Region[] = [
  { name: 'ASIA', color: BLUE, stories: [
    { head: 'JAPAN PROTESTS RUSSIAN AIRSPACE VIOLATION', sub: 'Tokyo says two jets entered its airspace.' },
    { head: 'TAIWAN AWAITS TRUMP OK OF 14BN ARMS SALE', sub: 'Taipei waits on the biggest US arms deal yet.' },
    { head: 'MONGOLIA PRESIDENT RESIGNS AMID GRAFT CHARGES', sub: 'Resignation follows corruption allegations.' },
    { head: 'BANGLADESH CLASHES, LEADER KILLED', sub: 'Leader killed; police station set on fire.' },
    { head: 'MALAYSIA CONDEMNS GAZA DISPLACEMENT AT ASEAN', sub: 'Kuala Lumpur speaks out at Manila summit.' },
  ]},
  { name: 'EUROPE', color: TEAL, stories: [
    { head: 'EX-KOSOVO LEADER THACI GUILTY OVER WITNESSES', sub: 'Hague court convicts him of witness tampering.' },
    { head: 'TURKEY TAKES OVER OPPOSITION-LINKED TV STATION', sub: 'Government seizes channel in new crackdown.' },
    { head: 'FRANCE TESTS M51.3 MISSILE FROM SUBMARINE', sub: 'Upgraded missile fired from sub off Brittany.' },
    { head: 'ESTONIA CLOSES RUSSIA BORDER AFTER SABOTAGE BID', sub: 'Move follows alleged attack on drone maker.' },
    { head: 'GERMANY, NORWAY TO FUND UKRAINE AIR DEFENCES', sub: 'New money for Kyiv as bridges are hit.' },
  ]},
  { name: 'MIDDLE EAST', color: RED, stories: [
    { head: 'US SINKS FIVE IRANIAN TANKERS NEAR HORMUZ', sub: 'Five ships hit after Guards target US warship.' },
    { head: 'YEMEN LAW DESIGNATES HOUTHIS AS TERRORISTS', sub: 'Parliament passes the designation into law.' },
    { head: 'HOUTHIS ADVANCE ON ADEN AS FORCES PULL OUT', sub: 'Yemeni forces quit Bab al-Mandeb positions.' },
    { head: 'EISENKOT TAPPED TO FORM ISRAEL GOVERNMENT', sub: 'Herzog picks ex-army chief over Netanyahu.' },
    { head: 'BAHRAIN ALL-CLEAR AFTER THREAT WARNING', sub: 'Kuwait says its army shot down drones too.' },
  ]},
  { name: 'AFRICA', color: GREEN, stories: [
    { head: 'MOZAMBIQUE OPPOSITION LEADER TRIAL BEGINS', sub: 'Mondlane faces terrorism charges in Maputo.' },
    { head: 'UN: 2,230 CIVILIANS KILLED IN SUDAN IN 2026', sub: 'Over 1,630 of them killed by drones.' },
    { head: 'EBOLA CASES DOUBLE IN DR CONGO, UN WARNS', sub: 'Outbreak grows; health teams race to stop it.' },
    { head: 'ERITREA ACCUSES ETHIOPIA OF TERRITORIAL CLAIMS', sub: 'Asmara warns of rising war tensions.' },
    { head: 'FIVE NATIONS PLAN RWANDA HUB FOR MIGRANTS', sub: 'Europe eyes Rwanda for rejected seekers.' },
  ]},
  { name: 'AMERICAS', color: BROWN, stories: [
    { head: 'BIDEN MEMOIR: PUTIN A TEENAGER, ZELENSKY MOODY', sub: 'Ex-president on world leaders in new book.' },
    { head: 'US JUDGE BLOCKS NEW STUDENT VISA RULES', sub: 'Court halts curbs on foreign students.' },
    { head: 'DEMOCRATS EYE FIRST BLACK HOUSE SPEAKER', sub: 'Party takes step toward historic pick.' },
    { head: 'PAKISTANI JAILED 27 YEARS OVER TRUMP PLOT', sub: 'Asif Merchant sentenced in murder-for-hire case.' },
    { head: 'US DETAILS 12BN IN VENEZUELA OIL REVENUE', sub: 'State Dept report a year after Maduro capture.' },
  ]},
  { name: 'SPORT + CULTURE', color: GOLD, stories: [
    { head: 'INDIA BEAT PAKISTAN 2-1 FOR 10TH SAFF TITLE', sub: 'Record title sealed in the final.' },
    { head: 'DHONI RETIRES FROM IPL, BECOMES CSK MENTOR', sub: 'End of an era two days before GTA VI.' },
    { head: 'GTA VI LAUNCHES TOMORROW, 19 NOV', sub: '212 GB download; midnight release by region.' },
    { head: 'PATTINSON NAMED THE NEXT JAMES BOND', sub: 'Batman star takes over 007 from Daniel Craig.' },
    { head: 'RUSSIAN MILITARY PLANE CRASHES, 19 DEAD', sub: 'An-12 goes down in Kemerovo region, Siberia.' },
  ]},
];

function drawFeatured(x: number, y: number, w: number, h: number, f: Featured): void {
  panel(x, y, w, h, '#ffffff', f.color);
  smallTag(x + 12, y + 8, f.tag, f.color);
  const headEnd = drawPara(x + 12, y + 34, f.head, 2, w - 24, INK);
  drawPara(x + 12, Math.max(headEnd + 2, y + 70), f.sub, 1, w - 116, '#333333');
  ICONS[f.icon](x + w - 44, y + h - 32, f.color);
}

function drawRegion(x: number, y: number, w: number, h: number, r: Region): void {
  panel(x, y, w, h, '#ffffff', r.color);
  rect(x, y, w, 26, r.color);
  drawText(x + 12, y + 5, r.name, 2, '#ffffff');
  drawText(x + w - 12 - textWidth('5 STORIES', 1), y + 9, '5 STORIES', 1, '#ffffff');
  let cy = y + 40;
  for (const s of r.stories) {
    rect(x + 12, cy + 2, 6, 6, r.color);
    drawText(x + 24, cy, s.head, 1, INK);
    drawText(x + 24, cy + 11, s.sub, 1, '#666666');
    cy += 30;
  }
}

function draw(): void {
  rect(0, 0, W, H, PAPER);

  // Header band.
  rect(0, 0, W, 92, NAVY);
  drawText(24, 12, 'THE WORLD IN ONE PICTURE', 2, GOLD);
  drawText(24, 34, '18 NOVEMBER 2026', 5, '#ffffff');
  drawText(24, 74, 'WEDNESDAY - 37 STORIES FROM 6 CONTINENTS', 2, '#d7dce8');
  rect(824, 20, 176, 52, GOLD);
  drawText(824 + 14, 26, '37 STORIES', 2, NAVY);
  drawText(824 + 14, 48, '6 CONTINENTS', 2, NAVY);

  // Hero: Trump / Quad / APEC / trilateral summit.
  panel(24, 100, 976, 108, '#ffffff', RED);
  tag(48, 112, 'SUMMITS', RED);
  drawText(48, 146, 'TRUMP IN MANILA FOR QUAD', 4, INK);
  drawText(48, 182, 'THEN SHENZHEN FOR APEC - FIRST TRUMP-XI-PUTIN TRILATERAL SET FOR 19 NOV.', 2, '#333333');

  // World map + stats.
  drawMap(24, 216, 640, 96);
  panel(672, 216, 328, 96, '#ffffff', RED);
  drawText(688, 228, '37 STORIES, 6 CONTINENTS', 2, INK);
  drawText(688, 254, '6 FLASHPOINTS MARKED RED', 1, '#333333');
  drawText(688, 270, '1 TRILATERAL SUMMIT: 19 NOV', 1, '#333333');
  drawText(688, 286, 'GTA VI LAUNCHES TOMORROW', 1, '#333333');

  // Featured panels, 3 x 2.
  const fx = [24, 352, 680]; const fy = [320, 436];
  FEATURED.forEach((f, i) => {
    drawFeatured(fx[i % 3], fy[Math.floor(i / 3)], 322, 108, f);
  });

  // Region lists, 3 x 2.
  const rx = [24, 352, 680]; const ry = [552, 756];
  REGIONS.forEach((r, i) => {
    drawRegion(rx[i % 3], ry[Math.floor(i / 3)], 322, 196, r);
  });

  // Bottom ticker.
  rect(24, 960, 976, 56, NAVY);
  drawText(48, 978, 'ALSO TODAY:', 2, GOLD);
  drawText(240, 978, 'ALCARAZ BEATS TIAFOE 6-2, 6-2', 2, '#ffffff');
  drawText(48, 996, "'HUMAN' IS CAMBRIDGE WORD OF THE YEAR - APPLE TECH HICCUPS", 2, '#ffffff');
}

draw();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePng());
