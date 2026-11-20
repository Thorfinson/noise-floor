/**
 * The instruments of the band (src/audio/band.ts): an electric bass, an electric piano and an organ, a fiddle,
 * a drum kit, and a second kit made only of sound above 7.5 kHz, for playing through speakers.
 *
 * Everything here has to be quick to make, because a screen renders the band when the player presses start:
 * a pitched note is read from one stored period of its wave (no sine and no exponential per sample), and every
 * drum sound is made once per sample rate and afterwards only added in wherever it is struck.
 */
import { midiToFreq } from '../music/theory';
import { mulberry32 } from './synth';

/** samples in one stored period of a wave */
const SIZE = 2048;

/**
 * One period of a wave made of these partials (the first is the fundamental), its peak at 1. The partials start
 * at spread-out phases, so that they do not all peak together: the same loudness with a lower peak.
 */
function wave(partials: number[]): Float32Array {
  const t = new Float32Array(SIZE + 1);
  for (let i = 0; i <= SIZE; i++) {
    let v = 0;
    for (let k = 0; k < partials.length; k++) {
      const h = k + 1;
      v += partials[k] * Math.sin((2 * Math.PI * h * i) / SIZE + (Math.PI * h * (h - 1)) / partials.length);
    }
    t[i] = v;
  }
  let peak = 0;
  for (const v of t) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i <= SIZE; i++) t[i] /= peak || 1;
  return t;
}

/** How a pitched instrument sounds: a bright wave for the first moments that settles into a plainer one. */
export interface Timbre {
  bright: Float32Array;
  body: Float32Array;
  /** how much of the beginning is the bright wave, 0..1 */
  mix: number;
  /** seconds in which each wave dies away to about a third */
  brightTau: number;
  bodyTau: number;
  /** seconds to rise, and to fall silent once the note is let go */
  attack: number;
  release: number;
  /** a fiddle's vibrato: how wide (cents), how fast (per second), and how long after the start it sets in */
  vibrato?: { cents: number; rate: number; delay: number };
}

/** An electric bass played with the fingers: a round tone with a little snap at the start. */
export const BASS: Timbre = { bright: wave([1, 0.8, 0.55, 0.4, 0.28, 0.18, 0.12, 0.08]), body: wave([1, 0.45, 0.15, 0.05]), mix: 0.45, brightTau: 0.09, bodyTau: 1.1, attack: 0.004, release: 0.05 };
/** The same bass, plucked short (through speakers its notes must be short). */
export const BASS_SHORT: Timbre = { ...BASS, mix: 0.5, brightTau: 0.05, bodyTau: 0.3, attack: 0.003, release: 0.04 };
/** An electric piano: a bell of a tine at the start over a warm, long tone. */
export const PIANO: Timbre = { bright: wave([1, 0.35, 0.2, 0.1, 0.05, 0.05, 0.45, 0.1, 0.05]), body: wave([1, 0.2, 0.05]), mix: 0.35, brightTau: 0.25, bodyTau: 2.8, attack: 0.005, release: 0.12 };
/** A soft organ, struck short: the chord on the upbeat, through speakers. */
export const ORGAN: Timbre = { bright: wave([1, 0.6, 0.35, 0.25, 0.12]), body: wave([1, 0.5, 0.3, 0.15]), mix: 0.5, brightTau: 0.3, bodyTau: 0.9, attack: 0.006, release: 0.05 };
/** A fiddle, bowed: it swells in, holds, and gets a vibrato after a moment. */
export const FIDDLE: Timbre = { bright: wave([1, 0.55, 0.4, 0.3, 0.22, 0.18, 0.12, 0.09, 0.06, 0.04]), body: wave([1, 0.55, 0.4, 0.3, 0.22, 0.18, 0.12, 0.09, 0.06, 0.04]), mix: 0.5, brightTau: 3, bodyTau: 3, attack: 0.08, release: 0.15, vibrato: { cents: 14, rate: 5.3, delay: 0.25 } };
/** The fiddle plucked (pizzicato): short by nature. */
export const PIZZ: Timbre = { bright: wave([1, 0.6, 0.35, 0.18, 0.08]), body: wave([1, 0.3, 0.1]), mix: 0.55, brightTau: 0.06, bodyTau: 0.3, attack: 0.002, release: 0.04 };

/**
 * Adds one note into out, beginning at sample `start`: it sounds for `dur` seconds and is then let go over the
 * timbre's release. phase (0..1) is where in its wave it begins, so that the notes of a chord do not all begin
 * alike.
 */
