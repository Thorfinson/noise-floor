import { makeWalk, PATTERNS, Walk } from '../src/game/stride';
import { changeTip, CHORDS } from '../src/music/theory';
import { pieceProfile, songProfile } from '../src/music/difficulty';
import { MuteGesture } from '../src/game/gesture';
import { describe, expect, it } from 'vitest';
import { allSongs, basicVersion, CHORD_PAIRS, PIANO_PIECES, SONGS, songLines, midiToTab, tabMidi } from '../src/music/content';
import { chordBoss, LAND_Y, poolFor, Run, scaleBoss, type Foe } from '../src/game/run';
import { levelFor, Skills } from '../src/core/skills';
import { Store } from '../src/core/store';
import { nextTempo, Take } from '../src/core/playalong';
import { parseNotes, parseTab } from '../src/music/import';

/** deterministic random numbers */
function seeded(seed = 1): () => number {
  let a = seed;
  return () => ((a = (a * 16807) % 2147483647) - 1) / 2147483646;
}

const flat = () => 1;
const wants = (f: Foe): number => f.phrase.midis[f.hit][0];

/** Plays whatever the locked noise wants, one hit every `every` seconds, until the run leaves the playing state. */
function playPerfectly(run: Run, every = 0.3, limit = 600, held = -1): void {
  let since = 0;
  for (let t = 0; t < limit && run.state === 'playing'; t += 0.05) {
    run.update(0.05);
    since += 0.05;
    const f = run.locked();
    if (f && since >= every) {
      since = 0;
      if (f.phrase.kind === 'chg') run.chord(Run.target(f), run.time);
      else run.note(wants(f), run.time, held);
    }
  }
}

/** A song picked over its chords: its bars are the phrases of a song run. */
const PICKED = SONGS.find((s) => s.id === 'greensleeves-chords')!;

