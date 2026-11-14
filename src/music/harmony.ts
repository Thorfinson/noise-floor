/**
 * A second voice to sing under a tune: a third below each note, in the key of the song, as choirs and folk
 * singers add one by ear. The key is read off the tune: it ends on its home note, and whether its third above
 * is the major or the minor one says major or minor. A note outside the key gets the minor third below.
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/** The home note of a tune (as a pitch class) and whether it is in minor. */
export function keyOf(midis: number[]): { tonic: number; minor: boolean } {
  const tonic = ((midis[midis.length - 1] % 12) + 12) % 12;
  const count = (d: number): number => midis.filter((m) => (((m - tonic) % 12) + 12) % 12 === d).length;
  return { tonic, minor: count(3) > count(4) };
}

/** The note a third below in the key: two steps of the scale down. */
export function thirdBelow(midi: number, key: { tonic: number; minor: boolean }): number {
  const scale = key.minor ? MINOR : MAJOR;
  const rel = (((midi - key.tonic) % 12) + 12) % 12;
  const deg = scale.indexOf(rel);
  if (deg < 0) return midi - 3;
  const down = scale[(deg + 5) % 7];
  const gap = (rel - down + 12) % 12;
  return midi - gap;
}

/** The second voice of a whole tune. */
export function secondVoice(midis: number[]): number[] {
  const key = keyOf(midis);
  return midis.map((m) => thirdBelow(m, key));
}
