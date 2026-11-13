/**
 * The piano: its book of pieces, the fingering the app works out, its chords, and whether the listener
 * tells chords struck on the keys apart: with the model piano, and with the keys of a recorded grand
 * piano mixed into chords (`npm run samples` fetches the recordings; without them those tests are skipped).
 */
import { describe, expect, it } from 'vitest';
import { Listener, type ChordEvent } from '../src/audio/listener';
import { addNoise, mixInto, strum } from '../src/audio/synth';
import { poolFor, Run } from '../src/game/run';
import { allPieces, KEY_CHORDS, KEY_CHORDS_ON, KEY_PAIRS, noteTimes, phraseKey, PIANO_PIECES, SONGS, type PianoPiece } from '../src/music/content';
import { pieceProfile, piecesByDifficulty } from '../src/music/difficulty';
import { learningPath } from '../src/music/path';
import { fingering, pianoBook, pianoKey, NOT_FOR_KEYS } from '../src/music/pianobook';
import { isBlackKey, keyLines, keyName, keysAlike, keyTip, keyWeight, pianoChord, strumIs, transposed } from '../src/music/theory';
import { SR } from './helpers';
import { chordClips, haveChords, heardFrom, sequence, sequenceChords, tuningOf, type ChordClip } from './real/chords';
import { detuned, hasPiano, havePiano, mix, piano, room, type Played } from './real/clips';

const book = (): PianoPiece[] => allPieces().filter((p) => !p.of);
const chordsOf = (p: PianoPiece): string[] => p.phrases.flat().map((n) => n.chord ?? n.over).filter((c): c is string => !!c);
/** the chords of a piece in the order the hand goes through them, each change once */
const runOf = (p: PianoPiece): string[] => chordsOf(p).filter((c, i, all) => i === 0 || c !== all[i - 1]);

