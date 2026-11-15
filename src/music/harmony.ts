/**
 * A second voice to sing under a tune: a third below each note, inside the scale of the song, as choirs and
 * folk singers add one by ear. The scale is read off the tune: of the seven-note scales (major in each of its
 * modes, so Dorian and Mixolydian tunes too, and harmonic and melodic minor), the one that leaves out the
 * fewest of its notes; where several hold it alike, the plainest, and of those one that the tune ends on as
 * do or la. Each note gets the scale note two steps below it, a minor or a major third. A note outside the
 * scale gets the major third below where that lies in the scale (E under a G♯ that leads up to A), else the
 * minor third.
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const MELODIC = [0, 2, 3, 5, 7, 9, 11];

const pc = (m: number): number => ((m % 12) + 12) % 12;

export interface Key {
  /** the home note of the tune, as a pitch class */
  tonic: number;
  /** whether the third above the home note in the scale is the minor one */
  minor: boolean;
  /** the seven pitch classes of the scale, from the lowest */
  scale: number[];
}

/** The scale of a tune, and its home note: where it ends. */
export function keyOf(midis: number[]): Key {
  const last = pc(midis[midis.length - 1] ?? 0);
  const candidates = [MAJOR, HARMONIC, MELODIC].flatMap((steps, plainness) =>
    Array.from({ length: 12 }, (_, root) => {
      const scale = steps.map((s) => (s + root) % 12).sort((a, b) => a - b);
      // the major scale's do and la, the minor scales' own tonic
      const home = plainness === 0 ? [root, (root + 9) % 12] : [root];
      return { scale, plainness, ends: home.includes(last), out: midis.filter((m) => !scale.includes(pc(m))).length };
    }),
  );
  candidates.sort((a, b) => a.out - b.out || a.plainness - b.plainness || Number(b.ends) - Number(a.ends));
  const { scale } = candidates[0];
  const tonic = scale.includes(last) ? last : scale[0];
  const third = scale[(scale.indexOf(tonic) + 2) % 7];
  return { tonic, minor: (third - tonic + 12) % 12 === 3, scale };
}

/** The note a third below in the scale: two steps of it down; for a note outside it, a third that lands inside. */
export function thirdBelow(midi: number, key: Key): number {
  const { scale } = key;
  const at = scale.indexOf(pc(midi));
  if (at >= 0) return midi - ((pc(midi) - scale[(at + 5) % 7] + 12) % 12);
  if (scale.includes(pc(midi - 4))) return midi - 4;
  return midi - 3;
}

/** The second voice of a whole tune. */
export function secondVoice(midis: number[]): number[] {
  const key = keyOf(midis);
  return midis.map((m) => thirdBelow(m, key));
}
