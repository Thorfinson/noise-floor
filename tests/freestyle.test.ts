import { describe, expect, it } from 'vitest';
import type { ChordEvent, NoteEvent } from '../src/audio/listener';
import { FLOOR, Freestyle, NOTE_POINTS, POCKET, QUICK, REPORT, REST_BEATS, SPOTS, spotOf, STALE, strumOf, sureNote, TRICK_POINTS, TRICKS, worth, type FreeNews, type FreeOptions, type Trick } from '../src/game/freestyle';

const NIGHT = SPOTS[0];
const BEAT = 60 / NIGHT.bpm;
const OPEN = [40, 45, 50, 55, 59, 64];
/** the note on a string (0 is the low E string) at a fret */
const on = (s: number, f = 0): number => OPEN[s] + f;
/** A run whose first beat sounds at 10 s. */
function started(o: FreeOptions = {}, spot = NIGHT): Freestyle {
  const g = new Freestyle(spot, o);
  g.start(10);
  return g;
}
const at = (beat: number, beatLen = BEAT): number => 10 + beat * beatLen;
/** Plays notes on the beats given, each as [beat, string, fret]. */
function play(g: Freestyle, notes: [number, number, number?][]): void {
  for (const [b, s, f] of notes) g.note(on(s, f ?? 0), at(b));
}
/** Lets the line rest until it is banked. */
function rest(g: Freestyle, afterBeat: number): void {
  g.update(at(afterBeat + REST_BEATS) + REPORT + 0.01);
}
const tricksOf = (g: Freestyle): Trick[] => g.news.filter((n): n is Extract<FreeNews, { type: 'trick' }> => n.type === 'trick').map((n) => n.trick);
const news = <K extends FreeNews['type']>(g: Freestyle, type: K): Extract<FreeNews, { type: K }>[] => g.news.filter((n): n is Extract<FreeNews, { type: K }> => n.type === type);

describe('freestyle: the spots', () => {
  it('every open string is a note of the scale, and the box holds twelve different notes of it', () => {
    for (const spot of SPOTS) {
      for (const m of OPEN) expect(spot.scale).toContain(m % 12);
      expect(new Set(spot.box.map((p) => p.m)).size).toBe(12);
      for (const p of spot.box) {
        expect(spot.scale).toContain(p.m % 12);
        expect(p.m).toBe(OPEN[p.s] + p.f);
        expect(p.f).toBeLessThanOrEqual(3);
      }
      expect(spot.scale).toContain(spot.root);
      expect(spot.chords).toHaveLength(4);
    }
  });
  it('a spot is found by its name, and the first one stands in for an unknown one', () => {
    expect(spotOf('harbour').id).toBe('harbour');
    expect(spotOf('nowhere')).toBe(SPOTS[0]);
    expect(spotOf(undefined)).toBe(SPOTS[0]);
  });
  it('every trick has its points', () => {
    for (const t of TRICKS) expect(TRICK_POINTS[t]).toBeGreaterThan(0);
  });
});

