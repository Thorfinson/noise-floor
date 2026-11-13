/** Spectral peaks and scoring of a candidate note against them. */

export interface Peak {
  f: number;
  a: number;
}

/** Local maxima of a magnitude spectrum with interpolated frequency and amplitude, strongest first. */
export function findPeaks(mag: Float32Array, sampleRate: number, fftSize: number, fmin: number, fmax: number, maxPeaks = 48, relFloor = 0.02): Peak[] {
  const hz = sampleRate / fftSize;
  const k0 = Math.max(1, Math.floor(fmin / hz));
  const k1 = Math.min(mag.length - 2, Math.ceil(fmax / hz));
  let top = 0;
  for (let k = k0; k <= k1; k++) if (mag[k] > top) top = mag[k];
  const floor = top * relFloor;
  const peaks: Peak[] = [];
  for (let k = k0; k <= k1; k++) {
    const m = mag[k];
    if (m <= floor || m < mag[k - 1] || m <= mag[k + 1]) continue;
    // The peak between the bins is found from the bin and its two neighbours. In a spectrum of what is new
    // (after minus before, never below zero) a neighbour is often exactly zero; taken at face value that
    // would blow the estimate up many times over. A real partial never falls off that steeply.
    const a = Math.log(Math.max(mag[k - 1], 0.1 * m) + 1e-12);
    const b = Math.log(m + 1e-12);
    const c = Math.log(Math.max(mag[k + 1], 0.1 * m) + 1e-12);
    const denom = a - 2 * b + c;
    const p = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
    peaks.push({ f: (k + p) * hz, a: Math.exp(b - 0.25 * (a - c) * p) });
  }
  peaks.sort((x, y) => y.a - x.a);
  return peaks.length > maxPeaks ? peaks.slice(0, maxPeaks) : peaks;
}

export interface CombScore {
  /** higher = better fit; comparable between candidates for the same peaks */
  score: number;
  /** share of all peak amplitude that sits on this note's harmonics, 0..1 */
  explained: number;
}

const HARMONICS = 8;
const SIGMA_CENTS = 35;
const WEIGHT = Array.from({ length: HARMONICS + 1 }, (_, h) => (h ? 1 / Math.sqrt(h) : 0));
const slot = new Float32Array(HARMONICS + 1);
/** share of a note's sound on harmonics of its own from which it counts in full */
const OWN = 0.12;

/**
 * How well a note with fundamental f0 explains the peaks.
 *
 * The main term is the share of peak amplitude that lies on the note's harmonics, which rejects wrong
 * notes and a too-high octave. But the octave below a note explains the very same peaks (as its second,
 * fourth, sixth harmonic), and so does the note a twelfth below (third, sixth, ninth). What tells them
 * apart: a note that really sounds has something of its own, on harmonics that the note an octave or a
 * twelfth higher does not have. A candidate without any gets half marks.
 *
 * Deliberately not held against a candidate: weak or missing upper harmonics (a soft note, a high note on
 * the piano and a nylon string have few) and a missing fundamental (a small microphone loses it).
 */
export function combScore(peaks: Peak[], f0: number, fmax: number): CombScore {
  slot.fill(0);
  let low = 0;
  let high = 0;
  let total = 0;
  for (const p of peaks) {
    total += p.a;
    const h = Math.max(1, Math.round(p.f / f0));
    const dev = 1200 * Math.log2(p.f / (h * f0));
    const g = Math.exp(-(dev * dev) / (2 * SIGMA_CENTS * SIGMA_CENTS));
    if (h <= HARMONICS) {
      low += p.a * g;
      if (p.a * g > slot[h]) slot[h] = p.a * g;
    } else high += p.a * g;
  }
  let strongest = 0;
  for (let h = 1; h <= HARMONICS; h++) if (slot[h] > strongest) strongest = slot[h];
  if (total <= 0 || strongest <= 0) return { score: 0, explained: 0 };
  let present = 0;
  let all = 0;
  let sum = 0;
  let odd = 0;
  let notThird = 0;
  for (let h = 1; h <= HARMONICS; h++) {
    if (h * f0 > fmax) break;
    all += WEIGHT[h];
    if (slot[h] > 0.06 * strongest) present += WEIGHT[h];
    sum += slot[h];
    if (h % 2) odd += slot[h];
    if (h % 3) notThird += slot[h];
  }
  // partials far above the eighth harmonic only count for a note whose lower harmonics are really there
  const share = (low + (high * present) / all) / total;
  const own = Math.min(odd, notThird) / sum;
  return { score: share * (0.5 + 0.5 * Math.min(1, own / OWN)), explained: share };
}

/** Amplitude found at each of the first eight harmonics of f0 (index 1..8). */
export function harmonicAmps(peaks: Peak[], f0: number, out: Float32Array): void {
  out.fill(0);
  for (const p of peaks) {
    const h = Math.round(p.f / f0);
    if (h < 1 || h > HARMONICS) continue;
    const dev = 1200 * Math.log2(p.f / (h * f0));
    const v = p.a * Math.exp(-(dev * dev) / (2 * SIGMA_CENTS * SIGMA_CENTS));
    if (v > out[h]) out[h] = v;
  }
}
