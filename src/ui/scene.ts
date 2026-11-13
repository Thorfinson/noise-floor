/**
 * The painted scenes of the games, drawn on a canvas: the tools they share. Colours that can be mixed,
 * numbers that look random but are the same every time, a surface that fits its box, clouds, light, sparks.
 *
 * The look is meant to be a picture and not a diagram: full colour, soft light, layers of distance. The
 * panels around it (what to play, the score) stay ink on paper.
 */

export type RGB = [number, number, number];

export const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
export const css = (c: RGB, a = 1): string => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Slow at both ends. */
export const ease = (t: number): number => {
  const u = clamp(t);
  return u * u * (3 - 2 * u);
};
export const TAU = Math.PI * 2;

/** Numbers that look random and come out the same for the same seed. */
export function prng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A value for a whole number that looks random: for things placed along an endless strip. */
export function hash(n: number, seed = 0): number {
  let t = (Math.imul(n | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise along a line, about -1 to 1: the outline of hills, the sway of a flame. */
export function noise(seed: number): (x: number) => number {
  const one = (x: number, s: number): number => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return lerp(hash(i, s), hash(i + 1, s), u) * 2 - 1;
  };
  return (x) => 0.55 * one(x, seed) + 0.27 * one(x * 2.07 + 13, seed + 1) + 0.12 * one(x * 4.3 + 71, seed + 2) + 0.06 * one(x * 9.1 + 5, seed + 3);
}

/** The part of the picture where the game happens, between the panels that lie over it: in drawing units. */
export interface Band {
  top: number;
  bottom: number;
}

/**
 * A canvas that fills its box, which may be the whole window. Drawing is done in units of its own, sized
 * so that the band where the game happens (the part left free by the panels over the picture) is about
 * `ideal` units tall. It is not shrunk below `lo` screen pixels to the unit, so that what is written in it
 * stays readable, nor blown up beyond `hi`.
 */
export class Surface {
  readonly ctx: CanvasRenderingContext2D;
  /** size in drawing units */
  w = 1;
  h = 1;
  /** device pixels per drawing unit */
  px = 1;
  /** where the game happens */
  band: Band = { top: 0, bottom: 1 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly ideal = 320,
    private readonly lo = 0.72,
    private readonly hi = 1.5,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /**
   * Matches the canvas to its box. over is the element the game happens in front of; without one the
   * band is the upper middle of the picture. True when anything changed.
   */
  fit(over?: Element | null): boolean {
    const box = this.canvas.getBoundingClientRect();
    const bw = Math.max(1, box.width);
    const bh = Math.max(1, box.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const o = over?.getBoundingClientRect();
    // with no game going on the picture is a view: the horizon low, much sky
    const top = o && o.height > 40 ? o.top - box.top : bh * 0.1;
    const bottom = o && o.height > 40 ? o.bottom - box.top : bh * 0.84;
    const s = clamp((bottom - top) / this.ideal, this.lo, this.hi);
    const W = Math.round(bw * dpr);
    const H = Math.round(bh * dpr);
    const changed = this.canvas.width !== W || this.canvas.height !== H;
    if (changed) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const band = { top: top / s, bottom: bottom / s };
    const moved = changed || Math.abs(bw / s - this.w) > 0.5 || Math.abs(bh / s - this.h) > 0.5 || Math.abs(band.top - this.band.top) > 0.5 || Math.abs(band.bottom - this.band.bottom) > 0.5;
    this.px = s * dpr;
    this.w = bw / s;
    this.h = bh / s;
    this.band = band;
    return moved;
  }

  /** Starts a frame: drawing units, moved by a shake if there is one. */
  begin(dx = 0, dy = 0): CanvasRenderingContext2D {
    this.ctx.setTransform(this.px, 0, 0, this.px, dx * this.px, dy * this.px);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
    return this.ctx;
  }
}

function sheet(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')!];
}

/** A cloud as a white shape with soft edges and a flat base, to be tinted and scaled. */
export function cloudShape(seed: number, w = 560, h = 170): HTMLCanvasElement {
  const [c, x] = sheet(w, h);
  const r = prng(seed);
  for (let i = 0; i < 30; i++) {
    const cx = w * (0.1 + 0.8 * r());
    const mid = Math.max(0.28, 1 - Math.abs(cx / w - 0.5) * 1.9);
    const rad = h * (0.14 + 0.3 * r()) * mid;
    const cy = h * 0.8 - rad * (0.35 + 0.95 * r()) * mid;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.62)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, rad, 0, TAU);
    x.fill();
  }
  // a flat, soft base
  x.globalCompositeOperation = 'destination-out';
  const g = x.createLinearGradient(0, h * 0.66, 0, h * 0.9);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = g;
  x.fillRect(0, h * 0.66, w, h * 0.34);
  return c;
}

/** A shape filled with one colour, its soft edges kept. */
export function tinted(shape: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const [c, x] = sheet(shape.width, shape.height);
  x.drawImage(shape, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** A shape with its upper part faded out: what is left is its underside. from and to are shares of its height. */
export function faded(shape: HTMLCanvasElement, from: number, to: number): HTMLCanvasElement {
  const [c, x] = sheet(shape.width, shape.height);
  x.drawImage(shape, 0, 0);
  x.globalCompositeOperation = 'destination-in';
  const g = x.createLinearGradient(0, shape.height * from, 0, shape.height * to);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Shapes tinted on demand and kept: a cloud changes colour only now and then. */
export class Tints {
  private made = new Map<string, HTMLCanvasElement>();
  get(shape: HTMLCanvasElement, key: string, color: RGB): HTMLCanvasElement {
    // colours a few steps apart look the same: one tint serves them all
    const q = color.map((v) => Math.round(v / 6) * 6) as RGB;
    const k = `${key}:${q.join()}`;
    let c = this.made.get(k);
    if (!c) {
      if (this.made.size > 60) this.made.clear();
      c = tinted(shape, css(q));
      this.made.set(k, c);
    }
    return c;
  }
}

/** The tooth of the paper: fine grain to lay over a finished picture. */
export function grain(size = 220, seed = 5): HTMLCanvasElement {
  const [c, x] = sheet(size, size);
  const img = x.createImageData(size, size);
  const r = prng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = 110 + r() * 60 + (r() > 0.985 ? 40 : 0);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

/**
 * How pigment settles in a wash: cloudy, a little darker here and lighter there, with specks where it
 * gathered in the hollows of the paper. A tile that repeats without a seam, to be multiplied over a picture.
 */
export function pigment(size = 384, seed = 9): HTMLCanvasElement {
  const [c, x] = sheet(size, size);
  const img = x.createImageData(size, size);
  const r = prng(seed);
  // cloudy noise that wraps: a few layers of smooth values on grids that divide the tile
  const layer = (cells: number, s: number): ((u: number, v: number) => number) => {
    const g = Array.from({ length: cells * cells }, (_, i) => hash(i, s));
    return (u, v) => {
      const fx = u * cells;
      const fy = v * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number): number => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
      return lerp(lerp(at(x0, y0), at(x0 + 1, y0), sx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), sx), sy);
    };
  };
  const layers = [layer(3, seed), layer(7, seed + 1), layer(17, seed + 2), layer(41, seed + 3)];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size;
      const v = j / size;
      const cloud = 0.42 * layers[0](u, v) + 0.3 * layers[1](u, v) + 0.18 * layers[2](u, v) + 0.1 * layers[3](u, v);
      let val = 232 + (cloud - 0.5) * 62 + (r() - 0.5) * 9;
      if (r() > 0.9975) val -= 26;
      const k = (j * size + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = clamp(val, 0, 255);
      img.data[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

export type Pt = [number, number];

/** A number near zero, mostly: the sum of three throws. */
const bell = (r: () => number): number => (r() + r() + r() - 1.5) / 1.5;

/** An outline made rougher: every edge gets a point in its middle, pushed off to one side. Done several times. */
export function rough(pts: Pt[], rounds: number, amount: number, r: () => number): Pt[] {
  let p = pts;
  for (let k = 0; k < rounds; k++) {
    const q: Pt[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const push = bell(r) * amount * Math.min(1, len / 60);
      q.push(a, [(a[0] + b[0]) / 2 - ((b[1] - a[1]) / (len || 1)) * push, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / (len || 1)) * push]);
    }
    p = q;
    amount *= 0.62;
  }
  return p;
}

/**
 * A watercolour wash: the shape laid down many times, very thin, each time with a slightly different
 * edge. Where all the layers meet the colour is full; toward the edge it thins out unevenly, the way
 * a wet wash dries. strength is how much colour there is in the middle, edge how far the rim wanders.
 */
export function wash(ctx: CanvasRenderingContext2D, pts: Pt[], c: RGB, strength: number, edge: number, r: () => number, layers = 16): void {
  const base = rough(pts, 3, edge, r);
  const a = 1 - Math.pow(1 - clamp(strength, 0, 0.98), 1 / layers);
  ctx.fillStyle = css(c, a);
  for (let k = 0; k < layers; k++) {
    const p = rough(base, 2, edge * 0.7, r);
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
    ctx.fill();
  }
}

/** A round stain of colour. */
export function blot(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, c: RGB, strength: number, edge: number, r: () => number, layers = 14): void {
  const pts: Pt[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    pts.push([x + Math.cos(a) * rx * (0.9 + 0.2 * r()), y + Math.sin(a) * ry * (0.9 + 0.2 * r())]);
  }
  wash(ctx, pts, c, strength, edge, r, layers);
}

/** The points of a path as a filled shape with a clean edge. */
export function shape(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** Mist: colour that thickens downward (or upward) between two heights, across the whole width. */
export function mist(ctx: CanvasRenderingContext2D, x0: number, x1: number, from: number, to: number, c: RGB, a: number): void {
  const g = ctx.createLinearGradient(0, from, 0, to);
  g.addColorStop(0, css(c, 0));
  g.addColorStop(1, css(c, a));
  ctx.fillStyle = g;
  ctx.fillRect(x0, Math.min(from, to), x1 - x0, Math.abs(to - from));
}

/** A sheet to paint on once and show many times. Sized in drawing units, as fine as the screen. */
export function painted(w: number, h: number, px: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const [c, x] = sheet(w * px, h * px);
  x.setTransform(px, 0, 0, px, 0, 0);
  paint(x);
  return c;
}

/** Light that adds to what is under it: a lamp, a spark, the moon's halo. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number): void {
  if (a <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(c, a));
  g.addColorStop(0.35, css(c, a * 0.45));
  g.addColorStop(1, css(c, 0));
  const before = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = before;
}

/** The outline of land against the sky, as a closed path down to `bottom`. height gives the rise at each x. */
export function land(ctx: CanvasRenderingContext2D, x0: number, x1: number, bottom: number, top: (x: number) => number, step = 10): void {
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  for (let x = x0; x <= x1 + step; x += step) ctx.lineTo(x, top(x));
  ctx.lineTo(x1 + step, bottom);
  ctx.closePath();
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** seconds left, and seconds it had */
  life: number;
  span: number;
  size: number;
  c: RGB;
  /** pull downward, units per second squared */
  g: number;
  /** drawn as light (added) or as matter (painted over) */
  solid?: boolean;
}

/** Sparks, embers, spray: small things that fly and fade. */
export class Sparks {
  list: Spark[] = [];

  burst(x: number, y: number, n: number, c: RGB, speed: number, opts: Partial<Spark> & { spread?: number; dir?: number; rnd?: () => number } = {}): void {
    const rnd = opts.rnd ?? Math.random;
    for (let i = 0; i < n; i++) {
      const a = (opts.dir ?? 0) + (rnd() - 0.5) * (opts.spread ?? TAU);
      const v = speed * (0.35 + 0.65 * rnd());
      const span = (opts.span ?? 0.7) * (0.6 + 0.6 * rnd());
      this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: span, span, size: (opts.size ?? 2.2) * (0.6 + 0.7 * rnd()), c, g: opts.g ?? 60, solid: opts.solid });
    }
    if (this.list.length > 900) this.list.splice(0, this.list.length - 900);
  }

  step(dt: number): void {
    for (const s of this.list) {
      s.life -= dt;
      s.vy += s.g * dt;
      s.vx *= 1 - 1.4 * dt;
      s.vy *= 1 - 0.6 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.list = this.list.filter((s) => s.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const before = ctx.globalCompositeOperation;
    for (const s of this.list) {
      const k = s.life / s.span;
      ctx.globalCompositeOperation = s.solid ? 'source-over' : 'lighter';
      ctx.fillStyle = css(s.c, s.solid ? 0.8 * k : k);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.4 + 0.6 * k), 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = before;
  }
}

/** A jagged line of light between two points: where it bends is fixed by the seed. */
export function bolt(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number, c: RGB, a: number, wide = 1): void {
  if (a <= 0) return;
  const r = prng(seed);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(3, Math.round(len / 46));
  const nx = -(y1 - y0) / (len || 1);
  const ny = (x1 - x0) / (len || 1);
  const pts: [number, number][] = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const off = (r() - 0.5) * Math.min(26, len * 0.09) * Math.sin(Math.PI * t) * 2;
    pts.push([lerp(x0, x1, t) + nx * off, lerp(y0, y1, t) + ny * off]);
  }
  pts.push([x1, y1]);
  const before = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, al, colr] of [
    [16 * wide, 0.12 * a, c],
    [6 * wide, 0.4 * a, c],
    [2 * wide, 0.95 * a, [255, 255, 255] as RGB],
  ] as [number, number, RGB][]) {
    ctx.strokeStyle = css(colr, al);
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.globalCompositeOperation = before;
}

/** Lays the settling of the pigment and the grain of the paper over a finished frame. */
export function finish(s: Surface, paper: HTMLCanvasElement, settled?: HTMLCanvasElement): void {
  const ctx = s.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (settled) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = ctx.createPattern(settled, 'repeat')!;
    ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
  }
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = ctx.createPattern(paper, 'repeat')!;
  ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** A rectangle with round corners, as a path. */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
