/**
 * Notes that are not plucked: does the app hear a hammer-on or a pull-off? There are no recordings of them in
 * the data sets used here, so two kinds of real sound stand in:
 *   - slides on the G string of three electric guitars (IDMT-SMT-Guitar, data set 2, `npm run samples -- legato`):
 *     the pitch moves to the next note without a new pluck, as in a hammer-on;
 *   - recorded notes of one string, joined: the first plucked, the second from 40 ms into its own clip (no
 *     attack: a hammer-on), the same with a quarter of its attack (a pull-off plucks lightly), or whole (plucked
 *     again).
 * What is measured: the pitch tracking the screens use reaches the second note, and an onset is reported where
 * a string is plucked again but not where a finger hammers. Printed by tests/real/legatobench.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Listener } from '../../src/audio/listener';
import { decodeWav } from '../../src/audio/wav';
import { SR } from './clips';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), 'legato');
export const haveSlides = (): boolean => existsSync(resolve(dir, 'FS_G_V_slide.wav'));

/** What the listener reports for a signal: its pitch readings (rounded notes) and its onsets. */
export function hearLegato(sig: Float32Array, sr = SR): { pitches: { t: number; midi: number }[]; onsets: number[] } {
  const l = new Listener(sr);
  l.pitchTracking = true;
  l.noteDetection = false;
  const pitches: { t: number; midi: number }[] = [];
  const onsets: number[] = [];
  l.onPitch = (e) => pitches.push({ t: e.time, midi: Math.round(e.midi + e.cents / 100) });
  l.onOnset = (e) => onsets.push(e.time);
  for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
  return { pitches, onsets };
}

/** The slides: for each, the note it starts on, where it goes, whether the pitch got there, and onsets on the way. */
export function slides(): { guitar: string; from: number; to: number; reached: boolean; onsetsAfter: number }[] {
  const out: { guitar: string; from: number; to: number; reached: boolean; onsetsAfter: number }[] = [];
  for (const g of ['FS', 'LP', 'AR']) {
    const w = decodeWav(readFileSync(resolve(dir, `${g}_G_V_slide.wav`)));
    const xml = readFileSync(resolve(dir, `${g}_G_V_slide.xml`), 'utf8');
    const events = [...xml.matchAll(/<event>([\s\S]*?)<\/event>/g)].map((m) => {
      const f = (n: string): number => Number(m[1].match(new RegExp(`<${n}>([^<]*)<`))?.[1] ?? 0);
      return { on: f('onsetSec'), off: f('offsetSec'), midi: f('pitch'), up: Math.round(f('modulationFrequencyRange') / 100) };
    });
    const r = hearLegato(w.samples, w.sampleRate);
    for (const e of events) {
      if (!e.up) continue;
      const to = e.midi + e.up;
      const inEvent = r.pitches.filter((p) => p.t > e.on + 0.15 && p.t < e.off);
      // the pitch got to the note the slide ends on, and held it a little (three readings)
      const reached = inEvent.filter((p) => p.midi === to).length >= 3;
      out.push({ guitar: g, from: e.midi, to, reached, onsetsAfter: r.onsets.filter((t) => t > e.on + 0.15 && t < e.off).length });
    }
  }
  return out;
}

/** A first note plucked, then at 0.6 s the second on the same string: hammered (no attack), pulled (a little), or plucked again. */
export function joined(first: Float32Array, second: Float32Array, how: 'hammer' | 'pull' | 'pluck'): Float32Array {
  const at = Math.round(0.6 * SR);
  const skip = how === 'pluck' ? 0 : Math.round(0.04 * SR);
  const out = new Float32Array(at + Math.round(1.2 * SR));
  out.set(first.subarray(0, at));
  // the level the first note has died to: the second goes on from there (a hammer-on keeps the string ringing)
  let level = 0;
  for (let i = at - 2400; i < at; i++) level = Math.max(level, Math.abs(first[i] ?? 0));
  let peak = 0;
  for (let i = skip; i < skip + 2400; i++) peak = Math.max(peak, Math.abs(second[i] ?? 0));
  const gain = how === 'pluck' ? 1 : (level / (peak || 1)) * (how === 'pull' ? 1.6 : 1);
  const fade = Math.round(0.004 * SR);
  for (let i = 0; i < out.length - at; i++) {
    const s = (second[skip + i] ?? 0) * gain;
    const x = at + i;
    const w = Math.min(1, i / fade);
    out[x] = (1 - w) * (first[x] ?? 0) + w * s;
  }
  return out;
}

