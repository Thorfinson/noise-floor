/**
 * The band as the listener expects to hear it back through the microphone, when it plays through speakers.
 *
 * The app renders the band itself (src/audio/band.ts), so it knows to the sample what goes out of the speakers
 * and when. The listener is given that sound and, in every window it analyses, takes off what the band
 * contributes there (its spectrum in that window, times how strongly the speakers reach the microphone in each
 * frequency band), before it looks for onsets, notes and chords. A strum on top of a band note still counts: it
 * brings far more than the band's share. This is the "informed listener" of the speaker-backing study (JoyTunes,
 * US 9,492,756 B2: the recogniser is told what the background plays), done as subtraction per frequency band,
 * which on music beat adaptive echo filters in the one comparison there is (Gorlow et al. 2016).
 */
import { LAYERS, type BandParts, type Layer } from './band';

/**
 * How closely the microphone must follow the band (0..1) for it to count as hearing it: below, a soundcheck has
 * found nothing to go by (headphones, or the speakers silent).
 */
export const HEARD_FIT = 0.3;

/** The lower edges of the frequency bands the coupling is measured and applied in, Hz; the last goes to the top. */
export const ECHO_BANDS = [0, 90, 130, 180, 250, 350, 500, 700, 1000, 1400, 2000, 2800, 4000, 6000];

/** The frequency band each bin of an FFT of size n falls into. */
const bandMaps = new Map<string, Uint8Array>();
export function bandOfBin(n: number, sr: number): Uint8Array {
  const key = `${n}@${sr}`;
  let m = bandMaps.get(key);
  if (!m) {
    m = new Uint8Array(n / 2 + 1);
    for (let k = 0; k < m.length; k++) {
      const f = (k * sr) / n;
      let b = 0;
      while (b + 1 < ECHO_BANDS.length && f >= ECHO_BANDS[b + 1]) b++;
      m[k] = b;
    }
    bandMaps.set(key, m);
  }
  return m;
}

/** A band playing through the speakers, on the listener's clock. */
export class BandEcho {
  readonly parts: BandParts;
  /** the listener's sample at which the band's first sample arrives at the microphone */
  start: number;
  /** the listener's sample after which nothing of it arrives any more: set when it is stopped */
  until = Infinity;
  /** how loud each layer plays now (its gain times the band's volume), and, while a fade is under way, the louder of before and after */
  private readonly gains = new Map<Layer, { now: number; held: number; heldUntil: number }>();
  private readonly len: number;

  constructor(parts: BandParts, gains: Partial<Record<Layer, number>>, volume: number, start: number) {
    this.parts = parts;
    this.start = Math.round(start);
    this.len = parts.layers.drums.length;
    for (const l of LAYERS) this.gains.set(l, { now: (gains[l] ?? 0) * volume, held: 0, heldUntil: -Infinity });
  }

  /**
   * A layer fades to a new gain from listener sample `at` over `ramp` samples. Until the fade is over the louder
   * of the two counts: taking off a little too much of the band is safer than leaving some of it for a note.
   */
  setGain(layer: Layer, gain: number, volume: number, at: number, ramp: number): void {
    const g = this.gains.get(layer)!;
    g.held = Math.max(g.now, g.held);
    g.heldUntil = at + ramp;
    g.now = gain * volume;
  }

  /** It stops at listener sample `at`, fading over `fade` samples; what the room still rings with is allowed for. */
  stop(at: number, fade: number, ring: number): void {
    this.until = Math.min(this.until, at + fade + ring);
  }

  /** Does any of it arrive at the microphone between these listener samples? */
  live(i0: number, i1: number): boolean {
    if (i1 < this.start || i0 > this.until) return false;
    return !!this.parts.loop || i0 < this.start + this.len;
  }

  /** Does one of its pitched notes begin between these listener samples (as it arrives at the microphone)? */
  begins(i0: number, i1: number): boolean {
    if (!this.live(i0, i1)) return false;
    const sr = this.parts.layers.drums.length / Math.max(1e-9, this.parts.length);
    const len = this.len;
    for (const e of this.parts.events) {
      const g = this.gains.get(e.layer)!;
      if (g.now <= 0 && g.held <= 0) continue;
      let at = this.start + Math.round(e.t * sr);
      // a loop: its first time round from i0 on
      if (this.parts.loop) at += Math.ceil((i0 - at) / len) * len;
      if (at >= i0 && at <= i1 && at <= this.until) return true;
    }
    return false;
  }

  /**
   * Adds the band's sound, as it leaves the speakers, for listener samples i0 .. i0 + n into out. Returns false
   * when nothing of it falls there.
   */
  add(i0: number, n: number, out: Float32Array): boolean {
    if (!this.live(i0, i0 + n)) return false;
    let any = false;
    const len = this.len;
    for (const l of LAYERS) {
      const g = this.gains.get(l)!;
      const gain = i0 < g.heldUntil ? Math.max(g.now, g.held) : g.now;
      if (gain <= 0) continue;
      const src = this.parts.layers[l];
      any = true;
      for (let i = 0; i < n; i++) {
        const at = i0 + i;
        if (at > this.until) break;
        let k = at - this.start;
        if (this.parts.loop) k = ((k % len) + len) % len;
        else if (k < 0 || k >= len) continue;
        out[i] += gain * src[k];
      }
    }
    return any;
  }
}
