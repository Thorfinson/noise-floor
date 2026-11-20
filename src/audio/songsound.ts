/**
 * A song as it sounds, for hearing it before it is learned: what the instrument plays (the strums, or the
 * notes of a tune or a piece) and, for a song of chords, its tune over them, sung. At any speed, the whole of
 * it or some bars. Rendered at once (the synth is quick) and played by whoever asks for it.
 */
import { strum, tone, voiceTone, mixInto } from './synth';
import type { Material, Step } from '../music/material';
import type { SungNote } from '../music/accompany';
import { shapeOf } from '../music/content';
import { chordNotes, pianoChord } from '../music/theory';

export interface SongSoundOpts {
  sr: number;
  /** 1 is the speed it is written at */
  speed: number;
  /** what the instrument plays */
  instrument: boolean;
  /** the tune of a song of chords, sung over them (when there is one) */
  tune?: SungNote[] | null;
  /** only these lines (indexes into the material's lines), from the first to the last */
  lines?: [number, number];
  a4?: number;
  pianoA4?: number;
}

export interface SongSound {
  samples: Float32Array;
  /** seconds into the sound where the first line asked for begins (an upbeat of the tune sounds before it) */
  t0: number;
  /** seconds per note unit at the speed asked for */
  unit: number;
  /** where each line begins, in note units from the start of the first line of the material */
  starts: number[];
  /** note units from the start of the material where the sound's first line begins, and where its last ends */
  from: number;
  to: number;
}

/** Where each line of the material begins, in note units from its first line. */
export const lineStarts = (m: Material): number[] => {
  const starts: number[] = [];
  m.lines.reduce((u, l) => (starts.push(u), u + l.units), 0);
  return starts;
};

export function songSound(m: Material, o: SongSoundOpts): SongSound {
  const { sr } = o;
  const unit = m.noteDur / o.speed;
  const starts = lineStarts(m);
  const [first, last] = o.lines ?? [0, m.lines.length - 1];
  const from = starts[first];
  const to = starts[last] + m.lines[last].units;
  // the tune's notes in those lines, and the upbeat that leads into the first of them: from the start of the
  // song, the whole of the song's upbeat (three beats for the Saints); before a later line, as much as that
  // upbeat lasts, at least a beat
  const all = o.tune ?? [];
  const upbeat = Math.max(m.beat, -Math.min(0, ...all.map((n) => n.u)));
  const tune = all.filter((n) => (first === 0 || n.u >= from - upbeat - 1e-6) && n.u < to - 1e-6);
  // an upbeat of the tune before the first line asked for: the sound begins early enough to hold it
  const lead = Math.max(0, from - Math.min(from, ...tune.map((n) => n.u)));
  const ring = m.piano ? 1.2 : 1.8;
  const t0 = 0.15 + lead * unit;
  const out = new Float32Array(Math.ceil((t0 + (to - from) * unit + ring + 0.3) * sr));
  const a4 = m.piano ? (o.pianoA4 ?? 440) : (o.a4 ?? 440);
  // a whole song strums the same few chords hundreds of times: each sound is made once and mixed in wherever it
  // comes (the synth is the same every time), which brings a song of four minutes from seconds to a blink
  const made = new Map<string, Float32Array>();
  const once = (key: string, make: () => Float32Array): Float32Array => {
    let x = made.get(key);
    if (!x) made.set(key, (x = make()));
    return x;
  };
  if (o.instrument)
    for (let li = first; li <= last; li++)
      for (const s of m.lines[li].steps) mixInto(out, once(s.chord ? `c:${s.chord}` : `n:${s.midis.join(',')}`, () => stepSound(m, s, sr, ring, a4)), (t0 + (starts[li] - from + s.at) * unit) * sr);
  // the tune over the chords: a voice, a little softer than the strums so that both are heard
  for (const n of tune) {
    const dur = Math.max(0.12, n.len * unit * 0.95);
    mixInto(out, once(`v:${n.midi}:${dur.toFixed(4)}`, () => voiceTone({ sr, midi: n.midi, dur, amp: 0.17, vibrato: 18, scoop: 25, a4: o.a4 ?? 440 })), (t0 + (n.u - from) * unit) * sr);
  }
  // strums ring on into the next ones: the sum is brought under full scale, so that nothing clips
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.85) for (let i = 0; i < out.length; i++) out[i] *= 0.85 / peak;
  return { samples: out, t0, unit, starts, from, to };
}

/** One step of the material as the practice instrument would sound it. */
function stepSound(m: Material, s: Step, sr: number, ring: number, a4: number): Float32Array {
  if (s.chord) return m.piano ? strum(pianoChord(s.chord).midis, sr, ring, { a4, piano: true, amp: 0.2 }, 5) : strum(chordNotes(shapeOf(s.chord)), sr, ring, { a4, amp: 0.22 });
  const notes = s.midis.map((midi) => tone({ sr, midi, dur: ring, a4, piano: m.piano, amp: 0.3 }));
  const len = Math.max(0, ...notes.map((n) => n.length));
  const mix = new Float32Array(len);
  for (const n of notes) mixInto(mix, n, 0);
  return mix;
}
