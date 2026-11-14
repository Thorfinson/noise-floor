/** Notes, tuning and the chord library. Strings are indexed 0 (low E) to 5 (high e). */
import { L, lang } from '../core/i18n';

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];
export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
const STRING_FULL_DE = ['tiefe E', 'A', 'D', 'G', 'B', 'hohe e'];
/**
 * The name of a string before the word for string, in the language shown when it is read: "the low E string",
 * "die tiefe E-Saite" (German puts "-Saite" right after it). For the whole phrase see `stringName`.
 */
export const STRING_FULL: string[] = new Proxy(['low E', 'A', 'D', 'G', 'B', 'high e'], { get: (en, k) => Reflect.get(lang() === 'de' ? STRING_FULL_DE : en, k) });
/**
 * A string by its name, without article: "low E string", "A string"; in German "tiefe E-Saite", "A-Saite".
 * German changes the ending after "der" ("auf der tiefen E-Saite"): pass dative for that.
 */
export const stringName = (s: number, dative = false): string =>
  L(`${STRING_FULL[s]} string`, s === 0 ? (dative ? 'tiefen E-Saite' : 'tiefe E-Saite') : s === 5 ? (dative ? 'hohen e-Saite' : 'hohe e-Saite') : `${STRING_NAMES[s]}-Saite`);

export const midiToFreq = (midi: number, a4 = 440): number => a4 * Math.pow(2, (midi - 69) / 12);
export const freqToMidi = (freq: number, a4 = 440): number => 69 + 12 * Math.log2(freq / a4);
export const noteName = (midi: number): string => NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
export const centsBetween = (f: number, ref: number): number => 1200 * Math.log2(f / ref);

/** The open string a pitch is nearest to: what the tuner takes a plucked string for. */
export function nearestString(freq: number, a4 = 440, offsets: number[] = [0, 0, 0, 0, 0, 0]): number {
  const open = (i: number): number => midiToFreq(OPEN_STRINGS[i] + offsets[i], a4);
  let best = 0;
  for (let i = 1; i < OPEN_STRINGS.length; i++) if (Math.abs(centsBetween(freq, open(i))) < Math.abs(centsBetween(freq, open(best)))) best = i;
  return best;
}

/** How many readings in a row must name another string before the tuner turns to it. */
export const FOLLOW_AFTER = 4;

export interface Chord {
  /** key used in data and storage, e.g. "F#m" */
  id: string;
  /** name as shown, e.g. "F♯m" */
  name: string;
  /** fret per string, low E to high e; -1 = string not played */
  frets: number[];
  /** finger per string (1 index .. 4 little finger), 0 = none */
  fingers: number[];
  /** how hard the shape is, where that does not follow from its barre: 0 open and easy .. 3 like a full barre */
  weight?: number;
}

const pretty = (id: string): string => id.replace('#', '♯').replace(/^([A-G])b/, '$1♭');
const chord = (id: string, frets: number[], fingers: number[], name = pretty(id), weight?: number): Chord => ({ id, name, frets, fingers, ...(weight === undefined ? {} : { weight }) });

