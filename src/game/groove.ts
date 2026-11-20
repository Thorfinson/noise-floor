/**
 * The lighthouse on a groove: the rules of a run of chord changes played over a band, with no drawing and
 * no audio in here. Pieces of noise drift in over the sea toward the lamp, each wearing one chord. Strumming
 * a chord strikes the piece that wears it, so which piece goes first is the player's choice (as in a typing
 * game, where the word typed picks the target). Two pieces never wear the same chord at once.
 *
 * Everything keeps to the beat. Pieces appear on the grid of the band. The listener names a strum about a
 * fifth of a second after it was played, so a hit is not shown when it is heard: the bolt sets off then and
 * strikes on the next beat, and nothing looks or sounds late. Whether the strum itself was in time is judged
 * afterwards, from the moment it was played, with a wide window and an allowance for the delay of the
 * player's microphone and speakers that follows the player slowly.
 *
 * The band is the reward and the life: a chain of clean hits brings in its layers one by one, and a miss lets
 * the top one fade out; the groove itself never stops. The lamp keeps its three lights as lives.
 *
 * Two clocks are used, both in seconds on the listener's clock: `now` is when something happens in the app
 * (the band is scheduled on it), and a strum's own time `t` is when it reached the microphone, which for a
 * strum exactly on a beat is the beat plus the round trip `lat`.
 */
import type { StringResult } from '../audio/listener';
import { L } from '../core/i18n';
import type { RunRow } from '../core/store';
import type { Boss, BossSpec, Measurement } from './run';
import { HEARD_AFTER } from './stride';

/** The layers of the band, in the order they come in. */
export const LAYER_NAMES = ['drums', 'bass', 'keys', 'lead'] as const;
export type LayerName = (typeof LAYER_NAMES)[number];
/** The chain of clean hits at which each layer comes in: the drums are there from the start. */
export const LAYER_AT = [0, 4, 8, 16];
/** How long a layer takes to fade out after a miss, and to come in, in seconds. */
export const FADE_OUT = 1.5;
export const FADE_IN = 0.6;

/** How many layers a chain has brought in, counted from 0 (the drums alone). */
export const layerOf = (chain: number): number => LAYER_AT.reduce((lv, at, i) => (chain >= at ? i : lv), 0);

/** The gain of each layer of the band at a level: the drums never go. */
export function layerGains(level: number): Record<LayerName, number> {
  return { drums: 1, bass: level >= 1 ? 1 : 0, keys: level >= 2 ? 1 : 0, lead: level >= 3 ? 1 : 0 };
}

/** How long a change of level takes to be heard: a layer that goes fades out slowly, one that comes in quicker. */
export const fadeFor = (before: number, after: number): number => (after < before ? FADE_OUT : FADE_IN);

/** The bolt needs a moment to fly: a strike falls on the first beat at least this long after the strum was heard. */
export const MIN_WIND = 0.12;

/** The rules a night can bring, one per night (see game/night.ts). None of them hides a chord. */
export type RuleId = 'calm' | 'mixed' | 'pairs' | 'spring' | 'full';

export interface GroovePerk {
  id: 'slow' | 'shield' | 'bell' | 'beat' | 'change' | 'keep';
  name: string;
  text: string;
}

// one short line each: the cards are read from a metre away, with the guitar in the hands
export const GROOVE_PERKS: GroovePerk[] = [
  { id: 'slow', get name() { return L('Heavy air', 'Schwere Luft'); }, get text() { return L('Pieces drift 15% slower.', 'Teile treiben 15 % langsamer.'); } },
  { id: 'shield', get name() { return L('Spare wick', 'Ersatzdocht'); }, get text() { return L('One more light in the lamp.', 'Ein Licht mehr in der Lampe.'); } },
  { id: 'bell', get name() { return L('The bell', 'Die Glocke'); }, get text() { return L('Every four bars it pushes the nearest piece back.', 'Alle vier Takte drängt sie das nächste Teil zurück.'); } },
  { id: 'beat', get name() { return L('On the beat', 'Im Takt'); }, get text() { return L('Hits on the beat score triple.', 'Treffer im Takt zählen dreifach.'); } },
  { id: 'change', get name() { return L('Quick change', 'Schneller Wechsel'); }, get text() { return L('A change under 1.2 s scores double.', 'Ein Wechsel unter 1,2 s zählt doppelt.'); } },
  { id: 'keep', get name() { return L('Steady band', 'Treue Band'); }, get text() { return L('Once a wave, a miss costs the band nothing.', 'Einmal pro Welle kostet ein Fehler die Band nichts.'); } },
];

