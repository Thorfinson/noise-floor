/**
 * Freestyle: a solo scored like a skate run. The band plays a groove, nothing is asked for, and whatever the
 * player does is named as a trick the moment it is heard. Different tricks in one line multiply; a line stays
 * alive while its notes fall on the beat; ending it on the root and resting two beats banks it; losing the beat
 * loses it with everything in it.
 *
 * Only the rules are here: what counts as which trick, what it is worth, when a line lands or is lost. The
 * screen (screens/freestyle.ts) hears the guitar, plays the band and paints the sky. No browser is needed, so
 * the rules are tested as they are.
 *
 * Why these rules: nothing is prescribed, so a slow hand is no handicap and there is no wrong note to be caught
 * on; the pressure is the player's own greed (one more trick, or land it now?). Landing on the root and leaving
 * space is what teachers ask of a beginner's solo anyway, made into the rule that pays.
 */

import type { ChordEvent, NoteEvent } from '../audio/listener';

/** A note of the box: its pitch, the string it lies on (0 is the low E string) and the fret. */
export interface Place {
  m: number;
  s: number;
  f: number;
}

/** A place to play: a groove, a scale in one position of the neck, and what to reach there. */
export interface Spot {
  id: string;
  /** beats a minute */
  bpm: number;
  /** the pitch class a line lands on (E is 4) */
  root: number;
  /** the pitch classes of the scale */
  scale: number[];
  /** where each note of the scale lies in this position, low to high */
  box: Place[];
  /** the band's chords, one to a bar, round and round */
  chords: string[];
  /** the strumming feel of the band (music/strums.ts), or none for straight */
  feel?: string;
  /** the hour of the painted coast (ui/watch.ts) */
  hour: number;
  /** points to reach in one run, and different tricks to land in one line */
  goalScore: number;
  goalTricks: number;
}

const OPEN = [40, 45, 50, 55, 59, 64];
const place = (s: number, f: number): Place => ({ m: OPEN[s] + f, s, f });

/**
 * The spots. Both use the open position of E minor pentatonic (E G A B D): all six open strings are in it, so
 * every open string is a right note and the first run needs no left hand at all. The second spot takes the same
 * twelve notes as G major pentatonic: a brighter, quicker groove, and a line lands on G. Both are played at night:
 * the lines are drawn in light, and light needs a dark sky.
 */
const OPEN_BOX: Place[] = [place(0, 0), place(0, 3), place(1, 0), place(1, 2), place(2, 0), place(2, 2), place(3, 0), place(3, 2), place(4, 0), place(4, 3), place(5, 0), place(5, 3)];
export const SPOTS: Spot[] = [
  { id: 'night', bpm: 84, root: 4, scale: [2, 4, 7, 9, 11], box: OPEN_BOX, chords: ['Em', 'Em', 'G', 'D'], hour: 5, goalScore: 5000, goalTricks: 4 },
  { id: 'harbour', bpm: 92, root: 7, scale: [2, 4, 7, 9, 11], box: OPEN_BOX, chords: ['G', 'G', 'C', 'D'], hour: 3, goalScore: 8000, goalTricks: 5 },
];
export const spotOf = (id: string | undefined): Spot => SPOTS.find((s) => s.id === id) ?? SPOTS[0];

export type Trick = 'arpeggio' | 'run' | 'skip' | 'octave' | 'stutter' | 'double' | 'push' | 'span' | 'chk' | 'stab' | 'hammer' | 'pull';

/**
 * What a trick is worth the first time in a run. Every one of them is something the listener can tell from
 * which note was played and when, from a hit on muted strings, or from a strummed chord. A hammer-on and a
 * pull-off are told by their speed alone (see QUICK): the listener cannot yet tell a hammered note from a
 * plucked one.
 */