describe('a run', () => {
  it('clears a wave when every phrase is played, then offers three upgrades', () => {
    const run = new Run('song', poolFor('song', PICKED), flat, { speed: 70, rng: seeded() });
    playPerfectly(run);
    expect(run.state).toBe('perk');
    expect(run.offered.length).toBe(3);
    expect(run.integrity).toBe(3);
    expect(run.score).toBeGreaterThan(0);
    const sent = [...run.stats.values()].reduce((a, s) => a + s.sent, 0);
    const cleared = [...run.stats.values()].reduce((a, s) => a + s.cleared, 0);
    expect(sent).toBe(5);
    expect(cleared).toBe(5);
  });

  it('goes through all waves to the boss and is won when all six strings ring clean', () => {
    const run = new Run('changes', poolFor('changes'), flat, { speed: 70, waves: 3, boss: chordBoss('F#m'), rng: seeded(3) });
    for (let guard = 0; guard < 10 && run.state !== 'boss'; guard++) {
      playPerfectly(run, 0.8);
      if (run.state === 'perk') run.choosePerk(run.offered[0].id);
    }
    expect(run.state).toBe('boss');
    expect(run.wave).toBe(3);
    run.bossString('clean', 100);
    run.bossString('muted', 101);
    expect(run.boss!.at).toBe(1);
    for (let i = 0; i < 5; i++) run.bossString('clean', 102 + i);
    expect(run.state).toBe('won');
    const chord = run.measurements().find((m) => m.key === 'chord:F#m')!;
    expect(chord.value).toBeCloseTo(6);
    expect(chord.strings).toBe(6);
  });

  it('measures chord changes per minute and finger tempo from clean phrases only', () => {
    const changes = new Run('changes', poolFor('changes'), flat, { speed: 70, rng: seeded(5) });
    playPerfectly(changes, 1.5);
    for (const m of changes.measurements()) expect(m.value).toBeCloseTo(40, 0);

    const fingers = new Run('fingers', poolFor('fingers'), flat, { speed: 70, rng: seeded(5) });
    playPerfectly(fingers, 0.25);
    for (const m of fingers.measurements()) expect(m.value).toBeCloseTo(120, 0);
  });

  it('a wrong note breaks the chain and keeps that phrase out of the measurements', () => {
    const run = new Run('song', poolFor('song', PICKED), flat, { speed: 70, rng: seeded() });
    run.update(0.1);
    const f = run.locked()!;
    run.note(wants(f), 1);
    expect(run.chain).toBe(1);
    expect(run.note(30, 1.2)).toBe(false);
    expect(run.chain).toBe(0);
    for (let i = 1; i < f.need; i++) run.note(f.phrase.midis[i][0], 1.2 + i * 0.3);
    expect(run.stats.get(f.phrase.key)!.cleared).toBe(1);
    expect(run.stats.get(f.phrase.key)!.values).toEqual([]);
  });

  it('switches target when the first note of another phrase is played', () => {
    const run = new Run('fingers', poolFor('fingers'), flat, { speed: 70, rng: seeded(9) });
    // from the second wave on there is more than one piece in the air
    run.wave = 2;
    for (let t = 0; t < 12; t += 0.05) run.update(0.05);
    expect(run.foes.length).toBeGreaterThan(1);
    const other = run.foes.find((f) => f !== run.locked())!;
    expect(run.note(other.phrase.midis[0][0], run.time)).toBe(true);
    expect(run.locked()).toBe(other);
  });

  it('sends one piece at a time in the first wave, as a warm-up', () => {
    const run = new Run('changes', poolFor('changes'), flat, { speed: 60, rng: seeded(4) });
    let most = 0;
    for (let t = 0; t < 30; t += 0.05) {
      run.update(0.05);
      most = Math.max(most, run.foes.length);
    }
    expect(most).toBe(1);
  });

  it('lets the speed follow the player: up when a piece is gone early, down when it got close, steady in between', () => {
    /** Lets the first piece fall for a while, then plays it through; returns how the speed changed. */
    const after = (wait: number, slip = false): number => {
      const run = new Run('fingers', poolFor('fingers'), flat, { speed: 60, rng: seeded(2) });
      run.update(0);
      for (let t = 0; t < wait; t += 0.05) run.update(0.05);
      const f = run.locked()!;
      if (slip) run.note(wants(f) + 1, run.time);
      while (run.foes.includes(f)) run.note(wants(f), run.time);
      return run.speed - 60;
    };
    // the first piece starts a third of the way down and takes about twenty seconds to the line at 60%
    expect(after(1)).toBe(2);
    expect(after(1, true)).toBe(0);
    expect(after(9)).toBe(0);
    expect(after(17)).toBe(-3);
    expect(after(17, true)).toBe(-3);
  });

  it('loses integrity when noise reaches the floor and ends at zero', () => {
    const run = new Run('song', poolFor('song', PICKED), flat, { speed: 140, rng: seeded() });
    for (let t = 0; t < 400 && run.state === 'playing'; t += 0.1) run.update(0.1);
    expect(run.state).toBe('over');
    expect(run.integrity).toBe(0);
  });

  it('still takes what was played just before a piece touched the floor, though it is reported a moment later', () => {
    /** Lets the first piece fall to the floor line with one strum left to play; returns the run and the piece. */
    const atTheFloor = (): [Run, Foe] => {
      const run = new Run('changes', poolFor('changes'), flat, { speed: 60, rng: seeded(4) });
      while (!run.locked()) run.update(0.05);
      const f = run.locked()!;
      for (let k = 0; k < 200 && f.hit < f.need - 1; k++) {
        run.update(0.3);
        run.chord(Run.target(f), run.time);
      }
      expect(f.hit).toBe(f.need - 1);
      while (f.y < LAND_Y) run.update(0.01);
      return [run, f];
    };
    // the last strum fell as the piece touched down; its report comes 0.2 s later and still counts
    const [run, f] = atTheFloor();
    const touched = run.time;
    for (let k = 0; k < 20; k++) run.update(0.01);
    expect(run.integrity).toBe(3);
    run.chord(Run.target(f), touched);
    expect(run.foes.includes(f)).toBe(false);
    expect(run.integrity).toBe(3);
    // with nothing played, the piece lands after its short rest
    const [idle] = atTheFloor();
    for (let k = 0; k < 40; k++) idle.update(0.01);
    expect(idle.integrity).toBe(2);
  });

  it('keeps going after an upgrade: the second wave scores too', () => {
    const run = new Run('fingers', poolFor('fingers'), flat, { speed: 70, rng: seeded(2) });
    playPerfectly(run, 0.25);
    expect(run.state).toBe('perk');
    const before = run.score;
    run.choosePerk(run.offered[0].id);
    expect(run.wave).toBe(2);
    playPerfectly(run, 0.25);
    expect(run.score).toBeGreaterThan(before);
  });
});

