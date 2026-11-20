/**
 * The tunes of songs of chords that have no words in the app, laid over their bars: what is sung over the
 * chords, so that a song can be heard before it is learned. A song with words gets its tune from the voice
 * book instead (sheet() in accompany.ts); tuneOf() there asks both.
 *
 * Where the piano book has the tune already (a tune of the songbook taken over to the keys), it is taken from
 * there; a version for power chords sings the tune of the song it is made from. The others are written here, each one compared note for note with the published source named above it
 * and put into the key of its chords. How they read:
 * - a note carries its octave ("E4", "F#4", "Bb3"), ":2" makes it twice as long, "|" is a bar line;
 * - a length counts the beats of the bar as written (quarters in 4/4 and 3/4, eighths in 6/8), and every bar of
 *   the tune lies over one bar of the chords: where a tune moves at half the pace of its chart, its notes are
 *   written twice as long;
 * - what stands before the first bar line is the upbeat when it is shorter than a bar;
 * - "-" holds the note before on (":2" for longer): rests are not written, the note before is held instead, also
 *   over a bar line; only before the first note is it a rest;
 * - every bar holds its beats exactly, the last one at most; a tune goes `times` times through the bars of a chart
 *   marked x2, the upbeat of each new time cutting short the last note before it.
 */
import type { Song } from './content';
import { layOver, tuneOf, type SungNote } from './accompany';
import { powerOf } from './exercises';
import { pianoBook } from './pianobook';
import { PUBLIC_SONGBOOK } from './songbook';

interface Written {
  /** beats in a bar as written */
  beats: number;
  notes: string;
  /** how many times the tune goes through the chart (twice for one marked x2) */
  times?: number;
}

/**
 * The tunes, by the id of their song. Above each, where it was compared: the ABC collections that
 * abcnotation.com gathers (the Digital Tradition folk song database, Frank Nordberg's transcriptions for
 * Musica Viva, the tune books of John Chambers, Paul Hardy, Colin Hume), the scores in Wikipedia's articles,
 * and old printed music shown there. Where two of them differ, the one named first is followed.
 */
