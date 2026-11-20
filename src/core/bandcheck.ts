/**
 * The speaker test, the hearing check's step "Band through speakers", without a screen: the band arranged for
 * speakers plays while the player keeps still. In its first seconds the listener learns how strongly the
 * speakers reach the microphone and how late (the soundcheck, Listener.learnEcho); after that, everything it
 * reports is a phantom: the band taken for playing. Then, if the player likes, a stretch of strumming along, to
 * see that a strum is still heard with the band over it. At the end one verdict: safe, not safe, or the
 * microphone did not hear the band at all (headphones, or the speakers silent).
 *
 * Like the hearing check it is driven by the listener's events and their times, so the same test runs live and
 * in the tests over a signal made of the band and a room.
 */
import { renderBand, type BandParts } from '../audio/band';
import { HEARD_FIT } from '../audio/echo';
import type { ChordEvent, Listener, NoteEvent, OnsetEvent } from '../audio/listener';

export { HEARD_FIT };

/** The test's song: four chords, a bar each, round and round. */
export const TEST_CHORDS = ['G', 'Em', 'C', 'D'];
export const TEST_BPM = 90;
/** seconds from the band's start: the soundcheck, the end of keeping still, the end of strumming along */
export const LEARN_END = 4;
export const QUIET_END = 20;
export const PLAY_END = 42;
/** the strumming along begins a moment after the keeping still ends: time to put the hand on the strings */
const PLAY_FROM = QUIET_END + 2;

const BEAT = 60 / TEST_BPM;
const BAR = 4 * BEAT;

/** The test's band, arranged for speakers around a strum on every beat, made to go round. */
export function testBand(sr: number, a4: number): BandParts {
  const chords = TEST_CHORDS.map((id, b) => ({ u: b * 8, id }));
  const clicks = Array.from({ length: 16 }, (_, k) => ({ u: 2 * k, accent: k % 4 === 0 }));
  return renderBand({ chords, clicks, units: 32, unit: BEAT / 2, sr, a4, mode: 'speakers', feel: 'beat', loop: true, seed: 3 });
}

/** The chord the band is on, so many seconds after its start. */
export const testChordAt = (t: number): string => TEST_CHORDS[((Math.floor(t / BAR) % 4) + 4) % 4];

export type Phase = 'learn' | 'quiet' | 'play' | 'done';
export type Verdict = 'safe' | 'unsafe' | 'unheard';

export interface Learned {
  coupling: number[];
  late: number;
  fit: number;
}

export class BandCheck {
  phase: Phase = 'learn';
  /** what the listener reported while the player kept still: all of it the band, taken for playing */
  readonly phantoms = { onsets: 0, notes: 0, chords: 0 };
  /** strums along that were named (as the lessons take a chord), and named right */
  strums = 0;
  right = 0;
  learned: Learned | null = null;
  /** the player said he would not strum along */
  private skipped = false;

  constructor(
    private readonly l: Listener,
    /** the moment on the listener's clock at which the band begins to arrive at the microphone */
    readonly start: number,
    /** called whenever the phase changes */
    private readonly changed: () => void = () => undefined,
  ) {
    l.learnEcho();
  }

  /** Seconds since the band began. */
  private since(t: number): number {
    return t - this.start;
  }

  /**
   * The listener's time moved on. Each phase ends a little after its time, as the listener reports what happened
   * about 0.2 s after it happened: what came just before the end must still be counted.
   */
  tick(time: number): void {
    const t = this.since(time);
    if (this.phase === 'learn' && t >= LEARN_END) {
      const found = this.l.learnedEcho();
      this.learned = found && { coupling: found.coupling, late: found.late, fit: found.fit };
      this.go('quiet');
    } else if (this.phase === 'quiet' && t >= QUIET_END + 0.3) this.go(this.skipped || !this.heard ? 'done' : 'play');
    else if (this.phase === 'play' && t >= PLAY_END + 0.3) this.go('done');
  }

  /** No strumming along: the verdict comes from keeping still alone. */
  skip(): void {
    this.skipped = true;
    if (this.phase === 'play') this.go('done');
  }

  private go(p: Phase): void {
    this.phase = p;
    this.changed();
  }

  /** while the player keeps still, after the soundcheck */
  private quiet(time: number): boolean {
    const t = this.since(time);
    return this.phase !== 'learn' && t >= LEARN_END && t < QUIET_END;
  }

  onset(e: OnsetEvent): void {
    if (this.quiet(e.time)) this.phantoms.onsets++;
  }

  note(e: NoteEvent): void {
    if (this.quiet(e.time)) this.phantoms.notes++;
  }

  chord(e: ChordEvent): void {
    // as the lessons take a chord
    if (!e.best || e.score <= 0.6 || e.margin <= 0.08) return;
    if (this.quiet(e.time)) this.phantoms.chords++;
    const t = this.since(e.time);
    if (this.phase === 'play' || this.phase === 'done') {
      if (t < PLAY_FROM || t >= PLAY_END) return;
      this.strums++;
      // a strum a moment early for the next bar is that bar's
      if (e.best === testChordAt(t) || e.best === testChordAt(t + 0.25)) this.right++;
    }
  }

  /** Did the microphone hear the band at all? */
  get heard(): boolean {
    return !!this.learned && this.learned.fit >= HEARD_FIT;
  }

  /**
   * Safe: while the player kept still the listener took nothing for a note or a chord, and at most one moment for
   * a strum (the target of the review: no more than one phantom in two minutes); and, if he strummed along, most
   * strums were named right. Unheard: the microphone did not follow the band at all.
   */
  verdict(): Verdict {
    if (!this.heard) return 'unheard';
    const p = this.phantoms;
    if (p.notes + p.chords > 0 || p.onsets > 1) return 'unsafe';
    if (this.strums >= 6 && this.right / this.strums < 0.6) return 'unsafe';
    return 'safe';
  }
}
