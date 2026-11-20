/**
 * The listener told what the band plays through the speakers (src/audio/echo.ts, Listener.bands), on synthesized
 * sound through a plain room, and where what it learns of the speakers is kept. On real recordings in a simulated
 * room: tests/bandreal.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { renderBand } from '../src/audio/band';
import { Listener } from '../src/audio/listener';
import { addNoise, mixInto, strum } from '../src/audio/synth';
import { Store } from '../src/core/store';
import { chordNotes, CHORDS } from '../src/music/theory';
import { heard, mixOf, room, song } from './bandhelp';
import { SR } from './helpers';

describe('the listener told what the band plays through the speakers', () => {
  const parts = renderBand(song('speakers', 'beat', 16));
  const at = 1;
  const len = Math.round((at + parts.length) * SR);

  it('learns in a soundcheck how strongly and how late the speakers reach the microphone', () => {
    const sig = room(mixOf(parts), at, Math.round(7 * SR), 0.3, 0.03);
    const h = heard(sig, parts, at, { learn: 6 });
    const l = h.listener;
    expect(l.coupling).not.toBeNull();
    // the direct sound and the reflections, about 2.2 times the gain, in the middle bands
    const mid = l.coupling!.slice(4, 10);
    for (const c of mid) expect(c).toBeGreaterThan(0.2), expect(c).toBeLessThan(2);
    expect(Math.abs(l.bands[0].start / SR - at - 0.03)).toBeLessThan(0.012);
  });

  it('takes nothing of the band for playing after the soundcheck; the plain listener takes almost every note', () => {
    const sig = room(mixOf(parts), at, len);
    const plain = heard(sig, null, at, { from: 6 });
    expect(plain.notes.length).toBeGreaterThan(15);
    const told = heard(sig, parts, at, { learn: 5, from: 6 });
    expect(told.onsets.length).toBeLessThanOrEqual(1);
    expect(told.notes).toEqual([]);
    expect(told.chords).toEqual([]);
  });

  it('without a soundcheck finds out by itself, while the band plays, how strongly the speakers reach the microphone', () => {
    const sig = room(mixOf(parts), at, len, 0.6);
    const told = heard(sig, parts, at, { from: 6 });
    expect(told.notes).toEqual([]);
    expect(told.chords).toEqual([]);
  });

  it('still hears each strum: between the band notes, and one that lands on a band note', () => {
    // the soundcheck, on the band alone
    const check = heard(room(mixOf(parts), at, Math.round(7 * SR)), parts, at, { learn: 6 }).listener;
    const sig = room(mixOf(parts), at, len);
    // a strum on every bar line (G, Em, C, D, a bar of 2.4 s), and one right on a band note in the third bar
    const notes = parts.events.filter((e) => e.t > 2 * 2.4 && e.t < 3 * 2.4);
    const strums: [number, string][] = [0, 1, 2, 3, 4, 5].map((b) => [at + b * 2.4, ['G', 'Em', 'C', 'D'][b % 4]]);
    strums.push([at + notes[1].t, 'C']);
    for (const [t, id] of strums) mixInto(sig, strum(chordNotes(CHORDS[id]), SR, 1.6), t * SR);
    const told = heard(sig, parts, at, { coupling: check.coupling!, late: check.bands[0].start / SR - at });
    for (const [t, id] of strums) expect(told.chords.some((c) => Math.abs(c.t - t) < 0.06 && c.id === id), `${id} at ${t.toFixed(2)}`).toBe(true);
  });

  it('leaves everything as it was when no band is told: under headphones, with the click alone', () => {
    const sig = new Float32Array(4 * SR);
    for (const [t, id] of [[0.5, 'G'], [1.7, 'Em'], [2.9, 'C']] as const) mixInto(sig, strum(chordNotes(CHORDS[id]), SR, 1.2), t * SR);
    addNoise(sig, 0.0015);
    const a = heard(sig, null, 0);
    const l = new Listener(SR);
    const onsets: unknown[] = [];
    l.onOnset = (e) => onsets.push(e);
    for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
    expect(onsets.length).toBe(a.onsets.length);
    expect(onsets.every((e) => !('own' in (e as object)))).toBe(true);
    expect(a.chords.map((c) => c.id)).toEqual(['G', 'Em', 'C']);
  });
});

describe('the band settings', () => {
  it('keeps how the speakers reach the microphone, and keeps it to this computer when a backup is loaded', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const a = new Store(storage);
    expect(a.settings.band).toBe('speakers');
    expect(a.settings.bandCoupling).toEqual([]);
    a.settings.bandCoupling = [0.1, 0.2, 0.3];
    a.settings.band = 'click';
    a.save();
    const backup = a.backup();
    const b = new Store(storage);
    expect(b.settings.bandCoupling).toEqual([0.1, 0.2, 0.3]);
    expect(b.settings.band).toBe('click');
    // another computer's backup: its band choice comes along, its speakers do not
    const other = new Store({ getItem: () => null, setItem: () => undefined });
    other.settings.bandCoupling = [9, 9];
    expect(other.restore(backup)).toBe(true);
    expect(other.settings.band).toBe('click');
    expect(other.settings.bandCoupling).toEqual([9, 9]);
    // nonsense is not taken
    data.set('noise-floor/v1', JSON.stringify({ settings: { bandCoupling: ['x', -1] } }));
    expect(new Store(storage).settings.bandCoupling).toEqual([]);
  });
});