export const CHORDS: Record<string, Chord> = Object.fromEntries(
  [
    chord('Em', [0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0]),
    chord('E', [0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0]),
    chord('Am', [-1, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0]),
    chord('A', [-1, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0]),
    chord('C', [-1, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0]),
    chord('G', [3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3]),
    chord('D', [-1, -1, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2]),
    chord('Dm', [-1, -1, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1]),
    chord('F', [-1, -1, 3, 2, 1, 1], [0, 0, 3, 2, 1, 1]),
    // small shapes: the same chord on the top four strings, a first step toward the full barre
    chord('F#m-easy', [-1, -1, 4, 2, 2, 2], [0, 0, 3, 1, 1, 1], 'F♯m (small)'),
    chord('F#m', [2, 4, 4, 2, 2, 2], [1, 3, 4, 1, 1, 1]),
    chord('Bm-easy', [-1, -1, 4, 4, 3, 2], [0, 0, 3, 4, 2, 1], 'Bm (small)', 1),
    chord('Bm', [-1, 2, 4, 4, 3, 2], [0, 1, 3, 4, 2, 1]),
    // open chords with a seventh, a fourth or a second: what songs colour the eight basic shapes with
    chord('E7', [0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0]),
    chord('A7', [-1, 0, 2, 0, 2, 0], [0, 0, 1, 0, 2, 0]),
    chord('D7', [-1, -1, 0, 2, 1, 2], [0, 0, 0, 2, 1, 3]),
    chord('G7', [3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1]),
    chord('C7', [-1, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0], 'C7', 1),
    chord('B7', [-1, 2, 1, 2, 0, 2], [0, 2, 1, 3, 0, 4], 'B7', 1),
    chord('Am7', [-1, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0]),
    chord('Em7', [0, 2, 2, 0, 3, 3], [0, 1, 2, 0, 3, 4]),
    chord('Dm7', [-1, -1, 0, 2, 1, 1], [0, 0, 0, 2, 1, 1]),
    chord('Cmaj7', [-1, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0]),
    chord('Fmaj7', [-1, -1, 3, 2, 1, 0], [0, 0, 3, 2, 1, 0]),
    chord('Gmaj7', [3, 2, 0, 0, 0, 2], [3, 2, 0, 0, 0, 1]),
    chord('Dmaj7', [-1, -1, 0, 2, 2, 2], [0, 0, 0, 1, 1, 1], 'Dmaj7', 1),
    chord('Cadd9', [-1, 3, 2, 0, 3, 3], [0, 2, 1, 0, 3, 4]),
    chord('Dsus4', [-1, -1, 0, 2, 3, 3], [0, 0, 0, 1, 3, 4]),
    chord('Dsus2', [-1, -1, 0, 2, 3, 0], [0, 0, 0, 1, 3, 0]),
    chord('Asus4', [-1, 0, 2, 2, 3, 0], [0, 0, 1, 2, 3, 0]),
    chord('Asus2', [-1, 0, 2, 2, 0, 0], [0, 0, 1, 2, 0, 0]),
    chord('A7sus4', [-1, 0, 2, 0, 3, 3], [0, 0, 1, 0, 3, 4]),
    chord('D69', [2, 0, 0, 2, 0, 0], [2, 0, 0, 3, 0, 0], 'D6/9'),
    // jazz shapes without a barre that still take some getting used to
    chord('F#m7b5', [2, -1, 2, 2, 1, -1], [2, 0, 3, 4, 1, 0], 'F♯m7♭5', 2),
    chord('Bm7b5', [-1, 2, 3, 2, 3, -1], [0, 1, 3, 2, 4, 0], 'Bm7♭5', 2),
    // full barre chords: the E shape and the A shape, moved up the neck
    chord('Fm', [1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1]),
    chord('F#', [2, 4, 4, 3, 2, 2], [1, 3, 4, 2, 1, 1]),
    chord('Gm', [3, 5, 5, 3, 3, 3], [1, 3, 4, 1, 1, 1]),
    chord('G#m', [4, 6, 6, 4, 4, 4], [1, 3, 4, 1, 1, 1]),
    chord('Ab', [4, 6, 6, 5, 4, 4], [1, 3, 4, 2, 1, 1]),
    chord('Bb', [-1, 1, 3, 3, 3, 1], [0, 1, 2, 3, 4, 1]),
    chord('B', [-1, 2, 4, 4, 4, 2], [0, 1, 2, 3, 4, 1]),
    chord('Cm', [-1, 3, 5, 5, 4, 3], [0, 1, 3, 4, 2, 1]),
    chord('C#m', [-1, 4, 6, 6, 5, 4], [0, 1, 3, 4, 2, 1]),
    chord('Db', [-1, 4, 6, 6, 6, 4], [0, 1, 2, 3, 4, 1]),
    // power chords: the root, its fifth and the octave, on the low strings; no third, so neither major nor minor
    chord('E5', [0, 2, 2, -1, -1, -1], [0, 1, 2, 0, 0, 0]),
    chord('A5', [-1, 0, 2, 2, -1, -1], [0, 0, 1, 2, 0, 0]),
    chord('D5', [-1, -1, 0, 2, 3, -1], [0, 0, 0, 1, 2, 0]),
    chord('G5', [3, 5, 5, -1, -1, -1], [1, 3, 4, 0, 0, 0], 'G5', 1),
    chord('C5', [-1, 3, 5, 5, -1, -1], [0, 1, 3, 4, 0, 0], 'C5', 1),
    chord('F5', [1, 3, 3, -1, -1, -1], [1, 3, 4, 0, 0, 0], 'F5', 1),
    chord('B5', [-1, 2, 4, 4, -1, -1], [0, 1, 3, 4, 0, 0], 'B5', 1),
  ].map((c) => [c.id, c]),
);
// the small shapes say so in the language shown
for (const c of [CHORDS['F#m-easy'], CHORDS['Bm-easy']]) {
  const en = c.name;
  Object.defineProperty(c, 'name', { get: () => L(en, en.replace('(small)', '(klein)')), enumerable: true, configurable: true });
}

