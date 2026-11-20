import { beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../src/core/i18n';
import type { TakeResult } from '../src/core/playalong';
import { afterRound, beats, CLIMB_STEP, DARK_STAGES, deal, describe as describeRecord, FAILS_IN_A_ROW, MAX_ROUNDS, PLAIN_ROUNDS, recordOf, roundHolds, seeded, startRun, TEMPO_MAX, type DaresRun } from '../src/game/dares';
import { HEARINGS, judge, known, NOTES, openingOf, pitchClass, solved, TRIES, tuneOfDay, tunesOf } from '../src/game/fivenotes';
import { allSongs, findSong } from '../src/music/content';
import { Store } from '../src/core/store';

beforeEach(() => setLang('en'));

const result = (hits: number, total: number, strays = 0): TakeResult => ({ hits, total, strays, offset: 0, cleanBars: [], bars: [] });
/** Plays rounds: true holds, false breaks. */
const play = (run: DaresRun, rounds: boolean[]): DaresRun => rounds.reduce((r, h) => (r.over ? r : afterRound(r, h)), run);

describe('Dares: a round', () => {
  it('holds with a few slips, but not under "clean"', () => {
    expect(roundHolds(result(30, 32, 1), 0, false)).toBe(true);
    expect(roundHolds(result(28, 32), 0, false)).toBe(false);
    expect(roundHolds(result(32, 32, 2), 1, false)).toBe(false);
    expect(roundHolds(result(31, 32), 0, true)).toBe(false);
    expect(roundHolds(result(32, 32), 1, true)).toBe(false);
    expect(roundHolds(result(32, 32), 0, true)).toBe(true);
    expect(roundHolds(result(0, 0), 0, false)).toBe(false);
  });
});

describe('Dares: a run', () => {
  it('takes a layer away after every round that holds, and ends once a round holds in the dark', () => {
    let r = startRun(['dark'], 100);
    const stages: number[] = [];
    while (!r.over) {
      stages.push(r.stage);
      r = afterRound(r, true);
    }
    expect(stages).toEqual([0, 1, 2, 3]);
    expect(r.end).toBe('dark');
    expect(r.bestStage).toBe(DARK_STAGES);
  });

  it('a round that breaks is played again at the same stage, three in a row end it', () => {
    let r = play(startRun(['dark'], 100), [true, false]);
    expect(r.stage).toBe(1);
    expect(r.over).toBe(false);
    r = play(r, [false, false]);
    expect(r.over).toBe(true);
    expect(r.end).toBe('fails');
    expect(r.fails).toBe(FAILS_IN_A_ROW);
  });

  it('one take ends on the first round that breaks, and keeps what held before', () => {
    const r = play(startRun(['dark', 'onetake'], 100), [true, true, false, true]);
    expect(r.over).toBe(true);
    expect(r.end).toBe('broke');
    expect(r.held).toBe(2);
    expect(r.bestStage).toBe(1);
  });

  it('climb raises the tempo after every round that holds, up to its limit', () => {
    let r = play(startRun(['climb'], 100), [true, true]);
    expect(r.tempo).toBe(100 + 2 * CLIMB_STEP);
    expect(r.bestTempo).toBe(100 + CLIMB_STEP);
    r = play(startRun(['climb'], TEMPO_MAX - 2), [true, true, true]);
    expect(r.over).toBe(true);
    expect(r.bestTempo).toBe(TEMPO_MAX);
  });

  it('in the dark with climb it goes on climbing until it breaks', () => {
    const r = play(startRun(['dark', 'climb', 'onetake'], 100), [true, true, true, true, true, false]);
    expect(r.end).toBe('broke');
    expect(r.bestStage).toBe(DARK_STAGES);
    expect(r.bestTempo).toBe(100 + 4 * CLIMB_STEP);
  });

  it('without lights out or climb it is a set of a few rounds', () => {
    const r = play(startRun(['clean'], 90), Array(10).fill(true));
    expect(r.end).toBe('set');
    expect(r.held).toBe(PLAIN_ROUNDS);
  });

  it('never runs on for ever', () => {
    const r = play(startRun(['climb'], 40), Array(40).fill(true));
    expect(r.over).toBe(true);
    expect(r.rounds).toBeLessThanOrEqual(MAX_ROUNDS);
  });

  it('more dares and more held rounds are worth more, and a record needs a round that held', () => {
    const easy = play(startRun([], 100), [true, true]);
    const hard = play(startRun(['dark', 'clean', 'onetake'], 100), [true, true]);
    expect(hard.points).toBeGreaterThan(easy.points);
    expect(recordOf(play(startRun(['dark'], 100), [false]), 1, false)).toBeNull();
    const rec = recordOf(hard, 5, true);
    expect(beats(rec, undefined)).toBe(true);
    expect(beats(recordOf(easy, 6, false), rec!)).toBe(false);
  });

  it('says a record as a sentence', () => {
    expect(describeRecord({ dares: ['dark', 'climb', 'onetake'], stage: 3, tempo: 112, held: 4 })).toBe('in the dark · at 112 % · one take');
    expect(describeRecord({ dares: ['dark'], stage: 2, tempo: 100, held: 3 })).toBe('lights out 2/3 · at 100 %');
    expect(describeRecord({ dares: ['clean'], stage: 0, tempo: 90, held: 4 })).toBe('at 90 % · clean · 4 rounds');
    setLang('de');
    expect(describeRecord({ dares: ['dark', 'onetake'], stage: 3, tempo: 100, held: 4 })).toBe('im Dunkeln · bei 100 % · ein Take');
  });
});

describe('Dares: called chords', () => {
  it('deals the song\'s own chords anew, never the same three in a row, never the song\'s first chord first', () => {
    const bars = ['Am', 'Am', 'G', 'Am', 'C', 'Am', 'D', 'Am', 'Am', 'C', 'C', 'G', 'Am', 'G', 'G', 'Am'];
    for (let seed = 1; seed < 60; seed++) {
      const d = deal(bars, seeded(seed));
      expect(d).toHaveLength(bars.length);
      expect(d.every((c) => bars.includes(c))).toBe(true);
      expect(d[0]).not.toBe('Am');
      for (let i = 2; i < d.length; i++) expect(d[i] === d[i - 1] && d[i] === d[i - 2]).toBe(false);
    }
    expect(deal(bars, seeded(3))).toEqual(deal(bars, seeded(3)));
    expect(deal(['C', 'C'], seeded(1))).toEqual(['C', 'C']);
  });
});

describe('Five notes: judging a try', () => {
  const E4 = 64, F4 = 65, G4 = 67, C4 = 60, D4 = 62;
  const ode = [E4, E4, F4, G4, G4];

  it('marks notes in place, notes elsewhere, and notes not in the tune, counting repeats', () => {
    expect(judge([C4, D4, E4, F4, G4], ode)).toEqual(['no', 'no', 'in', 'in', 'gold']);
    expect(judge([E4, F4, G4, G4, F4], ode)).toEqual(['gold', 'in', 'in', 'gold', 'no']);
    expect(judge(ode, ode)).toEqual(['gold', 'gold', 'gold', 'gold', 'gold']);
    expect(solved(judge(ode, ode))).toBe(true);
    // a note counts only as often as the tune has it: one F, used up by the F in its place
    expect(judge([F4, F4, F4, C4, C4], ode)).toEqual(['no', 'no', 'gold', 'no', 'no']);
    // two Gs in the tune: two Gs out of place are both "in", a third is not
    expect(judge([G4, G4, G4, C4, C4], ode)).toEqual(['in', 'in', 'no', 'no', 'no']);
  });

  it('an octave lower or higher counts as the same note', () => {
    expect(judge([E4 - 12, E4 + 12, F4 - 12, G4, G4 - 12], ode)).toEqual(['gold', 'gold', 'gold', 'gold', 'gold']);
    expect(pitchClass(-1)).toBe(11);
  });

  it('sums up what is known after the tries', () => {
    const rows = [{ midis: [C4, D4, E4, F4, G4], marks: judge([C4, D4, E4, F4, G4], ode) }, { midis: [E4, F4, G4, G4, F4], marks: judge([E4, F4, G4, G4, F4], ode) }];
    const k = known(rows);
    expect(k.placed).toEqual([4, null, null, 7, 7]);
    expect(k.inside).toEqual([5]);
    expect(k.out.sort()).toEqual([0, 2]);
  });
});

describe('Five notes: the tunes', () => {
  it('opens Ode to Joy with E E F G G, and gives a song of chords its tune where the app has one', () => {
    expect(openingOf(findSong('ode-guitar'))?.midis).toEqual([64, 64, 65, 67, 67]);
    const tunes = tunesOf(allSongs());
    expect(tunes.length).toBeGreaterThan(20);
    for (const t of tunes) {
      expect(t.midis).toHaveLength(NOTES);
      expect(t.lens.every((l) => l >= 0.25 && l <= 1.5)).toBe(true);
      expect(new Set(t.midis.map(pitchClass)).size).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(tunes.map((t) => t.id)).size).toBe(tunes.length);
  });

  it('is the same all day, and goes through every tune before one comes back', () => {
    const tunes = tunesOf(allSongs());
    expect(tuneOfDay(tunes, 20400)?.id).toBe(tuneOfDay(tunes, 20400)?.id);
    const n = tunes.length;
    const start = Math.ceil(20400 / n) * n;
    const ids = Array.from({ length: n }, (_, k) => tuneOfDay(tunes, start + k)!.id);
    expect(new Set(ids).size).toBe(n);
    expect(tuneOfDay([], 1)).toBeNull();
  });

  it('allows six tries and two more hearings', () => {
    expect(TRIES).toBe(6);
    expect(HEARINGS).toBe(2);
  });
});

describe('Dares and Five notes: what is kept', () => {
  const memory = (): { getItem(k: string): string | null; setItem(k: string, v: string): void } => {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  };
  const backupOf = (fields: Record<string, unknown>): string => JSON.stringify({ app: 'noise-floor/v1', skills: {}, ...fields });

  it('a record and a day travel in a backup, and what is malformed is left out', () => {
    const s = new Store(memory());
    const ok = s.restore(
      backupOf({
        dares: {
          'guitar:scarborough-fair': { t: 5, points: 120, dares: ['dark', 'onetake', 'bogus'], stage: 3, tempo: 112, held: 4, take: true },
          'guitar:x': { t: 5, points: 'many' },
          'guitar:y': null,
        },
        fivenotes: {
          '20412': { id: 'ode-guitar', rows: [[64, 64, 65, 67, 67]], hears: 1, done: true },
          '20413': { id: '"><b>', rows: [], hears: 0, done: false },
          '20414': { id: 'ode-guitar', rows: [['E']], hears: 1, done: false },
        },
      }),
    );
    expect(ok).toBe(true);
    expect(s.dares['guitar:scarborough-fair']).toEqual({ t: 5, points: 120, dares: ['dark', 'onetake'], stage: 3, tempo: 112, held: 4, take: true });
    expect(Object.keys(s.dares)).toEqual(['guitar:scarborough-fair']);
    expect(Object.keys(s.fivenotes)).toEqual(['20412']);
    // and back out again
    const again = new Store(memory());
    expect(again.restore(s.backup())).toBe(true);
    expect(again.fivenotes['20412'].rows).toEqual([[64, 64, 65, 67, 67]]);
    expect(again.dares['guitar:scarborough-fair'].tempo).toBe(112);
  });

  it('a store without them starts empty', () => {
    const s = new Store(memory());
    expect(s.dares).toEqual({});
    expect(s.fivenotes).toEqual({});
  });
});
