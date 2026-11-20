/**
 * Five notes: one tune a day, found on the instrument by ear. The first five notes of a song from the book are
 * played; the player has six tries to play them back. After each try every note is marked: right note in the
 * right place, a note of the tune that belongs elsewhere, or a note that is not in it at all. Solved or not, the
 * song is revealed at the end and can be played on.
 *
 * Notes are compared by name (pitch class): an octave lower or higher counts, because the instrument and the
 * hand decide the octave, not the ear. A repeated note is counted as often as the tune has it, the way word
 * puzzles count a repeated letter.
 *
 * Nothing about drawing or sound in here: the screen is src/screens/fivenotes.ts.
 */
import type { Song } from '../music/content';
import { songMaterial } from '../music/material';
import { tuneOf } from '../music/accompany';

export const NOTES = 5;
export const TRIES = 6;
/** times the tune may be heard again after the first, per day */
export const HEARINGS = 2;

export type Mark = 'gold' | 'in' | 'no';

/** A tune that can be today's: the song it opens, and its first five notes. */
export interface FiveTune {
  id: string;
  title: string;
  midis: number[];
  /** seconds each note lasts when it is played to the player, from the song's own rhythm, kept within reason */
  lens: number[];
}

export const pitchClass = (m: number): number => ((Math.round(m) % 12) + 12) % 12;

/**
 * Marks a try against the tune. First every note in its right place is gold; then each other note is "in" as
 * long as the tune still has an unmatched note of that name, otherwise "no".
 */
export function judge(guess: number[], secret: number[]): Mark[] {
  const g = guess.map(pitchClass);
  const s = secret.map(pitchClass);
  const marks: Mark[] = g.map((n, i) => (n === s[i] ? 'gold' : 'no'));
  const left = new Map<number, number>();
  s.forEach((n, i) => {
    if (marks[i] !== 'gold') left.set(n, (left.get(n) ?? 0) + 1);
  });
  g.forEach((n, i) => {
    if (marks[i] === 'gold') return;
    const k = left.get(n) ?? 0;
    if (k > 0) {
      marks[i] = 'in';
      left.set(n, k - 1);
    }
  });
  return marks;
}

export const solved = (marks: Mark[]): boolean => marks.length === NOTES && marks.every((m) => m === 'gold');

/**
 * The opening of a song: its first five single notes. A tune (a song of single notes) gives its own; a song of
 * chords gives the tune laid over it, where the app has one. Null when there is no tune, when it starts with
 * notes played together, or when its opening would not be fair to find: fewer than three different notes, or
 * a leap of more than an octave between two of them.
 */
export function openingOf(song: Song): FiveTune | null {
  let notes: { midi: number; len: number }[] = [];
  const m = songMaterial(song);
  const steps = m.lines.flatMap((l) => l.steps);
  if (steps.length && steps.every((s) => !s.chord)) {
    // a tune: its steps one after the other, each as long as the gap to the next
    const flat = m.lines.flatMap((l, k) => l.steps.map((s) => ({ s, at: m.lines.slice(0, k).reduce((u, x) => u + x.units, 0) + s.at })));
    for (let i = 0; i < flat.length && notes.length < NOTES; i++) {
      const s = flat[i].s;
      if (s.midis.length !== 1) return null;
      const next = flat[i + 1]?.at ?? flat[i].at + 1;
      notes.push({ midi: s.midis[0], len: Math.max(0.5, next - flat[i].at) * m.noteDur });
    }
  } else {
    const t = tuneOf(song);
    if (!t) return null;
    notes = t.melody
      .slice()
      .sort((a, b) => a.u - b.u)
      .slice(0, NOTES)
      .map((n) => ({ midi: n.midi, len: Math.max(0.5, n.len) * song.noteDur }));
  }
  if (notes.length < NOTES) return null;
  const midis = notes.map((n) => n.midi);
  if (new Set(midis.map(pitchClass)).size < 3) return null;
  for (let i = 1; i < midis.length; i++) if (Math.abs(midis[i] - midis[i - 1]) > 12) return null;
  // played to the player at the song's own pace, but no note shorter than a quarter of a second or longer than one and a half
  const lens = notes.map((n) => Math.max(0.25, Math.min(1.5, n.len)));
  return { id: song.id, title: song.title, midis, lens };
}

/** Every song in the list that has a fair opening, in the list's order. */
export function tunesOf(songs: Song[]): FiveTune[] {
  const seen = new Set<string>();
  const out: FiveTune[] = [];
  for (const s of songs) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const t = openingOf(s);
    // two songs that open alike would make two days alike
    if (t && !out.some((o) => o.midis.join() === t.midis.join())) out.push(t);
  }
  return out;
}

/** A number that looks random but is the same for the same day: a small integer hash. */
function mix(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Today's tune: the same all day, a different one tomorrow. The list is gone through in an order of its own
 * that looks random, so a song does not come back before every other one has had its day.
 */
export function tuneOfDay(tunes: FiveTune[], day: number): FiveTune | null {
  if (!tunes.length) return null;
  const n = tunes.length;
  const round = Math.floor(day / n);
  const order = tunes.map((_, i) => i).sort((a, b) => mix(a * 7919 + round) - mix(b * 7919 + round));
  return tunes[order[((day % n) + n) % n]];
}

/** What the player knows after their tries: notes known in place, notes known to be in it, notes known to be out. */
export function known(rows: { midis: number[]; marks: Mark[] }[]): { placed: (number | null)[]; inside: number[]; out: number[] } {
  const placed: (number | null)[] = Array.from({ length: NOTES }, () => null);
  const inside = new Set<number>();
  const out = new Set<number>();
  for (const r of rows)
    r.marks.forEach((mk, i) => {
      const n = pitchClass(r.midis[i]);
      if (mk === 'gold') placed[i] = n;
      else if (mk === 'in') inside.add(n);
    });
  for (const r of rows)
    r.marks.forEach((mk, i) => {
      const n = pitchClass(r.midis[i]);
      if (mk === 'no' && !placed.includes(n) && !inside.has(n)) out.add(n);
    });
  return { placed, inside: [...inside].filter((n) => !placed.includes(n)), out: [...out] };
}