/**
 * The strings the index finger holds down at once, lying flat across one fret: the barre of F♯m and Bm, and
 * the small one over two strings of F. Empty for a chord without one.
 */
export const barreStrings = (c: Chord): number[] => {
  const s = c.fingers.map((f, i) => (f === 1 ? i : -1)).filter((i) => i >= 0);
  return s.length >= 2 && s.every((i) => c.frets[i] === c.frets[s[0]]) ? s : [];
};

/** Where each finger of a chord sits: finger number to its strings and frets. */
function fingerSpots(c: Chord): Map<number, string[]> {
  const out = new Map<number, string[]>();
  c.fingers.forEach((f, s) => {
    if (f > 0 && c.frets[s] > 0) out.set(f, [...(out.get(f) ?? []), `${s}:${c.frets[s]}`]);
  });
  return out;
}

const fingerList = (f: number[]): string => (f.length === 1 ? `Finger ${f[0]}` : L(`Fingers ${f.slice(0, -1).join(', ')} and ${f[f.length - 1]}`, `Finger ${f.slice(0, -1).join(', ')} und ${f[f.length - 1]}`));

/**
 * How to get from one chord to the next, in the three ways guitar teachers describe a change: a finger that
 * stays where it is (an anchor), fingers that keep their shape and move together, or, when neither applies,
 * lifting and landing all fingers together. Finger numbers are the ones on the chord diagrams.
 */
export function changeTip(from: Chord, to: Chord): string {
  const a = fingerSpots(from);
  const b = fingerSpots(to);
  const both = [...b.keys()].filter((f) => a.has(f)).sort();
  // a finger stays if every place it holds in the new chord it already held (a barre may let go of strings)
  const stay = both.filter((f) => b.get(f)!.every((spot) => a.get(f)!.includes(spot)));
  const rest = [...b.keys()].filter((f) => !stay.includes(f)).sort();
  const shift = (f: number): string => {
    const [s0, f0] = a.get(f)![0].split(':').map(Number);
    const [s1, f1] = b.get(f)![0].split(':').map(Number);
    return `${s1 - s0}:${f1 - f0}`;
  };
  const single = (f: number): boolean => a.get(f)?.length === 1 && b.get(f)!.length === 1;
  const where = (ds: number, df: number): string =>
    L(
      [ds ? `${Math.abs(ds)} ${Math.abs(ds) === 1 ? 'string' : 'strings'} towards the ${ds > 0 ? 'floor' : 'ceiling'}` : '', df ? `${Math.abs(df)} ${Math.abs(df) === 1 ? 'fret' : 'frets'} ${df > 0 ? 'up' : 'down'}` : ''].filter(Boolean).join(' and '),
      [ds ? `${Math.abs(ds)} ${Math.abs(ds) === 1 ? 'Saite' : 'Saiten'} Richtung ${ds > 0 ? 'Boden' : 'Decke'}` : '', df ? `${Math.abs(df)} ${Math.abs(df) === 1 ? 'Bund' : 'Bünde'} ${df > 0 ? 'höher' : 'tiefer'}` : ''].filter(Boolean).join(' und '),
    );
  // fingers that move by the same step keep their shape
  const movers = both.filter((f) => !stay.includes(f) && single(f));
  const block = movers.length >= 2 && movers.every((f) => shift(f) === shift(movers[0])) ? movers : [];
  const added = rest.filter((f) => !a.has(f));
  const parts: string[] = [];
  if (stay.length) parts.push(L(`${fingerList(stay)} ${stay.length === 1 ? 'stays' : 'stay'} down.`, `${fingerList(stay)} ${stay.length === 1 ? 'bleibt' : 'bleiben'} liegen.`));
  if (block.length) {
    const [ds, df] = shift(block[0]).split(':').map(Number);
    parts.push(L(`${fingerList(block)} keep their shape: ${where(ds, df)}.`, `${fingerList(block)} behalten ihre Form: ${where(ds, df)}.`));
  }
  const loose = rest.filter((f) => !block.includes(f) && !added.includes(f));
  if (stay.length && loose.length === 1 && b.get(loose[0])!.length === 1) {
    const [s1, f1] = b.get(loose[0])![0].split(':').map(Number);
    parts.push(L(`Only finger ${loose[0]} moves: ${STRING_FULL[s1]} string, fret ${f1}.`, `Nur Finger ${loose[0]} bewegt sich: ${stringName(s1)}, ${f1}. Bund.`));
  } else if (!stay.length && !block.length) {
    // nothing to hold on to: say which finger to aim with, the one on the thickest string
    const lead = [...b.entries()].sort((x, y) => Number(x[1][0].split(':')[0]) - Number(y[1][0].split(':')[0]))[0]?.[0];
    return L(`No finger stays: lift them together and land them together${lead ? `, finger ${lead} first` : ''}.`, `Kein Finger bleibt liegen: Heb alle zusammen ab und setz sie zusammen auf${lead ? `, Finger ${lead} zuerst` : ''}.`);
  }
  if (added.length) parts.push(L(`Add ${fingerList(added).toLowerCase()}.`, `Setz ${fingerList(added)} dazu.`));
  return parts.join(' ');
}