describe('piano runs', () => {
  it('sends five-finger patterns for both hands and measures their tempo', () => {
    const pool = poolFor('keys');
    expect(pool.some((p) => p.hand === 'left')).toBe(true);
    const up = pool.find((p) => p.label === 'UP · C')!;
    expect(up.keys.map((k) => [k.midi, k.fg])).toEqual([[60, 1], [62, 2], [64, 3], [65, 4], [67, 5]]);
    const left = pool.find((p) => p.label === 'UP · C LEFT')!;
    expect(left.keys.map((k) => k.fg)).toEqual([5, 4, 3, 2, 1]);
    expect(left.key).toBe('finger:piano-up-left');
    const run = new Run('keys', pool, flat, { speed: 70, rng: seeded(4) });
    playPerfectly(run, 0.25);
    expect(run.state).toBe('perk');
    for (const m of run.measurements()) expect(m.value).toBeCloseTo(120, 0);
  });

  it('measures the phrases of a piece as a share of full speed, allowing for long notes', () => {
    const piece = PIANO_PIECES[0];
    const run = new Run('piece', poolFor('piece', piece), flat, { speed: 60, rng: seeded(6) });
    // every step is played exactly as long as written, at full speed
    let next = 0;
    for (let t = 0; t < 300 && run.state === 'playing'; t += 0.01) {
      run.update(0.01);
      const f = run.locked();
      if (!f || run.time < next) continue;
      run.note(wants(f), run.time);
      const p = f.phrase;
      next = run.time + (f.hit < p.at.length ? (p.at[f.hit] - p.at[f.hit - 1]) * piece.noteDur : 0.5);
    }
    const all = run.measurements();
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(m.key.startsWith('bar:ode-to-joy:p')).toBe(true);
      expect(m.value).toBeGreaterThan(92);
      expect(m.value).toBeLessThan(104);
    }
  });

  it('ends with a scale as the boss, one segment per key', () => {
    const run = new Run('keys', poolFor('keys'), flat, { speed: 70, waves: 1, boss: scaleBoss('C'), rng: seeded(8) });
    playPerfectly(run, 0.25);
    expect(run.state).toBe('boss');
    expect(run.boss!.steps.map((s) => s.fg)).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    for (let i = 0; i < 7; i++) run.bossString('clean', 10 + i);
    run.bossGiveUp();
    const m = run.measurements().find((x) => x.key === 'scale:C')!;
    expect(m.value).toBe(Infinity);
    expect(m.strings).toBe(5);
  });
});

describe('upgrades', () => {
  function runWith(perk: string, type: 'song' | 'keys' = 'song'): Run {
    const run = new Run(type, type === 'song' ? poolFor('song', PICKED) : poolFor(type), flat, { speed: 70, rng: seeded(7) });
    run.perks.add(perk);
    return run;
  }
  const clears = (run: Run): string[] => run.events.filter((e) => e.type === 'clear').map((e) => (e.type === 'clear' ? (e.bonus ?? '') : ''));

  it('"On the grid" doubles a phrase played with even timing, and only that', () => {
    const even = runWith('grid');
    even.update(0.1);
    const f = even.locked()!;
    for (let i = 0; i < f.need; i++) even.note(f.phrase.midis[i][0], 1 + i * 0.3);
    expect(clears(even)).toEqual(['ON THE GRID']);

    const uneven = runWith('grid');
    uneven.update(0.1);
    const g = uneven.locked()!;
    for (let i = 0; i < g.need; i++) uneven.note(g.phrase.midis[i][0], 1 + i * 0.3 + (i === 3 ? 0.2 : 0));
    expect(clears(uneven)).toEqual(['']);
    expect(even.score).toBeGreaterThan(uneven.score);
  });

  it('"Let it ring" doubles a phrase whose notes were all still sounding when the next began', () => {
    const ringing = runWith('ring');
    ringing.update(0.1);
    const f = ringing.locked()!;
    for (let i = 0; i < f.need; i++) ringing.note(f.phrase.midis[i][0], 1 + i * 0.3, i ? 0.8 : -1);
    expect(clears(ringing)).toEqual(['RINGING']);

    const choppy = runWith('ring');
    choppy.update(0.1);
    const g = choppy.locked()!;
    for (let i = 0; i < g.need; i++) choppy.note(g.phrase.midis[i][0], 1 + i * 0.3, i === 2 ? 0.01 : 0.8);
    expect(clears(choppy)).toEqual(['']);
  });

  it('offers "Let it ring" only where notes can ring on, and "Quick change" only where chords change', () => {
    const offered = (type: 'fingers' | 'changes' | 'song' | 'keys'): string[] => {
      const ids = new Set<string>();
      for (let seed = 1; seed < 30; seed++) {
        const run = new Run(type, poolFor(type), flat, { speed: 70, rng: seeded(seed) });
        playPerfectly(run, type === 'changes' ? 0.8 : 0.25);
        run.offered.forEach((p) => ids.add(p.id));
      }
      return [...ids];
    };
    expect(offered('fingers')).not.toContain('ring');
    expect(offered('fingers')).not.toContain('change');
    expect(offered('keys')).toContain('ring');
    expect(offered('changes')).toContain('change');
  });
});

