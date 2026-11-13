/** What there is to play: songs for guitar, pieces for piano, finger patterns and chord pairs. */
import { L } from '../core/i18n';
import { store } from '../core/store';
import { pianoBook } from './pianobook';
import { SONGBOOK } from './songbook';
import { CHORDS, midiToTab as place, OPEN_STRINGS, pianoChord, type Chord } from './theory';

/** One step of a tab: a plucked note (with others struck at the same moment), or a strummed chord. */
export interface TabNote {
  /** string, 0 = low E */
  s: number;
  /** fret */
  f: number;
  /** finger, when it matters */
  fg?: number;
  /** length in note units, 1 when left out */
  len?: number;
  /** other notes struck at the same moment */
  more?: TabNote[];
  /** when set, the step is a strum of this chord and string and fret are not used */
  strum?: string;
  /** a strum made on the way up: the hand comes back across the thin strings */
  up?: boolean;
}

export const tabMidi = (n: TabNote): number => OPEN_STRINGS[n.s] + n.f;
/** Every pitch of a plucked step; any of them counts when the app listens. A strum has none. */
export const stepMidis = (n: TabNote): number[] => (n.strum ? [] : [tabMidi(n), ...(n.more ?? []).map(tabMidi)]);

/** Where a pitch sits in open position: the highest string that has it within the first four frets. */
export const midiToTab = (midi: number): TabNote => place(midi);

export interface Bar {
  /** chord to hold while playing the bar, if there is one */
  chord?: string;
  notes: TabNote[];
  /** the part of the song that starts with this bar: "Verse", "Chorus" */
  part?: string;
}

export interface Song {
  id: string;
  title: string;
  /** who wrote or made it known; "Traditional" for the old ones */
  by?: string;
  /** seconds per note unit at full speed */
  noteDur: number;
  /** note units per metronome click */
  beat: number;
  bars: Bar[];
  /** added by the user */
  custom?: boolean;
  /** a version of another song: the id of the full one */
  of?: string;
}

/** Bars of strums: one chord a bar, so many strums in each. */
const strums = (chords: string[], per: number): Bar[] => chords.map((c) => ({ chord: c, notes: Array.from({ length: per }, (): TabNote => ({ s: 0, f: 0, strum: c })) }));

/** A melody as bars of [midi, length] pairs, placed in open position. */
const melody = (bars: [number, number?][][]): Bar[] => bars.map((b) => ({ notes: b.map(([m, len]) => ({ ...midiToTab(m), ...(len && len !== 1 ? { len } : {}) })) }));

const [C4, D4, E4, F4, G4] = [60, 62, 64, 65, 67];
const [D3, E3, G3, A3, B3] = [50, 52, 55, 57, 59];

/** The four the app began with, and then the songbook. */
export const SONGS: Song[] = [
  {
    id: 'amazing-grace-chords',
    title: 'Amazing Grace (chords)',
    by: 'Traditional',
    noteDur: 0.75,
    beat: 1,
    bars: strums(['G', 'G', 'C', 'G', 'G', 'G', 'D', 'D', 'G', 'G', 'C', 'G', 'Em', 'D', 'G', 'G'], 3),
  },
  {
    id: 'four-chords',
    title: 'Four chords in A (with F♯m)',
    noteDur: 0.7,
    beat: 1,
    bars: strums(['A', 'F#m', 'D', 'E', 'A', 'F#m', 'D', 'E'], 4),
  },
  {
    id: 'ode-guitar',
    title: 'Ode to Joy (melody)',
    by: 'Ludwig van Beethoven',
    noteDur: 0.5,
    beat: 1,
    bars: melody([
      [[E4], [E4], [F4], [G4]],
      [[G4], [F4], [E4], [D4]],
      [[C4], [C4], [D4], [E4]],
      [[E4, 1.5], [D4, 0.5], [D4, 2]],
      [[E4], [E4], [F4], [G4]],
      [[G4], [F4], [E4], [D4]],
      [[C4], [C4], [D4], [E4]],
      [[D4, 1.5], [C4, 0.5], [C4, 2]],
    ]),
  },
  {
    id: 'amazing-grace',
    title: 'Amazing Grace (melody)',
    by: 'Traditional',
    noteDur: 0.6,
    beat: 1,
    bars: melody([
      [[D3]],
      [[G3, 2], [B3, 0.5], [G3, 0.5]],
      [[B3, 2], [A3]],
      [[G3, 2], [E3]],
      [[D3, 2], [D3]],
      [[G3, 2], [B3, 0.5], [G3, 0.5]],
      [[B3, 2], [A3]],
      [[D4, 3]],
    ]),
  },
  ...SONGBOOK,
];