const TUNES: Record<string, Written> = {
  // The chorus: the Digital Tradition's ABC (TOMDOOL2), in its key. The chart counts a bar of it twice, so its
  // notes are written twice as long.
  'tom-dooley': {
    beats: 4,
    notes: 'A3 A3:2 A3 | B3:2 D4:2 | F#4:4 | F#4:4 | A3 A3:2 A3 | B3:2 D4:2 | E4:4 | -:4 | A3 A3:2 A3 | B3:2 D4:2 | E4:4 | E4:4 | E4 E4:2 F#4 | E4 D4 B3:2 | D4:4 | -:4',
  },
  // Spiritual: Frank Nordberg's ABC for Musica Viva, from G down to the C of the chords: one stanza, which the
  // whole song sings seven times.
  'whole-world': {
    beats: 4,
    notes: 'G4:0.5 G4:0.5 E4:0.5 | G4:2 E4:0.5 C4:1.5 | -:0.5 G4:0.5 A4:0.5 G4 G4:0.5 G4:0.5 E4:0.5 | F4 F4 D4:0.5 B3:1.5 | -:0.5 G4:0.5 A4:0.5 G4 G4:0.5 G4:0.5 E4:0.5 | G4:2 E4:0.5 C4:1.5 | -:0.5 G4:0.5 A4:0.5 G4 G4:0.5 G4:0.5 E4:0.5 | G4 G4 F4:0.5 D4:0.5 D4:0.5 C4:0.5 | -:4',
  },
  // The Digital Tradition's ABC (DOWNVALY), from C to G. It sings "low" and "blow" a bar each; held over a
  // second bar here, as the twelve bars of the chart have them.
  'down-in-the-valley': {
    beats: 3,
    times: 2,
    notes: 'D4 G4 A4 | B4:3 | G4:3 | B4 A4 G4 | A4:3 | -:3 | D4 F#4 A4 | C5:3 | A4:3 | F#4 G4 A4 | G4:3 | -:3',
  },
  // The Digital Tradition's ABC (CLEMENTI), from D to G; the score of the Hungarian Wikipedia article has the
  // same notes (some of them straight where this one is dotted). Verse and chorus go to the same tune.
  clementine: {
    beats: 3,
    times: 2,
    notes: 'G4:0.75 G4:0.25 | G4 D4 B4:0.75 B4:0.25 | B4 G4 G4:0.75 B4:0.25 | D5:1.5 D5:0.5 C5:0.5 B4:0.5 | A4:2 A4:0.75 B4:0.25 | C5 C5 B4:0.75 A4:0.25 | B4 G4 G4:0.75 B4:0.25 | A4 D4 F#4:0.5 A4:0.5 | G4:3',
  },
  // Stephen Foster, 1850: the Digital Tradition's ABC (CAMPTWN), from C to D.
  'camptown-races': {
    beats: 4,
    notes: 'F#4 | A4 A4 F#4 A4 | B4 A4 F#4:2 | F#4 E4:3 | F#4 E4:2 A4 | A4 A4 F#4 A4 | B4 A4 F#4:2 | E4:1.5 E4:0.5 F#4 E4 | D4:4 | D4:1.5 D4:0.5 F#4 A4 | D5:4 | B4:1.5 B4:0.5 D5 B4 | A4:3 F#4 | A4 A4 F#4:0.5 F#4:0.5 A4:0.5 A4:0.5 | B4 A4 F#4:2 | E4 F#4:0.5 G4:0.5 F#4 E4:0.5 E4:0.5 | D4:3',
  },
  // The Campbell Folk School Song Book's chorus as Thornton Rose wrote it in ABC (abcnotation.com), in D, its
  // chords where the chart has them; the same tune as in The Jubilee Singers (1873, p. 166, the page shown in
  // Wikipedia's article). The chorus, twice.
  'swing-low': {
    beats: 4,
    times: 2,
    notes: 'F#4 D4:2 F#4 | D4:1.5 D4:0.5 B3:0.5 A3:1.5 | D4:0.5 D4:0.5 D4:0.5 D4:0.5 F#4:0.5 F#4:0.5 A4 | A4:4 | B4:0.5 A4:0.5 F#4:2 A4 | D4:1.5 D4:0.5 B3:0.5 A3:1.5 | D4:0.5 D4:0.5 D4:0.5 D4:0.5 F#4:0.5 F#4:0.5 E4 | D4:4',
  },
  // Spiritual: Frank Nordberg's ABC for Musica Viva, in D minor with these chords; the chorus of the Dutch
  // Wikipedia article's score has the same tune. The chorus, twice.
  joshua: {
    beats: 4,
    times: 2,
    notes: 'D4:0.5 C#4:0.5 D4:0.5 E4:0.5 F4:0.5 F4:0.5 G4 | A4:0.5 A4 A4:2.5 | G4:0.5 G4 G4:2.5 | A4:0.5 A4 A4:2.5 | D4:0.5 C#4:0.5 D4:0.5 E4:0.5 F4:0.5 F4:0.5 G4 | A4:0.5 A4 A4:1.5 F4:0.5 G4:0.5 | A4 G4 F4 E4 | D4:4',
  },
  // The tune of "Villikins and His Dinah" that the song took over (1850s): the Digital Tradition's ABC
  // (VILDINAH) in C, verse and the "too-ral-i" chorus; Paul Hardy's "Sweet Betsy from Pike" has the verse alike.
  'sweet-betsy': {
    beats: 3,
    notes: 'C4 | C4 E4 G4 | G4 F4 E4:0.5 E4:0.5 | D4 C4 C4 | C4:2 C4 | C4 E4 G4 | C5 C5 C5 | B4:0.5 B4:0.5 G4 G4 | G4:2 G4 | C5 C5 C5 | B4 G4 E4 | F4 G4 A4 | G4:2 C4:0.5 D4:0.5 | E4 E4 E4 | G4 F4 E4 | D4 C4 C4 | C4:2 C4:0.5 D4:0.5 | E4 E4 E4 | G4 F4 E4 | D4 C4 B3 | C4:2',
  },
  // Frank Nordberg's ABC for Musica Viva, in G, verse and chorus.
  'home-on-the-range': {
    beats: 3,
    notes: 'D4 | D4 G4 A4 | B4:2 G4:0.5 F#4:0.5 | E4 C5 C5 | C5:2 B4:0.5 C5:0.5 | D5:1.5 G4:0.5 G4 | G4 F#4 G4 | A4:3 | -:2 D4:0.5 D4:0.5 | D4 G4 A4 | B4:2 G4:0.5 F#4:0.5 | E4 C5 C5 | C5:2 C5:0.5 C5:0.5 | B4:1.5 A4:0.5 G4 | F#4 G4 A4 | G4:3 | -:3 | D5:3 | C5 B4:1.5 A4:0.5 | B4:3 | -:2 D4:0.5 D4:0.5 | G4:1.5 G4:0.5 G4 | G4 F#4 G4 | A4:3 | -:2 D4:0.5 D4:0.5 | D4 G4 A4 | B4:2 G4:0.5 F#4:0.5 | E4 C5 C5 | C5:2 C5:0.5 C5:0.5 | B4:1.5 A4:0.5 G4 | F#4 G4 A4 | G4:3 | -:2',
  },
  // The score of Wikipedia's article, in G; the chart counts a bar of it twice, so its notes are written twice
  // as long. The Digital Tradition's ABC (REDRIVAL) has the second half alike.
  'red-river-valley': {
    beats: 4,
    notes: 'D4 G4 | B4:2 B4 B4 | B4:2 A4 B4 | A4:2 G4:2 | -:2 B4 B4 | B4:2 G4 B4 | D5:2 C5 B4 | A4:4 | -:2 D5 C5 | B4:2 B4 A4 | G4:2 A4 B4 | D5:2 C5:2 | -:2 E4 E4 | D4:2 F#4 G4 | A4:2 B4 A4 | G4:4 | -:2',
  },
  // The score of Wikipedia's article, in G, its repeats written out: verse and chorus.
  'my-bonnie': {
    beats: 3,
    notes: 'D4 | B4 A4 G4 | A4 G4 E4 | D4 B3:2 | -:2 D4 | B4 A4 G4 | G4 F#4 G4 | A4:3 | -:2 D4 | B4 A4 G4 | A4 G4 E4 | D4 B3:2 | -:2 D4 | E4 A4 G4 | F#4 E4 F#4 | G4:3 | -:3 | D4:3 | G4:3 | E4:3 | A4:3 | F#4 F#4 F#4 | F#4 E4 F#4 | G4:2 A4 | B4:3 | D4:3 | G4:3 | E4:3 | A4:3 | F#4 F#4 F#4 | F#4 E4 F#4 | G4:3 | -:3',
  },
  // Spiritual: Frank Nordberg's ABC for Musica Viva (2/4), from D to G; the chart counts a bar of it as one of
  // its own, so its notes are written twice as long. Verse, and the chorus with its repeat written out.
  'down-by-the-riverside': {
    beats: 4,
    notes: 'B4:0.5 B4:0.5 A#4:0.5 | B4 D4:2 E4 | G4:0.5 A4:1.5 B4:2 | - B4 B4:1.5 A#4:0.5 | B4:0.5 A4:1.5 G4:2 | - A4 A4:1.5 G4:0.5 | A4:0.5 G4:1.5 F#4:2 | - B4 B4:1.5 A#4:0.5 | B4:0.5 A4:1.5 G4:0.5 B4:0.5 B4:0.5 A#4:0.5 | B4 D4:2 E4 | G4:0.5 A4:1.5 B4:2 | - B4 B4:1.5 A#4:0.5 | B4:0.5 A4:1.5 G4 B4:0.5 B4:0.5 | B4:0.5 A4:2.5 C5 | B4:2 A4:2 | G4:4 | - G4 A4 B4:0.5 B4:0.5 | C5:0.5 C5:1.5 C5 C5 | C5 C5 G4 A4:0.5 A4:0.5 | B4:0.5 B4:1.5 B4 B4 | B4 B4 B4 B4:0.5 B4:0.5 | B4:0.5 A4:2.5 C5 | B4:2 A4:2 | B4:4 | - G4 A4 B4:0.5 B4:0.5 | C5:0.5 C5:1.5 C5 C5 | C5 C5 G4 A4:0.5 A4:0.5 | B4:0.5 B4:1.5 B4 B4 | B4 B4 B4 B4:0.5 B4:0.5 | B4:0.5 A4:2.5 C5 | B4:2 A4:2 | G4:4 | -:2',
  },
  // As Robert Ford printed it in Vagabond Songs and Ballads of Scotland (1909; the score in Wikipedia's article),
  // from F to G; the Digital Tradition's ABC (LOCHLMND) has the same notes, some of them straight where these
  // are dotted.
  'loch-lomond': {
    beats: 4,
    notes: 'D4:0.5 E4:0.5 | G4 G4:0.5 A4:0.5 B4 A4:0.75 G4:0.25 | A4 A4:0.5 G4:0.5 E4 D4:0.5 E4:0.5 | G4 G4:0.5 G4:0.5 G4 B4:0.5 D5:0.5 | E5:2 D5 D5 | E5 E5:0.5 D5:0.5 B4 B4:0.5 D5:0.5 | C5:0.5 B4:0.5 A4:0.5 G4:0.5 E4 D4:0.5 E4:0.5 | G4:0.25 G4:0.75 B4:0.25 D5:0.75 E5 D5:0.5 B4:0.5 | A4:2 G4 D4 | G4 G4:0.75 A4:0.25 B4 A4:0.5 G4:0.5 | A4 A4:0.5 G4:0.5 E4 D4:0.5 E4:0.5 | G4 G4:0.5 G4:0.5 G4 B4:0.5 D5:0.5 | E5:2 D5 D5 | E5 E5:0.5 D5:0.5 B4 B4:0.5 D5:0.5 | C5:0.5 B4:0.5 A4:0.5 G4:0.5 E4 D4:0.5 E4:0.5 | G4:0.25 G4:0.75 B4:0.25 D5:0.75 E5 D5:0.5 B4:0.5 | A4:2 G4:2',
  },
  // Frank Nordberg's ABC for Musica Viva, from F to G (Carl Sandburg's American Songbag, 1927, has the song).
  'sloop-john-b': {
    beats: 4,
    notes: 'D4 | B4:0.5 B4 B4:0.5 B4 C5 | B4:3 D4 | B4:1.5 B4 B4:0.5 C5 | B4:3 D4 | B4:2 B4:0.5 C5 D5:0.5 | -:1.5 D5 C5:0.5 B4 | A4:4 | - D4:0.5 D4 E4:0.5 F#4 | G4:4 | - G4:0.5 G4 A4:0.5 B4 | C5:4 | -:2 C5 C5 | B4 A#4:0.5 B4 G4:1.5 | - A4:0.5 A4 G4:0.5 F#4 | G4:4 | -:3',
  },
  // A version of 1907, as the sheet music in Wikipedia's article prints it, in F. The chorus, twice.
  'jacobs-ladder': {
    beats: 4,
    times: 2,
    notes: 'A3:0.5 A3:1.5 A3:0.5 A3 C4:0.5 | C4:0.5 C4:1.5 C4:0.5 A3:1.5 | G3:0.5 G3:1.5 G3:0.5 G3 Bb3:0.5 | Bb3:0.5 D4:1.5 D4:0.5 C4:1.5 | F4:0.5 F4 C4:0.5 F4:0.5 F4 C4:0.5 | F4:0.5 F4 C4:0.5 C4:0.5 A3 C4:0.5 | C4:0.5 A3:1.5 Bb3:0.5 G3:1.5 | F3:4',
  },
  // Spiritual: the Digital Tradition's ABC (GOMOSES), in G minor; Jack Campin's ABC and Alan Lomax's (folkinfo)
  // have the same tune, and the raised F of "let my people go" both times, where the Digital Tradition drops it once.
  'go-down-moses': {
    beats: 4,
    notes: 'D4 | Bb4 Bb4 A4 A4 | Bb4:0.5 Bb4:1.5 G4:2 | D4 D4 F#4:0.5 F#4:1.5 | G4:3 D4 | Bb4 Bb4 A4 A4 | Bb4:0.5 Bb4:1.5 G4:2 | D4 D4 F#4:0.5 F#4:1.5 | G4:4 | G4:0.5 G4:3.5 | C5:0.5 C5:3.5 | D5:2 D5:1.5 C5:0.5 | D5 D5:0.5 C5:0.5 Bb4:0.5 G4:1.5 | Bb4 G4:2 Bb4 | G4:0.5 F4:0.5 D4:0.5 C4:0.5 D4:2 | D4 D4 F#4:0.5 F#4:1.5 | G4:4',
  },
  // Spiritual: Frank Nordberg's ABC for Musica Viva, in F; the chorus, twice.
  'nobody-knows': {
    beats: 4,
    times: 2,
    notes: 'A4:0.5 C4 D4:0.5 F4:1.5 G4:0.5 | A4:0.5 A4:0.5 A4:0.5 A4:2.5 | A4:0.5 C4 D4:0.5 F4 F4 | D4:0.5 C4:3.5 | A4:0.5 C4 D4:0.5 F4:1.5 G4:0.5 | A4:0.5 A4:0.5 A4:0.5 A4:2.5 | C5:1.5 A4:0.5 G4 A4 | F4:2 F4:2',
  },
  // The Digital Tradition's ABC (GODREST), in E minor; the score of the German Wikipedia article has the same
  // notes. Its nineteen bars end on a long E, held over the twentieth of the chart.
  'god-rest-ye': {
    beats: 4,
    notes: 'E4 | E4 B4 B4 A4 | G4 F#4 E4 D4 | E4 F#4 G4 A4 | B4:3 E4 | E4 B4 B4 A4 | G4 F#4 E4 D4 | E4 F#4 G4 A4 | B4:3 B4 | C5 A4 B4 C5 | D5 E5 B4 A4 | G4 E4 F#4 G4 | A4:2 G4 A4 | B4:2 C5 B4 | B4 A4 G4 F#4 | E4:2 G4:0.5 F#4:0.5 E4 | A4:2 G4 A4 | B4 C5 D5 E5 | B4 A4 G4 F#4 | E4:4 | -:3',
  },
  // Charles C. Converse, 1868: the Digital Tradition's ABC (FRNDJSUS), from C to F, at half its note values (it
  // writes the hymn's eighths as quarters).
  'what-a-friend': {
    beats: 4,
    notes: 'C5:1.5 A4:0.5 D5:0.5 C5:0.5 A4:0.5 G4:0.5 | F4:2 D4:2 | C4:1.5 F4:0.5 A4:0.5 F4:0.5 C5:0.5 A4:0.5 | G4:4 | C5:1.5 A4:0.5 D5:0.5 C5:0.5 A4:0.5 G4:0.5 | F4:2 D4:2 | C4:1.5 F4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:0.5 | F4:4 | G4:1.5 A4:0.5 Bb4:0.5 A4:0.5 Bb4:0.5 G4:0.5 | A4:2 C5:2 | D5:1.5 D5:0.5 C5:0.5 A4:0.5 Bb4:0.5 A4:0.5 | G4:4 | C5:1.5 A4:0.5 D5:0.5 C5:0.5 A4:0.5 G4:0.5 | F4:2 D4:2 | C4:1.5 F4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:0.5 | F4:4',
  },
  // The Digital Tradition's ABC (CARELOVE), from F to C; twice.
  'careless-love': {
    beats: 4,
    times: 2,
    notes: 'E4:3 C4 | B3 G3 B3 D4 | C4:4 | -:4 | E4:3 F4 | G4 G4 A4 G4 | D4:4 | -:2 E4 F4 | E4:3 F4 | G4:2 G4:2 | A4:2 F4:2 | C4:2 D4 D#4 | E4:3 C4 | B3 G3 B3 D4 | C4:4 | -:4',
  },
  // The Digital Tradition's ABC (FRANJOHN), in C; its eleven bars end on a long C, held over the twelfth of the
  // chart. Twice.
  'frankie-and-johnny': {
    beats: 4,
    times: 2,
    notes: 'C4:0.5 D4:0.5 E4:0.5 A4 G4:0.5 E4 | C4 C4:3 | C4:0.5 D4:0.5 E4:0.5 A4 G4:0.5 E4 | C4:3.5 C4:0.5 | F4:0.5 G4:0.5 A4:0.5 C5 D5:0.5 A4 | C5 C5:2 A4:0.5 B4:0.5 | C5:0.5 C5 C5:0.5 B4 A4 | G4 E4 E4 E4 | D4:4 | - E4:0.75 D4:0.25 E4:0.5 E4:1.5 | C4:4 | -:4',
  },
  // The Digital Tradition's ABC (BNKSOHIO), in C (the score of the Hungarian Wikipedia article is a plainer
  // version of the same tune).
  'banks-of-the-ohio': {
    beats: 4,
    notes: 'C4 C4 C4 | E4:4 | - C4 B3 C4 | D4:4 | -:2 D4 E4 | F4:4 | - A4 A4 G4 | E4:4 | - C4 C4 E4 | G4:4 | - E4 F4 G4 | A4 F4:3 | - C4 C4 D4 | E4:4 | - C4 D4 D4 | C4:4 | -:4',
  },
  // Spiritual: the Digital Tradition's ABC (WADEWATR), from E minor to G minor; the chorus, twice.
  'wade-in-the-water': {
    beats: 4,
    times: 2,
    notes: 'G4:2.5 Bb4 G4:0.5 | Bb4:2 G4:2 | D5:2.5 F#5 D5:0.5 | G5 F5 D5:0.5 C5:0.5 Bb4 | G4:2.5 Bb4 G4:0.5 | Bb4:2 G4:2 | G4:0.5 Bb4:0.5 G4:0.5 Bb4:0.5 G4:0.5 G4 D4:0.5 | F#4:2 G4:2',
  },
  // Spiritual: the Digital Tradition's ABC (GOTELLMT), in G, chorus and verse; the C it has after "born" is left
  // out (no phrase begins with it). The incipit of the hymnals' tune GO TELL IT (hymnary.org) begins the verse alike.
  'go-tell-it': {
    beats: 4,
    notes: 'G4 | B4 D5 D5 E5 | D5 B4:2 G4 | A4 A4 G4 A4 | B4 D5:2 B4 | B4 D5 D5 E5 | D5 B4:2 G4 | A4 A4 G4 E4 | D4:4 | B4:2 B4:0.75 A4:0.25 G4:0.75 E4:0.25 | D4:2 G4:2 | A4:0.5 A4 A4:0.5 G4 A4 | B4:0.75 A4:0.25 D5:0.75 E5:0.25 D5:2 | B4:2 B4:0.75 A4:0.25 G4:0.75 E4:0.25 | D4:2 G4 C5 | B4 B4 A4:0.5 A4:1.5 | G4:3',
  },
  // Paul Hardy's Session Tunebook (abcnotation.com), from A minor to E minor; John Chambers' ABC of the hymn
  // has the same tune. Verse and chorus, a bar of it to a bar of the chart.
  'wayfaring-stranger': {
    beats: 4,
    notes: '- E4 E4 B4 | B4:4 | - A4:0.5 G4:0.5 A4 B4 | G4:1.5 F#4:0.5 E4:2 | - E4 E4 B4 | A4:4 | - E4 G4:1.5 A4:0.5 | B4:4 | - E4 E4 B4 | B4:4 | - A4:0.5 G4:0.5 A4 B4 | G4:1.5 F#4:0.5 E4:2 | - E4 E4 B4 | A4:4 | - A4 G4:0.5 E4:0.5 D4 | E4:4 | - B4 B4 D5 | E5:4 | - D5 E5 D5 | B4:0.5 D5:3.5 | - B4 B4 D5 | E5:4 | - D5 B4:0.5 A4:0.5 G4 | B4:4 | - E4 E4 B4 | B4:4 | - A4:0.5 G4:0.5 A4 B4 | G4:1.5 F#4:0.5 E4:2 | - E4 E4 B4 | A4:4 | - A4 G4:0.5 E4:0.5 D4 | E4:4',
  },
  // Colin Hume's ABC (abcnotation.com), from D to G; the Digital Tradition's ABC (KILGARMT, "Kilgary Mountain")
  // is the same tune at twice the length.
  'whiskey-in-the-jar': {
    beats: 4,
    notes: 'D4 | D4:1.5 D4:0.5 D4 E4 | D4 B3:2 D4 | E4:1.5 E4:0.5 E4 F#4 | E4 B3:2 D4 | E4:1.5 E4:0.5 E4 F#4 | G4 G4 F#4 E4 | D4 D4 G4 F#4 | E4 B3:2 D4 | D4:1.5 D4:0.5 D4 E4 | D4 B3:2 D4 | E4:1.5 E4:0.5 E4 F#4 | E4 B3:2 D4 | E4:1.5 E4:0.5 E4 F#4 | G4 G4 F#4 E4 | D4 D4 G4 F#4 | E4 D4 B3 G3 | A3 A3 A3:0.5 A3:1.5 | A3:4 | - B3 B3:1.5 A3:0.5 | B3:0.5 C4:1.5 D4:2 | - E4 E4:1.5 D4:0.5 | E4:0.5 F#4:1.5 G4 E4 | D4 B3 A3 B3 | G3:3',
  },
  // The Digital Tradition's ABC (WLDROVER), from D to G; the tune of The Session (thesession.org) is the same at
  // half the length. "More" before the chorus is held a bar, as "year" and "beer" are, as the chart's twenty bars
  // of verse have it.
  'wild-rover': {
    beats: 3,
    notes: 'G4 | G4:1.5 A4:0.5 G4 | G4 D4 B4 | B4:0.5 A4:1.5 B4 | C5:3 | -:2 D5 | D5 B4 D5 | C5:0.5 A4:1.5 F#4 | D4:0.5 B4:1.5 A4 | G4:3 | -:2 G4 | G4 A4:1.5 G4:0.5 | G4 D4 B4 | B4 A4 B4 | C5:3 | -:2 D5 | D5:0.5 B4:1.5 D5 | C5:0.5 A4:1.5 F#4:0.5 F#4:0.5 | D4 B4 A4 | G4:3 | - F#4 G4 | A4:3 | A4:3 | F#4:0.5 D4:2.5 | -:3 | - B4 B4 | B4:0.5 A4:1.5 B4 | C5:3 | - B4 C5 | D5:3 | -:1.5 B4:0.5 G4 | F#4 E4:2 | -:2 E4 | D4:0.5 B4:2.5 | -:2 A4 | G4:3 | -:3',
  },
  // William Steffe's tune: the first two lines as the score of Wikipedia's article has them, the rest from the
  // Digital Tradition's ABC (JOHNBRWN), from F to G, in 6/8: a bar of it to a bar of the chart.
  'battle-hymn': {
    beats: 6,
    notes: 'D4 | D4:2 D4 D4:2 C4 | B3:2 D4 G4:2 A4 | B4:2 B4 B4:2 A4 | G4:3 G4:2 G4 | E4:2 E4 E4:2 F#4 | G4:2 G4 F#4:2 E4 | D4:2 E4 D4:2 B3 | D4:3 D4:2 D4 | D4:2 D4 D4:2 C4 | B3:2 D4 G4:2 A4 | B4:2 B4 B4:2 A4 | G4:3 G4:3 | A4:3 A4:3 | G4:3 F#4:3 | G4:6 | -:6 | D4:3 D4:2 C4 | B3:2 D4 G4:2 A4 | B4:6 | G4:6 | E4:3 E4:2 F#4 | G4:2 F#4 G4:2 E4 | D4:6 | B3:6 | D4:3 D4:2 C4 | B3:2 D4 G4:2 A4 | B4:6 | G4:3 G4:3 | A4:3 A4:3 | G4:3 F#4:3 | G4:6 | -:5',
  },
  // Patrick Gilmore, 1863: the Digital Tradition's ABC (JHNMARCH), from A minor to B minor, in 6/8.
  'when-johnny': {
    beats: 6,
    times: 2,
    notes: 'F#3 | F#3 B3 B3 B3:2 C#4 | D4:2 C#4 D4:2 B3 | A3:5 F#3 | A3:5 B3 | F#3 B3 B3 B3:2 C#4 | D4:2 C#4 D4:2 E4 | F#4:5 D4 | F#4:5 D4 | F#4:2 F#4 F#4 E4 D4 | E4:2 E4 E4:2 C#4 | D4:2 D4 D4 C#4 B3 | C#4:2 C#4 C#4 D4 E4 | F#4:3 E4:3 | D4:3 C#4:2 F#3 | F#3 B3 B3 B3:2 A3 | B3:5',
  },
};