describe('songs', () => {
  it('turns a strummed song into its chord changes and a picked song into its bars', () => {
    const strummed = poolFor('song', SONGS.find((s) => s.id === 'four-chords')!);
    expect(strummed.every((p) => p.kind === 'chg')).toBe(true);
    expect(strummed.map((p) => p.key)).toEqual(['pair:A>F#m', 'pair:F#m>D', 'pair:D>E', 'pair:E>A']);
    const picked = poolFor('song', SONGS.find((s) => s.id === 'greensleeves-chords')!);
    expect(picked.map((p) => p.key)).toEqual(['bar:greensleeves-chords:Am', 'bar:greensleeves-chords:C', 'bar:greensleeves-chords:G', 'bar:greensleeves-chords:Em', 'bar:greensleeves-chords:E']);
    const tune = poolFor('song', SONGS.find((s) => s.id === 'amazing-grace')!);
    expect(tune.every((p) => p.kind === 'tab' && p.notes.length >= 3)).toBe(true);
  });

  it('lays out more bars to a line when the bars are short', () => {
    expect(songLines(SONGS.find((s) => s.id === 'water-is-wide')!).map((l) => l.length)).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    expect(songLines(SONGS.find((s) => s.id === 'amazing-grace-chords')!)[0]).toEqual([0, 1, 2, 3]);
  });

  it('places melody notes in open position', () => {
    expect(midiToTab(64)).toEqual({ s: 5, f: 0 });
    expect(midiToTab(60)).toEqual({ s: 4, f: 1 });
    expect(midiToTab(50)).toEqual({ s: 2, f: 0 });
    for (let m = 40; m <= 68; m++) expect(tabMidi(midiToTab(m))).toBe(m);
  });
});

describe('playing along with the click', () => {
  const steps = (n: number, gap: number) => Array.from({ length: n }, (_, i) => ({ midis: [60 + (i % 3)], t: 10 + i * gap, bar: Math.floor(i / 4) }));

  it('counts notes near their moment as hits and reports how late they were', () => {
    const take = new Take(steps(8, 0.5));
    for (let i = 0; i < 8; i++) expect(take.note(60 + (i % 3), 10 + i * 0.5 + 0.04)).toBe(i);
    expect(take.advance(20)).toBe(true);
    const r = take.result();
    expect(r.hits).toBe(8);
    expect(r.strays).toBe(0);
    expect(r.offset).toBeCloseTo(0.04);
    expect(r.cleanBars).toEqual([0, 1]);
  });

  it('misses a note that is not played, and a note far from its moment belongs nowhere', () => {
    const take = new Take(steps(8, 0.5));
    for (let i = 0; i < 8; i++) if (i !== 2) take.note(60 + (i % 3), 10 + i * 0.5);
    expect(take.note(62, 11.25)).toBeNull();
    take.advance(20);
    const r = take.result();
    expect(take.state[2]).toBe('miss');
    expect(r.hits).toBe(7);
    expect(r.strays).toBe(1);
    expect(r.cleanBars).toEqual([1]);
  });

  it('gives fast notes a window that still tells neighbours apart', () => {
    const take = new Take(steps(8, 0.2));
    expect(take.window[3]).toBeCloseTo(0.1);
    // the same pitch comes round every third step: the nearer one is meant
    expect(take.note(60, 10.62)).toBe(3);
    expect(take.due(10.41)).toBe(2);
  });

  it('matches strummed chords by name', () => {
    const take = new Take([
      { midis: [], chord: 'G', t: 5, bar: 0 },
      { midis: [], chord: 'C', t: 6, bar: 0 },
    ]);
    expect(take.wanted(5.05)?.chord).toBe('G');
    expect(take.chord('G', 5.05)).toBe(0);
    expect(take.chord('G', 6)).toBeNull();
    expect(take.chord('C', 6.1)).toBe(1);
    expect(take.result().cleanBars).toEqual([]);
  });

  it('raises the speed after a clean take and lowers it after one that fell apart', () => {
    const r = { hits: 8, total: 8, strays: 0, offset: 0, cleanBars: [0], bars: [0] };
    expect(nextTempo(60, r)).toBe(70);
    expect(nextTempo(100, r)).toBe(100);
    expect(nextTempo(60, { ...r, hits: 6 })).toBe(60);
    expect(nextTempo(60, { ...r, hits: 3 })).toBe(50);
  });
});

