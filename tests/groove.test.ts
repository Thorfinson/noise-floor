import { describe, expect, it } from 'vitest';
import { fadeFor, FADE_OUT, Groove, LAYER_AT, layerGains, layerOf, MIN_WIND, type GrooveOptions } from '../src/game/groove';
import { NIGHT_RULES, nightDate, nightLog, nightRule, nightSeed, noteNight, seeded } from '../src/game/night';
import { chordBoss } from '../src/game/run';
import { HEARD_AFTER } from '../src/game/stride';

const base = (o: Partial<GrooveOptions> = {}): GrooveOptions => ({
  chords: ['C', 'G', 'Am', 'Em'],
  pairKey: (a, b) => `pair:${[a, b].sort().join('>')}`,
  pairLabel: (a, b) => `${a} → ${b}`,
  weight: () => 1,
  rng: seeded(7),
  bpm: 60,
  beatsPerBar: 4,
  waves: 3,
  lat: 0,
  ...o,
});

/** A run at 60 beats a minute whose first wave starts at 10 s: a beat is a second, beat k sounds at 10 + k. */
function started(o: Partial<GrooveOptions> = {}): Groove {
  const g = new Groove(base(o));
  g.start(10);
  return g;
}

/** Strikes whatever piece is next, played exactly on beat k and heard a fifth of a second later. */
function strikeNext(g: Groove, k: number, late = 0.2): boolean {
  const t = 10 + k;
  g.update(t + late);
  const n = g.next(t + late);
  return !!n && g.chord(n.chord, t, t + late);
}

describe('the groove: choosing the target', () => {
  it('a strummed chord strikes the piece that wears it, whichever it is', () => {
    const g = started();
    g.update(12.1);
    const [a, b] = g.drifting();
    expect(a && b).toBeTruthy();
    expect(a.chord).not.toBe(b.chord);
    // the one further back is chosen by playing its chord
    expect(g.chord(b.chord, 12.0, 12.2)).toBe(true);
    expect(b.state).toBe('struck');
    expect(a.state).toBe('drift');
  });

  it('never has two pieces with the same chord on the water, in flight included', () => {
    const g = started({ waves: 1 });
    for (let k = 0; k < 70; k++) {
      g.update(10 + k + 0.2);
      const live = g.pieces.filter((p) => p.state !== 'landed').map((p) => p.chord);
      expect(new Set(live).size).toBe(live.length);
      // strike one every other beat, so that some are in flight while new ones come
      if (k % 2 === 0) strikeNext(g, k);
    }
  });

  it('a chord no piece wears is a miss; the chord just played, strummed on, is not', () => {
    const g = started();
    g.update(12.1);
    const first = g.drifting()[0];
    g.chord(first.chord, 12.0, 12.2);
    const misses = g.misses;
    // strumming on with the same chord through the bar costs nothing
    g.chord(first.chord, 13.0, 13.2);
    expect(g.misses).toBe(misses);
    // a chord that is nowhere on the water is a miss
    const absent = ['C', 'G', 'Am', 'Em', 'D'].find((c) => !g.pieces.some((p) => p.chord === c) && c !== first.chord)!;
    g.chord(absent, 14.0, 14.2);
    expect(g.misses).toBe(misses + 1);
  });

  it('a strum during the count before the wave is not part of it', () => {
    const g = new Groove(base());
    g.start(10);
    const p = g.drifting()[0];
    expect(g.chord(p.chord, 8.5, 8.7)).toBe(false);
    expect(p.state).toBe('drift');
  });
});

