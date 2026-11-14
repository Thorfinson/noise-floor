/**
 * A soft accompaniment under playing along with the click: the root of the chord low down at the start of
 * each bar and where the chord changes, its fifth half-way through a long bar, and the chord itself, quiet,
 * where it begins. Made for headphones: through speakers the microphone would hear it as playing.
 */
import { pianoChord } from '../music/theory';
import { mixInto, tone } from './synth';

export interface BackingInput {
  /** chords, each from the moment it begins (in note units) until the next */
  chords: { u: number; id: string }[];
  /** the clicks, in note units; an accent begins a bar */
  clicks: { u: number; accent: boolean }[];
  /** how long the stretch is, in note units */
  units: number;
  /** seconds per note unit */
  unit: number;
  sr: number;
  a4: number;
}

/** The root of a chord in the bass, between B♭1 and A2. */
export function bassOf(id: string): number {
  const root = pianoChord(id).midis[0] % 12;
  return 36 + ((root + 2) % 12) - 2;
}

/** The accompaniment as one sound, beginning at note unit 0. Silent where there are no chords. */
export function backing(o: BackingInput): Float32Array {
  const out = new Float32Array(Math.ceil((o.units * o.unit + 2) * o.sr));
  if (!o.chords.length) return out;
  const chordAt = (u: number): string | undefined => {
    let id: string | undefined;
    for (const c of o.chords) if (c.u <= u + 1e-6) id = c.id;
    return id;
  };
  const bars = o.clicks.filter((c) => c.accent).map((c) => c.u);
  const strike = (u: number, midis: number[], amp: number, dur: number): void => {
    for (const [i, midi] of midis.entries()) mixInto(out, tone({ sr: o.sr, midi, dur, piano: true, amp, a4: o.a4, seed: 11 + i + Math.round(u * 8) }), u * o.unit * o.sr);
  };
  // the chord, quiet, where it begins and at each bar line while it lasts
  const hits = new Set<number>([...o.chords.map((c) => c.u), ...bars].filter((u) => u >= 0 && u < o.units).map((u) => Math.round(u * 1000) / 1000));
  for (const u of [...hits].sort((a, b) => a - b)) {
    const id = chordAt(u);
    if (!id) continue;
    const ring = Math.min(2.4, (([...hits].find((x) => x > u + 1e-6) ?? o.units) - u) * o.unit + 0.25);
    strike(u, pianoChord(id).midis.map((m) => m - 12), 0.05, ring);
    strike(u, [bassOf(id)], 0.16, ring);
  }
  // the fifth in the bass half-way through a bar of four clicks or more, when the chord has not changed there
  for (let b = 0; b < bars.length; b++) {
    const start = bars[b];
    const end = bars[b + 1] ?? o.units;
    const clicks = o.clicks.filter((c) => c.u >= start - 1e-6 && c.u < end - 1e-6);
    if (clicks.length < 4) continue;
    const mid = clicks[Math.floor(clicks.length / 2)].u;
    const id = chordAt(mid);
    if (!id || hits.has(Math.round(mid * 1000) / 1000) || o.chords.some((c) => c.u > start && c.u <= mid)) continue;
    strike(mid, [bassOf(id) + 7], 0.12, Math.min(1.6, (end - mid) * o.unit + 0.2));
  }
  return out;
}