describe('adding your own', () => {
  it('reads a pasted tab: bars, notes struck together, two-digit frets and rhythm from the spacing', () => {
    const r = parseTab(`Some song, verse
e|-----0-----0---|-12--------|
B|---1---1-----1-|-----------|
G|-2-------2-----|-----0---0-|
D|---------------|-----------|
A|-0-------------|-----3-----|
E|---------------|-----------|`);
    expect(r.problems).toEqual([]);
    expect(r.bars.length).toBe(2);
    expect(r.steps).toBe(10);
    expect(r.bars[0].notes[0]).toEqual({ s: 1, f: 0, more: [{ s: 3, f: 2 }] });
    expect(r.bars[0].notes.slice(1).map((n) => [n.s, n.f])).toEqual([[4, 1], [5, 0], [4, 1], [3, 2], [5, 0], [4, 1]]);
    expect(r.bars[1].notes[0]).toMatchObject({ s: 5, f: 12, len: 2 });
    expect(r.bars[1].notes[1]).toMatchObject({ s: 1, f: 3, more: [{ s: 3, f: 0 }] });
  });

  it('says what is wrong with something that is not a tab', () => {
    expect(parseTab('just some words').problems[0]).toMatch(/No tab found/);
    expect(parseTab('G|--0--2--|\nD|--0--2--|\nA|--2--3--|\nE|--3--0--|').problems[0]).toMatch(/4 lines/);
  });

  it('reads a melody typed as note names', () => {
    const r = parseNotes('E4 E F G | G4:2 f#4(3) Bb3\nH3 x9');
    expect(r.phrases.map((p) => p.map((n) => n.midi))).toEqual([[64, 64, 65, 67], [67, 66, 58], [59]]);
    expect(r.phrases[1][0].len).toBe(2);
    expect(r.phrases[1][1].fg).toBe(3);
    expect(r.problems).toEqual(['Could not read "x9".']);
  });
});

describe('skills', () => {
  it('turns measurements into levels', () => {
    expect(levelFor('pair', 9)).toBe(0);
    expect(levelFor('pair', 14)).toBe(1);
    expect(levelFor('pair', 60)).toBe(5);
    expect(levelFor('finger', 100)).toBe(3);
    expect(levelFor('chord', 40)).toBe(1);
    expect(levelFor('chord', 7.5)).toBe(4);
    expect(levelFor('scale', 12)).toBe(3);
  });

  it('only moves levels up, counts partial chords, and asks for full speed three times for the last bar level', () => {
    const s = new Skills();
    expect(s.record('pair:Em>F#m', 22, 1000)).toEqual({ key: 'pair:Em>F#m', before: 0, after: 2 });
    expect(s.record('pair:Em>F#m', 12, 2000).after).toBe(2);
    expect(s.record('chord:F#m', Infinity, 1000, 4).after).toBe(0);
    expect(s.get('chord:F#m')!.strings).toBe(4);
    expect(s.record('chord:F#m', 12, 2000).after).toBe(3);
    expect(s.record('bar:x:Am', 104, 1).after).toBe(4);
    expect(s.record('bar:x:Am', 101, 2).after).toBe(4);
    expect(s.record('bar:x:Am', 100, 3).after).toBe(5);
    expect(s.record('scale:C', Infinity, 1, 5).after).toBe(0);
    expect(s.record('scale:C', 9, 2).after).toBe(4);
    expect(s.rank()).toBe(2 + 3 + 5 + 4);
  });

  it('marks a skill rusty after a week and sends it more often', () => {
    const s = new Skills();
    s.record('pair:Am>C', 31, 0);
    const week = 7 * 24 * 3600 * 1000;
    expect(s.rusty('pair:Am>C', week - 1)).toBe(false);
    expect(s.rusty('pair:Am>C', week + 1)).toBe(true);
    expect(s.weight('pair:Am>C', week + 1)).toBeGreaterThan(s.weight('pair:Am>C', 0));
  });

  it('survives a round trip through storage, and through a backup file', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const a = new Store(storage);
    a.skills.record('finger:spider', 85, 5);
    a.settings.a4 = 436;
    a.songs.push({ id: 'my-1', title: 'Mine', noteDur: 0.4, beat: 2, bars: [{ notes: [{ s: 5, f: 0 }] }], custom: true });
    a.save();
    const b = new Store(storage);
    expect(b.skills.level('finger:spider')).toBe(2);
    expect(b.settings.a4).toBe(436);
    expect(b.settings.instrument).toBe('guitar');

    const fresh = new Store({ getItem: () => null, setItem: () => undefined });
    expect(fresh.restore('{"something":"else"}')).toBe(false);
    expect(fresh.restore(a.backup())).toBe(true);
    expect(fresh.skills.level('finger:spider')).toBe(2);
    expect(fresh.songs[0].title).toBe('Mine');
  });
});

