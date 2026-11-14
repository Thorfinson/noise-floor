/**
 * Both hands at once on the piano, from real recordings (University of Iowa, mezzo-forte) mixed at the same
 * moment: a bass key of the left hand with a melody key of the right, and a root under a whole chord. The
 * numbers are printed by tests/real/handsbench.ts and held as assertions in tests/real.test.ts.
 */
import { Listener } from '../../src/audio/listener';
import { mix, piano, SR } from './clips';

/** The listener as a piano lesson sets it up, with keys struck together as chords of its own; what it names first. */
function first(sig: Float32Array, chords: Record<string, number[]>): string | null {
  const l = new Listener(SR);
  l.voicing = 'piano';
  l.buzzThreshold = Infinity;
  l.ringThreshold = 0.05;
  l.noteDetection = false;
  (l as unknown as { notesOf: (id: string) => number[] }).notesOf = (id: string) => chords[id];
  l.chordCandidates = Object.keys(chords);
  let best: string | null = null;
  l.onChord = (e) => {
    if (best === null && e.best && e.score > 0.6 && e.margin > 0.08) best = e.best;
  };
  for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
  return best;
}

/** What the note path reports for a bass and a melody key struck together (it is made for one key at a time). */
export function hearPair(bass: number, melody: number): number[] {
  const sig = mix([{ clip: piano(melody), at: 0.3 }, { clip: piano(bass), at: 0.3, gain: 0.9 }], 1.9);
  const l = new Listener(SR);
  l.voicing = 'piano';
  l.buzzThreshold = Infinity;
  l.ringThreshold = 0.05;
  l.expected = [bass, melody];
  const notes: number[] = [];
  l.onNote = (e) => notes.push(e.midi);
  for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
  return notes;
}

/**
 * The pair as two keys struck together, against the melody key alone and the melody over another bass (a
 * fourth higher): which is named, when both hands play (withBass) and when only the right does.
 */
export function judgePair(bass: number, melody: number, withBass: boolean): string | null {
  const sig = mix([{ clip: piano(melody), at: 0.3 }, ...(withBass ? [{ clip: piano(bass), at: 0.3, gain: 0.9 }] : [])], 1.9);
  return first(sig, { pair: [bass, melody], mel: [melody], other: [bass + 5, melody] });
}

/** The root in the left hand under a chord in the right, struck together: the whole, the chord alone, or another bass. */
export function judgeChordBass(bass: number, triad: number[], withBass: boolean): string | null {
  const sig = mix([...triad.map((m) => ({ clip: piano(m), at: 0.3, gain: 0.8 })), ...(withBass ? [{ clip: piano(bass), at: 0.3, gain: 0.9 }] : [])], 1.9);
  return first(sig, { full: [bass, ...triad], chord: triad, other: [bass + 5, ...triad] });
}