describe('the piano book', () => {
  it('holds over a hundred pieces, each with a name, an author and something to play', () => {
    const all = book();
    expect(all.length).toBeGreaterThanOrEqual(100);
    expect(new Set(allPieces().map((p) => p.id)).size).toBe(allPieces().length);
    for (const p of all) {
      expect(p.by, p.id).toBeTruthy();
      expect(p.phrases.length, p.id).toBeGreaterThanOrEqual(2);
      for (const ph of p.phrases) expect(ph.length, p.id).toBeGreaterThan(0);
      const seconds = p.phrases.reduce((sum, ph) => sum + noteTimes(ph).total, 0) * p.noteDur;
      expect(seconds, p.id).toBeGreaterThan(6);
      expect(seconds, p.id).toBeLessThan(140);
      // nothing asks for more keys in a phrase than the strip can show
      for (const ph of p.phrases) expect(ph.length, p.id).toBeLessThanOrEqual(18);
    }
    // the three kinds: tunes, chords struck as a whole, chords broken into keys
    const kinds = new Map<string, number>();
    for (const p of all) kinds.set(p.kind ?? 'melody', (kinds.get(p.kind ?? 'melody') ?? 0) + 1);
    expect(kinds.get('melody')).toBeGreaterThanOrEqual(60);
    expect(kinds.get('chords')).toBeGreaterThanOrEqual(20);
    expect(kinds.get('broken')).toBeGreaterThanOrEqual(20);
  });

  it('has the songs of the songbook that are made of chords, with the same chords in the same order, in a key of its own', () => {
    // those it leaves to the guitar ask on the piano the same as another song of their level: about a quarter
    expect(NOT_FOR_KEYS.size).toBeLessThanOrEqual(46);
    for (const id of NOT_FOR_KEYS) expect(SONGS.some((s) => s.id === id), id).toBe(true);
    for (const song of SONGS) {
      if (!song.bars.every((b) => b.chord) || NOT_FOR_KEYS.has(song.id)) continue;
      const piece = pianoBook().find((p) => p.id === `${song.id}~keys`);
      expect(piece, song.id).toBeTruthy();
      const guitar = song.bars.flatMap((b) => {
        const strums = b.notes.map((n) => n.strum).filter((c): c is string => !!c);
        return strums.length ? strums : [b.chord!];
      });
      const there = guitar.filter((c, i) => i === 0 || c !== guitar[i - 1]);
      const here = runOf(piece!);
      expect(here.length, song.id).toBe(there.length);
      // one and the same step leads from every chord of the guitar to the piano's
      const shift = (pianoChord(here[0]).midis[0] - pianoChord(there[0]).midis[0] + 12) % 12;
      there.forEach((c, i) => expect(pianoChord(here[i]).id, `${song.id} ${c}`).toBe(pianoChord(transposed(c, shift)).id));
      // and it is the key that asks least of the hand, unless the piece names its key
      const cost = (ids: string[]): number => [...new Set(ids)].reduce((sum, c) => sum + keyWeight(c), 0);
      if (!/ in [A-G]/.test(song.title)) for (let t = 0; t < 12; t++) expect(cost(here), `${song.id} moved by ${t}`).toBeLessThanOrEqual(cost(there.map((c) => transposed(c, t))));
    }
    expect(runOf(pianoBook().find((p) => p.id === 'canon-in-d~keys')!)[0]).toBe('D');
  });

  it('is spread over the four levels, with all three kinds on each', () => {
    const count = [0, 0, 0, 0, 0];
    const kinds = [0, 1, 2, 3, 4].map(() => new Set<string>());
    for (const p of book()) {
      const prof = pieceProfile(p);
      count[prof.level]++;
      kinds[prof.level].add(prof.kind);
    }
    // none holds fewer than a seventh of the pieces, none more than three eighths
    const total = count.slice(1).reduce((a, b) => a + b, 0);
    for (const lv of [1, 2, 3, 4]) {
      expect(count[lv], count.slice(1).join(' / ')).toBeGreaterThanOrEqual(total / 7);
      expect(count[lv], count.slice(1).join(' / ')).toBeLessThanOrEqual((3 * total) / 8);
    }
    for (const lv of [1, 2, 3, 4]) expect([...kinds[lv]].sort(), `level ${lv}`).toEqual(['broken', 'chords', 'melody']);
  });

  it('suggests them easiest first, the kinds taking turns within a level', () => {
    const order = piecesByDifficulty().filter((p) => !p.of);
    const levels = order.map((p) => pieceProfile(p).level);
    expect(levels).toEqual(levels.slice().sort((a, b) => a - b));
    // the first three are one of each kind: whoever follows the order meets chords at once
    expect(order.slice(0, 3).map((p) => pieceProfile(p).kind)).toEqual(['melody', 'chords', 'broken']);
    expect(order[0].id).toBe('ode-to-joy');
    // within a kind, the ones that ask for less come first
    for (const kind of ['melody', 'chords', 'broken']) {
      const points = order.filter((p) => pieceProfile(p).level === 1 && pieceProfile(p).kind === kind).map((p) => pieceProfile(p).points);
      expect(points, kind).toEqual(points.slice().sort((a, b) => a - b));
    }
  });

  it('gives a song whose chords are broken into keys a basic version: the same chords, struck as a whole', () => {
    const basics = allPieces().filter((p) => p.of);
    expect(basics.length).toBeGreaterThanOrEqual(20);
    for (const b of basics) {
      const full = allPieces().find((p) => p.id === b.of)!;
      expect(full.kind, b.id).toBe('broken');
      expect(b.kind, b.id).toBe('chords');
      expect(runOf(b), b.id).toEqual(runOf(full));
      // one chord on every click
      for (const n of b.phrases.flat()) expect(n.len ?? 1, b.id).toBe(b.beat);
    }
  });

  it('breaks a chord into keys of that chord, with a finger for each, and names it where it begins', () => {
    for (const p of book().filter((x) => x.kind === 'broken')) {
      let over = '';
      for (const n of p.phrases.flat()) {
        if (n.over) over = n.over;
        expect(over, p.id).toBeTruthy();
        const keys = pianoChord(over).midis;
        // a key of the chord, or its lowest key an octave up
        expect(keys.includes(n.midi) || n.midi === keys[0] + 12, `${p.id} ${over} ${n.midi}`).toBe(true);
        expect(n.fg, p.id).toBeGreaterThanOrEqual(1);
        expect(n.fg, p.id).toBeLessThanOrEqual(5);
      }
    }
  });

  it('keeps tunes within reach: between the F below middle C and the C two octaves above, a finger on every note', () => {
    for (const p of book().filter((x) => (x.kind ?? 'melody') === 'melody')) {
      for (const n of p.phrases.flat()) {
        expect(n.midi, p.id).toBeGreaterThanOrEqual(53);
        expect(n.midi, p.id).toBeLessThanOrEqual(84);
        if (!PIANO_PIECES.includes(p) || n.fg) {
          expect(n.fg, p.id).toBeGreaterThanOrEqual(1);
          expect(n.fg, p.id).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it('counts phrases that are note for note the same as one skill', () => {
    const twinkle = PIANO_PIECES.find((p) => p.id === 'twinkle')!;
    expect(phraseKey(twinkle, 0)).toBe('bar:twinkle:p1');
    expect(phraseKey(twinkle, 4)).toBe('bar:twinkle:p1');
    expect(phraseKey(twinkle, 3)).toBe('bar:twinkle:p3');
    expect(phraseKey(twinkle, 1)).toBe('bar:twinkle:p2');
  });
});

describe('the fingering the app works out', () => {
  it('passes the thumb under where the scales do', () => {
    expect(fingering([[60, 62, 64, 65, 67, 69, 71, 72]])[0]).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    expect(fingering([[72, 71, 69, 67, 65, 64, 62, 60]])[0]).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
    expect(fingering([[55, 57, 59, 60, 62, 64, 66, 67]])[0]).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    // in F the thumb would land on the black B flat after the third finger: it passes after the fourth
    expect(fingering([[65, 67, 69, 70, 72, 74, 76, 77]])[0]).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
    expect(fingering([[62, 64, 66, 67, 69, 71, 73, 74]])[0]).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
  });

  it('keeps one finger on each key while a tune stays under the hand', () => {
    // Ode to Joy, Hänschen klein: five keys, five fingers, whatever the phrase
    for (const id of ['haenschen-klein', 'mary-lamb', 'go-tell-aunt-rhody', 'kuckuck', 'jingle-bells']) {
      const piece = pianoBook().find((p) => p.id === id)!;
      const finger = new Map<number, number>();
      for (const n of piece.phrases.flat()) {
        if (finger.has(n.midi)) expect(n.fg, `${id} ${n.midi}`).toBe(finger.get(n.midi));
        finger.set(n.midi, n.fg!);
      }
      expect(finger.get(60), id).toBe(1);
    }
  });

  it('spreads the hand over a broken chord, and never hops with one finger from key to key in an easy tune', () => {
    expect(fingering([[72, 67, 64, 60]])[0]).toEqual([5, 3, 2, 1]);
    for (const p of book().filter((x) => (x.kind ?? 'melody') === 'melody' && pieceProfile(x).level === 1 && !PIANO_PIECES.includes(x))) {
      for (const ph of p.phrases) for (let i = 1; i < ph.length; i++) if (ph[i].midi !== ph[i - 1].midi) expect(ph[i].fg, `${p.id} ${ph[i - 1].midi}>${ph[i].midi}`).not.toBe(ph[i - 1].fg);
    }
  });

  it('keeps the thumb off the black keys where it can', () => {
    let thumbs = 0;
    let blacks = 0;
    for (const p of book().filter((x) => (x.kind ?? 'melody') === 'melody' && !PIANO_PIECES.includes(x))) {
      for (const n of p.phrases.flat()) {
        if (!isBlackKey(n.midi)) continue;
        blacks++;
        if (n.fg === 1) thumbs++;
      }
    }
    expect(blacks).toBeGreaterThan(20);
    expect(thumbs / blacks).toBeLessThan(0.05);
  });
});

describe('chords on the piano', () => {
  it('finds a chord by its name: its lowest key the first of that name from middle C', () => {
    expect(pianoChord('C')).toMatchObject({ midis: [60, 64, 67], fingers: [1, 3, 5], keys: ['C', 'E', 'G'] });
    expect(pianoChord('Am').midis).toEqual([69, 72, 76]);
    expect(pianoChord('G7')).toMatchObject({ midis: [67, 71, 74, 77], fingers: [1, 2, 3, 5] });
    expect(pianoChord('F#m-easy').id).toBe('F#m');
    expect(pianoChord('Bb').name).toBe('B♭');
    expect(pianoChord('Eb').name).toBe('E♭');
    expect(pianoChord('Dsus4').midis).toEqual([62, 67, 69]);
  });

  it('names the keys of a chord with the letters of that chord', () => {
    expect(pianoChord('Cm').keys).toEqual(['C', 'E♭', 'G']);
    expect(pianoChord('D').keys).toEqual(['D', 'F♯', 'A']);
    expect(pianoChord('Bb').keys).toEqual(['B♭', 'D', 'F']);
    expect(pianoChord('C7').keys).toEqual(['C', 'E', 'G', 'B♭']);
    expect(pianoChord('F#m').keys).toEqual(['F♯', 'A', 'C♯']);
    expect(pianoChord('Ab').keys).toEqual(['A♭', 'C', 'E♭']);
    expect(pianoChord('Bm7b5').keys).toEqual(['B', 'D', 'F', 'A']);
    expect(keyName(63, 'Cm')).toBe('E♭4');
    expect(keyName(63)).toBe('D♯4');
    expect(keyName(72, 'C', false)).toBe('C');
  });

  it('rates a chord by its keys: white ones are easy, a black key in the middle less so, a shape that starts on one hardest', () => {
    for (const c of KEY_CHORDS) expect(keyWeight(c), c).toBe(0);
    expect(['D', 'A', 'E', 'G7', 'Bm', 'Cm'].map(keyWeight)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(['Bb', 'F#m', 'D7', 'C7'].map(keyWeight)).toEqual([2, 2, 2, 2]);
    expect(keyWeight('B7')).toBe(3);
    // the chord check offers the plain ones first
    for (const c of KEY_CHORDS_ON) expect(keyWeight(c), c).toBeGreaterThanOrEqual(1);
  });

  it('moves a chord to another key, and finds the key in which a song lies best', () => {
    expect(transposed('Am', 3)).toBe('Cm');
    expect(transposed('G', 5)).toBe('C');
    expect(transposed('F#m', -2)).toBe('Em');
    expect(transposed('Cmaj7', 7)).toBe('Gmaj7');
    expect(transposed('A7sus4', -2)).toBe('G7sus4');
    expect(transposed('B', 1)).toBe('C');
    expect(pianoKey(['A', 'D', 'E'])).toBe(3);
    expect(pianoKey(['C', 'F', 'G', 'Am'])).toBe(0);
    expect(['G', 'C', 'D', 'Em'].map((c) => transposed(c, pianoKey(['G', 'C', 'D', 'Em'])))).toEqual(['C', 'F', 'G', 'Am']);
  });

  it('says how to get from one chord to the next', () => {
    expect(keyTip('C', 'G')).toMatch(/keeps its shape and moves 4 keys up, to the right: the thumb lands on G/);
    expect(keyTip('G', 'C')).toMatch(/4 keys down, to the left: the thumb lands on C/);
    // C and Am have two notes in common, but not the same keys: A minor lies an octave further up
    expect(keyTip('C', 'Am')).toBe('The hand keeps its shape and moves 5 keys up, to the right: the thumb lands on A.');
    expect(keyTip('F', 'Dm')).toMatch(/F and A are in both chords, under another finger/);
    expect(keyTip('C', 'D')).toMatch(/Finger 3 takes the black key F♯/);
    expect(keyTip('D', 'G')).toMatch(/White keys only again/);
    expect(keyTip('C', 'Cm')).toMatch(/The thumb stays where it is\. Finger 3 goes to E♭/);
    expect(keyLines('D').join(' ')).toMatch(/Middle finger \(3\) on F♯, a black key/);
    expect(keyLines('C')).toHaveLength(4);
  });

  it('offers changes between chords that can be told apart', () => {
    for (const [a, b] of KEY_PAIRS) expect(keysAlike(a, b), `${a} ${b}`).toBeLessThan(0.7);
    expect(keysAlike('C', 'Cmaj7')).toBeGreaterThan(0.8);
    expect(keysAlike('G', 'Em7')).toBeGreaterThan(0.8);
    expect(keysAlike('C', 'D')).toBe(0);
  });
});

/** What the listener makes of a signal, set up for the piano with these chords to choose from. */
function hear(sig: Float32Array, ids: string[], a4 = 440): ChordEvent[] {
  const l = new Listener(SR);
  l.a4 = a4;
  l.voicing = 'piano';
  l.buzzThreshold = Infinity;
  l.noteDetection = false;
  l.chordCandidates = ids;
  const got: ChordEvent[] = [];
  l.onChord = (e) => got.push(e);
  for (let i = 0; i < sig.length; i += 128) l.push(sig.subarray(i, Math.min(sig.length, i + 128)));
  return got;
}

/** A chord struck on the model piano: its keys a few milliseconds apart, as a hand strikes them. */
const struck = (id: string, dur: number): Float32Array => strum(pianoChord(id).midis, SR, dur, { piano: true, amp: 0.2 }, 5);

describe('chords struck on the model piano', () => {
  it('are heard right: every change of chords in every piece of whole chords is taken for the chord it goes to', () => {
    const heard = new Map<string, ChordEvent | undefined>();
    const fails: string[] = [];
    for (const p of allPieces().filter((x) => x.kind === 'chords')) {
      const run = runOf(p);
      const ids = [...new Set(run)];
      const changes = new Set<string>();
      for (let i = 1; i < run.length; i++) changes.add(`${run[i - 1]}>${run[i]}`);
      for (const change of changes) {
        const [a, b] = change.split('>');
        const key = `${ids.slice().sort().join()}|${change}`;
        if (!heard.has(key)) {
          const sig = new Float32Array(Math.floor(2.6 * SR));
          mixInto(sig, struck(a, 0.88), 0.5 * SR);
          mixInto(sig, struck(b, 1.2), 1.4 * SR);
          addNoise(sig, 0.0015);
          heard.set(key, hear(sig, ids).find((e) => e.time > 1.3));
        }
        const e = heard.get(key);
        if (!e || !strumIs(e, b, true)) fails.push(`${p.id} ${change}: ${e ? `${e.best} ${e.score.toFixed(2)}, wanted ${(e.sims[b] ?? 0).toFixed(2)}` : 'nothing heard'}`);
      }
    }
    expect(fails).toEqual([]);
  }, 240000);

  it('are heard every time when the same chord is struck again and again, as a song of chords asks', () => {
    for (const gap of [0.5, 0.45]) {
      for (const id of ['C', 'G', 'Am', 'F', 'D7']) {
        const sig = new Float32Array(Math.floor((0.5 + 4 * gap + 1.2) * SR));
        // to strike a chord again its keys have to come up first: the dampers stop it a moment before
        for (let k = 0; k < 4; k++) mixInto(sig, struck(id, gap - 0.06), (0.5 + k * gap) * SR);
        addNoise(sig, 0.0015);
        const got = hear(sig, ['C', 'F', 'G', 'Am', 'Dm', 'D7']);
        expect(got.length, `${id} every ${gap} s`).toBe(4);
        for (const e of got) expect(strumIs(e, id, true), `${id} every ${gap} s: ${e.best}`).toBe(true);
      }
    }
  });

  it('are never asked for again sooner than the practice piano can be heard striking them', () => {
    for (const p of allPieces().filter((x) => x.kind === 'chords')) {
      for (const n of p.phrases.flat()) expect((n.len ?? 1) * p.noteDur, p.id).toBeGreaterThanOrEqual(0.45);
    }
    // a quick song in six-eight is struck once on each of its two beats, not on every eighth
    const jig = allPieces().find((p) => p.id === 'when-johnny~keys')!;
    expect(new Set(jig.phrases.flat().map((n) => n.len ?? 1))).toEqual(new Set([3]));
  });

  it('are not taken for a chord that has nothing in common with them', () => {
    const sig = new Float32Array(Math.floor(2 * SR));
    mixInto(sig, struck('D', 1.2), 0.5 * SR);
    addNoise(sig, 0.0015);
    const [e] = hear(sig, ['C', 'D', 'G']);
    expect(e.best).toBe('D');
    expect(strumIs(e, 'C', true)).toBe(false);
    expect(strumIs(e, 'G', true)).toBe(false);
  });
});

const PIANO_A4 = 441;
const PIANO_GAIN = 4;
/** A chord on the recorded piano: its keys a few milliseconds apart, held so long. */
const played = (id: string, at: number, held: number): Played[] | null => {
  const keys = pianoChord(id).midis;
  return keys.every((m) => hasPiano(m)) ? keys.map((m, i) => ({ clip: piano(m), at: at + i * 0.006, dur: held, gain: PIANO_GAIN / 2 })) : null;
};

describe.skipIf(!havePiano)('chords struck on a real piano', () => {
  const FAMILIES: Record<string, string[]> = {
    'in C': ['C', 'F', 'G', 'Am', 'Dm', 'Em'],
    'in G': ['G', 'C', 'D', 'Em', 'Am', 'Bm'],
    'in D': ['D', 'G', 'A', 'Bm', 'Em', 'F#m'],
    sevenths: ['C', 'C7', 'F', 'G7', 'Am7', 'Dm7', 'Em7', 'Fmaj7', 'Cmaj7'],
    colours: ['D', 'Dsus4', 'Dsus2', 'A', 'Asus4', 'Cadd9', 'G', 'Em7'],
    flats: ['F', 'Bb', 'C', 'Dm', 'Gm', 'Ab', 'Db', 'Fm', 'Cm'],
  };

  it('are told apart: of the changes within a family of chords at least 97 of 100 are taken for the right chord, and every one is heard', () => {
    let total = 0;
    let right = 0;
    const fails: string[] = [];
    for (const [name, ids] of Object.entries(FAMILIES)) {
      for (const a of ids) {
        for (const b of ids) {
          if (a === b) continue;
          const first = played(a, 0.6, 0.9);
          const second = played(b, 1.6, 0.9);
          if (!first || !second) continue;
          const e = hear(mix([...first, ...second], 3.2), ids, PIANO_A4).find((x) => x.time > 1.5);
          total++;
          expect(e, `${name}: ${a} > ${b} was not heard`).toBeTruthy();
          if (e && strumIs(e, b, true)) right++;
          else fails.push(`${name} ${a}>${b}: ${e?.best}`);
        }
      }
    }
    expect(total).toBeGreaterThan(250);
    expect(right / total, fails.join(' · ')).toBeGreaterThanOrEqual(0.97);
  }, 240000);

  it('are heard every time when the same chord is struck four times, from half a second down to three tenths apart', () => {
    for (const gap of [0.5, 0.33, 0.3]) {
      for (const id of ['C', 'G', 'Am', 'F']) {
        const hits = [0, 1, 2, 3].flatMap((k) => played(id, 0.6 + k * gap, gap - 0.06)!);
        const got = hear(mix(hits, 0.6 + 4 * gap + 1.2), ['C', 'F', 'G', 'Am', 'Dm', 'Em'], PIANO_A4);
        expect(got.length, `${id} every ${gap} s`).toBe(4);
        for (const e of got) expect(strumIs(e, id, true), `${id} every ${gap} s: ${e.best}`).toBe(true);
      }
    }
  });

  /**
   * The same changes as a living room and an old piano would give them: reverberation, every key a little
   * out of tune with the others and the whole piano flat (the app has been told how flat, as it is at the
   * start of every piano session), fingers of unequal strength, keys that do not go down together, the
   * pedal held. Returns how many changes were taken for the right chord, and how often the chord that was
   * struck would also have passed for another one of the family that has less than 0.6 of its keys in common.
   */
  function under(c: { room?: [number, number]; off?: number; flat?: number; uneven?: boolean; spread?: number; pedal?: boolean }, families: string[]): { total: number; right: number; mistaken: number } {
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const off = new Map<number, number>();
    const offOf = (m: number): number => {
      if (!off.has(m)) off.set(m, c.off ? (rnd() * 2 - 1) * c.off : 0);
      return off.get(m)! + (c.flat ?? 0);
    };
    const a4 = PIANO_A4 * Math.pow(2, (c.flat ?? 0) / 1200);
    let total = 0;
    let right = 0;
    let mistaken = 0;
    for (const name of families) {
      const ids = FAMILIES[name];
      for (const a of ids) {
        for (const b of ids) {
          const keys = [...pianoChord(a).midis, ...pianoChord(b).midis];
          if (a === b || !keys.every((m) => hasPiano(m))) continue;
          const strike = (id: string, at: number, dur: number | undefined): Played[] => pianoChord(id).midis.map((m, i) => ({ clip: detuned(piano(m), offOf(m)), at: at + (c.spread ? rnd() * c.spread : i * 0.006), dur, gain: (PIANO_GAIN / 2) * (c.uneven ? 0.35 + 0.65 * rnd() : 1) }));
          let sig = mix([...strike(a, 0.6, c.pedal ? undefined : 0.9), ...strike(b, 1.6, 0.9)], 3.2);
          if (c.room) sig = room(sig, c.room[0], c.room[1]);
          const e = hear(sig, ids, a4).find((x) => x.time > 1.5);
          total++;
          if (!e) continue;
          if (strumIs(e, b, true)) right++;
          for (const other of ids) if (other !== b && keysAlike(other, b) < 0.6 && strumIs(e, other, true)) mistaken++;
        }
      }
    }
    return { total, right, mistaken };
  }

  it('are told apart in a living room, on a piano whose keys are out of tune, with the pedal held, and with all of that at once', () => {
    const families = ['in C', 'in G', 'sevenths'];
    const cases: [string, Parameters<typeof under>[0]][] = [
      ['a living room', { room: [0.5, 0.7] }],
      ['every key up to 30 cents off', { off: 30 }],
      ['the pedal held', { pedal: true }],
      ['an old upright in a living room', { room: [0.5, 0.7], off: 20, flat: -35, uneven: true, spread: 0.02 }],
    ];
    for (const [name, c] of cases) {
      const r = under(c, families);
      expect(r.total, name).toBeGreaterThan(120);
      expect(r.right / r.total, `${name}: ${r.right} of ${r.total}`).toBeGreaterThanOrEqual(0.97);
      // and a chord is not let through for one it has little in common with
      expect(r.mistaken, name).toBeLessThanOrEqual(1);
    }
  }, 240000);

  it('are heard key by key on such a piano too: a tune and a broken chord, in the room, out of tune and flat', () => {
    let seed = 99;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const flat = -35;
    for (const keys of [
      [60, 62, 64, 65, 67, 65, 64, 62, 60],
      [60, 64, 67, 64, 60, 64, 67, 72],
      [67, 71, 74, 71, 69, 72, 76, 72],
    ]) {
      const l = new Listener(SR);
      l.a4 = PIANO_A4 * Math.pow(2, flat / 1200);
      l.voicing = 'piano';
      l.buzzThreshold = Infinity;
      l.ringThreshold = 0.05;
      const got: number[] = [];
      l.onNote = (e) => got.push(e.midi);
      const sig = room(mix(keys.map((m, i) => ({ clip: detuned(piano(m), flat + (rnd() * 2 - 1) * 20), at: 0.6 + i * 0.45, dur: 0.5, gain: PIANO_GAIN })), 0.6 + keys.length * 0.45 + 1.2), 0.5, 0.7);
      for (let i = 0; i < sig.length; i += 128) l.push(sig.subarray(i, Math.min(sig.length, i + 128)));
      expect(got, keys.join(' ')).toEqual(keys);
    }
  });

  it('are heard key by key when they are broken, as the pieces of broken chords ask', () => {
    for (const id of ['C', 'G', 'Am']) {
      const c = pianoChord(id);
      const keys = [c.midis[0], c.midis[1], c.midis[2], c.midis[1]];
      const l = new Listener(SR);
      l.a4 = PIANO_A4;
      l.voicing = 'piano';
      l.buzzThreshold = Infinity;
      l.ringThreshold = 0.05;
      const got: number[] = [];
      l.onNote = (e) => got.push(e.midi);
      const sig = mix(keys.map((m, i) => ({ clip: piano(m), at: 0.6 + i * 0.45, dur: 0.5, gain: PIANO_GAIN })), 3.4);
      for (let i = 0; i < sig.length; i += 128) l.push(sig.subarray(i, Math.min(sig.length, i + 128)));
      expect(got, id).toEqual(keys);
    }
  });
});

describe.skipIf(!havePiano)('one key, or a chord', () => {
  const SIX = ['C', 'F', 'G', 'Am', 'Dm', 'Em'];

  it('does not take a single key for a chord, though its harmonics spell one', () => {
    // the G above middle C sounds its octave, its fifth and its third: G, D and B, the chord of G
    const taken: string[] = [];
    for (let m = 60; m <= 76; m++) {
      if (!hasPiano(m)) continue;
      const [e] = hear(mix([{ clip: piano(m), at: 0.6, dur: 1.2, gain: PIANO_GAIN }], 2.6), SIX, PIANO_A4);
      if (e && SIX.some((c) => strumIs(e, c, true))) taken.push(String(m));
    }
    expect(taken).toEqual([]);
  });

  it('still hears a chord when one of its keys is struck much harder than the others', () => {
    let right = 0;
    let total = 0;
    for (const id of SIX) {
      const keys = pianoChord(id).midis;
      for (let loud = 0; loud < keys.length; loud++) {
        total++;
        // the loud key four times as strong as each of the other two
        const [e] = hear(mix(keys.map((m, i) => ({ clip: piano(m), at: 0.6 + i * 0.006, dur: 1.2, gain: i === loud ? 3 : 0.75 })), 2.6), SIX, PIANO_A4);
        if (e && strumIs(e, id, true)) right++;
      }
    }
    expect(right, `${right} of ${total}`).toBeGreaterThanOrEqual(total - 1);
  });
});

/** The chords of the key a chord belongs to (I, IV, V, vi, ii, iii), with the chord itself in its place: what a song would choose between. */
function familyOf(label: string): string[] {
  const c = pianoChord(label);
  const pc = c.midis[0] % 12;
  const minor = c.midis[1] - c.midis[0] === 3;
  const tonic = minor ? pc + 3 : pc;
  const ids = [transposed('C', tonic), transposed('C', tonic + 5), transposed('C', tonic + 7), transposed('Cm', tonic + 9), transposed('Cm', tonic + 2), transposed('Cm', tonic + 4)];
  const plain = transposed(minor ? 'Cm' : 'C', pc);
  return ids.map((x) => (x === plain ? label : x));
}

describe.skipIf(!haveChords)('chords on real pianos, as others recorded them', () => {
  const TEN = ['A', 'Am', 'Bm', 'C', 'D', 'Dm', 'E', 'Em', 'F', 'G'];
  const SIX = ['C', 'Dm', 'Em', 'F', 'G', 'Am'];
  /** how many of these clips are taken for the chord that was played, and which are not */
  function taken(clips: ChordClip[], ids: (c: ChordClip) => string[], a4: (c: ChordClip) => number): { right: number; mistaken: number; wrong: string[] } {
    let right = 0;
    let mistaken = 0;
    const wrong: string[] = [];
    for (const c of clips) {
      const among = ids(c);
      const [e] = hear(heardFrom(c.name), among, a4(c));
      if (e && strumIs(e, c.label, true)) right++;
      else wrong.push(`${c.name}: ${e ? e.best : 'not heard'}`);
      // would it also have passed for a chord it has little in common with?
      if (e) mistaken += among.filter((x) => x !== c.label && keysAlike(x, c.label) < 0.6 && strumIs(e, x, true)).length;
    }
    return { right, mistaken, wrong };
  }

  it('takes every chord of a grand piano played by hand for itself, and the C of an out-of-tune piano at home', () => {
    const clips = chordClips.filter((c) => c.set === 'grand' || c.set === 'home');
    expect(clips.length).toBeGreaterThanOrEqual(7);
    // the app is told the pitch of the piano at the start of every session: here it is read off the recording
    const r = taken(clips, () => SIX, (c) => tuningOf(c.name));
    expect(r.wrong).toEqual([]);
    expect(r.mistaken).toBe(0);
  });

  it('hears six chords played one after the other by hand in their order', () => {
    const got = hear(sequence(), SIX, 439.5);
    expect(got.map((e) => e.best)).toEqual(sequenceChords);
    for (const [i, e] of got.entries()) expect(strumIs(e, sequenceChords[i], true), sequenceChords[i]).toBe(true);
  });

  it('takes every triad and seventh of an upright piano in a room for itself, from an octave and a half below the place the app shows a chord in to an octave above it', () => {
    const clips = chordClips.filter((c) => c.set === 'upright' && c.low! >= 43 && c.low! < 84);
    expect(clips.length).toBeGreaterThanOrEqual(40);
    // twelve of them lie where the app shows a chord, with its lowest key between middle C and the B above
    expect(clips.filter((c) => c.low! >= 60 && c.low! < 72).length).toBeGreaterThanOrEqual(12);
    const r = taken(clips, (c) => familyOf(c.label), () => 440);
    expect(r.wrong).toEqual([]);
    expect(r.mistaken).toBe(0);
  }, 120000);

  it('takes most chords for themselves that are played by hand anywhere on the keyboard, and most of those of the upright below G2', () => {
    const hand = chordClips.filter((c) => c.set === 'hand');
    expect(hand).toHaveLength(100);
    // the piano of these recordings is some twelve cents flat
    const byHand = taken(hand, () => TEN, () => 437);
    expect(byHand.right, byHand.wrong.join(' · ')).toBeGreaterThanOrEqual(90);
    const low = chordClips.filter((c) => c.set === 'upright' && c.low! < 43);
    const deep = taken(low, (c) => familyOf(c.label), () => 440);
    expect(deep.right / low.length, deep.wrong.join(' · ')).toBeGreaterThanOrEqual(0.8);
  }, 240000);
});

describe('runs on the piano', () => {
  it('send chord changes between the first chords, each with the keys of both', () => {
    const pool = poolFor('kchanges');
    expect(pool).toHaveLength(KEY_PAIRS.length);
    for (const p of pool) {
      expect(p.kind).toBe('chg');
      expect(p.piano).toBe(true);
      expect(p.key).toMatch(/^pair:p\.[A-G]/);
    }
    expect(pool[0].key).toBe('pair:p.C>G');
    expect(pool[0].label).toBe('C → G');
  });

  it('send the phrases of a tune, a long one in two halves, and the chord changes of a piece of chords', () => {
    const tune = poolFor('piece', allPieces().find((p) => p.id === 'joy-to-the-world')!);
    expect(tune.length).toBeGreaterThanOrEqual(6);
    for (const p of tune) {
      expect(p.kind).toBe('keys');
      expect(p.keys.length).toBeLessThanOrEqual(10);
    }
    for (const piece of allPieces().filter((p) => p.kind === 'chords')) {
      const pool = poolFor('piece', piece);
      for (const p of pool) {
        expect(p.kind, piece.id).toBe('chg');
        expect(p.piano, piece.id).toBe(true);
        expect(keysAlike(p.pair![0], p.pair![1]), `${piece.id} ${p.label}`).toBeLessThan(0.8);
      }
      // a piece of more than one chord has a change to send, unless its chords are too alike to tell apart
      if (new Set(runOf(piece)).size > 1 && runOf(piece).some((c, i, all) => i > 0 && keysAlike(c, all[i - 1]) < 0.8)) expect(pool.length, piece.id).toBeGreaterThan(0);
    }
    const broken = poolFor('piece', allPieces().find((p) => p.id === 'wonderwall~keys')!);
    expect(broken.every((p) => p.kind === 'keys')).toBe(true);
  });

  it('count a change between two chords of the piano like one of the guitar', () => {
    const run = new Run('kchanges', poolFor('kchanges').slice(0, 1), () => 1, { speed: 60, waves: 1, rng: () => 0.5 });
    run.update(0);
    const foe = run.locked()!;
    expect(run.chordIds()).toEqual(['C', 'G']);
    expect(run.wanted()).toEqual(['C']);
    let t = 1;
    for (const c of ['C', 'G', 'C', 'G', 'C']) expect(run.chord(c, (t += 1.5))).toBe(true);
    const cleared = run.events.find((e) => e.type === 'clear');
    expect(cleared && cleared.type === 'clear' && cleared.key).toBe('pair:p.C>G');
    // four changes in six seconds: forty a minute
    expect(cleared && cleared.type === 'clear' && Math.round(cleared.value!)).toBe(40);
    expect(foe.hit).toBe(5);
  });
});

describe('the path on the piano', () => {
  it('leads from five fingers over the first chords and their changes to the pieces, level by level', () => {
    const stages = learningPath('piano');
    expect(stages.filter((s) => s.state !== 'side').map((s) => s.id)).toEqual(['hands', 'chords', 'kchanges', 'pieces1', 'pieces2', 'pieces3', 'pieces4']);
    expect(stages.filter((s) => s.state === 'side').map((s) => s.id)).toEqual(['scales', 'morekeys']);
    expect(stages.find((s) => s.id === 'chords')!.items.map((i) => i.label)).toEqual(['C', 'F', 'G', 'Am', 'Dm', 'Em']);
    for (const lv of [1, 2, 3, 4]) expect(stages.find((s) => s.id === `pieces${lv}`)!.items, `level ${lv}`).toHaveLength(5);
    // nothing measured yet: the first stage is where the player is
    expect(stages.find((s) => s.state === 'here')!.id).toBe('hands');
    for (const s of stages) for (const i of s.items) expect(i.href, `${s.id} ${i.label}`).toMatch(/^#\/(run|keys|piano)\//);
  });
});