describe('the gesture for a pause: two hits on muted strings and then nothing', () => {
  it('is due half a second after the second hit, once', () => {
    const g = new MuteGesture();
    g.onset(1);
    g.onset(1.3);
    g.thud(1, true);
    expect(g.due(1.5)).toBe(false);
    g.thud(1.3, true);
    expect(g.due(1.7)).toBe(false);
    expect(g.due(1.81)).toBe(true);
    expect(g.due(1.9)).toBe(false);
  });

  it('is called off by anything struck after the second hit, whether that is heard before the hit is reported or after', () => {
    // reported in the order the listener reports them: the note's onset first, then the hit before it
    const early = new MuteGesture();
    early.onset(1);
    early.onset(1.3);
    early.thud(1, true);
    early.onset(1.55);
    early.thud(1.3, true);
    expect(early.due(2)).toBe(false);
    // and the other way round
    const late = new MuteGesture();
    late.onset(1);
    late.onset(1.3);
    late.thud(1, true);
    late.thud(1.3, true);
    late.onset(1.75);
    expect(late.due(2)).toBe(false);
  });

  it('does not take the pick noise right at the second hit for playing on', () => {
    const g = new MuteGesture();
    g.onset(1);
    g.onset(1.3);
    g.onset(1.36);
    g.thud(1, true);
    g.thud(1.3, true);
    expect(g.due(1.81)).toBe(true);
  });

  it('needs two hits close together: not one, not two far apart, not a hand laid on ringing strings', () => {
    const one = new MuteGesture();
    one.thud(1, true);
    expect(one.due(3)).toBe(false);
    const apart = new MuteGesture();
    apart.thud(1, true);
    apart.thud(1.8, true);
    expect(apart.due(3)).toBe(false);
    const stopped = new MuteGesture();
    stopped.thud(1, false);
    stopped.thud(1.3, true);
    expect(stopped.due(3)).toBe(false);
    // but a third hit makes the pair
    stopped.thud(1.6, true);
    expect(stopped.due(3)).toBe(true);
  });

  it('does not count a short note as a hit, nor two hits with a note between them', () => {
    const short = new MuteGesture();
    short.played(1);
    short.thud(1, true);
    short.played(1.3);
    short.thud(1.3, true);
    expect(short.due(3)).toBe(false);
    const between = new MuteGesture();
    between.thud(1, true);
    between.played(1.25);
    between.thud(1.5, true);
    expect(between.due(3)).toBe(false);
  });
});

