/**
 * The browser side of listening, against a stand-in for the browser's audio: what the engine opens and what
 * it closes again when the player clicks twice, leaves while the browser asks about the microphone, or uses
 * a browser that cannot record at 48 kHz; and where a recording begins.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderBand } from '../src/audio/band';
import { AudioEngine } from '../src/audio/engine';

class FakeTrack {
  readyState: 'live' | 'ended' = 'live';
  muted = false;
  label = 'Fake microphone';
  private on = new Map<string, Set<() => void>>();
  stop(): void {
    this.readyState = 'ended';
  }
  getSettings(): Record<string, unknown> {
    return {};
  }
  addEventListener(type: string, f: () => void): void {
    if (!this.on.has(type)) this.on.set(type, new Set());
    this.on.get(type)!.add(f);
  }
  removeEventListener(type: string, f: () => void): void {
    this.on.get(type)?.delete(f);
  }
  /** the device does something by itself: unplugged, muted */
  fire(type: string): void {
    for (const f of this.on.get(type) ?? []) f();
  }
}

let tracks: FakeTrack[] = [];
let contexts: FakeContext[] = [];
let taps: FakeTap[] = [];
/** the rate of the sound card; a context at another rate cannot take the microphone in, as in Firefox (0: any can) */
let deviceRate = 0;
/** how the browser answers the question about the microphone, and when */
let answer: () => Promise<void> = async () => undefined;

