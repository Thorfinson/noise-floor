import { describe, expect, it } from 'vitest';
import { Store } from '../src/core/store';
import { formParts, partsOf, wholeSong } from '../src/music/content';
import { chordId, isChordSymbol, parseChordSheet } from '../src/music/chordsheet';
import { songMaterial } from '../src/music/material';
import { STRUMS } from '../src/music/songwriting';

/** A browser's local storage, in memory. */
function memory(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const mem = new Map<string, string>();
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
}

/** A line of chords standing over the words where they are named: over(['G', 'As'], ['Em', 'mountain']) for "As I was ... mountain". */
function over(words: string, ...at: [string, string | number][]): string {
  let line = '';
  for (const [chord, word] of at) {
    const col = typeof word === 'number' ? word : words.indexOf(word);
    if (col < 0) throw new Error(String(word));
    line = line.padEnd(col) + chord;
  }
  return `${line}\n${words}`;
}

// as a song site prints it: notes about the song, a capo, an intro in bar lines, verses and choruses, a chorus to
// sing again, a verse with words alone, and some tab at the end (the 1871 broadside's words, as in songwords.ts)
const WHISKEY = () => `Whiskey in the Jar
Traditional
Tuning: E A D G B E
Capo: 2nd fret
Key: G

[Intro]
| G | Em | C | G |

[Verse 1]
${over('As I was a walking over Wicklow mountain,', ['G', 'As'], ['Em', 'mountain'])}
${over('I met with Colonel Powers, and his money he was counting,', ['C', 'I met'], ['G', 'counting'])}

[Chorus]
D
Mush a ring a do a da,
G
Whack fol the daddy O,
C
Whack fol the daddy O,
${over("There's whiskey in the jar.", ['G', "There's"], ['D', 'jar'], ['G', 32])}

[Verse 2]
It's when I got the money it was a pretty penny,
I put it in my pocket, and I took it home to Molly;

[Chorus]

[Tab]
e|-----3-----|-----------|
B|---0---0---|---1---1---|
G|-0---------|-0---------|
D|-----------|-----------|
A|-----------|-3---------|
E|-3---------|-----------|
`;