describe('the groove: landing on the beat', () => {
  it('a strum on the beat, heard 0.2 s late, strikes on the next beat and counts as in time', () => {
    const g = started();
    g.update(12.2);
    const p = g.drifting()[0];
    expect(g.chord(p.chord, 12.0, 12.2)).toBe(true);
    expect(p.strikeAt).toBeCloseTo(13, 6);
    expect(p.inTime).toBe(true);
    const ev = g.events.find((e) => e.type === 'strike');
    expect(ev && ev.type === 'strike' && ev.at).toBeCloseTo(13, 6);
  });

  it('the strike is never sooner than the bolt can fly: a report just before a beat strikes on the one after', () => {
    const g = started();
    g.update(12.95);
    const p = g.drifting()[0];
    g.chord(p.chord, 12.75, 12.95);
    expect(p.strikeAt - 12.95).toBeGreaterThanOrEqual(MIN_WIND);
    expect(p.strikeAt).toBeCloseTo(14, 6);
    // played a quarter beat before beat 13: in the window, which is wide
    expect(p.inTime).toBe(true);
  });

  it('a strum half-way between two beats is struck all the same, but not in time', () => {
    const g = started();
    g.update(12.7);
    const p = g.drifting()[0];
    expect(g.chord(p.chord, 12.5, 12.7)).toBe(true);
    expect(p.inTime).toBe(false);
    expect(p.strikeAt).toBeCloseTo(13, 6);
  });

  it('timing is judged after the round trip, and the allowance follows a player who is always late, slowly and not far', () => {
    const g = started({ lat: 0.1 });
    // played 0.1 s after the beat is right on the beat for this microphone
    g.update(12.3);
    const p = g.drifting()[0];
    g.chord(p.chord, 12.1, 12.3);
    expect(p.inTime).toBe(true);
    expect(Math.abs(g.offsets[0])).toBeLessThan(1e-9);
    // a player always 0.15 s behind that
    const h = started({ lat: 0.1, waves: 1 });
    for (let k = 2; k < 40; k += 2) {
      h.update(10 + k + 0.45);
      const n = h.next(10 + k + 0.45);
      if (n) h.chord(n.chord, 10 + k + 0.25, 10 + k + 0.45);
    }
    expect(h.lat).toBeGreaterThan(0.12);
    expect(h.lat).toBeLessThanOrEqual(0.22 + 1e-9);
  });

  it('a piece at the lamp waits for the report of a strum played just before it arrived', () => {
    const g = started({ waves: 1 });
    const p = g.drifting()[0];
    const arrives = p.born + p.travel;
    // the strum came just before the piece reached the lamp; it is heard after
    g.update(arrives + 0.15);
    expect(p.state).toBe('drift');
    expect(g.integrity).toBe(3);
    expect(g.chord(p.chord, arrives - 0.05, arrives + 0.15)).toBe(true);
    // without a strum it lands once the report could no longer come
    const q = g.drifting()[0];
    g.update(q.born + q.travel + HEARD_AFTER + 0.01);
    expect(q.state).toBe('landed');
    expect(g.integrity).toBe(2);
  });
});

