/**
 * The picture of the Noise Floor runs, painted like a watercolour: a slender lighthouse on a rock, a wide
 * sea, a great pale sun going down, and the evening turning into night in a few washes of colour on paper.
 * The noise comes in over the water as blots of ink on the wing, each with its phrase on a slip of paper.
 * Every note played right sends a line of light from the lamp; a phrase played through bursts its
 * carrier. What reaches the lamp dims it. The last thing a full run sends is the Mute: a black disc with a
 * ring of seals, one for every string of the chord it asks for.
 *
 * The picture fills the window; the panels of the game lie over it like sheets of paper, and the game
 * happens in the band they leave free. What does not move (sky, land, sea, tower) is painted once for
 * each hour and kept; what moves is drawn over it every frame.
 *
 * Nothing in here decides anything: the rules are in game/run.ts.
 */
import { LAND_Y, Run, type Boss, type Foe } from '../game/run';
import { L } from '../core/i18n';
import { blot, clamp, cloudShape, css, ease, finish, grain, hash, lerp, mist, mix, noise, painted, pigment, prng, rgb, rough, roundRect, shape, Sparks, Surface, TAU, Tints, wash, type Pt, type RGB } from './scene';

/** An hour of the evening: a handful of colours, and what is in the sky. */
interface Hour {
  paper: RGB;
  /** two colours of the sky, and how much of the paper they cover */
  skyA: RGB;
  skyB: RGB;
  cover: number;
  disc: RGB;
  ring: RGB;
  /** the sun is large and low; the moon is small and high; none in a storm */
  body: 'sun' | 'moon' | 'none';
  far: RGB;
  mid: RGB;
  near: RGB;
  seaA: RGB;
  seaB: RGB;
  /** the bright lines on the water */
  line: RGB;
  /** the darkest colour: rock, ink */
  dark: RGB;
  /** the one strong colour: the band on the tower, the leaves in front */
  accent: RGB;
  stars: number;
  rain: number;
  aurora: number;
  /** the sky is dark: what is written on it has to be light */
  night: boolean;
}

const hour = (c: string[], cover: number, body: Hour['body'], extra: Partial<Hour> = {}): Hour => {
  const [paper, skyA, skyB, disc, ring, far, mid, near, seaA, seaB, line, dark, accent] = c.map(rgb);
  return { paper, skyA, skyB, cover, disc, ring, body, far, mid, near, seaA, seaB, line, dark, accent, stars: 0, rain: 0, aurora: 0, night: false, ...extra };
};

/** Rose evening, amber, teal dusk, indigo night, storm, the darkest hour with its northern lights, and the dawn of a run that was won. */
const HOURS: Hour[] = [
  hour(['#f8efe6', '#f3c3c0', '#f9dccb', '#fffaf2', '#f4a99c', '#e9b7b4', '#d58a92', '#a94f63', '#f4d2c9', '#e0959e', '#fffaf2', '#4a2233', '#c8455a'], 0.5, 'sun'),
  hour(['#f9efdc', '#f6cf98', '#f3b488', '#fff8e6', '#ee9a5c', '#ecc294', '#d98c5f', '#a04f3c', '#f7d9ac', '#e39a6c', '#fffaf0', '#4a2a26', '#b8492f'], 0.6, 'sun'),
  hour(['#eef3ee', '#bfdcd6', '#8fc0be', '#fdfbf4', '#86b8ba', '#9cc3c4', '#5f9aa0', '#2c6676', '#b9d8d4', '#64a0a6', '#f6fbf8', '#173a47', '#e0745c'], 0.72, 'moon', { stars: 0.4 }),
  hour(['#e3e8f3', '#8498c8', '#4d5f9e', '#fbfbf6', '#b3c1e6', '#6a7db4', '#3c4b88', '#212b5e', '#7a8ec0', '#384784', '#eef2ff', '#131a3f', '#f0c26a'], 0.94, 'moon', { stars: 1, night: true }),
  hour(['#e4e2ea', '#9a97b4', '#646180', '#e9e8f0', '#8d8aa8', '#77748f', '#4f4c6c', '#2b2945', '#8a87a4', '#444262', '#f0eff6', '#1c1b30', '#d9c06a'], 0.94, 'none', { rain: 1, night: true }),
  hour(['#dbe9e8', '#2f627c', '#1d4160', '#f4fbf6', '#7fd0c0', '#2f5c74', '#1c4058', '#0f2639', '#30647a', '#153348', '#d9fff0', '#0a1c2c', '#9ff0d0'], 0.96, 'moon', { stars: 1, aurora: 1, night: true }),
  hour(['#fbf3e4', '#fddfa8', '#f7c29e', '#fffdf2', '#f4aa5e', '#dbc4d8', '#b39ac4', '#7a659f', '#fbdfb6', '#eda888', '#ffffff', '#3a2f5a', '#e2543c'], 0.55, 'sun'),
];
export const DAWN = HOURS.length - 1;
export const STORM = 4;

/** The hour a wave is played in: a full run goes from the rose evening to the darkest hour, a short one as far as it gets. */
export function hourOf(wave: number, waves: number): number {
  if (waves >= 6) return Math.min(5, wave - 1);
  if (waves <= 1) return 1;
  return Math.round(((wave - 1) * 3) / (waves - 1));
}

const WHITE: RGB = [255, 255, 255];
const GOLD: RGB = [246, 196, 92];
const GLOW: RGB = [255, 236, 178];
const BAD: RGB = [226, 84, 60];
const PAPER = '#fbf5ea';
const NOW: RGB = [30, 106, 168];
const NOW_NIGHT: RGB = [142, 204, 255];
/** the lanes the noise flies in, by the place the rules gave it; never two in a row on the same one */
const SLOT_X = [430, 770, 210, 1000, 590, 880, 330];
const LANES4 = [1, 3, 0, 2, 1, 3, 0];
const LANES3 = [1, 2, 0, 1, 2, 0, 1];
const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';
const SANS = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';
/** how large the noise is drawn: its shapes are written about forty units wide */
const SIZE = 1.9;

interface Geo {
  W: number;
  H: number;
  /** the band where the game happens */
  bt: number;
  bb: number;
  bh: number;
  /** the horizon */
  hz: number;
  /** the lamp, and the foot of the tower */
  lx: number;
  ly: number;
  foot: number;
  /** the sun or moon */
  dx: number;
  dy: number;
  dr: number;
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

export class Watch {
  private readonly s: Surface;
  private readonly tints = new Tints();
  private readonly paper = grain();
  private readonly settled = pigment();
  private readonly clouds = [3, 8, 14].map((seed) => cloudShape(seed));
  private readonly sparks = new Sparks();
  private readonly coast = noise(11);
  private readonly cliff = noise(23);
  /** the element the game happens in front of: the picture keeps its action inside it */
  over: Element | null = null;
  private back: HTMLCanvasElement | null = null;
  private backHour = -1;
  private old: HTMLCanvasElement | null = null;
  private fade = 1;
  private bolts: { x: number; y: number; t: number; seed: number; wide: number }[] = [];
  private rings: { x: number; y: number; t: number; c: RGB; size: number }[] = [];
  private texts: { x: number; y: number; t: number; text: string }[] = [];
  private readonly pos = new Map<string, { x: number; y: number }>();
  private readonly struck = new Map<string, number>();
  private readonly sealBroken = new Map<number, number>();
  private sealFailed: { i: number; t: number } | null = null;
  private t = 0;
  private last = 0;
  private shown: number;
  private wanted: number;
  private shake = 0;
  private flash = 0;
  /** the lamp flickers after a blow */
  private blow = 0;
  private beam = -0.1;
  private nextFlash = 4;
  private strike: { x: number; t: number; seed: number } | null = null;
  /** 0 while the run goes on; counts up when it is over: the lamp fails, or the day breaks */
  private ending = 0;
  private won = false;

