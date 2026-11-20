/**
 * Dares: the level is a song of the player's own (the song of the week), and the game is the pressure they
 * dare to put on it. The band plays the song round and round; before a run the player picks dares, and every
 * round that holds raises the stakes:
 *
 * - dark (lights out): the chart loses a layer after every round that holds: the chord pictures, then the
 *   names, then all but the first chord of each line, then everything. The fourth round is played in the dark.
 * - climb: four per cent faster after every round that holds.
 * - called: the chords of every bar are dealt anew each round and shown only a beat before they come, as a
 *   bandleader calls them (songs of strummed chords only).
 * - clean: a round holds only when every strum is the right chord, nothing else is played, and no strum dies.
 * - onetake: no second chance: the first round that breaks ends the run, and the whole run is recorded.
 *
 * A record is a sentence and, with one take, a recording: "in the dark · at 112 % · one take".
 * Nothing about drawing or sound in here: the screen is src/screens/dares.ts.
 */
import { L } from '../core/i18n';
import type { TakeResult } from '../core/playalong';

export type DareId = 'dark' | 'climb' | 'called' | 'clean' | 'onetake';
export const DARE_IDS: DareId[] = ['dark', 'climb', 'called', 'clean', 'onetake'];

// the texts are getters: read when they are shown, in the language of that moment
export const DARES: { id: DareId; readonly name: string; readonly text: string }[] = [
  { id: 'dark', get name() { return L('Lights out', 'Licht aus'); }, get text() { return L('The chart goes dark, layer by layer.', 'Die Noten werden dunkel, Schicht für Schicht.'); } },
  { id: 'climb', get name() { return L('Climb', 'Steigern'); }, get text() { return L('4 % faster every round that holds.', '4 % schneller nach jeder Runde, die hält.'); } },
  { id: 'called', get name() { return L('Called', 'Angesagt'); }, get text() { return L('Chords dealt anew, shown a beat ahead.', 'Akkorde neu gemischt, einen Schlag vorher gezeigt.'); } },
  { id: 'clean', get name() { return L('Clean', 'Sauber'); }, get text() { return L('One wrong or dead strum ends the round.', 'Ein falscher oder toter Anschlag beendet die Runde.'); } },
  { id: 'onetake', get name() { return L('One take', 'Ein Take'); }, get text() { return L('No second chance. The take is kept.', 'Keine zweite Chance. Der Take wird behalten.'); } },
];

/** layers of the chart that lights out takes away: pictures, names, all but the first chord of a line, the rest */
export const DARK_STAGES = 3;
export const CLIMB_STEP = 4;
export const TEMPO_MAX = 130;
/** a run ends after this many rounds whatever happens: a game, not an endless loop */
export const MAX_ROUNDS = 12;
/** without lights out or climb, nothing gets harder: the run is a set of this many rounds */
export const PLAIN_ROUNDS = 4;
/** without one take, a round that breaks is played again; three in a row and the run is over */
export const FAILS_IN_A_ROW = 3;

export interface DaresRun {
  dares: DareId[];
  /** layers of the chart taken away for the round now being played (0 to 3) */
  stage: number;
  /** % of full speed of the round now being played */
  tempo: number;
  /** rounds played so far */
  rounds: number;
  /** rounds that held */
  held: number;
  /** rounds that broke one after the other, last ones */
  fails: number;
  /** the best that was held: the stage and tempo of the last round that held (-1: none yet) */
  bestStage: number;
  bestTempo: number;
  points: number;
  over: boolean;
  /** why it ended: it broke under one take, it held in the dark, the set is through, too many breaks, the limit */
  end?: 'broke' | 'dark' | 'set' | 'fails' | 'limit' | 'stopped';
}

export const has = (r: { dares: DareId[] }, d: DareId): boolean => r.dares.includes(d);

export function startRun(dares: DareId[], tempo: number): DaresRun {
  return { dares: DARE_IDS.filter((d) => dares.includes(d)), stage: 0, tempo: Math.max(40, Math.min(TEMPO_MAX, Math.round(tempo))), rounds: 0, held: 0, fails: 0, bestStage: -1, bestTempo: 0, points: 0, over: false };
}

/**
 * Did a round hold? Under "clean": every step hit, nothing stray, no strum that died. Otherwise a few slips are
 * allowed: nine of ten steps hit and no more than two stray sounds, dead strums counted with them.
 */
