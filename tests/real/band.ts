/**
 * The band through speakers, on real recordings. The speaker band (src/audio/band.ts) goes through a simulated
 * speaker and room (room() of clips.ts) to the microphone, at a loudness against the guitar, and the listener
 * hears it: with nobody playing (what does it take for playing that is not there?), and under the strummed
 * pieces recorded in a real room (are their chords still heard as without the band?). Each with the plain
 * listener and with the informed one (src/audio/echo.ts), after a soundcheck and without one.
 *
 * Run: npx vite-node tests/real/bandbench.ts. The measuring is here; tests/bandreal.test.ts holds it as
 * assertions when the pieces are there.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBand, type BandInput, type BandParts } from '../../src/audio/band';
import { BandEcho } from '../../src/audio/echo';
import { Listener } from '../../src/audio/listener';
import { CHORDS } from '../../src/music/theory';
import { room, SR } from './clips';
import { type Piece } from './pieces';

/** How the band reaches the microphone. */
export interface Setup {
  name: string;
  /** a song of the app's kind through the speaker band at the microphone: its loudness (RMS) against the guitar's */
  level: number;
  /**
   * A laptop's small speakers (nothing below about 180 Hz, and distortion where the cone moves far, under the low
   * notes), a speaker box, or a laptop turned up until its amplifier clips everything (a stress test).
   */
  speaker: 'laptop' | 'box' | 'clipping';
  rt60: number;
  wet: number;
}
export const SETUPS: Setup[] = [
  { name: 'quiet laptop', level: 0.2, speaker: 'laptop', rt60: 0.4, wet: 0.5 },
  { name: 'comfortable laptop', level: 0.45, speaker: 'laptop', rt60: 0.5, wet: 0.7 },
  { name: 'loud speaker box', level: 0.9, speaker: 'box', rt60: 0.6, wet: 1 },
];
/** the laptop driven into clipping: not one of the setups the speaker band is meant for */
export const CLIPPING: Setup = { name: 'clipping laptop', level: 0.45, speaker: 'clipping', rt60: 0.5, wet: 0.7 };

/** What the listener is told: nothing (plain), the band after a soundcheck, or the band without one. */
export type Informed = 'plain' | 'soundcheck' | 'follow';
export const INFORMED: Informed[] = ['plain', 'soundcheck', 'follow'];

const rmsOf = (x: Float32Array): number => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++)
    if (Math.abs(x[i]) > 1e-4) {
      s += x[i] * x[i];
      n++;
    }
  return Math.sqrt(s / Math.max(1, n));
};

/** The band as one signal, every layer at gain 1: what goes to the speakers. */
export function mixOf(parts: BandParts): Float32Array {
  const { drums, bass, keys, lead } = parts.layers;
  const out = new Float32Array(drums.length);
  for (let i = 0; i < out.length; i++) out[i] = drums[i] + bass[i] + keys[i] + lead[i];
  return out;
}

/** Two high-pass stages at f Hz: what a speaker of that size cannot move. */
function highpass(x: Float32Array, f: number): Float32Array {
  const r = 1 - (2 * Math.PI * f) / SR;
  const out = new Float32Array(x.length);
  let x1 = 0;
  let y1 = 0;
  let x2 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    y1 = x[i] - x1 + r * y1;
    x1 = x[i];
    y2 = y1 - x2 + r * y2;
    x2 = y1;
    out[i] = y2;
  }
  return out;
}

/** Soft clipping, so hard that the loudest moment is pressed down by about a third. */
function clip(x: Float32Array, drive: number): Float32Array {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const k = drive / Math.max(1e-6, peak);
  return x.map((v) => Math.tanh(k * v) / k);
}

/**
 * The band out of the speaker, through the room, at the microphone, times `gain` (see gainFor), placed `at`
 * seconds into a signal of `length` samples. A laptop's small speaker distorts where its cone has to move far:
 * under the low notes, which then bring partials of their own. What lies high above (the drums of the speaker
 * band) makes it move hardly at all and comes out as it went in. The clipping laptop clips everything together.
 */