describe('how to change between two chords', () => {
  const tip = (a: string, b: string): string => changeTip(CHORDS[a], CHORDS[b]);

  it('names the fingers that stay down, and the one that moves', () => {
    expect(tip('Am', 'C')).toBe('Fingers 1 and 2 stay down. Only finger 3 moves: A string, fret 3.');
    expect(tip('C', 'Am')).toBe('Fingers 1 and 2 stay down. Only finger 3 moves: G string, fret 2.');
  });

  it('says when the fingers keep their shape and move together', () => {
    expect(tip('Am', 'E')).toBe('Fingers 1, 2 and 3 keep their shape: 1 string towards the ceiling.');
    expect(tip('Em', 'Am')).toBe('Fingers 2 and 3 keep their shape: 1 string towards the floor. Add finger 1.');
  });

  it('says so when nothing stays, and which finger to lead with', () => {
    expect(tip('C', 'G')).toBe('No finger stays: lift them together and land them together, finger 2 first.');
    expect(tip('G', 'D')).toMatch(/^No finger stays/);
  });

  it('counts the index finger of a small barre as staying when it only lets go of a string', () => {
    expect(tip('F', 'C')).toMatch(/^Finger 1 stays down\. Fingers 2 and 3 keep their shape: 1 string towards the ceiling\./);
  });

  it('has something to say for every change the app drills, in both directions', () => {
    for (const [a, b] of CHORD_PAIRS) {
      for (const t of [tip(a, b), tip(b, a)]) {
        expect(t.length, `${a} ${b}`).toBeGreaterThan(20);
        expect(t.length, `${a} ${b}: ${t}`).toBeLessThan(100);
      }
    }
  });
});

describe('how hard a song is', () => {
  const level = (id: string): number => songProfile(SONGS.find((s) => s.id === id)!).level;

  it('puts strummed open chords below a small barre, and both below a picking pattern with five chords', () => {
    expect(level('amazing-grace-chords')).toBe(1);
    expect(level('four-chords')).toBe(3);
    expect(level('greensleeves-chords')).toBe(4);
  });

  it('counts what makes a strummed song harder: more chords, upstrokes, quick changes, barre chords', () => {
    const points = (id: string): number => songProfile(SONGS.find((s) => s.id === id)!).points;
    // two open chords on the beat; three with a pattern; four with a pattern
    expect(points('skip-to-my-lou')).toBe(0);
    expect(points('down-by-the-riverside')).toBe(1);
    expect(points('whiskey-in-the-jar')).toBe(2);
    // a small barre and a fourth chord are demanding
    expect(level('four-chords')).toBe(3);
    // changes faster than every two seconds are quick; with a full barre and a pattern that is hard
    expect(songProfile(SONGS.find((s) => s.id === 'when-johnny')!).reasons.join(' · ')).toContain('a change about every 1.');
    expect(level('when-johnny')).toBe(4);
    // two full barre chords with a pattern are hard; so is one with many chords
    expect(songProfile(SONGS.find((s) => s.id === 'go-down-moses')!).reasons[0]).toBe('needs 2 full barre chords (Gm, Cm)');
    expect(level('go-down-moses')).toBe(4);
    expect(level('careless-love')).toBe(4);
  });

  it('says why, and which chords a song needs', () => {
    const p = songProfile(SONGS.find((s) => s.id === 'greensleeves-chords')!);
    expect(p.chords).toEqual(['Am', 'C', 'G', 'Em', 'E']);
    expect(p.reasons.join(' · ')).toContain('open chords only');
    expect(p.reasons.join(' · ')).toContain('a picking pattern while the chord is held');
    expect(songProfile(SONGS.find((s) => s.id === 'banks-of-the-ohio')!).reasons.join(' · ')).toContain('needs a small barre (F)');
  });

  it('rates piano pieces from one hand position up to moving hands and black keys', () => {
    const levels = PIANO_PIECES.map((p) => pieceProfile(p).level);
    expect(levels[0]).toBe(1);
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(3);
    expect(pieceProfile(PIANO_PIECES.find((p) => p.id === 'fur-elise')!).reasons).toContain('black keys');
  });
});

describe('confirming a skill on different days', () => {
  it('counts the days on which it was measured clean, not the tries', () => {
    const s = new Skills();
    const day1 = new Date(2026, 0, 5, 10).getTime();
    s.record('chord:Em', 12, day1);
    s.record('chord:Em', 9, day1 + 3600e3);
    expect(s.get('chord:Em')!.days).toBe(1);
    s.record('chord:Em', 9, day1 + 26 * 3600e3);
    expect(s.get('chord:Em')!.days).toBe(2);
    // a check in which not every string rang is not a clean day
    s.record('chord:Em', Infinity, day1 + 50 * 3600e3, 4);
    expect(s.get('chord:Em')!.days).toBe(2);
  });
});

