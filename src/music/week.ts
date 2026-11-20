/**
 * The song of the week. The player picks one song for the week, and everything the session practises serves
 * it: its new chords, its hardest change, its strumming pattern, then the song itself, a part at a time.
 *
 * Its way through the week (the "arc") follows its parts. Each part is first learned line by line without a
 * clock, then played in time with the band; then comes the whole song from start to end, and once that is
 * clean it is recorded and joins the repertoire (the shelf). A song without named parts is split in two
 * halves, so that there is still a first goal close by.
 *
 * Why a week and a song of one's own: a near goal that is one's own carries better than a route made from
 * gaps in a skill model, and each exercise gets a reason ("because the chorus changes from C to G").
 */
import { dayOf } from '../core/days';
import { L } from '../core/i18n';
import { store, type Instrument } from '../core/store';
import { allPieces, allSongs, findPiece, findSong, wholeSong, type Song } from './content';
import { pieceMaterial, songMaterial, type Material } from './material';
import { reviewKey } from './review';

/** Where one part of the song stands: its lines, how many are learned without a clock and how many sit in time. */
export interface PartState {
  /** the name the song gives it ("Verse"), or a made-up one for a song without parts */
  name: string;
  /** how the player reads it: "Strophe", "Refrain", "Erste Hälfte" */
  label: string;
  /** indexes into the material's lines */
  lines: number[];
  learned: number;
  clicked: number;
}

/** What comes next on the way: a line to learn or to play in time, the whole song, or nothing (it is on the shelf). */
export type Next = { kind: 'learn' | 'click'; line: number; part: number } | { kind: 'whole' } | { kind: 'done' };

export interface Arc {
  inst: Instrument;
  id: string;
  title: string;
  parts: PartState[];
  /** played clean from start to end at full speed: in the repertoire */
  whole: boolean;
  next: Next;
  /** the day of the week it is on, counted from 1 */
  day: number;
}

/** The instruments the week is for: the guitar's songs and the piano's pieces have lines and parts to go through. */
export const hasWeek = (inst: Instrument): boolean => inst === 'guitar' || inst === 'piano';

/** A part's name as the player reads it. */
export function partLabel(name: string): string {
  const n = name.toLowerCase().replace(/\s*\d+$/, '');
  const num = /\d+$/.exec(name)?.[0];
  const base: Record<string, () => string> = {
    verse: () => L('Verse', 'Strophe'),
    chorus: () => L('Chorus', 'Refrain'),
    bridge: () => L('Bridge', 'Bridge'),
    intro: () => L('Intro', 'Intro'),
    outro: () => L('Outro', 'Outro'),
    interlude: () => L('Interlude', 'Zwischenspiel'),
    'pre-chorus': () => L('Pre-chorus', 'Pre-Chorus'),
    prechorus: () => L('Pre-chorus', 'Pre-Chorus'),
    all: () => L('The song', 'Der Song'),
    a: () => L('Part A', 'Teil A'),
    b: () => L('Part B', 'Teil B'),
  };
  const word = base[n]?.() ?? name;
  return num && base[n] ? `${word} ${num}` : word;
}

/** The material of a song or piece by its id on an instrument. */
export function materialOf(inst: Instrument, id: string): Material | null {
  if (inst === 'guitar') return allSongs().some((s) => s.id === id) ? songMaterial(findSong(id)) : null;
  if (inst === 'piano') return allPieces().some((p) => p.id === id) ? pieceMaterial(findPiece(id)) : null;
  return null;
}

/** The week on an instrument, if one was chosen and its song is still there. */
export function weekOf(inst: Instrument): { id: string; start: number } | null {
  const w = store.weeks[inst];
  if (!w || !materialOf(inst, w.id)) return null;
  return w;
}

/** Makes a song the song of the week, from today. It also becomes the song the rest of the app works on. */
export function chooseWeek(inst: Instrument, id: string, now = Date.now()): void {
  store.weeks[inst] = { id, start: dayOf(now) };
  store.current[inst] = id;
  store.save();
}

/** The day of the week the song is on, counted from 1 (the day it was chosen). */
export function weekDay(inst: Instrument, now = Date.now()): number {
  const w = weekOf(inst);
  return w ? Math.max(1, dayOf(now) - w.start + 1) : 0;
}

