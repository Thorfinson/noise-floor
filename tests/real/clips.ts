/**
 * Recordings of a real guitar and a real piano, one note per clip, for the tests.
 * They are made by `npm run samples` (see scripts/samples.mjs for where they come from).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), 'notes');
const files = existsSync(dir) ? new Set(readdirSync(dir)) : new Set<string>();
const loaded = new Map<string, Float32Array>();

export const SR = 48000;
export type Loudness = 'pp' | 'mf' | 'ff';

/**
 * The recordings were made with a measuring microphone that also picks up the slow heaving of the air,
 * far below any note and as strong as the notes. A clip is a cut-out, so that rumble would begin and end
 * with a jolt that no real room has. It is taken out here; mix() puts an unbroken rumble back in.
 */
function load(name: string): Float32Array {
  let clip = loaded.get(name);
  if (!clip) {
    const b = readFileSync(resolve(dir, name));
    const n = (b.length - 44) / 2;
    clip = new Float32Array(n);
    const r = 1 - (2 * Math.PI * 45) / SR;
    // the filter starts as if the first sample had always been there
    let x1 = b.readInt16LE(44) / 32768;
    let y1 = 0;
    let x2 = 0;
    let y2 = 0;
    for (let i = 0; i < n; i++) {
      const x = b.readInt16LE(44 + i * 2) / 32768;
      y1 = x - x1 + r * y1;
      x1 = x;
      y2 = y1 - x2 + r * y2;
      x2 = y1;
      clip[i] = y2;
    }
    const fade = Math.floor(0.03 * SR);
    for (let i = 0; i < fade; i++) clip[i] *= i / fade;
    loaded.set(name, clip);
  }
  return clip;
}

const guitarFile = (midi: number, string: number, dyn: Loudness): string => `guitar.${dyn}.s${string}.${midi}.wav`;
const pianoFile = (midi: number, dyn: Loudness): string => `piano.${dyn}.${midi}.wav`;

export const haveGuitar = files.has(guitarFile(40, 0, 'mf')) && files.has(guitarFile(64, 5, 'mf'));
export const havePiano = files.has(pianoFile(60, 'mf'));
export const hasGuitar = (midi: number, string: number, dyn: Loudness = 'mf'): boolean => files.has(guitarFile(midi, string, dyn));
export const hasPiano = (midi: number, dyn: Loudness = 'mf'): boolean => files.has(pianoFile(midi, dyn));

/** A note on a string of the guitar (0 = low E). The note starts 50 ms into the clip. */
export const guitar = (midi: number, string: number, dyn: Loudness = 'mf'): Float32Array => load(guitarFile(midi, string, dyn));
/** A key of the piano. The note starts 50 ms into the clip. */
export const piano = (midi: number, dyn: Loudness = 'mf'): Float32Array => load(pianoFile(midi, dyn));

/** A note of one of the steel-string guitars: plain, played with the hand lying on the strings, or dead. */
export interface SteelClip {
  /** FS: Fender Stratocaster, LP: Gibson Les Paul, AR: Aristides */
  guitar: string;
  kind: 'normal' | 'muted' | 'dead';
  /** 0 = low E */
  string: number;
  /** the note that is fingered */
  midi: number;
  file: string;
}
export const steelClips: SteelClip[] = [...files]
  .filter((f) => f.startsWith('steel.') && f.endsWith('.wav'))
  .sort()
  .map((file) => {
    const [, guitar, kind, s, midi] = file.split('.');
    return { guitar, kind: kind as SteelClip['kind'], string: Number(s.slice(1)), midi: Number(midi), file };
  });
export const haveSteel = steelClips.length > 0;
export const steel = (c: SteelClip): Float32Array => load(c.file);

/** Where a clip's note begins, seconds. */
export const LEAD = 0.05;

export interface Played {
  clip: Float32Array;
  /** when the note begins, seconds */
  at: number;
  /** how long it sounds before it is cut off (a new note on the same string, a released key); the whole clip if left out */
  dur?: number;
  gain?: number;
}

/** Deterministic noise, like a quiet room. */
function hiss(buf: Float32Array, level: number, seed = 7): void {
  let a = seed >>> 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    buf[i] += level * ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1);
  }
}

/**
 * Mixes recorded notes into one signal. Underneath go the hiss of a quiet room, and a rumble below
 * hearing as strong as a soft note, together with a constant offset, as a good microphone on a plain
 * sound card delivers them.
 */
