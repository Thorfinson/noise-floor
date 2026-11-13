import { describe, expect, it } from 'vitest';
import { Listener, type ChordEvent } from '../src/audio/listener';
import { addNoise, mixInto, strum } from '../src/audio/synth';
import { poolFor } from '../src/game/run';
import { noteTimes, shapeOf, SONGS, tabMidi } from '../src/music/content';
import { songProfile, songsByDifficulty } from '../src/music/difficulty';
import { PUBLIC_SONGBOOK, SONGBOOK } from '../src/music/songbook';
import { picked, strummed, tune } from '../src/music/songwriting';

/** The songs that are published: the five the app began with, and the public songbook. Songs kept privately (src/music/private) are not counted. */
const PUBLIC = SONGS.filter((s) => SONGS.indexOf(s) < 5 || PUBLIC_SONGBOOK.includes(s));
import { CHORDS, chordNotes, chordsAlike, strumIs } from '../src/music/theory';
import { SR } from './helpers';
import { store } from '../src/core/store';
import { hourOf } from '../src/ui/watch';
import { rough, type Pt } from '../src/ui/scene';

describe('the songbook', () => {
  it('has some seventy songs free of copyright, each with a name, an author and something to play', () => {
    expect(PUBLIC.length).toBeGreaterThanOrEqual(65);
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
    expect(new Set(SONGS.map((s) => s.title)).size).toBe(SONGS.length);
    for (const s of SONGBOOK) {
      expect(s.by, s.id).toBeTruthy();
      expect(s.id, s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.bars.length, s.id).toBeGreaterThanOrEqual(4);
      for (const b of s.bars) expect(b.notes.length, s.id).toBeGreaterThan(0);
      const seconds = s.bars.reduce((sum, b) => sum + noteTimes(b.notes).total, 0) * s.noteDur;
      expect(seconds, s.id).toBeGreaterThan(10);
      expect(seconds, s.id).toBeLessThan(110);
    }
  });

  it('is spread over the four levels: none holds fewer than a seventh of the songs, none more than a third', () => {
    const count = [0, 0, 0, 0, 0];
    for (const s of PUBLIC) count[songProfile(s).level]++;
    for (const n of count.slice(1)) {
      expect(n, count.slice(1).join(' / ')).toBeGreaterThanOrEqual(PUBLIC.length / 7);
      expect(n, count.slice(1).join(' / ')).toBeLessThanOrEqual(PUBLIC.length / 3);
    }
    // on every level there are songs to strum, not only tunes
    for (const lv of [1, 2, 3, 4]) expect(PUBLIC.some((s) => songProfile(s).level === lv && songProfile(s).kind === 'strummed'), `level ${lv}`).toBe(true);
  });

  it('rates a song by the easiest shapes there are, so that its level does not change when the player learns the full barre', () => {
    const song = SONGS.find((s) => s.id === 'four-chords')!;
    const before = songProfile(song);
    expect(before.chords).toContain('F#m-easy');
    store.skills.record('chord:F#m', 4, Date.now(), 6);
    store.skills.record('chord:F#m', 3, Date.now(), 6);
    try {
      const after = songProfile(song);
      // the chord is now shown in its full shape, and the song is as hard as it was
      expect(after.chords).toContain('F#m');
      expect(after.level).toBe(before.level);
      expect(after.points).toBe(before.points);
    } finally {
      delete store.skills.data['chord:F#m'];
    }
  });

  it('suggests them easiest first, and within a level the ones that ask for less', () => {
    const order = songsByDifficulty().filter((s) => !s.of);
    const levels = order.map((s) => songProfile(s).level);
    expect(levels).toEqual(levels.slice().sort((a, b) => a - b));
    // the first song a new player is given has two or three open chords, strummed on the beat
    const first = songProfile(order[0]);
    expect(first.kind).toBe('strummed');
    expect(first.points).toBe(0);
    expect(first.chords.length).toBeLessThanOrEqual(3);
  });

  it('gives every chord of a shared bar at least one strum, and marks upstrokes', () => {
    for (const s of SONGBOOK) {
      for (const b of s.bars) {
        const strums = b.notes.filter((n) => n.strum);
        if (!strums.length) continue;
        expect(strums.length, s.id).toBe(b.notes.length);
        expect(strums[0].strum, s.id).toBe(b.chord);
        for (const n of strums) expect(CHORDS[n.strum!], `${s.id}: ${n.strum}`).toBeTruthy();
      }
    }
    // two chords to the bar in the pattern down, down-up, up-down-up: three strums each
    const shared = strummed('shared', 'Shared', 'Nobody', 100, 'pop', '[Verse] Em7,G Dsus4,A7sus4');
    expect(shared.bars[0].notes.map((n) => n.strum)).toEqual(['Em7', 'Em7', 'Em7', 'G', 'G', 'G']);
    expect(shared.bars[0].notes.map((n) => !!n.up)).toEqual([false, false, true, true, false, true]);
    expect(noteTimes(shared.bars[0].notes).total).toBe(8);
    expect(shared.bars[0].part).toBe('Verse');
  });

  it('keeps tunes on the guitar: every note has a string and a fret up to the twelfth', () => {
    for (const s of SONGBOOK) {
      for (const n of s.bars.flatMap((b) => b.notes)) {
        if (n.strum) continue;
        for (const x of [n, ...(n.more ?? [])]) {
          expect(x.s, s.id).toBeGreaterThanOrEqual(0);
          expect(x.s, s.id).toBeLessThanOrEqual(5);
          expect(x.f, s.id).toBeGreaterThanOrEqual(0);
          expect(x.f, s.id).toBeLessThanOrEqual(12);
          expect(tabMidi(x), s.id).toBeGreaterThanOrEqual(40);
        }
      }
    }
    // a tune written as pitches lands in open position
    const ode = SONGS.find((s) => s.id === 'aura-lee')!;
    expect(Math.max(...ode.bars.flatMap((b) => b.notes.map((n) => n.f)))).toBeLessThanOrEqual(4);
    // one written as string and fret stays where it was put, two notes at once included
    const frets = tune('frets', 'Frets', 'Nobody', 76, 3, 'E/0+e/7 B/0 G/0 e/7 B/0 G/0 | E/0+e/12 B/0 G/0 e/12 B/0 G/0 | A/0+e/8 B/5 G/5 e/7 B/5 G/5 | E/0+e/0 B/0 G/0 e/0 B/0 G/0');
    expect(frets.bars[0].notes[0]).toEqual({ s: 5, f: 7, more: [{ s: 0, f: 0 }] });
    expect(songProfile(frets).reasons).toContain('leaves the first four frets');
  });

  it('picks a pattern over the shapes the player is shown, the small ones included', () => {
    const canon = SONGS.find((s) => s.id === 'canon-in-d')!;
    for (const b of canon.bars) {
      const shape = shapeOf(b.chord!);
      for (const n of b.notes) expect(shape.frets[n.s], `${b.chord} string ${n.s}`).toBe(n.f);
    }
    // a bar shared by two chords gives each half of the pattern, as a bar of its own
    const halves = picked('halves', 'Halves', 'Nobody', 80, 'travis', 'C,G Am,G');
    expect(halves.bars.slice(0, 4).map((b) => b.chord)).toEqual(['C', 'G', 'Am', 'G']);
    expect(halves.bars[0].notes.length).toBe(4);
  });

  it('is heard right: every change of chords in every song is taken for the chord it goes to', () => {
    const heard = new Map<string, ChordEvent | undefined>();
    const fails: string[] = [];
    for (const s of SONGS) {
      const strums = s.bars.flatMap((b) => b.notes.map((n) => n.strum).filter((c): c is string => !!c));
      if (!strums.length) continue;
      const ids = [...new Set(strums)];
      const changes = new Set<string>();
      for (let i = 1; i < strums.length; i++) if (strums[i] !== strums[i - 1]) changes.add(`${strums[i - 1]}>${strums[i]}`);
      for (const change of changes) {
        const [a, b] = change.split('>');
        const key = `${ids.slice().sort().join()}|${change}`;
        if (!heard.has(key)) {
          const sig = new Float32Array(Math.floor(2.6 * SR));
          mixInto(sig, strum(chordNotes(shapeOf(a)), SR, 0.88), 0.5 * SR);
          mixInto(sig, strum(chordNotes(shapeOf(b)), SR, 1.2), 1.4 * SR);
          addNoise(sig, 0.0015);
          const l = new Listener(SR);
          l.noteDetection = false;
          l.chordCandidates = ids;
          const got: ChordEvent[] = [];
          l.onChord = (e) => got.push(e);
          for (let i = 0; i < sig.length; i += 128) l.push(sig.subarray(i, Math.min(sig.length, i + 128)));
          heard.set(key, got.find((e) => e.time > 1.3));
        }
        const e = heard.get(key);
        if (!e || !strumIs(e, b)) fails.push(`${s.id} ${change}: ${e ? `${e.best} ${e.score.toFixed(2)}, wanted ${(e.sims[b] ?? 0).toFixed(2)}` : 'nothing heard'}`);
      }
    }
    expect(fails).toEqual([]);
  }, 240000);

  it('takes a chord for its near twin only when the two are made of nearly the same notes', () => {
    expect(chordsAlike(CHORDS.G, CHORDS.G7)).toBeGreaterThan(0.8);
    expect(chordsAlike(CHORDS.Em7, CHORDS.G)).toBeGreaterThan(0.75);
    expect(chordsAlike(CHORDS.G, CHORDS.D)).toBeLessThan(0.5);
    const e = { best: 'G', score: 0.98, sims: { G: 0.98, Em7: 0.9, D: 0.5 } };
    expect(strumIs(e, 'Em7')).toBe(true);
    expect(strumIs(e, 'D')).toBe(false);
    expect(strumIs({ best: 'G', score: 0.98, sims: { G: 0.98, D: 0.9 } }, 'D')).toBe(false);
    expect(strumIs({ best: 'C', score: 0.9, sims: { C: 0.9, Am: 0.87 } }, 'Am')).toBe(true);
  });

  it('gives the song run something to send for every song, and no change between chords it could not tell apart', () => {
    for (const s of SONGS) {
      const pool = poolFor('song', s);
      expect(pool.length, s.id).toBeGreaterThan(0);
      for (const p of pool) if (p.kind === 'chg') expect(chordsAlike(CHORDS[p.pair![0]], CHORDS[p.pair![1]]), `${s.id} ${p.label}`).toBeLessThan(0.8);
    }
  });

  it('takes a full run through the evening hour by hour, and a short one as far as it gets', () => {
    expect([1, 2, 3, 4, 5, 6].map((w) => hourOf(w, 6))).toEqual([0, 1, 2, 3, 4, 5]);
    expect([1, 2].map((w) => hourOf(w, 2))).toEqual([0, 3]);
    expect(hourOf(1, 1)).toBe(1);
    expect([1, 2, 3, 4].map((w) => hourOf(w, 4))).toEqual([0, 1, 2, 3]);
  });

  it('roughens the edge of a wash the same way every time, without moving its corners', () => {
    const square: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    let seed = 1;
    const dice = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const a = rough(square, 3, 10, dice);
    seed = 1;
    const b = rough(square, 3, 10, dice);
    expect(a).toEqual(b);
    expect(a.length).toBe(32);
    for (const corner of square) expect(a).toContainEqual(corner);
    // the new points stay near the edge they were put on
    for (const [x, y] of a) expect(Math.min(Math.abs(x), Math.abs(y), Math.abs(100 - x), Math.abs(100 - y))).toBeLessThan(25);
  });
});