/**
 * The basic version of a picked song: the same chords in the same bars, one slow strum on every click
 * instead of the picking pattern. The way in for whoever knows the chords but not yet the pattern.
 */
export function basicVersion(song: Song): Song | null {
  if (song.of || !song.bars.every((b) => b.chord) || song.bars.some((b) => b.notes.some((n) => n.strum))) return null;
  const clicks = Math.max(1, Math.round(noteTimes(song.bars[0].notes).total / song.beat));
  return { id: `${song.id}~basic`, get title() { return L(`${song.title} · basic version`, `${song.title} · einfache Fassung`); }, noteDur: song.noteDur * song.beat, beat: 1, bars: strums(song.bars.map((b) => b.chord!), clicks), of: song.id };
}

/** Every song: the built-in ones, the basic versions of the picked ones, and the player's own. */
export const allSongs = (): Song[] => [...SONGS, ...SONGS.map(basicVersion).filter((s): s is Song => !!s), ...store.songs];
export const findSong = (id: string | undefined): Song => allSongs().find((s) => s.id === id) ?? SONGS[0];
/** Skill a bar measures. Bars over the same chord share one; melody bars have one each. */
export const barKey = (song: Song, bar: number): string => `bar:${song.id}:${song.bars[bar].chord ?? 'b' + (bar + 1)}`;

/** Bars shown side by side as one line: more of them when the bars are short. */
export function songLines(song: Song): number[][] {
  const steps = song.bars.reduce((sum, b) => sum + b.notes.length, 0) / Math.max(1, song.bars.length);
  const per = steps <= 3 ? 4 : steps <= 6 ? 2 : 1;
  const lines: number[][] = [];
  for (let i = 0; i < song.bars.length; i += per) lines.push(song.bars.slice(i, i + per).map((_, k) => i + k));
  return lines;
}

const SMALL: Record<string, string> = { 'F#m': 'F#m-easy', Bm: 'Bm-easy' };
/**
 * The easiest shape the app offers for a chord: the small one where there is one and small shapes are
 * switched on. What a song is rated by, so that its level does not change with what the player has learned.
 */
export const easiestShape = (id: string): Chord => CHORDS[store.settings.smallShapes && SMALL[id] ? SMALL[id] : id];
/** The shape shown for a chord in songs and runs: the small one until the full barre has been clean. */
export const shapeOf = (id: string): Chord => CHORDS[store.settings.smallShapes && SMALL[id] && store.skills.level('chord:' + id) < 2 ? SMALL[id] : id];

export interface FingerPattern {
  id: string;
  name: string;
  /** steps relative to the position: frets on the guitar, keys of the hand position on the piano */
  steps: number[];
}

export const FINGER_PATTERNS: FingerPattern[] = [
  { id: 'spider', get name() { return L('Spider', 'Spinne'); }, steps: [0, 1, 2, 3] },
  { id: 'reverse', get name() { return L('Reverse', 'Rückwärts'); }, steps: [3, 2, 1, 0] },
  { id: 'skip', get name() { return L('Skip', 'Sprung'); }, steps: [0, 2, 1, 3] },
];

/** The notes of a finger pattern on one string, with index finger at the given fret. */
export const patternNotes = (p: FingerPattern, s: number, position = 5): TabNote[] => p.steps.map((d) => ({ s, f: position + d, fg: d + 1 }));

/** Five-finger patterns for the piano: steps count the keys of the position, from its lowest. */
export const PIANO_PATTERNS: FingerPattern[] = [
  { id: 'piano-up', get name() { return L('Up', 'Aufwärts'); }, steps: [0, 1, 2, 3, 4] },
  { id: 'piano-down', get name() { return L('Down', 'Abwärts'); }, steps: [4, 3, 2, 1, 0] },
  { id: 'piano-thirds', get name() { return L('Thirds', 'Terzen'); }, steps: [0, 2, 1, 3, 2, 4] },
  { id: 'piano-broken', get name() { return L('Broken chord', 'Gebrochener Akkord'); }, steps: [0, 2, 4, 2, 0] },
];

export interface PianoPosition {
  id: string;
  name: string;
  hand: 'right' | 'left';
  /** the five keys under the fingers, low to high */
  keys: number[];
}

export const PIANO_POSITIONS: PianoPosition[] = [
  { id: 'C', get name() { return L('C position', 'C-Position'); }, hand: 'right', keys: [60, 62, 64, 65, 67] },
  { id: 'G', get name() { return L('G position', 'G-Position'); }, hand: 'right', keys: [67, 69, 71, 72, 74] },
  { id: 'F', get name() { return L('F position', 'F-Position'); }, hand: 'right', keys: [65, 67, 69, 70, 72] },
  { id: 'C-left', get name() { return L('C position', 'C-Position'); }, hand: 'left', keys: [48, 50, 52, 53, 55] },
  { id: 'G-left', get name() { return L('G position', 'G-Position'); }, hand: 'left', keys: [43, 45, 47, 48, 50] },
];

