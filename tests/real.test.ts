/**
 * The listener against recordings of a real guitar and a real piano (see tests/real/clips.ts).
 * Skipped when the clips have not been fetched: `npm run samples` gets them.
 *
 * The recordings are single notes, so everything else is put together from them: a note on a string ends
 * the one before it on that string, strums are the strings one after the other 14 ms apart. Room hiss,
 * rumble below hearing and a constant offset lie underneath, as a microphone delivers them.
 */
import { describe, expect, it } from 'vitest';
import { Listener, type NoteEvent, type StringEvent } from '../src/audio/listener';
import { yin } from '../src/audio/yin';
import { MuteGesture } from '../src/game/gesture';
import { CHORD_PAIRS } from '../src/music/content';
import { CHORDS, chordMidis, FOLLOW_AFTER, midiToFreq, nearestString, noteName, OPEN_STRINGS, OVERTONE_STEPS, STRING_NAMES } from '../src/music/theory';
import { guitar, hasGuitar, hasPiano, haveGuitar, havePiano, haveSteel, mix, onStrings, piano, room, SR, steel, steelClips, type Loudness, type Played } from './real/clips';
import { havePieces, pieces } from './real/pieces';
import { haveVoices, loadTrack, measure, trackIds, type TrackResult } from './real/voices';
import { judge, voiceBed } from './real/singalong';
import { judgeChordBass, judgePair } from './real/twohands';
import { haveSlides, hearLegato, joined, slides } from './real/legato';
import { guitarCheckSet, pianoCheckSet } from './real/checkset';
import { checkRecording } from '../src/core/checkrun';
import { TOGETHER_GAPS } from '../src/music/content';

/** The guitar in the recordings is tuned about 20 cents low. The tuner would have set the reference to match. */
const GUITAR_A4 = 435;
/** The piano is a few cents high; the app measures that at the start of a piano session. */
const PIANO_A4 = 441;
/** As if the microphone were set so that a normal note is comfortably loud. */
const GUITAR_GAIN = 3;
const PIANO_GAIN = 4;

function run(sig: Float32Array, a4: number, setup?: (l: Listener) => void, during?: (l: Listener, t: number) => void) {
  const l = new Listener(SR);
  l.a4 = a4;
  const notes: NoteEvent[] = [];
  const strings: StringEvent[] = [];
  const onsets: number[] = [];
  const thuds: number[] = [];
  const chords: string[] = [];
  l.onNote = (e) => notes.push(e);
  l.onString = (e) => strings.push(e);
  l.onOnset = (e) => onsets.push(e.time);
  // only what was struck and then silent; a hand that merely stops a ringing string is reported too, but is no hit
  l.onThud = (e) => {
    if (e.hit) thuds.push(e.time);
  };
  // the same thresholds the game uses
  l.onChord = (e) => {
    if (e.best && e.score > 0.6 && e.margin > 0.08) chords.push(e.best);
  };
  setup?.(l);
  for (let i = 0; i < sig.length; i += 512) {
    during?.(l, i / SR);
    l.push(sig.subarray(i, i + 512));
  }
  return { notes, strings, onsets, thuds, chords };
}
const names = (m: number[]): string => m.map(noteName).join(' ');
const fret = (m: number, s: number): number => m - OPEN_STRINGS[s];

const clips: [number, number, Loudness][] = [];
for (const d of ['mf', 'pp', 'ff'] as const) for (let s = 0; s < 6; s++) for (let m = 40; m <= 76; m++) if (hasGuitar(m, s, d)) clips.push([m, s, d]);

/** One bar of the song's picking pattern over a chord. */
const bar = (chord: string): { midi: number; string: number }[] => {
  const m = chordMidis(CHORDS[chord]);
  const bass = m.findIndex((x) => x !== null);
  return [bass, 3, 4, 5, 4, 3].map((s) => ({ midi: m[s]!, string: s }));
};

/** How many of the played notes were heard as themselves, once, at their time. */
function heardRight(played: number[], gap: number, notes: NoteEvent[], start = 0.5): { right: number; wrong: string[] } {
  const wrong: string[] = [];
  played.forEach((m, i) => {
    const got = notes.filter((e) => Math.abs(e.time - (start + i * gap)) < gap / 2);
    if (got.length !== 1 || got[0].midi !== m) wrong.push(`note ${i + 1} ${noteName(m)}: ${got.length ? names(got.map((e) => e.midi)) : 'not heard'}`);
  });
  return { right: played.length - wrong.length, wrong };
}

