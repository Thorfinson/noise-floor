import { Listener, type ChordEvent, type NoteEvent, type OnsetEvent, type StringEvent } from '../src/audio/listener';
import { addNoise, mixInto, tone, type ToneOpts } from '../src/audio/synth';

export const SR = 48000;

export interface Heard {
  onsets: OnsetEvent[];
  notes: NoteEvent[];
  chords: ChordEvent[];
  strings: StringEvent[];
}

/** Runs a signal through a listener in small blocks, the way the browser delivers it. */
export function listen(signal: Float32Array, setup?: (l: Listener) => void, during?: (l: Listener, t: number) => void): Heard {
  const l = new Listener(SR);
  const heard: Heard = { onsets: [], notes: [], chords: [], strings: [] };
  l.onOnset = (e) => heard.onsets.push(e);
  l.onNote = (e) => heard.notes.push(e);
  l.onChord = (e) => heard.chords.push(e);
  l.onString = (e) => heard.strings.push(e);
  setup?.(l);
  for (let i = 0; i < signal.length; i += 128) {
    during?.(l, i / SR);
    l.push(signal.subarray(i, Math.min(signal.length, i + 128)));
  }
  return heard;
}

/** A sequence of notes that are left ringing over each other, starting after half a second of room noise. */
export function sequence(notes: (Partial<ToneOpts> & { midi: number })[], gap = 0.4, noise = 0.0015, ringFor = 1.8): Float32Array {
  const out = new Float32Array(Math.floor((0.5 + notes.length * gap + 1.2) * SR));
  notes.forEach((n, i) => mixInto(out, tone({ sr: SR, dur: ringFor, seed: i + 1, ...n }), (0.5 + i * gap) * SR));
  addNoise(out, noise);
  return out;
}

/**
 * Like sequence, but each note belongs to a string, and a new note on a string ends the one that was
 * sounding there, as on a real guitar.
 */
export function onStrings(notes: { midi: number; string: number }[], gap = 0.3, noise = 0.0015): Float32Array {
  const out = new Float32Array(Math.floor((0.5 + notes.length * gap + 1.2) * SR));
  notes.forEach((n, i) => {
    const start = Math.floor((0.5 + i * gap) * SR);
    const nextSame = notes.findIndex((m, j) => j > i && m.string === n.string);
    const dur = nextSame < 0 ? 2 : Math.min(2, (nextSame - i) * gap + 0.004);
    mixInto(out, tone({ sr: SR, dur, seed: i + 1, midi: n.midi }), start);
  });
  addNoise(out, noise);
  return out;
}
