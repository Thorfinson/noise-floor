import { describe, expect, it } from 'vitest';
import { lineStarts, songSound } from '../src/audio/songsound';
import { tuneOf } from '../src/music/accompany';
import { findSong } from '../src/music/content';
import { songMaterial } from '../src/music/material';

describe('a song as it sounds, to hear before learning it', () => {
  const song = findSong('amazing-grace-chords');
  const m = songMaterial(song);
  const tune = tuneOf(song)!;

  it('has the tune of Amazing Grace, with its words, over the chords', () => {
    expect(tune.melody.length).toBeGreaterThan(30);
    expect(tune.words?.flat().filter((w) => w && w !== '_').join(' ')).toMatch(/^A- ma- zing grace/);
    // the upbeat "A-" comes before the first bar
    expect(tune.melody[0].u).toBeLessThan(0);
  });

  it('renders the whole song at the length it is written, upbeat included', () => {
    const sr = 16000;
    const s = songSound(m, { sr, speed: 1, instrument: true, tune: tune.melody });
    const units = lineStarts(m).at(-1)! + m.lines.at(-1)!.units;
    expect(s.to - s.from).toBe(units);
    // the upbeat sounds before the first bar: the first bar starts later than the sound
    expect(s.t0).toBeGreaterThan(m.noteDur * 0.9);
    expect(s.samples.length / sr).toBeGreaterThan(units * m.noteDur);
    const peak = s.samples.reduce((p, x) => Math.max(p, Math.abs(x)), 0);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(0.85 + 1e-6);
  });

  it('plays slower when asked, and only the lines asked for', () => {
    const sr = 16000;
    const whole = songSound(m, { sr, speed: 1, instrument: true, tune: tune.melody });
    const slow = songSound(m, { sr, speed: 0.7, instrument: true, tune: tune.melody });
    expect(slow.samples.length).toBeGreaterThan(whole.samples.length * 1.3);
    const line2 = songSound(m, { sr, speed: 1, instrument: true, tune: tune.melody, lines: [1, 1] });
    expect(line2.to - line2.from).toBe(m.lines[1].units);
    expect(line2.samples.length).toBeLessThan(whole.samples.length / 2);
  });

  it('can leave out the tune or the chords', () => {
    const sr = 16000;
    const quiet = (b: Float32Array) => b.every((x) => x === 0);
    expect(quiet(songSound(m, { sr, speed: 1, instrument: false, tune: null }).samples)).toBe(true);
    expect(quiet(songSound(m, { sr, speed: 1, instrument: false, tune: tune.melody }).samples)).toBe(false);
    expect(quiet(songSound(m, { sr, speed: 1, instrument: true, tune: null }).samples)).toBe(false);
  });
});