export function throughRoom(band: Float32Array, s: Setup, gain: number, at: number, length: number): Float32Array {
  let x = highpass(band, s.speaker === 'box' ? 55 : 180);
  if (s.speaker === 'laptop') {
    // the part below about 1 kHz, distorted, and the rest as it is
    const low = new Float32Array(x.length);
    const r = Math.exp((-2 * Math.PI * 1000) / SR);
    let y = 0;
    for (let i = 0; i < x.length; i++) low[i] = y = (1 - r) * x[i] + r * y;
    const bent = clip(low, 1);
    x = x.map((v, i) => v - low[i] + bent[i]);
  } else if (s.speaker === 'clipping') x = clip(x, 1.3);
  const dry = new Float32Array(length);
  dry.set(x.subarray(0, Math.max(0, Math.min(x.length, length - Math.round(at * SR)))), Math.round(at * SR));
  const wet = room(dry, s.rt60, s.wet, 0);
  for (let i = 0; i < wet.length; i++) wet[i] *= gain;
  return wet;
}

const unitLevels = new Map<string, number>();
/**
 * The gain from the speakers to the microphone in a setup at which a song of the app's kind arrives so loud
 * (RMS). It is a property of the speaker, the room and the microphone: a sparser band (one that finds few gaps
 * between the player's strums) arrives quieter at the same gain, as it would.
 */
export function gainFor(s: Setup, rms: number): number {
  let unit = unitLevels.get(s.name);
  if (unit === undefined) {
    const song = songBand('beat', 90, 20).parts;
    unit = rmsOf(throughRoom(mixOf(song), s, 1, 0, song.layers.drums.length));
    unitLevels.set(s.name, unit);
  }
  return rms / Math.max(1e-9, unit);
}

/** A listener as the lessons set it up for strummed chords, told about the band as asked. */
function listener(ids: string[], notes: boolean): Listener {
  const l = new Listener(SR);
  l.noteDetection = notes;
  l.chordCandidates = ids;
  return l;
}

/** The band told to the listener, arriving `at` seconds into what it hears (plus a timing error, seconds). */
function tell(l: Listener, parts: BandParts, at: number, off: number): void {
  l.bands = [new BandEcho(parts, { drums: 1, bass: 1, keys: 1, lead: 1 }, 1, (at + off) * SR)];
}

/**
 * The coupling learned from a few seconds of a band alone in this setup, as the speaker test learns it: with a
 * song of its own (the band of a piece may have no pitched note at all, where the player leaves no gap).
 */
export function soundcheck(s: Setup, gain: number, off = 0, parts = songBand('beat', 90, 6).parts): { coupling: number[]; late: number; fit: number } | null {
  const secs = 4;
  const sig = throughRoom(mixOf(parts), s, gain, 0.5, Math.round((0.5 + secs) * SR));
  addHiss(sig);
  const l = listener([], false);
  tell(l, parts, 0.5, off);
  l.learnEcho();
  for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
  return l.learnedEcho();
}

/** a quiet room's hiss, as the microphone adds it */
function addHiss(sig: Float32Array, level = 0.0015, seed = 5): void {
  let a = seed >>> 0;
  for (let i = 0; i < sig.length; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    sig[i] += level * ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1);
  }
}

/** A song of the app's kind: four chords, a bar each, played round and round. */
export function songBand(feel: string, bpm: number, seconds: number, seed = 1): { parts: BandParts; ids: string[] } {
  const ids = ['G', 'Em', 'C', 'D'];
  const three = feel === 'waltz' || feel === 'lilt';
  const six = feel === 'six' || feel === 'roll';
  const step = six ? 3 : 2;
  const beats = three ? 3 : six ? 2 : 4;
  const unit = 60 / bpm / step;
  const barUnits = beats * step;
  const bars = Math.ceil(seconds / (barUnits * unit));
  const chords = Array.from({ length: bars }, (_, b) => ({ u: b * barUnits, id: ids[b % 4] }));
  const clicks = Array.from({ length: bars * beats }, (_, k) => ({ u: k * step, accent: k % beats === 0 }));
  return { parts: renderBand({ chords, clicks, units: bars * barUnits, unit, sr: SR, a4: 440, mode: 'speakers', feel, seed }), ids };
}

