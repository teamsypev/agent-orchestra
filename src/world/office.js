// The coworking room: layout, furniture, walls, light, and where the agents can stand.
import { box, top, poly, line, wallQuad, tones, shade, rng } from './iso.js';

export const ROOM = { W: 26, D: 18, wallH: 44 };

// Palette: warm afternoon interior, lavender shadows (like late light in a diorama).
export const C = {
  ground: '#2b2640', groundEdge: '#3a3354',
  slab: '#5b4a6b',
  floor: '#c99a66', floor2: '#bf8f5b', plank: '#a87a48',
  rug: '#a8524a', rug2: '#c46a55', rugEdge: '#e2b48a',
  wall: '#e7dcc8', wallShade: '#cbbda7', trim: '#8b6c53', base: '#9b7a5e',
  sky: '#a9cbe9', sky2: '#d6e8f5', frame: '#6c5847',
  light: 'rgba(255, 228, 160, 0.20)',
  wood: '#8a5a3c', woodTop: '#a8714b',
  dark: '#2f3340', screen: '#3d4b66',
  chair: '#3e4a5e', sofa: '#4f7a8a', metal: '#cfd5da', white: '#eef1f2',
  leaf: '#4f8a4b', leaf2: '#6fae5f', pot: '#b5653f',
  paper: '#f6f3ea', cork: '#c49a63', board: '#f4f4ef',
};

// Furniture is defined in the original orientation (x to the lower right, y to the lower left).
// `rect` = [x, y, w, d]; `name` keys are looked up in i18n for hover labels.
export const ITEMS = [
  // research desks (one per researcher) and the spare row
  ...[0, 1, 2].map((i) => ({ id: `desk${i}`, kind: 'desk', name: 'desk', rect: [9 + i * 3, 6, 2, 1], monitor: true })),
  ...[0, 1, 2].map((i) => ({ id: `chair${i}`, kind: 'chair', name: 'chair', rect: [10 + i * 3, 7, 1, 1] })),
  { id: 'desk3', kind: 'desk', name: 'desk', rect: [9, 10, 2, 1], laptop: true },
  { id: 'chair3', kind: 'chair', name: 'chair', rect: [10, 11, 1, 1] },
  { id: 'deskW', kind: 'desk', name: 'writerDesk', rect: [14, 10, 2, 1], monitor: true, typewriter: true },
  { id: 'chairW', kind: 'chair', name: 'chair', rect: [15, 11, 1, 1] },
  // critic's corner
  { id: 'deskC', kind: 'desk', name: 'criticDesk', rect: [20, 4, 2, 1], lamp: true, papers: true },
  { id: 'chairC', kind: 'chair', name: 'chair', rect: [21, 5, 1, 1] },
  // the "internet": tall archive shelves along the west wall
  ...[0, 1, 2, 3].map((i) => ({ id: `shelf${i}`, kind: 'shelf', name: 'shelf', rect: [0, 2 + i * 2, 1, 2], seed: i + 3 })),
  // kitchen along the north wall
  { id: 'counter', kind: 'counter', name: 'kitchen', rect: [10, 0, 4, 1] },
  { id: 'fridge', kind: 'fridge', name: 'fridge', rect: [14, 0, 1, 1] },
  { id: 'cooler', kind: 'cooler', name: 'cooler', rect: [8, 0, 1, 1] },
  // printer
  { id: 'printer', kind: 'printer', name: 'printer', rect: [24, 12, 1, 1] },
  // lounge
  { id: 'sofa', kind: 'sofa', name: 'sofa', rect: [3, 16, 4, 1], seat: true },
  { id: 'table', kind: 'coffeeTable', name: 'coffeeTable', rect: [4, 13, 2, 2] },
  { id: 'armchair', kind: 'armchair', name: 'armchair', rect: [8, 13, 1, 1], seat: true },
  // plants
  ...[[0, 0], [25, 0], [25, 17], [8, 17], [17, 7], [0, 10]].map(([x, y], i) => ({ id: `plant${i}`, kind: 'plant', name: 'plant', rect: [x, y, 1, 1], seed: i + 11 })),
];

