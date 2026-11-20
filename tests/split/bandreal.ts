// Moved here from tests/bandreal.test.ts so that its heavy blocks can run in test files of their own, side by side
// (see the files that import it). Each top-level block is a function; `only` keeps some of its tests, by their
// place in the block, and `CHUNK` = [k, n] lets a loop over many cases take every n-th, from the k-th.

/**
 * The band through speakers, on the strummed pieces recorded in a real room (tests/real/band.ts): the speaker band
 * through a simulated speaker and room, at the loudness of a comfortable laptop and of a loud speaker box, heard
 * by the listener that is told what the band plays. Skipped when the pieces have not been fetched (npm run
 * samples -- pieces). The full scorecard: npx vite-node tests/real/bandbench.ts.
 */
import { describe, expect, it as vitestIt } from 'vitest';

/** it(), registering only the tests of a block whose place is in `only` (all of them without it). */
const keep = (only?: number[]): typeof vitestIt => {
  let n = 0;
  return ((name: string, fn: () => unknown, timeout?: number) => {
    const at = n++;
    if (!only || only.includes(at)) vitestIt(name, fn, timeout);
  }) as typeof vitestIt;
};
import { played, SETUPS, silent } from '../real/band';
import { havePieces, pieces } from '../real/pieces';

export function part0(only?: number[], CHUNK: [number, number] = [0, 1]): void {
  const it = keep(only);
  void CHUNK;
  describe('the band through speakers, with nobody playing', () => {
    it('is all taken for playing by the plain listener, and nothing of it by the informed one after the speaker test', () => {
      for (const s of SETUPS) {
        const plain = silent(s, 'plain', 'beat', 90, 20);
        expect(plain.notes, s.name).toBeGreaterThan(15);
        const told = silent(s, 'soundcheck', 'beat', 90, 40);
        // the review's target: at most one phantom in two minutes
        expect(told.notes + told.chords, s.name).toBe(0);
        expect(told.onsets, s.name).toBeLessThanOrEqual(1);
      }
    });

    it('is found out by the informed listener itself when there was no speaker test, after a few seconds', () => {
      for (const s of SETUPS.slice(0, 2)) {
        const told = silent(s, 'follow', 'folk', 90, 40);
        expect(told.notes + told.chords, s.name).toBeLessThanOrEqual(1);
      }
    });
  });
}

export function part1(only?: number[], CHUNK: [number, number] = [0, 1]): void {
  const it = keep(only);
  void CHUNK;
  describe.skipIf(!havePieces)('real strummed pieces with the band through speakers', () => {
    it('keeps nearly every strum heard without the band, and names hardly a chord where none was strummed', () => {
      for (const s of SETUPS.slice(1)) {
        let base = 0;
        let kept = 0;
        let extra = 0;
        let right = 0;
        let known = 0;
        for (const p of pieces) {
          const r = played(p, s, 'soundcheck');
          base += r.base;
          kept += r.kept;
          extra += r.extra;
          right += r.right;
          known += r.known;
        }
        // the review's target: within about five points of the hit rate without the band
        expect(kept / base, `${s.name}: ${kept} of ${base}`).toBeGreaterThanOrEqual(0.95);
        expect(right / known, `${s.name}: ${right} of ${known} named right`).toBeGreaterThanOrEqual(0.93);
        expect(extra, s.name).toBeLessThanOrEqual(3);
      }
    });

  });
}