export interface Piece {
  id: number;
  chord: string;
  /** when it appeared, on a beat */
  born: number;
  /** seconds from appearing to reaching the lamp */
  travel: number;
  /** which of four lanes over the water it drifts in */
  lane: number;
  state: 'drift' | 'struck' | 'landed';
  /** when the bolt set off, and the beat it strikes on */
  firedAt: number;
  strikeAt: number;
  /** how far it had come when it was struck, 0 at the horizon, 1 at the lamp */
  at: number;
  inTime: boolean;
}

export type GrooveEvent =
  | { type: 'spawn'; id: number }
  | { type: 'strike'; id: number; at: number; inTime: boolean; gain: number }
  | { type: 'miss' }
  | { type: 'land'; id: number }
  | { type: 'layers'; level: number; before: number }
  | { type: 'measure'; key: string; value: number }
  | { type: 'bell'; id: number }
  | { type: 'wave'; wave: number }
  | { type: 'tempo'; bpm: number; before: number; settled: boolean };

export interface GrooveOptions {
  /** the chords of the groove the pieces wear, chord ids */
  chords: string[];
  /** chords from outside the song, for the night whose rule mixes them in */
  extra?: string[];
  /** the skill of the change between two chords */
  pairKey: (a: string, b: string) => string;
  /** a change's name in the debrief, "C → G" */
  pairLabel: (a: string, b: string) => string;
  /** how strongly a change is favoured: low and rusty skills more */
  weight: (key: string) => number;
  rng: () => number;
  bpm: number;
  beatsPerBar: number;
  waves: number;
  barsPerWave?: number;
  boss?: BossSpec | null;
  /** seconds from a beat being scheduled to a strum on it reaching the listener */
  lat: number;
  rule?: RuleId | null;
}

/** The tempi the groove moves between, beats a minute. */
export const BPM_MIN = 56;
export const BPM_MAX = 120;
export const BPM_STEP = 6;