export function note(out: Float32Array, sr: number, start: number, midi: number, dur: number, amp: number, t: Timbre, a4 = 440, phase = 0): void {
  const s0 = Math.max(0, Math.floor(start));
  const n = Math.floor((dur + t.release) * sr);
  const end = Math.min(n, out.length - s0);
  if (end <= 0) return;
  const att = Math.max(1, Math.round(t.attack * sr));
  const relStart = Math.max(1, Math.floor(dur * sr));
  const rel = Math.max(1, n - relStart);
  const d1 = Math.exp(-1 / (t.brightTau * sr));
  const d2 = Math.exp(-1 / (t.bodyTau * sr));
  let e1 = amp * t.mix;
  let e2 = amp * (1 - t.mix);
  const B = t.bright;
  const D = t.body;
  const base = (midiToFreq(midi, a4) * SIZE) / sr;
  let inc = base;
  let ph = (((phase % 1) + 1) % 1) * SIZE;
  const vib = t.vibrato;
  const vibDelay = vib ? vib.delay * sr : 0;
  const vibW = vib ? (2 * Math.PI * vib.rate) / sr : 0;
  for (let i = 0; i < end; i++) {
    // the vibrato moves the pitch slowly: worked out every 64 samples, not every sample
    if (vib && (i & 63) === 0 && i > vibDelay) {
      const into = Math.min(1, (i - vibDelay) / (0.3 * sr));
      inc = base * Math.pow(2, (vib.cents * into * Math.sin(vibW * i)) / 1200);
    }
    const k = ph | 0;
    const fr = ph - k;
    const b = B[k] + fr * (B[k + 1] - B[k]);
    const d = D[k] + fr * (D[k + 1] - D[k]);
    let g = i < att ? i / att : 1;
    if (i >= relStart) g *= (n - i) / rel;
    out[s0 + i] += g * (e1 * b + e2 * d);
    e1 *= d1;
    e2 *= d2;
    ph += inc;
    if (ph >= SIZE) ph -= SIZE;
  }
}

/** Adds a sound into out at sample `at`, so loud. */
export function hit(out: Float32Array, sound: Float32Array, at: number, amp: number): void {
  const s0 = Math.max(0, Math.round(at));
  const len = Math.min(sound.length, out.length - s0);
  for (let i = 0; i < len; i++) out[s0 + i] += amp * sound[i];
}

/** The drum kit under headphones. */
export interface Kit {
  kick: Float32Array;
  snare: Float32Array;
  /** the stick across the rim: a soft click for quiet grooves */
  rim: Float32Array;
  hat: Float32Array;
  open: Float32Array;
  crash: Float32Array;
  /** high, middle and low */
  toms: Float32Array[];
}

/** The kit for speakers: nothing in it below 7.5 kHz, where the listener is deaf already. Several of each, slightly different. */
export interface HighKit {
  shaker: Float32Array[];
  tick: Float32Array[];
  /** a longer, ringing burst, where a snare or a ride would be */
  ride: Float32Array[];
}

const kits = new Map<number, Kit>();
const highKits = new Map<number, HighKit>();

/** A sine whose pitch falls from `from` to `to` Hz and dies away: a kick or a tom. */
function thump(sr: number, len: number, from: number, to: number, glide: number, tau: number, noise: number, seed: number): Float32Array {
  const n = Math.floor(len * sr);
  const out = new Float32Array(n);
  const rnd = mulberry32(seed);
  let extra = from - to;
  const dx = Math.exp(-1 / (glide * sr));
  const de = Math.exp(-1 / (tau * sr));
  let env = 1;
  let ph = 0;
  const click = Math.floor(0.003 * sr);
  for (let i = 0; i < n; i++) {
    ph += (to + extra) / sr;
    out[i] = env * Math.sin(2 * Math.PI * ph);
    if (i < click) out[i] += noise * (rnd() * 2 - 1) * (1 - i / click);
    extra *= dx;
    env *= de;
  }
  fadeEnd(out, Math.floor(0.01 * sr));
  return out;
}

/** White noise, made brighter by taking differences, dying away; tone adds a sine body (a snare's drum). */
function hiss(sr: number, len: number, tau: number, bright: number, seed: number, body: [number, number, number][] = []): Float32Array {
  const n = Math.floor(len * sr);
  const out = new Float32Array(n);
  const rnd = mulberry32(seed);
  const de = Math.exp(-1 / (tau * sr));
  let env = 1;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    out[i] = env * (bright * (w - prev) + (1 - bright) * w);
    prev = w;
    env *= de;
  }
  // the drum under a snare: a few sines that die faster than the rattle
  for (const [f, a, t] of body) {
    const dt = Math.exp(-1 / (t * sr));
    let e = a;
    for (let i = 0; i < n; i++) {
      out[i] += e * Math.sin((2 * Math.PI * f * i) / sr);
      e *= dt;
    }
  }
  const rise = Math.floor(0.001 * sr);
  for (let i = 0; i < rise; i++) out[i] *= i / rise;
  fadeEnd(out, Math.floor(0.01 * sr));
  return out;
}

