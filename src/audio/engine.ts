/**
 * Browser side of listening: opens the microphone, feeds its samples to the Listener, and runs the
 * built-in practice instrument, which is mixed into the same stream so the app hears it like a real one.
 * It also plays the metronome and keeps the two clocks in step: the listener counts samples, the
 * metronome is scheduled on the audio clock.
 */
import { Listener } from './listener';
import { chime, click, strum, tone, voiceTone, type Articulation, type Chime } from './synth';
import { CHORDS, chordNotes, OPEN_STRINGS, pianoChord } from '../music/theory';
import { L } from '../core/i18n';

// All the channels of the input, averaged: an interface that ignores the request for one channel may bring
// the instrument in on its second.
const TAP = `class Tap extends AudioWorkletProcessor{
  constructor(){super();this.buf=new Float32Array(512);this.n=0}
  process(inputs){const chs=inputs[0]||[];const nc=chs.length;const len=nc?chs[0].length:128;
    for(let i=0;i<len;i++){let v=0;for(let c=0;c<nc;c++)v+=chs[c][i];this.buf[this.n++]=nc?v/nc:0;if(this.n===512){this.port.postMessage([this.buf.slice(0),currentTime+(i+1)/sampleRate]);this.n=0}}
    return true}}
registerProcessor('tap',Tap)`;

export interface EngineOptions {
  mic: boolean;
  deviceId?: string;
}