describe('freestyle: a line', () => {
  it('four open strings in a row are an arpeggio, a jump over a string is a skip, and the E on the beat lands it clean', () => {
    const g = started();
    play(g, [[4, 1], [5, 2], [6, 3], [7, 4], [8, 2, 2]]);
    expect(tricksOf(g)).toEqual(['arpeggio', 'skip']);
    expect(g.line!.set.size).toBe(2);
    expect(worth(g.line!)).toBe((5 * NOTE_POINTS + 60 + 40) * 2);
    expect(g.score).toBe(0);
    rest(g, 8);
    // two different tricks, and one more for the clean landing
    expect(g.score).toBe(450);
    expect(g.line).toBeNull();
    const [l] = news(g, 'landed');
    expect(l.landed).toMatchObject({ total: 450, mult: 3, clean: true, loose: false });
    expect(g.sky).toHaveLength(1);
    expect(g.best).toBe(g.sky[0]);
    expect([...g.landedTricks].sort()).toEqual(['arpeggio', 'skip']);
  });

  it('nothing is banked before two beats of rest have passed and a late note could have been reported', () => {
    const g = started();
    play(g, [[0, 0], [1, 1], [2, 2, 2]]);
    expect(g.resting(at(2))).toBe(0);
    expect(g.resting(at(3))).toBeCloseTo(0.5, 5);
    g.update(at(2 + REST_BEATS) + REPORT - 0.02);
    expect(g.line).not.toBeNull();
    expect(g.resting(at(2 + REST_BEATS) + 0.1)).toBe(1);
    g.update(at(2 + REST_BEATS) + REPORT + 0.01);
    expect(g.line).toBeNull();
    expect(g.score).toBeGreaterThan(0);
  });

  it('a note played just inside the rest and reported a fifth of a second later still belongs to the line', () => {
    const g = started();
    play(g, [[0, 1], [1, 2]]);
    // time passes to just after the two beats; the note that fell at 1.9 beats of rest is only reported now
    g.update(at(1 + REST_BEATS) + 0.1);
    g.note(on(3), at(1 + 1.9));
    expect(g.line!.ev).toHaveLength(3);
    expect(g.sky).toHaveLength(0);
  });

  it('a note after the rest starts a new line and banks the old one, even before the clock was looked at', () => {
    const g = started();
    play(g, [[0, 1], [1, 2, 2]]);
    g.note(on(3), at(1 + REST_BEATS + 0.5));
    expect(g.sky).toHaveLength(1);
    expect(g.sky[0].at).toBeCloseTo(at(1 + REST_BEATS), 5);
    expect(g.line!.ev).toHaveLength(1);
  });

  it('one note is not a line', () => {
    const g = started();
    play(g, [[0, 0]]);
    rest(g, 0);
    expect(g.score).toBe(0);
    expect(g.sky).toHaveLength(0);
    expect(g.news.some((n) => n.type === 'landed')).toBe(false);
  });

  it('ending anywhere but on the root banks half, and never clean', () => {
    const g = started();
    play(g, [[0, 0], [1, 2], [2, 4], [3, 1]]);
    const before = worth(g.line!);
    rest(g, 3);
    expect(g.sky[0]).toMatchObject({ loose: true, clean: false, total: Math.round(before * 0.5) });
  });

  it('the root off the beat lands the line in full, without the extra for a clean landing', () => {
    const g = started();
    play(g, [[0, 1], [1, 3], [1.5, 2, 2]]);
    const l = g.line!;
    rest(g, 1.5);
    expect(g.sky[0]).toMatchObject({ loose: false, clean: false, mult: l.set.size, total: worth(l) });
  });

  it('in the second spot a line lands on G', () => {
    const g = started({}, SPOTS[1]);
    const b = 60 / SPOTS[1].bpm;
    g.note(on(1), at(0, b));
    g.note(on(2), at(1, b));
    g.note(on(3), at(2, b));
    g.update(at(2 + REST_BEATS, b) + REPORT + 0.01);
    expect(g.sky[0]).toMatchObject({ clean: true, loose: false });
  });
});

