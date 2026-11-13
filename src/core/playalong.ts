/**
 * Playing along with the click: every step has a moment it is due, and what the microphone hears is
 * matched against those moments. No drawing and no audio in here.
 */

export interface TakeStep {
  /** pitches that count for this step; empty for a strum */
  midis: number[];
  /** chord to strum, for a strum step */
  chord?: string;
  /** when it is due, seconds on the listener's clock */
  t: number;
  /** the bar or phrase it belongs to, for the result */
  bar: number;
}

export type StepState = 'wait' | 'hit' | 'miss';

export interface TakeResult {
  hits: number;
  total: number;
  /** notes that belonged nowhere */
  strays: number;
  /** middle of how far off the hits were, seconds; positive = late */
  offset: number;
  /** bars in which every step was hit and nothing else was played */
  cleanBars: number[];
  bars: number[];
}

const median = (v: number[]): number => {
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Speeds a piece is rehearsed at, in percent of full speed. */
export const TEMPOS = [40, 50, 60, 70, 85, 100];

/** The rehearsal speed after a take: up a step after a clean one, down after one that fell apart. */
export function nextTempo(tempo: number, r: TakeResult): number {
  const i = Math.max(0, TEMPOS.indexOf(tempo));
  if (r.hits === r.total && r.strays === 0) return TEMPOS[Math.min(TEMPOS.length - 1, i + 1)];
  if (r.hits < 0.6 * r.total) return TEMPOS[Math.max(0, i - 1)];
  return tempo;
}

export class Take {
  readonly steps: TakeStep[];
  /** how far from its moment a step still counts, seconds */
  readonly window: number[];
  readonly state: StepState[];
  /** seconds off for each hit; positive = late */
  readonly offsets: (number | null)[];
  strays = 0;
  /** goes up whenever a state changes, so a view knows when to redraw */
  version = 0;
  private readonly spoiled = new Set<number>();

  constructor(steps: TakeStep[]) {
    this.steps = steps;
    this.state = steps.map(() => 'wait');
    this.offsets = steps.map(() => null);
    // nearly half the way to the neighbouring step, so that every note belongs to exactly one step,
    // but never tighter than a tenth of a second and never looser than a fifth
    this.window = steps.map((s, i) => {
      const before = i > 0 ? s.t - steps[i - 1].t : Infinity;
      const after = i < steps.length - 1 ? steps[i + 1].t - s.t : Infinity;
      const gap = Math.min(before > 0 ? before : Infinity, after > 0 ? after : Infinity);
      return Math.max(0.1, Math.min(0.2, 0.45 * gap));
    });
  }

  private match(t: number, fits: (s: TakeStep) => boolean): number | null {
    let best = -1;
    let off = Infinity;
    this.steps.forEach((s, i) => {
      const d = Math.abs(t - s.t);
      if (this.state[i] === 'wait' && d <= this.window[i] && d < off && fits(s)) {
        best = i;
        off = d;
      }
    });
    if (best < 0) {
      this.stray(t);
      return null;
    }
    this.state[best] = 'hit';
    this.offsets[best] = t - this.steps[best].t;
    this.version++;
    return best;
  }

  private stray(t: number): void {
    const first = this.steps[0];
    const last = this.steps[this.steps.length - 1];
    // what is played before the first step or after the last belongs to the count-in or the ending
    if (!first || t < first.t - this.window[0] || t > last.t + this.window[this.steps.length - 1]) return;
    this.strays++;
    const near = this.steps.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    this.spoiled.add(near.bar);
    this.version++;
  }

  /** A note was heard at time t. Returns the step it hit, or null. */
  note(midi: number, t: number): number | null {
    return this.match(t, (s) => s.midis.includes(midi));
  }

  /** A strummed chord was heard at time t. Returns the step it hit, or null. */
  chord(id: string, t: number): number | null {
    return this.match(t, (s) => s.chord === id);
  }

  /** The step whose moment is nearest to t, whatever its state. */
  nearest(t: number): TakeStep | undefined {
    let best: TakeStep | undefined;
    for (const s of this.steps) if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
    return best;
  }

  /** The open step a sound at time t would count for, if there is one. */
  wanted(t: number): TakeStep | undefined {
    let best: TakeStep | undefined;
    this.steps.forEach((s, i) => {
      if (this.state[i] === 'wait' && Math.abs(t - s.t) <= this.window[i] && (!best || Math.abs(s.t - t) < Math.abs(best.t - t))) best = s;
    });
    return best;
  }

  /**
   * Time has moved on: steps whose moment has passed unplayed are missed. Returns true when all are decided.
   * Pass a time a little in the past: a note is only reported a moment after it was played.
   */
  advance(now: number): boolean {
    let open = false;
    this.steps.forEach((s, i) => {
      if (this.state[i] !== 'wait') return;
      if (now > s.t + this.window[i]) {
        this.state[i] = 'miss';
        this.version++;
      } else open = true;
    });
    return !open;
  }

  /** The step to play now: the one nearest to its moment among those still open, or -1. */
  due(now: number): number {
    let best = -1;
    let off = Infinity;
    this.steps.forEach((s, i) => {
      const d = Math.abs(now - s.t);
      if (this.state[i] === 'wait' && d < off) {
        best = i;
        off = d;
      }
    });
    return best;
  }

  /** Steps whose moment is close: what the listener should give the benefit of the doubt. */
  near(now: number): TakeStep[] {
    return this.steps.filter((s, i) => this.state[i] === 'wait' && Math.abs(now - s.t) <= 2 * this.window[i]);
  }

  result(): TakeResult {
    const bars = [...new Set(this.steps.map((s) => s.bar))];
    const cleanBars = bars.filter((b) => !this.spoiled.has(b) && this.steps.every((s, i) => s.bar !== b || this.state[i] === 'hit'));
    return {
      hits: this.state.filter((s) => s === 'hit').length,
      total: this.steps.length,
      strays: this.strays,
      offset: median(this.offsets.filter((o): o is number => o !== null)),
      cleanBars,
      bars,
    };
  }
}