export const TRICK_POINTS: Record<Trick, number> = { arpeggio: 60, run: 80, skip: 40, octave: 70, stutter: 30, double: 60, push: 40, span: 150, chk: 20, stab: 50, hammer: 60, pull: 60 };
export const TRICKS = Object.keys(TRICK_POINTS) as Trick[];
/** a plain note of the scale */
export const NOTE_POINTS = 10;
/** A trick done again in the same run is worth this much less each time, down to FLOOR of its worth: variety pays. */
export const STALE = 0.15;
export const FLOOR = 0.4;
/** A run, in seconds. */
export const RUN_SECONDS = 90;
/** A line is over when nothing has been played for this many beats. */
export const REST_BEATS = 2;
/**
 * The listener reports a note about a fifth of a second after it sounded, and a hit on muted strings only once
 * the strings have stayed silent, about 0.3 s after it. Nothing is decided about a rest before what fell inside
 * it could have been reported.
 */
export const REPORT = 0.35;
/** How far from an eighth of the band a note may fall and still sit in the pocket, in seconds. */
export const POCKET = 0.09;
/** Two notes on one string closer together than this were not both plucked by a beginner: hammered or pulled. */
export const QUICK = 0.19;
/** What a note off the beat adds to the shake of a line (and more for each thing already in it), and what a note on the beat takes off. */
export const SHAKE = 0.26;
export const SHAKE_PER = 0.012;
export const STEADY = 0.16;
/** A clearly heard note outside the scale shakes the line this much: two of them lose it. */
export const CLAM = 0.5;
/** After the run's time is up, a line that is still alive may go on this many beats before it is ended as it stands. */
export const OVERTIME_BEATS = 8;

export interface FreeEvent {
  kind: 'note' | 'chk' | 'stab';
  /** when it was played, on the listener's clock, as aimed (the way through speaker and microphone taken off) */
  t: number;
  /** a note: where it lies */
  m?: number;
  s?: number;
  f?: number;
  /** a note that was not plucked: hammered on or pulled off */
  slur?: boolean;
  /** a strum: the chord */
  chord?: string;
  /** the eighth of the band it belongs to, counted from the start of the run */
  step: number;
  /** on the beat or off it; null for a note that has no moment of its own (hammered, pulled) */
  inTime: boolean | null;
  got: Trick[];
}

export interface Line {
  ev: FreeEvent[];
  /** every trick in the order it came, and each kind once */
  tricks: Trick[];
  set: Set<Trick>;
  /** points of the plain notes, and of the tricks */
  base: number;
  pts: number;
  start: number;
}

export interface Landed {
  line: Line;
  total: number;
  mult: number;
  /** ended on the root, on a beat */
  clean: boolean;
  /** ended somewhere else: half */
  loose: boolean;
  /** when it was banked */
  at: number;
}

export type FreeNews =
  | { type: 'played'; ev: FreeEvent }
  | { type: 'trick'; trick: Trick; points: number; ev: FreeEvent; i: number }
  | { type: 'clam'; t: number; m: number }
  | { type: 'landed'; landed: Landed }
  | { type: 'lost'; line: Line; points: number; at: number }
  | { type: 'over' };

export interface FreeOptions {
  seconds?: number;
  /** seconds a note played exactly with the band arrives late: the way out through the speakers and in through the microphone */
  lat?: number;
  pocket?: number;
}

/** What a line is worth as it stands: its points times the number of different tricks in it. */
export const worth = (l: Line): number => (l.base + l.pts) * Math.max(1, l.set.size);

/** How many of the last entries, counted back from the newest, keep to a rule between neighbours. */
function trail<T>(a: T[], ok: (x: T, y: T) => boolean): number {
  let n = 1;
  for (let i = a.length - 1; i > 0 && ok(a[i - 1], a[i]); i--) n++;
  return n;
}

export class Freestyle {
  readonly spot: Spot;
  readonly beat: number;
  readonly eighth: number;
  readonly seconds: number;
  readonly pocket: number;
  lat: number;
  /** when the first beat of the run sounds: the band's grid is counted from here */
  t0 = 0;
  started = false;
  over = false;
  score = 0;
  line: Line | null = null;
  /** the lines that were banked, oldest first */
  sky: Landed[] = [];
  best: Landed | null = null;
  lost = 0;
  /** how often each trick has been done in this run */
  used: Partial<Record<Trick, number>> = {};
  /** tricks that were part of a banked line in this run */
  landedTricks = new Set<Trick>();
  /** 0 steady, 1 the line is lost */
  wobble = 0;
  /** score reached, a line with enough different tricks landed, low to high landed */
  goals = [false, false, false];
  news: FreeNews[] = [];
  /** where the player's notes fall against the grid on average, in seconds: taken off before a note is judged */
  bias = 0;
  private judged = 0;
  private readonly sorted: number[];

