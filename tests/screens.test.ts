import { afterEach, describe, expect, it, vi } from 'vitest';

// the screens hang a listener on the window when they are loaded: a stand-in will do here
vi.hoisted(() => {
  const g = globalThis as unknown as { addEventListener?: unknown };
  g.addEventListener ??= () => undefined;
});

import { checkItems, CheckRun, QUIET } from '../src/core/checkrun';
import { setLang } from '../src/core/i18n';
import { OPEN_STRINGS } from '../src/music/theory';
import { stageTally } from '../src/screens/keys';
import { judgeSlur, SLUR_ROUNDS, SLUR_WITHIN, slurMissTip, SLURS, slurStart, slurTempo, type SlurNews, type SlurPattern, type SlurState } from '../src/screens/slur';
import { said } from '../src/screens/trends';

afterEach(() => setLang('en'));

/** A pitch tracker's readings of one note: three in a row, 21 ms apart, as the listener gives them. */
function sound(s: SlurState, pat: SlurPattern, midi: number, t: number, readings = 3): { s: SlurState; news: SlurNews[] } {
  const news: SlurNews[] = [];
  for (let k = 0; k < readings; k++) {
    const r = judgeSlur(s, pat, midi, t + k * 0.021);
    s = r.s;
    news.push(r.news);
  }
  return { s, news };
}
const midiOf = (pat: SlurPattern, fret: number): number => OPEN_STRINGS[pat.s] + fret;
const pattern = (n: number): SlurPattern => SLURS().find((p) => p.n === n)!;

describe('hammer-on and pull-off, judged', () => {
  it('counts a hammer-on once its second note has sounded three readings in a row, and a take after four rounds', () => {
    const pat = pattern(1);
    let s = slurStart();
    let t = 10;
    for (let round = 1; round <= SLUR_ROUNDS; round++) {
      const a = sound(s, pat, midiOf(pat, 5), t);
      expect(a.news.map((x) => x.kind)).toEqual(['none', 'none', 'note']);
      expect(a.s.at).toBe(1);
      const b = sound(a.s, pat, midiOf(pat, 7), t + 0.3);
      expect(b.news[2].kind).toBe(round === SLUR_ROUNDS ? 'done' : 'round');
      s = b.s;
      expect(s.round).toBe(round);
      expect(s.at).toBe(0);
      t += 1;
    }
    expect(s.missed).toBe(0);
    // a round starts where its first note counted: at the third reading, 42 ms in
    s.starts.forEach((x, k) => expect(x).toBeCloseTo(10 + k + 0.042, 6));
    // one pattern a second, a pattern of two notes: 60 beats a minute
    expect(slurTempo(s.starts, pat)).toBe(60);
    // nothing is judged after the take
    expect(judgeSlur(s, pat, midiOf(pat, 5), 20).news.kind).toBe('none');
  });

  it('does not count a note again while it rings on', () => {
    const pat = pattern(5);
    const a = sound(slurStart(), pat, midiOf(pat, 5), 0, 12);
    expect(a.s.at).toBe(1);
    expect(a.news.filter((x) => x.kind === 'note')).toHaveLength(1);
  });

  it('follows a pull-off, and a trill of four slurs', () => {
    const off = pattern(2);
    const a = sound(slurStart(), off, midiOf(off, 7), 0);
    const b = sound(a.s, off, midiOf(off, 5), 0.25);
    expect(b.news[2].kind).toBe('round');

    const trill = pattern(6);
    let s = slurStart();
    const kinds: string[] = [];
    trill.frets.forEach((f, k) => {
      const r = sound(s, trill, midiOf(trill, f), k * 0.2);
      s = r.s;
      kinds.push(r.news[2].kind);
    });
    expect(kinds).toEqual(['note', 'note', 'note', 'note', 'round']);
    expect(s.missed).toBe(0);
  });

  it('says which note did not sound, and how that one is made', () => {
    // 5, 7, 5: the hammer-on to 7 sounds, the pull-off back to 5 does not. The old message named fret 7,
    // with advice for a hammer-on.
    const pat = pattern(5);
    let s = sound(slurStart(), pat, midiOf(pat, 5), 0).s;
    s = sound(s, pat, midiOf(pat, 7), 0.3).s;
    expect(s.at).toBe(2);
    // fret 7 rings on; the second slur has until 2 × 1.2 s after the first note
    let miss: SlurNews | null = null;
    for (let t = 0.4; t < 3 && !miss; t += 0.021) {
      const r = judgeSlur(s, pat, midiOf(pat, 7), t);
      s = r.s;
      if (r.news.kind === 'miss') {
        miss = r.news;
        expect(t).toBeGreaterThan(2 * SLUR_WITHIN);
      }
    }
    expect(miss).toEqual({ kind: 'miss', fret: 5, how: 'p' });
    expect(s.at).toBe(0);
    expect(s.missed).toBe(1);
    expect(slurMissTip(5, 'p')).toMatch(/^Fret 5 did not sound: pull the finger off/);
    expect(slurMissTip(5, 'p')).toContain('Keep the finger on fret 5');
    expect(slurMissTip(7, 'h')).toMatch(/^Fret 7 did not sound: strike the string harder/);
    setLang('de');
    expect(slurMissTip(5, 'p')).toMatch(/^Der 5\. Bund klang nicht: Zieh den Finger/);
  });

  it('counts a hammer-on that does not come as missed, naming its fret', () => {
    const pat = pattern(3);
    let s = sound(slurStart(), pat, midiOf(pat, 5), 0).s;
    // within the time allowed nothing is said
    expect(judgeSlur(s, pat, midiOf(pat, 5), SLUR_WITHIN - 0.05).news.kind).toBe('none');
    const r = judgeSlur(s, pat, midiOf(pat, 5), SLUR_WITHIN + 0.05);
    expect(r.news).toEqual({ kind: 'miss', fret: 8, how: 'h' });
    s = r.s;
    expect(s.missed).toBe(1);
  });
});

