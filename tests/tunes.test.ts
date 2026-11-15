import { describe, expect, it } from 'vitest';
import { barUnits, tuneOf, type SungNote } from '../src/music/accompany';
import { SONGS, shapeOf, type Song } from '../src/music/content';
import { pianoBook } from '../src/music/pianobook';
import { PRIVATE_SONGS, PUBLIC_SONGBOOK } from '../src/music/songbook';
import { pianoChord } from '../src/music/theory';
import { readTune, tuneNotes } from '../src/music/tunes';

/** The songs of chords that are sung to no tune: an exercise of four chords in a row, which has none. */
const NO_TUNE = ['four-chords'];

const priv = new Set(PRIVATE_SONGS.map((s) => s.id));
/** Every public song of strummed chords, the versions for power chords among them. */
const chordSongs = SONGS.filter((s) => !priv.has(s.id) && s.bars.some((b) => b.notes.some((n) => n.strum)));

/** The song whose chords a version for power chords stands for: the full chords are what the tune is heard against. */
const harmonyOf = (song: Song): Song => (song.id.endsWith('-power') ? PUBLIC_SONGBOOK.find((s) => s.id === song.id.replace(/-power$/, '')) ?? song : song);

/** The chord sounding at a moment of the song (note units from its first bar). */
function chordAt(song: Song, u: number): string | null {
  let start = 0;
  for (const b of song.bars) {
    const len = b.notes.reduce((s, n) => s + (n.len ?? 1), 0);
    if (u < start + len - 1e-6) {
      let at = start;
      let chord: string | null = null;
      for (const n of b.notes) {
        if (at > u + 1e-6) break;
        if (n.strum) chord = n.strum;
        at += n.len ?? 1;
      }
      return chord;
    }
    start += len;
  }
  return null;
}

const tones = (chord: string): number[] => pianoChord(shapeOf(chord).id).midis.map((m) => m % 12);
const holds = (chord: string | null, midi: number): boolean => !!chord && tones(chord).includes(midi % 12);
const total = (song: Song): number => barUnits(song).reduce((a, b) => a + b, 0);

/** Of the notes that begin on a beat, the share that are tones of the chord sounding then. */
function fit(song: Song, melody: SungNote[]): number {
  const harmony = harmonyOf(song);
  const onBeat = melody.filter((n) => n.u >= -1e-6 && Math.abs(n.u / song.beat - Math.round(n.u / song.beat)) < 1e-6);
  return onBeat.filter((n) => holds(chordAt(harmony, n.u), n.midi)).length / onBeat.length;
}

describe('every song of chords has its tune', () => {
  it('has a tune for every public song of strummed chords but the exercise of four chords', () => {
    expect(chordSongs.length).toBeGreaterThanOrEqual(46);
    const without = chordSongs.filter((s) => !tuneOf(s)).map((s) => s.id);
    expect(without).toEqual(NO_TUNE);
  });

  for (const song of chordSongs.filter((s) => !NO_TUNE.includes(s.id))) {
    describe(song.id, () => {
      const melody = tuneOf(song)!.melody;
      const units = barUnits(song);

      it('lies within the song: an upbeat of at most a bar before it, nothing after its last bar', () => {
        expect(melody.length).toBeGreaterThan(10);
        for (const n of melody) {
          expect(n.u).toBeGreaterThanOrEqual(-units[0] - 1e-6);
          expect(n.len).toBeGreaterThan(0);
          expect(n.u + n.len).toBeLessThanOrEqual(total(song) + 1e-6);
        }
        // in order, one note after the other
        melody.forEach((n, i) => i && expect(n.u).toBeGreaterThanOrEqual(melody[i - 1].u + melody[i - 1].len - 1e-6));
      });

      // (a tune sung to words may cover a part of the song only: Jingle Bells has words for its chorus)
      it.skipIf(!tuneNotes(song))('sounds in every bar of the chords, so that each change of chord has its bar of the tune', () => {
        let start = 0;
        // the last bar may be the chords' own: a tune of the piano book ends where its last note does
        units.slice(0, -1).forEach((len, k) => {
          const sounding = melody.some((n) => n.u < start + len - 1e-6 && n.u + n.len > start + 1e-6);
          expect(sounding, `bar ${k + 1}`).toBe(true);
          start += len;
        });
      });

      it('mostly sings the tones of the chord sounding on the beat', () => {
        expect(fit(song, melody)).toBeGreaterThanOrEqual(0.6);
      });

      it('is not wider than a twelfth, and lies around middle C', () => {
        const midis = melody.map((n) => n.midi);
        expect(Math.max(...midis) - Math.min(...midis)).toBeLessThanOrEqual(19);
        const mean = midis.reduce((a, b) => a + b, 0) / midis.length;
        expect(Math.abs(mean - 64)).toBeLessThanOrEqual(6);
      });

      it('ends on a tone of the last chord', () => {
        const last = melody[melody.length - 1];
        const lastChord = chordAt(harmonyOf(song), total(song) - 0.5);
        expect(holds(lastChord, last.midi)).toBe(true);
      });
    });
  }
});

