/**
 * Stepping Stones: the rules of the rhythm game, with no drawing or audio in them. A walk is a row of
 * stones, one for every strum, laid out in time; the chord changes from bar to bar. A strum counts when
 * it falls on a stone: within a window around the stone's moment. What is measured is whether the pulse
 * was kept across the chord changes, and how early or late the strums were.
 */
import { L } from '../core/i18n';

export interface Pattern {
  id: string;
  name: string;
  /** the beats of a bar of four on which a strum falls; halves are the "and" between two beats */
  beats: number[];
  /** how it is counted, one mark per half beat spoken */
  count: string;
  about: string;
  /** the same, said for the piano */
  aboutKeys: string;
}

/** Easiest first: every beat, then fewer strums (the rest has to be felt), then a quick pair. */
// the texts are getters: they are read when they are shown, in the language of that moment
export const PATTERNS: Pattern[] = [
  { id: 'four', get name() { return L('Every beat', 'Jeder Schlag'); }, beats: [0, 1, 2, 3], count: '1 2 3 4', get about() { return L('One strum on each beat. The change of chord has to fit between two of them.', 'Ein Anschlag auf jeden Schlag. Der Akkordwechsel muss zwischen zwei davon passen.'); }, get aboutKeys() { return L('The chord on each beat. The hand has to be on the next chord between two of them.', 'Der Akkord auf jeden Schlag. Zwischen zwei davon muss die Hand auf dem nächsten Akkord sein.'); } },
  { id: 'half', get name() { return L('One and three', 'Eins und drei'); }, beats: [0, 2], count: '1 · 3 ·', get about() { return L('Two strums a bar. More time for the change, and a beat of silence to feel.', 'Zwei Anschläge pro Takt. Mehr Zeit für den Wechsel, und ein stiller Schlag zum Fühlen.'); }, get aboutKeys() { return L('The chord twice a bar. More time for the move, and a beat of silence to feel.', 'Der Akkord zweimal pro Takt. Mehr Zeit, die Hand umzusetzen, und ein stiller Schlag zum Fühlen.'); } },
  { id: 'rest', get name() { return L('Rest on two', 'Pause auf zwei'); }, beats: [0, 2, 3], count: '1 · 3 4', get about() { return L('Leave the second beat empty and come back in on three.', 'Lass den zweiten Schlag leer und steig auf drei wieder ein.'); }, get aboutKeys() { return L('Leave the second beat empty and come back in on three.', 'Lass den zweiten Schlag leer und steig auf drei wieder ein.'); } },
  { id: 'push', get name() { return L('A quick pair on three', 'Ein schnelles Paar auf drei'); }, beats: [0, 1, 2, 2.5, 3], count: '1 2 3 + 4', get about() { return L('Two quick strums on the third beat: down and again at once.', 'Zwei schnelle Anschläge auf dem dritten Schlag: ab und gleich noch einmal.'); }, get aboutKeys() { return L('The chord twice in quick succession on the third beat: let the hand bounce.', 'Der Akkord zweimal schnell hintereinander auf dem dritten Schlag: Lass die Hand federn.'); } },
];

/**
 * The listener names a strum about a fifth of a second after it was played: it needs that much of the
 * sound. A stone is given up only when the report of a strum that fell on it can no longer come.
 */
export const HEARD_AFTER = 0.36;

export interface Stone {
  /** when, in beats from the start of the walk */
  at: number;
  chord: string;
  bar: number;
  /** the first stone of a bar whose chord differs from the bar before */
  change: boolean;
}

/** Stones for so many bars: the two chords take turns, one bar each, so that every bar line is a change. */
export function makeWalk(pattern: Pattern, chords: [string, string], bars = 8): Stone[] {
  const out: Stone[] = [];
  for (let b = 0; b < bars; b++) pattern.beats.forEach((beat, i) => out.push({ at: b * 4 + beat, chord: chords[b % 2], bar: b, change: i === 0 && b > 0 }));
  return out;
}

export type Step = { state: 'ahead' } | { state: 'hit'; offset: number; wrong: boolean } | { state: 'missed' };

export interface WalkResult {
  total: number;
  hits: number;
  /** in time, but still the chord of the bar before */
  wrong: number;
  /** strums that fell on no stone */
  stray: number;
  /** mean of the offsets in seconds: negative is early */
  lean: number;
  /** mean distance from the stone's moment, seconds */
  spread: number;
  /** the walk counts for the level: nine of ten stones in time, hardly a wrong chord */
  kept: boolean;
}

export class Walk {
  readonly steps: Step[];
  stray = 0;
  /** seconds per beat */
  readonly beat: number;
  /** how far from a stone's moment a strum still counts, seconds */
  readonly window: number;

  constructor(
    readonly stones: Stone[],
    readonly bpm: number,
    /** the moment of beat 0, on the clock strum times are given in */
    readonly t0: number,
  ) {
    this.beat = 60 / bpm;
    // a sixth of a second at most, and never so wide that two stones overlap
    this.window = Math.min(0.16, 0.42 * this.beat * Math.min(1, ...stones.slice(1).map((s, i) => s.at - stones[i].at)));
    this.steps = stones.map(() => ({ state: 'ahead' }));
  }

  due(i: number): number {
    return this.t0 + this.stones[i].at * this.beat;
  }

  /** The length of the walk, in seconds from beat 0 to the end of the last bar. */
  get length(): number {
    return (this.stones[this.stones.length - 1].bar + 1) * 4 * this.beat;
  }

  /**
   * A strum was heard at this time. chord is what it was, or null when that could not be told (the timing
   * still counts). Returns the stone it fell on, or -1.
   */
  strum(time: number, chord: string | null): number {
    let best = -1;
    for (let i = 0; i < this.stones.length; i++) {
      if (this.steps[i].state !== 'ahead') continue;
      const d = Math.abs(time - this.due(i));
      if (d <= this.window && (best < 0 || d < Math.abs(time - this.due(best)))) best = i;
    }
    if (best < 0) {
      this.stray++;
      return -1;
    }
    this.steps[best] = { state: 'hit', offset: time - this.due(best), wrong: chord !== null && chord !== this.stones[best].chord };
    return best;
  }

  /**
   * Time has passed: stones whose moment is over without a strum are missed. Returns the ones newly missed.
   * A stone is missed only once a strum on it would have been reported: see HEARD_AFTER.
   */
  advance(now: number): number[] {
    const out: number[] = [];
    this.steps.forEach((s, i) => {
      if (s.state === 'ahead' && now > this.due(i) + this.window + HEARD_AFTER) {
        this.steps[i] = { state: 'missed' };
        out.push(i);
      }
    });
    return out;
  }

  /** The stone that comes next at this time (the first whose window is not over), or -1 at the end. */
  next(now: number): number {
    return this.stones.findIndex((_, i) => now <= this.due(i) + this.window);
  }

  result(): WalkResult {
    const hit = this.steps.filter((s): s is Extract<Step, { state: 'hit' }> => s.state === 'hit');
    const total = this.stones.length;
    const wrong = hit.filter((s) => s.wrong).length;
    const lean = hit.length ? hit.reduce((a, s) => a + s.offset, 0) / hit.length : 0;
    const spread = hit.length ? hit.reduce((a, s) => a + Math.abs(s.offset), 0) / hit.length : 0;
    return { total, hits: hit.length, wrong, stray: this.stray, lean, spread, kept: hit.length >= 0.9 * total && wrong <= 0.1 * total };
  }
}

/** The tempi a walk is tried at, slowest first. */
export const WALK_TEMPI = [50, 60, 72, 84, 100, 112];
