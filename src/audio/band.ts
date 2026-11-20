/**
 * The band: what plays along under the player, made from the chords of a stretch of a song. It comes in
 * layers (drums, bass, keys, lead) so that a screen can bring them in and out one by one, as the game does
 * while a chain of clean changes grows.
 *
 * Two arrangements. Under headphones ('phones') it is a full band: a drum kit whose groove follows the
 * strumming pattern, a bass on the roots and fifths with a note leading into each new chord, an electric piano
 * holding the chord around middle C, and a fiddle playing a sparse line above. Through speakers ('speakers') the
 * microphone hears whatever the band plays, so the band keeps out of the listener's way: its drums lie above
 * 7.5 kHz (where the listener is deaf already, as for the click and the chimes of the games), and its pitched
 * parts play only short notes in the gaps between the player's strums (a plucked bass, an organ on the upbeat,
 * a plucked fiddle), so that a strum never has the band's notes in it. Every pitched note it plays is listed in
 * `events`, and the engine tells the listener what the band plays (src/audio/listener.ts, BandEcho).
 */
import { pianoChord } from '../music/theory';
import { STRUMS } from '../music/songwriting';
import { bassOf } from './backing';
import { BASS, BASS_SHORT, FIDDLE, highKit, hit, kit, note, ORGAN, PIANO, PIZZ, type Timbre } from './bandkit';
import { mulberry32 } from './synth';

export type BandMode = 'phones' | 'speakers';
export type Layer = 'drums' | 'bass' | 'keys' | 'lead';
export const LAYERS: Layer[] = ['drums', 'bass', 'keys', 'lead'];

export interface BandInput {
  /** chords, each from the moment it begins (in note units) until the next */
  chords: { u: number; id: string }[];
  /** the clicks, in note units; an accent begins a bar */
  clicks: { u: number; accent: boolean }[];
  /** how long the stretch is, in note units */
  units: number;
  /** seconds per note unit */
  unit: number;
  sr: number;
  a4: number;
  mode: BandMode;
  /** the moments (note units) at which the player strums or plays a note: through speakers the band keeps off them */
  strums?: number[];
  /** the groove: the strumming pattern's id from music/strums.ts ('beat', 'folk', 'pop', 'waltz', ...) or left out for straight */
  feel?: string;
  /** varies fills and the lead from one render to the next */
  seed?: number;
  /**
   * For going round and round (engine.playBand with loop): the render is exactly as long as the stretch, and what
   * rings on past its end is folded back onto its beginning, so that the seam cannot be heard.
   */
  loop?: boolean;
  /**
   * Seconds from the start at note unit u, for a band that follows a player whose tempo wanders (a recording
   * in the tests). Left out: u * unit.
   */
  warp?: (u: number) => number;
}

/** A pitched note the band plays, for the listener: seconds from the start of the render. */
export interface BandEvent {
  t: number;
  /** how long it sounds, seconds */
  dur: number;
  midis: number[];
  layer: Layer;
  /** 0..1, as loud as the band's loudest note */
  strength: number;
}

export interface BandParts {
  /** one sound per layer, all of the same length, beginning at note unit 0; a layer may be silent */
  layers: Record<Layer, Float32Array>;
  /** every pitched note in the render (drums through speakers are above the listener's range and left out) */
  events: BandEvent[];
  /** seconds */
  length: number;
  /** the arrangement it was made as: through speakers the engine tells the listener what it plays */
  mode?: BandMode;
  /** made to go round (BandInput.loop) */
  loop?: boolean;
}

/** How loud each layer plays: 0 leaves it out. */
export type LayerGains = Partial<Record<Layer, number>>;

/** A band that is playing: layers can be faded in and out while it plays. */
export interface BandHandle {
  /** fades one layer to a gain over `ramp` seconds (never cuts: a miss lets a layer ring out) */
  setGain(layer: Layer, gain: number, ramp?: number): void;
  /** stops it, fading over `fade` seconds */
  stop(fade?: number): void;
}

/**
 * Through speakers: how far a band note keeps from the player's strums. A strum's chord is judged from the
 * 0.2 s after it, against the 0.18 s before it (listener.ts, analyzeChord), so a band note begins at least this
 * long after a strum and has ended this long before the next one.
 */