describe('stepping stones: keeping the pulse', () => {
  const four = PATTERNS.find((p) => p.id === 'four')!;
  const push = PATTERNS.find((p) => p.id === 'push')!;

  it('lays one stone for every strum and changes the chord at every bar line', () => {
    const stones = makeWalk(four, ['Em', 'Am'], 4);
    expect(stones.length).toBe(16);
    expect(stones.filter((s) => s.change).map((s) => s.at)).toEqual([4, 8, 12]);
    expect([stones[0].chord, stones[4].chord, stones[8].chord]).toEqual(['Em', 'Am', 'Em']);
    expect(makeWalk(push, ['G', 'D'], 1).map((s) => s.at)).toEqual([0, 1, 2, 2.5, 3]);
  });

  it('still counts a strum on the beat when its report comes a fifth of a second later', () => {
    // the listener names a chord about 0.2 s after the strum; by then the moment of the stone is long over
    const w = new Walk(makeWalk(four, ['Em', 'Am'], 2), 60, 10);
    // a quarter of a second after the second beat: the first stone, which nobody played, is given up;
    // the second is still open, because the report of a strum on it may yet come
    expect(w.advance(11.25)).toEqual([0]);
    expect(w.strum(11.0, 'Em')).toBe(1);
    expect(w.advance(11.3)).toEqual([]);
    expect(w.strum(11.12, 'Em')).toBe(-1);
    expect(w.result().hits).toBe(1);
    expect(w.result().stray).toBe(1);
  });

  it('counts strums that fall on a stone, with how early or late they were', () => {
    const w = new Walk(makeWalk(four, ['Em', 'Am'], 2), 60, 10);
    expect(w.strum(10.04, 'Em')).toBe(0);
    expect(w.strum(10.95, null)).toBe(1);
    expect(w.strum(12.5, 'Em')).toBe(-1);
    expect(w.advance(13.6)).toEqual([2, 3]);
    const r = w.result();
    expect(r.hits).toBe(2);
    expect(r.stray).toBe(1);
    expect(r.lean).toBeCloseTo(-0.005, 3);
    expect(r.spread).toBeCloseTo(0.045, 3);
    expect(r.kept).toBe(false);
  });

  it('notices a strum that is in time but still the chord of the bar before', () => {
    const w = new Walk(makeWalk(four, ['Em', 'Am'], 2), 60, 0);
    for (let b = 0; b < 8; b++) w.strum(b + 0.01, b === 4 ? 'Em' : b < 4 ? 'Em' : 'Am');
    const r = w.result();
    expect(r.hits).toBe(8);
    expect(r.wrong).toBe(1);
    // one wrong chord in eight is more than a tenth: the tempo does not count yet
    expect(r.kept).toBe(false);
  });

  it('keeps the window narrow enough that two quick stones cannot be confused', () => {
    const w = new Walk(makeWalk(push, ['G', 'D'], 1), 100, 0);
    expect(w.window).toBeLessThan(0.3 * 0.5);
    expect(w.strum(2 * 0.6, 'G')).toBe(2);
    expect(w.strum(2.5 * 0.6, 'G')).toBe(3);
  });

  it('lets a clean walk count', () => {
    const stones = makeWalk(four, ['Em', 'Am'], 8);
    const w = new Walk(stones, 72, 5);
    stones.forEach((s, i) => w.strum(w.due(i) + 0.03, s.chord));
    expect(w.result().kept).toBe(true);
    expect(w.next(w.due(31) + 1)).toBe(-1);
  });
});

describe('versions of a song', () => {
  it('offers a picked song in a basic version too: the same chords, strummed on the click, and easier', () => {
    const full = SONGS.find((x) => x.id === 'greensleeves-chords')!;
    const basic = basicVersion(full)!;
    expect(basic.id).toBe('greensleeves-chords~basic');
    expect(basic.bars.map((b) => b.chord)).toEqual(full.bars.map((b) => b.chord));
    expect(basic.bars[0].notes.every((n) => n.strum === 'Am')).toBe(true);
    expect(songProfile(basic).kind).toBe('strummed');
    expect(songProfile(basic).level).toBeLessThan(songProfile(full).level);
    expect(allSongs().some((x) => x.id === basic.id)).toBe(true);
  });

  it('has no basic version of a song that is strummed already, or of a melody', () => {
    expect(basicVersion(SONGS.find((x) => x.id === 'amazing-grace-chords')!)).toBeNull();
    expect(basicVersion(SONGS.find((x) => x.id === 'ode-guitar')!)).toBeNull();
  });
});