describe.skipIf(!haveGuitar)('a real guitar', () => {
  it('names single notes on every string, soft, normal and loud', () => {
    for (const [dyn, allowed] of [['mf', 0], ['ff', 0], ['pp', 2]] as const) {
      const wrong: string[] = [];
      const noisy: string[] = [];
      const set = clips.filter((c) => c[2] === dyn);
      for (const [m, s] of set) {
        const r = run(mix([{ clip: guitar(m, s, dyn), at: 0.6, gain: GUITAR_GAIN }], 2.8), GUITAR_A4);
        if (names(r.notes.map((n) => n.midi)) !== noteName(m)) wrong.push(`${noteName(m)} on string ${s}: ${names(r.notes.map((n) => n.midi)) || 'nothing'}`);
        if (r.onsets.length !== 1 || r.thuds.length) noisy.push(`${noteName(m)} on string ${s}: ${r.onsets.length} onsets, ${r.thuds.length} thuds`);
        // in the first five frets a ringing note is never taken for a hit on muted strings
        if (fret(m, s) <= 5) expect(r.thuds.length, `${dyn}: ${noteName(m)} on string ${s}`).toBe(0);
      }
      expect(wrong.length, `${dyn}: ${wrong.join('; ')}`).toBeLessThanOrEqual(allowed);
      // one onset for one note (one of the recordings has a noise of its own in the middle of the note;
      // two notes far up the A string die so fast on this guitar that they do count as dead)
      expect(noisy.length, `${dyn}: ${noisy.join('; ')}`).toBeLessThanOrEqual(3);
    }
  });

  it('reads the open strings steadily enough to tune by', () => {
    for (let s = 0; s < 6; s++) {
      const c = guitar(OPEN_STRINGS[s], s);
      const cents: number[] = [];
      for (let at = 0.15; at < 1.6; at += 0.05) {
        const p = yin(c.subarray(Math.floor(at * SR), Math.floor(at * SR) + 4096), SR);
        if (p && p.clarity > 0.8) cents.push(1200 * Math.log2(p.freq / midiToFreq(OPEN_STRINGS[s])));
      }
      const mid = cents.slice().sort((a, b) => a - b)[cents.length >> 1];
      expect(cents.length, `string ${s}`).toBeGreaterThan(20);
      // this guitar is 15 to 40 cents flat; what matters is that the readings agree with each other
      expect(mid, `string ${s}`).toBeLessThan(-10);
      expect(cents.filter((c2) => Math.abs(c2 - mid) <= 5).length / cents.length, `string ${s}: ${cents.map((x) => Math.round(x)).join(' ')}`).toBeGreaterThan(0.85);
    }
  });

  it('calls clean notes clean in the string check, and never buzzing', () => {
    for (const [title, set, allowed] of [
      ['frets 0 to 5, normal and loud', clips.filter(([m, s, d]) => d !== 'pp' && fret(m, s) <= 5), 1],
      ['frets 0 to 5, soft', clips.filter(([m, s, d]) => d === 'pp' && fret(m, s) <= 5), 1],
    ] as const) {
      const odd: string[] = [];
      for (const [m, s, d] of set) {
        const v = run(mix([{ clip: guitar(m, s, d), at: 0.6, gain: GUITAR_GAIN }], 2.4), GUITAR_A4, (l) => {
          l.noteDetection = false;
          l.startStringCheck(m);
        }).strings[0];
        expect(v?.result, `${title}: ${noteName(m)} on string ${s}`).not.toBe('buzz');
        expect(v?.result, `${title}: ${noteName(m)} on string ${s}`).not.toBe('wrong');
        if (v?.result !== 'clean') odd.push(`${noteName(m)} on string ${s} ${d}: ${v ? `${v.result}, ring ${v.ring.toFixed(2)}` : 'no verdict'}`);
      }
      expect(odd.length, `${title}: ${odd.join('; ')}`).toBeLessThanOrEqual(allowed);
    }
  });

  it('calls a note that a finger stops at once muted', () => {
    for (const [m, s] of [[45, 1], [52, 2], [57, 3], [59, 4], [64, 5]] as const) {
      for (const dur of [0.06, 0.15]) {
        const v = run(mix([{ clip: guitar(m, s), at: 0.6, gain: GUITAR_GAIN, dur }], 2.4), GUITAR_A4, (l) => {
          l.noteDetection = false;
          l.startStringCheck(m);
        }).strings[0];
        expect(v?.result, `${noteName(m)} stopped after ${dur} s`).toBe('muted');
      }
    }
  });

  it("follows the song's picking pattern through nine bars, at full speed and slower, told or not told what comes", () => {
    const song = ['Am', 'C', 'D', 'F', 'Am', 'C', 'E', 'E', 'Am'].flatMap(bar);
    for (const gap of [0.26, 0.6]) {
      const sig = onStrings(song, gap, 'mf', GUITAR_GAIN);
      const free = run(sig, GUITAR_A4);
      const a = heardRight(song.map((n) => n.midi), gap, free.notes);
      expect(a.right, `a note every ${gap} s, free: ${a.wrong.join('; ')}`).toBeGreaterThanOrEqual(song.length - 1);
      const guided = run(sig, GUITAR_A4, undefined, (l, t) => (l.expected = [song[Math.max(0, Math.min(song.length - 1, Math.floor((t - 0.5 - 0.12 + gap / 2) / gap)))].midi]));
      const b = heardRight(song.map((n) => n.midi), gap, guided.notes);
      expect(b.right, `a note every ${gap} s, guided: ${b.wrong.join('; ')}`).toBe(song.length);
      // strings left ringing are heard as still sounding when the next note comes
      const held = free.notes.map((e) => e.held).filter((h) => h >= 0);
      expect(held.filter((h) => h >= 0.05).length / held.length, `a note every ${gap} s`).toBeGreaterThan(0.95);
    }
  });

  it('follows finger patterns up and down each string, a semitone at a time', () => {
    for (const [gap, allowed] of [[0.3, 1], [0.2, 4]] as const) {
      const wrong: string[] = [];
      for (let s = 0; s < 6; s++) {
        const first = OPEN_STRINGS[s] + (s === 0 || s === 5 ? 4 : 5);
        const midis = [0, 1, 2, 3, 3, 2, 1, 0, 0, 2, 1, 3].map((d) => first + d);
        const r = run(onStrings(midis.map((midi) => ({ midi, string: s })), gap, 'mf', GUITAR_GAIN), GUITAR_A4);
        wrong.push(...heardRight(midis, gap, r.notes).wrong.map((w) => `string ${s} ${w}`));
      }
      expect(wrong.length, `a note every ${gap} s: ${wrong.join('; ')}`).toBeLessThanOrEqual(allowed);
    }
  });

  it('tells the chords of every chord change apart, and hears each strum once', () => {
    const strum = (id: string, at: number, dur?: number): Played[] =>
      chordMidis(CHORDS[id])
        .map((m, s) => ({ m, s }))
        .filter((x) => x.m !== null && hasGuitar(x.m, x.s))
        .map((x, i) => ({ clip: guitar(x.m!, x.s), at: at + i * 0.014, dur: dur === undefined ? undefined : dur - i * 0.014, gain: GUITAR_GAIN * 0.6 }));
    const wrong: string[] = [];
    const pairs: [string, string][] = [...CHORD_PAIRS, ['Em', 'G'], ['E', 'Em'], ['A', 'Am'], ['D', 'Dm'], ['C', 'Am'], ['G', 'Bm'], ['F', 'Dm'], ['E', 'A']];
    for (const [a, b] of pairs) {
      // a, b, a: the hand lets go a moment before each change
      const r = run(mix([...strum(a, 0.6, 0.85), ...strum(b, 1.6, 0.85), ...strum(a, 2.6)], 4.4), GUITAR_A4, (l) => {
        l.noteDetection = false;
        l.chordCandidates = [a, b];
      });
      if (r.chords.join() !== `${a},${b},${a}`) wrong.push(`${a} ${b} ${a}: ${r.chords.join(' ') || 'nothing'}`);
    }
    expect(wrong.length, wrong.join('; ')).toBeLessThanOrEqual(1);
  });

  it('does not take one plucked note inside a ringing chord for a strum', () => {
    const chord: Played[] = chordMidis(CHORDS.Em).map((m, s) => ({ clip: guitar(m!, s), at: 0.6 + s * 0.014, gain: GUITAR_GAIN * 0.6 }));
    const r = run(mix([...chord, { clip: guitar(52, 2), at: 1.3, gain: GUITAR_GAIN * 0.6 }], 3), GUITAR_A4, (l) => {
      l.noteDetection = false;
      l.chordCandidates = ['Em', 'G'];
    });
    expect(r.chords).toEqual(['Em']);
  });
});

