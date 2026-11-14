/**
 * Browser side of listening: opens the microphone, feeds its samples to the Listener, and runs the
 * built-in practice instrument, which is mixed into the same stream so the app hears it like a real one.
 * It also plays the metronome and keeps the two clocks in step: the listener counts samples, the
 * metronome is scheduled on the audio clock.
 */
import { Listener } from './listener';
import { chime, click, strum, tone, voiceTone, type Articulation, type Chime } from './synth';
import { CHORDS, chordNotes, OPEN_STRINGS, pianoChord } from '../music/theory';

const TAP = `class Tap extends AudioWorkletProcessor{
  constructor(){super();this.buf=new Float32Array(512);this.n=0}
  process(inputs){const ch=inputs[0]&&inputs[0][0];const len=ch?ch.length:128;
    for(let i=0;i<len;i++){this.buf[this.n++]=ch?ch[i]:0;if(this.n===512){this.port.postMessage([this.buf.slice(0),currentTime+(i+1)/sampleRate]);this.n=0}}
    return true}}
registerProcessor('tap',Tap)`;

export interface EngineOptions {
  mic: boolean;
  deviceId?: string;
}

/** How long before a chord is struck on the practice piano the one before it is let go, in seconds. */
const LIFT = 0.05;

export class AudioEngine {
  ctx: AudioContext | null = null;
  listener: Listener | null = null;
  micOn = false;
  /** why the microphone could not be opened, if it could not */
  micError = '';
  /** name of the microphone in use */
  micLabel = '';
  private stream: MediaStream | null = null;
  /** audio clock minus listener clock, seconds */
  private offset: number | null = null;
  /** sounding notes of the practice instrument; a guitar string or a piano key can only sound one at a time */
  private voices = new Map<string, { buf: Float32Array; pos: number; src: AudioBufferSourceNode }>();
  private ticks = new Set<AudioBufferSourceNode>();
  /** high tick plain and accented, low click plain and accented */
  private tickBuf: AudioBuffer[] | null = null;
  /** what the listener is given, kept for saving to a file */
  private rec: { blocks: Float32Array[]; left: number; sampleRate: number } | null = null;

  get running(): boolean {
    return !!this.listener;
  }

