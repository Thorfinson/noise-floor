/**
 * Helpers of the band's tests: a song of the app's kind to render, the band as one signal, a plain room for it to
 * reach the microphone through, and what a listener told about it reports.
 */
import { LAYERS, type BandInput, type BandParts } from '../src/audio/band';
import { BandEcho } from '../src/audio/echo';
import { Listener } from '../src/audio/listener';
import { addNoise } from '../src/audio/synth';
import { SR } from './helpers';

/** Four chords, a bar each, in a meter: 4/4 (four clicks of two units), 3/4, or 6/8 (two clicks of three). */
export function song(mode: 'phones' | 'speakers', feel: string, bars: number, unit = 0.3, extra: Partial<BandInput> = {}): BandInput {
  const three = feel === 'waltz' || feel === 'lilt';
  const six = feel === 'six' || feel === 'roll';
  const step = six ? 3 : 2;
  const beats = three ? 3 : six ? 2 : 4;
  const len = beats * step;
  const ids = ['G', 'Em', 'C', 'D'];
  return {
    chords: Array.from({ length: bars }, (_, b) => ({ u: b * len, id: ids[b % 4] })),
    clicks: Array.from({ length: bars * beats }, (_, k) => ({ u: k * step, accent: k % beats === 0 })),
    units: bars * len,
    unit,
    sr: SR,
    a4: 440,
    mode,
    feel,
    ...extra,
  };
}

export const mixOf = (p: BandParts): Float32Array => {
  const out = new Float32Array(p.layers.drums.length);
  for (const l of LAYERS) for (let i = 0; i < out.length; i++) out[i] += p.layers[l][i];
  return out;
};
export const peak = (x: Float32Array): number => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/**
 * A plain room: the speakers' sound arrives a little late and quieter, followed by a few reflections, with the
 * microphone's hiss. late is how much later than the listener was told (seconds).
 */
export function room(dry: Float32Array, at: number, length: number, gain = 0.3, late = 0.012): Float32Array {
  const out = new Float32Array(length);
  for (const [d, g] of [[0, 1], [0.007, 0.5], [0.013, 0.35], [0.023, 0.25], [0.041, 0.12]] as const) {
    const start = Math.round((at + late + d) * SR);
    for (let i = 0; i < dry.length && start + i < length; i++) if (start + i >= 0) out[start + i] += gain * g * dry[i];
  }
  addNoise(out, 0.0015, 5);
  return out;
}

/**
 * What the listener reports of a signal, told about a band (or not), after a soundcheck on its first seconds, or
 * with a coupling found before (or neither). Only what happened from `from` seconds on is kept.
 */
export function heard(sig: Float32Array, parts: BandParts | null, at: number, opts: { learn?: number; from?: number; coupling?: number[]; late?: number } = {}) {
  const l = new Listener(SR);
  l.chordCandidates = ['G', 'Em', 'C', 'D', 'Am'];
  const out = { onsets: [] as number[], notes: [] as number[], chords: [] as { t: number; id: string }[] };
  const from = opts.from ?? 0;
  l.onOnset = (e) => (e.time >= from ? out.onsets.push(e.time) : undefined);
  l.onNote = (e) => (e.time >= from ? out.notes.push(e.time) : undefined);
  l.onChord = (e) => (e.time >= from && e.best && e.score > 0.6 && e.margin > 0.08 ? out.chords.push({ t: e.time, id: e.best }) : undefined);
  if (parts) l.bands = [new BandEcho(parts, { drums: 1, bass: 1, keys: 1, lead: 1 }, 1, (at + (opts.late ?? 0)) * SR)];
  if (opts.coupling) l.coupling = opts.coupling;
  let learnt = false;
  if (opts.learn) l.learnEcho();
  for (let i = 0; i < sig.length; i += 512) {
    l.push(sig.subarray(i, i + 512));
    if (opts.learn && !learnt && i / SR >= opts.learn) {
      learnt = true;
      l.learnedEcho();
    }
  }
  return { ...out, listener: l };
}