  constructor(canvas: HTMLCanvasElement, at = 0) {
    this.s = new Surface(canvas);
    this.shown = this.wanted = clamp(Math.round(at), 0, HOURS.length - 1);
  }

  /** The hour the picture turns to. */
  aim(at: number): void {
    this.wanted = clamp(Math.round(at), 0, HOURS.length - 1);
  }

  private geo(): Geo {
    const { w: W, h: H, band } = this.s;
    const bt = band.top;
    const bb = band.bottom;
    const bh = bb - bt;
    const hz = Math.round(bb - clamp(bh * 0.25, 46, 96));
    const lx = clamp(W * 0.125, 104, 230);
    const foot = hz + 3;
    const tall = Math.min(clamp(bh * 0.66, 110, 270), foot - bt - 54);
    const body = HOURS[this.wanted].body;
    const dr = body === 'moon' ? clamp(bh * 0.085, 15, 30) : clamp(bh * 0.4, 72, 170);
    const dx = W * (body === 'moon' ? 0.6 : 0.68);
    const dy = body === 'moon' ? bt + bh * 0.2 : hz - dr * 0.34;
    return { W, H, bt, bb, bh, hz, lx, ly: foot - tall, foot, dx, dy, dr };
  }

  /** Where a piece of noise is in the picture. */
  private place(f: Foe, g: Geo): { x: number; y: number } {
    const p = f.y / LAND_Y;
    const slot = Math.max(0, SLOT_X.indexOf(f.x));
    const lanes = g.bh > 280 ? 4 : 3;
    const lane = (lanes === 4 ? LANES4 : LANES3)[slot];
    const top = g.bt + 58;
    const bottom = Math.max(top + 30, g.hz - 54);
    const seed = hash(Number(f.id.replace(/\D/g, '')) || 1, 3) * TAU;
    let y = lerp(top, bottom, lane / (lanes - 1)) + 5 * Math.sin(this.t * 1.3 + seed);
    // on the last stretch they all make for the lamp
    y = lerp(y, g.ly + 4, ease((p - 0.72) / 0.28));
    return { x: lerp(g.W + 70, g.lx + 44, p), y };
  }

  // ───────────────────────── what happened, said by the screen

  hit(id: string): void {
    const p = this.pos.get(id);
    if (!p) return;
    this.struck.set(id, this.t);
    this.bolts.push({ x: p.x, y: p.y, t: this.t, seed: (this.t * 1000) | 0, wide: 1 });
    this.sparks.burst(p.x, p.y, 14, GOLD, 150, { span: 0.5, size: 2.2, solid: true });
  }

  cleared(id: string, text: string): void {
    const p = this.pos.get(id);
    if (!p) return;
    const h = HOURS[this.shown];
    this.sparks.burst(p.x, p.y, 34, GOLD, 240, { span: 0.9, size: 2.8, solid: true });
    this.sparks.burst(p.x, p.y, 26, h.dark, 150, { span: 1.1, size: 4.6, g: 90, solid: true });
    this.sparks.burst(p.x, p.y, 12, h.accent, 110, { span: 1.4, size: 3, g: 40, solid: true });
    this.rings.push({ x: p.x, y: p.y, t: this.t, c: GOLD, size: 96 });
    this.texts.push({ x: p.x, y: p.y - 18, t: this.t, text });
    this.shake = Math.max(this.shake, 3);
    this.pos.delete(id);
  }

  missed(): void {
    const g = this.geo();
    this.blow = Math.max(this.blow, 0.25);
    this.sparks.burst(g.lx, g.ly, 8, BAD, 80, { span: 0.4, size: 2, solid: true });
  }

  landed(id: string): void {
    const g = this.geo();
    const h = HOURS[this.shown];
    this.blow = 1.2;
    this.shake = 9;
    this.flash = Math.max(this.flash, 0.45);
    this.sparks.burst(g.lx, g.ly, 40, h.dark, 240, { span: 1, size: 5, g: 120, solid: true });
    this.sparks.burst(g.lx, g.ly, 26, BAD, 200, { span: 0.9, size: 2.6, solid: true });
    this.rings.push({ x: g.lx, y: g.ly, t: this.t, c: BAD, size: 130 });
    this.pos.delete(id);
  }

  /** A seal of the Mute broke, or held. */
  seal(i: number, broke: boolean): void {
    if (broke) {
      this.sealBroken.set(i, this.t);
      this.shake = Math.max(this.shake, 5);
      this.flash = Math.max(this.flash, 0.3);
    } else this.sealFailed = { i, t: this.t };
  }

  /** The run is over: the day breaks, or the lamp goes out. */
  end(won: boolean): void {
    if (this.ending) return;
    this.ending = 0.0001;
    this.won = won;
    if (won) this.wanted = DAWN;
  }

  // ───────────────────────── what does not move, painted once for an hour