export interface PianoNote {
  /** the key; for a chord struck as a whole, its lowest key */
  midi: number;
  fg?: number;
  /** length in note units, 1 when left out */
  len?: number;
  /** when set, the step is this chord with all its keys struck together */
  chord?: string;
  /** the chord whose keys are played one after the other from this note on: printed above it */
  over?: string;
}

/** A five-finger pattern in a hand position. The right thumb is finger 1 on the lowest key, the left on the highest. */
export const positionNotes = (p: FingerPattern, pos: PianoPosition): PianoNote[] => p.steps.map((d) => ({ midi: pos.keys[d], fg: pos.hand === 'right' ? d + 1 : 5 - d }));

export interface PianoScale {
  id: string;
  name: string;
  notes: PianoNote[];
}

/** One octave up with the right hand: the thumb passes under after the third finger. */
const scale = (id: string, en: string, de: string, from: number): PianoScale => ({ id, get name() { return L(en, de); }, notes: [0, 2, 4, 5, 7, 9, 11, 12].map((d, i) => ({ midi: from + d, fg: [1, 2, 3, 1, 2, 3, 4, 5][i] })) });
export const PIANO_SCALES: PianoScale[] = [scale('C', 'C major scale', 'C-Dur-Tonleiter', 60), scale('G', 'G major scale', 'G-Dur-Tonleiter', 55)];

/** The first chords on the piano: three white keys each, every other one. */
export const KEY_CHORDS = ['C', 'F', 'G', 'Am', 'Dm', 'Em'];
/** The next ones: a black key in the middle, or four keys. */
export const KEY_CHORDS_ON = ['D', 'A', 'E', 'G7', 'C7', 'Bm', 'E7', 'A7', 'D7', 'B7', 'F#m', 'Bb'];

/** Chord changes worth drilling on the piano, easiest first. */
export const KEY_PAIRS: [string, string][] = [
  ['C', 'G'],
  ['C', 'F'],
  ['F', 'G'],
  ['C', 'Am'],
  ['Am', 'F'],
  ['Dm', 'G'],
  ['Em', 'Am'],
  ['G', 'Em'],
  ['G', 'D'],
  ['D', 'A'],
  ['A', 'E'],
  ['Am', 'E'],
];

/** Chord changes worth drilling, easiest first. */
export const CHORD_PAIRS: [string, string][] = [
  ['Em', 'Am'],
  ['Am', 'C'],
  ['C', 'G'],
  ['G', 'D'],
  ['D', 'Em'],
  ['Am', 'E'],
  ['C', 'D'],
  ['Dm', 'Am'],
  ['F', 'C'],
  ['Em', 'F#m'],
  ['A', 'F#m'],
  ['F#m', 'D'],
];

export interface PianoPiece {
  id: string;
  title: string;
  /** who wrote it or made it known */
  by?: string;
  /** a tune of single notes (what is meant when left out), chords struck as a whole, or chords broken into single keys */
  kind?: 'melody' | 'chords' | 'broken';
  /** a version of another piece: the id of the full one */
  of?: string;
  /** the part of the song a phrase begins: "Verse", "Chorus" */
  parts?: (string | undefined)[];
  /** a song that is played in another key here than on the guitar: the chords it has there, in order of appearance */
  guitar?: string[];
  hand: string;
  /** seconds per note unit at full speed */
  noteDur: number;
  /** note units per metronome click */
  beat: number;
  phrases: PianoNote[][];
  /** clicks counted in before playing along; 4 when left out */
  count?: number;
  /** note units in a bar, where that is known: the click is heavier on the first of them */
  bar?: number;
  /** for each phrase, the note units of its upbeat: what is played before the first heavy click */
  leads?: number[];
  /** added by the user */
  custom?: boolean;
}

const keys = (notes: [number, number?][], fingers?: number[]): PianoNote[] => notes.map(([midi, len], i) => ({ midi, ...(fingers?.[i] ? { fg: fingers[i] } : {}), ...(len && len !== 1 ? { len } : {}) }));
/** five-finger position on C: thumb on C4 */
const cPos = (notes: [number, number?][]): PianoNote[] =>
  keys(
    notes,
    notes.map(([m]) => ({ 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 })[m] ?? 0),
  );

const [A4, B4, C5, D5, E5] = [69, 71, 72, 74, 76];