describe('the hearing check on a clock that has been running', () => {
  /** levels as the listener gives them, every 21 ms, from `from` on */
  function room(run: CheckRun, from: number, secs: number, db: number): void {
    for (let t = from; t < from + secs; t += 0.021) run.level({ time: t, rms: 0, db, gateDb: -70 });
  }
  it('measures the room in the first seconds, though the microphone was opened minutes before', () => {
    const items = checkItems('guitar');
    const run = new CheckRun(items, false);
    run.start(185.3);
    room(run, 185.32, QUIET - 0.1, -58);
    expect(run.current?.kind).toBe('quiet');
    room(run, 185.32 + QUIET - 0.1, 0.3, -58);
    expect(run.current?.kind).toBe('note');
    while (!run.done) run.settle('nothing heard', false);
    expect(run.summary('guitar').roomDb).toBe(-58);
  });

  it('measured nothing of the room when it began its clock at 0 (the old way)', () => {
    const run = new CheckRun(checkItems('guitar'), false);
    run.start();
    room(run, 185.32, 1, -58);
    expect(run.current?.kind).toBe('note');
    while (!run.done) run.settle('nothing heard', false);
    expect(run.summary('guitar').roomDb).toBe(-100);
  });
});

describe('a stage check of the piano', () => {
  it('counts chords, not passes: one chord played clean twice is still one', () => {
    const asked = ['C', 'G', 'Am'];
    expect(stageTally(asked, new Set(['C']))).toEqual({ passed: 1, of: 3, all: false });
    // a replay of C (R, or the left arrow into a chord already done) adds nothing
    const clean = new Set<string>();
    for (const id of ['C', 'C', 'G']) clean.add(id);
    expect(stageTally(asked, clean)).toEqual({ passed: 2, of: 3, all: false });
    clean.add('Am');
    expect(stageTally(asked, clean).all).toBe(true);
    // chords that rang but were not asked for confirm nothing
    expect(stageTally(asked, new Set(['C', 'G', 'F'])).all).toBe(false);
    // an address that names no chords confirms nothing
    expect(stageTally([], new Set(['C'])).all).toBe(false);
  });
});

describe('the course over weeks', () => {
  it('writes a time with the decimal mark of the language', () => {
    expect(said('chord:Am', 6.25)).toBe('6.3 s');
    setLang('de');
    expect(said('chord:Am', 6.25)).toBe('6,3 s');
    expect(said('pair:Em>Am', 26.4)).toBe('26 pro Minute');
  });
});