export const RUG = [2, 12, 7, 5];

// Wall features. side: 'N' (y=0), 'W' (x=0), 'S' (y=D), 'E' (x=W). from/to = position along the wall.
export const WALL_THINGS = [
  { side: 'N', kind: 'board', name: 'whiteboard', from: 2, to: 7, z0: 12, z1: 34 },
  { side: 'N', kind: 'window', from: 16.5, to: 19.5, z0: 12, z1: 36 },
  { side: 'N', kind: 'answers', name: 'answerBoard', from: 21, to: 24.5, z0: 13, z1: 33 },
  { side: 'N', kind: 'cabinet', from: 10, to: 14, z0: 26, z1: 36 },
  { side: 'W', kind: 'inbox', name: 'inbox', from: 11, to: 13.5, z0: 14, z1: 32 },
  { side: 'W', kind: 'door', name: 'door', from: 14.5, to: 16.5, z0: 0, z1: 30 },
  { side: 'E', kind: 'window', from: 3, to: 6, z0: 12, z1: 36 },
  { side: 'E', kind: 'window', from: 9, to: 12, z0: 12, z1: 36 },
  { side: 'S', kind: 'window', from: 11, to: 14, z0: 12, z1: 36 },
  { side: 'S', kind: 'window', from: 19, to: 22, z0: 12, z1: 36 },
];

// Where agents go. f = facing direction in the original grid.
export const SPOTS = {
  board: { x: 4.5, y: 1, f: [0, -1] },
  inbox: { x: 1, y: 12, f: [-1, 0] },
  brief0: { x: 3, y: 3, f: [0, -1] }, brief1: { x: 4.5, y: 3.2, f: [0, -1] }, brief2: { x: 6, y: 3, f: [0, -1] },
  desk0: { x: 10, y: 7, f: [0, -1], sit: true, desk: 'desk0' },
  desk1: { x: 13, y: 7, f: [0, -1], sit: true, desk: 'desk1' },
  desk2: { x: 16, y: 7, f: [0, -1], sit: true, desk: 'desk2' },
  deskW: { x: 15, y: 11, f: [0, -1], sit: true, desk: 'deskW' },
  deskC: { x: 21, y: 5, f: [0, -1], sit: true, desk: 'deskC' },
  drop0: { x: 22, y: 4, f: [-1, 0] }, drop1: { x: 19, y: 4, f: [1, 0] }, drop2: { x: 20.5, y: 3, f: [0, 1] },
  shelf0: { x: 1, y: 3, f: [-1, 0] }, shelf1: { x: 1, y: 5, f: [-1, 0] }, shelf2: { x: 1, y: 7, f: [-1, 0] }, shelf3: { x: 1, y: 9, f: [-1, 0] },
  coffee0: { x: 11, y: 1, f: [0, -1] }, coffee1: { x: 12.5, y: 1.2, f: [0, -1] }, coffee2: { x: 13.6, y: 1, f: [0, -1] },
  cooler: { x: 8, y: 1, f: [0, -1] },
  printer: { x: 23, y: 12, f: [1, 0] },
  pin: { x: 22.5, y: 1, f: [0, -1] },
  sofa0: { x: 4, y: 16, f: [0, -1], sit: true }, sofa1: { x: 5.5, y: 16, f: [0, -1], sit: true },
  armchair: { x: 8, y: 13, f: [-1, 0], sit: true },
  window0: { x: 18, y: 1.2, f: [0, -1] }, window1: { x: 24.6, y: 8, f: [1, 0] },
  plant: { x: 17, y: 9, f: [0, -1] },
};
export const IDLE_SPOTS = ['coffee0', 'coffee1', 'coffee2', 'cooler', 'sofa0', 'sofa1', 'armchair', 'window0', 'window1', 'plant'];

