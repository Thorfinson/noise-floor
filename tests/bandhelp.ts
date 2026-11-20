/** Helpers of the band's tests: a song of the app's kind to render, and the band as one signal. */
import { LAYERS, type BandInput, type BandParts } from '../src/audio/band';
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