export interface Phantoms {
  minutes: number;
  onsets: number;
  notes: number;
  /** chords the lessons would take (score over 0.6, margin over 0.08) */
  chords: number;
  thuds: number;
}

/**
 * The band alone, nobody playing, for so many seconds (the soundcheck, where there is one, was made before, as
 * the speaker test makes it): everything the listener reports is a phantom.
 */
export function silent(s: Setup, how: Informed, feel = 'beat', bpm = 90, seconds = 120, off = 0, guitarRms = 0.08): Phantoms {
  const { parts, ids } = songBand(feel, bpm, seconds + 6);
  const gain = gainFor(s, s.level * guitarRms);
  const lead = 1;
  const sig = throughRoom(mixOf(parts), s, gain, lead, Math.round((lead + seconds + 4) * SR));
  addHiss(sig);
  const l = listener(ids, true);
  const counted = lead;
  const ph: Phantoms = { minutes: seconds / 60, onsets: 0, notes: 0, chords: 0, thuds: 0 };
  l.onOnset = (e) => (e.time >= counted ? ph.onsets++ : undefined);
  l.onNote = (e) => (e.time >= counted ? ph.notes++ : undefined);
  l.onChord = (e) => (e.time >= counted && e.best && e.score > 0.6 && e.margin > 0.08 ? ph.chords++ : undefined);
  l.onThud = (e) => (e.time >= counted ? ph.thuds++ : undefined);
  if (how !== 'plain') {
    tell(l, parts, lead, off);
    if (how === 'soundcheck') {
      const check = soundcheck(s, gain, off);
      if (check) {
        l.coupling = check.coupling;
        l.bands[0].start += check.late * SR;
      }
    }
  }
  for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
  return ph;
}

/**
 * The beats of a piece with their places in the bar ("3.1" is the first beat of the third bar). The files end
 * with a few lines of another kind ("4,4"), which are no beats.
 */
function beatsOf(p: Piece): { t: number; first: boolean }[] {
  const csv = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'pieces', p.name + '.csv'), 'utf8');
  return csv
    .split(/\r?\n/)
    .map((l) => l.split(','))
    .filter(([, rest]) => /^\d+\.\d+/.test(rest ?? ''))
    .map(([t, rest]) => ({ t: Number(t), first: /^\d+\.1\b/.test(rest) }));
}

/**
 * The band of a piece: its chords on its beats, following the player's tempo as it wanders, keeping off the
 * strums the plain listener hears in the recording. Starts at the first beat.
 */