// --------------------------------------------------------------------- walkable grid

export function buildGrid() {
  const { W, D } = ROOM;
  const blocked = new Uint8Array(W * D);
  for (const it of ITEMS) {
    if (it.kind === 'chair') continue; // chairs can be walked onto
    const [x, y, w, d] = it.rect;
    for (let i = x; i < x + w; i++) for (let j = y; j < y + d; j++) blocked[j * W + i] = it.seat ? 2 : 1;
  }
  return { W, D, blocked };
}

// --------------------------------------------------------------------- drawing

const T = (hex) => tones(hex);

export function drawItem(g, view, it, dyn, t) {
  const r = view.rect(...it.rect);
  const rand = rng(it.seed || 7);
  switch (it.kind) {
    case 'desk': {
      // legs + top slab
      const leg = T(C.wood);
      const inset = 0.12;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const lx = r.x + (dx ? r.w - inset - 0.1 : inset), ly = r.y + (dy ? r.d - inset - 0.1 : inset);
        box(g, view, { x: lx, y: ly, w: 0.1, d: 0.1 }, 0, 9, leg);
      }
      box(g, view, r, 9, 2, { top: C.woodTop, left: C.wood, right: shade(C.wood, -0.3), edge: shade(C.woodTop, 0.25) });
      if (it.monitor) drawMonitor(g, view, it, r, dyn);
      if (it.laptop) box(g, view, { x: r.x + 0.6, y: r.y + 0.3, w: 0.6, d: 0.45 }, 11, 1, T('#9aa3ad'));
      if (it.typewriter) {
        box(g, view, { x: r.x + 0.2, y: r.y + 0.35, w: 0.55, d: 0.4 }, 11, 3, T('#4b4f5a'));
        top(g, view, { x: r.x + 0.3, y: r.y + 0.3, w: 0.35, d: 0.05 }, 15, C.paper);
      }
      if (it.lamp) {
        box(g, view, { x: r.x + 1.6, y: r.y + 0.2, w: 0.2, d: 0.2 }, 11, 8, T('#3a3f4a'));
        box(g, view, { x: r.x + 1.45, y: r.y + 0.15, w: 0.45, d: 0.35 }, 19, 3, { top: '#f6d58a', left: '#d9a94a', right: '#b8873a' });
      }
      if (it.papers) {
        const n = Math.min(6, dyn.criticPapers || 0);
        for (let i = 0; i < n; i++) box(g, view, { x: r.x + 0.25 + (i % 2) * 0.05, y: r.y + 0.3, w: 0.5, d: 0.4 }, 11 + i, 1, { top: C.paper, left: '#dcd6c8', right: '#c9c2b2' });
      }
      break;
    }
    case 'chair': {
      const c = T(C.chair);
      box(g, view, { x: r.x + 0.3, y: r.y + 0.3, w: 0.4, d: 0.4 }, 0, 5, T('#2b3442'));
      box(g, view, { x: r.x + 0.15, y: r.y + 0.15, w: 0.7, d: 0.7 }, 5, 2, c);
      break;
    }
    case 'shelf': {
      box(g, view, r, 0, 30, { top: shade('#7a5233', 0.15), left: '#6a4529', right: '#5a3a22' });
      if (faces(view, 1, 0)) {
        const [sx, sy] = it.rect;
        for (let level = 0; level < 4; level++) {
          const z = 2 + level * 7;
          let pos = 0.08;
          while (pos < 1.88) {
            const w = 0.12 + rand() * 0.14;
            const h = 4 + Math.floor(rand() * 2);
            const col = ['#c4523f', '#3f7fa8', '#e0b03f', '#5f9a58', '#8e5aa8', '#d9d2c3', '#3d4656'][Math.floor(rand() * 7)];
            box(g, view, view.rect(sx + 0.74, sy + pos, 0.24, w), z, h, { top: shade(col, 0.2), left: col, right: shade(col, -0.25) });
            pos += w + 0.02;
          }
          box(g, view, view.rect(sx + 0.72, sy, 0.28, 2), z - 1, 1, T('#5a3a22'));
        }
      }
      break;
    }
    case 'counter': {
      box(g, view, r, 0, 13, T('#d8dde1'));
      top(g, view, { x: r.x, y: r.y, w: r.w, d: r.d }, 13, '#f3f5f6');
      // coffee machine + mugs
      const m = view.rect(11.8, 0.15, 0.7, 0.6);
      box(g, view, m, 13, 9, T('#3b3b40'));
      const steam = Math.sin(t * 3) > 0;
      if (dyn.coffeeBusy && steam) top(g, view, { x: m.x + 0.2, y: m.y + 0.2, w: 0.2, d: 0.2 }, 24, '#ffffff');
      box(g, view, view.rect(10.4, 0.4, 0.2, 0.2), 13, 2, T('#e8e2d6'));
      box(g, view, view.rect(13.2, 0.3, 0.5, 0.5), 13, 3, T('#7fa6c8'));
      break;
    }
    case 'fridge':
      box(g, view, r, 0, 32, T('#e9edf0'));
      break;
    case 'cooler':
      box(g, view, { x: r.x + 0.2, y: r.y + 0.2, w: 0.6, d: 0.6 }, 0, 12, T('#e9edf0'));
      box(g, view, { x: r.x + 0.28, y: r.y + 0.28, w: 0.44, d: 0.44 }, 12, 9, { top: '#cfe6f5', left: '#9ec9e6', right: '#7fb1d4' });
      break;
    case 'printer': {
      box(g, view, { x: r.x + 0.05, y: r.y + 0.05, w: 0.9, d: 0.9 }, 0, 9, T('#4d5360'));
      box(g, view, { x: r.x + 0.08, y: r.y + 0.08, w: 0.84, d: 0.84 }, 9, 6, T('#e3e6e9'));
      const blink = dyn.printing && Math.floor(t * 4) % 2 === 0;
      top(g, view, { x: r.x + 0.6, y: r.y + 0.15, w: 0.15, d: 0.15 }, 15, blink ? '#7bea8a' : '#5c6470');
      if (dyn.printing) {
        const k = (t * 0.6) % 1;
        top(g, view, { x: r.x + 0.25, y: r.y + 0.2, w: 0.5, d: 0.35 * k + 0.05 }, 15.5, C.paper);
      }
      break;
    }
    case 'sofa': {
      const c = T(C.sofa);
      box(g, view, r, 0, 6, c);
      // backrest along the far side (+y in the original layout)
      box(g, view, view.rect(it.rect[0], it.rect[1] + 0.7, it.rect[2], 0.3), 6, 7, T(shade(C.sofa, -0.1)));
      box(g, view, view.rect(it.rect[0], it.rect[1], 0.3, 1), 6, 4, c);
      box(g, view, view.rect(it.rect[0] + it.rect[2] - 0.3, it.rect[1], 0.3, 1), 6, 4, c);
      break;
    }
    case 'armchair': {
      const c = T('#c98a4b');
      box(g, view, r, 0, 6, c);
      box(g, view, view.rect(it.rect[0] + 0.7, it.rect[1], 0.3, 1), 6, 7, T(shade('#c98a4b', -0.1)));
      break;
    }
    case 'coffeeTable':
      box(g, view, { x: r.x + 0.2, y: r.y + 0.2, w: r.w - 0.4, d: r.d - 0.4 }, 0, 5, T('#6b4a33'));
      box(g, view, view.rect(it.rect[0] + 0.5, it.rect[1] + 0.6, 0.6, 0.4), 5, 1, T('#d9534f'));
      box(g, view, view.rect(it.rect[0] + 1.2, it.rect[1] + 1.1, 0.2, 0.2), 5, 2, T('#efe6d6'));
      break;
    case 'plant': {
      box(g, view, { x: r.x + 0.25, y: r.y + 0.25, w: 0.5, d: 0.5 }, 0, 6, T(C.pot));
      const cx = r.x + 0.5, cy = r.y + 0.5;
      for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2, rr = rand() * 0.35;
        const z = 6 + rand() * 10;
        const s = 0.18 + rand() * 0.15;
        box(g, view, { x: cx + Math.cos(a) * rr - s / 2, y: cy + Math.sin(a) * rr - s / 2, w: s, d: s }, z, 3, rand() > 0.5 ? T(C.leaf) : T(C.leaf2));
      }
      break;
    }
  }
}

