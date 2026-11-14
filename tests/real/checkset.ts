/**
 * The hearing check played with real recordings, as a player would play it: two seconds of the room, then each
 * thing asked for, one after the other with time to ring (tests/real.test.ts runs the check over these).
 *   guitar: the six open strings of the nylon-string guitar (University of Iowa), Em, Am, C and G strummed from
 *           its recorded notes (14 ms from string to string), and a hit across dead strings of a steel-string
 *           guitar (IDMT-SMT-Guitar);
 *   piano:  five keys and the chords C, F and G of the recorded grand, its keys a few milliseconds apart.
 */
import { CHORDS, chordMidis, OPEN_STRINGS, pianoChord } from '../../src/music/theory';
import { guitar, hasGuitar, mix, piano, steel, steelClips, type Played } from './clips';

/** Seconds between the things played: enough for each to ring and be judged before the next. */
const GAP = 2.6;

export function guitarCheckSet(gain = 3): Float32Array {
  const played: Played[] = [];
  let t = 2.6;
  OPEN_STRINGS.forEach((m, s) => {
    played.push({ clip: guitar(m, s), at: t, gain, dur: GAP - 0.1 });
    t += GAP;
  });
  for (const c of ['Em', 'Am', 'C', 'G']) {
    chordMidis(CHORDS[c]).forEach((m, s) => {
      if (m !== null && hasGuitar(m, s)) played.push({ clip: guitar(m, s), at: t + s * 0.014, gain, dur: GAP - 0.1 });
    });
    t += GAP;
  }
  // a hit across dead strings: the dead notes of one guitar, string after string
  const dead = steelClips.filter((c) => c.kind === 'dead' && c.guitar === 'FS');
  [...new Map(dead.map((c) => [c.string, c])).values()].slice(0, 5).forEach((c, i) => played.push({ clip: steel(c), at: t + i * 0.012, gain: gain * 2 }));
  t += GAP;
  return mix(played, t + 1);
}

export function pianoCheckSet(gain = 4): Float32Array {
  const played: Played[] = [];
  let t = 2.6;
  for (const m of [60, 64, 67, 72, 57]) {
    played.push({ clip: piano(m), at: t, gain, dur: GAP - 0.1 });
    t += GAP;
  }
  for (const c of ['C', 'F', 'G']) {
    pianoChord(c).midis.forEach((m, i) => played.push({ clip: piano(m), at: t + i * 0.008, gain: gain * 0.8, dur: GAP - 0.1 }));
    t += GAP;
  }
  return mix(played, t + 1);
}
