// The agents: small original pixel characters that walk (A* on the room grid) and do things.
import { SPOTS, IDLE_SPOTS, buildGrid } from './office.js';

const SPEED = 2.6; // tiles per second

// 7×12 sprites. H hair, S skin, E eyes, C shirt, D shirt shade, P trousers, B shoes, . empty
const FRONT = [
  '..HHH..',
  '.HHHHH.',
  '.HSSSH.',
  '.SSESE.',
  '..SSS..',
  '.CCCCD.',
  'CCCCCDD',
  'SCCCCDS',
  '.CCCCD.',
  '.PP.PP.',
  '.PP.PP.',
  '.BB.BB.',
];
const BACK = [
  '..HHH..',
  '.HHHHH.',
  '.HHHHH.',
  '.HHHHH.',
  '..SSS..',
  '.DCCCC.',
  'DDCCCCC',
  'SDCCCCS',
  '.DCCCC.',
  '.PP.PP.',
  '.PP.PP.',
  '.BB.BB.',
];
const WALK_A = ['.PP.PP.', '.PP..PP', '.BB..BB'];
const WALK_B = ['.PP.PP.', 'PP..PP.', 'BB..BB.'];
const SIT_LEGS = ['.PPPPP.', '.PP.PP.'];

export const CAST = [
  { id: 'P', role: 'planner', name: { ru: 'Дильноза', en: 'Dilnoza' }, female: true, shirt: '#e0a83a', hair: '#3b2a20', skin: '#f1c9a5', home: 'board' },
  { id: 'R1', role: 'researcher', name: { ru: 'Тимур', en: 'Timur' }, shirt: '#2fa596', hair: '#1f1b1a', skin: '#d9a77e', home: 'desk0' },
  { id: 'R2', role: 'researcher', name: { ru: 'Камила', en: 'Kamila' }, female: true, shirt: '#2fa596', hair: '#6b3f2a', skin: '#f1c9a5', home: 'desk1' },
  { id: 'R3', role: 'researcher', name: { ru: 'Азиз', en: 'Aziz' }, shirt: '#2fa596', hair: '#2a2a2a', skin: '#b07a52', home: 'desk2' },
  { id: 'C', role: 'critic', name: { ru: 'Нодира', en: 'Nodira' }, female: true, shirt: '#e0566d', hair: '#c58b3f', skin: '#f1c9a5', home: 'deskC' },
  { id: 'W', role: 'writer', name: { ru: 'Бобур', en: 'Bobur' }, shirt: '#8a7ef0', hair: '#3b2a20', skin: '#d9a77e', home: 'deskW' },
];

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ------------------------------------------------------------------ pathfinding

const grid = buildGrid();
const reserved = new Map(); // spot → character id

function astar(sx, sy, gx, gy) {
  const { W, D, blocked } = grid;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < D;
  const free = (x, y) => inb(x, y) && (blocked[y * W + x] === 0 || (x === gx && y === gy));
  if (!inb(sx, sy) || !inb(gx, gy)) return [];
  const key = (x, y) => y * W + x;
  const open = [[sx, sy]];
  const came = new Map();
  const gs = new Map([[key(sx, sy), 0]]);
  const h = (x, y) => Math.hypot(x - gx, y - gy);
  const fs = new Map([[key(sx, sy), h(sx, sy)]]);
  let guard = 0;
  while (open.length && guard++ < 4000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (fs.get(key(...open[i])) < fs.get(key(...open[bi]))) bi = i;
    const [x, y] = open.splice(bi, 1)[0];
    if (x === gx && y === gy) {
      const path = [[x, y]];
      let k = key(x, y);
      while (came.has(k)) { k = came.get(k); path.unshift([k % W, Math.floor(k / W)]); }
      return path;
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (!free(nx, ny)) continue;
      if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue; // no corner cutting
      const ng = gs.get(key(x, y)) + (dx && dy ? 1.414 : 1);
      if (ng < (gs.get(key(nx, ny)) ?? Infinity)) {
        came.set(key(nx, ny), key(x, y));
        gs.set(key(nx, ny), ng);
        fs.set(key(nx, ny), ng + h(nx, ny));
        if (!open.some(([ox, oy]) => ox === nx && oy === ny)) open.push([nx, ny]);
      }
    }
  }
  return [];
}