function drawMonitor(g, view, it, r, dyn) {
  // the monitor stands on the far side of the desk (original y side), facing the chair
  const [x, y, w] = it.rect;
  const stand = view.rect(x + w / 2 - 0.08, y + 0.15, 0.16, 0.12);
  box(g, view, stand, 11, 3, T('#2d313b'));
  const panel = view.rect(x + 0.35, y + 0.1, w - 0.7, 0.12);
  box(g, view, panel, 14, 9, { top: '#3a3f4b', left: '#2d313b', right: '#22262e' });
  // glowing screen on the side that faces the chair (+y in the original layout)
  const on = dyn.screens?.[it.id];
  const a = [x + 0.42, y + 0.22], b = [x + w - 0.42, y + 0.22];
  if (faces(view, 0, 1)) {
    wallQuad(g, view, a, b, 15, 22, on ? on.color : C.screen);
    if (on) {
      // scrolling "text" lines
      for (let i = 0; i < 3; i++) {
        const k = ((on.tick + i * 0.33) % 1);
        const z = 16 + i * 2;
        const len = 0.25 + ((on.seed + i * 7) % 5) * 0.08;
        wallQuad(g, view, [a[0] + 0.05, a[1]], [a[0] + 0.05 + len * (0.6 + 0.4 * k), a[1]], z, z + 1, 'rgba(255,255,255,0.75)');
      }
    }
  }
}