describe.skipIf(!havePiano)('a real piano', () => {
  const set: [number, Loudness][] = [];
  for (let m = 43; m <= 79; m++) if (hasPiano(m)) set.push([m, 'mf']);
  for (const m of [60, 62, 64, 65, 67, 69]) for (const d of ['pp', 'ff'] as const) if (hasPiano(m, d)) set.push([m, d]);

  it('names single keys over three octaves, soft, normal and loud', () => {
    const wrong: string[] = [];
    for (const [m, d] of set) {
      const r = run(mix([{ clip: piano(m, d), at: 0.6, gain: PIANO_GAIN }], 2.8), PIANO_A4);
      if (names(r.notes.map((n) => n.midi)) !== noteName(m)) wrong.push(`${noteName(m)} ${d}: ${names(r.notes.map((n) => n.midi)) || 'nothing'}`);
    }
    expect(wrong.length, wrong.join('; ')).toBeLessThanOrEqual(1);
  });

  it('follows melodies and five-finger patterns in both hands, joined up and detached, slow and fast', () => {
    const tunes: Record<string, number[]> = {
      'Ode to Joy': [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62],
      'Für Elise': [76, 75, 76, 75, 76, 71, 74, 72, 69],
      'left hand in C': [48, 50, 52, 53, 55, 53, 52, 50, 48],
      'left hand in G': [43, 45, 47, 48, 50, 48, 47, 45, 43],
      thirds: [60, 64, 62, 65, 64, 67],
      Twinkle: [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60],
    };
    const wrong: string[] = [];
    for (const [name, tune] of Object.entries(tunes)) {
      for (const gap of [0.5, 0.3, 0.22]) {
        for (const hold of [1.0, 0.5]) {
          // the same key twice is always let go in between
          const played: Played[] = tune.map((m, i) => ({ clip: piano(m), at: 0.6 + i * gap, dur: tune[i + 1] === m ? gap * Math.min(hold, 0.7) : gap * hold + (hold >= 1 ? 0.03 : 0), gain: PIANO_GAIN }));
          const got = run(mix(played, 0.6 + tune.length * gap + 1.2), PIANO_A4).notes.map((n) => n.midi);
          if (names(got) !== names(tune)) wrong.push(`${name}, a note every ${gap} s, ${hold >= 1 ? 'joined up' : 'detached'}: ${names(got)}`);
        }
      }
    }
    expect(wrong.length, wrong.join('; ')).toBeLessThanOrEqual(1);
  });

  it('hears joined-up notes as joined up and detached ones as detached', () => {
    const tune = [60, 62, 64, 65, 67];
    for (const [hold, joined] of [[1.0, true], [0.4, false]] as const) {
      const played: Played[] = tune.map((m, i) => ({ clip: piano(m), at: 0.6 + i * 0.4, dur: 0.4 * hold + (joined ? 0.03 : 0), gain: PIANO_GAIN }));
      const held = run(mix(played, 4), PIANO_A4).notes.slice(1).map((n) => n.held);
      expect(held.length).toBe(4);
      expect(held.every((h) => (joined ? h >= 0.05 : h < 0.05)), `${joined ? 'joined up' : 'detached'}: ${held.map((h) => h.toFixed(2)).join(' ')}`).toBe(true);
    }
  });

  it('passes a scale of held keys in the key-by-key check, and not one of keys let go at once', () => {
    const scale = [60, 62, 64, 65, 67, 69, 71, 72];
    for (const hold of [0.9, 0.2]) {
      const l = new Listener(SR);
      l.a4 = PIANO_A4;
      l.noteDetection = false;
      l.buzzThreshold = Infinity;
      const results: string[] = [];
      let next = 0;
      l.onString = (e) => {
        results.push(e.result);
        if (e.result === 'clean') next++;
        if (next < scale.length) l.startStringCheck(scale[next]);
      };
      l.startStringCheck(scale[0]);
      const sig = mix(scale.map((m, i) => ({ clip: piano(m), at: 0.6 + i, dur: hold, gain: PIANO_GAIN })), 9.5);
      for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
      if (hold > 0.5) expect(results, 'held').toEqual(Array(8).fill('clean'));
      else expect(results[0], 'let go').toBe('muted');
    }
  });

  it("measures the piano's A on its fundamental, also while the key next to it still sounds", () => {
    for (const dyn of ['mf', 'ff'] as const) {
      for (const neighbour of [false, true]) {
        const got: number[] = [];
        const played: Played[] = [{ clip: piano(69, dyn), at: 1.0, gain: PIANO_GAIN }];
        if (neighbour) played.push({ clip: piano(70), at: 0.5, gain: PIANO_GAIN * 0.6 });
        run(mix(played, 3), 440, (l) => {
          l.noteDetection = false;
          l.partialBand = [330, 587];
          l.onPartial = (e) => {
            if (e.level >= 0.004 && e.time > 1.25 && e.time < 2) got.push(e.freq);
          };
        });
        const mid = got.slice().sort((a, b) => a - b)[got.length >> 1];
        expect(got.length, `${dyn}${neighbour ? ' with A♯' : ''}`).toBeGreaterThan(12);
        // this piano's A is at 441 Hz
        expect(Math.abs(mid - 441.1), `${dyn}${neighbour ? ' with A♯' : ''}: ${mid?.toFixed(2)} Hz`).toBeLessThan(0.8);
      }
    }
  });
});

