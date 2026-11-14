import { afterEach, describe, expect, it, vi } from 'vitest';

// the screens hang a listener on the window when they are loaded: a stand-in will do here
vi.hoisted(() => {
  const g = globalThis as unknown as { addEventListener?: unknown };
  g.addEventListener ??= () => undefined;
});

import { store } from '../src/core/store';
import { skillLabel } from '../src/music/labels';
import { learningPath } from '../src/music/path';
import { earChords, earKey, motifSource, pickMotifs, seeded } from '../src/screens/ear';
import { instrumentOf, plan } from '../src/screens/session';

afterEach(() => {
  store.skills.data = {};
  store.current = {};
  store.settings.instrument = 'guitar';
});

describe('playing by ear', () => {
  it('takes its motifs from the song being learned, and from an easy tune when that song is only strummed', () => {
    store.current.guitar = 'aura-lee';
    const own = motifSource(false);
    expect(own.title).toBe('Aura Lee');
    expect(own.lines.flat().length).toBeGreaterThan(20);
    store.current.guitar = 'tom-dooley';
    const other = motifSource(false);
    expect(other.title).not.toBe('Tom Dooley');
    expect(other.lines.flat().length).toBeGreaterThanOrEqual(8);
  });

  it('picks motifs of the length asked for, from one line each, never all one note, none twice while there are others', () => {
    const lines = [
      [60, 62, 64, 65, 67],
      [67, 67, 65, 64],
    ];
    const ms = pickMotifs(lines, 4, 3, seeded(7));
    expect(ms).toHaveLength(4);
    for (const m of ms) {
      expect(m).toHaveLength(3);
      expect(new Set(m).size).toBeGreaterThan(1);
      expect(lines.some((l) => l.join(',').includes(m.join(',')))).toBe(true);
    }
    expect(new Set(ms.map((m) => m.join(','))).size).toBe(4);
    // the same seed gives the same round
    expect(pickMotifs(lines, 4, 3, seeded(7))).toEqual(ms);
  });

  it('asks for chords that already ring, at least two, and more once the ear is good', () => {
    expect(earChords(false)).toEqual(['Em', 'Am', 'C']);
    for (const c of ['Em', 'Am', 'D', 'G', 'C']) store.skills.record('chord:' + c, 10, Date.now());
    expect(earChords(false)).toEqual(['Em', 'Am', 'D']);
    store.skills.record(earKey('chords', false), 85, Date.now());
    expect(earChords(false)).toHaveLength(4);
  });

  it('is measured, named and placed like every skill: beside the path, in the session, on its instrument', () => {
    expect(skillLabel('ear:p.motif')).toMatch(/piano/);
    expect(instrumentOf('ear:p.chords')).toBe('piano');
    expect(instrumentOf('ear:motif')).toBe('guitar');
    const ear = learningPath('guitar').find((s) => s.id === 'ear')!;
    expect(ear.state).toBe('side');
    expect(ear.items.map((i) => i.href)).toEqual(['#/ear/motif', '#/ear/chords', '#/ear/sing']);
    const steps = plan();
    const at = steps.findIndex((s) => s.params[0] === 'motif' || s.params[0] === 'chords');
    expect(at).toBeGreaterThan(0);
    // it comes just before the song
    expect(steps[at + 1].short).toMatch(/Song/);
  });
});