/** Is the face pointing toward original-grid direction (dx, dy) visible from the camera? */
export function faces(view, dx, dy) {
  const [a, b] = view.dir(dx, dy);
  return (a === 1 && b === 0) || (a === 0 && b === 1);
}

// --------------------------------------------------------------------- static background (floor, walls)

export function wallIsBack(view, side) {
  const { W, D } = ROOM;
  const ends = { N: [[0, 0], [W, 0]], W: [[0, 0], [0, D]], S: [[0, D], [W, D]], E: [[W, 0], [W, D]] }[side];
  const a = view.rot2(...ends[0]), b = view.rot2(...ends[1]);
  return (a[1] === 0 && b[1] === 0) || (a[0] === 0 && b[0] === 0);
}

function wallLine(side, from, to) {
  const { W, D } = ROOM;
  return {
    N: [[from, 0], [to, 0]], S: [[from, D], [to, D]], W: [[0, from], [0, to]], E: [[W, from], [W, to]],
  }[side];
}

export function drawBackground(g, view) {
  const { W, D, wallH } = ROOM;
  const rand = rng(42);
  g.clearRect(0, 0, view.width, view.height);

  // floor slab (diorama base)
  const all = view.rect(0, 0, W, D);
  box(g, view, { x: all.x - 0.6, y: all.y - 0.6, w: all.w + 1.2, d: all.d + 1.2 }, -8, 8, { top: C.slab, left: '#4a3c59', right: '#3b3049' });

  // planks
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < D; y++) {
      const base = (x + Math.floor(y / 3)) % 2 ? C.floor : C.floor2;
      const k = (rand() - 0.5) * 0.06;
      top(g, view, view.rect(x, y, 1, 1), 0, shade(base, k));
    }
  }
  // plank seams
  for (let y = 0; y <= D; y++) line(g, view.p(0, y), view.p(W, y), 'rgba(120, 78, 40, 0.35)');

  // rug
  const [rx, ry, rw, rd] = RUG;
  top(g, view, view.rect(rx, ry, rw, rd), 0.2, C.rugEdge);
  top(g, view, view.rect(rx + 0.25, ry + 0.25, rw - 0.5, rd - 0.5), 0.2, C.rug);
  top(g, view, view.rect(rx + 0.9, ry + 0.9, rw - 1.8, rd - 1.8), 0.2, C.rug2);

  // walls
  for (const side of ['N', 'W', 'E', 'S']) {
    const back = wallIsBack(view, side);
    const [a, b] = wallLine(side, 0, side === 'N' || side === 'S' ? W : D);
    const shaded = (() => { const pa = view.rot2(...a), pb = view.rot2(...b); return pa[0] === pb[0]; })();
    if (back) {
      wallQuad(g, view, a, b, 0, wallH, shaded ? C.wallShade : C.wall);
      wallQuad(g, view, a, b, 0, 3, C.base);
      wallQuad(g, view, a, b, wallH - 2, wallH, C.trim);
    }
  }

  // light from windows on back walls, falling onto the floor
  for (const w of WALL_THINGS) {
    if (w.kind !== 'window' || !wallIsBack(view, w.side)) continue;
    const pts = lightPatch(w);
    poly(g, pts.map(([x, y]) => view.p(x, y)), C.light);
  }

  // things mounted on back walls
  for (const w of WALL_THINGS) {
    if (!wallIsBack(view, w.side)) continue;
    const [a, b] = wallLine(w.side, w.from, w.to);
    if (w.kind === 'window') {
      wallQuad(g, view, a, b, w.z0 - 1, w.z1 + 1, C.frame);
      wallQuad(g, view, a, b, w.z0, w.z1, C.sky);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      wallQuad(g, view, a, mid, w.z0 + 8, w.z1, C.sky2);
      wallQuad(g, view, [mid[0] - (b[0] - a[0]) * 0.01, mid[1] - (b[1] - a[1]) * 0.01], [mid[0] + (b[0] - a[0]) * 0.02, mid[1] + (b[1] - a[1]) * 0.02], w.z0, w.z1, C.frame);
      wallQuad(g, view, a, b, w.z0 + 11, w.z0 + 12, C.frame);
    } else if (w.kind === 'door') {
      wallQuad(g, view, a, b, 0, w.z1 + 1, C.trim);
      wallQuad(g, view, a, b, 0, w.z1 - 1, '#a5774f');
      const k = [a[0] + (b[0] - a[0]) * 0.8, a[1] + (b[1] - a[1]) * 0.8];
      wallQuad(g, view, k, [k[0] + (b[0] - a[0]) * 0.05, k[1] + (b[1] - a[1]) * 0.05], 14, 16, '#f2d27a');
    } else if (w.kind === 'board') {
      wallQuad(g, view, a, b, w.z0 - 1, w.z1 + 1, '#9aa0a6');
      wallQuad(g, view, a, b, w.z0, w.z1, C.board);
    } else if (w.kind === 'answers' || w.kind === 'inbox') {
      wallQuad(g, view, a, b, w.z0 - 1, w.z1 + 1, C.trim);
      wallQuad(g, view, a, b, w.z0, w.z1, C.cork);
    } else if (w.kind === 'cabinet') {
      wallQuad(g, view, a, b, w.z0, w.z1, '#d8dde1');
      for (let i = 1; i < 4; i++) {
        const p = [a[0] + (b[0] - a[0]) * (i / 4), a[1] + (b[1] - a[1]) * (i / 4)];
        line(g, view.p(p[0], p[1], w.z0), view.p(p[0], p[1], w.z1), '#aeb6bd');
      }
    }
  }
}