describe('freestyle: the tricks', () => {
  it('four neighbours of the scale in one direction are a run, and not an arpeggio as well', () => {
    const g = started();
    // D, E on the D string, G, A on the G string: one step of the scale each
    play(g, [[0, 2], [1, 2, 2], [2, 3], [3, 3, 2]]);
    expect(tricksOf(g)).toEqual(['run']);
    // three more and it counts again
    play(g, [[4, 4], [5, 4, 3], [6, 5]]);
    expect(tricksOf(g)).toEqual(['run', 'run']);
  });

  it('the same note an octave away is an octave, whatever strings it crosses', () => {
    const g = started();
    play(g, [[0, 0], [1, 2, 2]]);
    expect(tricksOf(g)).toEqual(['octave']);
  });

  it('the same note three times is a stutter', () => {
    const g = started();
    play(g, [[0, 3], [1, 3], [2, 3]]);
    expect(tricksOf(g)).toEqual(['stutter']);
  });

  it('two notes on one string closer together than a hand plucks are a hammer-on going up and a pull-off going down', () => {
    const g = started();
    g.note(on(2), at(0));
    g.note(on(2, 2), at(0) + QUICK - 0.05);
    g.note(on(3, 2), at(1));
    g.note(on(3), at(1) + QUICK - 0.05);
    expect(tricksOf(g)).toEqual(['hammer', 'pull']);
    expect(g.line!.ev.map((e) => !!e.slur)).toEqual([false, true, false, true]);
    // a note that was not plucked has no moment of its own: it neither shakes nor steadies
    expect(g.line!.ev[1].inTime).toBeNull();
    expect(g.wobble).toBe(0);
  });

  it('the same two notes a beat apart were both plucked', () => {
    const g = started();
    play(g, [[0, 2], [1, 2, 2]]);
    expect(tricksOf(g)).toEqual([]);
    expect(g.line!.ev[1].slur).toBe(false);
  });

  it('four plucked notes in eighths are double time', () => {
    const g = started();
    play(g, [[0, 0], [0.5, 1], [1, 0], [1.5, 1]]);
    expect(tricksOf(g)).toContain('double');
  });

  it('a note on the "and" after a silent beat is a push', () => {
    const g = started();
    play(g, [[0, 0], [1.5, 1]]);
    expect(tricksOf(g)).toEqual(['push']);
  });

  it('the low E and the high e string in one line are low to high, once', () => {
    const g = started();
    play(g, [[0, 0], [1, 5], [2, 0], [3, 5]]);
    expect(tricksOf(g).filter((t) => t === 'span')).toHaveLength(1);
    rest(g, 3);
    expect(g.goals[2]).toBe(true);
  });

  it('a hit on muted strings and a strummed chord are tricks, and a line may end on the strum', () => {
    const g = started();
    g.chk(at(0));
    g.chk(at(1));
    g.note(on(2), at(2));
    g.stab('Em', at(3));
    expect(tricksOf(g)).toEqual(['chk', 'chk', 'stab']);
    const before = worth(g.line!);
    rest(g, 3);
    expect(g.sky[0]).toMatchObject({ loose: false, clean: false, total: before });
  });

  it('a hit on muted strings that is reported after the next note goes where it was played', () => {
    const g = started();
    g.note(on(0), at(0));
    g.note(on(1), at(1.5));
    g.chk(at(1));
    expect(g.line!.ev.map((e) => e.kind)).toEqual(['note', 'chk', 'note']);
    expect(g.line!.ev[1].inTime).toBe(true);
  });

  it('a trick done again in the same run is worth less each time, down to a floor', () => {
    const g = started();
    for (let i = 0; i < 8; i++) g.chk(at(i * 4));
    const pts = news(g, 'trick').map((n) => n.points);
    expect(pts[0]).toBe(TRICK_POINTS.chk);
    expect(pts[1]).toBe(Math.round((TRICK_POINTS.chk * (1 - STALE)) / 5) * 5);
    expect(pts[7]).toBe(Math.round((TRICK_POINTS.chk * FLOOR) / 5) * 5);
    for (let i = 1; i < pts.length; i++) expect(pts[i]).toBeLessThanOrEqual(pts[i - 1]);
  });

  it('different tricks multiply: the worth of a line is its points times their number', () => {
    const g = started();
    g.stab('Em', at(0));
    g.chk(at(1));
    play(g, [[2, 1], [3, 3]]);
    const l = g.line!;
    expect([...l.set].sort()).toEqual(['chk', 'skip', 'stab']);
    expect(worth(l)).toBe((2 * NOTE_POINTS + 50 + 20 + 40) * 3);
  });
});

