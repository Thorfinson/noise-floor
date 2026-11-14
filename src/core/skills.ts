/**
 * Measured skill. A level is only ever granted for something the microphone heard: a chord with all
 * strings clean, chord changes per minute, a finger pattern at a tempo, a bar of a song at a speed,
 * a scale on the piano with every key ringing.
 * Levels are never taken away. A skill that has not been confirmed for a week is marked rusty,
 * and rusty and low skills are sent more often in runs.
 */
import { DAY_MS, dayOf } from './days';
import { L } from './i18n';

export type SkillKind = 'chord' | 'pair' | 'finger' | 'bar' | 'scale' | 'beat' | 'pitch' | 'tone' | 'sing' | 'ear';

export interface SkillRecord {
  level: number;
  /** best value so far, in the unit of its kind */
  best: number;
  /** timestamp of the last confirmation, ms */
  last: number;
  /** how often the top threshold was reached (the last level asks for three) */
  tops: number;
  /** chords and scales: most strings (or keys, counted in sixths) clean in one check */
  strings?: number;
  /** on how many different days it was measured clean: one good day may be luck, three are not */
  days?: number;
  /** the first clean measurement of the last day it was measured: what the hands can do from cold [day, value] */
  cold?: [number, number];
  /** the best value of each day it was measured, oldest first [day, value]: the course over weeks */
  h?: [number, number][];
}

/** How many days of history a skill keeps. */
const HISTORY = 120;

export interface KindInfo {
  unit: string;
  /** values needed for levels 1 to 5 */
  steps: number[];
  /** true when a smaller value is better (seconds) */
  lowerIsBetter: boolean;
  describe: string;
}

/** The texts are read when they are shown, in the language shown. */
export const KINDS: Record<SkillKind, KindInfo> = {
  chord: { get unit() { return L('s for six clean strings', 's für sechs saubere Saiten'); }, steps: [600, 30, 15, 8, 5], lowerIsBetter: true, get describe() { return L('all strings clean (on the piano: every key, and the chord as a whole), then faster', 'alle Saiten sauber (auf dem Klavier: jede Taste und der Akkord als Ganzes), dann schneller'); } },
  pair: { get unit() { return L('clean changes a minute', 'saubere Wechsel pro Minute'); }, steps: [10, 20, 30, 45, 60], lowerIsBetter: false, get describe() { return L('clean changes a minute', 'saubere Wechsel pro Minute'); } },
  finger: { get unit() { return L('bpm clean', 'bpm sauber'); }, steps: [60, 80, 100, 120, 140], lowerIsBetter: false, get describe() { return L('clean tempo', 'sauberes Tempo'); } },
  bar: { get unit() { return L('% of full speed', '% des vollen Tempos'); }, steps: [50, 70, 85, 100, 100], lowerIsBetter: false, get describe() { return L('clean speed', 'sauberes Tempo'); } },
  scale: { get unit() { return L('s for a clean scale', 's für eine saubere Tonleiter'); }, steps: [600, 30, 16, 10, 7], lowerIsBetter: true, get describe() { return L('every key ringing, then faster', 'jede Taste klingt, dann schneller'); } },
  beat: { get unit() { return L('beats a minute kept', 'Schläge pro Minute gehalten'); }, steps: [50, 60, 72, 84, 100], lowerIsBetter: false, get describe() { return L('tempo at which the pulse was kept across the changes', 'Tempo, bei dem der Puls über die Wechsel hinweg gehalten wurde'); } },
  // singing: how far off the notes sung back were, and how much a held tone wavered, in cents
  pitch: { get unit() { return L('cents off on average', 'Cent daneben im Schnitt'); }, steps: [60, 40, 28, 18, 12], lowerIsBetter: true, get describe() { return L('notes sung back: nearly all found, then nearer', 'nachgesungene Töne: fast alle getroffen, dann genauer'); } },
  tone: { get unit() { return L('cents of wavering', 'Cent Schwankung'); }, steps: [40, 28, 20, 14, 9], lowerIsBetter: true, get describe() { return L('a tone held for five seconds, steadier', 'ein Ton fünf Sekunden gehalten, ruhiger'); } },
  // sung patterns in the game: how many notes a minute were found on pitch, one after the other
  sing: { get unit() { return L('notes a minute on pitch', 'Töne pro Minute getroffen'); }, steps: [30, 45, 60, 80, 100], lowerIsBetter: false, get describe() { return L('sung patterns: every note found, then more fluently', 'gesungene Muster: jeder Ton getroffen, dann flüssiger'); } },
  // by ear: of a round of motifs, chords or intervals, how many were found at the first try without help, in %
  ear: { get unit() { return L('% found by ear at the first try', '% nach Gehör beim ersten Versuch'); }, steps: [50, 65, 80, 90, 100], lowerIsBetter: false, get describe() { return L('heard, then played or sung back without looking: more of them at the first try', 'gehört, dann ohne Hinsehen nachgespielt oder nachgesungen: mehr davon beim ersten Versuch'); } },
};