  /** Must be called from a click or key press: browsers only start audio on a user action. */
  async start(opts: EngineOptions): Promise<void> {
    if (this.ctx) await this.stop();
    // a fixed rate keeps the analysis windows the same length in time on every sound card
    const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    const url = URL.createObjectURL(new Blob([TAP], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const tap = new AudioWorkletNode(ctx, 'tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const listener = new Listener(ctx.sampleRate);
    tap.port.onmessage = (e: MessageEvent<[Float32Array, number]>) => this.block(e.data[0], e.data[1]);

    // a silent source keeps the tap running when there is no microphone
    const keepAlive = ctx.createConstantSource();
    keepAlive.offset.value = 0;
    keepAlive.connect(tap);
    keepAlive.start();
    const mute = ctx.createGain();
    mute.gain.value = 0;
    tap.connect(mute).connect(ctx.destination);

    this.micOn = false;
    this.micError = '';
    this.micLabel = '';
    if (opts.mic) {
      const open = (deviceId?: string): Promise<MediaStream> =>
        navigator.mediaDevices.getUserMedia({
          audio: {
            // these three are made for speech and would chew up an instrument
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
        });
      try {
        // a chosen microphone that is unplugged today must not leave the app deaf: fall back to the default one
        this.stream = await (opts.deviceId ? open(opts.deviceId).catch(() => open()) : open());
        ctx.createMediaStreamSource(this.stream).connect(tap);
        this.micOn = true;
        this.micLabel = this.stream.getAudioTracks()[0]?.label ?? '';
      } catch (err) {
        this.micError = err instanceof Error ? err.message : String(err);
      }
    }
    if (ctx.state === 'suspended') await ctx.resume();
    this.offset = null;
    this.tickBuf = [0, 1, 2, 3].map((i) => {
      const samples = click(ctx.sampleRate, i % 2 === 1, 1, i >= 2);
      const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buf.getChannelData(0).set(samples);
      return buf;
    });
    this.ctx = ctx;
    this.listener = listener;
  }

  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.listener = null;
    this.micOn = false;
    this.voices.clear();
    this.ticks.clear();
    this.rec = null;
  }

  /** From now on keep what the listener is given, for this many seconds at most. */
  record(seconds: number): void {
    const sampleRate = this.ctx?.sampleRate ?? 48000;
    this.rec = { blocks: [], left: Math.round(seconds * sampleRate), sampleRate };
  }

  /** How many seconds have been kept so far. */
  get recordedSeconds(): number {
    return this.rec ? this.rec.blocks.reduce((n, b) => n + b.length, 0) / this.rec.sampleRate : 0;
  }

  /** What was kept since record(): exactly what the listener heard. Ends the keeping. */
  recorded(): { samples: Float32Array; sampleRate: number } {
    const rec = this.rec ?? { blocks: [], left: 0, sampleRate: 48000 };
    this.rec = null;
    const samples = new Float32Array(rec.blocks.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of rec.blocks) {
      samples.set(b, at);
      at += b.length;
    }
    return { samples, sampleRate: rec.sampleRate };
  }

  /** The microphones the browser knows. Their names are only filled in once the microphone has been allowed. */
  async microphones(): Promise<{ id: string; label: string }[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
    } catch {
      return [];
    }
  }

  private block(b: Float32Array, endTime: number): void {
    const l = this.listener;
    if (!l) return;
    for (const [id, v] of this.voices) {
      const n = Math.min(b.length, v.buf.length - v.pos);
      for (let i = 0; i < n; i++) b[i] += v.buf[v.pos + i];
      v.pos += n;
      if (v.pos >= v.buf.length) this.voices.delete(id);
    }
    if (this.rec && this.rec.left > 0) {
      this.rec.blocks.push(b.slice());
      this.rec.left -= b.length;
    }
    l.push(b);
    this.offset = endTime - l.time;
  }

  /** Now, on the listener's clock (the one note times are given in), smooth enough to animate with. */
  now(): number {
    if (!this.ctx || !this.listener) return 0;
    return this.offset === null ? this.listener.time : this.ctx.currentTime - this.offset;
  }

  /**
   * Seconds between a metronome tick being scheduled and a note played exactly on it arriving at the listener:
   * the way out through the speakers plus the way in through the microphone, as far as the browser knows them.
   */
  latencyEstimate(): number {
    if (!this.ctx || !this.micOn) return 0;
    const settings: (MediaTrackSettings & { latency?: number }) | undefined = this.stream?.getAudioTracks()[0]?.getSettings();
    const input = settings?.latency ?? 0;
    return Math.min(0.3, (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0) + (Number.isFinite(input) ? input : 0));
  }

  /** Schedules a metronome tick for a moment on the listener's clock. volume 0 schedules nothing. */
  tick(at: number, accent: boolean, volume: number, low = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.tickBuf || volume <= 0) return;
    const when = at + (this.offset ?? ctx.currentTime - (this.listener?.time ?? 0));
    if (when < ctx.currentTime - 0.02) return;
    const src = ctx.createBufferSource();
    src.buffer = this.tickBuf[(low ? 2 : 0) + (accent ? 1 : 0)];
    const gain = ctx.createGain();
    gain.gain.value = 0.5 * volume;
    src.connect(gain).connect(ctx.destination);
    src.onended = () => this.ticks.delete(src);
    src.start(Math.max(ctx.currentTime, when));
    this.ticks.add(src);
  }

  /**
   * Plays a sound at a moment on the listener's clock, through the speakers only (the listener is not given
   * it): the accompaniment under playing along. Cancelled with the ticks. volume 0 plays nothing.
   */
  playAt(at: number, samples: Float32Array, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || volume <= 0 || !samples.length) return;
    let when = at + (this.offset ?? ctx.currentTime - (this.listener?.time ?? 0));
    let skip = 0;
    // a sound that should have begun already starts where it would be by now
    if (when < ctx.currentTime) {
      skip = ctx.currentTime - when;
      when = ctx.currentTime;
    }
    if (skip * ctx.sampleRate >= samples.length) return;
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(ctx.destination);
    src.onended = () => this.ticks.delete(src);
    src.start(when, skip);
    this.ticks.add(src);
  }

  private droneSrc: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /**
   * A drone: notes held as long as it is on, soft and even, through the speakers only. For singing against
   * and for playing freely over. Several notes sound together (a root and its fifth). Empty stops it.
   */
  drone(midis: number[], volume = 0.4): void {
    const ctx = this.ctx;
    if (this.droneSrc) {
      const old = this.droneSrc;
      old.gain.gain.setTargetAtTime(0, ctx?.currentTime ?? 0, 0.08);
      window.setTimeout(() => {
        try {
          old.src.stop();
        } catch {
          // already ended
        }
      }, 400);
      this.droneSrc = null;
    }
    if (!ctx || !midis.length || volume <= 0) return;
    // a few seconds of an even tone, its length whole periods of each note so that it loops without a seam
    const sr = ctx.sampleRate;
    const n = Math.round(4 * sr);
    const buf = ctx.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    const a4 = this.listener?.a4 ?? 440;
    for (const m of midis) {
      const f = a4 * Math.pow(2, (m - 69) / 12);
      const cycles = Math.round((f * n) / sr);
      const w = (2 * Math.PI * cycles) / n;
      for (let i = 0; i < n; i++) out[i] += (0.12 * Math.sin(w * i) + 0.04 * Math.sin(2 * w * i) + 0.02 * Math.sin(3 * w * i)) / midis.length;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.15);
    src.connect(gain).connect(ctx.destination);
    src.start();
    this.droneSrc = { src, gain };
  }