const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const median = (v: number[]): number => {
  const s = v.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Clean changes of one pair that make one measurement, as a piece of the old changes run did. */
const PER_MEASURE = 4;
/** A gap longer than this many beats was a wait, not a change. */
const LONGEST_GAP_BEATS = 8;

interface PairStat {
  label: string;
  sent: number;
  cleared: number;
  /** clean gaps not yet made into a measurement */
  open: number[];
  /** every clean gap, seconds */
  gaps: number[];
  /** measurements, clean changes a minute */
  values: number[];
}

export class Groove {
  readonly opts: GrooveOptions;
  readonly waves: number;
  readonly barsPerWave: number;
  readonly beatsPerBar: number;
  state: 'ready' | 'playing' | 'perk' | 'between' | 'boss' | 'over' | 'won' = 'ready';
  wave = 0;
  bpm: number;
  /** when beat 0 of this wave sounds (scheduled), and seconds per beat */
  t0 = 0;
  beat: number;
  pieces: Piece[] = [];
  score = 0;
  chain = 0;
  level = 0;
  bestLevel = 0;
  integrity = 3;
  maxIntegrity = 3;
  /** the allowance for the round trip, following the player slowly */
  lat: number;
  perks = new Set<GroovePerk['id']>();
  offered: GroovePerk[] = [];
  boss: Boss | null = null;
  events: GrooveEvent[] = [];
  /** strums judged: how far from the beat each one in the window was, seconds */
  readonly offsets: number[] = [];
  hits = 0;
  inTime = 0;
  misses = 0;
  landed = 0;
  /** the tempo stopped moving between two waves */
  settled = false;
  readonly pairs = new Map<string, PairStat>();
  /** the order the night's pieces come in: drawn once, so that a retry meets the same tide */
  readonly queue: string[];

  private readonly lat0: number;
  private uid = 1;
  private nextGrid = 0;
  private lastBell = 0;
  private kept = false;
  /** the last chord that struck a piece, and when it was played */
  private last: { chord: string; t: number } | null = null;
  /** nothing went wrong since the last hit: the next change may be measured */
  private clean = false;
  /** how the wave went, for the tempo of the next one */
  private waveLog = { struck: 0, early: 0, late: 0, landed: 0, misses: 0 };
  private readonly bossSpec: BossSpec | null;

  constructor(opts: GrooveOptions) {
    this.opts = opts;
    this.waves = Math.max(1, opts.waves);
    this.barsPerWave = opts.barsPerWave ?? 16;
    this.beatsPerBar = Math.max(1, Math.round(opts.beatsPerBar));
    this.bpm = clamp(Math.round(opts.bpm), BPM_MIN, BPM_MAX);
    this.beat = 60 / this.bpm;
    this.lat = this.lat0 = opts.lat;
    this.bossSpec = opts.boss ?? null;
    if (opts.rule === 'spring') this.integrity = this.maxIntegrity = 4;
    if (opts.rule === 'full') {
      this.chain = LAYER_AT[LAYER_AT.length - 1];
      this.level = this.bestLevel = layerOf(this.chain);
    }
    this.queue = this.draw(240);
  }

  /** The chords of the pieces to come, drawn ahead: weak changes more often, never the same twice in a row. */
  private draw(n: number): string[] {
    const { chords, extra = [], rule } = this.opts;
    const weightOf = (c: string, among: string[]): number => {
      const others = among.filter((d) => d !== c);
      return others.length ? mean(others.map((d) => this.opts.weight(this.opts.pairKey(c, d)))) : 1;
    };
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      // the mixed night: every second piece wears a chord from outside the song
      const from = rule === 'mixed' && extra.length && i % 2 === 1 ? extra : chords;
      const all = rule === 'mixed' ? [...chords, ...extra] : chords;
      const options = from.filter((c) => c !== out[out.length - 1]);
      const pick = options.length ? options : from;
      const ws = pick.map((c) => weightOf(c, all));
      let r = this.opts.rng() * ws.reduce((a, b) => a + b, 0);
      let chosen = pick[pick.length - 1];
      for (let k = 0; k < pick.length; k++) {
        r -= ws[k];
        if (r <= 0) {
          chosen = pick[k];
          break;
        }
      }
      out.push(chosen);
    }
    return out;
  }

  /** The chords the pieces of this run can wear, all of them. */
  get chords(): string[] {
    return [...new Set([...this.opts.chords, ...(this.opts.rule === 'mixed' ? (this.opts.extra ?? []) : [])])];
  }

  /** Beats in a wave, while pieces still appear. */
  get waveBeats(): number {
    return this.barsPerWave * this.beatsPerBar;
  }

  /** Pieces appear on the beat, one a beat while there is room on the water (two a bar line in the night of pairs). */
  get spawnStep(): number {
    return this.opts.rule === 'pairs' ? this.beatsPerBar : 1;
  }

  /** How far a strum may be from a beat and still be in time: wide, a third of a beat at most a quarter second. */
  get window(): number {
    return Math.min(0.25, 0.3 * this.beat);
  }

  /** The beat (as a number, fractions between) of a moment on the app's clock, in this wave. */
  beatAt(now: number): number {
    return (now - this.t0) / this.beat;
  }

  /** How far a piece has come, 0 at the horizon, 1 at the lamp. */
  progress(p: Piece, now: number): number {
    return clamp((now - p.born) / p.travel, 0, 1);
  }

  /** Pieces on the water that can still be struck. */
  drifting(): Piece[] {
    return this.pieces.filter((p) => p.state === 'drift');
  }

  /** The piece that will reach the lamp first: it wears the ring, and the beam swings to it. */
  next(now: number): Piece | null {
    const d = this.drifting();
    return d.length ? d.reduce((a, b) => (this.progress(b, now) > this.progress(a, now) ? b : a)) : null;
  }

  /** How many pieces drift at once: two in the first wave, then three, then four, never more than there are chords. */
  crowd(): number {
    const want = this.wave <= 1 ? 2 : this.wave === 2 ? 3 : 4;
    return Math.min(want, this.chords.length);
  }

  /** Seconds a piece takes to the lamp in this wave: twenty beats in the first, fewer after. */
  travel(): number {
    let beats = [20, 18, 16, 14][Math.min(3, this.wave - 1)];
    if (this.opts.rule === 'calm') beats *= 2;
    if (this.opts.rule === 'spring') beats *= 0.8;
    if (this.perks.has('slow')) beats /= 0.85;
    return beats * this.beat;
  }

  /** The first moment of a beat that is at least this late. */
  nextBeat(from: number): number {
    return this.t0 + Math.ceil((from - this.t0) / this.beat - 1e-9) * this.beat;
  }

  // ───────────────────────── the course of a run

  /** The first wave starts: beat 0 sounds at T0. The count before it is the screen's. */
  start(T0: number): void {
    if (this.state !== 'ready') return;
    this.startWave(T0);
  }

  /** A wave starts on the grid of the band, at its (new) tempo. */
  startWave(T0: number): void {
    if (this.state !== 'ready' && this.state !== 'between') return;
    this.wave++;
    this.t0 = T0;
    this.beat = 60 / this.bpm;
    this.nextGrid = 0;
    this.lastBell = 0;
    this.kept = false;
    this.last = null;
    this.clean = false;
    this.waveLog = { struck: 0, early: 0, late: 0, landed: 0, misses: 0 };
    this.state = 'playing';
    this.events.push({ type: 'wave', wave: this.wave });
    // the first piece is on show at once, still, until the wave begins
    this.spawn(T0);
    if (this.opts.rule === 'pairs') this.spawn(T0);
    this.nextGrid = this.spawnStep;
  }

  private spawn(born: number): void {
    const busy = new Set(this.pieces.filter((p) => p.state !== 'landed').map((p) => p.chord));
    const k = this.queue.findIndex((c) => !busy.has(c));
    // no chord left that is not on the water already: wait for the next beat
    if (k < 0) return;
    const [chord] = this.queue.splice(k, 1);
    if (this.queue.length < 40) this.queue.push(...this.draw(120));
    const used = new Set(this.drifting().map((p) => p.lane));
    const lanes = [0, 1, 2, 3].filter((l) => !used.has(l));
    const lane = lanes.length ? lanes[(this.uid * 3) % lanes.length] : this.uid % 4;
    const p: Piece = { id: this.uid++, chord, born, travel: this.travel(), lane, state: 'drift', firedAt: 0, strikeAt: 0, at: 0, inTime: false };
    this.pieces.push(p);
    this.events.push({ type: 'spawn', id: p.id });
  }

  /** Time passes: pieces appear on the grid, reach the lamp, are struck and gone; a wave ends when the water is clear. */
  update(now: number): void {
    if (this.state !== 'playing') return;
    const wb = this.beatAt(now);
    // pieces appear on the grid while the wave lasts, as long as there is room on the water
    while (wb >= this.nextGrid && this.nextGrid < this.waveBeats) {
      const at = this.t0 + this.nextGrid * this.beat;
      if (this.drifting().length < this.crowd()) this.spawn(at);
      // in pairs: two at once, on a bar line
      if (this.opts.rule === 'pairs' && this.drifting().length < this.crowd()) this.spawn(at);
      this.nextGrid += this.spawnStep;
    }
    // the bell: every four bars the piece nearest the lamp is pushed back
    if (this.perks.has('bell')) {
      const bar4 = Math.floor(wb / (4 * this.beatsPerBar));
      if (bar4 > this.lastBell) {
        this.lastBell = bar4;
        const n = this.next(now);
        if (n) {
          n.born = Math.min(now, n.born + 0.15 * n.travel);
          this.events.push({ type: 'bell', id: n.id });
        }
      }
    }
    // a piece at the lamp rests there until a strum played just before it arrived would have been heard
    for (const p of this.drifting()) if (now >= p.born + p.travel + HEARD_AFTER) this.land(p);
    if (this.state !== 'playing') return;
    // a struck piece is gone once its bolt has struck
    this.pieces = this.pieces.filter((p) => p.state === 'drift' || (p.state === 'struck' && now < p.strikeAt + 0.05));
    if (this.nextGrid >= this.waveBeats && !this.pieces.length) this.endWave();
  }

  private land(p: Piece): void {
    p.state = 'landed';
    this.pieces = this.pieces.filter((x) => x !== p);
    this.integrity--;
    this.landed++;
    this.waveLog.landed++;
    this.clean = false;
    this.events.push({ type: 'land', id: p.id });
    this.drop(1);
    if (this.integrity <= 0) {
      this.state = 'over';
      // the next run starts a little slower
      this.bpm = this.slower();
    }
  }

  /** The band loses layers: the top ones fade out, the drums stay. */
  private drop(layers: number): void {
    const before = this.level;
    const level = Math.max(0, before - layers);
    this.chain = Math.min(this.chain, LAYER_AT[level]);
    this.level = layerOf(this.chain);
    if (this.level !== before) this.events.push({ type: 'layers', level: this.level, before });
  }

  /**
   * A strummed chord was heard: t is when it was played, now when it was heard. Returns true when it struck a
   * piece. The chord just played, or one already on its way to its piece, is neither a hit nor a miss: a
   * player strumming on through the bar is not punished for it.
   */
  chord(id: string, t: number, now: number): boolean {
    if (this.state !== 'playing') return false;
    // played while the wave was being counted in: not yet part of it
    if (t - this.lat < this.t0 - this.window) return false;
    const piece = this.drifting().find((p) => p.chord === id);
    if (!piece) {
      if (id === this.last?.chord || this.pieces.some((p) => p.state === 'struck' && p.chord === id)) return false;
      if (this.drifting().length) this.miss();
      return false;
    }
    // in time? judged from when it was played, against the nearest beat, after the round trip
    const b = (t - this.lat - this.t0) / this.beat;
    const off = (b - Math.round(b)) * this.beat;
    const inTime = Math.abs(off) <= this.window;
    if (inTime) {
      this.offsets.push(off);
      this.inTime++;
      // a slow allowance: a player who is always a little late moves the beat toward them, never far
      this.lat = clamp(this.lat + 0.05 * off, Math.max(0, this.lat0 - 0.12), Math.min(0.35, this.lat0 + 0.12));
    }
    const at = this.progress(piece, now);
    piece.state = 'struck';
    piece.firedAt = now;
    piece.strikeAt = this.nextBeat(now + MIN_WIND);
    piece.at = at;
    piece.inTime = inTime;
    this.hits++;
    this.waveLog.struck++;
    if (at < 0.5) this.waveLog.early++;
    else if (at > 0.8) this.waveLog.late++;
    // the change from the chord before, if there was one and nothing went wrong between
    let quick = false;
    if (this.last && this.last.chord !== id) {
      const gap = t - this.last.t;
      const key = this.opts.pairKey(this.last.chord, id);
      const s = this.pair(key, this.last.chord, id);
      s.sent++;
      if (this.clean && gap > 0 && gap <= LONGEST_GAP_BEATS * this.beat) {
        s.cleared++;
        s.gaps.push(gap);
        s.open.push(gap);
        quick = gap < 1.2;
        if (s.open.length >= PER_MEASURE) this.measure(key, s);
      }
    }
    this.last = { chord: id, t };
    this.clean = true;
    const before = this.level;
    this.chain++;
    this.level = layerOf(this.chain);
    this.bestLevel = Math.max(this.bestLevel, this.level);
    if (this.level !== before) this.events.push({ type: 'layers', level: this.level, before });
    const gain = 50 * this.mult * (inTime ? (this.perks.has('beat') ? 3 : 2) : 1) * (quick && this.perks.has('change') ? 2 : 1);
    this.score += gain;
    this.events.push({ type: 'strike', id: piece.id, at: piece.strikeAt, inTime, gain });
    return true;
  }

  /** Score per hit grows with the band: one for the drums, up to four with the whole band. */
  get mult(): number {
    return 1 + this.level;
  }

  private pair(key: string, a: string, b: string): PairStat {
    let s = this.pairs.get(key);
    if (!s) this.pairs.set(key, (s = { label: this.opts.pairLabel(a, b), sent: 0, cleared: 0, open: [], gaps: [], values: [] }));
    return s;
  }

  private measure(key: string, s: PairStat): void {
    const value = 60 / mean(s.open);
    s.values.push(value);
    s.open = [];
    this.events.push({ type: 'measure', key, value });
  }

  private miss(): void {
    this.misses++;
    this.waveLog.misses++;
    this.clean = false;
    this.events.push({ type: 'miss' });
    if (this.perks.has('keep') && !this.kept) {
      this.kept = true;
      return;
    }
    this.drop(this.opts.rule === 'full' ? 2 : 1);
  }

  private slower(): number {
    return clamp(this.bpm - BPM_STEP, BPM_MIN, BPM_MAX);
  }

  /** The tempo of the next wave: up when pieces went early and clean, down when they reached the lamp or came late. */
  private nextTempo(): number {
    const w = this.waveLog;
    const n = w.struck + w.landed;
    if (!n) return this.bpm;
    if (w.landed > 0 || w.late > 0.35 * n) return this.slower();
    if (w.early >= 0.6 * n && w.misses <= 2) return clamp(this.bpm + BPM_STEP, BPM_MIN, BPM_MAX);
    return this.bpm;
  }

  private endWave(): void {
    const before = this.bpm;
    const bpm = this.nextTempo();
    const settled = bpm === before && !this.settled;
    if (settled) this.settled = true;
    this.bpm = bpm;
    this.events.push({ type: 'tempo', bpm, before, settled });
    if (this.wave >= this.waves) {
      if (this.bossSpec) {
        this.boss = { ...this.bossSpec, results: this.bossSpec.steps.map(() => null), at: 0, tries: 0, startT: -1, endT: -1 };
        this.state = 'boss';
      } else this.state = 'won';
      return;
    }
    const options = GROOVE_PERKS.filter((p) => !this.perks.has(p.id) && !(p.id === 'shield' && this.maxIntegrity >= 4));
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(this.opts.rng() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    this.offered = options.slice(0, 3);
    this.state = this.offered.length ? 'perk' : 'between';
  }

  /** Take one of the offered upgrades; the screen then starts the next wave (startWave). */
  choosePerk(id: string): void {
    const perk = this.offered.find((p) => p.id === id);
    if (this.state !== 'perk' || !perk) return;
    this.perks.add(perk.id);
    if (perk.id === 'shield') {
      this.maxIntegrity++;
      this.integrity++;
    }
    this.offered = [];
    this.state = 'between';
  }

  /**
   * The run was paused and goes on: everything on the water and the grid are moved on by `shift` seconds
   * (whole bars, so the band comes back on a bar line). A change across a pause is not measured.
   */
  resumed(shift: number): void {
    if (!(shift > 0)) return;
    this.t0 += shift;
    for (const p of this.pieces) {
      p.born += shift;
      if (p.state === 'struck') p.strikeAt += shift;
    }
    this.clean = false;
  }

  // ───────────────────────── the Mute at the end

  /** Result of the string the boss is waiting for. */
  bossString(result: StringResult, t: number): void {
    const b = this.boss;
    if (this.state !== 'boss' || !b) return;
    if (b.startT < 0) b.startT = t;
    b.results[b.at] = result;
    if (result === 'clean') {
      this.score += 150 * this.mult;
      b.at++;
      if (b.at >= b.steps.length) {
        b.endT = t;
        this.state = 'won';
      }
    } else b.tries++;
  }

  bossGiveUp(): void {
    if (this.state === 'boss') this.state = 'won';
  }

  // ───────────────────────── what the run proved

  /**
   * Changes that were begun but not yet measured, when the run ends: two clean changes or more of a pair still
   * make a measurement, as a short piece did.
   */
  leftovers(): Measurement[] {
    const out: Measurement[] = [];
    for (const [key, s] of this.pairs) {
      if (s.open.length < 2) continue;
      const value = 60 / mean(s.open);
      s.values.push(value);
      s.open = [];
      out.push({ key, value });
    }
    return out;
  }

  /** One value per skill: the middle of its clean measurements, and the boss's chord. */
  measurements(): Measurement[] {
    const out: Measurement[] = [];
    for (const [key, s] of this.pairs) if (s.values.length) out.push({ key, value: median(s.values) });
    const b = this.boss;
    if (b && b.startT >= 0) {
      const clean = b.results.filter((r) => r === 'clean').length;
      const all = clean === b.steps.length;
      out.push({ key: b.key, value: all ? b.endT - b.startT : Infinity, strings: all ? 6 : Math.min(5, Math.round((clean / b.steps.length) * 6)) });
    }
    return out;
  }

  /** The rows of the debrief's table, one per change: as the runs keep them. */
  rows(): RunRow[] {
    return [...this.pairs].map(([key, s]) => ({ key, label: s.label, sent: s.sent, cleared: s.cleared, avg: s.gaps.length ? mean(s.gaps) : 0 }));
  }

  /** The mean distance from the beat of the strums judged in time, seconds: negative is early. */
  lean(): number {
    return this.offsets.length ? mean(this.offsets) : 0;
  }
}