/**
 * Three steel-string electric guitars, recorded directly (IDMT-SMT-Guitar): plain notes, notes played with
 * the hand lying on the strings, and dead notes, where the string is touched but not pressed down.
 */
describe.skipIf(!haveSteel)('real steel-string guitars', () => {
  const of = (kind: 'normal' | 'muted' | 'dead') => steelClips.filter((c) => c.kind === kind);
  const check = (c: (typeof steelClips)[number], ring?: number): StringEvent | undefined =>
    run(mix([{ clip: steel(c), at: 0.6 }], 2.2), 440, (l) => {
      l.noteDetection = false;
      if (ring) l.ringThreshold = ring;
      l.startStringCheck(c.midi);
    }).strings[0];

  it('names plain notes once, and calls them clean', () => {
    const wrong: string[] = [];
    for (const c of of('normal')) {
      // as in a lesson: the listener is told which note is expected
      const r = run(mix([{ clip: steel(c), at: 0.6 }], 2.4), 440, (l) => (l.expected = [c.midi]));
      if (names(r.notes.map((n) => n.midi)) !== noteName(c.midi)) wrong.push(`${c.guitar} ${noteName(c.midi)} on string ${c.string}: ${names(r.notes.map((n) => n.midi)) || 'nothing'}`);
      // the player stops every note with the hand: that is not a hit on muted strings
      expect(r.thuds, `${c.guitar} ${noteName(c.midi)} on string ${c.string}`).toEqual([]);
      expect(check(c)?.result, `${c.guitar} ${noteName(c.midi)} on string ${c.string}`).toBe('clean');
    }
    expect(wrong.length, wrong.join('; ')).toBeLessThanOrEqual(2);
  });

  it('calls every dead note muted, never clean and never another string, and hears it as a hit that left nothing', () => {
    let thuds = 0;
    let asNote = 0;
    for (const c of of('dead')) {
      expect(check(c)?.result, `${c.guitar} ${noteName(c.midi)} on string ${c.string}`).toBe('muted');
      const r = run(mix([{ clip: steel(c), at: 0.6 }], 2.2), 440, (l) => (l.expected = [c.midi]));
      if (r.thuds.length === 1) thuds++;
      if (r.notes.length) asNote++;
    }
    expect(thuds).toBeGreaterThanOrEqual(of('dead').length - 3);
    // now and then a dead string is still taken for a note in a lesson, but rarely
    expect(asNote).toBeLessThanOrEqual(of('dead').length * 0.15);
  });

  it('hears two hits across dead strings as the gesture for a pause, and not as chords', () => {
    let pairs = 0;
    let tried = 0;
    for (const g of ['FS', 'LP', 'AR']) {
      for (const strings of [[0, 1, 2, 3, 4, 5], [2, 3, 4, 5], [0, 1, 2], [3, 4, 5]]) {
        for (const gap of [0.3, 0.45]) {
          const hit = (at: number): Played[] => strings.map((s, i) => ({ clip: steel(of('dead').find((c) => c.guitar === g && c.string === s && c.midi === OPEN_STRINGS[s] + 3)!), at: at + i * 0.006, gain: 0.6 }));
          const r = run(mix([...hit(1), ...hit(1 + gap)], 2.8), 440, (l) => {
            l.noteDetection = false;
            l.chordCandidates = ['Em', 'Am'];
          });
          expect(r.chords, `${g}, ${strings.length} strings`).toEqual([]);
          tried++;
          if (r.thuds.length === 2) pairs++;
        }
      }
    }
    expect(pairs).toBeGreaterThanOrEqual(tried - 2);
  });

  /** The gesture for a pause, wired to the listener as the game does it: the times at which it would pause. */
  const pauses = (sig: Float32Array, strummed = false): number[] => {
    const l = new Listener(SR);
    const g = new MuteGesture();
    const at: number[] = [];
    if (strummed) {
      l.noteDetection = false;
      l.chordCandidates = ['Em', 'Am'];
    }
    l.onOnset = (e) => g.onset(e.time);
    l.onNote = (e) => g.played(e.time);
    l.onChord = (e) => {
      if (e.best && e.score > 0.6 && e.margin > 0.08) g.played(e.time);
    };
    l.onThud = (e) => g.thud(e.time, e.hit);
    for (let i = 0; i < sig.length; i += 512) {
      l.push(sig.subarray(i, i + 512));
      if (g.due(l.time)) at.push(l.time);
    }
    return at;
  };
  const clip = (kind: 'normal' | 'dead', g: string, s: number) => steel(of(kind).find((c) => c.guitar === g && c.string === s && c.midi === OPEN_STRINGS[s] + 3)!);
  const across = (g: string, strings: number[], at: number): Played[] => strings.map((s, i) => ({ clip: clip('dead', g, s), at: at + i * 0.006, gain: 0.6 }));

  it('pauses half a second after two hits across dead strings, and after three', () => {
    for (const g of ['FS', 'LP', 'AR']) {
      for (const strings of [[0, 1, 2, 3, 4, 5], [2, 3, 4, 5], [0, 1, 2], [3, 4, 5]]) {
        for (const gap of [0.3, 0.45]) {
          const p = pauses(mix([...across(g, strings, 1), ...across(g, strings, 1 + gap)], 3.2), true);
          expect(p.length, `${g}, ${strings.length} strings, ${gap} s apart`).toBe(1);
          expect(p[0] - (1 + gap)).toBeGreaterThan(0.45);
          expect(p[0] - (1 + gap)).toBeLessThan(0.65);
        }
      }
      expect(pauses(mix([...across(g, [0, 1, 2, 3, 4, 5], 1), ...across(g, [0, 1, 2, 3, 4, 5], 1.3), ...across(g, [0, 1, 2, 3, 4, 5], 1.6)], 3.4), true).length, `${g}, three hits`).toBe(1);
    }
  });

  it('does not pause when playing goes on: two muffed notes and then a note, however soon, or a note between two of them', () => {
    for (const g of ['FS', 'LP', 'AR']) {
      for (const s of [0, 2, 4, 5]) {
        // the note that follows is struck before the listener has reported the second muffed one
        for (const gap of [0.15, 0.2, 0.25, 0.28, 0.3, 0.33, 0.4, 0.45]) {
          const sig = mix([{ clip: clip('dead', g, s), at: 1 }, { clip: clip('dead', g, s), at: 1.3 }, { clip: clip('normal', g, s), at: 1.3 + gap }], 3.6);
          expect(pauses(sig), `${g}, string ${s}, a note ${gap} s after`).toEqual([]);
        }
        const sig = mix([{ clip: clip('dead', g, s), at: 1 }, { clip: clip('normal', g, s), at: 1.25, dur: 0.2 }, { clip: clip('dead', g, s), at: 1.5 }], 3.4);
        expect(pauses(sig), `${g}, string ${s}, a short note between`).toEqual([]);
      }
    }
  });

  it('can tell notes played with the hand on the strings from ringing ones, once it knows how this guitar rings', () => {
    // a clean steel string keeps about two thirds of its sound; the app then asks for a fifth of that
    const ring = 0.2 * 0.66;
    for (const c of of('normal')) expect(check(c, ring)?.result, `${c.guitar} ${noteName(c.midi)} on string ${c.string}`).toBe('clean');
    const muted = of('muted').filter((c) => check(c, ring)?.result === 'muted').length;
    expect(muted / of('muted').length).toBeGreaterThan(0.55);
  });
});