describe('reading a chord sheet', () => {
  it('makes the parts once each, the form as the sheet sings it, and the words of every time round', () => {
    const r = parseChordSheet(WHISKEY(), { title: 'Whiskey in the Jar', bpm: 116, pattern: 'folk' });
    const s = r.song!;
    expect(partsOf(s).map((p) => `${p.name}:${p.to - p.from}`)).toEqual(['Intro:4', 'Verse:4', 'Chorus:9']);
    expect(s.form).toEqual(['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus']);
    expect(r.capo).toBe(2);
    // the notes about the song, the title and the artist, and the six lines of tab are left out
    expect(r.skipped).toBe(10);
    expect(r.problems).toEqual([]);
    // the chords of the bars: a chord a bar, a line with one chord holds it two bars, the intro's bar lines one each
    expect(s.bars.map((b) => b.chord).join(' ')).toBe('G Em C G G Em C G D D G G C C G D G');
    // the words of each bar: those between its chord and the next
    expect(s.bars.slice(4, 8).map((b) => b.words)).toEqual(['As I was a walking over Wicklow', 'mountain,', 'I met with Colonel Powers, and his money he was', 'counting,']);
    expect(s.bars[8].words).toBe('Mush a ring');
    expect(s.bars[9].words).toBe('a do a da,');
    expect(s.bars.slice(14).map((b) => b.words)).toEqual(["There's whiskey in the", 'jar.', undefined]);
    // the second verse has no chords of its own: it is sung to the first one's, line by line
    const v2 = s.verses!.Verse[0];
    expect(v2.length).toBe(4);
    expect(v2.join(' ')).toBe("It's when I got the money it was a pretty penny, I put it in my pocket, and I took it home to Molly;");
    expect(v2[1]).toMatch(/penny,$/);
    // the chorus header with no lines sings the chorus again
    expect(s.verses!.Chorus[0]).toEqual(s.bars.slice(8, 17).map((b) => b.words ?? ''));
    expect(formParts(s).map((p) => p.label)).toEqual(['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
    // strummed in the pattern asked for, at the tempo asked for
    expect(s.beat).toBe(STRUMS.folk.beat);
    expect(s.noteDur).toBeCloseTo(60 / 116 / 2, 9);
    expect(s.bars[0].notes.map((n) => n.strum)).toEqual(['G', 'G', 'G', 'G', 'G', 'G']);
    expect(s.custom).toBe(true);
    // the lines of the sheet, for showing it
    expect(r.lines.Verse).toEqual([[4, 5], [6, 7]]);
    expect(r.lines.Intro).toEqual([[0, 1, 2, 3]]);
  });

  it('holds each chord as many bars as asked, a line with one chord twice that', () => {
    const s = parseChordSheet(WHISKEY(), { perChord: 2 }).song!;
    expect(partsOf(s).map((p) => `${p.name}:${p.to - p.from}`)).toEqual(['Intro:4', 'Verse:8', 'Chorus:18']);
    // a chord's words are shared over its bars, word by word
    expect(s.bars.slice(4, 6).map((b) => b.words)).toEqual(['As I was a walking', 'over Wicklow']);
  });

  it('is kept as one of the player\'s own songs, and opens as a lesson', () => {
    const s = parseChordSheet(WHISKEY(), { id: 'my-test', title: 'Whiskey' }).song!;
    const st = new Store(memory());
    expect(st.restore(JSON.stringify({ app: 'noise-floor/v1', skills: {}, songs: [s] }))).toBe(true);
    expect(st.songs[0]).toEqual(JSON.parse(JSON.stringify(s)));
    const m = songMaterial(st.songs[0]);
    expect(m.lines.length).toBeGreaterThan(3);
    expect(wholeSong(st.songs[0]).length).toBe(4 + 4 + 9 + 4 + 9);
  });

  it('reads ChordPro: the title and artist, the parts, and chords in brackets among the words, a word cut in two', () => {
    const r = parseChordSheet(`{title: Amazing Grace}
{artist: John Newton}
{start_of_verse}
A[G]mazing [C]grace, how [G]sweet the sound
That [G]saved a wretch like [D]me!
{end_of_verse}
{start_of_verse: Verse}
'Twas [G]grace that taught my [C]heart to [G]fear,
And [G]grace my fears re[D]lieved;
{end_of_verse}
{soc}
[G]Ala[D]bama, [G]oh
{eoc}`);
    const s = r.song!;
    expect(r.title).toBe('Amazing Grace');
    expect(r.by).toBe('John Newton');
    expect(s.title).toBe('Amazing Grace');
    expect(s.by).toBe('John Newton');
    expect(s.form).toEqual(['Verse', 'Verse', 'Chorus']);
    // the upbeat before the first chord goes with the first bar
    expect(s.bars.slice(0, 3).map((b) => b.words)).toEqual(['Amazing', 'grace, how', 'sweet the sound']);
    expect(s.verses!.Verse[0].slice(0, 3)).toEqual(["'Twas grace that taught my", 'heart to', 'fear,']);
    expect(s.bars.slice(-3).map((b) => b.words)).toEqual(['Ala-', 'bama,', 'oh']);
  });

  it('reads a German sheet: "Strophe 1:" headers, H for B, and B for B flat', () => {
    // Matthias Claudius, 1779
    const r = parseChordSheet(`Strophe 1:
${over('Der Mond ist aufgegangen, die goldnen Sternlein prangen', ['D', 'Der'], ['Hm', 'aufgegangen'], ['G', 'goldnen'], ['A7', 'prangen'])}
${over('am Himmel hell und klar.', ['D', 'am'], ['B', 'hell'], ['A7', 'und'], ['D', 'klar'])}

Strophe 2:
${over('Wie ist die Welt so stille und in der Dämmrung Hülle', ['D', 'Wie'], ['Hm', 'stille'], ['G', 'der'], ['A7', 'Hülle'])}
${over('so traulich und so hold.', ['D', 'so'], ['B', 'und'], ['A7', 'so hold'], ['D', 'hold'])}`);
    const s = r.song!;
    expect(s.form).toEqual(['Verse', 'Verse']);
    expect([...new Set(s.bars.map((b) => b.chord))]).toEqual(['D', 'Bm', 'G', 'A7', 'Bb']);
    expect(s.verses!.Verse[0][0]).toBe('Wie ist die Welt so');
    expect(r.unknown).toEqual([]);
  });

  it('names stanzas without headers: the one that comes back word for word is the chorus', () => {
    // Percy Montrose, 1884
    const chorus = `${over('Oh my darling, oh my darling,', ['G', 'Oh'], ['D7', 'darling,'])}\n${over('Oh my darling Clementine,', ['D7', 'Oh'], ['G', 'Clementine'])}`;
    const s = parseChordSheet(`${over('In a cavern, in a canyon,', ['G', 'In'], ['D7', 'canyon'])}\n${over('Excavating for a mine,', ['D7', 'Ex'], ['G', 'mine'])}\n\n${chorus}\n\n${over('Light she was, and like a fairy,', ['G', 'Light'], ['D7', 'fairy'])}\n${over('And her shoes were number nine,', ['D7', 'And'], ['G', 'nine'])}\n\n${chorus}`).song!;
    expect(s.form).toEqual(['Verse', 'Chorus', 'Verse', 'Chorus']);
    expect(s.verses!.Verse[0][0]).toBe('Light she was, and like a');
  });

  it('plays bar lines, repeats and words without chords as a player would', () => {
    const s = parseChordSheet(`[Intro]
| G | C D | % |
G C x2
[Verse]
${over('Down in the valley, the valley so low', ['G', 'Down'])}
Hang your head over, hear the wind blow
[Chorus x2]
${over('Roses love sunshine', ['C', 'Roses'], ['G', 'sunshine'])}`).song!;
    expect(s.bars.slice(0, 7).map((b) => [...new Set(b.notes.map((n) => n.strum))].join(','))).toEqual(['G', 'C,D', 'C,D', 'G', 'C', 'G', 'C']);
    // a line of words with no chords over it goes on with the chord before, two bars
    expect(s.bars.slice(7, 11).map((b) => b.chord)).toEqual(['G', 'G', 'G', 'G']);
    expect(s.bars.slice(9, 11).map((b) => b.words)).toEqual(['Hang your head over,', 'hear the wind blow']);
    expect(s.form).toEqual(['Intro', 'Verse', 'Chorus', 'Chorus']);
  });

  it('simplifies chords the app has no shape for, reports those it cannot play, and finds a key that has them all', () => {
    const r = parseChordSheet(`[Verse]
${over('Oh, blow, ye winds, over the ocean', ['Eb', 'Oh'], ['Bb/D', 'winds'], ['Cm7', 'ocean'])}
${over('And bring back my Bonnie to me', ['Ab', 'And'], ['Bb7', 'Bonnie'], ['Eb', 'me'])}`);
    expect(r.unknown).toEqual(['Eb']);
    expect(r.simplified).toEqual([
      { from: 'Bb/D', to: 'Bb' },
      { from: 'Cm7', to: 'Cm' },
      { from: 'Bb7', to: 'Bb' },
    ]);
    // the bars of a chord it cannot play keep the chord before; the very first is left out
    expect(r.song!.bars[0].chord).toBe('Bb');
    // a step up, and every chord is one the app has: E, B, C#m, A, B7
    expect(r.suggest).toBe(1);
    const up = parseChordSheet(`[Verse]\nEb Bb/D Cm7\nAb Bb7 Eb`, { transpose: 1 });
    expect(up.unknown).toEqual([]);
    expect([...new Set(up.song!.bars.map((b) => b.chord))]).toEqual(['E', 'B', 'C#m', 'A', 'B7']);
  });

  it('knows a chord symbol from a word, and plays every common chord as one the app has', () => {
    for (const t of ['G', 'Am', 'F#m7', 'Bb', 'C/G', 'Dsus4', 'Asus2', 'Cadd9', 'E7', 'Gmaj7', 'Bm7b5', 'D6/9', 'A5', 'Hm', 'C#dim', 'G+', '(Em)']) expect(isChordSymbol(t), t).toBe(true);
    for (const t of ['A-ma-zing', 'Ah', 'Be', 'Down', 'oh', 'x2', 'I', 'Go']) expect(isChordSymbol(t), t).toBe(false);
    const play = (s: string): string | null => chordId(s).id;
    expect([play('G'), play('Am7'), play('G#'), play('Abm'), play('A#'), play('Gb'), play('Db'), play('C#')]).toEqual(['G', 'Am7', 'Ab', 'G#m', 'Bb', 'F#', 'Db', 'Db']);
    expect([play('C9'), play('Cmaj9'), play('Csus'), play('Bm7'), play('E9'), play('Fmaj7'), play('D6/9'), play('Bdim'), play('A7sus4'), play('Em9'), play('C6'), play('Gsus2')]).toEqual(['C7', 'Cmaj7', 'C', 'Bm', 'E7', 'Fmaj7', 'D69', 'Bm7b5', 'A7sus4', 'Em7', 'C', 'G']);
    expect(chordId('G#').simplified).toBe(false);
    expect(chordId('Asus').simplified).toBe(false);
    expect(chordId('C9').simplified).toBe(true);
    expect(chordId('G/B')).toEqual({ id: 'G', simplified: true });
    expect([play('Eb'), play('Ebm'), play('Bbm')]).toEqual([null, null, null]);
    // German: H is B, B is B flat
    expect([chordId('H7', 0, true).id, chordId('B', 0, true).id, chordId('Hm').id]).toEqual(['B7', 'Bb', 'Bm']);
  });

  it('says so when there are no chords to play', () => {
    const r = parseChordSheet('Just some words\nwith no chords at all');
    expect(r.song).toBeNull();
    expect(r.problems[0]).toMatch(/No chords found/);
  });
});
