/** The speaker test of the hearing check (src/core/bandcheck.ts), over the band through a plain room. */
import { describe, expect, it } from 'vitest';
import { BandEcho } from '../src/audio/echo';
import { Listener } from '../src/audio/listener';
import { addNoise, mixInto, strum } from '../src/audio/synth';
import { BandCheck, LEARN_END, PLAY_END, QUIET_END, TEST_CHORDS, testBand, testChordAt } from '../src/core/bandcheck';
import { chordNotes, CHORDS } from '../src/music/theory';
import { mixOf, room } from './bandhelp';
import { SR } from './helpers';

describe('the speaker test', () => {
  /** The test as the screen runs it, over a signal: the band through a room, and what the player does. */
  function run(sig: Float32Array, at: number, skip = false): BandCheck {
    const l = new Listener(SR);
    l.chordCandidates = [...TEST_CHORDS, 'Am'];
    const parts = testBand(SR, 440);
    l.bands = [new BandEcho(parts, { drums: 1, bass: 1, keys: 1, lead: 1 }, 1, at * SR)];
    const c = new BandCheck(l, at);
    if (skip) c.skip();
    l.onOnset = (e) => c.onset(e);
    l.onNote = (e) => c.note(e);
    l.onChord = (e) => c.chord(e);
    for (let i = 0; i < sig.length; i += 512) {
      l.push(sig.subarray(i, i + 512));
      c.tick(l.time);
    }
    return c;
  }
  const at = 0.5;
  const parts = testBand(SR, 440);
  /** the band going round for the whole test */
  const loop = (): Float32Array => {
    const one = mixOf(parts);
    const all = new Float32Array(Math.ceil((PLAY_END + 1) * SR));
    for (let k = 0; k * one.length < all.length; k++) all.set(one.subarray(0, Math.min(one.length, all.length - k * one.length)), k * one.length);
    return all;
  };
  const length = Math.round((at + PLAY_END + 1) * SR);

  it('finds the band safe when nothing is taken for playing, and the strums along are heard', () => {
    const sig = room(loop(), at, length);
    // strumming along: a strum on every beat, the chord of the bar
    const beat = 60 / 90;
    for (let k = Math.ceil((QUIET_END + 2.2) / beat); k * beat < PLAY_END - 0.5; k++) mixInto(sig, strum(chordNotes(CHORDS[testChordAt(k * beat + 0.01)]), SR, 0.6), (at + k * beat) * SR);
    const c = run(sig, at);
    expect(c.learned?.fit).toBeGreaterThan(0.5);
    expect(c.phantoms).toEqual({ onsets: 0, notes: 0, chords: 0 });
    expect(c.strums).toBeGreaterThan(10);
    expect(c.right / c.strums).toBeGreaterThan(0.8);
    expect(c.phase).toBe('done');
    expect(c.verdict()).toBe('safe');
  });

  it('finds it not safe when, while the player keeps still, something is taken for playing', () => {
    const sig = room(loop(), at, length);
    // the room is loud of its own: someone else plays a chord now and then
    for (const t of [LEARN_END + 3, LEARN_END + 8, LEARN_END + 12]) mixInto(sig, strum(chordNotes(CHORDS.Am), SR, 1), (at + t) * SR);
    const c = run(sig, at, true);
    expect(c.phantoms.chords).toBeGreaterThan(0);
    expect(c.verdict()).toBe('unsafe');
  });

  it('says so when the microphone does not hear the band at all (headphones)', () => {
    const sig = new Float32Array(length);
    addNoise(sig, 0.0015);
    const c = run(sig, at, true);
    expect(c.heard).toBe(false);
    expect(c.verdict()).toBe('unheard');
    expect(c.phase).toBe('done');
  });
});
