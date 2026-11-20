import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setLang } from '../src/core/i18n';
import { wholeTune } from '../src/music/accompany';
import { findSong, flatSong, formParts, joinWords, partsOf, SONGS, wholeSeconds, wholeSong, type Song } from '../src/music/content';
import { lineWords, songMaterial } from '../src/music/material';
import { PUBLIC_SONGBOOK } from '../src/music/songbook';
import { SONG_WORDS } from '../src/music/songwords';
import { strummed, withWords } from '../src/music/songwriting';

const little = (): Song => strummed('little', 'Little', 'Nobody', 120, 'beat', '[Verse] G C [Chorus] D G');

describe('the words of a whole song, written bar by bar', () => {
  it('gives the bars the words of the first time round and keeps the later ones as verses', () => {
    const s = withWords(little(), '[Verse]\nOne two | three |\n[Chorus]\nla | la |\n[Verse]\nfour | five six- |\n[Chorus]\nla | la |');
    expect(s.bars.map((b) => b.words)).toEqual(['One two', 'three', 'la', 'la']);
    expect(s.form).toEqual(['Verse', 'Chorus', 'Verse', 'Chorus']);
    expect(s.verses).toEqual({ Verse: [['four', 'five six-']], Chorus: [['la', 'la']] });
    expect(s.formNames).toBeUndefined();
    const whole = wholeSong(s);
    expect(whole.map((f) => f.words)).toEqual(['One two', 'three', 'la', 'la', 'four', 'five six-', 'la', 'la']);
    expect(whole.map((f) => f.rep)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('plays a chorus on the bars of the verse where the sheet says so, and names it a chorus', () => {
    const one = strummed('one', 'One', 'Nobody', 120, 'beat', '[Verse] G C');
    const s = withWords(one, '[Verse]\na | b |\n[Chorus=Verse]\nla | la |\n[Verse]\nc | |');
    expect(s.form).toEqual(['Verse', 'Verse', 'Verse']);
    expect(s.formNames).toEqual(['', 'Chorus', '']);
    setLang('de');
    try {
      expect(formParts(s).map((p) => p.label)).toEqual(['Strophe 1', 'Refrain', 'Strophe 2']);
    } finally {
      setLang('en');
    }
    // an empty bar in a later time round sings nothing there, not the first time's words
    expect(wholeSong(s).map((f) => f.words)).toEqual(['a', 'b', 'la', 'la', 'c', undefined]);
    expect(wholeSong(s)[2].name).toBe('Chorus');
  });

  it('refuses a sheet that does not fit the chart', () => {
    expect(() => withWords(little(), '[Verse]\na | b | c |\n[Chorus]\nla | la |')).toThrow(/3 bars of words/);
    expect(() => withWords(little(), '[Bridge]\na | b |')).toThrow(/no part called Bridge/);
    expect(() => withWords(little(), '[Verse]\na | b |')).toThrow(/Chorus is never sung/);
    expect(() => withWords(little(), '[Verse]\na | b | c\n[Chorus]\nla | la |')).toThrow(/after the last/);
  });

  it('reads a line of words as one: a word split over a bar line is joined again', () => {
    expect(joinWords(['I come from Ala-', 'bama with my', undefined, 'banjo'])).toBe('I come from Alabama with my banjo');
    expect(joinWords(['a-goin\'', 'over'])).toBe("a-goin' over");
    const m = songMaterial(findSong('oh-susanna-chords'));
    expect(lineWords(m, 0)).toBe('I come from Alabama with my');
  });
});

describe('the whole songs of the book', () => {
  const formed = PUBLIC_SONGBOOK.concat(SONGS.filter((s) => s.id === 'amazing-grace-chords')).filter((s) => s.form?.length);

  it('has at least fifteen songs with their form and the words of every verse, each two to four and a half minutes long', () => {
    expect(formed.length).toBeGreaterThanOrEqual(15);
    expect(formed.map((s) => s.id)).toContain('whiskey-in-the-jar');
    for (const s of formed) {
      const t = wholeSeconds(s);
      expect(t, s.id).toBeGreaterThanOrEqual(120);
      expect(t, s.id).toBeLessThanOrEqual(270);
      // every part is sung, and every time round has words in most of its bars
      expect(new Set(s.form), s.id).toEqual(new Set(partsOf(s).map((p) => p.name)));
      for (const p of formParts(s)) {
        const bars = wholeSong(s).slice(p.from, p.to);
        expect(bars.filter((f) => f.words).length, `${s.id} ${p.label}`).toBeGreaterThanOrEqual(bars.length / 2);
      }
    }
  });

  it('names the parts as a song book would: verses counted, a chorus that comes back the same not', () => {
    const whiskey = findSong('whiskey-in-the-jar');
    expect(formParts(whiskey).map((p) => p.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Verse 3', 'Chorus', 'Verse 4', 'Chorus']);
    expect(wholeSong(whiskey)[24].words).toBe('It\'s when I got the');
    setLang('de');
    try {
      expect(formParts(findSong('red-river-valley')).map((p) => p.label).slice(0, 3)).toEqual(['Strophe 1', 'Refrain', 'Strophe 2']);
    } finally {
      setLang('en');
    }
  });

  it('has a source named for every song it gives words to', () => {
    const text = readFileSync(new URL('../src/music/songwords.ts', import.meta.url), 'utf8');
    for (const id of Object.keys(SONG_WORDS)) {
      const at = text.search(new RegExp(`^  '?${id}'?: \``, 'm'));
      expect(at, id).toBeGreaterThan(0);
      // the comment right above the entry names where the words were taken from
      const before = text.slice(0, at).split(/`,\s*\n/).pop()!;
      expect(before, id).toMatch(/https?:\/\//);
    }
  });

  it('plays the whole song as one long song: the bars of the form in order, each with its words', () => {
    const s = findSong('clementine');
    const flat = flatSong(s);
    expect(flat.bars.length).toBe(wholeSong(s).length);
    expect(flat.form).toBeUndefined();
    expect(flat.bars[16].words).toBe('Light she was, and like a');
    expect(flat.bars[16].part).toBe('Verse');
    // a song without a form is played as it stands
    expect(flatSong(findSong('four-chords'))).toBe(findSong('four-chords'));
  });

  it('lays the tune over the whole form, with the upbeat again before every verse and no note running into the next', () => {
    const s = findSong('whiskey-in-the-jar');
    const once = wholeTune({ ...s, form: undefined })!;
    const whole = wholeTune(s)!;
    const bar = 8;
    const total = wholeSong(s).length * bar;
    expect(whole[0].u).toBeLessThan(0);
    expect(whole[whole.length - 1].u).toBeGreaterThan(total - 2 * bar);
    // four times verse and chorus, each verse with its upbeat: the first before the song, the others after a chorus
    expect(once.some((n) => n.u < 0)).toBe(true);
    expect(whole.length).toBe(4 * once.length);
    for (let i = 1; i < whole.length; i++) expect(whole[i - 1].u + whole[i - 1].len, `note ${i}`).toBeLessThanOrEqual(whole[i].u + 1e-6);
    // the second verse begins where the first chorus ends, its upbeat just before
    const v2 = 24 * bar;
    expect(whole.filter((n) => n.u >= v2 - 4 && n.u < v2).length).toBeGreaterThan(0);
  });
});
