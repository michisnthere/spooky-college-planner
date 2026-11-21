// scripts/make-pixel-assets.js
// Draws every pixel-art SVG in frontend/assets/ from code, so the art stays on one pixel grid and
// can be rebuilt at any time. Run with: npm run assets
// One grid cell is one "art pixel". The SVG files are written at 4 CSS px per cell (SCALE), with
// shape-rendering="crispEdges", so every edge is hard. Colours are fixed palette entries, and the
// random speckles use a seeded generator, so a rerun writes identical files.
// Set ASSET_OUT_DIR to write somewhere else (the tests do this to check the files are up to date).
'use strict';

const fs = require('fs');
const path = require('path');

const OUT = process.env.ASSET_OUT_DIR || path.join(__dirname, '..', 'frontend', 'assets');
const SCALE = 4;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cells = new Array(w * h).fill(null);
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, key) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.inside(x, y)) this.cells[y * this.w + x] = key;
  }
  get(x, y) { return this.inside(x, y) ? this.cells[y * this.w + x] : null; }
  rect(x, y, w, h, key) {
    for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) this.set(x + i, y + j, key);
  }
  fill(test, key) {
    for (let y = 0; y < this.h; y += 1) for (let x = 0; x < this.w; x += 1) if (test(x, y)) this.set(x, y, key);
  }
  disc(cx, cy, r, key) { this.fill((x, y) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r, key); }
  ellipse(cx, cy, rx, ry, key) {
    this.fill((x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1, key);
  }
  // A line of square brush stamps, thickness easing from t0 to t1.
  line(x0, y0, x1, y1, key, t0 = 1, t1 = t0) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
    for (let i = 0; i <= steps; i += 1) {
      const f = i / steps;
      const t = Math.max(1, Math.round(t0 + (t1 - t0) * f));
      const x = x0 + (x1 - x0) * f;
      const y = y0 + (y1 - y0) * f;
      this.rect(Math.round(x - t / 2), Math.round(y - t / 2), t, t, key);
    }
  }
  // A path through several points, thickness easing from t0 at the start to t1 at the end.
  path(points, key, t0, t1) {
    const total = points.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
    let done = 0;
    for (let i = 1; i < points.length; i += 1) {
      const len = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      const a = t0 + (t1 - t0) * (done / total);
      const b = t0 + (t1 - t0) * ((done + len) / total);
      this.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], key, a, b);
      done += len;
    }
  }
}

