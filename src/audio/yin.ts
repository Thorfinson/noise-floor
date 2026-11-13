/** YIN pitch detection for a single ringing note (tuner, sustain tracking). */

export interface Pitch {
  freq: number;
  /** 0..1, higher = more clearly periodic */
  clarity: number;
}

const scratch = new Map<number, Float32Array>();

/**
 * Estimates the fundamental of buf. The buffer is halved in rate first, which is plenty for
 * instrument fundamentals and keeps this cheap enough to run many times a second.
 */
export function yin(buf: ArrayLike<number>, sampleRate: number, fmin = 55, fmax = 1500, threshold = 0.15): Pitch | null {
  const n = buf.length >> 1;
  const sr = sampleRate / 2;
  let x = scratch.get(n);
  if (!x) scratch.set(n, (x = new Float32Array(n)));
  for (let i = 0; i < n; i++) x[i] = 0.5 * (buf[2 * i] + buf[2 * i + 1]);

  const tauMax = Math.min(Math.floor(sr / fmin), n >> 1);
  const tauMin = Math.max(2, Math.floor(sr / fmax));
  const w = n - tauMax;
  let dKey = scratch.get(-tauMax);
  if (!dKey) scratch.set(-tauMax, (dKey = new Float32Array(tauMax + 1)));
  const d = dKey;

  let running = 0;
  d[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const diff = x[i] - x[i + tau];
      sum += diff * diff;
    }
    running += sum;
    d[tau] = running > 0 ? (sum * tau) / running : 1;
  }

  let tau = -1;
  for (let t = tauMin; t < tauMax; t++) {
    if (d[t] < threshold) {
      while (t + 1 < tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // no dip under the threshold: fall back to the global minimum, but only if it is convincing
    let best = tauMin;
    for (let t = tauMin; t < tauMax; t++) if (d[t] < d[best]) best = t;
    if (d[best] > 0.35) return null;
    tau = best;
  }
  // The first dip is the period, unless the sound repeats clearly better after twice that time. Then the
  // first dip came from a strong second harmonic (a string late in its decay) and the note is an octave lower.
  for (let twice = 2 * tau; twice < tauMax; twice = 2 * tau) {
    let best = twice - 2;
    for (let t = twice - 2; t <= Math.min(tauMax - 1, twice + 2); t++) if (d[t] < d[best]) best = t;
    if (d[tau] < 0.02 || d[best] > 0.5 * d[tau]) break;
    tau = best;
  }
  const a = d[tau - 1] ?? d[tau];
  const b = d[tau];
  const c = d[tau + 1] ?? d[tau];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return { freq: sr / (tau + shift), clarity: Math.max(0, Math.min(1, 1 - b)) };
}