// ------------------------------------------------------------------ characters

export class Agent {
  constructor(spec, startSpot) {
    Object.assign(this, spec);
    const s = SPOTS[startSpot];
    this.x = s.x + 0.5;
    this.y = s.y + 0.5;
    this.face = s.f;
    this.steps = [];
    this.step = null;
    this.path = [];
    this.walked = 0;
    this.timer = 0;
    this.idleUntil = 0;
    this.act = s.sit ? 'sit' : 'idle';
    this.spot = startSpot;
    this.sitting = !!s.sit;
    this.carry = null; // 'paper' | 'mug' | null
    this.bubble = null; // { text, until, kind }
    reserve(startSpot, this.id);
  }

  /** Replace what the agent is doing with a list of steps: { spot, act, dur?, carry? }. */
  plan(steps) {
    this.steps = steps.slice();
    this.next();
  }

  /** Add steps after the current ones. */
  then(steps) {
    if (!this.step) return this.plan(steps);
    this.steps.push(...steps);
  }

  next() {
    const step = this.steps.shift() || null;
    this.step = step;
    if (!step) {
      this.idleUntil = performance.now() / 1000 + 2 + Math.random() * 3;
      if (this.act !== 'sit') this.act = 'idle';
      return;
    }
    if (step.carry !== undefined) this.carry = step.carry;
    this.goTo(step.spot);
  }

  goTo(spotName) {
    const s = SPOTS[spotName];
    if (!s) return;
    release(this.spot, this.id);
    reserve(spotName, this.id);
    this.spot = spotName;
    this.timer = 0;
    this.sitting = false;
    const tiles = astar(Math.floor(this.x), Math.floor(this.y), Math.floor(s.x), Math.floor(s.y));
    this.path = tiles.slice(1).map(([x, y]) => [x + 0.5, y + 0.5]);
    if (this.path.length) this.path[this.path.length - 1] = [s.x + 0.5, s.y + 0.5];
    else this.path = [[s.x + 0.5, s.y + 0.5]];
  }

  say(text, seconds = 4, kind = 'say') {
    this.bubble = text ? { text, until: performance.now() / 1000 + seconds, kind } : null;
  }

  get busy() {
    return !!this.step;
  }

  update(dt, now) {
    if (this.path.length) {
      const [tx, ty] = this.path[0];
      const dx = tx - this.x, dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = SPEED * dt;
      if (dist <= stepLen) {
        this.x = tx; this.y = ty;
        this.path.shift();
      } else {
        this.x += (dx / dist) * stepLen;
        this.y += (dy / dist) * stepLen;
      }
      this.walked += Math.min(stepLen, dist);
      if (dist > 0.001) this.face = [dx, dy];
      this.moving = true;
      if (!this.path.length) this.arrive();
      return;
    }
    this.moving = false;
    if (this.step) {
      this.timer += dt;
      if (this.step.dur && this.timer >= this.step.dur) this.next();
    } else if (now > this.idleUntil) {
      this.wander(now);
    }
  }

  arrive() {
    const s = SPOTS[this.spot];
    this.face = s.f;
    this.sitting = !!s.sit;
    this.act = this.step ? this.step.act : s.sit ? 'sit' : 'idle';
    if (!this.step) this.idleUntil = performance.now() / 1000 + 4 + Math.random() * 6;
  }

  wander(now) {
    const options = IDLE_SPOTS.filter((n) => !reserved.has(n));
    const pick = Math.random() < 0.25 ? this.home : options[Math.floor(Math.random() * options.length)] || this.home;
    this.carry = pick.startsWith('coffee') || pick === 'cooler' ? 'mug' : null;
    this.act = 'idle';
    this.goTo(pick);
    this.idleUntil = now + 999;
  }

  /** Activity shown right now (walking overrides everything). */
  get activity() {
    if (this.moving) return 'walk';
    return this.step ? this.step.act : this.sitting ? 'sit' : 'idle';
  }
}