/** How long before a chord is struck on the practice piano the one before it is let go, in seconds. */
const LIFT = 0.05;

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export class AudioEngine {
  ctx: AudioContext | null = null;
  listener: Listener | null = null;
  micOn = false;
  /** why the microphone could not be opened, if it could not */
  micError = '';
  /** name of the microphone in use */
  micLabel = '';
  /** why listening could not start at all, if it could not: then nothing runs, not even the practice instrument */
  startError = '';
  /** the microphone stopped while it was in use (unplugged, taken by another program): start again to reopen it */
  lost = false;
  /** told when that happens */
  onLost?: () => void;
  private stream: MediaStream | null = null;
  /** counts starts and stops: a start that finds it changed after an await has been overtaken and closes what it opened */
  private gen = 0;
  private starting: Promise<void> | null = null;
  /** takes away what watches the microphone and the audio clock */
  private unwatch: (() => void) | null = null;
  /** audio clock minus listener clock, seconds */
  private offset: number | null = null;
  /** sounding notes of the practice instrument; a guitar string or a piano key can only sound one at a time */
  private voices = new Map<string, { buf: Float32Array; pos: number; src: AudioBufferSourceNode }>();
  private ticks = new Set<AudioBufferSourceNode>();
  /** high tick plain and accented, low click plain and accented */
  private tickBuf: AudioBuffer[] | null = null;
  /** what the listener is given from the moment `from` (listener clock) on, kept for saving to a file */
  private rec: { blocks: Float32Array[]; left: number; sampleRate: number; from: number } | null = null;

  get running(): boolean {
    return !!this.listener;
  }

  /**
   * Must be called from a click or key press: browsers only start audio on a user action. A second call
   * while one is still under way (a double click during the browser's question about the microphone) waits
   * for that one instead of opening a second microphone. Never fails: see running, micError and startError.
   */
  start(opts: EngineOptions): Promise<void> {
    if (this.starting) return this.starting;
    const p = this.begin(opts)
      .catch((err) => {
        this.startError = this.micError = L(`The browser would not start its audio (${reason(err)}).`, `Der Browser wollte sein Audio nicht starten (${reason(err)}).`);
      })
      .finally(() => {
        if (this.starting === p) this.starting = null;
      });
    this.starting = p;
    return p;
  }

  private async begin(opts: EngineOptions): Promise<void> {
    const gen = ++this.gen;
    if (this.ctx) await this.close();
    this.micOn = false;
    this.micError = '';
    this.micLabel = '';
    this.startError = '';
    let side: { ctx: AudioContext; tap: AudioWorkletNode } | null = null;
    let stream: MediaStream | null = null;
    const release = (): void => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };
    // a stop() or a newer start came in while this one waited: what it opened is closed again
    const overtaken = (): boolean => {
      if (gen === this.gen) return false;
      release();
      void side?.ctx.close().catch(() => undefined);
      return true;
    };
    if (overtaken()) return;
    try {
      // A fixed rate keeps the analysis windows the same length in time on every sound card. Firefox cannot
      // take a microphone into a context whose rate is not the device's, though (NotSupportedError, Mozilla
      // bug 1388586): then everything is opened once more at the rate the browser picks, which the listener
      // copes with too.
      for (const rate of [48000, 0]) {
        side = await this.open(rate);
        if (overtaken() || !opts.mic) break;
        try {
          stream = await this.mic(opts.deviceId);
        } catch (err) {
          // not allowed, or there is none: listening goes on with the practice instrument
          this.micError = reason(err);
          break;
        }
        if (overtaken()) break;
        try {
          side.ctx.createMediaStreamSource(stream).connect(side.tap);
          this.micOn = true;
          this.micError = '';
          this.micLabel = stream.getAudioTracks()[0]?.label ?? '';
          break;
        } catch (err) {
          // the microphone must not stay switched on for nothing (its light on, and no app hearing it)
          release();
          this.micError = reason(err);
          if (!rate) break;
          const old = side;
          side = null;
          await old.ctx.close().catch(() => undefined);
          if (overtaken()) break;
        }
      }
      if (overtaken() || !side) return;
      if (side.ctx.state === 'suspended') await side.ctx.resume();
      if (overtaken()) return;
    } catch (err) {
      release();
      void side?.ctx.close().catch(() => undefined);
      if (gen !== this.gen) return;
      // AudioWorklet is only there on a secure page: https, or localhost on this computer
      this.startError = this.micError = !window.isSecureContext
        ? L('Listening needs a secure page: open the app over https, or as localhost on this computer. (The address of a dev server in your network, opened on a phone, is not secure.)', 'Zuhören braucht eine sichere Seite: Öffne die App über https oder als localhost auf diesem Computer. (Die Adresse eines Entwicklungsservers in deinem Netz, auf dem Handy geöffnet, ist nicht sicher.)')
        : L(`The browser would not start its audio (${reason(err)}).`, `Der Browser wollte sein Audio nicht starten (${reason(err)}).`);
      return;
    }
    const { ctx, tap } = side;
    this.ctx = ctx;
    this.stream = stream;
    this.listener = new Listener(ctx.sampleRate);
    this.lost = false;
    this.offset = null;
    this.tickBuf = [0, 1, 2, 3].map((i) => {
      const samples = click(ctx.sampleRate, i % 2 === 1, 1, i >= 2);
      const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buf.getChannelData(0).set(samples);
      return buf;
    });
    tap.port.onmessage = (e: MessageEvent<[Float32Array, number]>) => this.block(e.data[0], e.data[1]);
    this.watch(ctx, stream);
  }

  /** An audio context at this rate (0: the browser's own) with the tap in it, which hands every block to the listener. */
  private async open(rate: number): Promise<{ ctx: AudioContext; tap: AudioWorkletNode }> {
    const ctx = new AudioContext(rate ? { latencyHint: 'interactive', sampleRate: rate } : { latencyHint: 'interactive' });
    try {
      const url = URL.createObjectURL(new Blob([TAP], { type: 'application/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const tap = new AudioWorkletNode(ctx, 'tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      // a silent source keeps the tap running when there is no microphone
      const keepAlive = ctx.createConstantSource();
      keepAlive.offset.value = 0;
      keepAlive.connect(tap);
      keepAlive.start();
      const mute = ctx.createGain();
      mute.gain.value = 0;
      tap.connect(mute).connect(ctx.destination);
      return { ctx, tap };
    } catch (err) {
      await ctx.close().catch(() => undefined);
      throw err;
    }
  }

  private mic(deviceId?: string): Promise<MediaStream> {
    const open = (id?: string): Promise<MediaStream> =>
      navigator.mediaDevices.getUserMedia({
        audio: {
          // these three are made for speech and would chew up an instrument
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          ...(id ? { deviceId: { exact: id } } : {}),
        },
      });
    // a chosen microphone that is unplugged today must not leave the app deaf: fall back to the default one
    return deviceId ? open(deviceId).catch(() => open()) : open();
  }

  /**
   * A microphone that is unplugged or taken by another program, or an audio clock that the system stops
   * (a call on an iPhone, a laptop's lid): the app must not go on as if it were hearing.
   */
  private watch(ctx: AudioContext, stream: MediaStream | null): void {
    const track = stream?.getAudioTracks()[0];
    const live = (): boolean => !!track && track.readyState === 'live' && !track.muted && ctx.state === 'running';
    const lose = (): void => {
      if (this.ctx !== ctx || this.lost) return;
      this.lost = true;
      this.micOn = false;
      this.micError = L('the microphone stopped', 'das Mikrofon ist verstummt');
      this.onLost?.();
    };
    // muted for a while (the system took it for a call), or the clock stopped: not hearing, until it comes back
    const changed = (): void => {
      if (this.ctx !== ctx || this.lost || !track) return;
      if (track.readyState === 'ended') lose();
      else this.micOn = live();
    };
    // a stopped clock only runs again on a click or a key, so the next one starts it
    const wake = (): void => {
      if (this.ctx === ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => undefined);
    };
    track?.addEventListener('ended', lose);
    track?.addEventListener('mute', changed);
    track?.addEventListener('unmute', changed);
    ctx.addEventListener('statechange', changed);
    navigator.mediaDevices?.addEventListener('devicechange', changed);
    addEventListener('pointerdown', wake, true);
    addEventListener('keydown', wake, true);
    this.unwatch = () => {
      track?.removeEventListener('ended', lose);
      track?.removeEventListener('mute', changed);
      track?.removeEventListener('unmute', changed);
      ctx.removeEventListener('statechange', changed);
      navigator.mediaDevices?.removeEventListener('devicechange', changed);
      removeEventListener('pointerdown', wake, true);
      removeEventListener('keydown', wake, true);
    };
  }

  /** Stops listening. A start that is still under way is overtaken: it closes what it opens. */
  async stop(): Promise<void> {
    this.gen++;
    this.starting = null;
    await this.close();
  }

  private async close(): Promise<void> {
    this.unwatch?.();
    this.unwatch = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.listener = null;
    this.micOn = false;
    this.lost = false;
    this.voices.clear();
    this.ticks.clear();
    this.rec = null;
    this.tickBuf = null;
    // they belonged to the context that is closing
    this.droneSrc = null;
    this.model = null;
    await ctx?.close().catch(() => undefined);
  }

  /**
   * From now on keep what the listener is given, for this many seconds at most. "Now" is engine.now(): blocks
   * that were still waiting from before it (the page was busy making the accompaniment) are not kept, so the
   * recording begins exactly at the moment the caller takes for its start.
   */
  record(seconds: number): void {
    const sampleRate = this.ctx?.sampleRate ?? 48000;
    this.rec = { blocks: [], left: Math.round(seconds * sampleRate), sampleRate, from: this.now() };
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
    const rec = this.rec;
    if (rec && rec.left > 0) {
      // this block begins at l.time; what lies before the moment the recording was asked for is left out
      const skip = Math.max(0, Math.round((rec.from - l.time) * rec.sampleRate));
      if (skip < b.length) {
        const kept = b.slice(skip, skip + rec.left);
        rec.blocks.push(kept);
        rec.left -= kept.length;
      }
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
   * a4 is the pitch of A it is tuned to; left out, the listener's, which is whatever the last screen set
   * (a capo or a guitar tuned down moves it).
   */
  drone(midis: number[], volume = 0.4, a4 = this.listener?.a4 ?? 440): void {
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