  constructor(spot: Spot, o: FreeOptions = {}) {
    this.spot = spot;
    this.beat = 60 / spot.bpm;
    this.eighth = this.beat / 2;
    this.seconds = o.seconds ?? RUN_SECONDS;
    this.pocket = o.pocket ?? POCKET;
    this.lat = o.lat ?? 0;
    this.sorted = [...spot.scale].sort((a, b) => a - b);
  }

  start(t0: number): void {
    this.t0 = t0;
    this.started = true;
  }

  get endsAt(): number {
    return this.t0 + this.seconds;
  }

  timeLeft(now: number): number {
    return Math.max(0, Math.min(this.seconds, this.endsAt - (now - this.lat)));
  }

  /** The chord the band plays at a moment. */
  chordAt(t: number): string {
    const n = this.spot.chords.length;
    const bar = Math.floor((t - this.t0) / (4 * this.beat));
    return this.spot.chords[((bar % n) + n) % n];
  }

  /** A pause is over: everything that has a time moves on by as long as it lasted. */
  resumed(shift: number): void {
    this.t0 += shift;
    if (this.line) {
      this.line.start += shift;
      for (const e of this.line.ev) e.t += shift;
    }
  }

  /** The place of a note of the scale on the neck: in the box, or, higher up, on the string it is nearest the nut on. */
  private placeOf(midi: number): Place | null {
    if (!this.spot.scale.includes(((midi % 12) + 12) % 12)) return null;
    const p = this.spot.box.find((x) => x.m === midi);
    if (p) return p;
    let s = OPEN.length - 1;
    while (s > 0 && OPEN[s] > midi) s--;
    return midi >= OPEN[s] ? { m: midi, s, f: midi - OPEN[s] } : null;
  }

  /** Which step of the scale a note is, counted through the octaves: neighbours in the scale differ by one. */
  private degree(midi: number): number {
    return Math.floor(midi / 12) * this.sorted.length + this.sorted.indexOf(((midi % 12) + 12) % 12);
  }

  /** May this moment be played at? Not before the first beat, and after the time is up only inside a line that is still alive. */
  private open(at: number): boolean {
    if (!this.started || this.over || at < this.t0 - this.eighth) return false;
    return at <= this.endsAt || !!this.line;
  }

  /** The line this moment belongs to: the one that is alive, or a new one when it has rested long enough. */
  private lineAt(at: number): Line {
    const l = this.line;
    if (l && at - l.ev[l.ev.length - 1].t >= REST_BEATS * this.beat) this.settle(l.ev[l.ev.length - 1].t + REST_BEATS * this.beat);
    return this.line ?? (this.line = { ev: [], tricks: [], set: new Set(), base: 0, pts: 0, start: at });
  }

  /** Puts an event on the grid and lets it steady or shake the line. */
  private judge(e: FreeEvent, at: number, line: Line): void {
    const x = at - this.bias - this.t0;
    e.step = Math.round(x / this.eighth);
    if (e.slur) {
      e.inTime = null;
      return;
    }
    const off = x - e.step * this.eighth;
    e.inTime = Math.abs(off) <= this.pocket;
    // where this player's notes fall on average is learned from the first notes on, slowly: a steady habit of
    // playing a little early or late, or a latency the browser got wrong, is not a mistake of timing
    this.judged++;
    if (Math.abs(off) < this.eighth * 0.45) this.bias += off * (this.judged <= 4 ? 0.3 : 0.1);
    this.bias = Math.max(-0.12, Math.min(0.12, this.bias));
    if (e.inTime) this.wobble = Math.max(0, this.wobble - STEADY);
    else this.wobble += SHAKE + SHAKE_PER * line.ev.length;
  }

  private award(line: Line, e: FreeEvent, got: Trick[]): void {
    got.forEach((trick, i) => {
      const n = this.used[trick] ?? 0;
      const points = Math.round((TRICK_POINTS[trick] * Math.max(FLOOR, 1 - STALE * n)) / 5) * 5;
      this.used[trick] = n + 1;
      line.pts += points;
      line.tricks.push(trick);
      line.set.add(trick);
      this.news.push({ type: 'trick', trick, points, ev: e, i });
    });
    e.got = got;
  }