describe('freestyle: the pocket', () => {
  it('notes that fall now early, now late shake the line until it is lost with everything in it', () => {
    const g = started();
    const off = POCKET + 0.06;
    let k = 0;
    while (g.line || k === 0) {
      g.note(on(k % 6), at(k) + (k % 2 ? off : -off));
      k++;
      expect(k).toBeLessThan(12);
    }
    const [lost] = news(g, 'lost');
    expect(lost.points).toBeGreaterThan(0);
    expect(g.score).toBe(0);
    expect(g.lost).toBe(1);
    expect(g.wobble).toBe(0);
    rest(g, k);
    expect(g.sky).toHaveLength(0);
  });

  it('notes on the beat steady a line that shook', () => {
    const g = started();
    g.note(on(0), at(0));
    g.note(on(1), at(1) + POCKET + 0.07);
    const shaken = g.wobble;
    expect(shaken).toBeGreaterThan(0);
    g.note(on(2), at(2));
    expect(g.wobble).toBeLessThan(shaken);
    expect(g.line!.ev.map((e) => e.inTime)).toEqual([true, false, true]);
  });

  it('a steady habit of playing a little late is learned, not punished', () => {
    const g = started();
    for (let k = 0; k < 16; k++) g.note(on(k % 6), at(k) + POCKET + 0.02);
    expect(g.line).not.toBeNull();
    expect(g.line!.ev.slice(4).every((e) => e.inTime)).toBe(true);
    expect(g.bias).toBeGreaterThan(0.05);
  });

  it('the way through speaker and microphone is taken off before a note is judged', () => {
    const g = started({ lat: 0.15 });
    g.note(on(0), at(0) + 0.15);
    g.note(on(1), at(1) + 0.15);
    expect(g.line!.ev.map((e) => e.inTime)).toEqual([true, true]);
    expect(g.line!.ev[1].t).toBeCloseTo(at(1), 5);
    expect(g.line!.ev[1].step).toBe(2);
  });

  it('a clearly heard note outside the scale shakes the line, and two of them lose it; an uncertain one is ignored', () => {
    const g = started();
    play(g, [[0, 0], [1, 1]]);
    g.note(on(0, 1), at(2), false);
    expect(g.wobble).toBe(0);
    g.note(on(0, 1), at(2));
    expect(g.wobble).toBeGreaterThan(0);
    expect(g.line!.ev).toHaveLength(2);
    expect(news(g, 'clam')).toHaveLength(1);
    g.note(on(1, 1), at(3));
    expect(g.line).toBeNull();
    expect(news(g, 'lost')).toHaveLength(1);
  });

  it('a wrong note with no line alive costs nothing', () => {
    const g = started();
    g.note(on(0, 1), at(0));
    expect(g.wobble).toBe(0);
    expect(g.news).toHaveLength(0);
  });
});

