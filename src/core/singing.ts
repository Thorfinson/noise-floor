/**
 * Singing, measured: what the voice did, from the pitch the listener reports many times a second. A voice
 * does not strike a note as a string or a key does; it slides into it, wavers around it, and it may sing it
 * an octave lower than it is written. So a sung note is judged by where the pitch stays, not by a beginning:
 * it counts once it has stayed near the note for a moment, and how near is measured in cents (a hundredth
 * of a semitone).
 */

/** One reading of the sung pitch: when, and the pitch as a MIDI number with its fraction (60.25 is C4, 25 cents sharp). */
export interface Frame {
  t: number;
  midi: number;
}

/**
 * How far a sung pitch is from a note, in cents, sharp positive. With `anyOctave` the octave does not
 * count: a man singing the note an octave below it, or a reading that jumped an octave, sings it right.
 */
export function centsOff(midi: number, target: number, anyOctave = true): number {
  let d = (midi - target) * 100;
  if (anyOctave) d = ((((d + 600) % 1200) + 1200) % 1200) - 600;
  return d;
}

/**
 * How long after it was sung the listener reports a pitch, seconds: on 40 recordings of singers its readings
 * matched the written-down pitch best (96 in 100 within 50 cents) when taken as 0.05 s late (tests/real/voices.ts).
 */
export const PITCH_LAG = 0.05;

