/** The second voice, reading your own material, German note names, and Amazing Grace sung to its chords. */
import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../src/core/i18n';
import { said, sheet } from '../src/music/accompany';
import { findPiece, findSong } from '../src/music/content';
import { keyOf, secondVoice, thirdBelow } from '../src/music/harmony';
import { notesHelp, parseNotes, parseTab } from '../src/music/import';
import { syllables } from '../src/music/lyrics';
import { keyName, NOTE_NAMES, noteName, pianoChord, STRING_FULL, STRING_NAMES, stringName } from '../src/music/theory';
import { TUNINGS } from '../src/music/tuning';
import { voiceBook } from '../src/music/voicebook';

afterEach(() => setLang('en'));

const pc = (m: number): number => ((m % 12) + 12) % 12;
const midisOf = (id: string): number[] => findPiece(id).phrases.flat().map((n) => n.midi);

describe('a second voice a third below', () => {
  it('stays in the mode of a Dorian tune: Drunken Sailor in D has G under its B, not G sharp', () => {
    // What shall we do with a drunken sailor (D Dorian: the B natural is its sixth)
    const tune = [69, 69, 69, 69, 69, 62, 65, 69, 67, 67, 67, 67, 67, 60, 64, 67, 69, 69, 69, 69, 69, 71, 72, 74, 72, 69, 67, 64, 62];
    const key = keyOf(tune);
    expect(key).toEqual({ tonic: 2, minor: true, scale: [0, 2, 4, 5, 7, 9, 11] });
    expect(thirdBelow(71, key)).toBe(67);
    expect(secondVoice(tune).filter((m) => !key.scale.includes(pc(m)))).toEqual([]);
    // the app's own Drunken Sailor (written in G Dorian): its sixth gets the major third under it (C under E)
    const own = voiceBook().find((v) => v.id === 'drunken-sailor~voice')!.phrases.flat().map((n) => n.midi);
    const k = keyOf(own);
    expect(k.tonic).toBe(pc(own[own.length - 1]));
    expect(k.minor).toBe(true);
    const sixth = own.findIndex((m) => pc(m - k.tonic) === 9);
    expect(sixth).toBeGreaterThanOrEqual(0);
    expect(own[sixth] - secondVoice(own)[sixth]).toBe(4);
  });

  it('gives a raised note the major third below inside the key: D under the F sharp of Deck the Halls, E under the G sharp of the Habanera', () => {
    const deck = midisOf('deck-the-halls');
    expect(keyOf(deck).scale).toEqual([0, 2, 4, 5, 7, 9, 11]);
    const fis = deck.indexOf(66);
    expect(fis).toBeGreaterThanOrEqual(0);
    expect(secondVoice(deck)[fis]).toBe(62);
    const habanera = midisOf('habanera');
    const gis = habanera.indexOf(68);
    expect(gis).toBeGreaterThanOrEqual(0);
    expect(secondVoice(habanera)[gis]).toBe(64);
  });

  it('takes the third of harmonic minor where a tune leads up with a raised seventh', () => {
    // A minor with G sharp and no G: B gets G sharp under it, C gets A (two steps down), G sharp gets E
    const tune = [69, 71, 72, 74, 76, 72, 71, 68, 69];
    const key = keyOf(tune);
    expect(key.tonic).toBe(9);
    expect(key.minor).toBe(true);
    expect([71, 72, 68, 69].map((m) => thirdBelow(m, key))).toEqual([68, 69, 64, 65]);
  });

  it('puts every note of every song to sing a minor or a major third above its second voice', () => {
    for (const v of voiceBook()) {
      const midis = v.phrases.flat().map((n) => n.midi);
      const below = secondVoice(midis);
      const key = keyOf(midis);
      midis.forEach((m, i) => {
        expect([3, 4], `${v.id} note ${i + 1}`).toContain(m - below[i]);
        // a note of the scale has its third in the scale
        if (key.scale.includes(pc(m))) expect(key.scale, `${v.id} note ${i + 1}`).toContain(pc(below[i]));
      });
    }
  });
});