  /** Tricks that are a matter of timing alone: four plucked things in eighths, and a note pushed onto the "and". */
  private timed(line: Line, e: FreeEvent, got: Trick[]): void {
    if (e.slur) return;
    const plucked = line.ev.filter((x) => !x.slur).concat(e);
    const n = trail(plucked, (a, b) => b.t - a.t <= 0.62 * this.beat);
    if (n >= 4 && n % 4 === 0) got.push('double');
    const last = line.ev[line.ev.length - 1];
    if (e.step % 2 !== 0 && e.inTime && last && e.t - last.t > 0.8 * this.beat) got.push('push');
  }

  private add(line: Line, e: FreeEvent, got: Trick[]): void {
    this.award(line, e, got);
    // what is reported late (a hit on muted strings) goes where it was played
    let i = line.ev.length;
    while (i > 0 && line.ev[i - 1].t > e.t) i--;
    line.ev.splice(i, 0, e);
    this.news.push({ type: 'played', ev: e });
    if (this.wobble >= 1) this.lose(e.t);
  }

  /**
   * A note was heard. t is when it sounded, on the listener's clock. A note outside the scale is no part of a
   * line; heard for sure, it shakes the line that is alive.
   */
  note(midi: number, t: number, sure = true): void {
    const at = t - this.lat;
    if (!this.open(at)) return;
    const p = this.placeOf(midi);
    if (!p) {
      if (!sure || !this.line) return;
      this.news.push({ type: 'clam', t: at, m: midi });
      this.wobble += CLAM;
      if (this.wobble >= 1) this.lose(at);
      return;
    }
    const line = this.lineAt(at);
    const notes = line.ev.filter((x) => x.kind === 'note');
    const pn = notes[notes.length - 1];
    const e: FreeEvent = { kind: 'note', t: at, m: p.m, s: p.s, f: p.f, step: 0, inTime: null, got: [] };
    // two notes on one string, closer together than a hand plucks them: the second was hammered or pulled
    e.slur = !!pn && pn.s === p.s && pn.m !== p.m && at - pn.t < QUICK;
    this.judge(e, at, line);
    line.base += NOTE_POINTS;
    const got: Trick[] = [];
    if (pn) {
      if (e.slur) got.push(p.m > pn.m! ? 'hammer' : 'pull');
      else if (Math.abs(p.m - pn.m!) === 12) got.push('octave');
      else if (Math.abs(p.s - pn.s!) >= 2) got.push('skip');
      const all = notes.concat(e);
      const dd = this.degree(p.m) - this.degree(pn.m!);
      const ds = p.s - pn.s!;
      if (Math.abs(dd) === 1) {
        const n = trail(all, (a, b) => this.degree(b.m!) - this.degree(a.m!) === dd);
        if (n >= 4 && (n - 4) % 3 === 0) got.push('run');
      }
      if (Math.abs(ds) === 1 && Math.abs(dd) >= 2) {
        const n = trail(all, (a, b) => b.s! - a.s! === ds && Math.abs(this.degree(b.m!) - this.degree(a.m!)) >= 2);
        if (n >= 4 && (n - 4) % 3 === 0) got.push('arpeggio');
      }
      if (dd === 0 && !e.slur && trail(all, (a, b) => a.m === b.m && !b.slur) % 3 === 0) got.push('stutter');
      const ms = all.map((x) => x.m!);
      if (!line.set.has('span') && Math.max(...ms) - Math.min(...ms) >= 24) got.push('span');
    }
    this.timed(line, e, got);
    this.add(line, e, got);
  }

  /** A hit on muted strings. */
  chk(t: number): void {
    const at = t - this.lat;
    if (!this.open(at)) return;
    const line = this.lineAt(at);
    const e: FreeEvent = { kind: 'chk', t: at, step: 0, inTime: null, got: [] };
    this.judge(e, at, line);
    const got: Trick[] = ['chk'];
    this.timed(line, e, got);
    this.add(line, e, got);
  }