// Merges runs into as few rectangles as possible and writes one <path> per colour.
function toSvg(grid, palette) {
  const byKey = new Map();
  for (let y = 0; y < grid.h; y += 1) {
    let x = 0;
    while (x < grid.w) {
      const key = grid.get(x, y);
      if (key === null) { x += 1; continue; }
      let end = x;
      while (end + 1 < grid.w && grid.get(end + 1, y) === key) end += 1;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ x, y, w: end - x + 1, h: 1 });
      x = end + 1;
    }
  }
  const paths = [];
  for (const [key, rects] of byKey) {
    const merged = [];
    const open = new Map();
    for (const r of rects) {
      const id = `${r.x},${r.w}`;
      const prev = open.get(id);
      if (prev && prev.y + prev.h === r.y) prev.h += 1;
      else { const next = { ...r }; merged.push(next); open.set(id, next); }
    }
    const spec = palette[key];
    if (!spec) throw new Error(`no colour for key "${key}"`);
    const [hex, opacity] = Array.isArray(spec) ? spec : [spec];
    const d = merged.map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`).join('');
    paths.push(`<path fill="${hex}"${opacity !== undefined ? ` fill-opacity="${opacity}"` : ''} d="${d}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid.w} ${grid.h}" width="${grid.w * SCALE}" height="${grid.h * SCALE}" shape-rendering="crispEdges">\n${paths.join('\n')}\n</svg>\n`;
}

const written = [];
function write(name, grid, palette) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), toSvg(grid, palette));
  written.push(name);
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((row) => row.map((v) => (v + 0.5) / 16));
const wave = (x, w, cycles, phase = 0) => 0.5 + 0.5 * Math.sin((2 * Math.PI * cycles * x) / w + phase);

// ---------------------------------------------------------------------------
// Moon: 40 x 40. Hard rings of glow, a lit disc, a shaded crescent and craters.
// ---------------------------------------------------------------------------
function moon() {
  const g = new Grid(40, 40);
  g.disc(20, 20, 19.5, 'glow3');
  g.disc(20, 20, 16, 'glow2');
  g.disc(20, 20, 13, 'glow1');
  g.disc(20, 20, 10, 'base');
  g.fill((x, y) => (x + 0.5 - 20) ** 2 + (y + 0.5 - 20) ** 2 <= 100 && (x - 20) + (y - 20) >= 6, 'shade');
  g.fill((x, y) => (x + 0.5 - 20) ** 2 + (y + 0.5 - 20) ** 2 <= 100 && (x + 0.5 - 16) ** 2 + (y + 0.5 - 16) ** 2 <= 14, 'light');
  for (const [cx, cy, r] of [[24, 24, 2.6], [15.5, 16.5, 2], [24.5, 15, 1.7], [14, 24, 1.5], [20, 26.5, 1.5]]) {
    g.disc(cx, cy, r, 'crater');
    g.set(cx + r - 0.5, cy + r - 0.5, 'rim');
    g.set(cx + r - 1.5, cy + r - 0.5, 'rim');
  }
  write('moon.svg', g, {
    glow3: ['#ffeebe', 0.07], glow2: ['#ffeebe', 0.1], glow1: ['#fff3cf', 0.16],
    base: '#f4e6bd', shade: '#d8c188', light: '#fffbea', crater: '#b79f66', rim: '#fff5d0',
  });
}

// ---------------------------------------------------------------------------
// Clouds: tile 300 x 65, two layers. Every cloud sits well inside the tile, so it repeats.
// ---------------------------------------------------------------------------
function clouds() {
  const g = new Grid(300, 65);
  const cloud = (cx, base, width, key, hi) => {
    const parts = [[-0.32, 0.5], [-0.12, 0.85], [0.1, 1], [0.3, 0.7]];
    const cells = new Set();
    for (const [dx, scale] of parts) {
      const r = (width / 4) * scale;
      const x0 = cx + dx * width;
      const cy = base - r * 0.55;
      for (let y = 0; y < g.h; y += 1) for (let x = 0; x < g.w; x += 1) {
        if (y <= base && (x + 0.5 - x0) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) cells.add(`${x},${y}`);
      }
    }
    for (let x = cx - width / 2 - 2; x <= cx + width / 2 + 2; x += 1) cells.add(`${Math.round(x)},${base}`);
    for (const c of cells) {
      const [x, y] = c.split(',').map(Number);
      g.set(x, y, !cells.has(`${x},${y - 1}`) ? hi : key);
    }
  };
  cloud(60, 26, 60, 'far', 'farHi');
  cloud(150, 16, 44, 'far', 'farHi');
  cloud(250, 30, 56, 'far', 'farHi');
  cloud(100, 50, 70, 'near', 'nearHi');
  cloud(215, 56, 50, 'near', 'nearHi');
  cloud(20, 58, 28, 'near', 'nearHi');
  write('clouds.svg', g, { far: ['#2a3a72', 0.5], farHi: ['#7f95d6', 0.34], near: ['#3a4c8c', 0.5], nearHi: ['#9fb2ec', 0.34] });
}

// ---------------------------------------------------------------------------
// Hills: tile 400 x 120. Two stepped ridges, with tiny crosses on the far one.
// ---------------------------------------------------------------------------
function hills() {
  const g = new Grid(400, 120);
  const far = (x) => Math.round(58 + 14 * Math.sin((2 * Math.PI * 2 * x) / 400) + 8 * Math.sin((2 * Math.PI * 5 * x) / 400 + 1));
  const near = (x) => Math.round(84 + 10 * Math.sin((2 * Math.PI * 3 * x) / 400 + 2) + 6 * Math.sin((2 * Math.PI * 7 * x) / 400));
  for (let x = 0; x < g.w; x += 1) {
    const f = far(x);
    g.rect(x, f, 1, g.h - f, 'far');
    g.set(x, f, 'farEdge');
    const n = near(x);
    g.rect(x, n, 1, g.h - n, 'near');
    g.set(x, n, 'nearEdge');
  }
  for (const x of [48, 130, 211, 296, 352]) {
    const y = far(x);
    g.rect(x, y - 5, 1, 5, 'cross');
    g.rect(x - 1, y - 4, 3, 1, 'cross');
  }
  write('hills.svg', g, { far: '#101c3c', farEdge: '#1b2c5e', near: '#0b1430', nearEdge: '#142450', cross: '#0d1736' });
}

// ---------------------------------------------------------------------------
// Trees and graveyard: tile 350 x 95. Silhouettes with a thin moonlit rim on their right side.
// ---------------------------------------------------------------------------
function trees() {
  const g = new Grid(350, 95);
  const S = 'sil';
  // Tree one, twisted and leaning left.
  g.path([[67, 95], [64, 84], [72, 74], [65, 63], [70, 52], [63, 40]], S, 8, 3);
  g.path([[65, 63], [53, 60], [41, 50]], S, 3, 1);
  g.path([[63, 40], [54, 33], [47, 21]], S, 3, 1);
  g.path([[63, 40], [74, 33], [84, 24]], S, 3, 1);
  g.path([[72, 76], [84, 70], [96, 69]], S, 3, 1);
  g.path([[41, 50], [34, 50], [29, 44]], S, 1, 1);
  g.path([[47, 21], [45, 14], [48, 9]], S, 1, 1);
  g.path([[84, 24], [90, 18], [96, 17]], S, 1, 1);
  g.path([[96, 69], [102, 66], [106, 61]], S, 1, 1);
  // Tree two, tall and bent to the right.
  g.path([[232, 95], [238, 82], [226, 70], [236, 56], [228, 42], [237, 26]], S, 9, 3);
  g.path([[226, 70], [214, 66], [204, 56]], S, 3, 1);
  g.path([[237, 26], [228, 18], [222, 8]], S, 3, 1);
  g.path([[237, 26], [247, 20], [258, 15]], S, 3, 1);
  g.path([[236, 56], [248, 52], [260, 44]], S, 3, 1);
  g.path([[204, 56], [197, 57], [191, 52]], S, 1, 1);
  g.path([[258, 15], [264, 11], [270, 12]], S, 1, 1);
  g.path([[260, 44], [266, 44], [271, 38]], S, 1, 1);
  g.path([[222, 8], [221, 3], [224, 1]], S, 1, 1);
  // A small dead tree in the middle.
  g.path([[160, 95], [158, 87], [164, 81], [160, 74]], S, 4, 2);
  g.path([[161, 79], [153, 76], [148, 70]], S, 2, 1);
  g.path([[160, 74], [167, 70], [172, 66]], S, 2, 1);
  // Cross markers and headstones.
  for (const [x, top] of [[118, 74], [300, 78]]) {
    g.rect(x, top, 2, 95 - top, S);
    g.rect(x - 4, top + 5, 10, 2, S);
  }
  for (const [x, top, w] of [[130, 80, 10], [310, 82, 9]]) {
    g.rect(x, top + 3, w, 95 - top - 3, S);
    g.rect(x + 1, top + 1, w - 2, 2, S);
    g.rect(x + 3, top, w - 6, 1, S);
  }
  // Iron fence: two rails and bars with spear tips.
  g.rect(245, 80, 40, 1, S);
  g.rect(245, 90, 40, 1, S);
  for (let x = 246; x < 285; x += 4) {
    g.rect(x, 74, 1, 21, S);
    g.set(x, 72, S);
    g.rect(x - 1, 73, 3, 1, S);
    g.set(x - 1, 75, S);
    g.set(x + 1, 75, S);
  }
  // Ornamental gate: two pillars with finials, an arch, bars and a scroll in the middle.
  for (const x of [316, 336]) {
    g.rect(x, 66, 5, 29, S);
    g.rect(x - 1, 64, 7, 2, S);
    g.rect(x + 1, 61, 3, 3, S);
    g.set(x + 2, 59, S);
  }
  for (let a = Math.PI; a <= 2 * Math.PI + 0.001; a += 0.03) {
    g.rect(Math.round(328.5 + 11 * Math.cos(a)), Math.round(76 + 11 * Math.sin(a)), 1, 2, S);
  }
  for (let x = 322; x < 336; x += 3) {
    g.rect(x, 74, 1, 21, S);
    g.set(x, 72, S);
  }
  g.rect(321, 86, 15, 1, S);
  g.disc(328.5, 80, 2.4, S);
  // Bushes along the base, and a few plants.
  const r = rng(7);
  for (const [cx, rx, ry] of [[18, 10, 5], [96, 12, 6], [196, 11, 5], [286, 9, 4], [345, 5, 4]]) {
    g.ellipse(cx, 93, rx, ry, 'bush');
    for (let i = 0; i < rx * 2; i += 1) {
      const x = cx - rx + Math.floor(r() * rx * 2);
      const y = 93 - Math.floor(r() * ry);
      if (g.get(x, y) === 'bush') g.set(x, y, 'bushHi');
    }
  }
  for (const x of [50, 178, 262, 340]) {
    g.rect(x, 86, 1, 9, 'bush');
    g.rect(x - 2, 88, 2, 1, 'bush');
    g.rect(x + 1, 85, 2, 1, 'bush');
    g.rect(x - 3, 86, 1, 2, 'bushHi');
  }
  // Moonlit rim: a silhouette cell with open sky to its right.
  for (let y = 0; y < g.h; y += 1) for (let x = 0; x < g.w; x += 1) {
    if (g.get(x, y) === S && g.get(x + 1, y) === null) g.set(x, y, 'rim');
  }
  write('trees.svg', g, { sil: '#05080f', rim: '#16254f', bush: '#0b2128', bushHi: '#154046' });
}

// ---------------------------------------------------------------------------
// Ground: tile 64 x 22. Grass on top, a cobblestone path below.
// ---------------------------------------------------------------------------
function ground() {
  const g = new Grid(64, 22);
  const r = rng(11);
  g.rect(0, 2, 64, 2, 'edge');
  for (let x = 0; x < 64; x += 1) {
    if (r() < 0.45) g.set(x, 1, 'edge');
    if (r() < 0.2) g.set(x, 0, 'edge');
  }
  g.rect(0, 4, 64, 7, 'top');
  g.rect(0, 11, 64, 3, 'mid');
  for (let y = 4; y < 14; y += 1) for (let x = 0; x < 64; x += 1) {
    const v = r();
    if (v < 0.12) g.set(x, y, 'dark');
    else if (v < 0.2) g.set(x, y, 'light');
    if (y < 11 && BAYER[y % 4][x % 4] < 0.18 && (x + y) % 3 === 0) g.set(x, y, 'dark');
  }
  for (const x of [5, 21, 39, 53]) {
    g.rect(x, 7, 1, 3, 'stem');
    g.set(x, 6, x % 2 ? 'yellow' : 'magenta');
  }
  g.rect(0, 14, 64, 1, 'shadow');
  // Cobblestones: rows of blocks, each row shifted.
  g.rect(0, 15, 64, 7, 'mortar');
  const tones = ['c1', 'c2', 'c3'];
  for (let row = 0; row < 2; row += 1) {
    const y = 15 + row * 4;
    const h = row === 0 ? 3 : 3;
    const w = 8;
    for (let i = 0; i < 64 / w; i += 1) {
      const x = i * w + (row ? 4 : 0);
      for (let k = 0; k < 2; k += 1) {
        const bx = (x + k * 0) % 64;
        const tone = tones[Math.floor(r() * 3)];
        for (let dx = 0; dx < w - 1; dx += 1) {
          const px = (bx + dx) % 64;
          g.rect(px, y, 1, h, tone);
          g.set(px, y, 'chi');
        }
        break;
      }
    }
  }
  write('ground.svg', g, {
    edge: '#8fd06a', top: '#5c9a3c', mid: '#3f7a2a', dark: '#2f6a22', light: '#79b955', stem: '#2f6a22',
    yellow: '#ffd23f', magenta: '#e83fb0', shadow: '#1c3a14', mortar: '#1c2236',
    c1: '#6b7488', c2: '#59627a', c3: '#7a849a', chi: '#8d98ae',
  });
}

// ---------------------------------------------------------------------------
// Mist: dithered, hard-edged bands. Denser at the bottom, with soft-looking lumps made of pixels.
// ---------------------------------------------------------------------------
function mist(name, w, h, seed, lumps, strength) {
  const g = new Grid(w, h);
  const r = rng(seed);
  const phase = r() * 6;
  for (let y = 0; y < h; y += 1) {
    const depth = (y + 0.5) / h;
    for (let x = 0; x < w; x += 1) {
      const lump = 0.55 + 0.45 * wave(x, w, lumps, phase) * 0.7 + 0.2 * wave(x, w, lumps * 2 + 1, phase * 2) * 0.5;
      const density = depth ** 1.3 * lump * 1.25 * strength;
      const t = BAYER[y % 4][x % 4];
      if (density > t + 0.45) g.set(x, y, 'dense');
      else if (density > t) g.set(x, y, 'thin');
    }
  }
  write(name, g, { dense: ['#d6e2f2', 0.6], thin: ['#c3d3ea', 0.34] });
}

// ---------------------------------------------------------------------------
// Tombstones. A shape is a test for "is this cell stone". Outline, bevel, carved rim and three
// flat bands of shading come from the distance to the edge, so every shape shades the same way.
// ---------------------------------------------------------------------------
const SHAPES = {
  arched: (w, h) => (x, y) => {
    const ry = 10;
    const cy = y + 0.5;
    if (cy >= ry) return true;
    const dx = (w / 2) * Math.sqrt(Math.max(0, 1 - ((ry - cy) / ry) ** 2));
    return Math.abs(x + 0.5 - w / 2) <= dx;
  },
  slab: (w, h) => (x, y) => !((x === 0 && y < 2) || (x === 1 && y < 1) || (x === w - 1 && y < 2) || (x === w - 2 && y < 1)),
  pointed: (w, h) => polygonTest([[w / 2, 0], [w, h * 0.2], [w, h], [0, h], [0, h * 0.2]]),
  cross: (w, h) => polygonTest([[0.36 * w, 0], [0.64 * w, 0], [0.64 * w, 0.28 * h], [w, 0.28 * h], [w, 0.52 * h], [0.64 * w, 0.52 * h], [0.64 * w, h], [0.36 * w, h], [0.36 * w, 0.52 * h], [0, 0.52 * h], [0, 0.28 * h], [0.36 * w, 0.28 * h]]),
};

function polygonTest(points) {
  return (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

function stone(name, shape, w, h, edge, radius) {
  const test = shape === 'rounded' ? roundedTest(w, radius || w / 2) : SHAPES[shape](w, h);
  const g = new Grid(w, h);
  const inside = (x, y) => g.inside(x, y) && test(x, y);
  // Distance (in cells, 4-neighbour) from the outside: 1 is the outline.
  const dist = new Array(w * h).fill(0);
  const queue = [];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (!inside(x, y)) continue;
    const edgeCell = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edgeCell) { dist[y * w + x] = 1; queue.push([x, y]); }
  }
  for (let i = 0; i < queue.length; i += 1) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (inside(nx, ny) && dist[ny * w + nx] === 0) { dist[ny * w + nx] = dist[y * w + x] + 1; queue.push([nx, ny]); }
    }
  }
  const d = (x, y) => (inside(x, y) ? dist[y * w + x] : 0);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (!inside(x, y)) continue;
    const here = d(x, y);
    let key;
    if (here === 1) key = 'edge';
    else if (here === 2) {
      if (d(x, y - 1) === 1 || d(x - 1, y) === 1) key = 'hi';
      else if (d(x, y + 1) === 1 || d(x + 1, y) === 1) key = 'lo';
      else key = 'f2';
    } else if (here === 4) key = 'rim';
    else key = y < h * 0.34 ? 'f1' : y < h * 0.72 ? 'f2' : 'f3';
    if (key === 'f2' && here === 2) key = y < h * 0.34 ? 'f1' : y < h * 0.72 ? 'f2' : 'f3';
    g.set(x, y, key);
  }
  write(name, g, { edge, hi: '#c4d2c6', lo: '#586859', rim: '#70806f', f1: '#9eada0', f2: '#8e9d90', f3: '#808f83' });
}

function roundedTest(w, r) {
  return (x, y) => {
    const cy = y + 0.5;
    if (cy >= r) return true;
    const dx = Math.sqrt(Math.max(0, r * r - (r - cy) ** 2));
    return Math.abs(x + 0.5 - w / 2) <= dx;
  };
}

// Cracks, chips, speckles and moss laid over the rounded stone (38 x 52).
function stoneWear() {
  const g = new Grid(38, 52);
  const r = rng(23);
  // Cracks stay near the edges, away from the middle where the college name is written.
  g.path([[27, 8], [25, 11], [28, 14], [26, 17]], 'crack', 1, 1);
  g.path([[25, 11], [22, 12]], 'crack', 1, 1);
  g.path([[10, 40], [8, 43], [11, 46]], 'crack', 1, 1);
  g.path([[31, 37], [29, 41], [31, 44]], 'crack', 1, 1);
  for (let i = 0; i < 14; i += 1) {
    const x = 5 + Math.floor(r() * 28);
    const y = 8 + Math.floor(r() * 38);
    if (x > 8 && x < 30 && y > 14 && y < 40) continue;
    g.set(x, y, r() < 0.6 ? 'speck' : 'chip');
  }
  for (const [x0, w] of [[3, 9], [26, 8]]) {
    for (let x = x0; x < x0 + w; x += 1) {
      const top = 47 - Math.floor(r() * 3);
      for (let y = top; y <= 49; y += 1) g.set(x, y, y === top ? 'mossHi' : 'moss');
    }
  }
  write('stone-wear.svg', g, { crack: ['#2b352c', 0.75], speck: ['#2b352c', 0.4], chip: ['#e2ece4', 0.45], moss: '#4f7f3c', mossHi: '#79b955' });
}

// ---------------------------------------------------------------------------
// Gate divider: tile 40 x 12 (160 x 48). Bars with spearheads, two rails, a centre post and scrolls.
// Bars sit 5 apart across the tile edge, so the tile repeats without a seam. One colour only.
// ---------------------------------------------------------------------------
function gateDivider() {
  const g = new Grid(40, 12);
  const C = 'c';
  g.rect(0, 4, 40, 1, C);
  g.rect(0, 9, 40, 1, C);
  for (const x of [2, 7, 12, 27, 32, 37]) {
    g.rect(x, 3, 1, 9, C);
    g.set(x, 0, C);
    g.rect(x - 1, 1, 3, 1, C);
    g.rect(x - 1, 2, 3, 1, C);
    g.set(x - 2, 3, C);
    g.set(x + 2, 3, C);
  }
  g.rect(19, 2, 2, 10, C);
  g.set(19, 0, C);
  g.set(20, 0, C);
  g.rect(18, 1, 4, 1, C);
  // Scrolls: a ring on each side of the centre post, joined to it.
  for (const cx of [15, 24]) {
    for (let a = 0; a < Math.PI * 2; a += 0.15) g.set(cx + 0.5 + 2.2 * Math.cos(a), 6.5 + 2.2 * Math.sin(a), C);
    g.set(cx, 6, C);
  }
  g.rect(16, 6, 3, 1, C);
  g.rect(22, 6, 2, 1, C);
  write('gate-divider.svg', g, { c: '#2e323e' });
}

// ---------------------------------------------------------------------------
// Lawn tile for the deadline lanes: 16 x 16, a checkerboard of two greens with grass ticks.
// ---------------------------------------------------------------------------
function lawn() {
  const g = new Grid(16, 16);
  const r = rng(31);
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) g.set(x, y, (x < 8) === (y < 8) ? 'a' : 'b');
  for (let i = 0; i < 22; i += 1) {
    const x = Math.floor(r() * 16);
    const y = Math.floor(r() * 15);
    g.rect(x, y, 1, 2, r() < 0.5 ? 'tick' : 'tickDark');
  }
  write('lawn.svg', g, { a: '#6fb04a', b: '#5fa03d', tick: '#8fd06a', tickDark: '#48812e' });
}

// ---------------------------------------------------------------------------
// Zombie: 16 x 25. Facing right, one arm out in front.
// ---------------------------------------------------------------------------
function zombie() {
  const g = new Grid(16, 25);
  const box = (x, y, w, h, fill) => { g.rect(x, y, w, h, 'k'); g.rect(x + 1, y + 1, w - 2, h - 2, fill); };
  box(1, 10, 3, 7, 'skinD');
  box(4, 17, 4, 6, 'pants');
  box(9, 17, 4, 6, 'pants');
  g.rect(3, 22, 6, 3, 'shoe');
  g.rect(8, 22, 6, 3, 'shoe');
  box(4, 9, 9, 9, 'shirt');
  g.rect(8, 12, 3, 4, 'skinD');
  g.rect(5, 15, 2, 1, 'shirtD');
  g.rect(10, 15, 2, 1, 'shirtD');
  box(12, 11, 4, 3, 'skin');
  box(3, 2, 11, 8, 'skin');
  g.rect(3, 0, 11, 3, 'hair');
  g.rect(2, 1, 1, 4, 'hair');
  g.rect(5, 4, 3, 3, 'eye');
  g.rect(10, 4, 3, 3, 'eye');
  g.rect(6, 5, 2, 2, 'pupil');
  g.rect(11, 5, 2, 2, 'pupil');
  g.rect(6, 8, 6, 1, 'mouth');
  g.rect(7, 7, 1, 1, 'tooth');
  g.rect(10, 7, 1, 1, 'tooth');
  write('zombie.svg', g, {
    k: '#1d2a17', skin: '#a6cf8a', skinD: '#7fa86a', hair: '#2e2a22', eye: '#fff3b0', pupil: '#b1122b',
    mouth: '#3a0a0a', tooth: '#f3e9d2', shirt: '#56789a', shirtD: '#2e4a63', pants: '#3d4a3c', shoe: '#1b1b1b',
  });
}

// ---------------------------------------------------------------------------
// Sunflower: 30 x 30. Twelve petals, and a brown centre that holds the college name.
// ---------------------------------------------------------------------------
function sunflower() {
  const g = new Grid(30, 30);
  const c = 15;
  const petal = (x, y) => {
    const dx = x + 0.5 - c;
    const dy = y + 0.5 - c;
    const radius = Math.hypot(dx, dy);
    return radius <= 11.5 + 3.4 * Math.abs(Math.cos(6 * Math.atan2(dy, dx)));
  };
  g.fill(petal, 'petal');
  for (let y = 0; y < 30; y += 1) for (let x = 0; x < 30; x += 1) {
    if (g.get(x, y) !== 'petal') continue;
    const open = [g.get(x - 1, y), g.get(x + 1, y), g.get(x, y - 1), g.get(x, y + 1)].some((n) => n === null);
    if (open) g.set(x, y, 'petalEdge');
    else if (Math.hypot(x + 0.5 - c, y + 0.5 - c) > 12.5) g.set(x, y, 'petalD');
  }
  g.disc(c, c, 10.2, 'rim');
  g.disc(c, c, 9.2, 'centre');
  write('sunflower.svg', g, { petal: '#ffd21f', petalD: '#ffb000', petalEdge: '#c97a00', rim: '#3d2200', centre: '#6b3f00' });
}

// ---------------------------------------------------------------------------
// Lane sign: a wooden board (32 x 14) drawn as a nine-slice with 4-pixel corners, so it can stretch
// to fit the college name, and a post (4 x 8) that stands in the grass under it.
// The middle of the board has only horizontal grain, so stretching it keeps the look.
// ---------------------------------------------------------------------------
function laneSign() {
  const g = new Grid(32, 14);
  g.rect(1, 0, 30, 14, 'k');
  g.rect(0, 1, 32, 12, 'k');
  g.rect(1, 1, 30, 12, 'wood');
  g.rect(1, 1, 30, 1, 'hi');
  g.rect(1, 12, 30, 1, 'lo');
  for (const y of [4, 8]) g.rect(4, y, 24, 1, 'grain');
  for (const [x, y] of [[2, 2], [29, 2], [2, 11], [29, 11]]) g.set(x, y, 'nail');
  write('lane-sign.svg', g, { k: '#2a1608', wood: '#7a4a22', hi: '#a36a35', lo: '#5a3416', grain: '#6c401c', nail: '#c9b8a0' });

  const post = new Grid(4, 8);
  post.rect(0, 0, 4, 8, 'k');
  post.rect(1, 0, 2, 7, 'wood');
  post.rect(1, 0, 1, 7, 'hi');
  post.rect(0, 6, 1, 2, 'tuft');
  post.rect(3, 5, 1, 3, 'tuft');
  write('lane-sign-post.svg', post, { k: '#2a1608', wood: '#7a4a22', hi: '#a36a35', tuft: '#3f7a2a' });
}
// ---------------------------------------------------------------------------
moon();
clouds();
hills();
trees();
ground();
mist('mist.svg', 64, 18, 5, 3, 0.85);
mist('mist-strip.svg', 100, 32, 9, 4, 0.7);
stone('stone-rounded.svg', 'rounded', 38, 52, '#2b352c');
stone('stone-rounded-add.svg', 'rounded', 38, 52, '#d4600a');
stone('stone-rounded-deadline.svg', 'rounded', 38, 52, '#7a4aa8');
stone('stone-rounded-submitted.svg', 'rounded', 38, 52, '#7fbf5a');
stone('stone-mini.svg', 'rounded', 22, 26, '#2b352c', 8);
stone('stone-slab.svg', 'slab', 42, 38, '#2b352c');
stone('stone-pointed.svg', 'pointed', 38, 54, '#2b352c');
stone('stone-cross.svg', 'cross', 44, 56, '#2b352c');
stone('stone-arched.svg', 'arched', 38, 46, '#2b352c');
stoneWear();
gateDivider();
lawn();
zombie();
sunflower();
laneSign();

console.log(`Wrote ${written.length} pixel-art files to ${OUT}`);