/**
 * The single notes again, but heard across a living room by a laptop microphone: reverberation that takes
 * half a second to die away, nearly as loud as the direct sound, and little below 180 Hz. The room is
 * simulated (see room() in tests/real/clips.ts); the notes are the real ones.
 */
describe.skipIf(!haveGuitar || !haveSteel)('real notes in a simulated living room', () => {
  const inRoom = (played: Played[], seconds: number): Float32Array => room(mix(played, seconds), 0.5, 0.7);

  it('still names the notes of the nylon-string and the steel-string guitars', () => {
    let wrong = 0;
    const set = clips.filter((c) => c[2] === 'mf');
    for (const [m, s] of set) {
      const r = run(inRoom([{ clip: guitar(m, s), at: 0.6, gain: GUITAR_GAIN }], 2.8), GUITAR_A4);
      if (names(r.notes.map((n) => n.midi)) !== noteName(m)) wrong++;
    }
    expect(wrong, 'nylon').toBeLessThanOrEqual(2);
    wrong = 0;
    for (const c of steelClips.filter((x) => x.kind === 'normal')) {
      const r = run(inRoom([{ clip: steel(c), at: 0.6 }], 2.4), 440, (l) => (l.expected = [c.midi]));
      if (names(r.notes.map((n) => n.midi)) !== noteName(c.midi)) wrong++;
    }
    expect(wrong, 'steel').toBeLessThanOrEqual(5);
  });

  it('still tells clean strings from dead ones in the string check', () => {
    const verdicts = (kind: 'normal' | 'dead', ring: number): Map<string, number> => {
      const out = new Map<string, number>();
      for (const c of steelClips.filter((x) => x.kind === kind)) {
        const v = run(inRoom([{ clip: steel(c), at: 0.6 }], 2.2), 440, (l) => {
          l.noteDetection = false;
          l.ringThreshold = ring;
          l.startStringCheck(c.midi);
        }).strings[0];
        out.set(v?.result ?? 'none', (out.get(v?.result ?? 'none') ?? 0) + 1);
      }
      return out;
    };
    // the room rings on after a dead string, and a few of them pass at first ...
    expect(verdicts('normal', 0.05).get('clean')).toBe(108);
    expect(verdicts('dead', 0.05).get('clean') ?? 0).toBeLessThanOrEqual(8);
    // ... fewer once the app has learned how long this guitar rings (a fifth of two thirds)
    expect(verdicts('normal', 0.132).get('clean')).toBe(108);
    expect(verdicts('dead', 0.132).get('clean') ?? 0).toBeLessThanOrEqual(3);
  });

  it('still tells the chords of the chord changes apart', () => {
    const strum = (id: string, at: number, dur?: number): Played[] =>
      chordMidis(CHORDS[id])
        .map((m, s) => ({ m, s }))
        .filter((x) => x.m !== null && hasGuitar(x.m, x.s))
        .map((x, i) => ({ clip: guitar(x.m!, x.s), at: at + i * 0.014, dur: dur === undefined ? undefined : dur - i * 0.014, gain: GUITAR_GAIN * 0.6 }));
    const wrong: string[] = [];
    for (const [a, b] of CHORD_PAIRS) {
      const r = run(inRoom([...strum(a, 0.6, 0.85), ...strum(b, 1.6, 0.85), ...strum(a, 2.6)], 4.4), GUITAR_A4, (l) => {
        l.noteDetection = false;
        l.chordCandidates = [a, b];
      });
      if (r.chords.join() !== `${a},${b},${a}`) wrong.push(`${a} ${b} ${a}: ${r.chords.join(' ') || 'nothing'}`);
    }
    expect(wrong.length, wrong.join('; ')).toBeLessThanOrEqual(1);
  });
});

