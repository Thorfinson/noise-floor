/**
 * Turns a stream of audio samples into musical events: onsets, the note that was just played,
 * the chord that was just strummed, and whether a single plucked string rings clean.
 *
 * Other strings are usually still ringing when a new note is played, so a note is identified from the
 * energy that appeared at its onset (spectrum after minus spectrum before), not from the whole mixture.
 * This class has no browser dependencies, so the same code runs in the app and in the tests.
 */
import { FFT } from './fft';
import { yin } from './yin';
import { combScore, findPeaks, harmonicAmps, type Peak } from './peaks';
import { bandOfBin, ECHO_BANDS, HEARD_FIT, type BandEcho } from './echo';
import { CHORDS, chordNotes, freqToMidi, midiToFreq, pianoChord } from '../music/theory';

export interface LevelEvent { time: number; rms: number; db: number; gateDb: number }
export interface OnsetEvent {
  time: number;
  strength: number;
  /**
   * While a band plays through the speakers: the share of the onset's rise that is left once the band is taken
   * off (near 0: it was the band's own note; near 1: all the player's). Left out without a band.
   */
  own?: number;
}
export interface NoteEvent {
  /** onset time in seconds since the listener started */
  time: number;
  midi: number;
  /** share of the new energy this note explains, 0..1 */
  conf: number;
  /** best score divided by the runner-up's; above about 1.3 is unambiguous */
  margin: number;
  second: number | null;
  /** amplitude of the strongest new partial */
  level: number;
  /** how much of the note is still there about 20 ms later, 0..1; a choked note is far below 1 */
  ring: number;
  /** how much of the note before this one was still sounding when this one began, 0..1; -1 when there was none */
  held: number;
}
/** An onset that did not become a note, and why. For tuning the listener; the app does not use it. */
export interface DropEvent {
  time: number;
  /** quiet: too little appeared; unsure: no note explains it well; choked: it was gone at once */
  reason: 'quiet' | 'unsure' | 'choked';
  midi: number | null;
  conf: number;
  ring: number;
}
/** A sound after which nothing rings: a hit on muted strings, a dead string, a hand stopping the strings. */
export interface ThudEvent {
  time: number;
  strength: number;
  /** it was clearly louder than what sounded before it: something was struck, not merely stopped */
  hit: boolean;
}
export interface PitchEvent { time: number; freq: number; midi: number; cents: number; clarity: number }
/** The strongest partial inside a frequency band, measured precisely. */
export interface PartialEvent { time: number; freq: number; level: number }
export interface ChordEvent { time: number; best: string | null; score: number; margin: number; sims: Record<string, number> }
export type StringResult = 'clean' | 'muted' | 'buzz' | 'wrong';
export interface StringEvent {
  time: number;
  expected: number;
  heard: number | null;
  result: StringResult;
  /** how much of the note is left after 0.45 s, relative to what it was at 0.17 s, 0..1 */
  ring: number;
  buzz: number;
  /** strength of the note every 21 ms, from 85 ms after the pluck on; for tuning the listener */
  env: number[];
}

/*
 * Lengths in samples. The windows are powers of two, as the FFT needs, so at 44.1 kHz (a browser that
 * cannot record at 48 kHz, a file) they are a little longer in time than at 48 kHz; every frequency is
 * worked out from the sample rate. What stands for a time or a frequency band is scaled to the rate.
 */
const HOP = 512;
const RING = 1 << 16;
const NOTE_WIN = 4096;
const CHORD_WIN = 8192;
const PRE_GAP = 512;
/** a length given in samples at 48 kHz, as long in time at another rate */
const at48 = (n: number, sr: number): number => Math.round((n * sr) / 48000);
/**
 * The band chords are matched in. The fundamentals of the lowest strings lie below it: how much of them
 * arrives depends on the guitar's body and on the microphone, so they are left out on both sides of the
 * comparison. Their harmonics are inside.
 */
const CHORD_LOW = 110;
const CHORD_HIGH = 1600;
/**
 * The quietest background the onset detector reckons with, about that of a quiet room through a laptop
 * microphone. Input that is quieter still (the practice instrument, a microphone with a noise gate) is
 * treated as if it had this much: otherwise every flicker inside a ringing note would look like an attack.
 */
const QUIET = 8e-4;
/** default for Listener.ringThreshold */
const RINGS = 0.05;
/**
 * A band through the speakers (see echo.ts) is expected this many samples earlier or later than the latency
 * says: what the browser reports of its latency is often off by that much. Its sound is taken off wherever it may
 * be within that span. The onset windows look ahead by the same, in hops.
 */
const ECHO_SLACK = 1536;
const ECHO_RING = (2 * ECHO_SLACK) / HOP + 1;
/**
 * The room goes on ringing with the band after the speakers have stopped it. Its sound in the room is reckoned
 * to die away as in a room that takes this long to fall by 60 dB (a living room is 0.3 to 0.6 s): longer is
 * safer, as what is taken off then never ends while the microphone still hears it, which would look like a note
 * beginning.
 */
const ROOM_RT60 = 0.8;
/**
 * An onset counts while a band plays only when at least this share of its rise is left once the band is taken
 * off. The band's own note leaves little; a strum on top of a band note leaves most of its own.
 */
export const OWN_SHARE = 0.5;

/**
 * What is left of a bin of magnitude m once a share e of it is taken off as the band's, never below zero. As
 * magnitude, not as power: taking power off (the textbook form, kinder to a strum that is far louder than the
 * band in the same bin) left enough of the band's notes in a reverberant room to be heard as playing, several a
 * minute where taking magnitude off left none.
 */
function left(m: number, e: number): number {
  const d = m - e;
  return d > 0 ? d : 0;
}
/** how far back the analysis windows look for the band's ringing on, in steps of this many samples */
const TAIL_STEP = 2048;
const TAIL_STEPS = 6;

interface StringCheck {
  midi: number;
  state: 'wait' | 'track';
  s0: number;
  pre: Float32Array;
  env: number[];
  noise: number[];
  heard: number | null;
  heardConf: number;
  expectedShare: number;
  strength: number;
  carried: boolean;
  /** the same string rang a moment ago and is plucked again: pre is from before it first sounded */
  again: boolean;
  /** for such a string: how strongly it was still sounding just before this onset */
  before: number;
  /** number of looks taken so far while tracking */
  looks: number;
}

export class Listener {
  readonly sr: number;
  /**
   * A note is identified from a window that begins this long after its onset (30 ms), not at it. The first
   * moments of a real note belong to the attack: the thump of the guitar's body under the pluck, the knock
   * of the piano's hammer. They are as loud as the note, at pitches of their own, and gone after 30 ms.
   */
  private readonly noteDelay: number;
  /** how long after an onset it is looked at (128 ms): by then a hit on muted strings must have died away */
  private readonly thudWin: number;
  /** the long-window onset measure looks at this many bins, up to about 1500 Hz */
  private readonly fineBins: number;
  /** tuning reference in Hz */
  a4 = 440;
  minMidi = 38;
  maxMidi = 96;
  /** identify the note at every onset */
  noteDetection = true;
  /** continuous pitch of a single ringing note (tuner), or of a voice */
  pitchTracking = false;
  /** how clearly periodic a sound must be for its pitch to be reported, 0 to 1: a voice is breathier than a string */
  pitchClarity = 0.8;
  /**
   * Notes the app is waiting for. When the evidence for one of them is nearly as good as for the best guess
   * (typically the same note an octave off, under several ringing strings), the expected note wins.
   */
  expected: number[] | null = null;
  /** when set, every onset is also matched against these chords */
  chordCandidates: string[] | null = null;
  /**
   * The notes a chord is played with on the instrument that is listened to: the strings of the guitar's
   * shape, or the keys of the piano's. What a strum or a chord struck on the keys is compared with.
   */
  voicing: 'guitar' | 'piano' = 'guitar';
  /**
   * On the piano: also take a chord that is struck an octave or two below the place the app shows it in.
   * The same keys in another octave are the same chord, but low down they sound different: more of their
   * harmonics lie where the listener looks.
   */
  anyOctave = true;
  /** above this much rattle in the upper band, relative to the note itself, a string counts as buzzing */
  buzzThreshold = 0.5;
  /**
   * A note rings when, 0.45 s after the pluck, this much is left of what it was at 0.17 s. Measured on
   * recordings: clean notes of a nylon-string guitar keep 9% to 80%, of steel-string guitars 65% to 85%,
   * a held piano key 10% to 65%. A dead note and a key that is let go keep nothing. Notes played with
   * the hand lying on the strings keep 5% to 30%: raise this to have those count as muted too.
   */
  ringThreshold = RINGS;

  onLevel?: (e: LevelEvent) => void;
  onOnset?: (e: OnsetEvent) => void;
  onNote?: (e: NoteEvent) => void;
  onPitch?: (e: PitchEvent) => void;
  onChord?: (e: ChordEvent) => void;
  onString?: (e: StringEvent) => void;
  onDrop?: (e: DropEvent) => void;
  /** set to be told about hits that leave no note behind */
  onThud?: (e: ThudEvent) => void;
  /**
   * When set to [low, high] in Hz, the strongest partial in that band is reported about fifty times a second.
   * Unlike the pitch of a whole note, one partial can be measured while other notes are sounding too.
   */
  partialBand: [number, number] | null = null;
  onPartial?: (e: PartialEvent) => void;

