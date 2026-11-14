import { describe, expect, it } from 'vitest';
import { Listener, type ChordEvent, type NoteEvent } from '../src/audio/listener';
import { addNoise, mixInto, tone } from '../src/audio/synth';
import { allPieces, handsVersion, noteTimes } from '../src/music/content';
import { pieceProfile } from '../src/music/difficulty';
import { pianoChord } from '../src/music/theory';
import { spell } from '../src/ui/staff';
import { havePiano, mix, piano, type Played } from './real/clips';

const SR = 48000;
const CHORDS6 = ['C', 'F', 'G', 'Am', 'Dm', 'Em'];

/**
 * Root and chord in turn, as the lesson listens to them: for the root the listener is told which key is
 * due (as the lesson does), for the chord which chords there are.
 */
function heardInTurn(signal: Float32Array, roots: number[], rootAt: (i: number) => number): { notes: NoteEvent[]; chords: ChordEvent[] } {
  const l = new Listener(SR);
  l.voicing = 'piano';
  l.buzzThreshold = Infinity;
  l.ringThreshold = 0.05;
  l.chordCandidates = CHORDS6;
  const notes: NoteEvent[] = [];
  const chords: ChordEvent[] = [];
  l.onNote = (e) => notes.push(e);
  l.onChord = (e) => chords.push(e);
  for (let i = 0; i < signal.length; i += 128) {
    const t = i / SR;
    const k = roots.findIndex((_, j) => t >= rootAt(j) - 0.2 && t < rootAt(j) + 0.55);
    l.expected = k >= 0 ? [roots[k]] : null;
    l.push(signal.subarray(i, Math.min(signal.length, i + 128)));
  }
  return { notes, chords };
}

describe('both hands on the piano', () => {
  it('makes a version for both hands of every piece of chords: the root in the left on the bar, the chord in the right after it', () => {
    const chords = allPieces().filter((p) => p.kind === 'chords' && !p.of && !p.custom);
    const hands = allPieces().filter((p) => p.hands && p.id.endsWith('~hands'));
    // all but a few quick ones, whose beats leave the left hand no room
    expect(hands.length).toBeGreaterThanOrEqual(0.8 * chords.length);
    for (const h of hands) {
      const plain = allPieces().find((p) => p.id === h.of)!;
      // the phrases last as long as before, and every root is the chord's that follows it, an octave down
      h.phrases.forEach((ph, k) => {
        expect(noteTimes(ph).total, h.id).toBeCloseTo(noteTimes(plain.phrases[k]).total, 6);
        ph.forEach((n, i) => {
          if (!n.left) return;
          const next = ph.slice(i + 1).find((x) => x.chord);
          if (next) expect(n.midi, h.id).toBe(pianoChord(next.chord!).midis[0] - 12);
          expect(n.fg).toBe(5);
        });
      });
      expect(h.phrases.flat().some((n) => n.left), h.id).toBe(true);
    }
    const one = hands[0];
    // it is rated a little harder than with one hand, and says why
    const plain = allPieces().find((p) => p.id === one.of)!;
    expect(pieceProfile(one).points).toBeGreaterThan(pieceProfile(plain).points);
    expect(pieceProfile(one).reasons[0]).toMatch(/both hands/);
    expect(handsVersion(one)).toBeNull();
  });

  it('hears a synthesized root and the chord after it, each for what it is', () => {
    const rootAt = (i: number): number => 0.6 + i * 1.8;
    const roots = CHORDS6.map((c) => pianoChord(c).midis[0] - 12);
    const out = new Float32Array(Math.ceil((rootAt(roots.length) + 1) * SR));
    CHORDS6.forEach((c, i) => {
      mixInto(out, tone({ sr: SR, midi: roots[i], dur: 0.6, piano: true, amp: 0.25, seed: i }), rootAt(i) * SR);
      for (const [k, m] of pianoChord(c).midis.entries()) mixInto(out, tone({ sr: SR, midi: m, dur: 1.1, piano: true, amp: 0.2, seed: 10 + i * 3 + k }), (rootAt(i) + 0.6 + k * 0.005) * SR);
    });
    addNoise(out, 0.0015);
    const { notes, chords } = heardInTurn(out, roots, rootAt);
    CHORDS6.forEach((c, i) => {
      expect(notes.some((n) => Math.abs(n.time - rootAt(i)) < 0.2 && n.midi === roots[i]), `root of ${c}`).toBe(true);
      expect(chords.find((e) => Math.abs(e.time - rootAt(i) - 0.6) < 0.2)?.best, `chord ${c}`).toBe(c);
    });
  });

  it.skipIf(!havePiano)('hears real piano roots in the left hand, and the chord of the right after each', () => {
    const rootAt = (i: number): number => 0.8 + i * 2;
    const roots = CHORDS6.map((c) => pianoChord(c).midis[0] - 12);
    const played: Played[] = [];
    CHORDS6.forEach((c, i) => {
      // the left hand lets go as the right hand strikes
      played.push({ clip: piano(roots[i]), at: rootAt(i), dur: 0.62 });
      pianoChord(c).midis.forEach((k, j) => played.push({ clip: piano(k), at: rootAt(i) + 0.6 + j * 0.006, dur: 1.2 }));
    });
    const { notes, chords } = heardInTurn(mix(played, rootAt(roots.length) + 1), roots, rootAt);
    const said: string[] = [];
    let rootsHeard = 0;
    let chordsNamed = 0;
    CHORDS6.forEach((c, i) => {
      const n = notes.filter((x) => Math.abs(x.time - rootAt(i)) < 0.25).map((x) => x.midi);
      const e = chords.find((x) => Math.abs(x.time - rootAt(i) - 0.6) < 0.25);
      said.push(`${c}: root ${roots[i]} heard as ${n.join('/') || 'nothing'}, chord ${e?.best ?? 'not heard'}`);
      if (n.includes(roots[i])) rootsHeard++;
      if (e?.best === c) chordsNamed++;
    });
    expect(rootsHeard, said.join(' | ')).toBe(6);
    expect(chordsNamed, said.join(' | ')).toBe(6);
  });
});

describe('the staff', () => {
  it('writes each key on its letter, with the sign the chord spells it with', () => {
    expect(spell(60)).toEqual({ step: 28, sign: '' });
    expect(spell(64)).toEqual({ step: 30, sign: '' });
    // the middle key of C minor is E flat, not D sharp
    expect(spell(63, 'Cm')).toEqual({ step: 30, sign: '♭' });
    expect(spell(66, 'D')).toEqual({ step: 31, sign: '♯' });
    expect(spell(48)).toEqual({ step: 21, sign: '' });
  });
});
