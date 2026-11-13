/** Radix-2 FFT of a Hann-windowed real signal. Magnitudes are scaled so a sine of amplitude A peaks at about A. */
export class FFT {
  readonly n: number;
  readonly bins: number;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  private readonly rev: Uint32Array;
  private readonly win: Float32Array;
  private readonly re: Float32Array;
  private readonly im: Float32Array;
  private readonly scale: number;

  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT size must be a power of two');
    this.n = n;
    this.bins = n / 2 + 1;
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      this.cos[k] = Math.cos((2 * Math.PI * k) / n);
      this.sin[k] = Math.sin((2 * Math.PI * k) / n);
    }
    const bits = Math.log2(n);
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.win = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      sum += this.win[i];
    }
    this.scale = 2 / sum;
    this.re = new Float32Array(n);
    this.im = new Float32Array(n);
  }

  /** Writes bins 0..n/2 of the magnitude spectrum of input[offset .. offset+n) into out. */
  magnitudes(input: ArrayLike<number>, out: Float32Array, offset = 0): void {
    const { n, re, im, rev, win, cos, sin } = this;
    for (let i = 0; i < n; i++) {
      re[rev[i]] = (input[offset + i] || 0) * win[i];
      im[rev[i]] = 0;
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j;
          const b = a + half;
          const tr = re[b] * cos[k] + im[b] * sin[k];
          const ti = im[b] * cos[k] - re[b] * sin[k];
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
    for (let k = 0; k < this.bins; k++) out[k] = Math.hypot(re[k], im[k]) * this.scale;
  }
}