function reserve(spot, id) { reserved.set(spot, id); }
function release(spot, id) { if (reserved.get(spot) === id) reserved.delete(spot); }

// ------------------------------------------------------------------ drawing

/** Draws an agent into the low-res buffer. Returns its screen bbox for picking and bubbles. */
export function drawAgent(g, view, a, t) {
  const [fx, fy] = view.dir(Math.sign(Math.round(a.face[0] * 10)), Math.sign(Math.round(a.face[1] * 10)));
  // screen direction of the facing vector
  const sdx = fx - fy, sdy = fx + fy;
  const back = sdy < 0 || (sdy === 0 && sdx === 0 ? false : sdy < 0);
  const mirror = sdx < 0;
  const act = a.activity;
  const sit = a.sitting && !a.moving;
  const [px, py] = view.p(a.x, a.y, sit ? 4 : 0);
  const rows = (back ? BACK : FRONT).slice();
  if (act === 'walk') {
    const legs = Math.floor(a.walked * 4) % 2 ? WALK_A : WALK_B;
    rows.splice(9, 3, ...legs);
  }
  if (sit) rows.splice(9, 3, ...SIT_LEGS);

  const pal = {
    H: a.hair, S: a.skin, E: '#2a2230', C: a.shirt, D: shadeHex(a.shirt, -0.22),
    P: '#3b3f55', B: '#24242e',
  };
  const bob = act === 'walk' ? (Math.floor(a.walked * 4) % 2) : act === 'idle' ? (Math.sin(t * 2 + a.x) > 0.85 ? 1 : 0) : 0;
  const h = rows.length;
  const x0 = Math.round(px) - 3;
  const y0 = Math.round(py) - h + 1 - bob;

  // soft shadow
  if (!sit) {
    g.fillStyle = 'rgba(40, 28, 70, 0.32)';
    g.fillRect(x0 + 1, Math.round(py), 5, 1);
    g.fillRect(x0 + 2, Math.round(py) + 1, 3, 1);
  }

  for (let r = 0; r < h; r++) {
    const row = rows[r];
    for (let c = 0; c < 7; c++) {
      const ch = row[mirror ? 6 - c : c];
      if (ch === '.') continue;
      g.fillStyle = pal[ch];
      g.fillRect(x0 + c, y0 + r, 1, 1);
    }
  }

  // arms and props
  const armX = mirror ? x0 : x0 + 6;
  const hand = (dx, dy, col = a.skin) => { g.fillStyle = col; g.fillRect(dx, dy, 1, 1); };
  if (act === 'draw' || act === 'browse' || act === 'pin') {
    const up = Math.floor(t * (act === 'draw' ? 6 : 3)) % 2;
    hand(armX, y0 + 4 - up);
    hand(armX, y0 + 5 - up, pal.C);
  }
  if (act === 'type') {
    const k = Math.floor(t * 9) % 2;
    hand(x0 + (back ? 1 : 1) + k, y0 + 7);
    hand(x0 + 5 - k, y0 + 7);
  }
  if (a.carry === 'paper' || act === 'read' || act === 'deliver' || act === 'collect') {
    g.fillStyle = '#f6f3ea';
    g.fillRect(mirror ? x0 - 1 : x0 + 4, y0 + 6, 3, 3);
    g.fillStyle = '#b9b2a2';
    g.fillRect(mirror ? x0 : x0 + 5, y0 + 7, 1, 1);
  } else if (a.carry === 'mug' && !back) {
    g.fillStyle = '#efe8dc';
    g.fillRect(mirror ? x0 - 1 : x0 + 6, y0 + 7, 2, 2);
    if (Math.floor(t * 2) % 3 === 0) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(mirror ? x0 - 1 : x0 + 7, y0 + 5, 1, 1); }
  }
  if (act === 'think' || act === 'listen') {
    // little "…" above the head
    const k = Math.floor(t * 3) % 4;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < Math.min(3, k); i++) g.fillRect(x0 + 1 + i * 2, y0 - 3, 1, 1);
  }
  return { x: x0, y: y0, w: 7, h, headX: x0 + 3.5, headY: y0 };
}

export function resetReservations() {
  reserved.clear();
}