export const RUST_AFTER_MS = 7 * 24 * 3600 * 1000;

/** Days until a skill measured clean on so many days is to be confirmed again. */
export const reviewGap = (days: number): number => [2, 2, 5, 12, 30, 60][Math.max(0, Math.min(5, days))];
export const kindOf = (key: string): SkillKind => key.slice(0, key.indexOf(':')) as SkillKind;

/** Level a single measurement is worth, 0 to 5 (the fifth bar level needs repeated proof, see record). */
export function levelFor(kind: SkillKind, value: number): number {
  const { steps, lowerIsBetter } = KINDS[kind];
  let level = 0;
  for (let i = 0; i < steps.length; i++) if (lowerIsBetter ? value <= steps[i] : value >= steps[i]) level = i + 1;
  return level;
}

export interface LevelChange {
  key: string;
  before: number;
  after: number;
}

export class Skills {
  constructor(public data: Record<string, SkillRecord> = {}) {}

  get(key: string): SkillRecord | undefined {
    return this.data[key];
  }

  level(key: string): number {
    return this.data[key]?.level ?? 0;
  }

  /**
   * Stores a clean measurement. Returns the level change, which is only ever upward.
   * For chords and scales, value is the time for all strings or keys clean; pass strings (out of six)
   * when not all were clean.
   */
  record(key: string, value: number, now: number, strings?: number): LevelChange {
    const kind = kindOf(key);
    const info = KINDS[kind];
    const rec = (this.data[key] ??= { level: 0, best: info.lowerIsBetter ? Infinity : 0, last: 0, tops: 0 });
    const before = rec.level;
    const checked = kind === 'chord' || kind === 'scale' || kind === 'pitch';
    if (checked && strings !== undefined && strings < 6) {
      rec.strings = Math.max(rec.strings ?? 0, strings);
      return { key, before, after: before };
    }
    if (checked) rec.strings = 6;
    const better = (a: number, b: number): number => (info.lowerIsBetter ? Math.min(a, b) : Math.max(a, b));
    rec.best = better(rec.best, value);
    // a new day on which it was measured clean (days in local time)
    const d = dayOf(now);
    if (!rec.last || dayOf(rec.last) !== d) rec.days = (rec.days ?? (rec.last ? 1 : 0)) + 1;
    // the first try of a day is the honest one: practice within a day flatters
    if (!rec.cold || rec.cold[0] !== d) rec.cold = [d, value];
    const h = (rec.h ??= []);
    const lastDay = h[h.length - 1];
    if (lastDay && lastDay[0] === d) lastDay[1] = better(lastDay[1], value);
    else h.push([d, value]);
    if (h.length > HISTORY) h.splice(0, h.length - HISTORY);
    rec.last = now;
    let level = levelFor(kind, value);
    if (kind === 'bar' && level === 5) {
      // full speed once is level 4; level 5 is full speed three times
      rec.tops++;
      if (rec.tops < 3) level = 4;
    }
    rec.level = Math.max(rec.level, level);
    return { key, before, after: rec.level };
  }

  /**
   * Is a skill due to be confirmed again? The more days it has been measured clean on, the longer it keeps:
   * after one day it comes back after two, then after five, twelve, thirty and sixty days. Spaced like this,
   * what is learned is kept far better than when it is played often within a few days and then left.
   */
  due(key: string, now: number): boolean {
    const rec = this.data[key];
    if (!rec || rec.level < 1 || !rec.last) return false;
    return now - rec.last >= reviewGap(rec.days ?? 1) * DAY_MS;
  }

  rusty(key: string, now: number): boolean {
    const rec = this.data[key];
    return !!rec && rec.level > 0 && now - rec.last > RUST_AFTER_MS;
  }

  /** Total of all levels: the headline number. */
  rank(): number {
    return Object.values(this.data).reduce((sum, r) => sum + r.level, 0);
  }

  /** How strongly a run should favour this item: low and rusty skills come more often. */
  weight(key: string, now: number): number {
    return 1 + (5 - this.level(key)) * 0.5 + (this.rusty(key, now) ? 1.5 : 0);
  }

  /** What the next level asks for, or null at the top. */
  next(key: string): { level: number; value: number } | null {
    const level = this.level(key);
    return level >= 5 ? null : { level: level + 1, value: KINDS[kindOf(key)].steps[level] };
  }
}