describe('how the tunes are written and laid over the chords', () => {
  it('reads bars, holds over a bar line, an upbeat and a rest before the first note', () => {
    const t = readTune('x', { beats: 4, notes: 'G4:0.5 A4:0.5 | B4:4 | -:2 C5 D5 | E5:3' });
    expect(t.upbeat).toBe(1);
    expect(t.bars).toBe(3);
    expect(t.notes.map((n) => [n.at, n.len, n.midi])).toEqual([
      [-1, 0.5, 67],
      [-0.5, 0.5, 69],
      [0, 6, 71],
      [6, 1, 72],
      [7, 1, 74],
      [8, 3, 76],
    ]);
    expect(readTune('x', { beats: 3, notes: '- E4 G4 | C5:3' }).notes[0]).toEqual({ at: 1, len: 1, midi: 64 });
    expect(() => readTune('x', { beats: 4, notes: 'C4 | D4:3 | E4:4' })).toThrow(/bar 1 holds 3/);
  });

  it('goes twice through a chart marked x2, the second upbeat cutting short the last note of the first time', () => {
    const song = SONGS.find((s) => s.id === 'clementine')!;
    const m = tuneNotes(song)!;
    const half = total(song) / 2;
    const second = m.filter((n) => n.u >= half - song.beat - 1e-6);
    expect(second.map((n) => n.midi)).toEqual(m.filter((n) => n.u < half - song.beat - 1e-6).map((n) => n.midi));
    const before = m.filter((n) => n.u < half - song.beat - 1e-6).pop()!;
    expect(before.u + before.len).toBeLessThanOrEqual(second[0].u + 1e-6);
  });

  it('takes a tune the piano book has from there: the same notes, in the key of the chords', () => {
    for (const [id, piece] of [
      ['saints-chords', 'when-the-saints~keys'],
      ['korobeiniki-chords', 'korobeiniki~keys'],
      ['silent-night-chords', 'silent-night~keys'],
    ]) {
      const song = SONGS.find((s) => s.id === id)!;
      const keys = pianoBook().find((p) => p.id === piece)!.phrases.flat();
      const sung = tuneNotes(song)!;
      const steps = (m: number[]): number[] => m.slice(1).map((x, i) => x - m[i]);
      expect(steps(sung.slice(0, keys.length).map((n) => n.midi)), id).toEqual(steps(keys.map((n) => n.midi)));
      // the note lengths keep their proportions
      const ratio = sung[0].len / (keys[0].len ?? 1);
      sung.slice(0, keys.length - 1).forEach((n, i) => expect(n.len).toBeCloseTo((keys[i].len ?? 1) * ratio, 6));
    }
  });

  it('gives a version for power chords the tune of the song it is made from', () => {
    const power = chordSongs.filter((s) => s.id.endsWith('-power'));
    expect(power.length).toBeGreaterThanOrEqual(6);
    for (const song of power) expect(tuneOf(song)!.melody, song.id).toEqual(tuneOf(harmonyOf(song))!.melody);
  });

  it('keeps the songs with words to the tune of their words', () => {
    const song = SONGS.find((s) => s.id === 'amazing-grace-chords')!;
    expect(tuneNotes(song)).toBeNull();
    expect(tuneOf(song)!.words).not.toBeNull();
  });
});
