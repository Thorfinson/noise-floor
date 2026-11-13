/**
 * Small additive instrument model. It stands in for a real guitar or piano in the automated tests
 * and drives the built-in practice instrument, so the whole app can be tried without a microphone.
 */
import { midiToFreq } from '../music/theory';

export type Articulation = 'clean' | 'muted' | 'buzz';

export interface ToneOpts {
  sr: number;
  midi: number;
  /** seconds */
  dur: number;
  amp?: number;
  art?: Articulation;
  a4?: number;
  piano?: boolean;
  seed?: number;
  /** partials below this frequency are thinned out, like a small laptop microphone would */
  highpass?: number;
  /** detune in cents */
  cents?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One plucked or struck note. */
export function tone(o: ToneOpts): Float32Array {
  const { sr, midi, dur } = o;
  const amp = o.amp ?? 0.25;
  const art = o.art ?? 'clean';
  const rnd = mulberry32((o.seed ?? 1) * 7919 + midi);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const f0 = midiToFreq(midi, o.a4 ?? 440) * Math.pow(2, (o.cents ?? 0) / 1200);
  const stiff = o.piano ? 4e-4 : 6e-5;
  const tau0 = art === 'muted' ? 0.03 : o.piano ? 1.1 : 1.6;
  const pos = o.piano ? 0.12 : 0.18;
  const attack = Math.max(1, Math.floor(0.003 * sr));

  for (let h = 1; h <= 14; h++) {
    const f = h * f0 * Math.sqrt(1 + stiff * h * h);
    if (f > Math.min(0.45 * sr, 9000)) break;
    let a = (amp * Math.abs(Math.sin(Math.PI * h * pos))) / Math.pow(h, o.piano ? 1.25 : 1.05);
    if (o.highpass && f < o.highpass) a *= Math.pow(f / o.highpass, 2);
    const tau = tau0 / (1 + 0.25 * (h - 1));
    const phase = rnd() * 2 * Math.PI;
    const w = (2 * Math.PI * f) / sr;
    for (let i = 0; i < n; i++) out[i] += a * Math.exp(-i / (tau * sr)) * Math.sin(w * i + phase);
  }

  // pick or hammer noise at the very start
  const burst = Math.floor((art === 'muted' ? 0.03 : 0.008) * sr);
  let lp = 0;
  for (let i = 0; i < Math.min(burst, n); i++) {
    const white = rnd() * 2 - 1;
    lp += (art === 'muted' ? 0.08 : 0.6) * (white - lp);
    out[i] += amp * (art === 'muted' ? 1.4 : 0.15) * lp * (1 - i / burst);
  }

  // fret buzz: a rattle in the upper band, once per cycle of the string
  if (art === 'buzz') {
    const period = sr / f0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const white = rnd() * 2 - 1;
      const hp = white - prev;
      prev = white;
      if ((i % period) / period < 0.18) out[i] += amp * 0.4 * hp * Math.exp(-i / (0.7 * sr));
    }
  }

  for (let i = 0; i < Math.min(attack, n); i++) out[i] *= i / attack;
  // release, so the end of the buffer is not a click
  const release = Math.min(n, Math.floor(0.03 * sr));
  for (let i = 0; i < release; i++) out[n - 1 - i] *= i / release;
  return out;
}

/** Adds src into dst starting at the given sample. */
export function mixInto(dst: Float32Array, src: Float32Array, at: number): void {
  const start = Math.max(0, Math.floor(at));
  const len = Math.min(src.length, dst.length - start);
  for (let i = 0; i < len; i++) dst[start + i] += src[i];
}

/** Several notes started one after the other, a few milliseconds apart, like a strum. */
export function strum(midis: number[], sr: number, dur: number, opts: Partial<ToneOpts> = {}, spreadMs = 14): Float32Array {
  const out = new Float32Array(Math.floor(dur * sr));
  midis.forEach((midi, i) => mixInto(out, tone({ sr, midi, dur: dur - (i * spreadMs) / 1000, amp: 0.14, seed: i + 1, ...opts }), (i * spreadMs * sr) / 1000));
  return out;
}

/** Steady background hiss. */
export function addNoise(buf: Float32Array, level: number, seed = 99): void {
  const rnd = mulberry32(seed);
  for (let i = 0; i < buf.length; i++) buf[i] += level * (rnd() * 2 - 1);
}

/**
 * Metronome tick: a short, high blip. It sits above the band the listener analyses (up to 6 kHz),
 * so a microphone that picks it up from the speakers is not disturbed by it.
 */
export function click(sr: number, accent = false, amp = 0.5, low = false): Float32Array {
  const n = Math.floor((accent ? 0.04 : 0.028) * sr);
  const out = new Float32Array(n);
  // the low one is a plain metronome click: easier on the ear, but the listener would hear it as a note
  // beginning, so it is for headphones (and for measuring how long sound takes from speaker to microphone)
  const w = (2 * Math.PI * (low ? (accent ? 1600 : 1100) : accent ? 7600 : 7000)) / sr;
  for (let i = 0; i < n; i++) {
    const env = Math.sin((Math.PI * i) / n);
    out[i] = amp * (accent ? 1 : 0.6) * env * env * Math.sin(w * i);
  }
  return out;
}

