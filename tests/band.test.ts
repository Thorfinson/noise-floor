/**
 * The band (src/audio/band.ts) on its own: its two arrangements, how long it is, how quick to make, how loud, and
 * where through speakers its notes go. What the listener makes of it is in tests/echo.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { CLEAR_AFTER, CLEAR_BEFORE, LAYERS, renderBand, SHORT_MAX } from '../src/audio/band';
import { FFT } from '../src/audio/fft';
import { addNoise } from '../src/audio/synth';
import { mixOf, peak, song } from './bandhelp';
import { listen, SR } from './helpers';

describe('the band', () => {
  it('is as long as asked, every layer alike; a loop is exactly its bars long', () => {
    const o = song('phones', 'beat', 4);
    const p = renderBand(o);
    for (const l of LAYERS) expect(p.layers[l].length, l).toBe(p.layers.drums.length);
    expect(p.length).toBeCloseTo(4 * 8 * 0.3 + 2, 2);
    const loop = renderBand({ ...o, loop: true });
    expect(loop.layers.drums.length).toBe(Math.round(4 * 8 * 0.3 * SR));
    expect(loop.loop).toBe(true);
    expect(loop.mode).toBe('phones');
  });

  it('makes a minute of music in a fraction of a second, both arrangements', () => {
    const minute = song('phones', 'folk', 25);
    renderBand(minute);
    const t0 = performance.now();
    renderBand(minute);
    renderBand({ ...minute, mode: 'speakers' });
    // about 80 ms here; the browser must not freeze when a lesson starts
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('never clips with every layer at full gain and the engine at its volume, however dense the chords', () => {
    for (const feel of ['beat', 'pop', 'chug', 'waltz', 'six']) {
      for (const mode of ['phones', 'speakers'] as const) {
        const o = song(mode, feel, 8);
        // a new chord on every click
        const dense = { ...o, chords: o.clicks.map((c, i) => ({ u: c.u, id: ['G', 'C', 'D', 'Em', 'Am', 'F', 'Bm'][i % 7] })) };
        expect(peak(mixOf(renderBand(dense))) * 0.9, `${feel} ${mode}`).toBeLessThan(0.99);
      }
    }
  });

  it('under headphones: the root in the bass where each chord begins, the chord around middle C, the fiddle above', () => {
    const p = renderBand(song('phones', 'beat', 4));
    const at = (layer: string, t: number) => p.events.find((e) => e.layer === layer && Math.abs(e.t - t) < 1e-3);
    // G, Em, C, D, a bar of 2.4 s each: the bass on the root at each bar line
    expect([0, 2.4, 4.8, 7.2].map((t) => (at('bass', t)?.midis[0] ?? -1) % 12)).toEqual([7, 4, 0, 2]);
    expect(at('keys', 0)?.midis.map((m) => m % 12).sort((a, b) => a - b)).toEqual([2, 7, 11]);
    for (const e of p.events.filter((x) => x.layer === 'keys')) for (const m of e.midis) expect(m).toBeGreaterThanOrEqual(52), expect(m).toBeLessThanOrEqual(76);
    for (const e of p.events.filter((x) => x.layer === 'lead')) expect(e.midis[0]).toBeGreaterThanOrEqual(69);
    // the drums: something low on every bar line (the kick)
    const fft = new FFT(2048);
    const mag = new Float32Array(1025);
    for (const t of [0, 2.4, 4.8]) {
      fft.magnitudes(p.layers.drums, mag, Math.round(t * SR));
      let low = 0;
      for (let k = 1; k < Math.round((150 * 2048) / SR); k++) low = Math.max(low, mag[k]);
      expect(low, `kick at ${t}`).toBeGreaterThan(0.05);
    }
  });

  it('follows the meter: the waltz has its chords on two and three, six-eight its snare on the second beat', () => {
    const waltz = renderBand(song('phones', 'waltz', 2));
    // three beats of 0.6 s: the keys on 0.6 and 1.2
    expect(waltz.events.filter((e) => e.layer === 'keys' && e.t < 1.75).map((e) => +e.t.toFixed(2))).toEqual([0.6, 1.2]);
    const six = renderBand(song('phones', 'six', 2));
    expect(six.events.filter((e) => e.layer === 'keys' && e.t < 1.75).map((e) => +e.t.toFixed(2))).toEqual([0, 0.9]);
  });

  it('through speakers: drums only above 7 kHz, which the listener does not hear, as loud as a guitar', () => {
    const p = renderBand(song('speakers', 'pop', 6));
    const d = p.layers.drums;
    const fft = new FFT(4096);
    const mag = new Float32Array(2049);
    let low = 0;
    let all = 0;
    for (let at = 0; at + 4096 < d.length; at += 2048) {
      fft.magnitudes(d, mag, at);
      for (let k = 1; k < 2049; k++) {
        const pw = mag[k] * mag[k];
        all += pw;
        if ((k * SR) / 4096 < 6000) low += pw;
      }
    }
    expect(low / all).toBeLessThan(0.001);
    // as loud as a strummed guitar at the microphone, and nothing is heard of it
    const sig = new Float32Array(d.length);
    const k = 0.4 / peak(d);
    for (let i = 0; i < d.length; i++) sig[i] = k * d[i];
    addNoise(sig, 0.0015);
    const h = listen(sig, (l) => (l.chordCandidates = ['G', 'Em', 'C', 'D', 'Am']));
    expect(h.onsets).toEqual([]);
    expect(h.notes).toEqual([]);
    expect(h.chords).toEqual([]);
  });

  it('through speakers: short notes, only in the gaps between the strums, every one of them listed', () => {
    for (const feel of ['beat', 'folk', 'pop', 'waltz', 'six']) {
      const o = song('speakers', feel, 8);
      const p = renderBand(o);
      expect(p.events.length, feel).toBeGreaterThan(8);
      // the pattern's strokes are where the player strums
      const slots: Record<string, string> = { beat: 'D.D.D.D.', folk: 'D.DUD.DU', pop: 'D.DU.UDU', waltz: 'D.D.D.', six: 'D..D..' };
      const bar = slots[feel].length;
      const strums: number[] = [];
      for (let u = 0; u < o.units + bar; u += bar) [...slots[feel]].forEach((c, i) => (c !== '.' ? strums.push((u + i) * o.unit) : undefined));
      for (const e of p.events) {
        expect(e.layer, feel).not.toBe('drums');
        expect(e.dur, feel).toBeLessThanOrEqual(SHORT_MAX + 0.06);
        expect(e.strength).toBeGreaterThan(0);
        expect(e.strength).toBeLessThanOrEqual(1);
        for (const s of strums) {
          // never on a strum, nor in the moments after it the strum is judged from, nor ringing into the next
          expect(e.t - s >= CLEAR_AFTER - 1e-6 || s - e.t >= 0.1, `${feel}: a note at ${e.t.toFixed(2)} by a strum at ${s.toFixed(2)}`).toBe(true);
          if (s > e.t) expect(s - (e.t + e.dur) >= CLEAR_BEFORE - 0.05, `${feel}: a note at ${e.t.toFixed(2)} into a strum at ${s.toFixed(2)}`).toBe(true);
        }
      }
      expect(p.events.map((e) => e.t)).toEqual([...p.events.map((e) => e.t)].sort((a, b) => a - b));
    }
  });

  it('through speakers keeps clear of the strums it is told of, also off the pattern', () => {
    const o = song('speakers', 'beat', 4, 0.3, { strums: [0, 3, 8, 11, 16, 19, 24, 27] });
    const p = renderBand(o);
    for (const e of p.events) for (const u of o.strums!) expect(Math.abs(e.t - u * 0.3) >= 0.1).toBe(true);
    expect(p.events.length).toBeGreaterThan(4);
  });

  it('goes round without a seam: what rings past its end is folded onto its beginning', () => {
    const p = renderBand(song('phones', 'beat', 2, 0.3, { loop: true }));
    const x = mixOf(p);
    let jump = 0;
    for (let i = 1; i < x.length; i++) jump = Math.max(jump, Math.abs(x[i] - x[i - 1]));
    expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThanOrEqual(jump);
    // the fiddle's last note rings on into the start: the beginning is not silent before its first note
    expect(peak(p.layers.lead.subarray(0, 200))).toBeGreaterThan(0);
  });
});
