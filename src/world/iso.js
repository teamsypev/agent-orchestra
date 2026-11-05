// Isometric projection and pixel-exact rasterising for a small low-resolution canvas.
// Grid: x runs to the lower right on screen, y to the lower left, z is height in pixels.

export const TW = 8; // half tile width in px
export const TH = 4; // half tile height in px

export class View {
  constructor(W, D, rot = 0, wallH = 44, margin = 18) {
    this.W0 = W; this.D0 = D; // room size in original orientation
    this.wallH = wallH;
    this.margin = margin;
    this.setRot(rot);
  }

  setRot(rot) {
    this.rot = ((rot % 4) + 4) % 4;
    const odd = this.rot % 2 === 1;
    this.W = odd ? this.D0 : this.W0; // rotated room size
    this.D = odd ? this.W0 : this.D0;
    this.ox = this.D * TW + this.margin;
    this.oy = this.wallH + this.margin;
    this.width = (this.W + this.D) * TW + this.margin * 2;
    this.height = (this.W + this.D) * TH + this.wallH + this.margin * 2;
  }

  /** Original grid point → rotated grid point. */
  rot2(x, y) {
    const { W0, D0 } = this;
    switch (this.rot) {
      case 1: return [D0 - y, x];
      case 2: return [W0 - x, D0 - y];
      case 3: return [y, W0 - x];
      default: return [x, y];
    }
  }

  /** Rotated grid → original grid (for picking). */
  unrot2(x, y) {
    const { W0, D0 } = this;
    switch (this.rot) {
      case 1: return [y, D0 - x];
      case 2: return [W0 - x, D0 - y];
      case 3: return [W0 - y, x];
      default: return [x, y];
    }
  }

  /** Original-orientation rectangle → rotated { x, y, w, d }. */
  rect(x, y, w, d) {
    const a = this.rot2(x, y), b = this.rot2(x + w, y + d);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), d: Math.abs(b[1] - a[1]) };
  }

  /** Rotated grid point (+height) → buffer pixel. */
  px(x, y, z = 0) {
    return [this.ox + (x - y) * TW, this.oy + (x + y) * TH - z];
  }

  /** Original grid point → buffer pixel. */
  p(x, y, z = 0) {
    const [rx, ry] = this.rot2(x, y);
    return this.px(rx, ry, z);
  }

  /** Rotate a facing vector (original grid) into the view. */
  dir(dx, dy) {
    const a = this.rot2(0, 0), b = this.rot2(dx, dy);
    return [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
  }

  /** Buffer pixel at floor height → rotated grid. */
  unproject(sx, sy, z = 0) {
    const u = (sx - this.ox) / TW;
    const v = (sy + z - this.oy) / TH;
    return [(u + v) / 2, (v - u) / 2];
  }
}

/** Fill a convex polygon with crisp pixel spans (no anti-aliasing). */
export function poly(g, pts, color) {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  minY = Math.floor(minY); maxY = Math.ceil(maxY);
  g.fillStyle = color;
  const n = pts.length;
  for (let row = minY; row < maxY; row++) {
    const sy = row + 0.5;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
      if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) {
        const x = x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    if (hi > lo) {
      const a = Math.round(lo), b = Math.round(hi);
      if (b > a) g.fillRect(a, row, b - a, 1);
    }
  }
}

/** Horizontal rhombus (floor / top face) for a rotated rect at height z. */
export function top(g, view, r, z, color) {
  poly(g, [view.px(r.x, r.y, z), view.px(r.x + r.w, r.y, z), view.px(r.x + r.w, r.y + r.d, z), view.px(r.x, r.y + r.d, z)], color);
}

/**
 * An isometric box on a rotated rect: top, left face (toward +y) and right face (toward +x).
 * colors: { top, left, right, edge? }
 */
export function box(g, view, r, z, h, colors) {
  const { x, y, w, d } = r;
  // left visible face: plane y = y + d
  poly(g, [view.px(x, y + d, z), view.px(x + w, y + d, z), view.px(x + w, y + d, z + h), view.px(x, y + d, z + h)], colors.left);
  // right visible face: plane x = x + w
  poly(g, [view.px(x + w, y, z), view.px(x + w, y + d, z), view.px(x + w, y + d, z + h), view.px(x + w, y, z + h)], colors.right);
  top(g, view, r, z + h, colors.top);
  if (colors.edge) {
    // a 1px highlight on the front edges of the top face
    const a = view.px(x, y + d, z + h), b = view.px(x + w, y + d, z + h), c = view.px(x + w, y, z + h);
    line(g, a, b, colors.edge);
    line(g, b, c, colors.edge);
  }
}

/** 1px line (Bresenham) between buffer points. */
export function line(g, [x0, y0], [x1, y1], color) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  g.fillStyle = color;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 2000; i++) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** A vertical rectangle on a wall plane between two original-grid points. */
export function wallQuad(g, view, a, b, z0, z1, color) {
  poly(g, [view.p(a[0], a[1], z0), view.p(b[0], b[1], z0), view.p(b[0], b[1], z1), view.p(a[0], a[1], z1)], color);
}

export function shade(hex, k) {
  // k > 0 lightens towards white, k < 0 darkens towards a cool shadow
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { const t = -k; r = r * (1 - t) + 40 * t; g = g * (1 - t) + 34 * t; b = b * (1 - t) + 72 * t; }
  return `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;
}

export function tones(hex) {
  return { top: shade(hex, 0.12), left: hex, right: shade(hex, -0.28), edge: shade(hex, 0.35) };
}

/** Small deterministic random generator, so the room looks the same on every visit. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
