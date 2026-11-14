/**
 * A song of chords with its words: the words under each bar, and the melody laid over the bars of the chords,
 * moved into their key. The screen that shows it is src/screens/singalong.ts.
 */
import { allSongs, noteTimes, shapeOf, type Song } from './content';
import { LYRICS, SING_ALONG, syllables } from './lyrics';
import { pianoChord } from './theory';
import { voiceBook } from './voicebook';

/** The chords of a bar, in the order they are struck. */
export const chordsOf = (song: Song, k: number): string[] => [...new Set(song.bars[k].notes.map((n) => n.strum).filter((c): c is string => !!c))];

/** Note units in each bar of the chords. */
export const barUnits = (song: Song): number[] => song.bars.map((b) => noteTimes(b.notes).total);

/** A bar's syllables as one line of words: "from A-la-ba-" (a held note shows nothing). */
export const said = (syl: string[]): string => syl.filter((s) => s !== '_').map((s, i, a) => (s.endsWith('-') || i === a.length - 1 ? s : s + ' ')).join('');

export interface SungNote {
  /** where it begins, in note units of the chords from the first bar (negative: the upbeat) */
  u: number;
  len: number;
  midi: number;
}

/** The words under each bar of the chords, and the melody laid over the chords' bars; null without words. */
export function sheet(song: Song): { words: string[][]; melody: SungNote[] } | null {
  const map = SING_ALONG[song.id];
  const v = map && voiceBook().find((x) => x.id === map.voice);
  if (!map || !v || !LYRICS[v.id]) return null;
  const units = barUnits(song);
  const chordBeats = units[0] / song.beat;
  // a bar of the melody, in its own note units; it lies over one bar of the chords
  const mBar = v.bar ?? chordBeats * v.beat;
  const lead = map.lead ?? v.leads?.[0] ?? 0;
  const at = map.at ?? 0;
  const starts: number[] = [];
  units.reduce((u, n) => (starts.push(u), u + n), 0);
  const words: string[][] = song.bars.map(() => []);
  const melody: SungNote[] = [];
  let u = -lead;
  let bars = 0;
  v.phrases.forEach((ph, k) => {
    const syl = syllables(v.id, k);
    ph.forEach((n, i) => {
      const len = n.len ?? 1;
      const b = Math.floor((u + 1e-6) / mBar);
      // the upbeat before the first bar is written under the first bar
      const target = at + Math.max(0, b);
      if (target < words.length) words[target].push(syl[i] ?? '');
      // where the note lies in the bar of the chords it falls in
      const into = ((u - b * mBar) / mBar) * (units[Math.min(units.length - 1, at + Math.max(0, b))] ?? units[0]);
      melody.push({ u: (starts[at + b] ?? (b < 0 ? starts[at] - units[at] : 0)) + into, len: (len / mBar) * units[0], midi: n.midi });
      bars = Math.max(bars, b + 1);
      u += len;
    });
  });
  if (map.repeat)
    for (let k = 0; k < bars; k++) {
      const twin = at + bars + k;
      if (twin >= words.length) break;
      words[twin] = [...words[at + k]];
      for (const n of melody.filter((x) => x.u >= starts[at + k] - 1e-6 && x.u < starts[at + k] + units[at + k] - 1e-6)) melody.push({ ...n, u: n.u - starts[at + k] + starts[twin] });
    }
  // the melody moved to the key of the chords: its last note onto the root of the last chord, near middle C
  const last = melody.filter((n) => n.u < (map.repeat ? starts[at + bars] ?? Infinity : Infinity)).pop();
  const lastChord = chordsOf(song, Math.min(song.bars.length - 1, at + bars - 1)).pop();
  if (last && lastChord) {
    const root = pianoChord(shapeOf(lastChord).id).midis[0] % 12;
    let shift = (((root - (last.midi % 12)) % 12) + 12) % 12;
    if (shift > 6) shift -= 12;
    const mean = melody.reduce((s, n) => s + n.midi, 0) / melody.length + shift;
    shift += 12 * Math.round((64 - mean) / 12);
    for (const n of melody) n.midi += shift;
  }
  return { words, melody: melody.sort((a, b) => a.u - b.u) };
}

/** The songs that can be sung and played here. */
export const singAlongSongs = (): Song[] => allSongs().filter((s) => !!SING_ALONG[s.id] && !!sheet(s));

/**
 * The words of a melody, one syllable per note, for a guitar tune or a piano piece whose melody is also a song
 * to sing with words; null when it has none, or when its notes are not the sung ones one for one.
 */
export function melodyWords(id: string, notes: number): string[] | null {
  const v = voiceBook().find((x) => x.from === id || x.from === `${id}~keys`);
  if (!v || !LYRICS[v.id]) return null;
  const syl = v.phrases.flatMap((_, k) => syllables(v.id, k));
  return syl.length === notes ? syl : null;
}
