import { afterEach, describe, expect, it } from 'vitest';
import { Listener, type ChordEvent } from '../src/audio/listener';
import { addNoise, mixInto, strum } from '../src/audio/synth';
import { store } from '../src/core/store';
import { SONGS, songLines } from '../src/music/content';
import { currentSong, songProfile } from '../src/music/difficulty';
import { EXERCISES, PENTATONIC, PICKING, POWER_SONGS, powerOf, RIFFS } from '../src/music/exercises';
import { setLang } from '../src/core/i18n';
import { learningPath } from '../src/music/path';
import { pianoBook } from '../src/music/pianobook';
import { STRUM_PATTERNS, strumKey, strumPatternOf } from '../src/music/strums';
import { chordNotes, CHORDS, pianoChord, strumIs } from '../src/music/theory';
import { skillLabel } from '../src/music/labels';

const SR = 48000;

afterEach(() => {
  setLang('en');
  store.skills.data = {};
});

describe('the guitar beyond open chords', () => {
  it('has riffs, the pentatonic, picking patterns and songs in power chords, each with a title in both languages', () => {
    expect(RIFFS()).toHaveLength(4);
    expect(PENTATONIC()).toHaveLength(4);
    expect(PICKING()).toHaveLength(5);
    expect(POWER_SONGS().length).toBeGreaterThanOrEqual(5);
    for (const s of EXERCISES()) {
      expect(SONGS.some((x) => x.id === s.id), s.id).toBe(true);
      expect(s.bars.length, s.id).toBeGreaterThanOrEqual(4);
      setLang('de');
      const de = s.title;
      setLang('en');
      expect(s.title, s.id).toBeTruthy();
      if (s.exercise) expect(de, s.id).not.toBe(s.title);
    }
  });

  it('plays the pentatonic in one position, one finger per fret from the fifth', () => {
    for (const s of PENTATONIC()) for (const n of s.bars.flatMap((b) => b.notes)) {
      expect(n.f, s.id).toBeGreaterThanOrEqual(5);
      expect(n.f, s.id).toBeLessThanOrEqual(8);
      expect(n.fg, s.id).toBe({ 5: 1, 6: 2, 7: 3, 8: 4 }[n.f]);
    }
  });

  it('turns every chord of a song into the power chord on its root, struck eight times down', () => {
    expect(powerOf('Dm')).toBe('D5');
    expect(powerOf('A7')).toBe('A5');
    expect(pianoChord('E5').midis).toEqual([64, 71, 76]);
    for (const s of POWER_SONGS()) {
      expect(s.id.endsWith('-power')).toBe(true);
      for (const b of s.bars) {
        expect(CHORDS[b.chord!].id.endsWith('5'), s.id).toBe(true);
        expect(b.notes.every((n) => n.strum && !n.up), s.id).toBe(true);
      }
      expect(songProfile(s).kind).toBe('strummed');
    }
  });

  it('hears power chords as power chords, though they are nearly all the harmonics of their root', () => {
    const ids = ['E5', 'A5', 'D5', 'G5', 'C5'];
    for (const [a, b] of [['E5', 'A5'], ['A5', 'D5'], ['G5', 'C5'], ['D5', 'G5'], ['C5', 'G5']]) {
      const sig = new Float32Array(Math.floor(2.6 * SR));
      mixInto(sig, strum(chordNotes(CHORDS[a]), SR, 0.88), 0.5 * SR);
      mixInto(sig, strum(chordNotes(CHORDS[b]), SR, 1.2), 1.4 * SR);
      addNoise(sig, 0.0015);
      const l = new Listener(SR);
      l.noteDetection = false;
      l.chordCandidates = ids;
      const got: ChordEvent[] = [];
      l.onChord = (e) => got.push(e);
      for (let i = 0; i < sig.length; i += 128) l.push(sig.subarray(i, Math.min(sig.length, i + 128)));
      const e = got.find((x) => x.time > 1.3);
      expect(e && strumIs(e, b), `${a} > ${b}: ${e?.best}`).toBe(true);
    }
  });

  it('keeps the exercises for the guitar: not in the piano book, never the song a session chooses by itself', () => {
    const ids = new Set(EXERCISES().map((s) => s.id));
    expect(pianoBook().some((p) => ids.has(p.id.replace(/~keys(-basic)?$/, '')))).toBe(false);
    expect(currentSong().exercise).toBeFalsy();
  });

  it('puts them beside the path, with the strumming patterns, by name', () => {
    const side = learningPath('guitar').filter((s) => s.state === 'side').map((s) => s.id);
    expect(side).toEqual(expect.arrayContaining(['riffs', 'pent', 'picking', 'strums', 'slurs', 'rhythm', 'ear']));
    expect(skillLabel(strumKey('folk'))).toBe('Strumming: down, down-up');
  });

  it('knows the strumming pattern of a strummed song from its bars', () => {
    const go = SONGS.find((s) => s.id === 'go-tell-it')!;
    expect(strumPatternOf(go)).toBe('folk');
    expect(strumPatternOf(SONGS.find((s) => s.id === 'tom-dooley')!)).toBe('beat');
    expect(strumPatternOf(SONGS.find((s) => s.id === 'aura-lee')!)).toBeNull();
    expect(STRUM_PATTERNS().map((p) => p.id)).toEqual(['beat', 'eighths', 'folk', 'pop', 'waltz', 'roll', 'sixteenths']);
    // every pattern fills its bar, counted on every slot
    for (const p of STRUM_PATTERNS()) expect(p.count.length, p.id).toBe(p.slots.length);
    expect(songLines(go).length).toBeGreaterThan(1);
  });
});