  private paint(h: Hour, g: Geo, seed: number): HTMLCanvasElement {
    return painted(g.W, g.H, this.s.px, (ctx) => {
      const r = prng(seed);
      const { W, H, bt, bh, hz } = g;
      ctx.fillStyle = css(h.paper);
      ctx.fillRect(0, 0, W, H);

      // the sky: two washes that leave some paper, lighter toward the horizon
      wash(ctx, [[-60, -60], [W + 60, -60], [W + 60, hz + 4], [-60, hz + 4]], h.skyB, h.cover, 26, r, 14);
      blot(ctx, W * 0.22, bt + bh * 0.05, W * 0.52, bh * 0.5, h.skyA, h.cover * 0.8, 34, r);
      blot(ctx, W * 0.86, bt - bh * 0.05, W * 0.34, bh * 0.42, h.skyA, h.cover * 0.55, 30, r);
      blot(ctx, W * 0.55, hz - bh * 0.03, W * 0.7, bh * 0.2, mix(h.paper, h.skyA, 0.25), h.night ? 0.3 : 0.6, 22, r);

      if (h.aurora) {
        // curtains of light: tall, narrow, swaying, thinning out toward their lower edge
        for (let k = 0; k < 14; k++) {
          const x = W * (0.16 + 0.8 * r());
          const top = bt - 10 + bh * 0.16 * r();
          const tall = (hz - bt) * (0.45 + 0.4 * r());
          const lean = (r() - 0.5) * 90;
          const bend = 10 + 16 * r();
          const turn = r() * 6;
          const left: Pt[] = [];
          const right: Pt[] = [];
          for (let i = 0; i <= 8; i++) {
            const u = i / 8;
            const cx = x + lean * u + bend * Math.sin(u * 4 + turn);
            const half = 5 + 13 * Math.sin(Math.PI * Math.min(1, u * 1.15));
            left.push([cx - half, top + tall * u]);
            right.push([cx + half, top + tall * u]);
          }
          wash(ctx, [...left, ...right.reverse()], k % 4 === 3 ? [199, 179, 239] : h.accent, 0.2 + 0.14 * r(), 9, r, 10);
        }
        mist(ctx, 0, W, bt + (hz - bt) * 0.45, hz, h.skyB, 0.55);
      }
      if (h.stars) {
        for (let i = 0; i < 150; i++) {
          const x = r() * W;
          const y = r() * r() * (hz - 20);
          const big = r() > 0.93;
          ctx.fillStyle = css(h.disc, h.stars * (0.35 + 0.65 * r()));
          ctx.beginPath();
          ctx.arc(x, y, big ? 1.5 : 0.5 + r() * 0.6, 0, TAU);
          ctx.fill();
          if (big) {
            ctx.strokeStyle = css(h.disc, 0.5 * h.stars);
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(x - 5, y);
            ctx.lineTo(x + 5, y);
            ctx.moveTo(x, y - 5);
            ctx.lineTo(x, y + 5);
            ctx.stroke();
          }
        }
        // a few stars joined by a thin line, as on an old chart
        ctx.strokeStyle = css(h.disc, 0.32 * h.stars);
        ctx.lineWidth = 0.7;
        for (let k = 0; k < 3; k++) {
          let x = W * (0.3 + 0.2 * k + 0.1 * r());
          let y = bt + bh * (0.08 + 0.16 * r());
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let i = 0; i < 4; i++) {
            x += 24 + 40 * r();
            y += (r() - 0.5) * 60;
            ctx.lineTo(x, y);
            ctx.save();
            ctx.fillStyle = css(h.disc, 0.9 * h.stars);
            ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
            ctx.restore();
          }
          ctx.stroke();
        }
      }

      // sun or moon: a disc of bare paper, with a ring where the colour gathered round it
      if (h.body !== 'none') {
        blot(ctx, g.dx, g.dy, g.dr * 1.55, g.dr * 1.55, h.ring, h.body === 'sun' ? 0.42 : 0.3, g.dr * 0.16, r);
        const rim: Pt[] = [];
        for (let i = 0; i < 48; i++) rim.push([g.dx + Math.cos((i / 48) * TAU) * g.dr, g.dy + Math.sin((i / 48) * TAU) * g.dr]);
        ctx.fillStyle = css(h.disc);
        shape(ctx, rough(rim, 1, 1.2, r));
        ctx.fill();
        if (h.body === 'moon') {
          ctx.fillStyle = css(mix(h.disc, h.skyA, 0.3), 0.6);
          for (const [ax, ay, ar] of [[-0.3, -0.25, 0.26], [0.3, 0.2, 0.2], [-0.1, 0.42, 0.15]]) {
            ctx.beginPath();
            ctx.arc(g.dx + ax * g.dr, g.dy + ay * g.dr, ar * g.dr, 0, TAU);
            ctx.fill();
          }
        }
      }

      // land: far and pale, nearer and fuller, and a dark headland at the edge, each standing in mist
      const ridge = (x0: number, x1: number, tall: number, n: (x: number) => number, freq: number, lift: (k: number) => number): Pt[] => {
        const pts: Pt[] = [[x0, hz + 3]];
        for (let x = x0; x <= x1; x += 14) pts.push([x, hz + 3 - tall * Math.max(0, 0.5 + 0.5 * n(x * freq)) * lift((x - x0) / (x1 - x0))]);
        pts.push([x1, hz + 3]);
        return pts;
      };
      const hump = (k: number): number => Math.sin(Math.PI * clamp(k)) ** 0.7;
      wash(ctx, ridge(W * 0.34, W * 1.05, bh * 0.2, this.coast, 0.006, hump), h.far, 0.8, 5, r, 10);
      wash(ctx, ridge(-40, W * 0.3, bh * 0.1, this.coast, 0.009, hump), h.far, 0.7, 4, r, 10);
      mist(ctx, 0, W, hz - bh * 0.16, hz + 3, mix(h.paper, h.seaA, 0.4), 0.7);
      wash(ctx, ridge(W * 0.6, W * 1.08, bh * 0.3, this.cliff, 0.0075, (k) => ease(k * 1.6)), h.mid, 0.9, 4, r, 10);
      mist(ctx, W * 0.55, W, hz - bh * 0.1, hz + 3, mix(h.paper, h.seaA, 0.4), 0.55);
      // needles of rock standing in the sea, their feet lost in the mist
      for (const [fx, tallness, wide, c] of [
        [0.33, 0.5, 15, mix(h.far, h.paper, 0.25)],
        [0.385, 0.32, 10, mix(h.far, h.paper, 0.35)],
        [0.47, 0.66, 19, h.far],
        [0.535, 0.4, 12, mix(h.far, h.mid, 0.4)],
        [0.9, 0.86, 24, h.mid],
      ] as [number, number, number, RGB][]) {
        const x = W * fx;
        const top = hz - bh * tallness;
        const stack: Pt[] = [[x - wide, hz + 3]];
        for (let i = 0; i <= 10; i++) {
          const u = i / 10;
          stack.push([x - wide * (1 - 0.72 * u) + 2.4 * (r() - 0.5), lerp(hz + 3, top, u)]);
        }
        stack.push([x + wide * 0.1, top - 5], [x + wide * 0.34, top + 3]);
        for (let i = 10; i >= 0; i--) {
          const u = i / 10;
          stack.push([x + wide * (1 - 0.6 * u) + 2.4 * (r() - 0.5), lerp(hz + 3, top + 4, u)]);
        }
        ctx.fillStyle = css(c);
        shape(ctx, stack);
        ctx.fill();
        // a lit edge, and the mist at its foot
        ctx.strokeStyle = css(h.paper, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - wide * 0.3, top + 2);
        ctx.lineTo(x - wide * 0.92, hz - bh * tallness * 0.12);
        ctx.stroke();
        mist(ctx, x - wide * 2, x + wide * 2, hz - bh * tallness * 0.42, hz + 3, mix(h.paper, h.seaA, 0.35), 0.92);
      }
      ctx.fillStyle = css(h.near);
      shape(ctx, ridge(W * 0.83, W + 40, bh * 0.44, this.cliff, 0.011, (k) => ease(k * 1.3)));
      ctx.fill();

      // the sea: a flat wash, bands of a second colour laid across it, deeper toward the front
      ctx.fillStyle = css(mix(h.seaA, h.paper, 0.2));
      ctx.fillRect(0, hz + 2, W, H - hz);
      const depth = H - hz;
      for (let k = 0; k < 9; k++) {
        const y = hz + 8 + depth * (0.04 + 0.11 * k) + 6 * r();
        blot(ctx, W * (0.2 + 0.6 * r()), y, W * (0.5 + 0.3 * r()), 7 + 3.4 * k, mix(h.seaB, h.near, k / 16), 0.34 + 0.03 * k, 9, r, 10);
      }
      blot(ctx, W * 0.5, H + 20, W * 0.8, depth * 0.4, h.near, 0.5, 26, r);
      // the light of sun or moon lying on the water in broken strokes
      if (h.body !== 'none') {
        ctx.strokeStyle = css(h.line, 0.9);
        ctx.lineCap = 'round';
        for (let i = 0; i < 46; i++) {
          const k = Math.pow(r(), 1.4);
          const y = hz + 5 + k * depth * 0.9;
          const wide = (h.body === 'sun' ? 0.5 : 1.4) * g.dr * (0.25 + 0.75 * k) * (0.4 + r());
          const x = g.dx + (r() - 0.5) * (h.body === 'sun' ? 1 : 3) * g.dr * (0.4 + k);
          ctx.globalAlpha = 0.5 + 0.5 * r();
          ctx.lineWidth = 1 + 1.8 * k;
          ctx.beginPath();
          ctx.moveTo(x - wide / 2, y);
          ctx.lineTo(x + wide / 2, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      this.tower(ctx, g, h, r);
      this.rocks(ctx, g, h, r);
    });
  }

  /** The rock in the sea and the tower on it: clean shapes, a few fine lines. */
  private tower(ctx: CanvasRenderingContext2D, g: Geo, h: Hour, r: () => number): void {
    const { lx, ly, foot, hz } = g;
    const k = clamp((foot - ly) / 190, 0.6, 1.3);
    // the rock: a dark back out of the water, with the light catching its top
    const rock: Pt[] = [[lx - 132 * k, hz + 14]];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const x = lerp(lx - 124 * k, lx + 150 * k, u);
      const d = Math.abs(x - lx) / (140 * k);
      const top = Math.abs(x - lx) < 30 * k ? foot : hz + 12 - (hz + 12 - foot) * Math.pow(Math.max(0, 1 - d * d), 0.75) * (0.84 + 0.2 * r());
      rock.push([x, top]);
    }
    rock.push([lx + 158 * k, hz + 14]);
    ctx.fillStyle = css(h.dark);
    shape(ctx, rock);
    ctx.fill();
    ctx.strokeStyle = css(mix(h.dark, h.paper, 0.45), 0.8);
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      // hatching along the slope
      const x = lx - 110 * k + r() * 240 * k;
      const y = hz + 4 + r() * 8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 10 + 16 * r(), y - 3 - 4 * r());
      ctx.stroke();
    }
    // white water at its foot
    ctx.strokeStyle = css(h.line, 0.85);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = lx - 150 * k + i * 38 * k + 10 * r();
      ctx.beginPath();
      ctx.moveTo(x, hz + 15 + 2 * r());
      ctx.lineTo(x + 18 + 14 * r(), hz + 15 + 2 * r());
      ctx.stroke();
    }
    // the tower: tall and slender, paper white, one band of the strong colour
    const top = ly + 22 * k;
    const half = (y: number): number => lerp(8.5, 15, (y - top) / (foot - top)) * k;
    ctx.fillStyle = css(mix(h.disc, h.skyA, h.night ? 0.25 : 0.06));
    shape(ctx, [[lx - half(foot), foot], [lx - half(top), top], [lx + half(top), top], [lx + half(foot), foot]]);
    ctx.fill();
    // its shaded side
    ctx.fillStyle = css(mix(h.mid, h.dark, 0.3), 0.3);
    shape(ctx, [[lx + half(foot) * 0.25, foot], [lx + half(top) * 0.25, top], [lx + half(top), top], [lx + half(foot), foot]]);
    ctx.fill();
    for (const [a, b] of [[0.16, 0.3], [0.56, 0.7]]) {
      const y0 = lerp(top, foot, a);
      const y1 = lerp(top, foot, b);
      ctx.fillStyle = css(h.accent);
      shape(ctx, [[lx - half(y0), y0], [lx + half(y0), y0], [lx + half(y1), y1], [lx - half(y1), y1]]);
      ctx.fill();
    }
    ctx.fillStyle = css(h.dark);
    ctx.fillRect(lx - 3 * k, foot - 13 * k, 6 * k, 13 * k);
    // the gallery and its rail, the lantern room, the cap
    ctx.fillRect(lx - 15 * k, top - 3 * k, 30 * k, 3.4 * k);
    ctx.strokeStyle = css(h.dark);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx - 15 * k, top - 3 * k);
    ctx.lineTo(lx - 15 * k, top - 10 * k);
    ctx.lineTo(lx + 15 * k, top - 10 * k);
    ctx.lineTo(lx + 15 * k, top - 3 * k);
    for (const x of [-9, -3, 3, 9]) {
      ctx.moveTo(lx + x * k, top - 3 * k);
      ctx.lineTo(lx + x * k, top - 10 * k);
    }
    ctx.stroke();
    ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    for (const x of [-8, 0, 8]) {
      ctx.moveTo(lx + x * k, top - 3 * k);
      ctx.lineTo(lx + x * k, ly - 12 * k);
    }
    ctx.stroke();
    shape(ctx, [[lx - 12 * k, ly - 11 * k], [lx, ly - 25 * k], [lx + 12 * k, ly - 11 * k]]);
    ctx.fillStyle = css(h.dark);
    ctx.fill();
    ctx.fillRect(lx - 0.7, ly - 33 * k, 1.4, 9 * k);
  }

  /** Dark rocks in the front corners, the way a painter frames a view. */
  private rocks(ctx: CanvasRenderingContext2D, g: Geo, h: Hour, r: () => number): void {
    const { W, H, bb } = g;
    const boulder = (x0: number, x1: number, top: number, c: RGB): void => {
      const pts: Pt[] = [[x0, H + 10]];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        pts.push([lerp(x0, x1, u), top + (H - top) * (1 - Math.pow(Math.sin(Math.PI * u), 0.55)) * 0.9 + 5 * r()]);
      }
      pts.push([x1, H + 10]);
      ctx.fillStyle = css(c);
      shape(ctx, pts);
      ctx.fill();
      // fine hatching where the light falls
      ctx.strokeStyle = css(mix(c, h.paper, 0.4), 0.7);
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 26; i++) {
        const u = 0.12 + 0.6 * r();
        const x = lerp(x0, x1, u);
        const y = top + (H - top) * (1 - Math.pow(Math.sin(Math.PI * u), 0.55)) * 0.9 + 6 + 30 * r();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 12 + 14 * r(), y - 4 - 5 * r());
        ctx.stroke();
      }
    };
    boulder(-80, W * 0.12 + 60, bb - 36, mix(h.dark, h.near, 0.25));
    boulder(-140, W * 0.05 + 40, bb - 4, h.dark);
    boulder(W * 0.86 - 40, W + 110, bb - 52, mix(h.dark, h.near, 0.2));
    boulder(W * 0.95 - 30, W + 150, bb - 16, h.dark);
  }

  // ───────────────────────── drawing

  /**
   * One frame. ts is a clock in seconds; moving says whether time passes in the game (it stands still in
   * a pause, while the picture goes on breathing).
   */
  draw(run: Run | null, ts: number, moving = true): void {
    const dt = this.last ? Math.min(0.1, Math.max(0, ts - this.last)) : 0;
    this.last = ts;
    this.t += dt;
    const resized = this.s.fit(this.over);
    const g = this.geo();
    if (this.ending) this.ending += dt;
    if (resized || !this.back || this.backHour !== this.wanted) {
      // a new hour is painted and shown through the old one; a new size is painted afresh
      this.old = resized || !this.back ? null : this.back;
      this.back = this.paint(HOURS[this.wanted], g, 100 + this.wanted);
      this.backHour = this.wanted;
      this.fade = this.old ? 0 : 1;
    }
    this.fade = Math.min(1, this.fade + dt / (this.ending ? 1.8 : 3));
    if (this.fade >= 1) {
      this.old = null;
      this.shown = this.wanted;
    }
    this.shake *= Math.exp(-dt * 7);
    this.flash *= Math.exp(-dt * 5);
    this.blow = Math.max(0, this.blow - dt);
    this.sparks.step(dt);
    const h = HOURS[this.fade > 0.5 ? this.wanted : this.shown];
    const ink = h.night ? h.paper : h.dark;
    const lock = h.night ? NOW_NIGHT : NOW;
    const sx = this.shake > 0.2 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0.2 ? (Math.random() - 0.5) * this.shake : 0;
    const ctx = this.s.begin(sx, sy);
    if (this.old) ctx.drawImage(this.old, -4, -4, g.W + 8, g.H + 8);
    ctx.globalAlpha = this.old ? ease(this.fade) : 1;
    ctx.drawImage(this.back, -4, -4, g.W + 8, g.H + 8);
    ctx.globalAlpha = 1;

    // clouds: pale washes going by, slowly
    for (let i = 0; i < 4; i++) {
      const size = 0.55 + 0.5 * hash(i, 31);
      const w = 560 * size;
      const x = ((((hash(i, 32) - this.t * (0.003 + 0.004 * hash(i, 33))) % 1) + 1) % 1) * (g.W + w) - w;
      ctx.globalAlpha = (h.night ? 0.2 : 0.55) * (0.6 + 0.4 * hash(i, 34));
      ctx.drawImage(this.tints.get(this.clouds[i % 3], `c${i % 3}`, mix(h.paper, h.skyA, h.night ? 0.5 : 0.1)), x, g.bt + g.bh * (0.02 + 0.3 * hash(i, 35)) - 60 * size, w, 170 * size);
    }
    ctx.globalAlpha = 1;
    this.weather(ctx, g, h, dt, false);
    if (!h.rain) {
      ctx.strokeStyle = css(h.night ? h.paper : h.dark, 0.7);
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const u = (hash(i, 81) + this.t * (0.006 + 0.004 * hash(i, 82))) % 1;
        const x = g.W * (0.3 + 0.6 * u);
        const y = g.bt + g.bh * (0.14 + 0.3 * hash(i, 83)) + 10 * Math.sin(this.t * 0.4 + i * 2);
        const flap = 3.4 * Math.sin(this.t * (2.2 + hash(i, 84)) + i);
        const size = 0.7 + 0.6 * hash(i, 85);
        ctx.beginPath();
        ctx.moveTo(x - 8 * size, y - flap);
        ctx.quadraticCurveTo(x - 3 * size, y - 2 - flap * 0.3, x, y);
        ctx.quadraticCurveTo(x + 3 * size, y - 2 - flap * 0.3, x + 8 * size, y - flap);
        ctx.stroke();
      }
    }

    // the water never lies still: strokes of light that come and go
    ctx.lineCap = 'round';
    const depth = g.H - g.hz;
    for (let i = 0; i < 70; i++) {
      const k = Math.pow(hash(i, 41), 1.5);
      const tw = Math.sin(this.t * (0.5 + 1.4 * hash(i, 42)) + i * 1.7);
      if (tw < 0.1) continue;
      const x = ((hash(i, 43) + this.t * 0.004 * (1 + k)) % 1) * (g.W + 80) - 40;
      ctx.strokeStyle = css(h.line, (0.2 + 0.5 * k) * tw);
      ctx.lineWidth = 0.8 + 1.4 * k;
      ctx.beginPath();
      ctx.moveTo(x, g.hz + 6 + k * depth * 0.95);
      ctx.lineTo(x + 10 + 50 * k, g.hz + 6 + k * depth * 0.95);
      ctx.stroke();
    }

    const boss = run?.state === 'boss' || (run?.boss && this.ending) ? run.boss : null;
    if (boss) this.mute(ctx, g, boss, h, ink, lock);

    // where the lamp looks: at the piece being played, at the seal that is due, or slowly round
    const locked = run?.state === 'playing' ? run.locked() : null;
    let look: { x: number; y: number } | null = null;
    if (locked) look = this.place(locked, g);
    else if (boss && !this.ending) look = this.sealAt(g, boss, Math.min(boss.at, boss.steps.length - 1));
    const lampOn = !(this.ending && !this.won);
    const power = run ? 0.5 + 0.5 * (run.integrity / run.maxIntegrity) : 1;
    const flick = this.blow > 0 ? 0.55 + 0.45 * Math.sin(this.t * 70) * Math.sin(this.t * 23) : 1;
    const lamp = lampOn ? power * flick : Math.max(0, 1 - this.ending * 1.5) * 0.6;
    if (look) {
      const want = Math.atan2(look.y - g.ly, look.x - g.lx);
      this.beam += (want - this.beam) * Math.min(1, dt * 7);
    } else this.beam += (-0.14 + 0.1 * Math.sin(this.t * 0.5) - this.beam) * Math.min(1, dt * 2);
    this.light(ctx, g, h, lamp, look);

    if (run && run.state === 'playing') {
      const foes = run.foes.slice().sort((a, b) => (a === locked ? 1 : 0) - (b === locked ? 1 : 0) || a.y - b.y);
      const seen = new Set<string>();
      for (const f of foes) {
        const p = this.place(f, g);
        seen.add(f.id);
        this.pos.set(f.id, p);
        if (p.x < g.W + 60) this.foe(ctx, f, p, f === locked, h, ink, lock, moving);
      }
      for (const id of this.struck.keys()) if (!seen.has(id)) this.struck.delete(id);
    }

    // lines of light, rings, sparks, words
    this.bolts = this.bolts.filter((b) => this.t - b.t < 0.3);
    for (const b of this.bolts) this.ray(ctx, g.lx, g.ly, b.x, b.y, b.seed, 1 - (this.t - b.t) / 0.3, b.wide);
    this.rings = this.rings.filter((r) => this.t - r.t < 0.7);
    for (const r of this.rings) {
      const k = (this.t - r.t) / 0.7;
      ctx.strokeStyle = css(r.c, 0.9 * (1 - k));
      ctx.lineWidth = 4 * (1 - k) + 0.6;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 10 + ease(k) * r.size, 0, TAU);
      ctx.stroke();
    }
    this.sparks.draw(ctx);
    this.texts = this.texts.filter((x) => this.t - x.t < 1.1);
    ctx.textAlign = 'center';
    ctx.font = `700 15px ${MONO}`;
    for (const x of this.texts) {
      const k = (this.t - x.t) / 1.1;
      ctx.fillStyle = css(ink, 1 - k);
      ctx.fillText(x.text, x.x, x.y - k * 30);
    }

    this.leaves(ctx, g, h);
    this.weather(ctx, g, h, dt, true);
    if (this.flash > 0.01) {
      ctx.fillStyle = css(WHITE, this.flash * 0.55);
      ctx.fillRect(-20, -20, g.W + 40, g.H + 40);
    }
    if (this.ending && !this.won) {
      ctx.fillStyle = css(h.dark, Math.min(0.5, this.ending * 0.4));
      ctx.fillRect(-20, -20, g.W + 40, g.H + 40);
    }
    // bare paper at the top, where the score is written
    mist(ctx, -20, g.W + 20, g.bt + 14, -10, h.paper, 0.96);
    finish(this.s, this.paper, this.settled);
  }

  /** Rain and far lightning in a storm; petals on the wind otherwise. */
  private weather(ctx: CanvasRenderingContext2D, g: Geo, h: Hour, dt: number, front: boolean): void {
    if (!front) {
      if (h.rain < 0.3) return;
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.nextFlash = 4 + Math.random() * 7;
        this.strike = { x: g.W * (0.4 + Math.random() * 0.5), t: this.t, seed: (Math.random() * 1e6) | 0 };
        this.flash = Math.max(this.flash, 0.22);
      }
      if (this.strike && this.t - this.strike.t < 0.4) this.ray(ctx, this.strike.x, g.bt - 20, this.strike.x + 70 * (hash(this.strike.seed) - 0.5), g.hz - 4, this.strike.seed, 1 - (this.t - this.strike.t) / 0.4, 0.8, h.disc);
      return;
    }
    if (h.rain > 0.05) {
      ctx.strokeStyle = css(h.paper, 0.4);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 0; i < 130; i++) {
        const x = ((hash(i, 51) * 1.3 - this.t * 0.16 * (0.8 + hash(i, 52))) % 1.3) * g.W;
        const y = ((hash(i, 53) + this.t * (1.3 + 0.8 * hash(i, 54))) % 1) * g.H;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 16 + 10 * hash(i, 55));
      }
      ctx.stroke();
      return;
    }
    // petals, or whatever the wind has picked up, drifting in from the sea
    for (let i = 0; i < 16; i++) {
      const x = g.W * (1.1 - (((hash(i, 61) + this.t * (0.012 + 0.014 * hash(i, 62))) % 1) * 1.2));
      const y = g.bt + g.bh * (0.1 + 0.9 * hash(i, 63)) + 18 * Math.sin(this.t * (0.6 + hash(i, 64)) + i);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.t * (0.8 + hash(i, 65)) + i);
      ctx.fillStyle = css(i % 3 ? h.accent : h.disc, 0.75);
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 1.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /** The lamp and its beam: warm light laid over the picture. */
  private light(ctx: CanvasRenderingContext2D, g: Geo, h: Hour, lamp: number, look: { x: number; y: number } | null): void {
    if (lamp > 0.02) {
      const reach = look ? Math.hypot(look.x - g.lx, look.y - g.ly) + 100 : g.W * 0.7;
      for (const [dir, strength] of [
        [this.beam, 1],
        [this.beam + Math.PI, 0.5],
      ]) {
        const len = dir === this.beam ? reach : g.lx + 90;
        const ex = g.lx + Math.cos(dir) * len;
        const ey = g.ly + Math.sin(dir) * len;
        const nx = -Math.sin(dir);
        const ny = Math.cos(dir);
        const wide = 20 + len * 0.05;
        const grad = ctx.createLinearGradient(g.lx, g.ly, ex, ey);
        grad.addColorStop(0, css(GLOW, (h.night ? 0.5 : 0.75) * lamp * strength));
        grad.addColorStop(0.55, css(GLOW, (h.night ? 0.2 : 0.34) * lamp * strength));
        grad.addColorStop(1, css(GLOW, 0));
        ctx.fillStyle = grad;
        shape(ctx, [[g.lx + nx * 3, g.ly + ny * 3], [ex + nx * wide, ey + ny * wide], [ex - nx * wide, ey - ny * wide], [g.lx - nx * 3, g.ly - ny * 3]]);
        ctx.fill();
      }
      stain(ctx, g.lx, g.ly, 110, GOLD, 0.34 * lamp);
      stain(ctx, g.lx, g.ly, 34, GLOW, 0.95 * lamp);
      stain(ctx, g.lx + 12, g.hz + 26, 80, GLOW, 0.22 * lamp);
    }
    ctx.fillStyle = css(mix(h.dark, [255, 252, 238], clamp(lamp * 1.4)));
    ctx.beginPath();
    ctx.arc(g.lx, g.ly, 5, 0, TAU);
    ctx.fill();
  }

  /** A line of light from the lamp: gold, a little crooked, with a pale heart. */
  private ray(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number, a: number, wide: number, c: RGB = GOLD): void {
    if (a <= 0) return;
    const r = prng(seed);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(3, Math.round(len / 60));
    const nx = -(y1 - y0) / (len || 1);
    const ny = (x1 - x0) / (len || 1);
    const pts: Pt[] = [[x0, y0]];
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const off = (r() - 0.5) * Math.min(18, len * 0.06) * Math.sin(Math.PI * u) * 2;
      pts.push([lerp(x0, x1, u) + nx * off, lerp(y0, y1, u) + ny * off]);
    }
    pts.push([x1, y1]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, al, col] of [
      [12 * wide, 0.22 * a, c],
      [4.5 * wide, 0.85 * a, c],
      [1.6 * wide, a, [255, 253, 240] as RGB],
    ] as [number, number, RGB][]) {
      ctx.strokeStyle = css(col, al);
      ctx.lineWidth = w;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }

  /** Plants on the rocks in front, moving in the wind: thin stems, a few leaves of the strong colour. */
  private leaves(ctx: CanvasRenderingContext2D, g: Geo, h: Hour): void {
    ctx.lineCap = 'round';
    const plant = (x: number, y: number, tall: number, i: number): void => {
      const sway = 5 * Math.sin(this.t * 1.1 + i * 1.9) + 2 * Math.sin(this.t * 2.3 + i);
      const tipX = x + (hash(i, 71) - 0.5) * 22 + sway;
      const tipY = y - tall;
      ctx.strokeStyle = css(h.dark, 0.9);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sway * 0.2, y - tall * 0.6, tipX, tipY);
      ctx.stroke();
      const n = 2 + Math.floor(hash(i, 72) * 3);
      for (let k = 0; k < n; k++) {
        const u = 0.45 + (0.55 * (k + 1)) / n;
        const px = lerp(x, tipX, u * u);
        const py = lerp(y, tipY, u);
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(side * (0.9 + 0.2 * Math.sin(this.t * 1.5 + i + k)) - 0.2);
          ctx.fillStyle = css(k % 2 ? h.accent : mix(h.accent, h.paper, 0.3));
          ctx.beginPath();
          ctx.ellipse(0, -6, 2.6, 6.5, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
    };
    for (let i = 0; i < 6; i++) plant(g.W * 0.015 + i * 21 + 12 * hash(i, 73), g.bb - 20 + 14 * hash(i, 74), 34 + 50 * hash(i, 75), i);
    for (let i = 0; i < 7; i++) plant(g.W * 0.9 + i * 19 + 10 * hash(i, 76), g.bb - 36 + 18 * hash(i, 77), 30 + 56 * hash(i, 78), i + 10);
  }

  /** One piece of noise with its slip of paper: a blot of ink with a life of its own. */
  private foe(ctx: CanvasRenderingContext2D, f: Foe, p: { x: number; y: number }, locked: boolean, h: Hour, ink: RGB, lock: RGB, moving: boolean): void {
    const since = this.t - (this.struck.get(f.id) ?? -9);
    const flash = clamp(1 - since / 0.16);
    const x = p.x + 9 * clamp(1 - since / 0.2);
    const y = p.y;
    const body = mix(h.dark, GOLD, flash * 0.8);
    const shade = mix(body, h.near, 0.55);
    const core = locked ? lock : h.accent;
    const tt = moving ? this.t : this.t * 0.25;
    const seed = Number(f.id.replace(/\D/g, '')) || 1;

    // the ink has bled a little into the wet sky around it
    stain(ctx, x, y, 62, h.dark, h.night ? 0.3 : 0.2);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(SIZE, SIZE);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (f.shape === 0) {
      // a thing on long wings, with a whip of a tail
      const flap = Math.sin(tt * 7 + seed);
      ctx.strokeStyle = css(body);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(14, 1);
      for (let i = 1; i <= 9; i++) ctx.lineTo(14 + i * 5.5, 1 + Math.sin(tt * 6 - i * 0.7 + seed) * (1 + i * 0.6));
      ctx.stroke();
      for (const [side, c] of [
        [-0.75, shade],
        [1, body],
      ] as [number, RGB][]) {
        ctx.fillStyle = css(c);
        ctx.beginPath();
        ctx.moveTo(-16, 1);
        ctx.quadraticCurveTo(-6, -6 - 18 * flap * side, 12, -4 - 24 * flap * side);
        ctx.quadraticCurveTo(15, -3 - 12 * flap * side, 22, -1 - 15 * flap * side);
        ctx.quadraticCurveTo(10, 0, 16, 3);
        ctx.quadraticCurveTo(0, 7, -16, 1);
        ctx.fill();
      }
      ctx.fillStyle = css(body);
      ctx.beginPath();
      ctx.moveTo(-25, 2.5);
      ctx.quadraticCurveTo(-18, -3.5, -9, -2);
      ctx.quadraticCurveTo(-12, 4.5, -25, 2.5);
      ctx.fill();
      ctx.fillStyle = css(h.disc);
      ctx.beginPath();
      ctx.arc(-17, 0.4, 1.5, 0, TAU);
      ctx.fill();
    } else if (f.shape === 1) {
      // a bell that pulses, trailing threads
      const pulse = 1 + 0.09 * Math.sin(tt * 3.2 + seed);
      ctx.lineWidth = 1.1;
      for (let k = -3; k <= 3; k++) {
        ctx.strokeStyle = css(k % 2 ? shade : body);
        ctx.beginPath();
        ctx.moveTo(4, k * 3.6);
        for (let i = 1; i <= 8; i++) ctx.lineTo(4 + i * 6, k * 3.6 * (1 + i * 0.1) + Math.sin(tt * 4 - i * 0.8 + k + seed) * (0.8 + i * 0.55));
        ctx.stroke();
      }
      ctx.fillStyle = css(body);
      ctx.beginPath();
      ctx.ellipse(0, 0, 17 / pulse, 16 * pulse, 0, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.quadraticCurveTo(8, 0, 0, 16 * pulse);
      ctx.fill();
      ctx.strokeStyle = css(mix(body, h.paper, 0.45), 0.8);
      ctx.lineWidth = 0.9;
      for (const k of [0.45, 0.8]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, (17 / pulse) * k, 16 * pulse * 0.92, 0, Math.PI * 0.62, Math.PI * 1.38);
        ctx.stroke();
      }
      ctx.fillStyle = css(h.disc);
      ctx.beginPath();
      ctx.arc(-8, 0, 1.7, 0, TAU);
      ctx.fill();
    } else if (f.shape === 2) {
      // splinters turning about a point
      for (let i = 0; i < 7; i++) {
        const a = tt * 0.9 + (i * TAU) / 7 + seed;
        const r = 11 + 4.5 * Math.sin(tt * 2 + i * 1.3);
        const cx = Math.cos(a) * r;
        const cy = Math.sin(a) * r;
        ctx.fillStyle = css(i % 2 ? shade : body);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
        ctx.lineTo(cx + Math.cos(a + 2.3) * 5.5, cy + Math.sin(a + 2.3) * 5.5);
        ctx.lineTo(cx + Math.cos(a - 2.3) * 5.5, cy + Math.sin(a - 2.3) * 5.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = css(h.disc);
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, TAU);
      ctx.fill();
    } else {
      // a swarm
      for (let i = 0; i < 46; i++) {
        const a = hash(i, seed) * TAU + tt * (0.8 + 2.4 * hash(i, 5)) * (i % 2 ? 1 : -1);
        const r = 3 + 19 * hash(i, 9) + 2.6 * Math.sin(tt * 3 + i);
        ctx.fillStyle = i % 7 === 0 ? css(core) : css(i % 3 ? body : shade);
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.85, 1.2 + 1.5 * hash(i, 3), 0.8 + hash(i, 4), a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    // how much of its phrase is done
    const below = y + 20 * SIZE;
    for (let k = 0; k < f.need; k++) {
      ctx.fillStyle = k < f.hit ? css(GOLD) : css(ink, 0.3);
      ctx.fillRect(x + 1 - f.need * 5 + k * 10, below, 8, 4);
    }
    ctx.font = `600 10.5px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = css(locked ? lock : ink, locked ? 1 : 0.85);
    ctx.strokeStyle = css(h.night ? h.dark : h.paper, 0.6);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(f.id, x, below + 18);
    ctx.fillText(f.id, x, below + 18);

    // the slip of paper it carries
    const cx = x + 30 * SIZE;
    const cy = y - 27;
    const ph = f.phrase;
    ctx.textAlign = 'left';
    ctx.fillStyle = css(ink, locked ? 0.95 : 0.85);
    ctx.strokeText(ph.kind === 'chg' ? L('CHANGE', 'WECHSEL') : ph.label, cx + 2, cy - 6);
    ctx.fillText(ph.kind === 'chg' ? L('CHANGE', 'WECHSEL') : ph.label, cx + 2, cy - 6);
    ctx.shadowColor = css(h.dark, 0.3);
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = PAPER;
    roundRect(ctx, cx, cy, 138, 54, 4);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = locked ? css(NOW) : 'rgba(40,36,50,0.3)';
    ctx.lineWidth = locked ? 2.4 : 1;
    ctx.stroke();
    const text = '#26262e';
    const dim = '#a79e96';
    const now = css(NOW);
    if (ph.kind === 'tab') {
      ctx.strokeStyle = 'rgba(120,108,96,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let l = 0; l < 6; l++) {
        ctx.moveTo(cx + 6, cy + 8 + l * 7.6);
        ctx.lineTo(cx + 132, cy + 8 + l * 7.6);
      }
      ctx.stroke();
      const sp = Math.min(32, 118 / ph.notes.length);
      ctx.font = `600 11px ${MONO}`;
      ctx.textAlign = 'center';
      ph.notes.forEach((n, k) => {
        const nx = cx + 14 + k * sp;
        const ny = cy + 8 + (5 - n.s) * 7.6;
        ctx.fillStyle = PAPER;
        ctx.fillRect(nx - 5, ny - 5.5, 10, 11);
        ctx.fillStyle = k < f.hit ? dim : locked && k === f.hit ? now : text;
        ctx.fillText(String(n.f), nx, ny + 4);
      });
    } else if (ph.kind === 'keys') {
      const midis = ph.keys.map((k) => k.midi);
      const hi = Math.max(...midis);
      const lo = Math.min(hi - 4, ...midis);
      const step = Math.min(24, 120 / midis.length);
      midis.forEach((m, k) => {
        ctx.fillStyle = k < f.hit ? dim : locked && k === f.hit ? now : text;
        ctx.fillRect(cx + 10 + k * step, cy + 8 + ((hi - m) / (hi - lo)) * 32, step - 4, 6);
      });
    } else {
      ctx.font = `700 ${ph.label.length > 10 ? 14 : 18}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = locked ? now : text;
      ctx.fillText(ph.label, cx + 69, cy + 33);
    }
    if (locked) {
      // the frame of what the lamp is on
      ctx.strokeStyle = css(lock);
      ctx.lineWidth = 2;
      ctx.beginPath();
      const [x0, y0, x1, y1] = [x - 30 * SIZE, y - 28 * SIZE, cx + 148, below + 26];
      for (const [px, py, dx, dy] of [
        [x0, y0, 1, 1],
        [x1, y0, -1, 1],
        [x1, y1, -1, -1],
        [x0, y1, 1, -1],
      ]) {
        ctx.moveTo(px + dx * 14, py);
        ctx.lineTo(px, py);
        ctx.lineTo(px, py + dy * 14);
      }
      ctx.stroke();
    }
  }

  /** Where seal i of the Mute sits. */
  private sealAt(g: Geo, b: Boss, i: number): { x: number; y: number } {
    const { cx, cy, R } = this.muteAt(g);
    const a = -Math.PI / 2 + ((i + 0.5) / b.steps.length - 0.5) * TAU;
    return { x: cx + Math.cos(a) * (R + 16), y: cy + Math.sin(a) * (R + 16) };
  }

  private muteAt(g: Geo): { cx: number; cy: number; R: number } {
    const R = clamp((g.hz - g.bt) * 0.27, 46, 104);
    return { cx: lerp(g.lx, g.W, 0.56), cy: Math.max(g.bt + R + 50, g.bt + (g.hz - g.bt) * 0.5), R };
  }

  /** The Mute: a black disc that swallows the light, held shut by a ring of seals. */
  private mute(ctx: CanvasRenderingContext2D, g: Geo, b: Boss, h: Hour, ink: RGB, lock: RGB): void {
    const { cx, cy, R } = this.muteAt(g);
    const n = b.steps.length;
    const down = b.results.filter((r) => r === 'clean').length;
    const gone = this.ending && this.won ? clamp(this.ending / 1.6) : 0;
    const fail = this.sealFailed && this.t - this.sealFailed.t < 0.5 ? 1 - (this.t - this.sealFailed.t) / 0.5 : 0;
    const breath = 1 + 0.015 * Math.sin(this.t * 1.7) + 0.04 * fail;
    // what light is left leaks out round its edge: more with every seal that is down
    stain(ctx, cx, cy, R * (1.9 + 0.3 * down), GOLD, 0.12 + 0.4 * (down / n) + 0.4 * gone);
    stain(ctx, cx, cy, R * 1.5, h.dark, 0.5 * (1 - gone));
    if (gone < 1) {
      ctx.fillStyle = css(mix(mix(h.dark, [8, 8, 18], 0.6), GLOW, gone));
      ctx.beginPath();
      ctx.arc(cx, cy, R * breath * (1 - gone * 0.4), 0, TAU);
      ctx.fill();
      // the still line where a heartbeat should be
      ctx.strokeStyle = css(h.paper, 0.6 * (1 - gone));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.55, cy);
      ctx.lineTo(cx - R * 0.2, cy);
      ctx.lineTo(cx - R * 0.12, cy - 9 * (down / n + fail));
      ctx.lineTo(cx - R * 0.02, cy + 14 * (down / n + fail));
      ctx.lineTo(cx + R * 0.06, cy - 6 * (down / n + fail));
      ctx.lineTo(cx + R * 0.14, cy);
      ctx.lineTo(cx + R * 0.55, cy);
      ctx.stroke();
    }
    const span = TAU / n;
    ctx.lineCap = 'butt';
    ctx.textAlign = 'center';
    b.steps.forEach((st, i) => {
      const a0 = -Math.PI / 2 + (i / n - 0.5) * TAU + 0.05;
      const a1 = a0 + span - 0.1;
      const mid = (a0 + a1) / 2;
      const res = b.results[i];
      const now = i === b.at;
      const broke = this.sealBroken.get(i);
      const sx = cx + Math.cos(mid) * (R + 16);
      const sy = cy + Math.sin(mid) * (R + 16);
      if (res === 'clean') {
        if (broke !== undefined && this.t - broke < 0.05) {
          this.bolts.push({ x: sx, y: sy, t: this.t, seed: (this.t * 997) | 0, wide: 1.6 });
          this.sparks.burst(sx, sy, 36, GOLD, 220, { span: 0.9, size: 2.8, solid: true });
          this.sparks.burst(sx, sy, 14, h.dark, 140, { span: 1, size: 4.4, g: 100, solid: true });
          this.rings.push({ x: sx, y: sy, t: this.t, c: GOLD, size: 70 });
          this.sealBroken.set(i, broke - 1);
        }
        ctx.strokeStyle = css(ink, 0.3);
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 7]);
      } else {
        const bad = now && res ? 1 : 0;
        const c = now ? mix(lock, BAD, bad * (0.5 + 0.5 * Math.sin(this.t * 30))) : ink;
        if (now) stain(ctx, sx, sy, 40, c, 0.35 + 0.15 * Math.sin(this.t * 5));
        ctx.strokeStyle = css(c, now ? 1 : 0.7);
        ctx.lineWidth = now ? 12 : 8;
        ctx.setLineDash([]);
      }
      if (gone < 0.6) {
        ctx.beginPath();
        ctx.arc(cx, cy, R + 16, a0, a1);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.font = `700 ${now ? 22 : 18}px ${MONO}`;
      ctx.fillStyle = res === 'clean' ? css(ink, 0.5) : now ? css(res ? BAD : lock) : css(ink, 0.95);
      if (gone < 0.6) {
        ctx.strokeStyle = css(h.night ? h.dark : h.paper, 0.75);
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeText(st.label, cx + Math.cos(mid) * (R + 44), cy + Math.sin(mid) * (R + 44) + 7);
        ctx.fillText(st.label, cx + Math.cos(mid) * (R + 44), cy + Math.sin(mid) * (R + 44) + 7);
      }
    });
    ctx.lineCap = 'round';
    if (gone > 0 && gone < 1 && Math.random() < 0.6) this.sparks.burst(cx + (Math.random() - 0.5) * R, cy + (Math.random() - 0.5) * R, 6, GOLD, 200, { span: 1, size: 2.6, solid: true });
    ctx.font = `600 13px ${MONO}`;
    ctx.fillStyle = css(ink, 0.95 * (1 - gone));
    ctx.strokeStyle = css(h.night ? h.dark : h.paper, 0.7 * (1 - gone));
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    const caption = L(`THE MUTE · ${b.name.toUpperCase()} · ${down} OF ${n} SEALS DOWN`, `DIE STILLE · ${b.name.toUpperCase()} · ${down} VON ${n} SIEGELN GEBROCHEN`);
    ctx.strokeText(caption, cx, Math.min(g.hz - 8, cy + R + 74));
    ctx.fillText(caption, cx, Math.min(g.hz - 8, cy + R + 74));
  }
}