/**
 * Whole pieces: an acoustic guitar strummed into a microphone in a real room (IDMT-SMT-Guitar, data set 4),
 * with the chords as the people who recorded them wrote them down, beat by beat.
 */
describe.skipIf(!havePieces)('real pieces, played in a real room', () => {
  it('names the chord of nearly every strum, and misses hardly any chord', () => {
    let right = 0;
    let known = 0;
    let named = 0;
    let stretches = 0;
    for (const p of pieces) {
      const ids = [...new Set(p.chords.map((c) => c.id).filter((c): c is string => !!c && !!CHORDS[c]))];
      const sure: { t: number; id: string }[] = [];
      const l = new Listener(SR);
      l.noteDetection = false;
      l.chordCandidates = ids;
      l.onChord = (e) => {
        if (e.best && e.score > 0.6 && e.margin > 0.08) sure.push({ t: e.time, id: e.best });
      };
      for (let i = 0; i < p.samples.length; i += 512) l.push(p.samples.subarray(i, i + 512));
      const written = (t: number): string | null | undefined => {
        let cur: string | null | undefined;
        for (const c of p.chords) if (c.t <= t) cur = c.id;
        return cur;
      };
      let pieceRight = 0;
      let pieceKnown = 0;
      for (const e of sure) {
        const now = written(e.t + 0.06);
        if (!now || !CHORDS[now]) continue;
        pieceKnown++;
        // a chord struck just before the beat it is written on is that chord
        if (e.id === now || e.id === written(e.t + 0.5)) pieceRight++;
      }
      expect(pieceRight / pieceKnown, `${p.name}: ${pieceRight} of ${pieceKnown}`).toBeGreaterThanOrEqual(0.88);
      right += pieceRight;
      known += pieceKnown;
      p.chords.forEach((c, i) => {
        if (!c.id || !CHORDS[c.id] || c.t > p.samples.length / SR - 0.5) return;
        const end = p.chords[i + 1]?.t ?? p.samples.length / SR;
        stretches++;
        if (sure.some((e) => e.t >= c.t - 0.5 && e.t < end - 0.06 && e.id === c.id)) named++;
      });
    }
    expect(right / known, `${right} of ${known} strums`).toBeGreaterThanOrEqual(0.93);
    expect(named / stretches, `${named} of ${stretches} chords`).toBeGreaterThanOrEqual(0.95);
  });
});