/** The middle value of a list. */
export function median(v: number[]): number {
  if (!v.length) return NaN;
  const s = v.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

export interface Held {
  /** when the note was first sung near enough */
  from: number;
  /** when it had been held long enough to count */
  at: number;
  /** the middle of how far off it was while held, cents */
  cents: number;
}

/**
 * Waits for a note to be sung and held, judged as a listener hears it: by its middle. Over the last `need`
 * seconds of unbroken voice the middle of the readings has to lie within four fifths of `tol` cents of the
 * note, at least half of them inside `tol`, and they may not spread over more than five times `tol` (a
 * voice sliding through the note does not count). A voice with vibrato swings round a note by half a
 * semitone and more and is heard on it: on 40 recordings of singers (tests/real/voices.ts) a strict "every
 * reading inside" turned away one note in eight that was held, this rule about one in fifty, and it takes a
 * voice a semitone off for the note about once in a hundred. A gap of a few readings (a breath of noise, a
 * consonant) does not start the count again; a longer one does.
 */
export class Hold {
  /** the readings of the last `need` seconds of unbroken voice */
  private run: Frame[] = [];
  /** when the unbroken voice began, and when it last came near the note */
  private voiced = -1;
  private near = -1;
  private last = -1;
  done: Held | null = null;

  constructor(
    public readonly target: number,
    public readonly tol = 50,
    public readonly need = 0.3,
    public readonly anyOctave = true,
  ) {}

  /** Another reading. Returns what was held, once it has been. */
  push(f: Frame): Held | null {
    if (this.done) return this.done;
    if (this.last >= 0 && f.t - this.last > 0.12) {
      this.run = [];
      this.voiced = -1;
      this.near = -1;
    }
    this.last = f.t;
    if (this.voiced < 0) this.voiced = f.t;
    const off = centsOff(f.midi, this.target, this.anyOctave);
    // for the ring that fills while the note is held: how long the voice has been near it
    if (Math.abs(off) <= 2.5 * this.tol) {
      if (this.near < 0) this.near = f.t;
    } else this.near = -1;
    this.run.push(f);
    const from = f.t - this.need;
    while (this.run.length && this.run[0].t < from) this.run.shift();
    if (this.voiced > from + 0.02 || this.run.length < 3) return null;
    const offs = this.run.map((x) => centsOff(x.midi, this.target, this.anyOctave));
    const mid = median(offs);
    const inside = offs.filter((o) => Math.abs(o) <= this.tol).length / offs.length;
    const sorted = offs.slice().sort((x, y) => x - y);
    const spread = sorted[Math.floor(0.9 * (sorted.length - 1))] - sorted[Math.floor(0.1 * (sorted.length - 1))];
    if (Math.abs(mid) <= 0.8 * this.tol && inside >= 0.5 && spread <= 5 * this.tol) this.done = { from: this.run[0].t, at: f.t, cents: mid };
    return this.done;
  }

  /** How long the voice has been near the note so far, seconds; 0 when it is not being sung now. */
  progress(now: number): number {
    return this.near >= 0 && now - this.last < 0.12 ? Math.min(this.need, this.last - this.near) : 0;
  }
}

/**
 * How steady a held tone was: the spread of the sung pitch around its own middle, in cents (half of the
 * readings lie within this of the middle). A trained voice holds a tone within some ten cents; a wobbling
 * one within fifty or more. Also where the middle was, against the note asked for.
 */
export function steadiness(frames: Frame[], target: number, anyOctave = true): { spread: number; cents: number } {
  if (!frames.length) return { spread: Infinity, cents: NaN };
  const offs = frames.map((f) => centsOff(f.midi, target, anyOctave));
  const mid = median(offs);
  return { spread: median(offs.map((o) => Math.abs(o - mid))), cents: mid };
}

/**
 * The lowest and highest notes a voice held, from the readings of a range test: a note counts when it was
 * held steadily (within 60 cents) for at least `need` seconds. Wild readings (a cough, a creak) are not long
 * enough to count. Returns null when nothing was held.
 */
export function heldRange(frames: Frame[], need = 0.4): { low: number; high: number } | null {
  const notes: number[] = [];
  let run: Frame[] = [];
  const close = (): void => {
    if (run.length > 1 && run[run.length - 1].t - run[0].t >= need) notes.push(Math.round(median(run.map((f) => f.midi))));
    run = [];
  };
  for (const f of frames) {
    if (run.length && (f.t - run[run.length - 1].t > 0.12 || Math.abs(f.midi - median(run.map((x) => x.midi))) > 0.6)) close();
    run.push(f);
  }
  close();
  return notes.length ? { low: Math.min(...notes), high: Math.max(...notes) } : null;
}

export type VoiceType = 'bass' | 'baritone' | 'tenor' | 'alto' | 'mezzo' | 'soprano';

/**
 * The voice type a range points to, by its middle (the comfortable centre of a voice moves up from bass
 * to soprano by about a third each). Only a hint: it says where songs are set, not what someone is.
 */
export function voiceType(low: number, high: number): VoiceType {
  const mid = (low + high) / 2;
  // half way between the middles of the typical ranges below
  return mid < 52.5 ? 'bass' : mid < 56 ? 'baritone' : mid < 60 ? 'tenor' : mid < 63.5 ? 'alto' : mid < 66 ? 'mezzo' : 'soprano';
}

/** Comfortable ranges the app assumes until a voice has been measured: of an untrained voice of each type. */
export const TYPICAL: Record<VoiceType, [number, number]> = {
  bass: [41, 60],
  baritone: [45, 64],
  tenor: [48, 67],
  alto: [53, 72],
  mezzo: [55, 74],
  soprano: [58, 77],
};

/**
 * How many semitones to move a melody so that it lies in a voice: within it if it can, as near the middle
 * as it can. Whole octaves are preferred (the melody keeps its key); otherwise the smallest move that fits.
 */
export function fitTo(midis: number[], low: number, high: number): number {
  const lo = Math.min(...midis);
  const hi = Math.max(...midis);
  const room = high - low - (hi - lo);
  const centre = (low + high) / 2 - (lo + hi) / 2;
  const fits = (k: number): boolean => lo + k >= low && hi + k <= high;
  // the octave nearest the centre, if it fits
  const oct = Math.round(centre / 12) * 12 || 0;
  if (fits(oct)) return oct;
  for (const k of [oct - 12, oct + 12]) if (fits(k)) return k;
  // otherwise the shift that puts the melody's middle nearest the voice's middle (if it is wider than the voice, centred)
  if (room < 0) return Math.round(centre);
  let best = Math.round(centre);
  for (let k = Math.ceil(low - lo); k <= Math.floor(high - hi); k++) if (Math.abs(k - centre) < Math.abs(best - centre) || !fits(best)) best = k;
  return best;
}