export function mix(notes: Played[], seconds: number, noise = 0.0015, rumble = 0.03): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SR));
  for (const n of notes) {
    const start = Math.floor((n.at - LEAD) * SR);
    const len = Math.min(n.clip.length, n.dur === undefined ? Infinity : Math.floor((n.dur + LEAD) * SR));
    const fade = Math.floor((n.dur === undefined ? 0.15 : 0.008) * SR);
    for (let i = 0; i < len; i++) {
      const k = start + i;
      if (k < 0 || k >= out.length) continue;
      const tail = len - 1 - i;
      out[k] += n.clip[i] * (n.gain ?? 1) * (tail < fade ? tail / fade : 1);
    }
  }
  if (noise) hiss(out, noise);
  if (rumble) for (let i = 0; i < out.length; i++) out[i] += rumble * (0.5 + Math.sin((2 * Math.PI * 3.1 * i) / SR) + 0.6 * Math.sin((2 * Math.PI * 7.3 * i) / SR + 1) + 0.3 * Math.sin((2 * Math.PI * 12.7 * i) / SR + 2));
  return out;
}

/**
 * Notes on the strings of a guitar, one after the other: a new note on a string ends the one that was
 * sounding there. Starts after half a second.
 */
export function onStrings(notes: { midi: number; string: number }[], gap: number, dyn: Loudness = 'mf', gain = 1): Float32Array {
  const played = notes.map((n, i): Played => {
    const next = notes.findIndex((m, j) => j > i && m.string === n.string);
    return { clip: guitar(n.midi, n.string, dyn), at: 0.5 + i * gap, dur: next < 0 ? undefined : (next - i) * gap, gain };
  });
  return mix(played, 0.5 + notes.length * gap + 1.5);
}

/**
 * The same sound as a laptop microphone hears it across a living room: reverberation (a plain
 * Schroeder reverberator: four combs and two all-passes) mixed with the direct sound, then the thin
 * response of a small microphone (little below 180 Hz), then the microphone's own hiss.
 *
 * rt60 is the time the room takes to die away by 60 dB; wet is how strong the reverberation is against
 * the direct sound (1 = as strong, roughly a metre and a half from the instrument in a small room).
 */
export function room(dry: Float32Array, rt60 = 0.5, wet = 0.7, hissLevel = 0.002): Float32Array {
  const n = dry.length;
  const rev = new Float32Array(n);
  for (const ms of [29.7, 37.1, 41.1, 43.7]) {
    const d = Math.round((ms / 1000) * SR);
    const g = Math.pow(10, (-3 * ms) / 1000 / rt60);
    const buf = new Float32Array(d);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const y = buf[k];
      buf[k] = dry[i] + g * y;
      k = k + 1 === d ? 0 : k + 1;
      rev[i] += 0.25 * y;
    }
  }
  for (const ms of [5, 1.7]) {
    const d = Math.round((ms / 1000) * SR);
    const buf = new Float32Array(d);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const b = buf[k];
      const y = -0.7 * rev[i] + b;
      buf[k] = rev[i] + 0.7 * y;
      k = k + 1 === d ? 0 : k + 1;
      rev[i] = y;
    }
  }
  // the reverberation as loud as asked for, measured against the direct sound over the whole signal
  let ed = 0;
  let er = 0;
  for (let i = 0; i < n; i++) {
    ed += dry[i] * dry[i];
    er += rev[i] * rev[i];
  }
  const scale = er > 0 ? wet * Math.sqrt(ed / er) : 0;
  const out = new Float32Array(n);
  const r = 1 - (2 * Math.PI * 180) / SR;
  let x1 = 0;
  let y1 = 0;
  let x2 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    const x = dry[i] + scale * rev[i];
    y1 = x - x1 + r * y1;
    x1 = x;
    y2 = y1 - x2 + r * y2;
    x2 = y1;
    out[i] = y2;
  }
  hiss(out, hissLevel, 11);
  return out;
}

/**
 * A clip as a string that is so many cents out of tune would sound: read a little faster or slower.
 * For an old piano, whose keys are no longer in tune with each other.
 */
export function detuned(clip: Float32Array, cents: number): Float32Array {
  if (!cents) return clip;
  const r = Math.pow(2, cents / 1200);
  const out = new Float32Array(Math.floor(clip.length / r));
  for (let i = 0; i < out.length; i++) {
    const x = i * r;
    const k = Math.floor(x);
    out[i] = clip[k] + (x - k) * ((clip[k + 1] ?? clip[k]) - clip[k]);
  }
  return out;
}