  /**
   * The bands playing through the speakers that the microphone hears (the engine sets them; src/audio/echo.ts).
   * While one plays, what it brings to each window is taken off before onsets, notes and chords are looked for.
   * Empty under headphones, with the click alone, and when the microphone is off.
   */
  bands: BandEcho[] = [];
  /**
   * How strongly the speakers reach the microphone in each frequency band of ECHO_BANDS: what arrives for each
   * unit of the band's own spectrum. Measured by the soundcheck (see learnedEcho). While a band plays it is also
   * followed (followEcho), so that a speaker turned up afterwards, or no soundcheck at all, is coped with.
   */
  coupling: number[] | null = null;
  /** how many times its expected share of the band is taken off: the room adds to it, and the timing is never exact */
  echoOver = 2;

  private readonly ring = new Float32Array(RING);
  private total = 0;
  private readonly pend = new Float32Array(HOP);
  private pendN = 0;
  private hops = 0;
  /** how many samples of the hop being gathered came in as (all but) exactly zero */
  private still = 0;

  private readonly fftO = new FFT(1024);
  private readonly magO = new Float32Array(513);
  private readonly prevO = [new Float32Array(513), new Float32Array(513), new Float32Array(513)];
  /**
   * While a band plays: the last three spectra of the two onset windows as they came in and with the band taken
   * off, not compressed. How much of a rise the band explains is measured on them (see own in detectOnset).
   */
  private readonly linO = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(513));
  private readonly linF: Float32Array[];
  private readonly winO = new Float32Array(1024);
  private flux: number[] = [];
  /** the same measure on a long window, see detectFine */
  private readonly magF = new Float32Array(NOTE_WIN / 2 + 1);
  private readonly prevF: Float32Array[];
  private fluxF: number[] = [];
  /** an onset the long window found, waiting to see whether the short window confirms it */
  private pending: { at: number; flux: number; own: number } | null = null;
  private lastOnset = -1e9;
  private lastChord = -1e9;
  private ref = 0.004;
  private floor = 1e-4;
  private warm: number[] = [];
  private readonly fftH = new FFT(2048);
  private readonly bufH = new Float32Array(2048);
  private readonly magH = new Float32Array(1025);

  private readonly fftN = new FFT(NOTE_WIN);
  private readonly fftC = new FFT(CHORD_WIN);
  private readonly bufN = new Float32Array(NOTE_WIN);
  private readonly bufC = new Float32Array(CHORD_WIN);
  private readonly magA = new Float32Array(NOTE_WIN / 2 + 1);
  private readonly magRaw = new Float32Array(NOTE_WIN / 2 + 1);
  private readonly hNow = new Float32Array(9);
  private readonly hWas = new Float32Array(9);
  private readonly magB = new Float32Array(NOTE_WIN / 2 + 1);
  private readonly magCA = new Float32Array(CHORD_WIN / 2 + 1);
  private readonly magCB = new Float32Array(CHORD_WIN / 2 + 1);
  private noteJobs: { s0: number; flux: number }[] = [];
  /** firm onsets that may turn out to be hits on muted strings */
  private thudJobs: { s0: number; flux: number }[] = [];
  private lastNote: { midi: number; s0: number; amp: number } | null = null;
  private chordJobs: number[] = [];
  private check: StringCheck | null = null;
  /** the spectrum at the first and at the latest look of the running string check */
  private readonly ckFirst = new Float32Array(NOTE_WIN / 2 + 1);
  private readonly ckLast = new Float32Array(NOTE_WIN / 2 + 1);
  /** the last string that was found ringing, with the spectrum from before it was plucked */
  private rang: { midi: number; s0: number; pre: Float32Array } | null = null;
  private readonly templates = new Map<string, Float32Array>();

  /** state of the two high-pass stages at the input */
  private readonly hp = new Float64Array(4);
  private readonly hpR: number;

  /** the band's sound in one window, and its spectrum */
  private readonly echoBuf = new Float32Array(CHORD_WIN);
  private readonly echoMag = new Float32Array(CHORD_WIN / 2 + 1);
  private readonly echoMax = new Float32Array(CHORD_WIN / 2 + 1);
  /**
   * The band's spectrum (before the coupling) in the two onset windows, worked out a little ahead each hop and
   * kept for a few hops: within that span its sound may lie, however far the latency is off (ECHO_SLACK).
   */
  private readonly ringO = Array.from({ length: ECHO_RING }, () => new Float32Array(513));
  private readonly ringF = Array.from({ length: ECHO_RING }, () => new Float32Array(NOTE_WIN / 2 + 1));
  private readonly ringLive = new Uint8Array(ECHO_RING);
  private ringAt = 0;
  /** the band's spectrum in the onset windows with the room's ringing on: never falling faster than the room does */
  private readonly tailO = new Float32Array(513);
  private readonly tailF = new Float32Array(NOTE_WIN / 2 + 1);
  /** how much of the ringing is left after one hop */
  private readonly hopDecay: number;
  /**
   * Per hop, while a band plays: how strong the microphone is in each band, and how strong the band itself is
   * there (its window ECHO_SLACK ahead). What the coupling is learned and followed from.
   */
  private echoLog: { mic: Float32Array; ref: Float32Array; at: number }[] = [];
  /** where the soundcheck began in the log (the hop's sample), or -1 */
  private learnFrom = -1;
  /** the coupling as followed while the band plays; null until there was enough of the band to tell */
  private followed: number[] | null = null;
  private lastFollow = 0;
  /** the shift the last following found, to be confirmed by the next before the timing is moved */
  private lastLag = 0;
  /** a band was near in this hop: the fine onset window is cleaned too */
  private echoNow = false;

  constructor(sampleRate: number) {
    this.sr = sampleRate;
    this.hpR = 1 - (2 * Math.PI * 30) / sampleRate;
    this.noteDelay = at48(1440, sampleRate);
    this.thudWin = at48(6144, sampleRate);
    this.fineBins = Math.round(1500 / (sampleRate / NOTE_WIN));
    this.prevF = [0, 1, 2].map(() => new Float32Array(this.fineBins + 2));
    this.linF = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(this.fineBins + 2));
    this.hopDecay = Math.pow(10, (-3 * HOP) / sampleRate / ROOM_RT60);
  }

  /** seconds of audio processed so far */
  get time(): number {
    return this.total / this.sr;
  }

  /**
   * Feed any number of samples. What lies below about 30 Hz is taken out first: a constant offset from the
   * sound card, and the slow heaving of the air that a good microphone picks up. It is not sound, but it
   * would count as loudness.
   */
  push(block: ArrayLike<number>): void {
    const hp = this.hp;
    const r = this.hpR;
    for (let i = 0; i < block.length; i++) {
      const x = block[i];
      const y1 = x - hp[0] + r * hp[1];
      const y2 = y1 - hp[2] + r * hp[3];
      hp[0] = x;
      hp[1] = y1;
      hp[2] = y1;
      hp[3] = y2;
      if (x < 1e-6 && x > -1e-6) this.still++;
      this.pend[this.pendN++] = y2;
      if (this.pendN === HOP) {
        this.pendN = 0;
        this.hop();
      }
    }
  }

  /** Wait for the next pluck and judge whether this note rings clean. One result is reported through onString. */
  startStringCheck(midi: number): void {
    this.check = { midi, state: 'wait', s0: 0, pre: new Float32Array(NOTE_WIN / 2 + 1), env: [], noise: [], heard: null, heardConf: 0, expectedShare: 0, strength: 0, carried: false, again: false, before: 0, looks: 0 };
  }

  cancelStringCheck(): void {
    this.check = null;
  }

  private copy(start: number, len: number, out: Float32Array): void {
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      out[i] = idx < 0 || idx >= this.total ? 0 : this.ring[idx & (RING - 1)];
    }
  }

  /**
   * The soundcheck: from now on the listener measures how the band reaches the microphone. Play the band alone
   * for a few seconds, then ask learnedEcho().
   */
  learnEcho(): void {
    this.learnFrom = this.total;
    this.echoLog = [];
  }

  /**
   * What the soundcheck found: the coupling per frequency band, and how much later (seconds, may be negative)
   * the band arrives than it was expected to. fit tells how clearly the microphone followed the band (0..1):
   * near 0 it did not hear it at all, as under headphones. Taken over at once (the coupling, and the bands moved
   * by the lateness) when the fit is HEARD_FIT or more. null when the band played too little to tell.
   */
  learnedEcho(): { coupling: number[]; late: number; fit: number; level: number } | null {
    const from = this.learnFrom;
    this.learnFrom = -1;
    const log = this.echoLog.filter((e) => e.at >= from);
    const found = this.fitEcho(log, true);
    if (!found) return null;
    // a microphone that did not follow the band at all (headphones) has told nothing to go by
    if (found.fit >= HEARD_FIT) {
      this.coupling = found.coupling;
      this.followed = null;
      this.moveBands(found.lag * HOP);
    }
    return { coupling: found.coupling, late: (found.lag * HOP) / this.sr, fit: found.fit, level: found.level };
  }

  /** Every band from now on arrives this many samples later than expected (negative: earlier). */
  private moveBands(samples: number): void {
    if (!samples) return;
    for (const b of this.bands) b.start += samples;
    // the spectra kept for the slack belong to the old timing
    this.ringLive.fill(0);
    for (const r of this.ringO) r.fill(0);
    for (const r of this.ringF) r.fill(0);
    this.echoLog = [];
  }

  /**
   * How the microphone follows the band in a stretch of the log. First the lateness: the shift, within a quarter
   * of a second, at which the microphone's strength per frequency band rises and falls most closely with the
   * band's. Then, at that shift, the coupling of each frequency band: with the band alone (the soundcheck) the
   * slope of the one against the other. While the player plays too, his chords ring under every moment, and a
   * ratio of what arrives to what the band plays came out several times too high (and took his strums off with
   * the band). So then it is the rises that are compared: where one of the band's notes begins, the microphone
   * rises by the coupling times the band's rise, and a chord that merely rings on drops out of the difference.
   * The median of those, taken over the band's clear beginnings.
   */
  private fitEcho(log: { mic: Float32Array; ref: Float32Array }[], alone: boolean): { coupling: number[]; lag: number; gain: number; fit: number; level: number } | null {
    const B = ECHO_BANDS.length;
    const n = log.length;
    // the band's spectrum is logged ECHO_SLACK ahead of the microphone's
    const ahead = ECHO_SLACK / HOP;
    const MAXLAG = Math.round((0.25 * this.sr) / HOP);
    if (n < 2 * MAXLAG + 40) return null;
    let refAll = 0;
    for (const e of log) for (let b = 0; b < B; b++) refAll += e.ref[b];
    if (refAll <= 0) return null;
    const corr = (lag: number): number => {
      let total = 0;
      for (let b = 0; b < B; b++) {
        let sm = 0;
        let sr = 0;
        let smm = 0;
        let srr = 0;
        let smr = 0;
        let k = 0;
        for (let i = MAXLAG; i < n - MAXLAG; i++) {
          const m = log[i].mic[b];
          const r = log[i - ahead - lag]?.ref[b] ?? 0;
          sm += m;
          sr += r;
          smm += m * m;
          srr += r * r;
          smr += m * r;
          k++;
        }
        const cov = smr / k - (sm / k) * (sr / k);
        const vm = smm / k - (sm / k) ** 2;
        const vr = srr / k - (sr / k) ** 2;
        // each band counts by how much of the band's sound lies in it
        if (vm > 0 && vr > 0) total += (sr / k) * (cov / Math.sqrt(vm * vr));
      }
      return total;
    };
    let lag = 0;
    let best = -Infinity;
    for (let L = -MAXLAG; L <= MAXLAG; L++) {
      const c = corr(L);
      if (c > best) {
        best = c;
        lag = L;
      }
    }
    // how much better the best shift fits than none: a band whose notes come evenly fits nearly as well one note
    // off, so a small gain is no evidence of being late
    const gain = best / Math.max(1e-12, corr(0));
    let weight = 0;
    for (let i = MAXLAG; i < n - MAXLAG; i++) for (let b = 0; b < B; b++) weight += log[i - ahead - lag]?.ref[b] ?? 0;
    const fit = weight > 0 ? Math.max(0, best / (weight / (n - 2 * MAXLAG))) : 0;
    // A frequency band the band hardly reaches (where only the edges of its drums' spectrum spill over) cannot
    // be measured: the microphone's noise there over next to nothing would come out as a huge coupling, and
    // taking that off would take the player off. Such a band is given the coupling of the bands around it.
    const means: number[] = [];
    for (let b = 0; b < B; b++) {
      let sum = 0;
      for (let i = MAXLAG; i < n - MAXLAG; i++) sum += log[i - ahead - lag]?.ref[b] ?? 0;
      means.push(sum / (n - 2 * MAXLAG));
    }
    const strongest = Math.max(...means);
    const coupling: (number | null)[] = [];
    let micSum = 0;
    for (let b = 0; b < B; b++) {
      const pairs: [number, number][] = [];
      let top = 0;
      for (let i = MAXLAG; i < n - MAXLAG; i++) {
        const r = log[i - ahead - lag]?.ref[b] ?? 0;
        pairs.push([log[i].mic[b], r]);
        top = Math.max(top, r);
        micSum += log[i].mic[b];
      }
      if (top <= 0 || means[b] < 0.02 * strongest) {
        coupling.push(null);
        continue;
      }
      if (alone) {
        // the slope, with the room's own noise as the intercept
        let sm = 0;
        let sr = 0;
        let smr = 0;
        let srr = 0;
        for (const [m, r] of pairs) {
          sm += m;
          sr += r;
          smr += m * r;
          srr += r * r;
        }
        const k = pairs.length;
        const v = srr / k - (sr / k) ** 2;
        coupling.push(v > 0 ? Math.max(0, (smr / k - (sm / k) * (sr / k)) / v) : 0);
      } else {
        // the rise over three hops (32 ms): a note's attack and the first of the room's answer to it
        const rises: [number, number][] = [];
        let most = 0;
        for (let i = 3; i < pairs.length; i++) {
          const dr = pairs[i][1] - pairs[i - 3][1];
          if (dr <= 0) continue;
          rises.push([pairs[i][0] - pairs[i - 3][0], dr]);
          most = Math.max(most, dr);
        }
        const ratios = rises.filter(([, dr]) => dr >= 0.3 * most).map(([dm, dr]) => Math.max(0, dm) / dr).sort((a, b) => a - b);
        coupling.push(ratios.length >= 10 ? ratios[ratios.length >> 1] : null);
      }
    }
    // Only the band's drums reached the analysed range at all (a stretch in which the player leaves no gaps): nothing
    // can be told from that. Otherwise no band is given more than eight times the median of those measured: one
    // measured over little is not to be trusted beyond that either.
    const sure = coupling.filter((c, b): c is number => c !== null && ECHO_BANDS[b] < 6000).sort((a, b) => a - b);
    if (!sure.length) return null;
    const median = sure[sure.length >> 1];
    const filled = coupling.map((c, b) => {
      if (c !== null) return Math.min(c, 8 * median);
      // the nearest measured bands on either side
      let lo = b - 1;
      while (lo >= 0 && coupling[lo] === null) lo--;
      let hi = b + 1;
      while (hi < B && coupling[hi] === null) hi++;
      const near = [lo >= 0 ? coupling[lo] : null, hi < B ? coupling[hi] : null].filter((x): x is number => x !== null);
      return near.length ? Math.min(Math.max(...near), 8 * median) : median;
    });
    return { coupling: filled, lag, gain, fit: Math.min(1, fit), level: micSum / Math.max(1, n - 2 * MAXLAG) };
  }

  /**
   * While a band plays without a soundcheck to go by, or louder than at the soundcheck: about once a second the
   * coupling is worked out afresh from the last eight seconds, and the timing corrected when it is clearly off.
   */
  private followEcho(): void {
    if (this.learnFrom >= 0 || this.total - this.lastFollow < this.sr) return;
    this.lastFollow = this.total;
    const found = this.fitEcho(this.echoLog, false);
    if (!found || found.fit < 0.15) return;
    // up at once, down only slowly: a band in which the fiddle plays now and then is measured over few moments in
    // the high bands, and a dip there would let its overtones through
    const was = this.followed;
    this.followed = found.coupling.map((c, b) => Math.max(c, 0.9 * (was?.[b] ?? 0)));
    // The timing is only moved on clear evidence: four seconds or more of the band, a shift that fits clearly
    // better than none, and the same shift found the time before. One second's worth just after a soundcheck once
    // moved a band that was in time, and its notes were heard as playing.
    const sure = this.echoLog.length * HOP >= 4 * this.sr && found.fit >= 0.4 && found.gain >= 1.2 && Math.abs(found.lag) >= 2;
    if (sure && this.lastLag === found.lag) {
      this.moveBands(found.lag * HOP);
      this.lastLag = 0;
    } else this.lastLag = sure ? found.lag : 0;
  }

  /**
   * The coupling in one frequency band now: the soundcheck's, or what was followed when that is more, but then
   * never more than half as much again (while the player plays, following errs high, and the soundcheck, made with
   * the band alone, is the better measure: following is there for speakers turned up since). Below about
   * 300 Hz a room does not spread a tone evenly but rings in a few strong modes, up to ten decibels above the
   * average of their band: there twice as much is reckoned with (measured: a bass note in such a mode swelled up
   * after its start and was taken for a strum).
   */
  private gainOf(b: number): number {
    const c = this.coupling?.[b] ?? 0;
    const f = this.followed?.[b] ?? 0;
    // nothing known yet (the band has only just begun, and there was no soundcheck): as much as a loud speaker next to the microphone
    const g = this.coupling ? Math.max(c, Math.min(f, 1.5 * c)) : this.followed ? f : 0.5;
    return ECHO_BANDS[b + 1] !== undefined && ECHO_BANDS[b + 1] <= 350 ? 2 * g : g;
  }

  /**
   * The band's spectrum in the window of n samples from listener sample `start`, into out: as it leaves the
   * speakers, or (coupled) as the microphone should hear it. False when it is silent there.
   */
  private echoSpectrum(start: number, n: number, fft: FFT, out: Float32Array, coupled = true): boolean {
    const buf = this.echoBuf;
    buf.fill(0, 0, n);
    let any = false;
    for (const b of this.bands) if (b.add(start, n, buf)) any = true;
    if (!any) return false;
    fft.magnitudes(buf, out);
    if (coupled) {
      const map = bandOfBin(n, this.sr);
      for (let k = 0; k <= n / 2; k++) out[k] *= this.gainOf(map[k]);
    }
    return true;
  }

  /**
   * The loudest the band is in each bin over the kept hops, or what the room still rings with of what it was
   * before, coupled, into echoMax. tail keeps the ringing from hop to hop.
   */
  private ringMax(ring: Float32Array[], bins: number, n: number, tail: Float32Array): void {
    const max = this.echoMax;
    max.fill(0, 0, bins);
    for (let s = 0; s < ring.length; s++) {
      if (!this.ringLive[s]) continue;
      const r = ring[s];
      for (let k = 0; k < bins; k++) if (r[k] > max[k]) max[k] = r[k];
    }
    const d = this.hopDecay;
    for (let k = 0; k < bins; k++) {
      const t = tail[k] * d;
      if (t > max[k]) max[k] = t;
      tail[k] = max[k];
    }
    const map = bandOfBin(n, this.sr);
    for (let k = 0; k < bins; k++) max[k] *= this.gainOf(map[k]);
  }

  /** Takes the band off a spectrum: what it may bring to each bin, times `over` (see left). */
  private takeOff(mag: Float32Array, echo: Float32Array, bins = mag.length, over = this.echoOver): void {
    for (let k = 0; k < bins; k++) mag[k] = left(mag[k], over * echo[k]);
  }

  /**
   * The band taken off the spectrum of the n samples from `start`, wherever within the slack its sound may lie,
   * and what the room still rings with of the band before the window.
   */
  private cleanAt(start: number, n: number, fft: FFT, mag: Float32Array, over = this.echoOver): void {
    if (!this.bands.length) return;
    const looks: [number, number][] = (n >= CHORD_WIN ? [-ECHO_SLACK, 0, ECHO_SLACK] : [-ECHO_SLACK, -ECHO_SLACK / 2, 0, ECHO_SLACK / 2, ECHO_SLACK]).map((d) => [d, 1]);
    const step = Math.pow(10, (-3 * TAIL_STEP) / this.sr / ROOM_RT60);
    for (let j = 1; j <= TAIL_STEPS; j++) looks.push([-ECHO_SLACK - j * TAIL_STEP, Math.pow(step, j)]);
    const bins = n / 2 + 1;
    const max = this.echoMax;
    max.fill(0, 0, bins);
    let any = false;
    for (const [d, g] of looks) {
      if (!this.echoSpectrum(start + d, n, fft, this.echoMag)) continue;
      any = true;
      for (let k = 0; k < bins; k++) if (g * this.echoMag[k] > max[k]) max[k] = g * this.echoMag[k];
    }
    if (any) this.takeOff(mag, max, bins, over);
  }

  /**
   * How much of what rose in this frame is left once the band is taken off: what rose, summed over the bins and
   * not compressed, with the band taken off, against the same as it came in. Measured on magnitudes as they
   * are, because on a compressed scale taking a constant off a partial that grows makes it grow faster: a band
   * note that a room's resonance swells up after its start would look all the player's. lin holds the last
   * three frames of each (0..2 as they came in, 3..5 with the band taken off) and moves on by one.
   */
  private ownShare(mag: Float32Array, echo: Float32Array | null, lin: Float32Array[], k0: number, k1: number): number {
    const [a1, a2, a3, b1, b2, b3] = lin;
    const over = this.echoOver;
    let raw = 0;
    let kept = 0;
    for (let k = k0; k <= k1; k++) {
      const m = mag[k];
      const mc = echo ? left(m, over * echo[k]) : m;
      const was = Math.max(a1[k], a2[k], a3[k]);
      if (m > was) raw += m - was;
      const wasC = Math.max(b1[k], b2[k], b3[k]);
      if (mc > wasC) kept += mc - wasC;
      a3[k] = m;
      b3[k] = mc;
    }
    lin[0] = a3;
    lin[1] = a1;
    lin[2] = a2;
    lin[3] = b3;
    lin[4] = b1;
    lin[5] = b2;
    return raw > 0 ? Math.min(1, kept / raw) : 1;
  }

  /**
   * Each hop while a band plays: its spectrum in the two onset windows ECHO_SLACK ahead goes into the ring; how
   * strong the microphone and the band are in each frequency band goes into the log; and what the band may bring
   * to the short window, wherever within the slack its sound lies, is left in echoMax. False when no band is near.
   */
  private echoHop(): boolean {
    // a band that has ended is let go once no window still to be analysed can reach back to it
    this.bands = this.bands.filter((b) => b.live(this.total - 3 * CHORD_WIN - 2 * ECHO_SLACK, Infinity));
    if (!this.bands.length) {
      this.ringLive.fill(0);
      this.tailO.fill(0);
      this.tailF.fill(0);
      this.echoLog = [];
      return false;
    }
    const slot = this.ringAt;
    this.ringAt = (slot + 1) % ECHO_RING;
    const ahead = this.total + ECHO_SLACK;
    const o = this.echoSpectrum(ahead - 1024, 1024, this.fftO, this.ringO[slot], false);
    if (!o) this.ringO[slot].fill(0);
    const f = this.echoSpectrum(ahead - NOTE_WIN, NOTE_WIN, this.fftN, this.ringF[slot], false);
    if (!f) this.ringF[slot].fill(0);
    this.ringLive[slot] = o || f ? 1 : 0;
    if (!this.ringLive.some((x) => x)) return false;
    // the log, before anything is taken off: the microphone now, the band ECHO_SLACK ahead
    const map = bandOfBin(1024, this.sr);
    const mic = new Float32Array(ECHO_BANDS.length);
    const ref = new Float32Array(ECHO_BANDS.length);
    const r = this.ringO[slot];
    for (let k = 1; k < 513; k++) {
      mic[map[k]] += this.magO[k];
      ref[map[k]] += r[k];
    }
    this.echoLog.push({ mic, ref, at: this.total });
    // eight seconds are enough to follow it by; a soundcheck keeps all of its own
    const keep = Math.round((8 * this.sr) / HOP);
    if (this.learnFrom < 0 && this.echoLog.length > keep) this.echoLog.splice(0, this.echoLog.length - keep);
    this.followEcho();
    this.ringMax(this.ringO, 513, 1024, this.tailO);
    return true;
  }

  private hop(): void {
    let sq = 0;
    for (let i = 0; i < HOP; i++) {
      const v = this.pend[i];
      this.ring[(this.total + i) & (RING - 1)] = v;
      sq += v * v;
    }
    this.total += HOP;
    this.hops++;
    const rms = Math.sqrt(sq / HOP);
    // a quarter of the hop or more came in as zeros: digital silence, not a quiet room. (A room heard by a
    // real microphone is never that still; the high-pass above lets a step into zeros fade out over a few
    // hops, so the filtered level alone would not tell.)
    const digital = this.still > HOP / 4 || rms < 1e-6;
    this.still = 0;

    // Background level: taken from the first moments, after that the quietest moment heard so far, drifting
    // up by about one decibel a minute so it can recover if the room gets louder. It must never follow the
    // music: while strings ring without a pause there is no silence to measure, and a floor that climbed to
    // the level of the playing would make the listener deaf. Digital silence (a microphone that is muted
    // for a moment, a sound card that sends zeros) is no room at all and is left out: it would pin the
    // floor at its least, and from there it takes half an hour to climb back to the real room.
    if (this.warm.length < 16) {
      this.warm.push(rms);
      this.floor = this.warm.slice().sort((a, b) => a - b)[this.warm.length >> 1];
    } else if (!digital) this.floor = Math.max(1e-5, Math.min(rms, this.floor * 1.00002));
    const gate = Math.max(this.floor * 3.2, 0.0008);

    this.detectOnset(rms, gate);

    while (this.noteJobs.length && this.total >= this.noteJobs[0].s0 + this.thudWin) {
      const job = this.noteJobs.shift()!;
      // A hit after which nothing sounds is not a note, whatever pitch its first moment suggests: a dead
      // string, the hand landing on the strings. The string check still wants to know what it sounded like.
      // (only what is down to a thirtieth by now: some real notes fall to a tenth this fast and ring on quietly)
      this.analyzeNote(job.s0, this.died(job.s0, job.s0 + this.thudWin, 0.001).silent);
    }
    this.settleThuds(this.total, false);
    while (this.chordJobs.length && this.total >= this.chordJobs[0] + 1024 + CHORD_WIN) this.analyzeChord(this.chordJobs.shift()!);
    if (this.check?.state === 'track' && this.hops % 2 === 0) this.trackString();

    if (this.hops % 2 === 0) {
      if (this.pitchTracking && rms > gate) {
        this.copy(this.total - NOTE_WIN, NOTE_WIN, this.bufN);
        const p = yin(this.bufN, this.sr);
        if (p && p.clarity > this.pitchClarity) {
          const m = freqToMidi(p.freq, this.a4);
          const midi = Math.round(m);
          this.onPitch?.({ time: this.time, freq: p.freq, midi, cents: (m - midi) * 100, clarity: p.clarity });
        }
      }
      if (this.partialBand && this.onPartial && rms > gate) this.trackPartial(this.partialBand);
      this.onLevel?.({ time: this.time, rms, db: 20 * Math.log10(rms + 1e-9), gateDb: 20 * Math.log10(gate) });
    }
  }

  private trackPartial([lo, hi]: [number, number]): void {
    this.copy(this.total - CHORD_WIN, CHORD_WIN, this.bufC);
    this.fftC.magnitudes(this.bufC, this.magCA);
    const hz = this.sr / CHORD_WIN;
    let k = -1;
    for (let i = Math.max(1, Math.ceil(lo / hz)); i <= Math.min(this.magCA.length - 2, Math.floor(hi / hz)); i++) if (k < 0 || this.magCA[i] > this.magCA[k]) k = i;
    if (k < 0 || this.magCA[k] <= this.magCA[k - 1] || this.magCA[k] < this.magCA[k + 1]) return; // the band's edge, not a peak
    const a = Math.log(this.magCA[k - 1] + 1e-12);
    const b = Math.log(this.magCA[k] + 1e-12);
    const c = Math.log(this.magCA[k + 1] + 1e-12);
    const p = (0.5 * (a - c)) / (a - 2 * b + c);
    this.onPartial?.({ time: this.time, freq: (k + p) * hz, level: this.magCA[k] });
  }

  private detectOnset(rms: number, gate: number): void {
    this.copy(this.total - 1024, 1024, this.winO);
    this.fftO.magnitudes(this.winO, this.magO);
    this.echoNow = this.bands.length > 0 && this.echoHop();
    const hz = this.sr / 1024;
    const k0 = Math.max(1, Math.round(80 / hz));
    const k1 = Math.min(512, Math.round(6000 / hz));
    // scaled so that the background sits near zero after compression, whatever the input gain
    const c = 2 / Math.max(this.floor, QUIET);
    // rise of each bin over the highest it has been in the last three frames and its neighbours:
    // steady noise and a rattling string fluctuate, but rarely exceed their own recent maximum by much
    const [p1, p2, p3] = this.prevO;
    const cur = p3;
    // while a band plays: what it may bring is taken off each bin (echoMax, see echoHop)
    const echo = this.echoNow ? this.echoMax : null;
    const over = this.echoOver;
    let flux = 0;
    let last = 0;
    let band = 0;
    for (let k = k0 - 1; k <= k1 + 1; k++) {
      const m = echo ? left(this.magO[k], over * echo[k]) : this.magO[k];
      const v = Math.log1p(c * m);
      if (k >= k0 && k <= k1) {
        band += m * m;
        const before = Math.max(p1[k - 1], p1[k], p1[k + 1], p2[k - 1], p2[k], p2[k + 1], last, p3[k], p3[k + 1]);
        if (v > before) flux += v - before;
      }
      last = p3[k];
      cur[k] = v;
    }
    this.prevO[0] = cur;
    this.prevO[2] = p2;
    this.prevO[1] = p1;
    flux /= k1 - k0 + 1;
    const own = this.bands.length ? this.ownShare(this.magO, echo, this.linO, k0, k1) : 1;
    // How loud the playing is, for telling a note from leftovers. Measured in the analysed band only,
    // so that a metronome tick above it does not make quiet notes look like leftovers.
    this.ref = Math.max(0.58 * Math.sqrt(band), this.ref * 0.9997, 0.004);

    const sorted = this.flux.slice().sort((a, b) => a - b);
    const median = sorted.length ? sorted[sorted.length >> 1] : 0;
    const threshold = 2 * median + 0.04;
    this.flux.push(flux);
    if (this.flux.length > 14) this.flux.shift();

    if (flux > threshold && own >= OWN_SHARE && rms > gate && this.total - this.lastOnset >= 0.07 * this.sr && this.total > 0.25 * this.sr) {
      // the attack entered somewhere in the last hop or just before it
      this.pending = null;
      this.fire(this.total - HOP - 256, flux, own);
    } else {
      this.detectFine(rms, gate, c);
      // The long window may notice a sharp attack a moment before the short one does, but the short one
      // knows better when it was. So what the long window finds waits three hops for the short one to
      // confirm it, and only counts by itself when that does not come.
      const p = this.pending;
      if (p && this.total - p.at >= 3 * HOP) {
        this.pending = null;
        this.fire(p.at - 1280, p.flux, p.own);
      }
    }
  }

  /**
   * A second look for onsets that the first one cannot see: a low or soft note that begins while several
   * others ring. In the short window above, its partials fall into the same coarse bins as theirs and
   * raise nothing. A window four times as long tells them apart. It is only asked when the short window
   * found nothing, and it needs several partials rising at once: one pair of strings beating against
   * each other also makes a bin swell.
   */
  private detectFine(rms: number, gate: number, c: number): void {
    this.copy(this.total - NOTE_WIN, NOTE_WIN, this.bufN);
    this.fftN.magnitudes(this.bufN, this.magF);
    const echo = this.echoNow ? this.echoMax : null;
    if (echo) this.ringMax(this.ringF, this.fineBins + 2, NOTE_WIN, this.tailF);
    const over = this.echoOver;
    const hz = this.sr / NOTE_WIN;
    const k0 = Math.max(1, Math.round(80 / hz));
    const own = this.bands.length ? this.ownShare(this.magF, echo, this.linF, k0, this.fineBins - 1) : 1;
    const [p1, p2, p3] = this.prevF;
    const cur = p3;
    let flux = 0;
    let last = 0;
    let rising = 0;
    let inRun = false;
    for (let k = k0 - 1; k <= this.fineBins; k++) {
      const v = Math.log1p(c * (echo ? left(this.magF[k], over * echo[k]) : this.magF[k]));
      if (k >= k0 && k < this.fineBins) {
        const before = Math.max(p1[k - 1], p1[k], p1[k + 1], p2[k - 1], p2[k], p2[k + 1], last, p3[k], p3[k + 1]);
        const rise = v - before;
        if (rise > 0) flux += rise;
        if (rise > 0.3) {
          if (!inRun) rising++;
          inRun = true;
        } else inRun = false;
      }
      last = p3[k];
      cur[k] = v;
    }
    this.prevF[0] = cur;
    this.prevF[2] = p2;
    this.prevF[1] = p1;
    flux /= this.fineBins - k0;
    const sorted = this.fluxF.slice().sort((a, b) => a - b);
    const median = sorted.length ? sorted[sorted.length >> 1] : 0;
    this.fluxF.push(flux);
    if (this.fluxF.length > 14) this.fluxF.shift();
    if (!this.pending && flux > 2 * median + 0.02 && own >= OWN_SHARE && rising >= 3 && rms > gate && this.total - this.lastOnset >= 0.12 * this.sr && this.total > 0.3 * this.sr) {
      this.pending = { at: this.total, flux: 3 * flux, own };
    }
  }

  /** An onset was found: tell whoever listens and queue the closer looks at it. */
  private fire(s0: number, flux: number, own = 1): void {
    // Nothing is known yet of how strongly the speakers reach the microphone (no speaker test, and the band has
    // only just begun): an onset just where one of the band's notes arrives, or while the room swells with it, is
    // taken for that note. After a second or two of the band it is known (followEcho).
    if (this.bands.length && !this.coupling && !this.followed && this.bands.some((b) => b.begins(s0 - 0.12 * this.sr - ECHO_SLACK, s0 + ECHO_SLACK + 0.02 * this.sr))) return;
    this.lastOnset = this.total;
    this.onOnset?.({ time: s0 / this.sr, strength: flux, ...(this.bands.length ? { own } : {}) });
    // A finger landing on the string or the pick touching it is heard a moment before the pluck itself.
    // Two onsets less than a tenth of a second apart are one attack: the firmer one is looked at.
    const earlier = this.noteJobs[this.noteJobs.length - 1];
    if (earlier && s0 - earlier.s0 < 0.1 * this.sr) {
      if (flux < earlier.flux) return;
      this.noteJobs.pop();
      if (this.thudJobs[this.thudJobs.length - 1]?.s0 === earlier.s0) this.thudJobs.pop();
      if (this.check?.state === 'track' && this.check.s0 === earlier.s0) this.startStringCheck(this.check.midi);
    }
    // what came before this onset has had its time to fall silent
    this.settleThuds(s0, true);
    if (this.noteDetection || this.check) this.noteJobs.push({ s0, flux });
    if (this.onThud) this.thudJobs.push({ s0, flux });
    // the strings of one strum arrive over several milliseconds: only the first onset starts a chord
    if (this.chordCandidates && s0 - this.lastChord > 0.18 * this.sr) {
      this.lastChord = s0;
      this.chordJobs.push(s0);
    }
    // A pluck that comes while the previous string is still being judged ends that judgement. Whoever
    // listens usually asks for the next string right away, and then this same pluck is that string's.
    // Such a carried-over onset may also be a finger or the room, so it can only ever confirm a string
    // (see finishString): if it does not, the check simply goes on waiting.
    let carried = false;
    if (this.check?.state === 'track' && this.total - this.check.s0 > 0.2 * this.sr) {
      this.finishString();
      carried = true;
    }
    const ck = this.check;
    if (ck && ck.state === 'wait') {
      ck.carried = carried;
      ck.state = 'track';
      ck.s0 = s0;
      ck.strength = flux;
      // What was sounding before the pluck is taken off afterwards, so that other strings do not count for
      // this one. But a string that rang a moment ago and is plucked again was itself part of "before":
      // its old sound ends with the new pluck. For it, "before" is what sounded before it first rang.
      const rang = this.rang;
      this.copy(s0 - PRE_GAP - NOTE_WIN, NOTE_WIN, this.bufN);
      if (rang && rang.midi === ck.midi && s0 - rang.s0 < 4 * this.sr) {
        ck.pre.set(rang.pre);
        ck.again = true;
        this.fftN.magnitudes(this.bufN, this.magB);
        ck.before = this.over(this.magB, ck.pre, midiToFreq(ck.midi, this.a4));
      } else this.fftN.magnitudes(this.bufN, ck.pre);
    }
  }

  /**
   * Two views of the moment after an onset: magRaw is everything that sounds, magA only what appeared
   * (after minus before, never below zero). magB keeps the spectrum from before the onset.
   */
  private newEnergy(s0: number): void {
    this.copy(s0 + this.noteDelay, NOTE_WIN, this.bufN);
    this.fftN.magnitudes(this.bufN, this.magRaw);
    this.cleanAt(s0 + this.noteDelay, NOTE_WIN, this.fftN, this.magRaw);
    this.copy(s0 - PRE_GAP - NOTE_WIN, NOTE_WIN, this.bufN);
    this.fftN.magnitudes(this.bufN, this.magB);
    this.cleanAt(s0 - PRE_GAP - NOTE_WIN, NOTE_WIN, this.fftN, this.magB);
    for (let k = 0; k < this.magA.length; k++) this.magA[k] = Math.max(0, this.magRaw[k] - this.magB[k]);
  }

  /**
   * The frequency of a note as this instrument plays it right now. A string is rarely exactly in tune, and
   * every string is off by its own amount; taken at the pitch the note ought to have, a string a quarter of
   * a semitone flat would fit its own note poorly. So the comb is set by the strongest partial that lies
   * within 40 cents of one of the note's first four harmonics.
   */
  private tuned(peaks: Peak[], midi: number): number {
    const f0 = midiToFreq(midi, this.a4);
    let top = 0;
    let cents = 0;
    for (const p of peaks) {
      const h = Math.round(p.f / f0);
      if (h < 1 || h > 4 || p.a <= top) continue;
      const d = 1200 * Math.log2(p.f / (h * f0));
      if (Math.abs(d) <= 40) {
        top = p.a;
        cents = d;
      }
    }
    return f0 * Math.pow(2, cents / 1200);
  }

  /** Best and second-best note for a set of peaks, giving an expected note the benefit of the doubt. */
  private pick(peaks: Peak[]): { best: number; score: number; conf: number; second: number; secondScore: number } {
    let best = -1;
    let score = -Infinity;
    let conf = 0;
    let second = -1;
    let secondScore = -Infinity;
    for (let m = this.minMidi; m <= this.maxMidi; m++) {
      const cs = combScore(peaks, this.tuned(peaks, m), 5000);
      if (cs.score > score) {
        second = best;
        secondScore = score;
        best = m;
        score = cs.score;
        conf = cs.explained;
      } else if (cs.score > secondScore) {
        second = m;
        secondScore = cs.score;
      }
    }
    if (this.expected && !this.expected.includes(best)) {
      // of several notes it waits for (a chord's, a phrase's), the one the evidence is best for
      let near = -1;
      let nearScore = -Infinity;
      let nearConf = 0;
      for (const m of this.expected) {
        const cs = combScore(peaks, this.tuned(peaks, m), 5000);
        if (cs.score >= 0.85 * score && cs.score > nearScore) {
          near = m;
          nearScore = cs.score;
          nearConf = cs.explained;
        }
      }
      if (near >= 0) {
        second = best;
        secondScore = score;
        best = near;
        score = nearScore;
        conf = nearConf;
      }
    }
    return { best, score, conf, second, secondScore };
  }

  /**
   * Identifies the note that began at s0 and reports it, unless the sound died at once (dead).
   * Returns false when no note came of the onset.
   */
  private analyzeNote(s0: number, dead: boolean): boolean {
    this.newEnergy(s0);
    const hz = this.sr / NOTE_WIN;
    const floor = Math.max(0.0012, 0.04 * this.ref);
    const raw = findPeaks(this.magRaw, this.sr, NOTE_WIN, 60, 5000, 40, 0.03);
    const again = this.check && this.check.state === 'track' && this.check.s0 === s0 && this.check.again ? this.check : null;
    if (again) {
      for (let k = 0; k < this.magA.length; k++) this.magA[k] = Math.max(0, this.magRaw[k] - again.pre[k]);
      const own = findPeaks(this.magA, this.sr, NOTE_WIN, 60, 5000, 40, 0.03);
      const r = own.length ? this.pick(own) : null;
      again.heard = r && r.conf >= 0.45 && r.score > 0 ? r.best : null;
      again.heardConf = r ? r.conf : 0;
      again.expectedShare = own.length ? combScore(own, this.tuned(own, again.midi), 5000).explained : 0;
      for (let k = 0; k < this.magA.length; k++) this.magA[k] = Math.max(0, this.magRaw[k] - this.magB[k]);
    }
    if (!raw.length || raw[0].a < floor) {
      this.onDrop?.({ time: s0 / this.sr, reason: 'quiet', midi: null, conf: 0, ring: 0 });
      return false;
    }

    // First the plain view. If one note explains nearly everything that sounds, and that note was not
    // already sounding before the onset, it is the answer. This is the case when the older sound stopped
    // at the onset (the next fret on the same string), where subtracting "before" would only do damage.
    let r = this.pick(raw);
    let peaks = raw;
    let fresh = false;
    if (r.best >= 0 && r.conf >= 0.8) {
      // "Not already sounding" must hold for the note's own harmonics one by one: a note an octave above
      // a ringing string adds energy to that string's even harmonics only.
      const f0 = this.tuned(raw, r.best);
      harmonicAmps(raw, f0, this.hNow);
      harmonicAmps(findPeaks(this.magB, this.sr, NOTE_WIN, 60, 5000, 40, 0.03), f0, this.hWas);
      const top = Math.max(...this.hNow);
      let grown = 0;
      let all = 0;
      let stale = false;
      for (let h = 1; h <= 8; h++) {
        if (this.hNow[h] < 0.06 * top) continue;
        const w = 1 / Math.sqrt(h);
        all += w;
        if (this.hNow[h] > 1.3 * this.hWas[h]) grown += w;
        // One strong harmonic that was there all along gives it away: this "note" is a common root under
        // an old note and a new one (the D below a ringing A and a new D), not one new note.
        else if (this.hNow[h] >= 0.25 * top) stale = true;
      }
      fresh = all > 0 && !stale && grown / all >= 0.7;
    }
    if (!fresh) {
      // Otherwise other strings are ringing: look only at what appeared at the onset.
      peaks = findPeaks(this.magA, this.sr, NOTE_WIN, 60, 5000, 40, 0.03);
      if (!peaks.length || peaks[0].a < floor) {
        this.onDrop?.({ time: s0 / this.sr, reason: 'quiet', midi: r.best, conf: r.conf, ring: 0 });
        return false;
      }
      r = this.pick(peaks);
    }
    let { best, second } = r;
    const bestScore = r.score;
    const bestConf = r.conf;
    const secondScore = r.secondScore;
    const ck = this.check;
    if (ck && ck.state === 'track' && ck.s0 === s0 && !ck.again) {
      ck.heard = bestConf >= 0.45 && bestScore > 0 ? best : null;
      ck.heardConf = bestConf;
      ck.expectedShare = combScore(peaks, this.tuned(peaks, ck.midi), 5000).explained;
    }
    // Among ringing strings a real note rarely explains everything that changed at its onset. When it is
    // the very note the app is waiting for, less than half is proof enough.
    // A note it is not waiting for must be clear, or every little noise would be called a wrong note.
    if (bestScore <= 0 || bestConf < (!this.expected ? 0.45 : this.expected.includes(best) ? 0.3 : 0.55)) {
      this.onDrop?.({ time: s0 / this.sr, reason: 'unsure', midi: best, conf: bestConf, ring: 0 });
      return false;
    }
    const ring = this.ringRatio(s0, midiToFreq(best, this.a4));
    if (ring < 0.55) {
      // a choked note: it was gone again within a few milliseconds
      this.onDrop?.({ time: s0 / this.sr, reason: 'choked', midi: best, conf: bestConf, ring });
      return false;
    }
    if (dead) {
      this.onDrop?.({ time: s0 / this.sr, reason: 'choked', midi: best, conf: bestConf, ring: 0 });
      return false;
    }
    if (!this.noteDetection) return true;
    // Is the note before this one still sounding? Its harmonics just before this onset, against how
    // strong they were when it began. Ringing strings and joined-up piano notes score high.
    const prev = this.lastNote;
    let held = -1;
    if (prev && s0 - prev.s0 < 3 * this.sr && s0 - prev.s0 > PRE_GAP + NOTE_WIN / 2 && prev.amp > 0) {
      held = Math.min(1, this.combAmp(this.magB, midiToFreq(prev.midi, this.a4), hz) / prev.amp);
    }
    this.lastNote = { midi: best, s0, amp: this.combAmp(this.magRaw, midiToFreq(best, this.a4), hz) };
    this.onNote?.({
      time: s0 / this.sr,
      midi: best,
      conf: bestConf,
      margin: secondScore > 0 ? bestScore / secondScore : 99,
      second: second >= 0 ? second : null,
      level: peaks[0].a,
      ring,
      held,
    });
    return true;
  }

  /** Summed strength of the first `harmonics` harmonics of f0 in a spectrum whose bins are hz apart. */
  private combAmp(mag: Float32Array, f0: number, hz: number, harmonics = 4): number {
    let v = 0;
    for (let h = 1; h <= harmonics; h++) {
      const k = Math.round((h * f0) / hz);
      if (k + 1 >= mag.length) break;
      v += Math.max(mag[k - 1], mag[k], mag[k + 1]);
    }
    return v;
  }

  /** Energy between 60 and 5000 Hz in the 43 ms from start: the band notes are heard in, without the metronome. */
  private bandPower(start: number): number {
    this.copy(start, 2048, this.bufH);
    this.fftH.magnitudes(this.bufH, this.magH);
    const hz = this.sr / 2048;
    let sum = 0;
    for (let k = Math.round(60 / hz); k <= Math.round(5000 / hz); k++) sum += this.magH[k] * this.magH[k];
    return sum;
  }

  /**
   * Was the onset at s0 followed by silence? It was when by `end` everything is all but silent, measured
   * against the loudest moment of the onset. Everything: when other strings ring on, this cannot tell,
   * and says no. `hit` tells whether the onset was clearly louder than what came before it: a string
   * that was struck, as against a hand that only stopped the strings.
   *
   * Measured on recordings: a dead string of a steel-string guitar is down to a tenth of its loudest
   * moment after 0.1 s and to a hundredth after 0.2 s. A ringing note, also one that dies quickly, a
   * nylon string hit hard, still has a fifth to a half after 0.1 s and more than a tenth after 0.3 s.
   */
  private died(s0: number, end: number, gone = end - s0 < 0.2 * this.sr ? 0.01 : 0.0025): { silent: boolean; hit: boolean } {
    const before = this.bandPower(s0 - 512 - 2048);
    // the hit itself may come a little after the first noise of it: the loudest of three looks
    const early = Math.max(this.bandPower(s0 - 256), this.bandPower(s0 + 768), this.bandPower(s0 + 1792));
    const late = this.bandPower(end - 2048);
    // gone, in amplitude: down to a tenth when looked at early, to a twentieth later
    return { silent: early > Math.max(5e-5, 25 * this.floor * this.floor) && late < gone * early, hit: early > 2 * before };
  }

  /**
   * Hits on muted strings are reported late, because a dead string of a real guitar takes up to a quarter
   * of a second to fall silent: 0.3 s after the hit, or when the next onset comes, whichever is first.
   */
  private settleThuds(now: number, onset: boolean): void {
    while (this.thudJobs.length) {
      const job = this.thudJobs[0];
      const end = Math.min(now - 480, job.s0 + 0.3 * this.sr);
      if (!onset && now < job.s0 + 0.3 * this.sr + 480) return;
      this.thudJobs.shift();
      if (end - job.s0 < 0.12 * this.sr) continue;
      const d = this.died(job.s0, end);
      if (d.silent) this.onThud?.({ time: job.s0 / this.sr, strength: job.flux, hit: d.hit });
    }
  }

  /** Strength of a note's harmonics in two windows about 20 ms apart, later over earlier. */
  private ringRatio(s0: number, f0: number): number {
    const sum = (start: number): number => {
      this.copy(start, 2048, this.bufH);
      this.fftH.magnitudes(this.bufH, this.magH);
      return this.combAmp(this.magH, f0, this.sr / 2048, 6);
    };
    const early = sum(s0 + 1024);
    return early > 0 ? Math.min(1.5, sum(s0 + 2048) / early) : 0;
  }

  /** The notes of a chord as it is played on the instrument being listened to. */
  private notesOf(id: string): number[] {
    return this.voicing === 'piano' ? pianoChord(id).midis : chordNotes(CHORDS[id]);
  }

  /**
   * What a chord looks like to the listener: how strongly each of the twelve notes is in it, its harmonics
   * counted in as far as they lie in the band that is analysed. `shift` moves the chord by so many
   * semitones (octaves, on the piano); low down more of its harmonics lie in the band, and they count.
   */
  private template(id: string, shift = 0): Float32Array {
    const key = id + '@' + this.a4 + this.voicing + shift;
    let t = this.templates.get(key);
    if (!t) {
      t = new Float32Array(12);
      for (const note of this.notesOf(id)) {
        const midi = note + shift;
        for (let h = 1; h <= (shift < 0 ? 10 : 5); h++) {
          const f = midiToFreq(midi, this.a4) * h;
          if (f > CHORD_HIGH) break;
          if (f < CHORD_LOW) continue;
          const pc = ((Math.round(midi + 12 * Math.log2(h)) % 12) + 12) % 12;
          t[pc] += 1 / Math.sqrt(h);
        }
      }
      this.templates.set(key, t);
    }
    return t;
  }

  private analyzeChord(s0: number): void {
    const ids = this.chordCandidates;
    if (!ids || !ids.length) return;
    // a hit across strings that are held down dead is not a chord
    // (judged as an early look: at 44.1 kHz this window reaches just past the 0.2 s where died() would be stricter)
    if (this.died(s0, s0 + 1024 + CHORD_WIN, 0.01).silent) return;
    this.copy(s0 + 1024, CHORD_WIN, this.bufC);
    this.fftC.magnitudes(this.bufC, this.magCA);
    this.cleanAt(s0 + 1024, CHORD_WIN, this.fftC, this.magCA);
    this.copy(s0 - PRE_GAP - CHORD_WIN, CHORD_WIN, this.bufC);
    this.fftC.magnitudes(this.bufC, this.magCB);
    this.cleanAt(s0 - PRE_GAP - CHORD_WIN, CHORD_WIN, this.fftC, this.magCB);
    // What belongs to the strum is what got louder with it: strings that were plucked, also those that were
    // already sounding the same note (a note two chords share). What merely rings on from before, an open
    // string the new chord does not use, has not got louder and is left out.
    const hz = this.sr / CHORD_WIN;
    const k0 = Math.round(CHORD_LOW / hz);
    const k1 = Math.round(CHORD_HIGH / hz);
    let sounding = 0;
    let louder = 0;
    for (let k = 0; k < this.magCA.length; k++) {
      const risen = this.magCA[k] >= 1.25 * this.magCB[k];
      if (k >= k0 && k <= k1) {
        sounding += this.magCA[k];
        if (risen) louder += this.magCA[k];
      }
      if (!risen) this.magCA[k] = 0;
    }
    // A strum sets most of what sounds going afresh. When most of it simply rings on, the onset was one
    // note, or a noise, inside a ringing chord: not a strum.
    if (louder < 0.5 * sounding) return;
    const peaks = findPeaks(this.magCA, this.sr, CHORD_WIN, CHORD_LOW, CHORD_HIGH, 60, 0.03);
    if (peaks.length < 3 || peaks[0].a < Math.max(0.0012, 0.04 * this.ref)) return;
    // One plucked string is not a strum, however much louder it is than a chord that has nearly died away.
    // It shows in that a single note of the chords' range accounts for all that got louder. (A note below
    // that range would also account for a whole major chord, as its second to fifth harmonic.)
    let lowest = 127;
    for (const id of ids) for (const m of this.notesOf(id)) lowest = Math.min(lowest, m);
    // On the piano the search starts at the lowest key itself: the root and the fifth of a chord are also the
    // second and third harmonic of the key an octave under its root, which nobody is playing.
    if (this.voicing !== 'piano') {
      // A power chord is a root and its fifth and octave: nearly all of it is the root's own harmonics, as a
      // single string would be. Where one is asked for, its root explaining the sound does not rule it out.
      const powerRoots = new Set(ids.filter((id) => /^[A-G][#b]?5$/.test(id)).map((id) => this.notesOf(id)[0] % 12));
      for (let m = lowest - 1; m <= 88; m++) if (combScore(peaks, this.tuned(peaks, m), CHORD_HIGH).explained >= 0.85 && !powerRoots.has(m % 12)) return;
    } else {
      // On the piano the root and the fifth of a chord are also the second and third harmonic of the key an
      // octave under its root, which nobody is playing: below the chords' own keys a single key only counts
      // when it is there itself.
      for (let m = lowest - 24; m <= 88; m++) if (this.oneKey(peaks, this.tuned(peaks, m), m < lowest)) return;
    }
    // Strings are never struck equally hard. The square root keeps one loud string from deciding alone.
    const chroma = new Float32Array(12);
    for (const p of peaks) {
      const m = freqToMidi(p.f, this.a4);
      const dev = (m - Math.round(m)) * 100;
      chroma[((Math.round(m) % 12) + 12) % 12] += Math.sqrt(p.a) * Math.exp(-(dev * dev) / (2 * 35 * 35));
    }
    let norm = 0;
    for (const v of chroma) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    // On the piano the app shows every chord from middle C upward. Whoever strikes it an octave or two lower
    // is told by the sound itself: a strong partial below middle C, which no chord in the app's place has.
    // Low down a chord sounds different (more of its harmonics lie where the listener looks), so the chords
    // are then also compared as they sound down there, and the place in which they fit better counts: all
    // of them in the same place, so that none gains. A bass note under a chord in the app's place is such a
    // low partial too, and there the app's place fits better.
    const places = [0];
    if (this.voicing === 'piano' && this.anyOctave) {
      const loudest = peaks.reduce((m, p) => Math.max(m, p.a), 0);
      const low = freqToMidi(peaks.filter((p) => p.a >= 0.25 * loudest).reduce((m, p) => Math.min(m, p.f), Infinity), this.a4);
      if (low < 58.5) places.push(low < 47.5 ? -24 : -12);
    }
    let sims: Record<string, number> = {};
    let best: string | null = null;
    let bestSim = -1;
    let secondSim = 0;
    for (const shift of places) {
      const here: Record<string, number> = {};
      let top: string | null = null;
      let topSim = 0;
      let nextSim = 0;
      for (const id of ids) {
        const t = this.template(id, shift);
        let dot = 0;
        let tn = 0;
        for (let i = 0; i < 12; i++) {
          dot += chroma[i] * t[i];
          tn += t[i] * t[i];
        }
        const sim = tn > 0 ? dot / (norm * Math.sqrt(tn)) : 0;
        here[id] = sim;
        if (sim > topSim) {
          nextSim = topSim;
          topSim = sim;
          top = id;
        } else if (sim > nextSim) nextSim = sim;
      }
      if (topSim > bestSim) {
        sims = here;
        best = top;
        bestSim = topSim;
        secondSim = nextSim;
      }
    }
    this.onChord?.({ time: s0 / this.sr, best, score: Math.max(0, bestSim), margin: Math.max(0, bestSim) - secondSim, sims });
  }

  /** a partial that is no harmonic of the loudest key and at least this strong beside it is another key: a chord */
  keyOff = 0.08;

  /**
   * Is what sounds one key and its harmonics? On the piano the keys of a chord are seldom struck equally
   * hard, and the hammers of an old upright are not equal either: a chord with one loud key must not pass
   * for that key alone. So one key it is only when nearly everything is explained by it and nothing else
   * of any strength is there. `itself` asks for the key's own note to be among what sounds.
   */
  private oneKey(peaks: Peak[], f0: number, itself: boolean): boolean {
    let on = 0;
    let all = 0;
    let loudest = 0;
    let other = 0;
    let own = 0;
    for (const p of peaks) {
      const h = Math.max(1, Math.round(p.f / f0));
      const dev = 1200 * Math.log2(p.f / (h * f0));
      const g = Math.exp(-(dev * dev) / (2 * 35 * 35));
      all += p.a;
      on += p.a * g;
      if (p.a > loudest) loudest = p.a;
      if (g < 0.3 && p.a > other) other = p.a;
      if (h === 1 && g > 0.5 && p.a > own) own = p.a;
    }
    if (all <= 0 || on / all < 0.85) return false;
    if (itself && own < 0.2 * loudest) return false;
    return other < this.keyOff * loudest;
  }

  /** Strength of the first six harmonics of f0 in a spectrum, beyond what a spectrum from before held there. */
  private over(mag: Float32Array, pre: Float32Array, f0: number): number {
    const hz = this.sr / NOTE_WIN;
    let comb = 0;
    for (let h = 1; h <= 6; h++) {
      const k = Math.round((h * f0) / hz);
      if (k + 2 >= mag.length) break;
      let top = 0;
      for (let j = k - 1; j <= k + 1; j++) top = Math.max(top, mag[j] - pre[j]);
      comb += Math.max(0, top);
    }
    return comb;
  }

  private trackString(): void {
    const ck = this.check!;
    const since = this.total - ck.s0;
    if (since < NOTE_WIN) return;
    this.copy(this.total - NOTE_WIN, NOTE_WIN, this.bufN);
    this.fftN.magnitudes(this.bufN, this.magB);
    const hz = this.sr / NOTE_WIN;
    const f0 = midiToFreq(ck.midi, this.a4);
    const bins = this.magB.length;
    const onComb = new Uint8Array(bins);
    const comb = this.over(this.magB, ck.pre, f0);
    if (!ck.looks++) this.ckFirst.set(this.magB);
    this.ckLast.set(this.magB);
    for (let h = 1; h * f0 < 7200; h++) {
      const k = Math.round((h * f0) / hz);
      for (let j = Math.max(0, k - 2); j <= Math.min(bins - 1, k + 2); j++) onComb[j] = 1;
    }
    let noise = 0;
    let before = 0;
    let count = 0;
    for (let k = Math.round(2500 / hz); k <= Math.min(bins - 1, Math.round(7000 / hz)); k++) {
      if (onComb[k]) continue;
      noise += this.magB[k];
      before += ck.pre[k];
      count++;
    }
    ck.env.push(comb);
    // the pick or hammer click is broadband too, so rattle only counts once the window is past the attack
    // Rattle is what the band between the harmonics holds beyond what it held before the pluck. Taken as
    // a whole, not bin by bin: the hiss of the room is as strong after as before, only never in the same bins.
    ck.noise.push(count && since >= NOTE_WIN + 2048 ? (Math.max(0, noise - 1.15 * before) / count) * 800 : -1);
    if (since >= 0.45 * this.sr + NOTE_WIN) this.finishString();
  }

  private finishString(): void {
    const ck = this.check;
    if (!ck || ck.state !== 'track') return;
    this.check = null;
    const env = ck.env;
    const peak = env.length ? Math.max(...env.slice(0, 3)) : 0;
    const tail = env.length ? env.slice(-2).reduce((a, b) => a + b, 0) / Math.min(2, env.length) : 0;
    // How much is left at the end, against how strong the note was 0.17 s after the pluck. Not against
    // its very beginning: a hard pluck starts with a burst that says little about how the string rings.
    // A note that is all but gone by then has not rung at all.
    const mid = env[Math.min(env.length - 1, 4)] ?? 0;
    const ring = peak > 0 && mid >= 0.08 * peak ? Math.min(1, tail / mid) : 0;
    let buzz = 0;
    let frames = 0;
    for (let i = 0; i < env.length; i++) {
      if (ck.noise[i] < 0) continue;
      buzz += ck.noise[i] / (env[i] + 1e-6);
      frames++;
    }
    buzz = frames ? buzz / frames : 0;
    if (ck.heard === null && ck.strength < 0.12 && peak < Math.max(0.0015, 0.03 * this.ref)) {
      // not a pluck at all (a click, a chair): keep waiting
      this.startStringCheck(ck.midi);
      return;
    }
    if (ck.again && peak < 1.12 * ck.before && ring >= this.ringThreshold) {
      // The string rang on as it did before, no louder: that onset was not a new pluck of it
      // (a rattle inside a buzzing note, another string touched). Keep waiting.
      this.startStringCheck(ck.midi);
      return;
    }
    const octaves = ck.heard === null ? false : Math.abs(ck.heard - ck.midi) % 12 === 0;
    let result: StringResult;
    // Another string was plucked when another note rang. A dead string also has a pitch of sorts for a
    // moment, rarely the one that was asked for; but then nothing rings, and that is "muted".
    const other = ck.heard !== null && !octaves && ck.heardConf >= 0.55 && ck.expectedShare < 0.35;
    const otherRang = other && ck.looks > 1 && this.over(this.ckLast, ck.pre, midiToFreq(ck.heard!, this.a4)) >= 0.1 * this.over(this.ckFirst, ck.pre, midiToFreq(ck.heard!, this.a4));
    if (other && otherRang) result = 'wrong';
    else if (peak < Math.max(0.0015, 0.03 * this.ref) || ck.expectedShare < 0.3 || ring < this.ringThreshold) result = 'muted';
    else if (buzz > this.buzzThreshold) result = 'buzz';
    else result = 'clean';
    if (ck.carried && result !== 'clean' && result !== 'buzz') {
      this.startStringCheck(ck.midi);
      return;
    }
    if (result === 'clean' || result === 'buzz') this.rang = { midi: ck.midi, s0: ck.s0, pre: ck.pre };
    this.onString?.({ time: ck.s0 / this.sr, expected: ck.midi, heard: ck.heard, result, ring, buzz, env });
  }
}