/** Where a pitch sits in open position: the highest string that has it within the first four frets. */
export function midiToTab(midi: number): { s: number; f: number } {
  for (let s = 5; s >= 0; s--) {
    const f = midi - OPEN_STRINGS[s];
    if (f >= 0 && f <= 4) return { s, f };
  }
  for (let s = 0; s < 6; s++) {
    const f = midi - OPEN_STRINGS[s];
    if (f >= 0 && (s === 5 || midi < OPEN_STRINGS[s + 1])) return { s, f };
  }
  return { s: 0, f: Math.max(0, midi - OPEN_STRINGS[0]) };
}

/**
 * How alike two chords sound, 0 to 1: how far the notes they are made of (by name, octaves aside) agree.
 * G and G7 are almost one chord to a microphone; G and D are not.
 */
export function chordsAlike(a: Chord, b: Chord): number {
  const hist = (c: Chord): number[] => {
    const h = new Array<number>(12).fill(0);
    for (const m of chordNotes(c)) h[m % 12]++;
    return h;
  };
  const [x, y] = [hist(a), hist(b)];
  let dot = 0;
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < 12; i++) {
    dot += x[i] * y[i];
    nx += x[i] * x[i];
    ny += y[i] * y[i];
  }
  return dot / Math.sqrt(nx * ny || 1);
}

/**
 * Whether a strum the listener reports can be taken for the chord that was wanted: it sounds like it, and
 * no other candidate fits clearly better. Where the better fit is a chord made of nearly the same notes
 * (Em7 and G), a microphone cannot be asked to tell the two apart, and the wanted one is given.
 */
export function strumIs(e: { best: string | null; score: number; sims: Record<string, number> }, want: string, piano = false): boolean {
  const sim = e.sims[want] ?? 0;
  if (sim <= 0.6) return false;
  if (e.best === want || sim >= e.score - 0.05) return true;
  return !!e.best && (piano || (!!CHORDS[e.best] && !!CHORDS[want])) && alike(e.best, want, piano) >= 0.75 && sim >= e.score - 0.12;
}

/** The keys of a chord on the piano, low to high, with the finger of the right hand for each (1 thumb .. 5 little finger). */
export interface KeyChord {
  id: string;
  name: string;
  midis: number[];
  fingers: number[];
  /** the names of its keys as the chord spells them: the middle key of C minor is E♭, not D♯ */
  keys: string[];
}

/**
 * What a chord is made of, by the ending of its name: its keys as steps in semitones above its root, the
 * finger for each, and which letter each key is named with, counted in letters from the root's.
 */