export const CLEAR_AFTER = 0.2;
export const CLEAR_BEFORE = 0.12;
/** the longest and the shortest note the band plays through speakers, seconds */
export const SHORT_MAX = 0.22;
const SHORT_MIN = 0.07;
/** seconds rendered past the end for what rings on */
const TAIL = 2;
/** with every layer at gain 1 and the engine's volume at this, the band must not clip */
const LOUDEST = 0.9;

interface Bar {
  u0: number;
  u1: number;
  /** the clicks of the bar, note units */
  beats: number[];
}

/** The bars of the stretch, from its accented clicks; material before the first accent is a bar of its own. */
function barsOf(o: BandInput, step: number): Bar[] {
  const clicks = o.clicks.filter((c) => c.u >= -1e-6 && c.u < o.units - 1e-6).sort((a, b) => a.u - b.u);
  let starts = clicks.filter((c) => c.accent).map((c) => c.u);
  // no accents at all: a bar of four clicks
  if (!starts.length) starts = clicks.filter((_, i) => i % 4 === 0).map((c) => c.u);
  if (!starts.length) for (let u = 0; u < o.units - 1e-6; u += 4 * step) starts.push(u);
  if (starts[0] > 1e-6) starts.unshift(0);
  return starts.map((u0, i) => {
    const u1 = starts[i + 1] ?? o.units;
    const beats = clicks.filter((c) => c.u >= u0 - 1e-6 && c.u < u1 - 1e-6).map((c) => c.u);
    if (!beats.length) for (let u = u0; u < u1 - 1e-6; u += step) beats.push(u);
    return { u0, u1, beats };
  });
}

/** Note units from one click to the next (2 for eighths under quarter clicks, 3 in six-eight). */
function stepOf(o: BandInput): number {
  const us = o.clicks.map((c) => c.u).sort((a, b) => a - b);
  const d = us.slice(1).map((u, i) => u - us[i]).filter((x) => x > 1e-6).sort((a, b) => a - b);
  if (d.length) return d[d.length >> 1];
  const p = o.feel ? (STRUMS as Record<string, { beat: number }>)[o.feel] : undefined;
  return p?.beat ?? 2;
}

/** The notes of a chord as pitch classes, its root first; nothing for an id that is no chord. */
function chordPcs(id: string): number[] {
  try {
    return pianoChord(id).midis.map((m) => m % 12);
  } catch {
    return [];
  }
}

/** The chord's notes placed as near to the last voicing as they go, with the lowest between lo and lo + 11. */
function voice(pcs: number[], lo: number, prev: number[] | null): number[] {
  const unique = [...new Set(pcs)];
  let best: number[] = [];
  let bestCost = Infinity;
  for (let r = 0; r < unique.length; r++) {
    const order = [...unique.slice(r), ...unique.slice(0, r)];
    const out: number[] = [];
    let m = lo + ((order[0] - lo) % 12 + 12) % 12;
    for (const pc of order) {
      while (((m % 12) + 12) % 12 !== pc || (out.length && m <= out[out.length - 1])) m++;
      out.push(m);
    }
    const centre = out.reduce((a, b) => a + b, 0) / out.length;
    const cost = prev && prev.length ? out.reduce((s, x, i) => s + Math.abs(x - (prev[Math.min(i, prev.length - 1)] ?? x)), 0) : Math.abs(centre - (lo + 7));
    if (cost < bestCost) {
      bestCost = cost;
      best = out;
    }
  }
  return best;
}

/** The chord note nearest to `near` within [lo, hi]; `avoid` is passed over when another is close enough. */
function nearestTone(pcs: number[], near: number, lo: number, hi: number, avoid = -1): number {
  const cands: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) cands.push(m);
  if (!cands.length) return near;
  cands.sort((a, b) => Math.abs(a - near) - Math.abs(b - near));
  return cands[0] === avoid && cands[1] !== undefined && Math.abs(cands[1] - near) <= 4 ? cands[1] : cands[0];
}