function fadeEnd(out: Float32Array, len: number): void {
  const n = out.length;
  for (let i = 0; i < Math.min(len, n); i++) out[n - 1 - i] *= i / len;
}

/** The kit for headphones at this sample rate, made the first time it is asked for. */
export function kit(sr: number): Kit {
  let k = kits.get(sr);
  if (!k) {
    k = {
      kick: thump(sr, 0.42, 150, 48, 0.035, 0.2, 0.35, 1),
      snare: hiss(sr, 0.3, 0.09, 0.6, 2, [[185, 0.5, 0.05], [330, 0.3, 0.04]]),
      rim: hiss(sr, 0.05, 0.006, 0.9, 3, [[1700, 0.6, 0.008], [420, 0.5, 0.015]]),
      hat: hiss(sr, 0.08, 0.018, 1, 4),
      open: hiss(sr, 0.45, 0.15, 1, 5),
      crash: hiss(sr, 1.8, 0.7, 1, 6),
      toms: [thump(sr, 0.45, 190, 150, 0.08, 0.18, 0.15, 7), thump(sr, 0.5, 150, 115, 0.08, 0.2, 0.15, 8), thump(sr, 0.55, 115, 85, 0.09, 0.22, 0.15, 9)],
    };
    kits.set(sr, k);
  }
  return k;
}

/**
 * Noise with nothing below 7.7 kHz, as many sines at random frequencies between there and 13.5 kHz: unlike
 * filtered noise it has no leftovers further down, however steep a filter would be.
 */
function highNoise(sr: number, len: number, seed: number, metal: number[] = []): Float32Array {
  const n = Math.floor(len * sr);
  const out = new Float32Array(n);
  const rnd = mulberry32(seed);
  const lo = 7700;
  const hi = Math.min(13500, 0.45 * sr);
  const parts: [number, number][] = [];
  for (let p = 0; p < 90; p++) parts.push([lo + (hi - lo) * rnd(), 1 / Math.sqrt(45)]);
  for (const f of metal) if (f < hi) parts.push([f, 0.5]);
  for (const [f, a] of parts) {
    const w = (2 * Math.PI * f) / sr;
    const c = Math.cos(w);
    const s = Math.sin(w);
    const phase = rnd() * 2 * Math.PI;
    let re = a * Math.cos(phase);
    let im = a * Math.sin(phase);
    for (let i = 0; i < n; i++) {
      out[i] += im;
      const r = re * c - im * s;
      im = re * s + im * c;
      re = r;
    }
  }
  return out;
}

/**
 * A burst of high noise that comes and goes softly: a sharp edge would spread sound down into the band the
 * listener hears in, as the chimes of the games show (src/audio/synth.ts).
 */
function burst(noise: Float32Array, sr: number, rise: number, tau: number): Float32Array {
  const n = noise.length;
  const out = new Float32Array(n);
  const r = Math.max(1, Math.round(rise * sr));
  const fade = Math.max(1, Math.round(0.006 * sr));
  const d = Math.exp(-1 / (tau * sr));
  let e = 1;
  for (let i = 0; i < n; i++) {
    let g = e;
    if (i < r) g *= 0.5 - 0.5 * Math.cos((Math.PI * i) / r);
    else e *= d;
    if (i > n - fade) g *= 0.5 - 0.5 * Math.cos((Math.PI * (n - i)) / fade);
    out[i] = g * noise[i];
  }
  return out;
}

/** The kit for speakers at this sample rate, made the first time it is asked for. */
export function highKit(sr: number): HighKit {
  let k = highKits.get(sr);
  if (!k) {
    const four = (f: (i: number) => Float32Array): Float32Array[] => [0, 1, 2, 3].map(f);
    k = {
      shaker: four((i) => burst(highNoise(sr, 0.09, 20 + i), sr, 0.004, 0.022)),
      tick: four((i) => burst(highNoise(sr, 0.06, 30 + i), sr, 0.003, 0.012)),
      ride: four((i) => burst(highNoise(sr, 0.5, 40 + i, [8170, 9290, 10460, 11720, 12890]), sr, 0.004, 0.13)),
    };
    highKits.set(sr, k);
  }
  return k;
}