  private chimes = new Map<Chime, AudioBuffer>();

  /**
   * A sound of the games, through the speakers only. It is made of tones the listener does not analyse,
   * so it may sound while the microphone is listening. volume 0 plays nothing.
   */
  chime(kind: Chime, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || volume <= 0) return;
    let buf = this.chimes.get(kind);
    if (!buf || buf.sampleRate !== ctx.sampleRate) {
      const samples = chime(ctx.sampleRate, kind);
      buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buf.getChannelData(0).set(samples);
      this.chimes.set(kind, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  /** Cancels every tick that has not sounded yet. */
  clearTicks(): void {
    for (const src of this.ticks) {
      try {
        src.stop();
      } catch {
        // already ended
      }
    }
    this.ticks.clear();
  }

  private model: AudioBufferSourceNode | null = null;

  /**
   * Plays a model for the player to listen to, through the speakers only: the listener is not given it, and
   * whoever asked for it ignores what the microphone picks up of it meanwhile. Returns its length in seconds.
   */
  demo(samples: Float32Array): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    this.stopDemo();
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    src.connect(gain).connect(ctx.destination);
    src.start();
    this.model = src;
    return samples.length / ctx.sampleRate;
  }

  stopDemo(): void {
    try {
      this.model?.stop();
    } catch {
      // already ended
    }
    this.model = null;
  }

  /** Plays samples through the speakers and lets the listener hear them too. A voice replaces its previous sound. */
  private play(voice: string, samples: Float32Array): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.silence(voice);
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    src.connect(gain).connect(ctx.destination);
    src.start();
    this.voices.set(voice, { buf: samples, pos: 0, src });
  }

  private silence(voice: string): void {
    const old = this.voices.get(voice);
    if (!old) return;
    try {
      old.src.stop();
    } catch {
      // already ended
    }
    this.voices.delete(voice);
  }

  private silenceAll(): void {
    for (const v of [...this.voices.keys()]) this.silence(v);
  }

  /**
   * Practice instrument: one note. voice names what it is played on (a string, a key), so that a new note
   * on the same string ends the one before it, as on the real instrument.
   */
  simNote(midi: number, art: Articulation = 'clean', piano = false, voice = String(midi), cents = 0): void {
    if (this.ctx) this.play(voice, tone({ sr: this.ctx.sampleRate, midi, dur: piano ? 1.4 : 2.2, art, piano, cents, a4: this.listener?.a4, seed: (Math.random() * 1000) | 0 }));
  }

  /**
   * Practice instrument: a chord, strummed on the guitar or struck on the piano. Everything before it is
   * cut, as when the hand changes shape.
   */
  simChord(id: string, piano = false): void {
    if (!this.ctx) return;
    this.silenceAll();
    if (!piano) {
      this.play('strum', strum(chordNotes(CHORDS[id]), this.ctx.sampleRate, 1.6, { a4: this.listener?.a4 }));
      return;
    }
    // To strike a chord again the keys have to come up first, and the dampers stop the strings for a
    // moment: the new chord begins out of a short silence, which is how the listener knows it is new.
    const sr = this.ctx.sampleRate;
    const sound = strum(pianoChord(id).midis, sr, 1.4, { a4: this.listener?.a4, piano: true, amp: 0.2 }, 5);
    const out = new Float32Array(sound.length + Math.floor(LIFT * sr));
    out.set(sound, Math.floor(LIFT * sr));
    this.play('strum', out);
  }

  /** Practice instrument: a sung note, so many cents off. A new one ends the one before, as a voice does. */
  simVoice(midi: number, cents = 0, dur = 1.6): void {
    if (!this.ctx) return;
    this.silenceAll();
    this.play('voice', voiceTone({ sr: this.ctx.sampleRate, midi, dur, cents, a4: this.listener?.a4, seed: (Math.random() * 1000) | 0 }));
  }

  /** Practice instrument: a hit across the strings with the hand lying on them. Nothing rings afterwards. */
  simMute(): void {
    if (!this.ctx) return;
    this.silenceAll();
    this.play('strum', strum(OPEN_STRINGS, this.ctx.sampleRate, 0.3, { art: 'muted', amp: 0.2 }, 4));
  }
}

export const engine = new AudioEngine();