describe('the groove: the band as reward and life', () => {
  it('layers come in at the chain thresholds: drums from the start, bass at 4, keys at 8, lead at 16', () => {
    expect(LAYER_AT).toEqual([0, 4, 8, 16]);
    expect([0, 3, 4, 7, 8, 15, 16, 40].map(layerOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(layerGains(0)).toEqual({ drums: 1, bass: 0, keys: 0, lead: 0 });
    expect(layerGains(2)).toEqual({ drums: 1, bass: 1, keys: 1, lead: 0 });
    expect(layerGains(3)).toEqual({ drums: 1, bass: 1, keys: 1, lead: 1 });
  });

  it('a beginner hears the band grow within the first minute: a hit every three seconds brings in bass and keys', () => {
    const g = started({ bpm: 60, waves: 1 });
    for (let k = 0; k < 60; k += 3) strikeNext(g, k);
    expect(g.level).toBeGreaterThanOrEqual(2);
  });

  it('a miss lets the top layer fade out over a second and a half; the drums never go', () => {
    const g = started({ waves: 1 });
    for (let k = 0; k < 40 && g.level < 3; k += 2) strikeNext(g, k);
    expect(g.level).toBe(3);
    g.events = [];
    g.update(50.2);
    const absent = ['C', 'G', 'Am', 'Em', 'D', 'F'].find((c) => !g.pieces.some((p) => p.chord === c && p.state !== 'landed'))!;
    g.chord(absent, 50, 50.2);
    const drop = g.events.find((e) => e.type === 'layers');
    expect(drop).toEqual({ type: 'layers', level: 2, before: 3 });
    expect(fadeFor(3, 2)).toBe(FADE_OUT);
    expect(FADE_OUT).toBeCloseTo(1.5);
    expect(g.chain).toBe(LAYER_AT[2]);
    // many misses: down to the drums, and no further
    for (let i = 0; i < 6; i++) g.chord(absent, 51 + i, 51.2 + i);
    expect(g.level).toBe(0);
    expect(layerGains(g.level).drums).toBe(1);
  });

  it('a piece reaching the lamp takes a light and a layer; three put the light out', () => {
    const g = started({ waves: 1 });
    for (let t = 10; t < 200 && g.state === 'playing'; t += 0.25) g.update(t);
    expect(g.state).toBe('over');
    expect(g.integrity).toBe(0);
  });
});

describe('the groove: measuring changes as before', () => {
  it('consecutive clean chords make changes of their pair; four of them are a measurement in changes a minute', () => {
    const g = started({ chords: ['C', 'G'], waves: 1 });
    // one strike every two beats, alternating C and G: four changes of C→G or G→C, two seconds each
    for (let k = 0; k < 12; k += 2) strikeNext(g, k);
    const m = g.events.filter((e) => e.type === 'measure');
    expect(m.length).toBeGreaterThanOrEqual(1);
    expect(m[0]).toEqual({ type: 'measure', key: 'pair:C>G', value: 30 });
  });

  it('a change with a miss between is not measured', () => {
    const g = started({ chords: ['C', 'G'], waves: 1 });
    strikeNext(g, 0);
    g.update(11.2);
    g.chord('D', 11, 11.2);
    strikeNext(g, 2);
    const s = g.pairs.get('pair:C>G')!;
    expect(s.sent).toBe(1);
    expect(s.cleared).toBe(0);
  });

  it('what was begun still counts at the end: two clean changes are a measurement', () => {
    const g = started({ chords: ['C', 'G'], waves: 1 });
    for (let k = 0; k < 6; k += 2) strikeNext(g, k);
    const left = g.leftovers();
    expect(left).toEqual([{ key: 'pair:C>G', value: 30 }]);
    expect(g.measurements()).toEqual([{ key: 'pair:C>G', value: 30 }]);
  });

  it('the boss measures its chord as the runs do', () => {
    const g = started({ waves: 1, chords: ['C', 'G'], boss: chordBoss('C') });
    for (let t = 10; t < 400 && g.state === 'playing'; t += 0.5) {
      g.update(t);
      const n = g.next(t);
      if (n) g.chord(n.chord, t - 0.2, t);
    }
    expect(g.state).toBe('boss');
    for (let i = 0; i < 5; i++) g.bossString('clean', 400 + i);
    expect(g.state).toBe('won');
    expect(g.measurements().find((m) => m.key === 'chord:C')).toEqual({ key: 'chord:C', value: 4, strings: 6 });
  });
});

describe('the groove: tempo between waves', () => {
  it('goes up after a wave of early, clean hits, and says once that it settled', () => {
    const g = started({ waves: 3, bpm: 72 });
    // strike each piece as soon as it is there: all early
    for (let t = 10; t < 200 && g.state === 'playing'; t += 0.25) {
      g.update(t);
      const n = g.next(t);
      if (n && t - n.born > 0.5) g.chord(n.chord, t - 0.2, t);
    }
    expect(g.state).toBe('perk');
    expect(g.bpm).toBe(78);
    const tempo = g.events.filter((e) => e.type === 'tempo');
    expect(tempo[tempo.length - 1]).toMatchObject({ type: 'tempo', bpm: 78, before: 72, settled: false });
  });

  it('changes nothing while a wave plays: the grid stays the same until the next wave starts', () => {
    const g = started({ bpm: 66 });
    const beat = g.beat;
    for (let k = 0; k < 20; k += 2) strikeNext(g, k);
    expect(g.beat).toBe(beat);
  });
});

describe('the night: the same all day', () => {
  it('the seed, the rule and the order of pieces depend on the day alone', () => {
    const day = 20412;
    expect(nightSeed(day)).toBe(nightSeed(day));
    expect(nightRule(day).id).toBe(nightRule(day).id);
    const a = new Groove(base({ rng: seeded(nightSeed(day)), rule: nightRule(day).id }));
    const b = new Groove(base({ rng: seeded(nightSeed(day)), rule: nightRule(day).id }));
    expect(a.queue.slice(0, 50)).toEqual(b.queue.slice(0, 50));
    const c = new Groove(base({ rng: seeded(nightSeed(day + 1)) }));
    expect(c.queue.slice(0, 50)).not.toEqual(a.queue.slice(0, 50));
  });

  it('a week brings more than one rule, never the same two nights running, and only fair ones', () => {
    const ids = Array.from({ length: 14 }, (_, i) => nightRule(20400 + i).id);
    expect(new Set(ids).size).toBeGreaterThan(2);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    // without chords from outside the song the mixed night is not drawn
    for (let i = 0; i < 30; i++) expect(nightRule(20400 + i, (id) => id !== 'mixed').id).not.toBe('mixed');
    expect(NIGHT_RULES.length).toBeGreaterThanOrEqual(4);
  });

  it('two retries of a night meet the same pieces in the same order when played the same', () => {
    const play = (): string[] => {
      const g = started({ rng: seeded(nightSeed(20412)), waves: 1 });
      const seen: string[] = [];
      for (let k = 0; k < 40; k += 2) {
        g.update(10 + k + 0.2);
        for (const p of g.pieces) if (!seen.includes(`${p.id}:${p.chord}`)) seen.push(`${p.id}:${p.chord}`);
        strikeNext(g, k);
      }
      return seen;
    };
    expect(play()).toEqual(play());
  });

  it('is named by its date in either language', () => {
    // 20 November 2026 is day 20412 counted from 1 January 1970
    expect(nightDate(20412, 'de')).toBe('20. November');
    expect(nightDate(20412, 'en')).toBe('November 20');
  });

  it('keeps the best of the day and a short log of the nights before, only the player\'s own', () => {
    const progress: Record<string, number> = {};
    expect(noteNight(progress, 20410, { score: 900, level: 2, held: false }).best).toBe(true);
    expect(noteNight(progress, 20412, { score: 1200, level: 1, held: false }).best).toBe(true);
    expect(noteNight(progress, 20412, { score: 800, level: 3, held: true }).best).toBe(false);
    const log = nightLog(progress, 20412);
    expect(log).toEqual([
      { day: 20412, best: 1200, tries: 2, level: 3, held: true },
      { day: 20410, best: 900, tries: 1, level: 2, held: false },
    ]);
    // a month later the old nights are let go
    noteNight(progress, 20450, { score: 10, level: 0, held: false });
    expect(nightLog(progress, 20450).map((e) => e.day)).toEqual([20450]);
  });
});

describe('the groove of a song', () => {
  it('is its first part, at most eight bars, its chords in order; a picked song is strummed once a beat', async () => {
    const { grooveOf } = await import('../src/game/groove');
    const { SONGS } = await import('../src/music/content');
    const picked = grooveOf(SONGS.find((s) => s.id === 'scarborough-fair')!)!;
    expect(picked.bars.length).toBeLessThanOrEqual(8);
    expect(picked.chords[0]).toBe('Am');
    expect(picked.bars.every((b) => b.notes.length === picked.beatsPerBar && b.notes.every((n) => n.strum))).toBe(true);
    // a song in parts: its verse alone
    const clementine = grooveOf(SONGS.find((s) => s.id === 'clementine')!)!;
    expect(clementine.bars.length).toBe(8);
    expect(clementine.beatsPerBar).toBe(3);
    expect(clementine.units).toBe(8 * 3 * clementine.unitsPerBeat);
    // the band's chords begin where the strums change chord
    expect(clementine.band[0]).toEqual({ u: 0, id: 'G' });
    // a melody has no chords: no groove of its own
    expect(grooveOf(SONGS.find((s) => s.id === 'ode-guitar')!)).toBeNull();
  });
});