function lightPatch(w) {
  const { W, D } = ROOM;
  const L = 3.2, skew = 1.4;
  if (w.side === 'N') return [[w.from, 0.05], [w.to, 0.05], [w.to + skew, L], [w.from + skew, L]];
  if (w.side === 'W') return [[0.05, w.from], [0.05, w.to], [L, w.to + skew], [L, w.from + skew]];
  if (w.side === 'S') return [[w.from, D - 0.05], [w.to, D - 0.05], [w.to + skew, D - L], [w.from + skew, D - L]];
  return [[W - 0.05, w.from], [W - 0.05, w.to], [W - L, w.to + skew], [W - L, w.from + skew]];
}

/** Dynamic things on back walls: plan notes on the whiteboard, the task on the inbox, answers pinned. */
export function drawWallOverlay(g, view, dyn, t) {
  for (const w of WALL_THINGS) {
    if (!wallIsBack(view, w.side)) continue;
    const [a, b] = wallLine(w.side, w.from, w.to);
    const at = (k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    if (w.kind === 'board') {
      // title scribble, then one sticky note per subtask
      if (dyn.boardTitle) wallQuad(g, view, at(0.08), at(0.08 + 0.5 * Math.min(1, dyn.boardTitle)), 29, 30.4, '#3a4a6b');
      (dyn.notes || []).forEach((n, i) => {
        const x0 = 0.08 + i * 0.3;
        wallQuad(g, view, at(x0), at(x0 + 0.24), 15, 25, n.color);
        for (let l = 0; l < 3; l++) wallQuad(g, view, at(x0 + 0.03), at(x0 + 0.03 + 0.15 * (n.progress ?? 1) - l * 0.02), 22 - l * 2.4, 22.7 - l * 2.4, 'rgba(40,40,60,0.55)');
      });
    } else if (w.kind === 'inbox' && dyn.task) {
      wallQuad(g, view, at(0.25), at(0.75), 18, 29, C.paper);
      for (let l = 0; l < 3; l++) wallQuad(g, view, at(0.3), at(0.68 - l * 0.08), 26 - l * 2.6, 26.8 - l * 2.6, '#7a6f62');
      wallQuad(g, view, at(0.47), at(0.53), 28, 30, '#d9534f');
    } else if (w.kind === 'answers') {
      const n = Math.min(4, dyn.answers || 0);
      for (let i = 0; i < n; i++) {
        const x0 = 0.08 + i * 0.22;
        wallQuad(g, view, at(x0), at(x0 + 0.18), 16 + (i % 2), 29 + (i % 2), C.paper);
        wallQuad(g, view, at(x0 + 0.07), at(x0 + 0.11), 27 + (i % 2), 29 + (i % 2), '#5546b0');
      }
    }
  }
  void t;
}

/** Low curbs on the front edges so the room reads as a cut-away diorama. */
export function drawFrontWalls(g, view) {
  const { W, D } = ROOM;
  for (const side of ['N', 'W', 'E', 'S']) {
    if (wallIsBack(view, side)) continue;
    const [a, b] = wallLine(side, 0, side === 'N' || side === 'S' ? W : D);
    const pa = view.rot2(...a), pb = view.rot2(...b);
    const r = { x: Math.min(pa[0], pb[0]), y: Math.min(pa[1], pb[1]), w: Math.abs(pb[0] - pa[0]) || 0.25, d: Math.abs(pb[1] - pa[1]) || 0.25 };
    if (r.w === 0.25) r.x -= 0.25 * (pa[0] === 0 ? 0 : 0); // keep inside
    if (r.d === 0.25 && pa[1] > 0) r.y -= 0.25;
    if (r.w === 0.25 && pa[0] > 0) r.x -= 0.25;
    box(g, view, r, 0, 5, { top: C.trim, left: C.wall, right: C.wallShade });
  }
}

export { wallLine };