describe('freestyle: a run', () => {
  it('nothing counts before the first beat', () => {
    const g = started();
    g.note(on(0), at(-2));
    g.chk(at(-1));
    expect(g.line).toBeNull();
    const idle = new Freestyle(NIGHT);
    idle.note(on(0), 5);
    expect(idle.line).toBeNull();
  });

  it('when the time is up, the run is over once no line is alive', () => {
    const g = started({ seconds: 8 * BEAT });
    expect(g.timeLeft(at(2))).toBeCloseTo(6 * BEAT, 5);
    play(g, [[0, 1], [1, 2, 2]]);
    rest(g, 1);
    g.update(at(8) + REPORT - 0.02);
    expect(g.over).toBe(false);
    g.update(at(8) + REPORT + 0.01);
    expect(g.over).toBe(true);
    expect(news(g, 'over')).toHaveLength(1);
    // and nothing more is taken
    g.note(on(0), at(9));
    expect(g.line).toBeNull();
    expect(g.timeLeft(at(20))).toBe(0);
  });

  it('a line that is alive when the time runs out may still be landed', () => {
    const g = started({ seconds: 8 * BEAT });
    play(g, [[6, 1], [7, 2], [8.5, 3], [9, 2, 2]]);
    g.update(at(9.5));
    expect(g.over).toBe(false);
    rest(g, 9);
    expect(g.sky).toHaveLength(1);
    g.update(at(9 + REST_BEATS) + REPORT + 0.02);
    expect(g.over).toBe(true);
    // but no new line begins after the end
    const h = started({ seconds: 8 * BEAT });
    h.note(on(0), at(8.6));
    expect(h.line).toBeNull();
  });

  it('a line that goes on and on after the end is ended as it stands', () => {
    const g = started({ seconds: 4 * BEAT });
    for (let k = 3; k < 20 && !g.over; k++) {
      g.note(on(k % 6), at(k));
      g.update(at(k) + 0.05);
    }
    expect(g.over).toBe(true);
    expect(g.sky).toHaveLength(1);
  });

  it('the goals of the spot: the score, a line of enough different tricks, low to high', () => {
    const g = started();
    expect(g.goals).toEqual([false, false, false]);
    g.stab('Em', at(0));
    g.chk(at(1));
    play(g, [[2, 0], [3, 2, 2], [4, 5], [5, 2, 2]]);
    expect(g.line!.set.size).toBeGreaterThanOrEqual(NIGHT.goalTricks);
    rest(g, 5);
    expect(g.goals[1]).toBe(true);
    expect(g.goals[2]).toBe(true);
    expect(g.goals[0]).toBe(g.score >= NIGHT.goalScore);
  });

  it('the band plays one chord to a bar, round and round', () => {
    const g = started();
    expect([0, 4, 8, 12, 16].map((b) => g.chordAt(at(b) + 0.01))).toEqual(['Em', 'Em', 'G', 'D', 'Em']);
  });

  it('after a pause everything that has a time moves on with it', () => {
    const g = started();
    play(g, [[0, 1], [1, 2]]);
    g.resumed(30);
    expect(g.t0).toBe(40);
    g.note(on(3), at(2) + 30);
    expect(g.line!.ev).toHaveLength(3);
    expect(g.line!.ev.map((e) => e.step)).toEqual([0, 2, 4]);
    expect(g.line!.ev.every((e) => e.inTime)).toBe(true);
  });
});

describe('freestyle: what was heard', () => {
  const note = (conf: number, margin = 2): NoteEvent => ({ time: 1, midi: 52, conf, margin, second: null, level: 0.1, ring: 0.9, held: -1 });
  const chord = (best: string | null, score: number): ChordEvent => ({ time: 1, best, score, margin: 0.2, sims: best ? { [best]: score } : {} });
  it('a chord of the groove that fits, with no single note explaining the onset, is a strum', () => {
    expect(strumOf(undefined, chord('Em', 0.8), ['Em', 'G', 'D'])).toBe('Em');
    expect(strumOf(note(0.4), chord('G', 0.7), ['Em', 'G', 'D'])).toBe('G');
  });
  it('a single note the listener is sure of is not a strum, even where a chord would fit', () => {
    expect(strumOf(note(0.69), chord('D', 0.87), ['Em', 'G', 'D'])).toBeNull();
    expect(strumOf(note(0.9), chord('Em', 0.9), ['Em', 'G', 'D'])).toBeNull();
  });
  it('a chord outside the groove, or one that fits badly, is not a strum', () => {
    expect(strumOf(undefined, chord('C', 0.9), ['Em', 'G', 'D'])).toBeNull();
    expect(strumOf(undefined, chord('Em', 0.5), ['Em', 'G', 'D'])).toBeNull();
    expect(strumOf(undefined, undefined, ['Em'])).toBeNull();
  });
  it('only a note heard for sure counts against the line', () => {
    expect(sureNote(note(0.95, 2))).toBe(true);
    expect(sureNote(note(0.7, 2))).toBe(false);
    expect(sureNote(note(0.95, 1.1))).toBe(false);
  });
});
