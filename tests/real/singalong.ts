/**
 * Playing and singing at once: the strummed pieces recorded in a real room, with a real singer from Vocadito
 * mixed over them at a given loudness against the guitar. The chords are judged as the lessons judge them,
 * with the chords of the piece as the candidates; the voice is not judged, only heard as noise.
 *
 * Run: npx vite-node tests/real/singbench.ts [voice-to-guitar loudness, e.g. 0,0.5,1,1.5]
 * The measuring is here; tests/real.test.ts holds it as assertions when both recordings are there.
 */
import { Listener } from '../../src/audio/listener';
import { CHORDS } from '../../src/music/theory';
import { SR } from './clips';
import { type Piece } from './pieces';
import { loadTrack, trackIds } from './voices';

/** A voice brought to the rate of the pieces, by linear steps (enough for noise). */
function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const out = new Float32Array(Math.floor((x.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const p = (i * from) / to;
    const k = Math.floor(p);
    out[i] = (x[k] ?? 0) * (1 - (p - k)) + (x[k + 1] ?? 0) * (p - k);
  }
  return out;
}

const rms = (x: Float32Array): number => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++)
    if (Math.abs(x[i]) > 1e-4) {
      s += x[i] * x[i];
      n++;
    }
  return Math.sqrt(s / Math.max(1, n));
};

/** The voices to sing over the pieces: several singers, one after the other, as long as the piece. */
export function voiceBed(length: number, seed: number): Float32Array {
  const ids = trackIds();
  const out = new Float32Array(length);
  let at = 0;
  for (let k = 0; at < length; k++) {
    const tr = loadTrack(ids[(seed * 7 + k * 3) % ids.length]);
    const v = resample(tr.samples, tr.sr, SR);
    out.set(v.subarray(0, Math.min(v.length, length - at)), at);
    at += v.length;
  }
  return out;
}

/** The piece with a voice at this loudness (its RMS against the guitar's), judged as a lesson judges strums. */
export function judge(p: Piece, voice: Float32Array | null, level: number): { right: number; known: number; named: number; stretches: number } {
  const sig = new Float32Array(p.samples);
  if (voice && level > 0) {
    const k = (level * rms(p.samples)) / rms(voice);
    for (let i = 0; i < sig.length; i++) sig[i] += k * (voice[i] ?? 0);
  }
  const ids = [...new Set(p.chords.map((c) => c.id).filter((c): c is string => !!c && !!CHORDS[c]))];
  const sure: { t: number; id: string }[] = [];
  const l = new Listener(SR);
  l.noteDetection = false;
  l.chordCandidates = ids;
  l.onChord = (e) => {
    if (e.best && e.score > 0.6 && e.margin > 0.08) sure.push({ t: e.time, id: e.best });
  };
  for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
  const written = (t: number): string | null | undefined => {
    let cur: string | null | undefined;
    for (const c of p.chords) if (c.t <= t) cur = c.id;
    return cur;
  };
  let right = 0;
  let known = 0;
  for (const e of sure) {
    const now = written(e.t + 0.06);
    if (!now || !CHORDS[now]) continue;
    known++;
    if (e.id === now || e.id === written(e.t + 0.5)) right++;
  }
  let named = 0;
  let stretches = 0;
  p.chords.forEach((c, i) => {
    if (!c.id || !CHORDS[c.id] || c.t > p.samples.length / SR - 0.5) return;
    const end = p.chords[i + 1]?.t ?? p.samples.length / SR;
    stretches++;
    if (sure.some((e) => e.t >= c.t - 0.5 && e.t < end - 0.06 && e.id === c.id)) named++;
  });
  return { right, known, named, stretches };
}
