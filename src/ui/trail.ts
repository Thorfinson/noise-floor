/**
 * The picture of the rhythm game, painted like a watercolour: a wanderer with a lantern crosses still
 * water on stepping stones, and the land goes by behind in layers, the far ones pale in the mist and slow,
 * the near ones full and faster. One stone for every strum. A stone that was met in time is lit and stays
 * lit, so the way that was kept can be seen trailing off to the left; one that was missed stays dark.
 *
 * Four lands, one for each strumming pattern, each in a few colours of its own: birches in a marsh at
 * first light, a pinewood at noon, a heath of bare trees in the evening, a coast of rock needles at dusk
 * with a lighthouse far ahead.
 *
 * The picture fills the window, and the game happens in the band the panels leave free. Each layer of
 * land is painted once, as a strip that repeats, and then only moved.
 *
 * The rules are in game/stride.ts; this only draws what they say.
 */
import { blot, clamp, css, finish, grain, hash, lerp, mist, mix, painted, pigment, prng, rgb, rough, roundRect, shape, Sparks, Surface, TAU, wash, type Pt, type RGB } from './scene';
// in the drawing methods below, L is the land; the language is only asked for in make()
import { L } from '../core/i18n';

interface Land {
  name: string;
  paper: RGB;
  skyA: RGB;
  skyB: RGB;
  /** how much of the paper the sky covers */
  cover: number;
  disc: RGB;
  ring: RGB;
  /** x as a share of the width, height as a share of the band, radius as a share of the band */
  sun: [number, number, number];
  far: RGB;
  mid: RGB;
  near: RGB;
  dark: RGB;
  waterA: RGB;
  waterB: RGB;
  /** the one strong colour: leaves, the scarf */
  accent: RGB;
  motif: 'birch' | 'pine' | 'bare' | 'needle';
  stars: number;
  /** the sky is dark: what is written on it has to be light */
  night: boolean;
}

const make = (name: [string, string], c: string[], cover: number, sun: [number, number, number], motif: Land['motif'], stars = 0, night = false): Land => {
  const [paper, skyA, skyB, disc, ring, far, mid, near, dark, waterA, waterB, accent] = c.map(rgb);
  // the name is a getter, read when it is shown, in the language of that moment
  return { get name() { return L(name[0], name[1]); }, paper, skyA, skyB, cover, disc, ring, sun, far, mid, near, dark, waterA, waterB, accent, motif, stars, night };
};

export const LANDS: Land[] = [
  make(['The birch marsh at first light', 'Das Birkenmoor im ersten Licht'], ['#f6f1e6', '#f7d6c0', '#cfe4d6', '#fffaf0', '#f4c0a0', '#cbdccc', '#9fc0ac', '#55857a', '#1c3d3a', '#dcebe0', '#92bfae', '#e0674f'], 0.5, [0.7, 0.36, 0.3], 'birch'),
  make(['The pinewood at noon', 'Der Kiefernwald am Mittag'], ['#f3f5ef', '#cbe5ee', '#e6f0e2', '#ffffff', '#b9dce6', '#bfd9de', '#84b4be', '#3a7c8a', '#143d48', '#d3e8ec', '#78b0bd', '#f0b83c'], 0.6, [0.24, 0.72, 0.13], 'pine'),
  make(['The heath in the evening', 'Die Heide am Abend'], ['#f9eedd', '#f6c688', '#f1a676', '#fff6e0', '#ee9456', '#ebbc90', '#d2875a', '#9a4836', '#47221f', '#f8dcb4', '#de966a', '#2f7f86'], 0.62, [0.74, 0.3, 0.34], 'bare'),
  make(['The coast at dusk', 'Die Küste in der Dämmerung'], ['#ece9f3', '#a99bd2', '#7d74b8', '#fbfaf4', '#c7bdea', '#a59dce', '#786eae', '#443d7c', '#1b1943', '#b1a6d5', '#6a62a4', '#f2c063'], 0.9, [0.3, 0.74, 0.07], 'needle', 0.9, true),
];

/** how far apart two beats are on the water, in drawing units */
export const BEAT_W = 132;
/** how wide a strip of land is before it repeats */
const STRIP = 2200;
const GOLD: RGB = [246, 196, 92];
const GLOW: RGB = [255, 236, 178];
const BAD: RGB = [226, 84, 60];
const PAPER = '#fbf5ea';
const NOW = '#1e6aa8';
const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';
const SANS = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';

export type StoneState = 'ahead' | 'hit' | 'wrong' | 'missed';

export interface TrailView {
  /** beats since the first stone; negative while it counts in */
  beat: number;
  stones: { at: number; chord: string; bar: number }[];
  states: StoneState[];
  bars: number;
  /** the name to write for a chord */
  name: (chord: string) => string;
  /** how each stone is counted: "1", "2", "+" */
  count: (i: number) => string;
  /**
   * A map instead of a walk: every stone is a stage of a way, they all fit in the picture, and nothing
   * scrolls. walker is the stone the wanderer stands on (one beyond the last: the far bank), mark the stone
   * that is picked out, label what is written under a stone, in two lines.
   */
  map?: { walker: number; mark: number; label: (i: number) => [string, string] };
}

interface Geo {
  W: number;
  H: number;
  bt: number;
  bb: number;
  bh: number;
  /** the far bank, and the line the stones lie on */
  shore: number;
  ground: number;
}