describe('reading your own material', () => {
  it('does not take what follows the last bar line of a tab for notes', () => {
    const tab = ['e|---0---|---3---|  x2', 'B|---1---|---0---|', 'G|---0---|---0---|  (repeat)', 'D|---2---|---0---|', 'A|---3---|---2---|', 'E|-------|---3---|  3x'].join('\n');
    const r = parseTab(tab);
    expect(r.problems).toEqual([]);
    expect(r.bars.length).toBe(2);
    expect(r.steps).toBe(2);
    expect(r.bars.map((b) => b.notes.length)).toEqual([1, 1]);
  });

  it('reads a German tab that calls the B string H', () => {
    const r = parseTab(['e|---0---|', 'H|---1---|', 'G|---0---|', 'D|---2---|', 'A|---3---|', 'E|-------|'].join('\n'));
    expect(r.problems).toEqual([]);
    expect(r.bars[0].notes[0]).toMatchObject({ s: 1, f: 3 });
  });

  it('reads B as the language of the app names it: B in English, B flat in German; H is always B, Bb always B flat', () => {
    const notes = (text: string, lang: 'en' | 'de'): number[] => parseNotes(text, lang).phrases.flat().map((n) => n.midi);
    expect(notes('B3 H3 Bb3 B♭3 b3', 'en')).toEqual([59, 59, 58, 58, 59]);
    expect(notes('B3 H3 Bb3 B♭3 h3', 'de')).toEqual([58, 59, 58, 58, 59]);
    // without an argument it follows the language of the app
    setLang('de');
    expect(notes('B3', 'de')).toEqual(parseNotes('B3').phrases.flat().map((n) => n.midi));
    expect(notesHelp()).toContain('<b>H3</b>');
    setLang('en');
    expect(parseNotes('B3').phrases[0][0].midi).toBe(59);
    expect(notesHelp()).toContain('B♭');
  });
});

describe('names in German', () => {
  it('calls B natural H wherever a note, a key or a string is named, and keeps B flat as it is', () => {
    setLang('de');
    expect(noteName(59)).toBe('H3');
    expect(noteName(58)).toBe('A♯3');
    expect(NOTE_NAMES[11]).toBe('H');
    expect([...STRING_NAMES]).toEqual(['E', 'A', 'D', 'G', 'H', 'e']);
    expect(STRING_FULL[4]).toBe('H');
    expect(stringName(4)).toBe('H-Saite');
    expect(pianoChord('G').keys).toEqual(['G', 'H', 'D']);
    expect(pianoChord('Bb').keys).toEqual(['B♭', 'D', 'F']);
    expect(keyName(71, 'G')).toBe('H4');
    expect(TUNINGS().find((t) => t.id === 'dropd')!.name).toBe('Drop D: D A D G H E');
    setLang('en');
    expect(noteName(59)).toBe('B3');
    expect(stringName(4)).toBe('B string');
    expect(pianoChord('G').keys).toEqual(['G', 'B', 'D']);
  });
});

describe('Amazing Grace to its chords', () => {
  it('has the whole tune and the first verse, a note and a syllable in every one of its sixteen bars', () => {
    const v = voiceBook().find((x) => x.id === 'amazing-grace-piano~voice')!;
    v.phrases.forEach((ph, k) => expect(syllables(v.id, k).length, `phrase ${k + 1}`).toBe(ph.length));
    const song = findSong('amazing-grace-chords');
    const s = sheet(song)!;
    expect(s.words.map(said)).toEqual([
      'A-ma-zing',
      'grace, how',
      'sweet the',
      'sound that',
      'saved a',
      'wretch like',
      'me!',
      'I',
      'once was',
      'lost, but',
      'now am',
      'found, was',
      'blind, but',
      'now I',
      'see.',
      '',
    ]);
    // the melody sounds through every bar of the chords, and ends on the root of the last chord
    const bar = 3;
    for (let k = 0; k < 16; k++) expect(s.melody.some((n) => n.u < (k + 1) * bar - 1e-6 && n.u + n.len > k * bar + 1e-6), `bar ${k + 1}`).toBe(true);
    const last = s.melody[s.melody.length - 1];
    expect(last.u + last.len).toBeCloseTo(16 * bar, 5);
    expect(pc(last.midi)).toBe(7);
  });
});