const MAKE: [RegExp, number[], number[], number[]][] = [
  [/^m7b5$/, [0, 3, 6, 10], [1, 2, 3, 5], [0, 2, 4, 6]],
  [/^maj7$/, [0, 4, 7, 11], [1, 2, 3, 5], [0, 2, 4, 6]],
  [/^7sus4$/, [0, 5, 7, 10], [1, 3, 4, 5], [0, 3, 4, 6]],
  [/^m7$/, [0, 3, 7, 10], [1, 2, 3, 5], [0, 2, 4, 6]],
  [/^add9$/, [0, 2, 4, 7], [1, 2, 3, 5], [0, 1, 2, 4]],
  [/^sus4$/, [0, 5, 7], [1, 4, 5], [0, 3, 4]],
  [/^sus2$/, [0, 2, 7], [1, 2, 5], [0, 1, 4]],
  [/^69$/, [0, 4, 7, 9], [1, 2, 3, 5], [0, 2, 4, 5]],
  [/^7$/, [0, 4, 7, 10], [1, 2, 3, 5], [0, 2, 4, 6]],
  [/^m$/, [0, 3, 7], [1, 3, 5], [0, 2, 4]],
  [/^5$/, [0, 7, 12], [1, 3, 5], [0, 4, 7]],
  [/^$/, [0, 4, 7], [1, 3, 5], [0, 2, 4]],
];
const ROOTS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = 'CDEFGAB';

/**
 * A chord on the piano: in close position with its root at the bottom, the root being the first key of
 * that name from middle C upward. One rule for every chord, so that a chord is found by its name; the
 * hand moves from chord to chord. Chords the guitar has a small shape for are the same chord here.
 */