  /** A chord of the groove was strummed. It also steadies the line: that is what players do between their licks. */
  stab(chord: string, t: number): void {
    const at = t - this.lat;
    if (!this.open(at)) return;
    const line = this.lineAt(at);
    const e: FreeEvent = { kind: 'stab', t: at, chord, step: 0, inTime: null, got: [] };
    this.judge(e, at, line);
    this.wobble = Math.max(0, this.wobble - 0.25);
    const got: Trick[] = ['stab'];
    this.timed(line, e, got);
    this.add(line, e, got);
  }

  /** The line has rested: it is banked. On the root it counts in full, on the root on a beat once more. */
  private settle(at: number): void {
    const line = this.line;
    this.line = null;
    this.wobble = 0;
    // one note is not a line
    if (!line || line.ev.length < 2) return;
    const last = line.ev[line.ev.length - 1];
    const root = last.kind === 'note' && ((last.m! % 12) + 12) % 12 === this.spot.root;
    const chord = last.kind === 'stab';
    const clean = root && last.step % 2 === 0 && last.inTime !== false;
    const mult = Math.max(1, line.set.size) + (clean ? 1 : 0);
    const total = Math.round((line.base + line.pts) * mult * (root || chord ? 1 : 0.5));
    const landed: Landed = { line, total, mult, clean, loose: !(root || chord), at };
    this.score += total;
    this.sky.push(landed);
    if (!this.best || total > this.best.total) this.best = landed;
    for (const t of line.set) this.landedTricks.add(t);
    if (this.score >= this.spot.goalScore) this.goals[0] = true;
    if (line.set.size >= this.spot.goalTricks) this.goals[1] = true;
    if (line.set.has('span')) this.goals[2] = true;
    this.news.push({ type: 'landed', landed });
  }

  private lose(at: number): void {
    const line = this.line;
    if (!line) return;
    this.line = null;
    this.wobble = 0;
    this.lost++;
    this.news.push({ type: 'lost', line, points: worth(line), at });
  }

  /** How far the rest that banks the line has got, 0 to 1; 0 when there is nothing to bank. */
  resting(now: number): number {
    const l = this.line;
    if (!l || l.ev.length < 2) return 0;
    return Math.max(0, Math.min(1, (now - this.lat - l.ev[l.ev.length - 1].t) / (REST_BEATS * this.beat)));
  }

  /** Time passes: a line that has rested is banked, a shake dies down between lines, and the run ends. */
  update(now: number): void {
    if (!this.started || this.over) return;
    const at = now - this.lat;
    const l = this.line;
    if (l) {
      const last = l.ev[l.ev.length - 1].t;
      if (at - last >= REST_BEATS * this.beat + REPORT) this.settle(last + REST_BEATS * this.beat);
      // the time is long up and the line still goes on: it is ended as it stands
      else if (at >= this.endsAt + OVERTIME_BEATS * this.beat) this.settle(at);
    }
    if (!this.line && at >= this.endsAt + REPORT) {
      this.over = true;
      this.news.push({ type: 'over' });
    }
  }
}

/**
 * A strum, or a single note, at one onset? A strum when a chord of the groove fits well and no single note
 * explains what began there. Measured (tests/real/freebench.ts): this takes none of the single notes for a strum,
 * also with the room around them, and catches about a third of the strums of six recorded pieces. A strum it
 * misses costs nothing. The limit on the note is low because open strings ringing on make a newly plucked one
 * sound like a chord: an open D over a ringing A came out as a D chord with the note at 0.69.
 */
export const STRUM_SCORE = 0.65;
export const STRUM_NOTE = 0.55;
export function strumOf(note: NoteEvent | undefined, chord: ChordEvent | undefined, chords: string[]): string | null {
  if (!chord?.best || chord.score < STRUM_SCORE || !chords.includes(chord.best)) return null;
  return !note || note.conf < STRUM_NOTE ? chord.best : null;
}
/** A note taken as played: one the listener is fairly sure of. A note outside the scale only counts against the line when it is surer still. */
export const NOTE_CONF = 0.6;
export const sureNote = (n: NoteEvent): boolean => n.conf >= 0.8 && n.margin >= 1.3;