/**
 * The tuner follows whatever string is plucked. That only works if a plucked string is never taken for
 * another one: a pitch read an octave out would turn the tuner to the wrong string, and its advice with it.
 */
describe.skipIf(!haveGuitar || !haveSteel)('the tuner on real open strings', () => {
  /** The strings the tuner would turn to while this is heard, starting with another string on show. */
  const turnsTo = (sig: Float32Array, a4: number, start: number): number[] => {
    const l = new Listener(SR);
    l.a4 = a4;
    l.pitchTracking = true;
    l.noteDetection = false;
    let at = start;
    let cand = -1;
    let n = 0;
    const out: number[] = [];
    l.onPitch = (e) => {
      const heard = nearestString(e.freq, a4);
      if (heard === at) {
        cand = -1;
        n = 0;
        return;
      }
      n = cand === heard ? n + 1 : 1;
      cand = heard;
      if (n >= FOLLOW_AFTER) out.push((at = heard));
    };
    for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
    return out;
  };
  const followed = (sig: Float32Array, a4: number, s: number, what: string): void => {
    // whichever string was on show before: it turns to the plucked one, and to no other on the way
    for (let start = 0; start < 6; start++) if (start !== s) expect(turnsTo(sig, a4, start).map((x) => STRING_NAMES[x]), `${what}, ${STRING_NAMES[s]} string, with ${STRING_NAMES[start]} on show`).toEqual([STRING_NAMES[s]]);
  };

  it('turns to the string that is plucked and to no other: nylon strings, soft, normal and loud', () => {
    let tried = 0;
    for (const dyn of ['pp', 'mf', 'ff'] as Loudness[]) {
      for (let s = 0; s < 6; s++) {
        if (!hasGuitar(OPEN_STRINGS[s], s, dyn)) continue;
        followed(mix([{ clip: guitar(OPEN_STRINGS[s], s, dyn), at: 0.6, gain: GUITAR_GAIN }], 3.2), GUITAR_A4, s, `nylon ${dyn}`);
        tried++;
      }
    }
    expect(tried).toBeGreaterThanOrEqual(12);
  });

  it('turns to the string that is plucked and to no other: three steel-string guitars', () => {
    const open = steelClips.filter((c) => c.kind === 'normal' && c.midi === OPEN_STRINGS[c.string]);
    expect(open.length).toBeGreaterThanOrEqual(15);
    for (const c of open) followed(mix([{ clip: steel(c), at: 0.6 }], 2.6), 440, c.string, `steel ${c.guitar}`);
  });
});

/*
 * Real voices: 40 excerpts of solo singing by 29 singers (Vocadito, CC BY 4.0), the pitch and the notes
 * written down by annotators. `npm run samples -- voice` fetches them.
 */
describe.skipIf(!haveVoices())('the listener on real singing voices', () => {
  const all: TrackResult[] = haveVoices() ? trackIds().map((id) => measure(loadTrack(id))) : [];
  const sum = (k: keyof TrackResult): number => all.reduce((s, r) => s + (r[k] as number), 0);
  const notes = sum('notes');

  it('hears nearly all of the singing, and its readings lie on the sung pitch', () => {
    expect(all).toHaveLength(40);
    expect(sum('voicedHeard') / all.length).toBeGreaterThan(0.95);
    expect(sum('within50') / all.length).toBeGreaterThan(0.93);
    // no singer is heard much worse than the others
    for (const r of all) expect(r.within50, `excerpt ${r.id}`).toBeGreaterThan(0.85);
  });

  it('judges the notes singers held as they were written down, by the middle of each', () => {
    expect(notes).toBeGreaterThan(600);
    expect(sum('judged') / notes).toBeGreaterThan(0.97);
  });

  it('takes a held note with vibrato as held, and a semitone off hardly ever', () => {
    expect(sum('held') / notes).toBeGreaterThan(0.97);
    expect(sum('heldWrong') / (2 * notes)).toBeLessThan(0.025);
  });
});

/**
 * Playing and singing at once: the strummed pieces with a real singer of Vocadito mixed in as loud as the
 * guitar (tests/real/singalong.ts). The voice covers a strum here and there, so the sing-along page measures
 * nothing; a bar's chord is still heard in nearly every bar.
 */