/** Songs of chords whose tune is a tune of the piano book; `times` as above. */
const FROM_KEYS: Record<string, { piece: string; times?: number }> = {
  'saints-chords': { piece: 'when-the-saints~keys' },
  'korobeiniki-chords': { piece: 'korobeiniki~keys', times: 2 },
  'silent-night-chords': { piece: 'silent-night~keys' },
};

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Reads a tune as written here: its notes in beats from the first bar line, and its bars. */
export function readTune(id: string, w: Written): { notes: { at: number; len: number; midi: number }[]; upbeat: number; bars: number } {
  const notes: { at: number; len: number; midi: number }[] = [];
  // where each bar line stands, in beats from the first note
  const lines: number[] = [];
  let t = 0;
  for (const tok of w.notes.trim().split(/\s+/)) {
    if (tok === '|') {
      lines.push(t);
      continue;
    }
    const m = /^(?:([A-G])([#b]?)(\d)|(-))(?::([\d./]+))?$/.exec(tok);
    if (!m) throw new Error(`${id}: cannot read ${tok}`);
    const len = m[5] ? m[5].split('/').map(Number).reduce((a, b) => a / b) : 1;
    if (m[4]) {
      // before the first note it is a rest
      if (notes.length) notes[notes.length - 1].len += len;
    } else notes.push({ at: t, len, midi: STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (Number(m[3]) + 1) });
    t += len;
  }
  const edges = [0, ...lines, t];
  const lens = edges.slice(1).map((e, k) => e - edges[k]);
  const upbeat = lines.length && lens[0] < w.beats - 1e-6 ? lens[0] : 0;
  const body = upbeat ? lens.slice(1) : lens;
  body.forEach((l, k) => {
    if (k < body.length - 1 ? Math.abs(l - w.beats) > 1e-6 : l > w.beats + 1e-6 || l <= 1e-6) throw new Error(`${id}: bar ${k + 1} holds ${l} beats, not ${w.beats}`);
  });
  return { notes: notes.map((n) => ({ ...n, at: n.at - upbeat })), upbeat, bars: body.length };
}

/** A tune written here, laid over the bars of its chords. */
function written(song: Song, w: Written): SungNote[] {
  const { notes, bars } = readTune(song.id, w);
  const times = w.times ?? 1;
  if (bars * times !== song.bars.length) throw new Error(`${song.id}: the tune has ${bars * times} bars, the chords ${song.bars.length}`);
  const units = song.bars.map((b) => b.notes.reduce((s, n) => s + (n.len ?? 1), 0));
  if (units.some((x) => x !== units[0])) throw new Error(`${song.id}: bars of unequal length`);
  const scale = units[0] / w.beats;
  const total = units[0] * song.bars.length;
  const out: SungNote[] = [];
  for (let k = 0; k < times; k++) {
    const from = k * bars * units[0];
    const pass = notes.map((n) => ({ u: from + n.at * scale, len: n.len * scale, midi: n.midi }));
    // the upbeat of this time cuts short what the time before held into it
    const first = pass[0].u;
    for (const n of out) if (n.u + n.len > first + 1e-6) n.len = Math.max(0, first - n.u);
    out.push(...pass);
  }
  for (const n of out) if (n.u + n.len > total) n.len = total - n.u;
  return out.filter((n) => n.len > 1e-6);
}

/** A tune of the piano book over the bars of a song of chords. */
function fromKeys(song: Song, piece: string, times = 1): SungNote[] | null {
  const p = pianoBook().find((x) => x.id === piece);
  if (!p?.bar) return null;
  const { melody } = layOver(song, p.phrases, { bar: p.bar, lead: p.leads?.[0] ?? 0, at: 0, repeat: times > 1 });
  return melody;
}

/** The song a version for power chords is made from, when its bars have the same roots. */
function powerBase(song: Song): Song | null {
  const base = song.id.endsWith('-power') ? PUBLIC_SONGBOOK.find((s) => s.id === song.id.replace(/-power$/, '')) : undefined;
  if (!base || base.bars.length !== song.bars.length) return null;
  return base.bars.every((b, k) => powerOf(b.chord ?? '') === song.bars[k].chord) ? base : null;
}

/** The tune of a song of chords, in note units of its bars from the first bar (an upbeat lies before 0), in the key of its chords; null when none is written. */
export function tuneNotes(song: Song): SungNote[] | null {
  const w = TUNES[song.id];
  if (w) return written(song, w);
  const k = FROM_KEYS[song.id];
  if (k) return fromKeys(song, k.piece, k.times);
  const base = powerBase(song);
  if (base) return tuneOf(base)?.melody.map((n) => ({ ...n })) ?? null;
  return null;
}