/** In the order they are suggested. */
export const PIANO_PIECES: PianoPiece[] = [
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    by: 'Ludwig van Beethoven',
    hand: 'right hand',
    noteDur: 0.5,
    beat: 1,
    phrases: [
      cPos([[E4], [E4], [F4], [G4], [G4], [F4], [E4], [D4]]),
      cPos([[C4], [C4], [D4], [E4], [E4, 1.5], [D4, 0.5], [D4, 2]]),
      cPos([[E4], [E4], [F4], [G4], [G4], [F4], [E4], [D4]]),
      cPos([[C4], [C4], [D4], [E4], [D4, 1.5], [C4, 0.5], [C4, 2]]),
    ],
  },
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    by: 'French melody',
    hand: 'right hand',
    noteDur: 0.5,
    beat: 1,
    phrases: [
      keys([[C4], [C4], [G4], [G4], [A4], [A4], [G4, 2]], [1, 1, 4, 4, 5, 5, 4]),
      keys([[F4], [F4], [E4], [E4], [D4], [D4], [C4, 2]], [4, 4, 3, 3, 2, 2, 1]),
      keys([[G4], [G4], [F4], [F4], [E4], [E4], [D4, 2]], [5, 5, 4, 4, 3, 3, 2]),
      keys([[G4], [G4], [F4], [F4], [E4], [E4], [D4, 2]], [5, 5, 4, 4, 3, 3, 2]),
      keys([[C4], [C4], [G4], [G4], [A4], [A4], [G4, 2]], [1, 1, 4, 4, 5, 5, 4]),
      keys([[F4], [F4], [E4], [E4], [D4], [D4], [C4, 2]], [4, 4, 3, 3, 2, 2, 1]),
    ],
  },
  {
    id: 'amazing-grace-piano',
    title: 'Amazing Grace',
    by: 'Traditional',
    hand: 'right hand',
    noteDur: 0.6,
    beat: 1,
    count: 3,
    phrases: [
      keys([[D4], [G4, 2], [B4, 0.5], [G4, 0.5], [B4, 2], [A4], [G4, 2], [E4], [D4, 2]], [1, 2, 4, 2, 4, 3, 2, 1, 1]),
      keys([[D4], [G4, 2], [B4, 0.5], [G4, 0.5], [B4, 2], [A4], [D5, 3]], [1, 2, 4, 2, 4, 3, 5]),
    ],
  },
  {
    id: 'fur-elise',
    title: 'Für Elise',
    by: 'Ludwig van Beethoven',
    hand: 'right hand',
    noteDur: 0.3,
    beat: 2,
    count: 3,
    phrases: [
      keys([[E5], [75], [E5], [75], [E5], [B4], [D5], [C5], [A4, 2]], [5, 4, 5, 4, 5, 2, 4, 3, 1]),
      keys([[C4], [E4], [A4], [B4, 2]], [1, 2, 4, 5]),
      keys([[E4], [68], [B4], [C5, 2]], [1, 3, 4, 5]),
      keys([[E5], [75], [E5], [75], [E5], [B4], [D5], [C5], [A4, 2]], [5, 4, 5, 4, 5, 2, 4, 3, 1]),
      keys([[C4], [E4], [A4], [B4, 2]], [1, 2, 4, 5]),
      keys([[E4], [C5], [B4], [A4, 2]], [1, 5, 4, 3]),
    ],
  },
];

/** Every piece: the four the app began with, the piano book, and the player's own. */
export const allPieces = (): PianoPiece[] => [...PIANO_PIECES, ...pianoBook(), ...store.pieces];
export const findPiece = (id: string | undefined): PianoPiece => allPieces().find((p) => p.id === id) ?? PIANO_PIECES[0];

const sameAs = new WeakMap<PianoPiece, number[]>();
/** Skill a phrase measures. Phrases that are note for note the same share one: the first of them. */
export function phraseKey(piece: PianoPiece, phrase: number): string {
  let first = sameAs.get(piece);
  if (!first) {
    const text = piece.phrases.map((p) => JSON.stringify(p.map((n) => [n.chord ?? n.midi, n.len ?? 1])));
    first = text.map((t) => text.indexOf(t));
    sameAs.set(piece, first);
  }
  return `bar:${piece.id}:p${(first[phrase] ?? phrase) + 1}`;
}

/** Every key a step of a piece asks for: the one key of a note, or all keys of a chord. */
export const stepKeys = (n: PianoNote): number[] => (n.chord ? pianoChord(n.chord).midis : [n.midi]);

/** Start of every note in note units, and the total length. */
export function noteTimes(notes: { len?: number }[]): { at: number[]; total: number } {
  const at: number[] = [];
  let t = 0;
  for (const n of notes) {
    at.push(t);
    t += n.len ?? 1;
  }
  return { at, total: t };
}