describe.skipIf(!havePieces || !haveVoices())('chords heard with a voice singing over them', () => {
  it('names the chord of most strums and of nearly every stretch with a voice as loud as the guitar', () => {
    let right = 0;
    let known = 0;
    let named = 0;
    let stretches = 0;
    pieces.forEach((p, i) => {
      const r = judge(p, voiceBed(p.samples.length, i), 1);
      right += r.right;
      known += r.known;
      named += r.named;
      stretches += r.stretches;
    });
    expect(right / known, `${right} of ${known} strums`).toBeGreaterThanOrEqual(0.85);
    expect(named / stretches, `${named} of ${stretches} chords`).toBeGreaterThanOrEqual(0.92);
  });
});

/**
 * Both hands together on the piano (tests/real/twohands.ts): a bass key with a melody key is heard as the pair
 * at every distance the app uses, and never named when only the right hand plays; a root under a whole chord
 * is not heard, which is why the chords' version plays root, then chord.
 */
describe.skipIf(!havePiano)('both hands together on real piano notes', () => {
  it('hears a bass with a melody key at the distances the app uses, and never the pair from one hand alone', () => {
    let used = 0;
    let heard = 0;
    let falsePair = 0;
    for (const bass of [43, 45, 47, 48, 50, 52, 53, 55])
      for (const melody of [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79]) {
        const gap = melody - bass;
        if (gap % 12 === 0) continue;
        if (judgePair(bass, melody, false) === 'pair') falsePair++;
        if (gap < TOGETHER_GAPS[0] || gap > TOGETHER_GAPS[1] || OVERTONE_STEPS.includes(gap)) continue;
        used++;
        if (judgePair(bass, melody, true) === 'pair') heard++;
      }
    expect(used).toBeGreaterThan(30);
    expect(heard / used, `${heard} of ${used} pairs`).toBeGreaterThanOrEqual(0.95);
    expect(falsePair).toBe(0);
  });

  it('does not hear a root under a whole chord struck with it', () => {
    let full = 0;
    for (const [root, third, fifth] of [[60, 64, 67], [65, 69, 72], [67, 71, 74], [69, 72, 76]]) if (judgeChordBass(root - 12, [root, third, fifth], true) === 'full') full++;
    expect(full).toBeLessThanOrEqual(1);
  });
});

/**
 * Notes that are not plucked (tests/real/legato.ts): the pitch tracking reaches the note of a real slide, and
 * the second note of recorded notes joined without a new attack, as in a hammer-on or a pull-off.
 */
describe.skipIf(!haveSlides() || !haveSteel)('hammer-on, pull-off and slide', () => {
  it('follows the pitch to the second note without a new pluck', () => {
    const s = slides();
    expect(s.filter((x) => x.reached).length, `${s.length} slides`).toBeGreaterThanOrEqual(s.length - 1);
    const clips = steelClips.filter((c) => c.kind === 'normal');
    let n = 0;
    let reached = 0;
    for (const c of clips)
      for (const [how, step] of [['hammer', 2], ['pull', -2]] as const) {
        const other = clips.find((x) => x.guitar === c.guitar && x.string === c.string && x.midi === c.midi + step);
        if (!other) continue;
        n++;
        const r = hearLegato(joined(steel(c), steel(other), how));
        if (r.pitches.filter((p) => p.t > 0.6 && p.t < 0.9 && p.midi === other.midi).length >= 3) reached++;
      }
    expect(n).toBeGreaterThan(100);
    expect(reached / n, `${reached} of ${n}`).toBeGreaterThanOrEqual(0.95);
  });
});

/**
 * The hearing check (src/core/checkrun.ts) played with real recordings, as a player plays it: the six open
 * strings of the nylon-string guitar, four chords strummed from its notes, a hit across dead strings; five
 * keys and three chords of the grand piano (tests/real/checkset.ts).
 */
describe.skipIf(!haveGuitar || !havePiano || !haveSteel)('the hearing check on real recordings', () => {
  it('hears every string, chord and the muted hit of a real guitar, and says when it is out of tune', () => {
    const tuned = checkRecording(guitarCheckSet(), SR, 'guitar', GUITAR_A4);
    expect(tuned.summary.right, tuned.run.outcomes.map((o) => `${o.item.want}:${o.heard}`).join(' ')).toBe(11);
    expect(tuned.summary.advice).toEqual([]);
    // the recorded guitar is some 20 cents low: against A = 440 the check says so
    const at440 = checkRecording(guitarCheckSet(), SR, 'guitar', 440);
    expect(at440.summary.right).toBe(11);
    expect(at440.summary.centsOff).toBeLessThanOrEqual(-15);
    expect(at440.summary.advice.join(' ')).toMatch(/cents low: tune it first/);
  });

  it('hears every key and chord of a real piano', () => {
    const r = checkRecording(pianoCheckSet(), SR, 'piano', PIANO_A4);
    expect(r.summary.right).toBe(8);
  });

  it('holds up in a living room, and tells an instrument that reaches the microphone too quietly', () => {
    expect(checkRecording(room(guitarCheckSet(), 0.5, 0.7), SR, 'guitar', GUITAR_A4).summary.right).toBeGreaterThanOrEqual(10);
    expect(checkRecording(room(pianoCheckSet(), 0.5, 0.7), SR, 'piano', PIANO_A4).summary.right).toBe(8);
    expect(checkRecording(guitarCheckSet(0.05), SR, 'guitar', GUITAR_A4).summary.advice.join(' ')).toMatch(/reaches the microphone quietly/);
  });
});
