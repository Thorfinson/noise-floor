/**
 * Whole chords on real pianos, as others recorded them (fetched by `npm run samples -- chords`, where the
 * sources and their licences are named):
 *
 * - hand: A, Am, Bm, C, D, Dm, E, Em, F and G, ten times each, played by hand anywhere on the keyboard
 *   (University of Liège). The clips begin with the chord, and in some the chord before still rings.
 * - upright: triads and sevenths of an upright piano in a room, the microphones at a distance, its keys
 *   moved by the instrument itself (MAPS). Roots anywhere on the keyboard; `low` is the lowest key.
 * - grand: six chords on a grand piano, a microphone under the lid. home: C major on an out-of-tune piano
 *   recorded at home. And the six chords of C major played one after the other (Wikimedia Commons).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FFT } from '../../src/audio/fft';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), 'chords');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.wav')).sort() : [];

export const SR = 48000;

export interface ChordClip {
  set: 'hand' | 'upright' | 'grand' | 'home';
  /** the chord that was played, as the app names it */
  label: string;
  /** lowest key, where the recording says */
  low?: number;
  name: string;
}

export const chordClips: ChordClip[] = files
  .filter((f) => /^(hand|upright|grand|home)\./.test(f))
  .map((f) => {
    const [set, label, third] = f.split('.');
    return { set: set as ChordClip['set'], label, ...(set === 'upright' ? { low: Number(third) } : {}), name: f };
  });

const sequenceFile = files.find((f) => f.startsWith('sequence.'));
/** The chords of the sequence, in order. */
export const sequenceChords = sequenceFile ? sequenceFile.split('.')[1].split('-') : [];
export const haveChords = chordClips.some((c) => c.set === 'hand') && chordClips.some((c) => c.set === 'upright') && chordClips.some((c) => c.set === 'grand') && !!sequenceFile;

function read(name: string): Float32Array {
  const b = readFileSync(resolve(dir, name));
  const n = (b.length - 44) / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(44 + i * 2) / 32768;
  return samples;
}

/**
 * A recording as the app would get it: after a moment of a quiet room (the listener needs to know what
 * quiet is before the first chord), and with a moment after it.
 */
export function heardFrom(name: string, lead = 0.6): Float32Array {
  const samples = read(name);
  const out = new Float32Array(Math.floor(lead * SR) + samples.length + Math.floor(0.8 * SR));
  out.set(samples, Math.floor(lead * SR));
  let s = 7;
  for (let i = 0; i < out.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] += 0.001 * (s / 2147483648 - 1);
  }
  return out;
}
export const sequence = (): Float32Array => heardFrom(sequenceFile!);

/**
 * The pitch of the A of the piano in a recording: the one at which its strongest partials lie nearest to
 * notes. The app is told the same at the start of every piano session, when it measures the piano's A.
 */
export function tuningOf(name: string): number {
  const samples = read(name);
  let peak = 0;
  for (const x of samples) peak = Math.max(peak, Math.abs(x));
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < 0.1 * peak) first++;
  const N = 16384;
  const at = first + Math.floor(0.08 * SR);
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = (samples[at + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const mag = new Float32Array(N / 2 + 1);
  new FFT(N).magnitudes(buf, mag);
  const hz = SR / N;
  const peaks: { f: number; a: number }[] = [];
  for (let k = Math.round(100 / hz); k < Math.round(1200 / hz); k++) {
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) {
      const p = (0.5 * (mag[k - 1] - mag[k + 1])) / (mag[k - 1] - 2 * mag[k] + mag[k + 1]);
      peaks.push({ f: (k + p) * hz, a: mag[k] });
    }
  }
  peaks.sort((x, y) => y.a - x.a);
  let best = 440;
  let bestErr = Infinity;
  for (let a4 = 428; a4 <= 448; a4 += 0.5) {
    let err = 0;
    for (const p of peaks.slice(0, 8)) {
      const m = 69 + 12 * Math.log2(p.f / a4);
      err += p.a * Math.abs(m - Math.round(m));
    }
    if (err < bestErr) {
      bestErr = err;
      best = a4;
    }
  }
  return best;
}