/** Colour that soaks into what is under it: a stain with a soft edge. */
function stain(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number): void {
  if (a <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(c, a));
  g.addColorStop(0.5, css(c, a * 0.5));
  g.addColorStop(1, css(c, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

export class Trail {
  private readonly s: Surface;
  private readonly lnd: Land;
  private readonly seed: number;
  private readonly paper = grain();
  private readonly settled = pigment();
  private readonly sparks = new Sparks();
  /** the element the game happens in front of */
  over: Element | null = null;
  private sky: HTMLCanvasElement | null = null;
  /** strips of land, far to near, with how fast each goes by */
  private strips: { img: HTMLCanvasElement; f: number; h: number }[] = [];
  private front: HTMLCanvasElement | null = null;
  private readonly was: StoneState[] = [];
  private readonly litAt = new Map<number, number>();
  private rings: { x: number; t: number; c: RGB }[] = [];
  private words: { i: number; t: number; text: string; bad: boolean }[] = [];
  private birds: { t: number; y: number } | null = null;
  private readonly scarf: { x: number; y: number }[] = Array.from({ length: 10 }, () => ({ x: 0, y: 0 }));
  private t = 0;
  private last = 0;
  private stumble = -9;
  private streak = 0;
  private landed = -1;
  private landT = -9;
  /** counts up once the walk is over */
  private ending = 0;
  private kept = false;

  /** band is how tall, in drawing units, the part of the picture is that the walk happens in: less for a small picture, so that things in it are not drawn small */
  constructor(canvas: HTMLCanvasElement, landIndex = 0, band = 320) {
    this.s = new Surface(canvas, band);
    const i = ((landIndex % LANDS.length) + LANDS.length) % LANDS.length;
    this.lnd = LANDS[i];
    this.seed = 300 + i * 17;
  }

  /** How many stones in a row were met in time: what the screen shows as the run. */
  get run(): number {
    return this.streak;
  }

  /** Words that rise from a stone: how early or late the strum was. */
  say(i: number, text: string, bad: boolean): void {
    this.words.push({ i, t: this.t, text, bad });
  }

  /** The walk is over: on the far bank a beacon is lit if the pulse was kept. */
  end(kept: boolean): void {
    if (!this.ending) {
      this.ending = 0.0001;
      this.kept = kept;
    }
  }

  private geo(): Geo {
    const { w: W, h: H, band } = this.s;
    const bh = band.bottom - band.top;
    const ground = Math.round(band.bottom - clamp(bh * 0.2, 46, 76));
    const shore = Math.round(ground - clamp(bh * 0.14, 30, 50));
    return { W, H, bt: band.top, bb: band.bottom, bh, shore, ground };
  }

  // ───────────────────────── what is painted once

  private paintSky(g: Geo): HTMLCanvasElement {
    const L = this.lnd;
    return painted(g.W, g.H, this.s.px, (ctx) => {
      const r = prng(this.seed);
      const { W, H, bt, bh, shore } = g;
      ctx.fillStyle = css(L.paper);
      ctx.fillRect(0, 0, W, H);
      wash(ctx, [[-60, -60], [W + 60, -60], [W + 60, shore + 6], [-60, shore + 6]], L.skyB, L.cover, 26, r, 14);
      blot(ctx, W * 0.2, bt + bh * 0.1, W * 0.5, bh * 0.5, L.skyA, L.cover * 0.85, 34, r);
      blot(ctx, W * 0.84, bt, W * 0.36, bh * 0.4, L.skyA, L.cover * 0.5, 30, r);
      blot(ctx, W * 0.5, shore - bh * 0.06, W * 0.75, bh * 0.22, mix(L.paper, L.skyA, 0.2), L.night ? 0.35 : 0.65, 22, r);
      if (L.stars) {
        for (let i = 0; i < 130; i++) {
          const x = r() * W;
          const y = r() * r() * (shore - 30);
          const big = r() > 0.93;
          ctx.fillStyle = css(L.disc, L.stars * (0.35 + 0.65 * r()));
          ctx.beginPath();
          ctx.arc(x, y, big ? 1.5 : 0.5 + r() * 0.6, 0, TAU);
          ctx.fill();
          if (big) {
            ctx.strokeStyle = css(L.disc, 0.5);
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(x - 5, y);
            ctx.lineTo(x + 5, y);
            ctx.moveTo(x, y - 5);
            ctx.lineTo(x, y + 5);
            ctx.stroke();
          }
        }
      }
      // the sun or moon: a disc of bare paper with a ring of colour round it
      const dr = clamp(bh * L.sun[2], 14, 170);
      const dx = W * L.sun[0];
      const dy = shore - bh * L.sun[1];
      blot(ctx, dx, dy, dr * 1.55, dr * 1.55, L.ring, 0.4, dr * 0.16, r);
      const rim: Pt[] = [];
      for (let i = 0; i < 48; i++) rim.push([dx + Math.cos((i / 48) * TAU) * dr, dy + Math.sin((i / 48) * TAU) * dr]);
      ctx.fillStyle = css(L.disc);
      shape(ctx, rough(rim, 1, 1.2, r));
      ctx.fill();
    });
  }

  /** One strip of land: what stands on the far bank at one distance, its feet in the mist. */
  private paintStrip(g: Geo, depth: number): HTMLCanvasElement {
    const L = this.lnd;
    const tall = g.shore + 12;
    const c = [mix(L.far, L.paper, 0.3), L.far, L.mid, L.near][depth];
    const size = [0.5, 0.7, 1, 1.5][depth];
    return painted(STRIP, tall, Math.min(this.s.px, 1.5), (ctx) => {
      const r = prng(this.seed + 31 * depth);
      const sky = g.shore - g.bt;
      const each = (n: number, draw: (x: number, k: number) => void): void => {
        for (let k = 0; k < n; k++) {
          const x = ((k + 0.15 + 0.7 * r()) / n) * STRIP;
          // what stands near the edge of the strip is drawn on the other edge too, so that the strip repeats without a seam
          for (const dx of [-STRIP, 0, STRIP]) {
            ctx.save();
            ctx.translate(dx, 0);
            const state = [r(), r(), r(), r(), r(), r(), r(), r()];
            let at = 0;
            this.pick = () => state[at++ % state.length];
            draw(x, k);
            ctx.restore();
          }
        }
      };
      // low ground the trees stand on
      const hill: Pt[] = [[-20, tall]];
      for (let x = -20; x <= STRIP + 20; x += 20) hill.push([x, g.shore + 2 - sky * 0.05 * size * (1 + Math.sin((x / STRIP) * TAU * (2 + depth)) * Math.cos((x / STRIP) * TAU * 5 + depth))]);
      hill.push([STRIP + 20, tall]);
      ctx.fillStyle = css(c);
      shape(ctx, hill);
      ctx.fill();
      ctx.fillStyle = css(c);
      ctx.strokeStyle = css(c);
      if (L.motif === 'birch') {
        each([13, 11, 9, 6][depth], (x) => this.birch(ctx, x, g, c, size, depth));
      } else if (L.motif === 'pine') {
        each([15, 13, 10, 7][depth], (x) => this.pine(ctx, x, g.shore + 3, sky * (0.42 + 0.5 * this.pick()) * [0.62, 0.78, 0.92, 1.12][depth], c));
      } else if (L.motif === 'bare') {
        each([8, 7, 6, 4][depth], (x, k) => (k % 3 === 2 && depth >= 2 ? this.stone(ctx, x, g.shore + 3, sky * 0.2 * size, c) : this.bare(ctx, x, g.shore + 3, sky * (0.34 + 0.4 * this.pick()) * [0.6, 0.76, 0.95, 1.2][depth], c, size)));
      } else {
        each([8, 7, 5, 4][depth], (x) => this.needle(ctx, x, g.shore + 3, sky * (0.3 + 0.75 * this.pick()) * [0.6, 0.8, 1, 1.25][depth], (9 + 9 * this.pick()) * size, c));
      }
      // mist at their feet: thicker for what is further away
      mist(ctx, -20, STRIP + 20, g.shore - sky * [0.36, 0.3, 0.22, 0.12][depth], g.shore + 6, mix(L.paper, L.skyA, 0.2), [0.95, 0.88, 0.72, 0.4][depth]);
    });
  }

  /** a throw of the dice for the thing being drawn, the same for each of its copies */
  private pick: () => number = Math.random;

  /** A birch: a pale trunk that goes up out of the picture, with a crown of leaves high up. */
  private birch(ctx: CanvasRenderingContext2D, x: number, g: Geo, c: RGB, size: number, depth: number): void {
    const L = this.lnd;
    const w = (7 + 9 * this.pick()) * size;
    const lean = (this.pick() - 0.5) * 30;
    const foot = g.shore + 4;
    const trunk: Pt[] = [[x - w / 2, foot]];
    for (let i = 1; i <= 8; i++) trunk.push([x - w / 2 + (lean * i) / 8 + 0.03 * w * i, lerp(foot, -30, i / 8)]);
    for (let i = 8; i >= 0; i--) trunk.push([x + w / 2 + (lean * i) / 8 - 0.03 * w * i, lerp(foot, -30, i / 8)]);
    ctx.fillStyle = css(c);
    shape(ctx, trunk);
    ctx.fill();
    if (depth >= 2) {
      // the marks of a birch, and a thin branch or two
      ctx.fillStyle = css(mix(c, L.dark, 0.55));
      for (let i = 0; i < 7; i++) {
        const u = 0.08 + 0.84 * this.pick();
        ctx.fillRect(x - w / 2 + (lean * u) + w * (0.1 + 0.4 * this.pick()), lerp(foot, -30, u), w * (0.3 + 0.3 * this.pick()), 1.6 * size);
      }
    }
    // leaves: a thin veil of colour high up, and single leaves in it, dabbed on
    const cx = x + lean + (this.pick() - 0.5) * 60 * size;
    const cy = g.bt + (g.shore - g.bt) * (0.04 + 0.16 * this.pick());
    const veil = mix(c, L.paper, 0.45);
    ctx.fillStyle = css(veil, 0.16);
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.ellipse(cx + (hash(k, 3) - 0.5) * 120 * size, cy + (hash(k, 4) - 0.5) * 50 * size, 44 * size, 20 * size, 0, 0, TAU);
      ctx.fill();
    }
    const n = depth >= 2 ? 46 : 22;
    const kx = this.pick() * 100;
    for (let k = 0; k < n; k++) {
      const a = hash(k, kx) * TAU;
      const d = Math.sqrt(hash(k, kx + 1));
      ctx.fillStyle = css(k % 5 === 0 && depth >= 2 ? L.accent : mix(c, k % 2 ? L.dark : L.paper, 0.22), depth >= 2 ? 0.85 : 0.6);
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * d * 95 * size, cy + Math.sin(a) * d * 42 * size, 4.6 * size, 2.2 * size, a, 0, TAU);
      ctx.fill();
    }
  }

  /** A pine: tiers of boughs, each a little wider than the one above. */
  private pine(ctx: CanvasRenderingContext2D, x: number, foot: number, tall: number, c: RGB): void {
    const tiers = 6 + Math.floor(this.pick() * 3);
    const wide = tall * (0.15 + 0.05 * this.pick());
    ctx.fillStyle = css(c);
    ctx.fillRect(x - tall * 0.012 - 1, foot - tall * 0.25, tall * 0.024 + 2, tall * 0.25);
    ctx.beginPath();
    ctx.moveTo(x, foot - tall);
    for (let k = 1; k <= tiers; k++) {
      const y = foot - tall + (tall * 0.86 * k) / tiers;
      const w = wide * (k / tiers) * (0.88 + 0.24 * this.pick());
      ctx.quadraticCurveTo(x + w * 0.5, y - 3, x + w, y + 2);
      ctx.lineTo(x + w * 0.42, y - 2);
    }
    ctx.lineTo(x, foot - tall * 0.12);
    for (let k = tiers; k >= 1; k--) {
      const y = foot - tall + (tall * 0.86 * k) / tiers;
      const w = wide * (k / tiers) * (0.88 + 0.24 * this.pick());
      ctx.lineTo(x - w * 0.42, y - 2);
      ctx.lineTo(x - w, y + 2);
      ctx.quadraticCurveTo(x - w * 0.5, y - 3, x, foot - tall + (tall * 0.86 * (k - 1)) / tiers);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** A bare tree: a trunk that forks and forks again into fine lines. */
  private bare(ctx: CanvasRenderingContext2D, x: number, foot: number, tall: number, c: RGB, size: number): void {
    ctx.strokeStyle = css(c);
    ctx.lineCap = 'round';
    const dice = Array.from({ length: 40 }, () => this.pick());
    let at = 0;
    const fork = (px: number, py: number, angle: number, len: number, w: number, level: number): void => {
      const ex = px + Math.cos(angle) * len;
      const ey = py + Math.sin(angle) * len;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + Math.cos(angle) * len * 0.5 + 3 * (dice[at++ % 40] - 0.5), py + Math.sin(angle) * len * 0.5, ex, ey);
      ctx.stroke();
      if (level >= 4) return;
      const n = level < 2 ? 2 : 2 + (dice[at++ % 40] > 0.6 ? 1 : 0);
      for (let k = 0; k < n; k++) fork(ex, ey, angle + (k - (n - 1) / 2) * (0.5 + 0.3 * dice[at++ % 40]) + (dice[at++ % 40] - 0.5) * 0.3, len * (0.62 + 0.14 * dice[at++ % 40]), Math.max(0.6, w * 0.58), level + 1);
    };
    fork(x, foot, -Math.PI / 2 + (dice[at++] - 0.5) * 0.2, tall * 0.42, Math.max(1.6, 5 * size), 0);
  }

  /** A standing stone, a little out of true. */
  private stone(ctx: CanvasRenderingContext2D, x: number, foot: number, tall: number, c: RGB): void {
    const w = tall * 0.32;
    const lean = (this.pick() - 0.5) * 8;
    ctx.fillStyle = css(c);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, foot);
    ctx.lineTo(x - w * 0.42 + lean, foot - tall * 0.86);
    ctx.quadraticCurveTo(x + lean, foot - tall * 1.06, x + w * 0.42 + lean, foot - tall * 0.8);
    ctx.lineTo(x + w / 2, foot);
    ctx.closePath();
    ctx.fill();
  }

  /** A needle of rock. */
  private needle(ctx: CanvasRenderingContext2D, x: number, foot: number, tall: number, wide: number, c: RGB): void {
    const pts: Pt[] = [[x - wide, foot]];
    for (let i = 0; i <= 8; i++) pts.push([x - wide * (1 - 0.74 * (i / 8)) + 2 * (this.pick() - 0.5), lerp(foot, foot - tall, i / 8)]);
    pts.push([x + wide * 0.08, foot - tall - 5], [x + wide * 0.34, foot - tall + 3]);
    for (let i = 8; i >= 0; i--) pts.push([x + wide * (1 - 0.62 * (i / 8)) + 2 * (this.pick() - 0.5), lerp(foot, foot - tall + 4, i / 8)]);
    ctx.fillStyle = css(c);
    shape(ctx, pts);
    ctx.fill();
  }

  /** What goes by in front: dark stones and reeds at the lower edge of the band. */
  private paintFront(): HTMLCanvasElement {
    const L = this.lnd;
    const tall = 150;
    return painted(STRIP, tall, Math.min(this.s.px, 1.5), (ctx) => {
      const r = prng(this.seed + 99);
      for (let k = 0; k < 7; k++) {
        const x = ((k + 0.2 + 0.6 * r()) / 7) * STRIP;
        const w = 90 + 150 * r();
        const top = 62 + 50 * r();
        for (const dx of [-STRIP, 0, STRIP]) {
          const pts: Pt[] = [[x + dx - w / 2, tall + 4]];
          for (let i = 0; i <= 12; i++) pts.push([x + dx - w / 2 + (w * i) / 12, top + (tall - top) * (1 - Math.pow(Math.sin((Math.PI * i) / 12), 0.6))]);
          pts.push([x + dx + w / 2, tall + 4]);
          ctx.fillStyle = css(L.dark);
          shape(ctx, pts);
          ctx.fill();
        }
        // hatching on the stone, reeds beside it
        const marks = Array.from({ length: 12 }, () => [r(), r(), r()]);
        const reeds = Array.from({ length: 6 }, () => [r(), r(), r(), r()]);
        for (const dx of [-STRIP, 0, STRIP]) {
          ctx.strokeStyle = css(mix(L.dark, L.paper, 0.4), 0.7);
          ctx.lineWidth = 0.9;
          for (const [a, b, d] of marks) {
            const px = x + dx - w * 0.3 + a * w * 0.5;
            const py = top + 10 + b * 40;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + 12 + 10 * d, py - 4 - 4 * d);
            ctx.stroke();
          }
          ctx.lineCap = 'round';
          for (const [a, b, d, e] of reeds) {
            const px = x + dx + w * (0.4 + 0.5 * a);
            const h = 30 + 46 * b;
            const lean = (d - 0.5) * 26;
            ctx.strokeStyle = css(L.dark);
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(px, tall);
            ctx.quadraticCurveTo(px + lean * 0.2, tall - h * 0.6, px + lean, tall - h);
            ctx.stroke();
            ctx.fillStyle = css(e > 0.5 ? L.accent : mix(L.accent, L.paper, 0.3));
            for (const side of [-1, 1]) {
              ctx.save();
              ctx.translate(px + lean * 0.8, tall - h * 0.92);
              ctx.rotate(side * 0.9);
              ctx.beginPath();
              ctx.ellipse(0, -6, 2.6, 6.5, 0, 0, TAU);
              ctx.fill();
              ctx.restore();
            }
          }
        }
      }
    });
  }

  // ───────────────────────── every frame

  draw(v: TrailView, ts: number): void {
    const dt = this.last ? Math.min(0.1, Math.max(0, ts - this.last)) : 0;
    this.last = ts;
    this.t += dt;
    if (this.ending) this.ending += dt;
    const resized = this.s.fit(this.over);
    const g = this.geo();
    const { W, H, shore, ground } = g;
    const L = this.lnd;
    if (resized || !this.sky) {
      this.sky = this.paintSky(g);
      this.strips = [0, 1, 2, 3].map((d) => ({ img: this.paintStrip(g, d), f: [0.05, 0.12, 0.26, 0.5][d], h: shore + 12 }));
      this.front = this.paintFront();
    }
    const ctx = this.s.begin();
    const ink = L.night ? L.paper : L.dark;
    const map = v.map;
    // on a map the stones are spread over the width; in a walk they come by at the pace of the beat
    const unit = map ? (W * 0.64) / Math.max(1, v.stones.length - 1) : BEAT_W;
    const WX = map ? W * 0.13 : Math.max(170, W * 0.24);
    const beat = map ? 0 : v.beat;
    const cam = map ? 0 : Math.max(-1.2, v.beat) * BEAT_W;
    const at = (b: number): number => WX + (b - beat) * unit;

    // what changed since the frame before
    v.states.forEach((st, i) => {
      if (st === this.was[i]) return;
      const x = at(v.stones[i].at);
      if (st === 'hit' || st === 'wrong') {
        this.litAt.set(i, this.t);
        this.rings.push({ x: v.stones[i].at, t: this.t, c: st === 'wrong' ? BAD : GOLD });
        this.sparks.burst(x, ground - 8, st === 'wrong' ? 10 : 20, st === 'wrong' ? BAD : GOLD, 130, { dir: -Math.PI / 2, spread: 1.6, span: 0.9, size: 2.4, g: -30, solid: true });
        this.streak = st === 'hit' ? this.streak + 1 : 0;
        if (this.streak > 0 && this.streak % 8 === 0) this.birds = { t: this.t, y: g.bt + g.bh * (0.2 + 0.25 * Math.random()) };
      } else if (st === 'missed') {
        this.streak = 0;
        this.stumble = this.t;
        this.sparks.burst(x, ground + 4, 14, L.disc, 110, { dir: -Math.PI / 2, spread: 1.9, span: 0.6, size: 2.2, g: 320, solid: true });
      }
      this.was[i] = st;
    });
    this.sparks.step(dt);

    ctx.drawImage(this.sky!, 0, 0, W, H);
    // the land behind, strip by strip
    const lay = (img: HTMLCanvasElement, f: number, y: number, h: number): void => {
      let x = -((((cam * f) % STRIP) + STRIP) % STRIP);
      for (; x < W; x += STRIP) ctx.drawImage(img, x, y, STRIP, h);
    };
    for (const sp of this.strips) lay(sp.img, sp.f, 0, sp.h);
    if (L.motif === 'needle') this.lighthouse(ctx, W * 0.8 - cam * 0.05, shore - 10, g);
    if (this.birds && this.t - this.birds.t < 7) this.flock(ctx, W, this.birds, ink);

    // ── the water: still, pale, with the land standing in it upside down
    const water = ctx.createLinearGradient(0, shore, 0, H);
    water.addColorStop(0, css(mix(L.waterA, L.paper, 0.35)));
    water.addColorStop(0.3, css(L.waterA));
    water.addColorStop(1, css(L.waterB));
    ctx.fillStyle = water;
    ctx.fillRect(0, shore + 4, W, H - shore);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, shore + 4, W, H - shore);
    ctx.clip();
    ctx.translate(0, 2 * (shore + 4));
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.26;
    const near = this.strips[3];
    lay(near.img, near.f, 0, near.h);
    ctx.globalAlpha = 0.14;
    lay(this.strips[2].img, this.strips[2].f, 0, this.strips[2].h);
    ctx.restore();
    ctx.globalAlpha = 1;
    // the far bank: a dark line with its own light edge
    ctx.fillStyle = css(mix(L.near, L.dark, 0.45));
    ctx.fillRect(0, shore + 1, W, 4.5);
    ctx.lineCap = 'round';
    const depth = H - shore;
    for (let i = 0; i < 80; i++) {
      const y = Math.pow(hash(i, 3), 1.5);
      const tw = Math.sin(this.t * (0.5 + 1.4 * hash(i, 5)) + i * 1.7);
      if (tw < 0.1) continue;
      const wx = hash(i, 8) * 1600 - cam * (0.6 + 0.5 * y);
      const x = (((wx % (W + 120)) + (W + 120)) % (W + 120)) - 60;
      ctx.strokeStyle = css(L.disc, (0.25 + 0.5 * y) * tw);
      ctx.lineWidth = 0.8 + 1.5 * y;
      ctx.beginPath();
      ctx.moveTo(x, shore + 10 + y * depth);
      ctx.lineTo(x + 14 + 46 * y, shore + 10 + y * depth);
      ctx.stroke();
    }

    // ── the banks the walk begins and ends on
    this.bank(ctx, at(map ? -0.8 : -1.2), g, true);
    // on a map the far bank and its beacon stay in the picture, however few stones there are
    const farBank = map ? Math.min(at(v.stones.length - 1 + 0.8), W - 130) : at(v.bars * 4);
    this.bank(ctx, farBank, g, false);
    if (farBank < W + 240) this.beacon(ctx, farBank + 104, ground - 6);

    // ── posts at the bar lines, with the chord on a slip of paper
    for (let b = 0; b < v.bars; b++) {
      const first = v.stones.find((s) => s.bar === b);
      if (!first) continue;
      const x = at(first.at) - (map ? 34 : 46);
      if (x < -120 || x > W + 60) continue;
      const name = v.name(first.chord);
      const wide = Math.max(52, 22 + name.length * 13);
      ctx.strokeStyle = css(L.dark);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x, ground + 16);
      ctx.lineTo(x + 1.5, ground - 98);
      ctx.stroke();
      const sway = 2 * Math.sin(this.t * 1.6 + b);
      ctx.shadowColor = css(L.dark, 0.25);
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = PAPER;
      shape(ctx, [[x + 2, ground - 98], [x + 2 + wide, ground - 98 + sway * 0.4], [x + 2 + wide - 7, ground - 82 + sway * 0.7], [x + 2 + wide, ground - 66 + sway], [x + 2, ground - 66]]);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.font = `700 19px ${SANS}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = NOW;
      ctx.fillText(name, x + 10, ground - 75);
    }

    // ── the stones
    ctx.textAlign = 'center';
    v.stones.forEach((st, i) => {
      const x = at(st.at);
      if (x < -70 || x > W + 70) return;
      const state = v.states[i];
      const rx = st.at % 1 !== 0 ? 22 : 31;
      const lit = state === 'hit' || state === 'wrong';
      // its double in the water, then the stone: a flat dark shape with a light edge
      ctx.fillStyle = css(L.dark, 0.2);
      ctx.beginPath();
      ctx.ellipse(x, ground + 18, rx * 0.95, 5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = css(mix(L.dark, L.near, state === 'missed' ? 0.5 : 0.1));
      ctx.beginPath();
      ctx.ellipse(x, ground + 7, rx, 10, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = css(L.paper, 0.5);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(x, ground + 6, rx - 3, 7.5, 0, Math.PI * 1.08, Math.PI * 1.72);
      ctx.stroke();
      if (lit) {
        // a small flame that stays: the way that was kept
        const born = this.t - (this.litAt.get(i) ?? this.t);
        const c = state === 'wrong' ? BAD : GOLD;
        const pop = 1 + 0.9 * clamp(1 - born / 0.25);
        const flick = 0.85 + 0.15 * Math.sin(this.t * 11 + i * 2.3);
        stain(ctx, x, ground - 6, 44 * pop, state === 'wrong' ? BAD : GLOW, 0.7 * flick);
        stain(ctx, x, ground + 24, 30, c, 0.3);
        ctx.fillStyle = css(c);
        ctx.beginPath();
        ctx.moveTo(x - 5 * pop, ground + 1);
        ctx.quadraticCurveTo(x - 5.5 * pop, ground - 8 * pop, x + 1.5 * Math.sin(this.t * 7 + i), ground - 19 * pop * flick);
        ctx.quadraticCurveTo(x + 5.5 * pop, ground - 8 * pop, x + 5 * pop, ground + 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = css([255, 252, 236]);
        ctx.beginPath();
        ctx.ellipse(x, ground - 4, 2 * pop, 4.5 * pop * flick, 0, 0, TAU);
        ctx.fill();
      }
      if (map) {
        // what the stage is called and how far it has got, and a ring round the one that is picked out
        const [name, sub] = map.label(i);
        ctx.font = `700 14px ${SANS}`;
        ctx.fillStyle = css(L.dark);
        ctx.fillText(name, x, ground + 46, unit - 14);
        ctx.font = `500 12px ${MONO}`;
        ctx.fillStyle = css(L.dark, 0.75);
        ctx.fillText(sub, x, ground + 64, unit - 14);
        if (i === map.mark) {
          ctx.strokeStyle = NOW;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.ellipse(x, ground + 7, rx + 9, 16, 0, 0, TAU);
          ctx.stroke();
        }
      } else {
        ctx.font = `600 13px ${MONO}`;
        ctx.fillStyle = css(L.dark, 0.85);
        ctx.fillText(v.count(i), x, ground + 44);
      }
    });

    // rings on the water where a strum landed
    this.rings = this.rings.filter((r) => this.t - r.t < 1);
    for (const r of this.rings) {
      const k = this.t - r.t;
      for (let j = 0; j < 3; j++) {
        const u = k - j * 0.14;
        if (u <= 0) continue;
        ctx.strokeStyle = css(r.c, 0.85 * (1 - u));
        ctx.lineWidth = 2.2 * (1 - u) + 0.4;
        ctx.beginPath();
        ctx.ellipse(at(r.x), ground + 9, 22 + u * 78, 7 + u * 22, 0, 0, TAU);
        ctx.stroke();
      }
    }

    // ── the wanderer
    const prev = [...v.stones].reverse().find((s) => s.at <= v.beat);
    const next = v.stones.find((s) => s.at > v.beat);
    const span = prev && next ? next.at - prev.at : 1;
    const walking = !map && v.beat >= -1;
    const from = prev ? prev.at : -1;
    const to = next ? next.at : prev ? prev.at + 1 : 0;
    const ph = walking ? clamp((v.beat - from) / Math.max(0.01, to - from)) : 0;
    const done = !next && !!prev && v.beat > prev.at + 1;
    const hop = walking && !done ? Math.sin(Math.PI * ph) * (26 + 20 * Math.min(1.5, span)) : 0;
    const landing = prev ? v.stones.indexOf(prev) : -1;
    if (landing !== this.landed) {
      this.landed = landing;
      this.landT = this.t;
    }
    const squash = clamp(1 - (this.t - this.landT) / 0.14);
    const idle = walking && !done ? 0 : 1.6 * Math.sin(this.t * 2.2);
    this.wanderer(ctx, map ? at(map.walker) + (map.walker > v.stones.length - 1 ? 30 : 0) : WX, ground - 2 - hop + idle - (map && map.walker > v.stones.length - 1 ? 6 : 0), ph, hop, map ? 0 : squash, dt);

    // what was just said about a strum, rising from its stone
    this.words = this.words.filter((w) => this.t - w.t < 1.2);
    ctx.font = `700 14px ${MONO}`;
    ctx.textAlign = 'center';
    for (const w of this.words) {
      const k = (this.t - w.t) / 1.2;
      ctx.fillStyle = css(w.bad ? BAD : L.dark, 1 - k);
      ctx.fillText(w.text, at(v.stones[w.i].at), ground - 44 - k * 28);
    }
    this.sparks.draw(ctx);

    // petals on the air, and what goes by in front
    for (let i = 0; i < 14; i++) {
      const x = W * (1.1 - (((hash(i, 61) + this.t * (0.012 + 0.014 * hash(i, 62)) + cam * 0.0001) % 1) * 1.2));
      const y = g.bt + g.bh * (0.08 + 0.8 * hash(i, 63)) + 18 * Math.sin(this.t * (0.6 + hash(i, 64)) + i);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.t * (0.8 + hash(i, 65)) + i);
      ctx.fillStyle = css(i % 3 ? L.accent : L.disc, 0.75);
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 1.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (this.front && !map) lay(this.front, 1.55, g.bb - 84, 150);
    // the day ends well: light spreads from the beacon
    if (this.ending && this.kept) {
      ctx.fillStyle = css(GLOW, 0.2 * clamp(this.ending / 0.8));
      ctx.fillRect(0, 0, W, H);
    }
    // bare paper at the top, where the count is written
    mist(ctx, -20, W + 20, g.bt + 14, -10, L.paper, 0.96);
    finish(this.s, this.paper, this.settled);
  }

  /** A lighthouse far off on the coast, its light turning: where the way leads. */
  private lighthouse(ctx: CanvasRenderingContext2D, x: number, y: number, g: Geo): void {
    const L = this.lnd;
    const k = clamp(g.bh / 320, 0.7, 1.4);
    ctx.fillStyle = css(L.disc);
    shape(ctx, [[x - 5 * k, y + 12], [x - 3 * k, y - 44 * k], [x + 3 * k, y - 44 * k], [x + 5 * k, y + 12]]);
    ctx.fill();
    ctx.fillStyle = css(L.accent);
    ctx.fillRect(x - 4.2 * k, y - 26 * k, 8.4 * k, 8 * k);
    ctx.fillStyle = css(L.dark);
    ctx.fillRect(x - 5 * k, y - 50 * k, 10 * k, 3 * k);
    shape(ctx, [[x - 4 * k, y - 50 * k], [x, y - 57 * k], [x + 4 * k, y - 50 * k]]);
    ctx.fill();
    const turn = Math.cos(this.t * 1.1);
    const reach = 300 * turn * k;
    const beam = ctx.createLinearGradient(x, 0, x + reach, 0);
    beam.addColorStop(0, css(GLOW, 0.6));
    beam.addColorStop(1, css(GLOW, 0));
    ctx.fillStyle = beam;
    shape(ctx, [[x, y - 47 * k], [x + reach, y - 47 * k - 18], [x + reach, y - 47 * k + 18]]);
    ctx.fill();
    stain(ctx, x, y - 47 * k, 12 + 26 * Math.abs(turn), GLOW, 0.95);
  }

  /** The bank at either end of the walk: dark ground with fine hatching, a few planks out over the water. */
  private bank(ctx: CanvasRenderingContext2D, x: number, g: Geo, start: boolean): void {
    const ground = (geo: Geo): number => geo.ground;
    const L = this.lnd;
    const dir = start ? -1 : 1;
    if (start ? x < -900 : x > g.W + 300) return;
    const pts: Pt[] = [[x - dir * 30, g.H + 10]];
    for (let i = 0; i <= 10; i++) pts.push([x - dir * 30 + dir * i * 9, g.ground + 40 - 36 * Math.sin((Math.PI / 2) * (i / 10))]);
    pts.push([x + dir * 1600, g.ground - 10], [x + dir * 1600, g.H + 10]);
    ctx.fillStyle = css(L.dark);
    shape(ctx, pts);
    ctx.fill();
    ctx.strokeStyle = css(mix(L.dark, L.paper, 0.4), 0.7);
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 40; i++) {
      const px = x + dir * (70 + hash(i, 91) * 560);
      const py = g.ground + 2 + hash(i, 92) * 36;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + 14 + 12 * hash(i, 93), py - 4 - 4 * hash(i, 94));
      ctx.stroke();
    }
    // planks on posts
    ctx.fillStyle = css(mix(L.dark, L.near, 0.3));
    ctx.fillRect(Math.min(x - dir * 36, x + dir * 70), ground(g) - 1, 106, 4.5);
    for (const k of [-26, 10, 46]) ctx.fillRect(x + dir * k - 1.3, ground(g) + 3, 2.6, 24);
  }

  /** The beacon on the far bank: lit when the pulse was kept. */
  private beacon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const L = this.lnd;
    ctx.fillStyle = css(mix(L.dark, L.near, 0.25));
    shape(ctx, [[x - 15, y], [x - 8, y - 50], [x + 8, y - 50], [x + 15, y]]);
    ctx.fill();
    ctx.fillRect(x - 14, y - 56, 28, 6);
    if (this.ending && this.kept) {
      const k = clamp(this.ending / 0.5);
      const flick = 0.85 + 0.15 * Math.sin(this.t * 13);
      stain(ctx, x, y - 70, 200 * k, GLOW, 0.75 * flick);
      ctx.fillStyle = css(GOLD);
      ctx.beginPath();
      ctx.moveTo(x - 11 * k, y - 56);
      ctx.quadraticCurveTo(x - 13 * k, y - 76, x + 3 * Math.sin(this.t * 8), y - 56 - 42 * k * flick);
      ctx.quadraticCurveTo(x + 13 * k, y - 76, x + 11 * k, y - 56);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = css([255, 252, 236]);
      ctx.beginPath();
      ctx.ellipse(x, y - 66, 4 * k, 10 * k * flick, 0, 0, TAU);
      ctx.fill();
      if (Math.random() < 0.5) this.sparks.burst(x, y - 76, 2, GOLD, 70, { dir: -Math.PI / 2, spread: 1.2, span: 1.2, size: 2, g: -40, solid: true });
    }
  }

  /** Birds going up from the far bank, when a long stretch was kept in time. */
  private flock(ctx: CanvasRenderingContext2D, W: number, b: { t: number; y: number }, ink: RGB): void {
    const k = (this.t - b.t) / 7;
    ctx.strokeStyle = css(ink, 0.8 * (1 - k * k));
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      const x = W * (0.25 + 0.6 * k) + (hash(i, 71) - 0.5) * 150 + i * 6;
      const y = b.y - 60 * k + (hash(i, 72) - 0.5) * 50;
      const flap = Math.sin(this.t * 9 + i * 1.7) * 3.5;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - flap);
      ctx.quadraticCurveTo(x - 2, y - 2, x, y);
      ctx.quadraticCurveTo(x + 2, y - 2, x + 6, y - flap);
      ctx.stroke();
    }
  }

  /**
   * The wanderer: a cloak, a hood, a scarf that trails, and a lantern carried ahead on a staff. x and y
   * are where the feet are; ph runs from 0 to 1 over a step, hop is how high the step has risen.
   */
  private wanderer(ctx: CanvasRenderingContext2D, x: number, y: number, ph: number, hop: number, squash: number, dt: number): void {
    const L = this.lnd;
    const tilt = this.t - this.stumble < 0.45 ? 0.5 * Math.sin(((this.t - this.stumble) / 0.45) * Math.PI) : 0;
    const air = clamp(hop / 30);
    const cloak = L.dark;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.1 * air + tilt);
    ctx.scale(1.12 * (1 + 0.12 * squash), 1.12 * (1 - 0.16 * squash));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // legs: reaching forward in the air, under the body on the stone
    const stride = Math.sin(Math.PI * ph) * 15 * air;
    ctx.strokeStyle = css(cloak);
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-2, -24);
    ctx.quadraticCurveTo(4 + stride * 0.7, -14, 5 + stride, -1 + 5 * air * (1 - ph));
    ctx.moveTo(-3, -24);
    ctx.quadraticCurveTo(-6 - stride * 0.5, -13, -5 - stride, -1 + 6 * air * ph);
    ctx.stroke();
    // the cloak: wide at the hem, lifted behind by the air
    const lift = 9 * air + 2 * Math.sin(this.t * 6);
    ctx.fillStyle = css(cloak);
    ctx.beginPath();
    ctx.moveTo(3, -58);
    ctx.quadraticCurveTo(15, -42, 12, -19);
    ctx.quadraticCurveTo(2, -15, -13, -19 - lift * 0.3);
    ctx.quadraticCurveTo(-22 - lift, -24 - lift * 0.6, -25 - lift * 1.4, -27 - lift);
    ctx.quadraticCurveTo(-12, -40, -5, -57);
    ctx.closePath();
    ctx.fill();
    // a lighter fold, and the lantern's light on the edge
    ctx.fillStyle = css(mix(cloak, L.near, 0.5));
    ctx.beginPath();
    ctx.moveTo(-3, -52);
    ctx.quadraticCurveTo(-12, -38, -20 - lift, -25 - lift * 0.6);
    ctx.quadraticCurveTo(-10, -28, -4, -34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = css(GLOW, 0.8);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(4, -57);
    ctx.quadraticCurveTo(15, -42, 12, -20);
    ctx.stroke();
    // the hood
    ctx.fillStyle = css(cloak);
    ctx.beginPath();
    ctx.moveTo(-7, -56);
    ctx.quadraticCurveTo(-11, -74, 3, -75);
    ctx.quadraticCurveTo(14, -74, 11, -60);
    ctx.quadraticCurveTo(5, -54, -7, -56);
    ctx.fill();
    ctx.fillStyle = css(L.paper, 0.92);
    ctx.beginPath();
    ctx.ellipse(6.6, -64.5, 3, 4.6, 0.2, 0, TAU);
    ctx.fill();
    // the arm, the staff and the lantern on it
    const sway = 3 * Math.sin(this.t * 5) + 6 * air;
    ctx.strokeStyle = css(cloak);
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(6, -48);
    ctx.lineTo(19, -41);
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(15, -28);
    ctx.lineTo(28, -70);
    ctx.moveTo(28, -70);
    ctx.lineTo(28 + sway * 0.25, -58);
    ctx.stroke();
    ctx.restore();
    const lx = x + 31 + sway * 0.3;
    const ly = y - 60;
    stain(ctx, lx, ly, 62, GLOW, 0.75);
    ctx.fillStyle = css(GOLD);
    roundRect(ctx, lx - 3.8, ly - 5.5, 7.6, 11, 2);
    ctx.fill();
    ctx.fillStyle = css([255, 252, 236]);
    ctx.fillRect(lx - 1.4, ly - 3, 2.8, 6);
    // the lantern on the water
    stain(ctx, x + 18, y + 28 + hop, 34, GLOW, 0.32);
    // the scarf: each link follows the one before, a little late
    this.scarf[0].x = x - 6;
    this.scarf[0].y = y - 62;
    for (let i = 1; i < this.scarf.length; i++) {
      const p = this.scarf[i];
      const q = this.scarf[i - 1];
      const tx = q.x - 7.5;
      const ty = q.y + 1.2 + 2.6 * Math.sin(this.t * 7 - i * 0.9) - 1.5 * air;
      const fresh = p.x === 0 && p.y === 0;
      const k = Math.min(1, dt * 16);
      p.x = fresh ? tx : lerp(p.x, tx, k);
      p.y = fresh ? ty : lerp(p.y, ty, k);
    }
    ctx.strokeStyle = css(L.accent);
    ctx.lineCap = 'round';
    for (let i = 1; i < this.scarf.length; i++) {
      ctx.lineWidth = 5.6 * (1 - i / (this.scarf.length + 1.5));
      ctx.beginPath();
      ctx.moveTo(this.scarf[i - 1].x, this.scarf[i - 1].y);
      ctx.lineTo(this.scarf[i].x, this.scarf[i].y);
      ctx.stroke();
    }
    // sparks off the lantern while a stretch is being kept
    if (this.streak >= 4 && Math.random() < 0.35) this.sparks.burst(lx, ly, 1, GOLD, 40, { dir: Math.PI, spread: 1.4, span: 0.8, size: 1.8, g: -20, solid: true });
  }
}