export type Chime = 'hit' | 'clear' | 'blow' | 'step' | 'win';

/**
 * The sounds of the games: small glassy chimes. Like the metronome tick they are made only of tones above
 * the band the listener analyses, and they come and go softly, so that a microphone that picks them up
 * from the speakers hears no note beginning. That is also why they are thin: nothing low can be in them.
 */
export function chime(sr: number, kind: Chime, amp = 0.4): Float32Array {
  // each voice: frequency, start, length and loudness
  const voices: [number, number, number, number][] =
    kind === 'hit'
      ? [[7400, 0, 0.09, 1], [9860, 0.004, 0.07, 0.5]]
      : kind === 'step'
        ? [[8300, 0, 0.11, 0.8], [11050, 0.006, 0.08, 0.35]]
        : kind === 'clear'
          ? [[7400, 0, 0.14, 0.9], [8800, 0.05, 0.14, 0.9], [11100, 0.1, 0.22, 0.8], [9860, 0.1, 0.2, 0.4]]
          : kind === 'win'
            ? [[7400, 0, 0.2, 0.8], [8300, 0.11, 0.2, 0.8], [9860, 0.22, 0.2, 0.8], [11100, 0.33, 0.5, 0.9], [7400, 0.33, 0.5, 0.5]]
            : // a blow to the lamp: a cluster that grinds, falling a little
              [[7050, 0, 0.3, 0.8], [7480, 0.01, 0.28, 0.8], [7930, 0, 0.26, 0.7], [8400, 0.02, 0.22, 0.6], [9500, 0.01, 0.2, 0.4]];
  const total = Math.max(...voices.map(([, at, len]) => at + len));
  const out = new Float32Array(Math.ceil(total * sr));
  const rise = Math.floor(0.006 * sr);
  for (const [f, at, len, vol] of voices) {
    const n = Math.floor(len * sr);
    const start = Math.floor(at * sr);
    const w = (2 * Math.PI * f) / sr;
    for (let i = 0; i < n; i++) {
      // a soft beginning, then dying away: no click that would spread over all frequencies
      const up = i < rise ? 0.5 - 0.5 * Math.cos((Math.PI * i) / rise) : 1;
      const down = Math.exp((-4.5 * i) / n) * (i > n - rise ? (n - i) / rise : 1);
      out[start + i] += (amp * vol * up * down * Math.sin(w * i)) / 2.2;
    }
  }
  return out;
}

export interface VoiceOpts {
  sr: number;
  midi: number;
  /** seconds */
  dur: number;
  a4?: number;
  amp?: number;
  /** cents the tone is off the note, sharp positive */
  cents?: number;
  /** how far the voice wavers, cents, up and down five or six times a second; 0 for a plain tone */
  vibrato?: number;
  /** cents below the note the voice starts at, sliding up into it over the first tenth of a second */
  scoop?: number;
  /** a slow drift over the whole tone, cents: where it ends up */
  drift?: number;
  seed?: number;
}

/**
 * A sung "ah": a fundamental with the harmonics a voice has (strong around the formants of the vowel, at
 * some 700 and 1200 Hz), a slide into the note, vibrato, a little breath. Stands in for a voice in the
 * tests and in the practice instrument.
 */
export function voiceTone(o: VoiceOpts): Float32Array {
  const { sr, midi, dur } = o;
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const rnd = mulberry32((o.seed ?? 1) * 104729 + midi);
  const f0 = midiToFreq(midi, o.a4 ?? 440) * Math.pow(2, (o.cents ?? 0) / 1200);
  const amp = o.amp ?? 0.22;
  const vib = o.vibrato ?? 25;
  const scoop = o.scoop ?? 40;
  const drift = o.drift ?? 0;
  const rate = 5.4 + rnd();
  const formant = (f: number): number => Math.exp(-((f - 700) ** 2) / (2 * 260 ** 2)) + 0.7 * Math.exp(-((f - 1200) ** 2) / (2 * 300 ** 2)) + 0.25;
  const harmonics: { h: number; a: number; phase: number }[] = [];
  for (let h = 1; h <= 16; h++) {
    if (h * f0 > 5000) break;
    harmonics.push({ h, a: formant(h * f0) / h ** 0.6, phase: rnd() * 2 * Math.PI });
  }
  const norm = harmonics.reduce((s, x) => s + x.a, 0);
  let phase = 0;
  let breath = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // into the note from below, then vibrato that sets in after a moment, and a slow drift
    const into = t < 0.1 ? -scoop * (1 - t / 0.1) : 0;
    const wave = vib * Math.min(1, Math.max(0, (t - 0.25) / 0.3)) * Math.sin(2 * Math.PI * rate * t);
    const f = f0 * Math.pow(2, (into + wave + (drift * t) / dur) / 1200);
    phase += (2 * Math.PI * f) / sr;
    let s = 0;
    for (const x of harmonics) s += x.a * Math.sin(x.h * phase + x.phase);
    breath += 0.3 * (rnd() * 2 - 1 - breath);
    const env = Math.min(1, t / 0.06) * Math.min(1, (dur - t) / 0.08);
    out[i] = env * amp * (s / norm + 0.02 * breath);
  }
  return out;
}
