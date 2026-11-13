/**
 * Real voices: how the app hears people singing, measured against what trained annotators wrote down.
 * The recordings are Vocadito (Bittner et al., 40 solo excerpts by 29 singers in seven languages, amateurs
 * and trained, CC BY 4.0), fetched by `npm run samples -- voice` into tests/real/vocadito. For each
 * excerpt: the listener as the singing screens set it up; its readings are compared with the annotated
 * pitch (f0, every 5.8 ms) and with the annotated notes.
 *
 * The measuring is here; `npx vite-node tests/real/voicebench.ts` prints it for every excerpt.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Listener } from '../../src/audio/listener';
import { decodeWav } from '../../src/audio/wav';
import { centsOff, Hold, median, type Frame } from '../../src/core/singing';

const here = dirname(fileURLToPath(import.meta.url));
export const VOCADITO = resolve(here, 'vocadito');
export const haveVoices = (): boolean => existsSync(resolve(VOCADITO, 'Audio', 'vocadito_1.wav'));

const midiOf = (hz: number): number => 69 + 12 * Math.log2(hz / 440);

/** What the singing screens hear in a recording: the listener set for a voice, its pitch readings, with octave slips moved back. */
export function voiceFrames(samples: Float32Array, sr: number): Frame[] {
  const l = new Listener(sr);
  l.a4 = 440;
  l.noteDetection = false;
  l.pitchTracking = true;
  l.pitchClarity = 0.7;
  l.buzzThreshold = Infinity;
  const out: Frame[] = [];
  let prev: Frame | null = null;
  let slipSince = -1;
  l.onPitch = (e) => {
    // as the singing screens do: a reading an octave from the one just before is moved back, for a moment
    let midi = e.midi + e.cents / 100;
    if (prev && e.time - prev.t < 0.1) {
      const d = midi - prev.midi;
      const oct = Math.round(d / 12);
      if (oct && Math.abs(d - oct * 12) < 1.5) {
        if (slipSince < 0) slipSince = e.time;
        if (e.time - slipSince < 0.15) midi -= oct * 12;
        else slipSince = -1;
      } else slipSince = -1;
    } else slipSince = -1;
    const f = { t: e.time, midi };
    prev = f;
    out.push(f);
  };
  for (let i = 0; i < samples.length; i += 128) l.push(samples.subarray(i, Math.min(samples.length, i + 128)));
  return out;
}

export interface Track {
  id: number;
  sr: number;
  samples: Float32Array;
  /** annotated pitch every hop seconds, 0 where nothing is sung */
  f0: { t: number; hz: number }[];
  notes: { at: number; midi: number; dur: number }[];
}

export function loadTrack(id: number): Track {
  const w = decodeWav(readFileSync(resolve(VOCADITO, 'Audio', `vocadito_${id}.wav`)));
  const csv = (f: string): number[][] =>
    readFileSync(resolve(VOCADITO, 'Annotations', f), 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((l) => l.split(',').map(Number));
  return {
    id,
    sr: w.sampleRate,
    samples: w.samples,
    f0: csv(`F0/vocadito_${id}_f0.csv`).map(([t, hz]) => ({ t, hz })),
    notes: csv(`Notes/vocadito_${id}_notesA1.csv`).map(([at, hz, dur]) => ({ at, midi: midiOf(hz), dur })),
  };
}

export const trackIds = (): number[] =>
  readdirSync(resolve(VOCADITO, 'Audio'))
    .map((f) => /^vocadito_(\d+)\.wav$/.exec(f)?.[1])
    .filter((x): x is string => !!x)
    .map(Number)
    .sort((a, b) => a - b);

export interface TrackResult {
  id: number;
  /** of the annotated sung time, how much the listener gave a reading for */
  voicedHeard: number;
  /** of those readings, how many lie within 50 cents of the annotation, the octave not counted, and with it */
  within50: number;
  within50SameOctave: number;
  /** readings where nothing is sung, a share of all readings */
  ghost: number;
  /** annotated notes of 0.3 s or longer: judged right by the middle of what was heard (as with the click), and held long enough to count (as when the app waits) */
  notes: number;
  judged: number;
  held: number;
  /** of the same notes, how often a semitone above or below was taken for held instead (two tries each) */
  heldWrong: number;
}

/** The listener reports a pitch about this long after it was sung: readings are matched with the annotation from that long before. */
export const LAG = 0.05;

/** One track, measured. */
export function measure(tr: Track): TrackResult {
  const frames = voiceFrames(tr.samples, tr.sr);
  const hop = tr.f0[1].t - tr.f0[0].t;
  const at = (t: number): number => tr.f0[Math.max(0, Math.min(tr.f0.length - 1, Math.round(t / hop)))].hz;
  let voiced = 0;
  let covered = 0;
  let i = 0;
  for (const p of tr.f0) {
    if (p.hz <= 0) continue;
    voiced++;
    while (i < frames.length && frames[i].t - LAG < p.t - 0.03) i++;
    if (i < frames.length && Math.abs(frames[i].t - LAG - p.t) < 0.03) covered++;
  }
  let near = 0;
  let nearSame = 0;
  let onVoice = 0;
  let ghost = 0;
  for (const f of frames) {
    const hz = at(f.t - LAG);
    if (hz <= 0) {
      ghost++;
      continue;
    }
    onVoice++;
    const m = midiOf(hz);
    if (Math.abs(centsOff(f.midi, m)) <= 50) near++;
    if (Math.abs(centsOff(f.midi, m, false)) <= 50) nearSame++;
  }
  const long = tr.notes.filter((n) => n.dur >= 0.3);
  let judged = 0;
  let held = 0;
  let heldWrong = 0;
  for (const n of long) {
    const len = n.dur;
    // as the screens see it: the readings of a note arrive a moment after it was sung
    const a = n.at + LAG;
    const inside = frames.filter((f) => f.t >= a + Math.min(0.2, len * 0.3) && f.t <= a + len - Math.min(0.1, len * 0.15));
    if (inside.length >= 2 && Math.abs(median(inside.map((f) => centsOff(f.midi, n.midi)))) <= 50) judged++;
    const span = frames.filter((f) => f.t >= a - 0.05 && f.t <= a + len + 0.05);
    const holds = (target: number): boolean => {
      const h = new Hold(target, 50, 0.25);
      for (const f of span) h.push(f);
      return !!h.done;
    };
    if (holds(n.midi)) held++;
    heldWrong += +holds(n.midi - 1) + +holds(n.midi + 1);
  }
  return { id: tr.id, voicedHeard: covered / Math.max(1, voiced), within50: near / Math.max(1, onVoice), within50SameOctave: nearSame / Math.max(1, onVoice), ghost: ghost / Math.max(1, frames.length), notes: long.length, judged, held, heldWrong };
}
