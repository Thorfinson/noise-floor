/**
 * What the guitar learns beside songs of open chords, as pieces to play in the lessons:
 * - riffs: lines of single notes on the low strings, the way rock and blues guitar begins;
 * - power chords: the root, its fifth and the octave, played in songs of the songbook in a version of their own,
 *   all strokes down;
 * - the minor pentatonic scale in one position (the fifth fret, the scale of most blues and rock solos), up and
 *   down, and three short licks in it;
 * - picking patterns as a step of their own, each over a few open chords.
 * The riffs, the scale and the licks are written for this app (they are the app's own, under its licence);
 * the songs are those of the songbook, free of copyright, with their chords turned into power chords.
 */
import { L } from '../core/i18n';
import type { Song } from './content';
import { picked, strummed, tune } from './songwriting';
import { PUBLIC_SONGBOOK } from './songbook';
import { CHORDS } from './theory';

/** The app's own: an exercise, with a title in the language shown. */
function own(song: Song, en: string, de: string): Song {
  const out: Song = { ...song, by: 'Noise Floor', exercise: true, guitarOnly: true };
  Object.defineProperty(out, 'title', { get: () => L(en, de), enumerable: true, configurable: true });
  return out;
}

/** In a position on the neck: the index finger at `at`, one finger per fret above it. */
function position(song: Song, at: number): Song {
  return { ...song, bars: song.bars.map((b) => ({ ...b, notes: b.notes.map((n) => ({ ...n, ...(n.f >= at ? { fg: Math.min(4, n.f - at + 1) } : {}) })) })) };
}

/** Riffs on the low strings: open strings and the first frets, in E minor and A minor. */
export const RIFFS = (): Song[] => [
  own(tune('riff-low-e', '', '', 84, 1, 'E/0 E/0 E/3 E/0 | A/0 A/2 E/3 E/0 | E/0 E/0 E/3 E/0 | A/2 A/0 E/3:2 | E/0 E/0 E/3 E/0 | A/0 A/2 E/3 E/0 | D/0 D/2 A/2 A/0 | E/0:4'), 'Riff 1: the low E', 'Riff 1: die tiefe E-Saite'),
  own(tune('riff-a-walk', '', '', 88, 1, 'A/0 A/0 A/3 A/0 | D/0 D/2 A/3 A/0 | A/0 A/0 A/3 A/0 | E/3 E/2 E/0:2 | A/0 A/0 A/3 A/0 | D/0 D/2 D/3 D/2 | A/3 A/0 E/3 E/2 | A/0:4'), 'Riff 2: a walk on the A string', 'Riff 2: ein Gang auf der A-Saite'),
  own(tune('riff-gallop', '', '', 80, 2, 'E/0 E/0 E/0:2 E/3 E/0 E/2:2 | A/0 A/0 A/0:2 A/3 A/0 A/2:2 | E/0 E/0 E/0:2 E/3 E/0 E/2:2 | D/0 D/0 A/2:2 A/0:4 | E/0 E/0 E/0:2 E/3 E/0 E/2:2 | A/0 A/0 A/0:2 A/3 A/0 A/2:2 | D/2 D/0 A/2:2 A/0 E/3 E/2:2 | E/0:8'), 'Riff 3: the gallop', 'Riff 3: der Galopp'),
  own(tune('riff-blues', '', '', 76, 2, 'E/0:2 E/3 E/0 A/0:2 A/2 A/0 | E/0:2 E/3 E/0 A/0:2 A/2 A/0 | A/0:2 A/3 A/0 D/0:2 D/2 D/0 | E/0:2 E/3 E/0 A/0:2 A/2 A/0 | D/2:2 D/0 A/2 A/0:2 E/3 E/2 | E/0:8'), 'Riff 4: a blues line', 'Riff 4: eine Blues-Linie'),
];

/**
 * Songs of the songbook as power chords, eight strokes down a bar. Not every song can be: next to B5 the
 * listener hears E5 as B5 (the root of E5 lies below the notes it compares), so a song with both is left out.
 */
const POWER_FROM = ['joshua', 'drunken-sailor-chords', 'wade-in-the-water', 'saints-chords', 'whiskey-in-the-jar', 'battle-hymn'];

