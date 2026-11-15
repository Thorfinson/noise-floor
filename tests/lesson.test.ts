import { describe, expect, it, vi } from 'vitest';

// the screens hang a listener on the window when they are loaded: a stand-in will do here
vi.hoisted(() => {
  const g = globalThis as unknown as { addEventListener?: unknown };
  g.addEventListener ??= () => undefined;
});

import { said, tuneOf } from '../src/music/accompany';
import { findSong } from '../src/music/content';
import { songMaterial } from '../src/music/material';
import { STRUMS } from '../src/music/songwriting';
import { STRUM_PATTERNS, strumPatternOf } from '../src/music/strums';
import { countAt, FAR, LEARN, strokes, tabLine } from '../src/ui/draw';

describe('the strums of a lesson, drawn to be played', () => {
  it('counts the clicks of a bar, the halves and quarters between them, and six-eight in eighths', () => {
    expect([0, 2, 4].map((u) => countAt(u, 2).count)).toEqual(['1', '2', '3']);
    expect([0, 1, 2, 3, 4].map((u) => countAt(u, 4).count)).toEqual(['1', 'e', '+', 'a', '2']);
    expect([0, 1, 2, 3, 4, 5].map((u) => countAt(u, 3).count)).toEqual(['1', '2', '3', '4', '5', '6']);
    // the first of a bar is said louder, nothing else
    expect([0, 2, 4].map((u) => countAt(u, 2).strong)).toEqual([true, false, false]);
  });

  it('gives every strum its direction as the song strums it, and its count', () => {
    // Loch Lomond is strummed down, down-up, down, down-up
    const song = findSong('loch-lomond');
    const pattern = STRUM_PATTERNS().find((p) => p.id === strumPatternOf(song))!;
    expect(pattern.slots).toBe(STRUMS.folk.slots);
    const st = strokes(song.bars[0].notes, song.beat);
    expect(st.map((s) => (s!.up ? 'U' : 'D')).join('')).toBe(pattern.slots.replace(/\./g, ''));
    expect(st.map((s) => s!.count)).toEqual(['1', '2', '+', '3', '4', '+']);
    // a song strummed on every beat goes down all the way
    const grace = findSong('amazing-grace-chords');
    expect(strokes(grace.bars[1].notes, grace.beat).map((s) => (s!.up ? 'U' : 'D') + s!.count)).toEqual(['D1', 'D2', 'D3']);
    // a picked note is not a strum
    expect(strokes([{ s: 3, f: 2 }], 2)).toEqual([null]);
  });

  it('draws an arrow over each strum and its count under it, the words under the bars, nothing smaller and no taller than before', () => {
    const song = findSong('loch-lomond');
    const m = songMaterial(song);
    const l = m.lines[0];
    const d = tabLine({ bars: l.tab, look: (i) => (i === 0 ? 'cur' : 'up'), beat: m.beat }, LEARN, true);
    // the arrows: down where the stroke goes down, up where it comes back up
    const arrows = [...d.svg.matchAll(/d="M[\d.]+ ([\d.]+)V([\d.]+)M/g)].map((a) => (Number(a[2]) > Number(a[1]) ? 'D' : 'U'));
    expect(arrows.join('')).toBe(l.steps.map((s) => (s.tab?.up ? 'U' : 'D')).join(''));
    // a count under every strum, the first of each bar bold
    expect((d.svg.match(/class="cnt"/g) ?? []).length).toBe(l.steps.length);
    expect((d.svg.match(/class="cnt"[^>]*font-weight:700/g) ?? []).length).toBe(l.bars.length);
    // the arrow of the strum to play is the marker: blue, and no triangle besides
    expect(d.svg).toContain(`stroke="${LEARN.now}" stroke-width="3.4"`);
    expect(d.svg).not.toMatch(/h16l-8 11z/);
    // a line of strums only is drawn on four lines: a strum has no string of its own
    expect((d.svg.match(/<line x1="20"/g) ?? []).length).toBe(4);
    // the chord names keep the size they are read at from a metre
    expect(d.svg).toContain(`font-size:${FAR.chord.toFixed(1)}px`);
    // and the arrows and counts take no more height than the six lines of the plain drawing did
    const plain = tabLine({ bars: l.tab, look: () => 'up' }, LEARN, true);
    expect(d.height).toBeLessThanOrEqual(plain.height);

    // the words of a song with words, under its bars, and still no taller than before
    const grace = findSong('amazing-grace-chords');
    const gm = songMaterial(grace);
    const words = tuneOf(grace)!.words!;
    const w = tabLine({ bars: gm.lines[0].tab, look: () => 'up', beat: gm.beat, barWords: gm.lines[0].bars.map((b) => said(words[b] ?? [])) }, LEARN, true);
    expect(w.svg).toContain('A-ma-zing');
    expect((w.svg.match(/class="bw"/g) ?? []).length).toBe(gm.lines[0].bars.length);
    expect(w.height).toBeLessThanOrEqual(tabLine({ bars: gm.lines[0].tab, look: () => 'up' }, LEARN, true).height);
  });

  it('leaves a tab of picked notes as it was', () => {
    const m = songMaterial(findSong('scarborough-fair'));
    const t = { bars: m.lines[0].tab, look: () => 'up' as const };
    expect(tabLine({ ...t, beat: m.beat }, LEARN, true)).toMatchObject({ svg: tabLine(t, LEARN, true).svg, height: tabLine(t, LEARN, true).height });
  });
});