export function pianoChord(id: string): KeyChord {
  // keys struck together that are no chord of the list: a bass of the left hand with a key of the right
  if (id.startsWith('keys:')) {
    const midis = id.slice(5).split('+').map(Number);
    const keys = midis.map((x) => noteName(x));
    return { id, name: keys.join(' + '), midis, fingers: midis.map((_, i) => (i === 0 ? 5 : 1)), keys: keys.map((k) => k.replace(/-?\d+$/, '')) };
  }
  const plain = id.replace(/-easy$/, '');
  const m = /^([A-G])([#b]?)(.*)$/.exec(plain);
  if (!m) throw new Error(`no chord called ${id}`);
  const root = 60 + ((ROOTS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12);
  const [, steps, fingers, letters] = MAKE.find(([ending]) => ending.test(m[3])) ?? MAKE[MAKE.length - 1];
  const name = CHORDS[plain]?.name ?? pretty(plain).replace('b5', '♭5').replace(/69$/, '6/9');
  // each key is named with its own letter: how far the key lies from that letter's white key says sharp or flat
  const keys = steps.map((s, i) => {
    const letter = LETTERS[(LETTERS.indexOf(m[1]) + letters[i]) % 7];
    const off = ((((root + s) % 12) - ROOTS[letter] + 18) % 12) - 6;
    return letter + (off > 0 ? '♯'.repeat(off) : '♭'.repeat(-off));
  });
  return { id: plain, name, midis: steps.map((s) => root + s), fingers, keys };
}

/** The id of keys struck together that are no chord: "keys:43+64", lowest first. */
export const keysId = (midis: number[]): string => `keys:${[...midis].sort((a, b) => a - b).join('+')}`;

/**
 * Semitones above a key at which its own overtones lie (the 2nd to the 8th): a key of the right hand at one
 * of these distances above a bass sounds inside the bass's own sound, and the microphone cannot tell the two
 * apart (on real piano recordings: a fifth and an octave above, two octaves and a third or a fifth, the 7th).
 */
export const OVERTONE_STEPS = [12, 19, 24, 28, 31, 34, 36];

/** The name of a key as a chord spells it, with its octave; as noteName has it for a key the chord does not have. */
export function keyName(midi: number, chord?: string, octave = true): string {
  const c = chord ? pianoChord(chord) : null;
  const i = c ? c.midis.findIndex((k) => (k - midi) % 12 === 0) : -1;
  if (!c || i < 0) return octave ? noteName(midi) : noteName(midi).replace(/\d+$/, '');
  return c.keys[i] + (octave ? Math.floor(midi / 12) - 1 : '');
}

/** The name of a chord as it is shown: of the guitar's shape, or of the chord as such on the piano. */
export const chordName = (id: string, piano = false): string => (piano ? pianoChord(id).name : (CHORDS[id]?.name ?? id));

const MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/** A chord moved up by so many semitones: Am, three up, is Cm. */
export function transposed(id: string, by: number): string {
  const m = /^([A-G])([#b]?)(.*)$/.exec(id.replace(/-easy$/, ''));
  if (!m) return id;
  const root = (((ROOTS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + by) % 12) + 12) % 12;
  const minor = /^m(?!aj)/.test(m[3]);
  return (minor ? MINOR_ROOTS : MAJOR_ROOTS)[root] + m[3];
}

const BLACK_KEYS = [1, 3, 6, 8, 10];
export const isBlackKey = (midi: number): boolean => BLACK_KEYS.includes(((midi % 12) + 12) % 12);
/** Where a key lies, counted in white keys; a black key lies half a step above the white one to its left. */
export const whiteStep = (midi: number): number => Math.floor(midi / 12) * 7 + [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6][((midi % 12) + 12) % 12];

/** How alike two chords sound on the piano, 0 to 1: the share of keys (by name) they have in common. */
export function keysAlike(a: string, b: string): number {
  const x = new Set(pianoChord(a).midis.map((m) => m % 12));
  const y = new Set(pianoChord(b).midis.map((m) => m % 12));
  let both = 0;
  for (const k of x) if (y.has(k)) both++;
  return both / Math.sqrt(x.size * y.size);
}

/** How alike two chords sound on the instrument they are played on. */
export const alike = (a: string, b: string, piano: boolean): number => (piano ? keysAlike(a, b) : chordsAlike(CHORDS[a], CHORDS[b]));

/**
 * How hard a chord is to find and hold on the piano: 0 for three white keys, 1 for one black key in the
 * middle or a fourth key, 2 for a shape that starts on a black key or has two of them, 3 for four keys of that kind.
 */
export function keyWeight(id: string): number {
  const c = pianoChord(id);
  const blacks = c.midis.filter(isBlackKey).length;
  const shape = blacks === 0 ? 0 : isBlackKey(c.midis[0]) || blacks >= 2 ? 2 : 1;
  return Math.min(3, shape + (c.midis.length > 3 ? 1 : 0));
}

const KEY_FINGER = ['', 'thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
const KEY_FINGER_DE = ['', 'Daumen', 'Zeigefinger', 'Mittelfinger', 'Ringfinger', 'kleiner Finger'];
const list = (words: string[]): string => (words.length > 1 ? L(`${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`, `${words.slice(0, -1).join(', ')} und ${words[words.length - 1]}`) : (words[0] ?? ''));

/** Where the fingers go for a chord on the piano, in words. */
export function keyLines(id: string): string[] {
  const c = pianoChord(id);
  const fingers = lang() === 'de' ? KEY_FINGER_DE : KEY_FINGER;
  const out = c.midis.map((m, i) => L(`${fingers[c.fingers[i]][0].toUpperCase()}${fingers[c.fingers[i]].slice(1)} (${c.fingers[i]}) on ${c.keys[i]}${isBlackKey(m) ? ', a black key' : ''}`, `${fingers[c.fingers[i]][0].toUpperCase()}${fingers[c.fingers[i]].slice(1)} (${c.fingers[i]}) auf ${c.keys[i]}${isBlackKey(m) ? ', eine schwarze Taste' : ''}`));
  const blacks = c.midis.filter(isBlackKey).length;
  out.push(blacks ? L('Move the hand a little into the keys, so that the finger on the black key need not stretch', 'Schieb die Hand ein wenig weiter zwischen die Tasten, damit sich der Finger auf der schwarzen Taste nicht strecken muss') : L('All white keys: every other one, with a key left out between the fingers', 'Nur weiße Tasten: jede zweite, zwischen den Fingern bleibt eine Taste frei'));
  return out;
}

/**
 * How to get from one chord to the next on the piano: which keys stay under the hand, how far the hand
 * moves and in which direction, and what changes in its shape. Finger numbers are those on the keyboard picture.
 */
export function keyTip(from: string, to: string): string {
  const a = pianoChord(from);
  const b = pianoChord(to);
  const move = b.midis[0] - a.midis[0];
  // the shape of the hand: how many white keys lie between its fingers. C and A minor are one shape to the hand.
  const shape = (c: KeyChord): string => c.midis.map((m) => whiteStep(m) - whiteStep(c.midis[0])).join();
  const shared = b.midis.filter((m) => a.midis.includes(m));
  const parts: string[] = [];
  /** a key by the name the chord it belongs to gives it */
  const inB = (m: number): string => keyName(m, to, false);
  if (move === 0) {
    // the same place: only the keys that differ are named
    const moved = b.midis.map((m, i) => ({ m, f: b.fingers[i] })).filter((x) => !a.midis.includes(x.m));
    parts.push(L('The thumb stays where it is.', 'Der Daumen bleibt, wo er ist.'));
    if (moved.length) parts.push(L(`${moved.map((x) => `Finger ${x.f} goes to ${inB(x.m)}`).join(', ')}.`, `${moved.map((x) => `Finger ${x.f} geht auf ${inB(x.m)}`).join(', ')}.`));
    else parts.push(L(`Lift ${list(a.midis.filter((m) => !b.midis.includes(m)).map((m) => keyName(m, from, false)))}.`, `Lass ${list(a.midis.filter((m) => !b.midis.includes(m)).map((m) => keyName(m, from, false)))} los.`));
    return parts.join(' ');
  }
  // how far the thumb travels, counted in white keys where both chords start on one
  const whites = (lo: number, hi: number): number => {
    let n = 0;
    for (let m = lo + 1; m <= hi; m++) if (!isBlackKey(m)) n++;
    return n;
  };
  const far = !isBlackKey(a.midis[0]) && !isBlackKey(b.midis[0]) ? whites(Math.min(a.midis[0], b.midis[0]), Math.max(a.midis[0], b.midis[0])) : 0;
  const way = move > 0 ? 'up, to the right' : 'down, to the left';
  const keeps = shape(a) === shape(b) && a.midis.filter(isBlackKey).length === 0 && b.midis.filter(isBlackKey).length === 0;
  parts.push(
    L(
      `${keeps ? 'The hand keeps its shape and moves' : 'The hand moves'} ${far ? `${far} ${far === 1 ? 'key' : 'keys'} ` : ''}${way}: the thumb lands on ${inB(b.midis[0])}.`,
      `${keeps ? 'Die Hand behält ihre Form und wandert' : 'Die Hand wandert'} ${far ? `${far} ${far === 1 ? 'Taste' : 'Tasten'} ` : ''}${move > 0 ? 'aufwärts, nach rechts' : 'abwärts, nach links'}: Der Daumen landet auf ${inB(b.midis[0])}.`,
    ),
  );
  const blacks = b.midis.map((m, i) => ({ m, f: b.fingers[i] })).filter((x) => isBlackKey(x.m));
  if (blacks.length) parts.push(L(`${blacks.map((x) => `Finger ${x.f} takes the black key ${inB(x.m)}`).join(', ')}.`, `${blacks.map((x) => `Finger ${x.f} nimmt die schwarze Taste ${inB(x.m)}`).join(', ')}.`));
  else if (a.midis.some(isBlackKey)) parts.push(L('White keys only again.', 'Wieder nur weiße Tasten.'));
  if (shared.length) parts.push(L(`${list(shared.map(inB))} ${shared.length === 1 ? 'is' : 'are'} in both chords, under another finger.`, `${list(shared.map(inB))} ${shared.length === 1 ? 'ist' : 'sind'} in beiden Akkorden, unter einem anderen Finger.`));
  return parts.join(' ');
}

/** MIDI note per string for a chord; null where the string is not played. */
export const chordMidis = (c: Chord): (number | null)[] => c.frets.map((f, i) => (f < 0 ? null : OPEN_STRINGS[i] + f));

/** Played notes of a chord, low to high. */
export const chordNotes = (c: Chord): number[] => chordMidis(c).filter((m): m is number => m !== null);