/** The power chord on a chord's root: Dm and D7 are both D5. */
export const powerOf = (id: string): string | null => {
  const m = /^([A-G][#b]?)/.exec(id.replace(/-easy$/, ''));
  return m && CHORDS[m[1] + '5'] ? m[1] + '5' : null;
};

/** A song of the songbook in a version for power chords, or null when one of its roots has none. */
export function powerVersion(song: Song): Song | null {
  const chords = song.bars.map((b) => b.chord);
  if (chords.some((c) => !c || !powerOf(c))) return null;
  const bpm = Math.round(60 / song.noteDur / song.beat);
  // one chord a bar, as the original bar begins; a bar shared by two chords keeps both
  const text = song.bars.map((b) => [...new Set(b.notes.map((n) => n.strum ?? b.chord).filter((c): c is string => !!c))].map((c) => powerOf(c)!).join(',')).join(' ');
  const s = strummed(`${song.id}-power`, '', song.by ?? '', Math.min(bpm, 100), 'chug', `[All] ${text}`);
  const out: Song = { ...s, of: undefined, guitarOnly: true };
  Object.defineProperty(out, 'title', { get: () => L(`${song.title} (power chords)`, `${song.title} (Powerchords)`), enumerable: true, configurable: true });
  return out;
}

export const POWER_SONGS = (): Song[] =>
  POWER_FROM.map((id) => PUBLIC_SONGBOOK.find((s) => s.id === id))
    .filter((s): s is Song => !!s)
    .map(powerVersion)
    .filter((s): s is Song => !!s);

/** The minor pentatonic in its first position at the fifth fret: A C D E G, one finger per fret. */
export const PENTATONIC = (): Song[] => [
  own(position(tune('pent-a-scale', '', '', 72, 1, 'E/5 E/8 A/5 A/7 | D/5 D/7 G/5 G/7 | B/5 B/8 e/5 e/8 | e/8 e/5 B/8 B/5 | G/7 G/5 D/7 D/5 | A/7 A/5 E/8 E/5 | A/5:4'), 5), 'Pentatonic: A minor, up and down', 'Pentatonik: A-Moll, hinauf und hinab'),
  own(position(tune('pent-lick-1', '', '', 76, 1, 'e/5 B/8 B/5 G/7 | G/5:2 D/7:2 | e/5 B/8 B/5 G/7 | A/5:4 | e/8 e/5 B/8 B/5 | G/7 G/5 D/7:2 | D/5 A/7 A/5:2 | A/5:4'), 5), 'Pentatonic: lick 1, from the top', 'Pentatonik: Lick 1, von oben'),
  own(position(tune('pent-lick-2', '', '', 76, 1, 'G/5 G/7 B/5 B/8 | B/5 G/7 G/5:2 | D/7 G/5 D/7 D/5 | A/7:2 A/5:2 | G/5 G/7 B/5 B/8 | e/5 B/8 B/5:2 | G/7 G/5 D/7 D/5 | A/5:4'), 5), 'Pentatonic: lick 2, on the middle strings', 'Pentatonik: Lick 2, auf den mittleren Saiten'),
  own(position(tune('pent-lick-3', '', '', 80, 1, 'A/5 A/7 D/5 D/7 | G/5 G/7 G/5 D/7 | D/5 A/7 A/5 E/8 | A/5:4 | A/5 A/7 D/5 D/7 | G/5 B/5 G/7 G/5 | D/7 D/5 A/7 A/5 | A/5:4'), 5), 'Pentatonic: lick 3, up from the root', 'Pentatonik: Lick 3, vom Grundton hinauf'),
];

/** Picking patterns, each over a few open chords: the right hand's step after strumming. */
export const PICKING = (): Song[] => [
  own(picked('pick-three', '', '', 66, 'three', '[All] Am Am C C G G Am Am'), 'Picking: bass and two fingers', 'Zupfmuster: Bass und zwei Finger'),
  own(picked('pick-four', '', '', 66, 'four', '[All] C C Am Am Dm Dm G G'), 'Picking: four to the bar', 'Zupfmuster: vier im Takt'),
  own(picked('pick-roll', '', '', 56, 'roll', '[All] Em Em C C G G D D'), 'Picking: rolling in six', 'Zupfmuster: rollend in sechs'),
  own(picked('pick-eight', '', '', 60, 'eight', '[All] Am C G Am Am C E Am'), 'Picking: eight to the bar', 'Zupfmuster: acht im Takt'),
  own(picked('pick-travis', '', '', 56, 'travis', '[All] C C Am Am G G C C'), 'Picking: the thumb alternating', 'Zupfmuster: der Daumen im Wechsel'),
];

/** Everything here, for the list of songs. */
export const EXERCISES = (): Song[] => [...RIFFS(), ...PENTATONIC(), ...PICKING(), ...POWER_SONGS()];