/** The band for a stretch of music. */
export function renderBand(o: BandInput): BandParts {
  const sr = o.sr;
  const time = o.warp ?? ((u: number): number => u * o.unit);
  const total = time(o.units);
  const loopN = o.loop ? Math.max(1, Math.round(total * sr)) : 0;
  const n = o.loop ? loopN + Math.ceil(TAIL * sr) : Math.ceil((total + TAIL) * sr);
  const layers: Record<Layer, Float32Array> = { drums: new Float32Array(n), bass: new Float32Array(n), keys: new Float32Array(n), lead: new Float32Array(n) };
  const events: BandEvent[] = [];
  const rnd = mulberry32((o.seed ?? 1) * 2654435761);
  const step = stepOf(o);
  const bars = barsOf(o, step);
  const chords = [...o.chords].sort((a, b) => a.u - b.u);
  const chordAt = (u: number): string | undefined => {
    let id: string | undefined;
    for (const c of chords) if (c.u <= u + 1e-6) id = c.id;
    return id;
  };

  /** a pitched note (or a chord: several at once), into its layer and into the list for the listener */
  const play = (layer: Layer, u: number, midis: number[], dur: number, amp: number, t: Timbre): void => {
    const at = time(u);
    if (at < 0 || at >= total || !midis.length || dur <= 0) return;
    midis.forEach((m, i) => note(layers[layer], sr, at * sr, m, dur, amp, t, o.a4, (i * 0.37 + rnd()) % 1));
    events.push({ t: at, dur: dur + t.release, midis: [...midis], layer, strength: amp * Math.sqrt(midis.length) });
  };
  /** a drum sound, a hair early or late under headphones: a drummer is not a machine */
  const strike = (sound: Float32Array, u: number, amp: number, loose = true): void => {
    const at = time(u);
    if (at < 0 || at >= total) return;
    hit(layers.drums, sound, (at + (loose ? (rnd() - 0.5) * 0.004 : 0)) * sr, amp);
  };

  if (o.mode === 'phones') phones();
  else speakers();

  // what rings on past the end of a loop sounds again at its beginning, as it would when it goes round
  let out = layers;
  if (o.loop) {
    const folded = {} as Record<Layer, Float32Array>;
    for (const l of Object.keys(layers) as Layer[]) {
      const f = layers[l].slice(0, loopN);
      for (let i = loopN; i < n; i++) f[i % loopN] += layers[l][i];
      folded[l] = f;
    }
    out = folded;
  }
  // everything at gain 1 and at the engine's volume must stay below the top: if this stretch is so dense that
  // it would not, all of it is made a little quieter together
  const len = out.drums.length;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const v = Math.abs(out.drums[i] + out.bass[i] + out.keys[i] + out.lead[i]);
    if (v > peak) peak = v;
  }
  const limit = 0.97 / LOUDEST;
  if (peak > limit) for (const l of LAYERS) for (let i = 0; i < len; i++) out[l][i] *= limit / peak;
  const loudest = Math.max(1e-9, ...events.map((e) => e.strength));
  for (const e of events) e.strength = Math.min(1, e.strength / loudest);
  events.sort((a, b) => a.t - b.t);
  return { layers: out, events, length: len / sr, mode: o.mode, loop: !!o.loop };

  /** The full band, for headphones. */
  function phones(): void {
    const k = kit(sr);
    const feel = o.feel ?? 'beat';
    const fillToms = rnd() < 0.5;
    let keysWas: number[] | null = null;
    let lead = 0;
    let bassWas = 0;
    bars.forEach((bar, bi) => {
      const { u0, u1, beats } = bar;
      const nb = beats.length;
      const six = step === 3;
      const three = nb === 3 && !six;
      const lastBeat = beats[nb - 1];
      const fill = nb >= 2 && bars.length > 1 && (bi % 4 === 3 || bi === bars.length - 1);
      const fillFrom = six ? u1 - 3 : lastBeat;
      const next = chordAt(u1 + 1e-3);

      // drums: hats through the bar, a kick on one, the snare on the backbeat
      const half = feel === 'sixteenths' ? step / 4 : step / 2;
      for (let u = u0; u < u1 - 1e-6; u += six ? 1 : half) {
        if (fill && u >= fillFrom - 1e-6) break;
        const onBeat = beats.some((b) => Math.abs(b - u) < 1e-6);
        const open = (feel === 'folk' || feel === 'pop') && bi % 2 === 1 && Math.abs(u - (lastBeat + step / 2)) < 1e-6;
        const crash = Math.abs(u - u0) < 1e-6 && ((bi % 4 === 0 && bi > 0) || (bi === 0 && !!o.loop));
        if (crash) strike(k.crash, u, 0.09);
        else strike(open ? k.open : k.hat, u, open ? 0.07 : onBeat ? 0.085 : 0.055);
      }
      const kicks: number[] = [];
      const snares: number[] = [];
      let rims: number[] = [];
      if (six) {
        kicks.push(beats[0]);
        if (nb > 1) snares.push(beats[1]);
      } else if (three) {
        kicks.push(beats[0]);
        rims = [beats[1], beats[2]];
        if (feel === 'lilt') kicks.push(beats[2] + step / 2);
      } else if (nb >= 4) {
        if (feel === 'half') {
          kicks.push(beats[0]);
          snares.push(beats[2]);
        } else {
          kicks.push(beats[0], beats[2]);
          snares.push(beats[1], beats[3]);
          if (feel === 'pop') kicks.push(beats[1] + step / 2);
          if (feel === 'chug') kicks.push(beats[0] + step / 2, beats[2] + step / 2);
        }
      } else {
        kicks.push(beats[0]);
        if (nb > 1) snares.push(beats[nb >> 1]);
      }
      for (const u of kicks) if (!fill || u < fillFrom - 1e-6) strike(k.kick, u, 0.5);
      for (const u of snares) if (!fill || u < fillFrom - 1e-6) strike(k.snare, u, feel === 'folk' ? 0.22 : 0.28);
      for (const u of rims) if (!fill || u < fillFrom - 1e-6) strike(k.rim, u, 0.2);
      if (fill) {
        // into the next part: down the toms, or a roll on the snare that grows
        const span = u1 - fillFrom;
        if (fillToms) {
          const hits = Math.max(2, Math.round(span / (step / 2)));
          for (let j = 0; j < hits; j++) strike(k.toms[Math.min(2, Math.floor((j * 3) / hits))], fillFrom + (j * span) / hits, 0.3);
        } else {
          const hits = Math.max(3, Math.round(span / (step / 4)));
          for (let j = 0; j < hits; j++) strike(k.snare, fillFrom + (j * span) / hits, 0.1 + (0.18 * j) / hits);
        }
        strike(k.kick, fillFrom, 0.4);
      }

      // bass: the root on one, the fifth half-way, and a note leading into the next chord
      const points: { u: number; fifth: boolean }[] = [{ u: beats[0], fifth: false }];
      if (six && nb > 1) points.push({ u: beats[1], fifth: true });
      else if (nb >= 4 && feel !== 'half') points.push({ u: beats[2], fifth: true });
      if (feel === 'pop' && nb >= 4) points.push({ u: beats[1] + step / 2, fifth: false });
      if (feel === 'chug') for (let u = beats[0] + step / 2; u < u1 - 1e-6; u += step / 2) if (!points.some((p) => Math.abs(p.u - u) < 1e-6)) points.push({ u, fifth: false });
      for (const c of chords) if (c.u > u0 + 1e-6 && c.u < u1 - 1e-6 && !points.some((p) => Math.abs(p.u - c.u) < 1e-6)) points.push({ u: c.u, fifth: false });
      points.sort((a, b) => a.u - b.u);
      const leadIn = next && next !== chordAt(u1 - 1e-3) ? u1 - (six ? 1 : step / 2) : -1;
      points.forEach((p, i) => {
        const id = chordAt(p.u);
        if (!id) return;
        // a chord that changed just here is played on its root, whatever the pattern says
        const changed = chords.some((c) => Math.abs(c.u - p.u) < 1e-6);
        let m = bassOf(id) + (p.fifth && !changed ? 7 : 0);
        if (m > 47) m -= 12;
        // a waltz goes root, then fifth, when a chord lasts two bars
        if (three && !changed && bi > 0 && chordAt(u0 - 1e-3) === id && bassWas === bassOf(id)) m = bassOf(id) + 7 > 47 ? bassOf(id) - 5 : bassOf(id) + 7;
        const endU = Math.min(points[i + 1]?.u ?? u1, leadIn > p.u ? leadIn : u1);
        const dur = Math.min(1.6, time(endU) - time(p.u) - 0.02);
        play('bass', p.u, [m], feel === 'chug' ? Math.min(dur, 0.6 * (time(p.u + step / 2) - time(p.u))) : dur, 0.3, BASS);
        bassWas = m;
      });
      if (leadIn >= 0 && next) {
        const target = bassOf(next);
        const approach = target - 1 === bassWas ? target + 2 : target - 1;
        play('bass', leadIn, [approach], time(u1) - time(leadIn) - 0.02, 0.24, BASS);
      }

      // keys: the chord, held, struck again where the pattern leans
      const strikes: { u: number; amp: number; to?: number }[] = [];
      if (six) strikes.push({ u: beats[0], amp: 1 }, ...(nb > 1 ? [{ u: beats[1], amp: 0.75 }] : []));
      else if (three) strikes.push({ u: beats[1], amp: 0.85, to: beats[1] + 0.8 * step }, { u: beats[2], amp: 0.75, to: beats[2] + 0.8 * step });
      else if (feel === 'pop' && nb >= 4) strikes.push({ u: beats[0], amp: 1, to: beats[1] + step / 2 }, { u: beats[1] + step / 2, amp: 0.8, to: beats[3] }, { u: beats[3], amp: 0.85 });
      else strikes.push({ u: beats[0], amp: 1 }, ...(feel === 'folk' && nb >= 4 ? [{ u: beats[2], amp: 0.65 }] : []));
      for (const c of chords) if (c.u > u0 + 1e-6 && c.u < u1 - 1e-6 && !strikes.some((s) => Math.abs(s.u - c.u) < 1e-6)) strikes.push({ u: c.u, amp: 0.9 });
      strikes.sort((a, b) => a.u - b.u);
      strikes.forEach((s, i) => {
        const id = chordAt(s.u);
        if (!id) return;
        const notes = voice(chordPcs(id), 53, keysWas);
        keysWas = notes;
        const endU = Math.min(s.to ?? u1, strikes[i + 1]?.u ?? u1, ...chords.filter((c) => c.u > s.u + 1e-6).map((c) => c.u));
        play('keys', s.u, notes, Math.max(0.1, time(endU) - time(s.u) - 0.03), 0.07 * s.amp, PIANO);
      });

      // the fiddle: a long note on a chord note above, moving as little as it can, now and then a run up
      const id = chordAt(u0);
      if (!id) return;
      const pcs = chordPcs(id);
      if (!lead) lead = nearestTone([pcs[1] ?? pcs[0]], 76, 72, 86);
      const halves = nb >= 4 && !six ? [beats[0], beats[2]] : [beats[0]];
      const run = bi % 2 === 1 && rnd() < 0.45 && nb >= 3;
      halves.forEach((u, hi) => {
        const endU = halves[hi + 1] ?? u1;
        const here = chordPcs(chordAt(u) ?? id);
        if (run && hi === halves.length - 1) {
          // a run up the chord's notes into the next bar
          const notes = nb >= 4 && !six ? 4 : 3;
          let m = nearestTone(here, lead - 5, 69, 84);
          for (let j = 0; j < notes; j++) {
            const ju = u + ((endU - u) * j) / notes;
            play('lead', ju, [m], time(u + ((endU - u) * (j + 1)) / notes) - time(ju) - 0.02, 0.07, FIDDLE);
            m = nearestTone(here, m + 3, m + 1, 88);
          }
          lead = m;
          return;
        }
        lead = nearestTone(here, lead, 72, 86, rnd() < 0.5 ? lead : -1);
        play('lead', u, [lead], time(endU) - time(u) - 0.04, 0.085, FIDDLE);
      });
    });
  }

  /** The band for speakers: drums above the listener's hearing, short notes in the gaps between the strums. */
  function speakers(): void {
    const hk = highKit(sr);
    const pick = (a: Float32Array[]): Float32Array => a[Math.floor(rnd() * a.length)];
    // where the player strums, seconds: as asked, or the pattern's strokes, or every click
    const strumUs: number[] = o.strums ? [...o.strums] : patternStrums();
    const strumTs = strumUs.map(time);
    // the stretch is followed by its own beginning (a loop) or by more of the song: a strum is expected there
    strumTs.push(total, ...(o.loop ? strumUs.map((u) => total + time(u)) : []));
    if (o.loop) strumTs.push(...strumUs.map((u) => time(u) - total));
    strumTs.sort((a, b) => a - b);
    /** how long a note beginning at u may last, keeping clear of the strums around it; 0 when it may not be played */
    const room = (u: number): number => {
      const t = time(u);
      let next = Infinity;
      for (const s of strumTs) {
        if (s > t - CLEAR_AFTER && s <= t + 1e-3) return 0;
        if (s > t + 1e-3 && s < next) next = s;
      }
      const d = Math.min(SHORT_MAX, next - CLEAR_BEFORE - t);
      return d >= SHORT_MIN ? d : 0;
    };
    let keysWas: number[] | null = null;
    let lead = 0;
    bars.forEach((bar, bi) => {
      const { u0, u1, beats } = bar;
      const nb = beats.length;
      const six = step === 3;
      const fill = nb >= 2 && bars.length > 1 && (bi % 4 === 3 || bi === bars.length - 1);
      const lastBeat = beats[nb - 1];

      // drums, all of them above 7.5 kHz: a shaker on the eighths, a tick on the strong beats, a ride on the backbeat
      for (let u = u0; u < u1 - 1e-6; u += six ? 1 : step / 2) {
        const onBeat = beats.some((b) => Math.abs(b - u) < 1e-6);
        if (fill && u >= lastBeat - 1e-6) {
          // a roll on the shaker into the next part
          for (let j = 0; j < 4; j++) strike(pick(hk.shaker), u + (j * step) / 8, 0.022 + 0.007 * j, false);
          continue;
        }
        strike(pick(hk.shaker), u, onBeat ? 0.045 : 0.028, false);
      }
      const backbeat = six ? beats.slice(1, 2) : nb === 3 ? beats.slice(1) : nb >= 4 ? [beats[1], beats[3]] : beats.slice(nb >> 1, (nb >> 1) + 1);
      for (const u of backbeat) if (!fill || u < lastBeat - 1e-6) strike(pick(hk.ride), u, nb === 3 ? 0.026 : 0.035, false);
      for (const u of [beats[0], ...(nb >= 4 && !six ? [beats[2]] : [])]) strike(pick(hk.tick), u, 0.035, false);

      // the pitched parts: only where there is room between the strums
      const free: { u: number; d: number }[] = [];
      for (let u = u0; u < u1 - 1e-6; u += 1) {
        const d = room(u);
        if (d > 0) free.push({ u, d });
      }
      if (!free.length) return;
      const used = new Set<number>();
      const take = (s: { u: number }): void => void used.add(Math.round(s.u * 1000));
      const isUsed = (s: { u: number }): boolean => used.has(Math.round(s.u * 1000));
      const next = chordAt(u1 + 1e-3);
      const changes = !!next && next !== chordAt(u1 - 1e-3);
      // the bass answers the strum on the one, and walks into a new chord in the last gap before it (when there
      // are gaps enough to leave the organ one)
      const first = free[0];
      const id0 = chordAt(first.u);
      if (id0) {
        play('bass', first.u, [bassOf(id0)], Math.min(first.d, 0.2), 0.22, BASS_SHORT);
        take(first);
      }
      const last = free[free.length - 1];
      if (changes && next && free.length >= 3 && last.u >= first.u + 2 - 1e-6) {
        const target = bassOf(next);
        play('bass', last.u, [target - 1], Math.min(last.d, 0.16), 0.18, BASS_SHORT);
        take(last);
      }
      // the organ on the upbeats in between: two to a long bar, one to a short one (a band that fills every gap of
      // a short bar is busy, and its ringing in the room never dies down between the strums)
      const most = time(u1) - time(u0) >= 2 ? 2 : 1;
      let chops = 0;
      let lastChop = -Infinity;
      for (const s of free) {
        if (chops >= most || isUsed(s)) continue;
        const onBeat = beats.some((b) => Math.abs(b - s.u) < 1e-6);
        if (onBeat || s.u - lastChop < 2 - 1e-6) continue;
        const id = chordAt(s.u);
        if (!id) continue;
        const notes = voice(chordPcs(id), 62, keysWas);
        keysWas = notes;
        play('keys', s.u, notes, Math.min(s.d, 0.16), 0.045, ORGAN);
        take(s);
        chops++;
        lastChop = s.u;
      }
      // every other bar a plucked fiddle note, high, in a gap of its own
      if (bi % 2 === 1) {
        const s = [...free].reverse().find((x) => !isUsed(x));
        const id = s && chordAt(s.u);
        if (s && id) {
          const pcs = chordPcs(id);
          lead = nearestTone(pcs, lead || 79, 74, 88, lead);
          play('lead', s.u, [lead], Math.min(s.d, 0.15), 0.06, PIZZ);
          take(s);
        }
      }
    });
  }

  /** The player's strokes as the pattern has them, bar by bar; every click where the pattern does not fit the bar. */
  function patternStrums(): number[] {
    const p = o.feel ? (STRUMS as Record<string, { slots: string; beat: number }>)[o.feel] : undefined;
    const out: number[] = [];
    for (const bar of bars) {
      const len = bar.u1 - bar.u0;
      if (p && Math.abs(p.slots.length - len) < 1e-6) [...p.slots].forEach((c, i) => (c !== '.' ? out.push(bar.u0 + i) : undefined));
      else out.push(...bar.beats);
    }
    return out;
  }
}