export function pieceBand(p: Piece, strums: number[], seed = 1): { parts: BandParts; at: number; ids: string[] } {
  const beats = beatsOf(p);
  const t0 = beats[0].t;
  const period = (beats[beats.length - 1].t - t0) / (beats.length - 1);
  // seconds at beat b (a fraction between two beats lies between their times)
  const beatTime = (b: number): number => {
    if (b <= 0) return t0 + b * period;
    if (b >= beats.length - 1) return beats[beats.length - 1].t + (b - beats.length + 1) * period;
    const k = Math.floor(b);
    return beats[k].t + (b - k) * (beats[k + 1].t - beats[k].t);
  };
  const unitOf = (t: number): number => {
    let lo = -20;
    let hi = 2 * beats.length + 20;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (beatTime(mid / 2) < t) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const ids = [...new Set(p.chords.map((c) => c.id).filter((c): c is string => !!c && !!CHORDS[c]))];
  const chords = p.chords.filter((c) => c.id && CHORDS[c.id]).map((c) => ({ u: Math.round(unitOf(c.t)), id: c.id! }));
  const clicks = beats.map((b, i) => ({ u: 2 * i, accent: b.first }));
  const o: BandInput = {
    chords,
    clicks,
    units: 2 * beats.length,
    unit: period / 2,
    sr: SR,
    a4: 440,
    mode: 'speakers',
    strums: strums.map(unitOf).filter((u) => u > -1 && u < 2 * beats.length),
    seed,
    warp: (u) => beatTime(u / 2) - t0,
  };
  return { parts: renderBand(o), at: t0, ids };
}

export interface Played {
  /** strums whose chord was named (score over 0.6, margin over 0.08) and right, of those named */
  right: number;
  known: number;
  /** stretches of one chord in which it was named at least once */
  named: number;
  stretches: number;
  /** the player's strums named right without the band, and how many of them still are with it */
  base: number;
  kept: number;
  /** chords named where the player did not strum (no onset within 0.12 s without the band) */
  extra: number;
}

type Sure = { t: number; id: string };
/** The sure chords of a signal, as the lessons take them. */
function chordsOf(sig: Float32Array, ids: string[], setup?: (l: Listener) => void): { sure: Sure[]; onsets: number[] } {
  const l = listener(ids, false);
  const sure: Sure[] = [];
  const onsets: number[] = [];
  l.onChord = (e) => (e.best && e.score > 0.6 && e.margin > 0.08 ? sure.push({ t: e.time, id: e.best }) : undefined);
  l.onOnset = (e) => onsets.push(e.time);
  setup?.(l);
  for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
  return { sure, onsets };
}

/** The piece as the lessons judge it, with the band at the microphone in this setup (null: no band). */
export function played(p: Piece, s: Setup | null, how: Informed, off = 0): Played {
  const ids = [...new Set(p.chords.map((c) => c.id).filter((c): c is string => !!c && !!CHORDS[c]))];
  const dry = chordsOf(p.samples, ids);
  let sure = dry.sure;
  if (s) {
    const band = pieceBand(p, dry.onsets);
    const gain = gainFor(s, s.level * rmsOf(p.samples));
    const wet = throughRoom(mixOf(band.parts), s, gain, band.at, p.samples.length);
    const sig = new Float32Array(p.samples.length);
    for (let i = 0; i < sig.length; i++) sig[i] = p.samples[i] + wet[i];
    const check = how === 'soundcheck' ? soundcheck(s, gain, off) : null;
    sure = chordsOf(sig, ids, (l) => {
      if (how === 'plain') return;
      tell(l, band.parts, band.at, off);
      if (check) {
        l.coupling = check.coupling;
        l.bands[0].start += check.late * SR;
      }
    }).sure;
  }
  const written = (t: number): string | null | undefined => {
    let cur: string | null | undefined;
    for (const c of p.chords) if (c.t <= t) cur = c.id;
    return cur;
  };
  const rightAt = (e: Sure): boolean | null => {
    const now = written(e.t + 0.06);
    if (!now || !CHORDS[now]) return null;
    return e.id === now || e.id === written(e.t + 0.5);
  };
  let right = 0;
  let known = 0;
  for (const e of sure) {
    const r = rightAt(e);
    if (r === null) continue;
    known++;
    if (r) right++;
  }
  let named = 0;
  let stretches = 0;
  p.chords.forEach((c, i) => {
    if (!c.id || !CHORDS[c.id] || c.t > p.samples.length / SR - 0.5) return;
    const end = p.chords[i + 1]?.t ?? p.samples.length / SR;
    stretches++;
    if (sure.some((e) => e.t >= c.t - 0.5 && e.t < end - 0.06 && e.id === c.id)) named++;
  });
  // A strum is the same strum when it is heard within 0.12 s of where it was heard without the band: with the
  // band the onset of a strum is now and then found at its first string rather than its loudest (still well
  // inside the lessons' window for a strum on time)
  const base = dry.sure.filter((e) => rightAt(e));
  const kept = base.filter((b) => sure.some((e) => Math.abs(e.t - b.t) < 0.12 && e.id === b.id)).length;
  const extra = sure.filter((e) => !dry.onsets.some((t) => Math.abs(t - e.t) < 0.12)).length;
  return { right, known, named, stretches, base: base.length, kept, extra };
}