/**
 * The parts of the material, each with its lines. A line belongs to the part its first bar is in. A song
 * without parts, or with one part of four lines or more, is split into two halves.
 */
export function partsOfMaterial(m: Material): { name: string; lines: number[] }[] {
  const out: { name: string; lines: number[] }[] = [];
  m.lines.forEach((l, k) => {
    const name = m.partOf(l.bars[0] ?? 0) ?? '';
    const last = out[out.length - 1];
    // the same name again later (a second verse written out) is a part of its own on the way
    if (last && last.name === name) last.lines.push(k);
    else out.push({ name, lines: [k] });
  });
  const named = out.filter((p) => p.name && p.name.toLowerCase() !== 'all');
  if (named.length >= 2) return out.map((p) => ({ name: p.name || 'Intro', lines: p.lines }));
  const n = m.lines.length;
  if (n < 4) return [{ name: 'All', lines: m.lines.map((_, k) => k) }];
  const half = Math.ceil(n / 2);
  return [
    { name: '1', lines: m.lines.map((_, k) => k).slice(0, half) },
    { name: '2', lines: m.lines.map((_, k) => k).slice(half) },
  ];
}

/** The label of a made-up half, or of a named part. */
const labelOf = (name: string): string => (name === '1' ? L('First half', 'Erste Hälfte') : name === '2' ? L('Second half', 'Zweite Hälfte') : partLabel(name));

/** Where the song of the week stands, and what comes next. Null when no week is chosen. */
export function arcOf(inst: Instrument, id = weekOf(inst)?.id, now = Date.now()): Arc | null {
  if (!id) return null;
  const m = materialOf(inst, id);
  if (!m) return null;
  // a line is learned when every bar of it is at level 1 (clean without a clock), and sits in time at level 4
  // (clean with the click at full speed), as the lesson's own path strip counts them
  const lineLevel = (k: number): number => Math.min(...[...new Set(m.lines[k].bars.map(m.skill))].map((key) => store.skills.level(key)));
  const parts: PartState[] = partsOfMaterial(m).map((p) => ({
    name: p.name,
    label: labelOf(p.name),
    lines: p.lines,
    learned: p.lines.filter((k) => lineLevel(k) >= 1).length,
    clicked: p.lines.filter((k) => lineLevel(k) >= 4).length,
  }));
  const whole = !!store.reviews[reviewKey(inst, id)];
  let next: Next = whole ? { kind: 'done' } : { kind: 'whole' };
  // part by part: learn it, then play it in time; then the next part
  for (let i = 0; i < parts.length && !whole; i++) {
    const p = parts[i];
    const unlearned = p.lines.find((k) => lineLevel(k) < 1);
    if (unlearned !== undefined) {
      next = { kind: 'learn', line: unlearned, part: i };
      break;
    }
    const loose = p.lines.find((k) => lineLevel(k) < 4);
    if (loose !== undefined) {
      next = { kind: 'click', line: loose, part: i };
      break;
    }
  }
  return { inst, id, title: m.title, parts, whole, next, day: weekOf(inst)?.id === id ? weekDay(inst, now) : 0 };
}

/** The part a step of the arc works on, as the player reads it: "den Refrain" is said by the caller. */
export function nextLabel(a: Arc): string {
  const n = a.next;
  if (n.kind === 'learn') return L(`${a.parts[n.part].label}: line by line`, `${a.parts[n.part].label}: Zeile für Zeile`);
  if (n.kind === 'click') return L(`${a.parts[n.part].label}: in time, with the band`, `${a.parts[n.part].label}: im Takt, mit Band`);
  if (n.kind === 'whole') return L('The whole song, with the band', 'Der ganze Song, mit Band');
  return L('On the shelf', 'Im Regal');
}

/** Is a new week to be chosen: none yet, its song gone, or the song is on the shelf. */
export function needsChoice(inst: Instrument): boolean {
  if (!hasWeek(inst)) return false;
  const a = arcOf(inst);
  return !a || a.whole;
}

/** How long the whole song lasts at full speed, in seconds: its form with every repetition. */
export function songSeconds(song: Song): number {
  return wholeSong(song).reduce((t, fb) => t + fb.bar.notes.reduce((u, n) => u + (n.len ?? 1), 0), 0) * song.noteDur;
}

/** The lines of a part as the lesson counts them (from 1), for its address: "#/song/<id>/1/3". */
export const lineParam = (line: number): string => String(line + 1);