export function roundHolds(r: TakeResult, dead: number, clean: boolean): boolean {
  if (r.total === 0) return false;
  if (clean) return r.hits === r.total && r.strays === 0 && dead === 0;
  return r.hits >= Math.ceil(0.9 * r.total) && r.strays + dead <= 2;
}

/** The run after a round: what changes when it held, and whether it is over. */
export function afterRound(run: DaresRun, held: boolean): DaresRun {
  const r = { ...run, rounds: run.rounds + 1 };
  if (held) {
    r.held++;
    r.fails = 0;
    r.bestStage = r.stage;
    r.bestTempo = r.tempo;
    // a round is worth more the more is dared, and more again in the dark and at speed
    r.points += 10 * (1 + r.dares.length) + 5 * r.stage + Math.max(0, r.tempo - 100);
    const dark = has(r, 'dark');
    const climb = has(r, 'climb');
    if (dark && r.stage >= DARK_STAGES && !climb) {
      r.over = true;
      r.end = 'dark';
    } else if (!dark && !climb && r.held >= PLAIN_ROUNDS) {
      r.over = true;
      r.end = 'set';
    }
    if (dark) r.stage = Math.min(DARK_STAGES, r.stage + 1);
    if (climb) {
      if (r.tempo >= TEMPO_MAX) {
        r.over = true;
        r.end = 'limit';
      }
      r.tempo = Math.min(TEMPO_MAX, r.tempo + CLIMB_STEP);
    }
  } else {
    r.fails++;
    if (has(r, 'onetake')) {
      r.over = true;
      r.end = 'broke';
    } else if (r.fails >= FAILS_IN_A_ROW) {
      r.over = true;
      r.end = 'fails';
    }
  }
  if (!r.over && r.rounds >= MAX_ROUNDS) {
    r.over = true;
    r.end = 'limit';
  }
  return r;
}

/** What is kept of the best run on a song. */
export interface DaresRecord {
  t: number;
  points: number;
  dares: DareId[];
  /** the stage and tempo of the last round that held */
  stage: number;
  tempo: number;
  held: number;
  /** a recording of the run was kept (one take) */
  take: boolean;
}

export function recordOf(run: DaresRun, t: number, take: boolean): DaresRecord | null {
  if (run.held === 0) return null;
  return { t, points: run.points, dares: run.dares.slice(), stage: run.bestStage, tempo: run.bestTempo, held: run.held, take };
}

export const beats = (a: DaresRecord | null, b: DaresRecord | undefined): boolean => !!a && (!b || a.points > b.points);

/** A record as a sentence: "in the dark · at 112 % · one take". */
export function describe(r: Pick<DaresRecord, 'dares' | 'stage' | 'tempo' | 'held'>): string {
  const bits: string[] = [];
  if (r.dares.includes('dark')) bits.push(r.stage >= DARK_STAGES ? L('in the dark', 'im Dunkeln') : L(`lights out ${r.stage}/${DARK_STAGES}`, `Licht aus ${r.stage}/${DARK_STAGES}`));
  bits.push(L(`at ${r.tempo} %`, `bei ${r.tempo} %`));
  if (r.dares.includes('called')) bits.push(L('called', 'angesagt'));
  if (r.dares.includes('clean')) bits.push(L('clean', 'sauber'));
  if (r.dares.includes('onetake')) bits.push(L('one take', 'ein Take'));
  if (!r.dares.includes('dark') && !r.dares.includes('climb')) bits.push(L(`${r.held} ${r.held === 1 ? 'round' : 'rounds'}`, `${r.held} ${r.held === 1 ? 'Runde' : 'Runden'}`));
  return bits.join(' · ');
}

/** A small seeded random number source, so that "called" deals the same chords for the same seed. */
export function seeded(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/**
 * "Called": the chord of every bar dealt anew from the song's own chords. Never the same chord three bars in
 * a row, and the first bar never what it was in the song, so that the call is needed from the start.
 */
export function deal(bars: string[], rng: () => number): string[] {
  const pool = [...new Set(bars)];
  if (pool.length < 2) return bars.slice();
  const out: string[] = [];
  for (let i = 0; i < bars.length; i++) {
    let pick = pool[Math.floor(rng() * pool.length)];
    for (let k = 0; k < 8 && ((i === 0 && pick === bars[0]) || (i >= 2 && pick === out[i - 1] && pick === out[i - 2])); k++) pick = pool[Math.floor(rng() * pool.length)];
    if (i === 0 && pick === bars[0]) pick = pool.find((c) => c !== bars[0])!;
    out.push(pick);
  }
  return out;
}
