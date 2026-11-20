/**
 * "Tonight's night": one run a day at the lighthouse, the same all day. Its order of pieces and its one rule
 * come from the date, so a retry meets the same tide; the next day brings another. About four minutes:
 * three waves on the groove and a short Mute. Only the player's own nights are compared: the best of today,
 * and a few lines of the nights before. No streak to lose: a missed day costs nothing.
 *
 * No drawing, audio or storage in here: the log is read from and written to the progress numbers it is given.
 */
import { L } from '../core/i18n';
import type { RuleId } from './groove';

export const NIGHT_WAVES = 3;
export const NIGHT_BARS = 16;

export interface NightRule {
  id: RuleId;
  name: string;
  text: string;
}

// fair rules only: each changes the night, none hides a chord or asks for more than the player has
export const NIGHT_RULES: NightRule[] = [
  { id: 'calm', get name() { return L('Calm sea', 'Ruhige See'); }, get text() { return L('The pieces drift at half speed.', 'Die Teile treiben halb so schnell.'); } },
  { id: 'mixed', get name() { return L('Mixed waters', 'Wechselbad'); }, get text() { return L('Every second piece wears a chord from outside the song.', 'Jedes zweite Teil trägt einen Akkord von außerhalb des Songs.'); } },
  { id: 'pairs', get name() { return L('Two beams', 'Zwei Strahlen'); }, get text() { return L('The pieces come in pairs.', 'Die Teile kommen paarweise.'); } },
  { id: 'spring', get name() { return L('Spring tide', 'Springflut'); }, get text() { return L('Faster pieces, and a fourth light in the lamp.', 'Schnellere Teile, und ein viertes Licht in der Lampe.'); } },
  { id: 'full', get name() { return L('Full band', 'Volle Kapelle'); }, get text() { return L('The whole band from the start; a miss costs two layers.', 'Die ganze Band von Anfang an; ein Fehler kostet zwei Schichten.'); } },
];

/** A whole number from a day that looks random and is the same every time. */
export function nightSeed(day: number): number {
  let t = Math.imul(day | 0, 2654435761) ^ 0x5bd1e995;
  t = Math.imul(t ^ (t >>> 15), 2246822507);
  t = Math.imul(t ^ (t >>> 13), 3266489909);
  return (t ^ (t >>> 16)) >>> 0;
}

/** Random-looking numbers from a seed, the same for the same seed (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The rule of a night: drawn from the date among the rules that can be played (the mixed night needs chords
 * from outside the song), and not yesterday's again.
 */
export function nightRule(day: number, playable: (id: RuleId) => boolean = () => true): NightRule {
  const fair = NIGHT_RULES.filter((r) => playable(r.id));
  const rules = fair.length ? fair : NIGHT_RULES.filter((r) => r.id !== 'mixed');
  const raw = (d: number): number => nightSeed(d) % rules.length;
  let i = raw(day);
  if (rules.length > 1 && i === raw(day - 1)) i = (i + 1) % rules.length;
  return rules[i];
}

/** The date of a night as the language writes it: November 20, 20. November. Days are local days. */
export function nightDate(day: number, lang: 'en' | 'de'): string {
  const d = new Date(day * 86400000);
  return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** What is kept of a night: the best score, how many tries, how far the band came (0 to 3) and whether the light held. */
export interface NightEntry {
  day: number;
  best: number;
  tries: number;
  level: number;
  held: boolean;
}

const KEY = (day: number, what: 'best' | 'tries' | 'level' | 'held'): string => `night:${day}:${what}`;
/** How many nights the log keeps. */
const KEEP = 30;

/** A night was played: its try is counted, and its best kept. Older nights than the log keeps are let go. */
export function noteNight(progress: Record<string, number>, day: number, r: { score: number; level: number; held: boolean }): { best: boolean } {
  const best = r.score > (progress[KEY(day, 'best')] ?? -1);
  progress[KEY(day, 'tries')] = (progress[KEY(day, 'tries')] ?? 0) + 1;
  if (best) progress[KEY(day, 'best')] = r.score;
  progress[KEY(day, 'level')] = Math.max(progress[KEY(day, 'level')] ?? 0, r.level);
  if (r.held) progress[KEY(day, 'held')] = 1;
  for (const k of Object.keys(progress)) {
    const m = /^night:(\d+):/.exec(k);
    if (m && Number(m[1]) <= day - KEEP) delete progress[k];
  }
  return { best };
}

/** The nights played, newest first: today's included if it was played. */
export function nightLog(progress: Record<string, number>, upTo: number, n = 7): NightEntry[] {
  const days = new Set<number>();
  for (const k of Object.keys(progress)) {
    const m = /^night:(\d+):tries$/.exec(k);
    if (m && Number(m[1]) <= upTo) days.add(Number(m[1]));
  }
  return [...days]
    .sort((a, b) => b - a)
    .slice(0, n)
    .map((day) => ({ day, best: progress[KEY(day, 'best')] ?? 0, tries: progress[KEY(day, 'tries')] ?? 0, level: progress[KEY(day, 'level')] ?? 0, held: progress[KEY(day, 'held')] === 1 }));
}
