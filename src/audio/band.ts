/**
 * The band: what plays along under the player, made from the chords of a stretch of a song. It comes in
 * layers (drums, bass, keys, lead) so that a screen can bring them in and out one by one, as the game does
 * while a chain of clean changes grows.
 *
 * Two arrangements. Under headphones ('phones') it is a full band. Through speakers ('speakers') the
 * microphone hears whatever the band plays, so the band keeps out of the listener's way: its drums lie
 * above 7 kHz (where the listener is deaf already), its pitched parts play short notes in the gaps between
 * the player's strums and never double the player's chord on a strum, and every pitched note it plays is
 * listed in `events`, so that the listener can be told what is the band and what is the player.
 *
 * This file is the contract the screens are written against. The first version below only wraps the old
 * backing (bass and chords) as the keys layer; the full band replaces it behind the same interface.
 */
import { backing } from './backing';

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
}

/** The band for a stretch of music. */
export function renderBand(o: BandInput): BandParts {
  const keys = backing({ chords: o.chords, clicks: o.clicks, units: o.units, unit: o.unit, sr: o.sr, a4: o.a4 });
  const empty = (): Float32Array => new Float32Array(keys.length);
  return { layers: { drums: empty(), bass: empty(), keys, lead: empty() }, events: [], length: keys.length / o.sr };
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