class FakeContext {
  state: 'suspended' | 'running' | 'closed' = 'running';
  sampleRate: number;
  currentTime = 0;
  baseLatency = 0;
  outputLatency = 0;
  destination = {};
  audioWorklet: { addModule: () => Promise<void> } | undefined = { addModule: async () => undefined };
  constructor(o: { sampleRate?: number } = {}) {
    // the browser's own rate when none is asked for
    this.sampleRate = o.sampleRate ?? 44100;
    contexts.push(this);
  }
  createConstantSource() {
    return { offset: { value: 0 }, connect: () => undefined, start: () => undefined };
  }
  createGain() {
    return { gain: { value: 0, cancelScheduledValues: () => undefined, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined }, connect: (n: unknown) => n };
  }
  createBufferSource() {
    return { buffer: null, loop: false, onended: null, connect: (n: unknown) => n, start: () => undefined, stop: () => undefined };
  }
  createMediaStreamSource() {
    if (deviceRate && this.sampleRate !== deviceRate) throw new Error('Connecting AudioNodes from AudioContexts with different sample-rate is currently not supported.');
    return { connect: () => undefined };
  }
  createBuffer(_channels: number, n: number, sampleRate: number) {
    const data = new Float32Array(n);
    return { sampleRate, getChannelData: () => data };
  }
  async resume(): Promise<void> {
    this.state = 'running';
  }
  async close(): Promise<void> {
    this.state = 'closed';
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

class FakeTap {
  port: { onmessage: ((e: { data: [Float32Array, number] }) => void) | null } = { onmessage: null };
  constructor() {
    taps.push(this);
  }
  connect(n: unknown): unknown {
    return n;
  }
}

const mediaDevices = {
  async getUserMedia() {
    await answer();
    const t = new FakeTrack();
    tracks.push(t);
    return { getTracks: () => [t], getAudioTracks: () => [t] };
  },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

function later(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
const liveTracks = (): number => tracks.filter((t) => t.readyState === 'live').length;
const openContexts = (): number => contexts.filter((c) => c.state !== 'closed').length;

beforeEach(() => {
  tracks = [];
  contexts = [];
  taps = [];
  deviceRate = 0;
  answer = async () => undefined;
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('AudioWorkletNode', FakeTap);
  vi.stubGlobal('navigator', { mediaDevices });
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('addEventListener', () => undefined);
  vi.stubGlobal('removeEventListener', () => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('starting and stopping the engine', () => {
  it('opens one microphone and one audio context for a double click', async () => {
    const prompt = later();
    answer = () => prompt.promise;
    const e = new AudioEngine();
    const first = e.start({ mic: true });
    const second = e.start({ mic: true });
    prompt.resolve();
    await Promise.all([first, second]);
    expect(e.running).toBe(true);
    expect(e.micOn).toBe(true);
    expect(tracks.length).toBe(1);
    expect(openContexts()).toBe(1);
  });

  it('closes what it opened when it is stopped while the browser asks about the microphone, also with a new start after it', async () => {
    const asked = later();
    const prompt = later();
    answer = () => {
      asked.resolve();
      return prompt.promise;
    };
    const e = new AudioEngine();
    const first = e.start({ mic: true });
    await asked.promise;
    await e.stop();
    prompt.resolve();
    await first;
    expect(e.running).toBe(false);
    expect(liveTracks()).toBe(0);
    expect(openContexts()).toBe(0);

    // stopped, and started again before the first start has woken up: the second one wins, alone
    const asked2 = later();
    const prompt2 = later();
    answer = () => {
      asked2.resolve();
      return prompt2.promise;
    };
    const a = e.start({ mic: true });
    await asked2.promise;
    await e.stop();
    const b = e.start({ mic: true });
    prompt2.resolve();
    await Promise.all([a, b]);
    expect(e.running).toBe(true);
    expect(e.micOn).toBe(true);
    expect(liveTracks()).toBe(1);
    expect(openContexts()).toBe(1);
  });

  it('opens the microphone at the browser\'s own rate where 48 kHz cannot take it in, as in Firefox', async () => {
    deviceRate = 44100;
    const e = new AudioEngine();
    await e.start({ mic: true });
    expect(e.micOn).toBe(true);
    expect(e.ctx?.sampleRate).toBe(44100);
    expect(e.listener?.sr).toBe(44100);
    // the first try at 48 kHz is closed, and its microphone is off again
    expect(contexts.map((c) => c.sampleRate)).toEqual([48000, 44100]);
    expect(liveTracks()).toBe(1);
    expect(openContexts()).toBe(1);
  });

  it('switches the microphone off again when it cannot be used at all, and goes on with the practice instrument', async () => {
    deviceRate = 22050;
    const e = new AudioEngine();
    await e.start({ mic: true });
    expect(e.running).toBe(true);
    expect(e.micOn).toBe(false);
    expect(e.micError).toMatch(/sample-rate/);
    expect(liveTracks()).toBe(0);
    expect(openContexts()).toBe(1);

    deviceRate = 0;
    answer = async () => {
      throw new Error('Permission denied');
    };
    await e.start({ mic: true });
    expect(e.running).toBe(true);
    expect(e.micOn).toBe(false);
    expect(e.micError).toBe('Permission denied');
    expect(openContexts()).toBe(1);
  });

  it('says why when listening cannot start at all, and leaves nothing open', async () => {
    vi.stubGlobal('window', { isSecureContext: false });
    vi.stubGlobal(
      'AudioContext',
      class extends FakeContext {
        // AudioWorklet is only there on a secure page
        audioWorklet = undefined;
      },
    );
    const e = new AudioEngine();
    await e.start({ mic: true });
    expect(e.running).toBe(false);
    expect(e.startError).toMatch(/https/);
    expect(openContexts()).toBe(0);
    expect(liveTracks()).toBe(0);
  });

  it('notices a microphone that is unplugged or muted while in use', async () => {
    const e = new AudioEngine();
    let told = 0;
    e.onLost = () => told++;
    await e.start({ mic: true });
    tracks[0].muted = true;
    tracks[0].fire('mute');
    expect(e.micOn).toBe(false);
    tracks[0].muted = false;
    tracks[0].fire('unmute');
    expect(e.micOn).toBe(true);
    tracks[0].readyState = 'ended';
    tracks[0].fire('ended');
    expect(e.micOn).toBe(false);
    expect(e.lost).toBe(true);
    expect(told).toBe(1);
    // starting again opens it anew
    await e.start({ mic: true });
    expect(e.lost).toBe(false);
    expect(e.micOn).toBe(true);
    expect(liveTracks()).toBe(1);
  });
});

describe('recording what the listener is given', () => {
  it('begins at the moment it was asked for, also when blocks from before that are still waiting', async () => {
    const e = new AudioEngine();
    await e.start({ mic: false });
    const ctx = contexts[0];
    const tap = taps[0];
    const sr = ctx.sampleRate;
    // every sample carries its own number, so that it can be told where the recording begins
    const send = (k: number): void => {
      const b = new Float32Array(512);
      for (let i = 0; i < 512; i++) b[i] = (k * 512 + i) * 1e-6;
      // the audio clock runs a second ahead of the listener's
      tap.port.onmessage!({ data: [b, 1 + ((k + 1) * 512) / sr] });
    };
    for (let k = 0; k < 20; k++) send(k);
    // the page is busy for two seconds (making an accompaniment): the audio clock goes on, the blocks wait
    ctx.currentTime = 1 + (207 * 512) / sr;
    const from = e.now();
    e.record(10);
    for (let k = 20; k < 300; k++) send(k);
    const { samples } = e.recorded();
    expect(from).toBeCloseTo((207 * 512) / sr, 6);
    expect(Math.round(samples[0] * 1e6)).toBe(207 * 512);
    expect(samples.length).toBe((300 - 207) * 512);
  });
});

describe('the band through the engine', () => {
  const band = (mode: 'phones' | 'speakers') =>
    renderBand({ chords: [{ u: 0, id: 'G' }], clicks: [0, 2, 4, 6].map((u, k) => ({ u, accent: k === 0 })), units: 8, unit: 0.3, sr: 48000, a4: 440, mode });

  it('tells the listener what a band for speakers plays, with the microphone on, and lets go of it when it stops', async () => {
    const e = new AudioEngine();
    await e.start({ mic: true });
    const h = e.playBand(1, band('speakers'), { drums: 1, bass: 1, keys: 0.5, lead: 0 }, { volume: 0.8 });
    expect(e.listener!.bands.length).toBe(1);
    const echo = e.listener!.bands[0];
    // the band arrives a little after it is scheduled: never before
    expect(echo.start).toBeGreaterThanOrEqual(1 * e.listener!.sr);
    h.stop(0.3);
    expect(echo.until).toBeLessThan(Infinity);
  });

  it('tells the listener nothing of a band for headphones, nor with the microphone off: the microphone hears none', async () => {
    const e = new AudioEngine();
    await e.start({ mic: true });
    e.playBand(1, band('phones'), { drums: 1, bass: 1, keys: 1, lead: 1 });
    expect(e.listener!.bands.length).toBe(0);
    const off = new AudioEngine();
    await off.start({ mic: false });
    off.playBand(1, band('speakers'), { drums: 1, bass: 1, keys: 1, lead: 1 });
    expect(off.listener!.bands.length).toBe(0);
  });
});
