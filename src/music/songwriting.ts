/**
 * How the songs of the app are written down: a few short notations, for chords strummed in a pattern,
 * chords picked in a pattern, and tunes one note at a time. Used by the songbook and by any songs kept
 * privately in src/music/private (see the songbook).
 *
 * What is in it of a song that is still under copyright is its name and its chords in order, the way
 * every chord chart names them: no words, no tune, no riff. Tunes and note-for-note tablature are only
 * here for music that is old enough to belong to everybody (traditional songs, Bach, Beethoven, Grieg ...).
 * Strumming patterns and picking patterns are the common ones, chosen to suit the song and the level.
 * Keys are chosen for the open chords of the guitar, so some songs are not in the key of the record.
 * The tunes were compared note for note with published notation (the scores in Wikipedia's articles,
 * Mutopia, the ABC collections of abcnotation.com); rests are not written, the note before is made longer.
 */
import { CHORDS, midiToTab } from './theory';
import type { Bar, Song, TabNote } from './content';

/**
 * A strumming pattern: one character per half beat of the bar. D is a strum down, U one on the way back
 * up, a dot is where the hand passes without touching. beat says how many of them make one click.
 */
export const STRUMS = {
  /** one strum on every beat */
  beat: { slots: 'D.D.D.D.', beat: 2 },
  /** on one and three */
  half: { slots: 'D...D...', beat: 2 },
  /** down, down-up, down, down-up */
  folk: { slots: 'D.DUD.DU', beat: 2 },
  /** down, down-up, up-down-up: the third beat is only felt */
  pop: { slots: 'D.DU.UDU', beat: 2 },
  /** three beats to the bar */
  waltz: { slots: 'D.D.D.', beat: 2 },
  /** three beats, the second and third with an upstroke */
  lilt: { slots: 'D.DUDU', beat: 2 },
  /** two slow beats of three: a strum on each */
  six: { slots: 'D..D..', beat: 3 },
  /** two slow beats of three, all six strummed: down, down-up, down, down-up */
  roll: { slots: 'DDUDDU', beat: 3 },
} as const;

/**
 * A picking pattern: which string each note of the bar is plucked on. b is the bass string of the chord
 * (thumb), t the string the thumb alternates to, and 1, 2, 3 the G, B and high e strings (index, middle and
 * ring finger). per is how many notes make one click, unit how many of the pattern's notes one chord gets
 * at least.
 */
export const PICKS = {
  /** six notes rolling up and back: bass, G, B, e, B, G */
  roll: { order: 'b12321', beat: 3 },
  /** the same six notes, counted in three */
  waltz: { order: 'b12321', beat: 2 },
  /** three slow notes to the bar */
  three: { order: 'b12', beat: 1 },
  /** four slow notes to the bar */
  four: { order: 'b121', beat: 1 },
  /** eight notes: bass, then the fingers rolling */
  eight: { order: 'b1213121', beat: 2 },
  /** the thumb goes back and forth between two bass strings while the fingers fill in */
  travis: { order: 'b2t1b2t1', beat: 2 },
} as const;

interface Laid {
  chords: string[];
  part?: string;
}

/**
 * Reads a chord chart: bars are separated by spaces, "G,D" is a bar shared by two chords, "%" the bar
 * before once more, "[Verse]" names the part that starts here, and "x2" plays that part so many times.
 */
export function chart(text: string, id: string): Laid[] {
  const bars: Laid[] = [];
  let start = 0;
  let part: string | undefined;
  for (const tok of text.trim().split(/\s+/)) {
    const label = /^\[(.+)\]$/.exec(tok);
    const times = /^x(\d+)$/.exec(tok);
    if (label) {
      part = label[1].replace(/_/g, ' ');
      start = bars.length;
    } else if (times) {
      const unit = bars.slice(start);
      for (let k = 1; k < Number(times[1]); k++) for (const b of unit) bars.push({ chords: b.chords });
    } else if (tok === '%') bars.push({ chords: bars[bars.length - 1].chords });
    else {
      const chords = tok.split(',');
      for (const c of chords) if (!CHORDS[c]) throw new Error(`${id}: no chord called ${c}`);
      bars.push({ chords, ...(part ? { part } : {}) });
      part = undefined;
    }
  }
  return bars;
}

/** A song of strummed chords. bpm counts the clicks. */
export function strummed(id: string, title: string, by: string, bpm: number, pattern: keyof typeof STRUMS, text: string): Song {
  const { slots, beat } = STRUMS[pattern];
  const hits = [...slots].map((c, i) => ({ c, i })).filter((x) => x.c !== '.');
  const bars = chart(text, id).map(({ chords, part }): Bar => {
    const notes = hits.map((h, k): TabNote => {
      const len = (hits[k + 1]?.i ?? slots.length) - h.i;
      return { s: 0, f: 0, strum: chords[Math.floor((h.i * chords.length) / slots.length)], ...(len !== 1 ? { len } : {}), ...(h.c === 'U' ? { up: true } : {}) };
    });
    return { chord: chords[0], notes, ...(part ? { part } : {}) };
  });
  return { id, title, by, noteDur: 60 / bpm / beat, beat, bars };
}

/** The shape a picking pattern is written for: the small one where there is one, since its notes are in the full barre too. */
const PICK_SHAPE: Record<string, string> = { 'F#m': 'F#m-easy', Bm: 'Bm-easy' };

/** The notes of a picking pattern over one chord. */
function pluck(chordId: string, order: string): TabNote[] {
  const frets = CHORDS[PICK_SHAPE[chordId] ?? chordId].frets;
  const bass = frets.findIndex((f) => f >= 0);
  // a chord on four strings leaves the thumb the D and G strings, and the fingers the two above
  const high = bass >= 2;
  const string: Record<string, number> = { b: bass, t: high ? 3 : 2, '1': high ? 4 : 3, '2': high ? 5 : 4, '3': 5 };
  return [...order].map((role) => {
    let s = string[role];
    while (s > bass && frets[s] < 0) s--;
    return { s, f: frets[s] };
  });
}

/** A song picked over its chords, one pattern all the way. A bar shared by two chords gives each half of the pattern. */
export function picked(id: string, title: string, by: string, bpm: number, pattern: keyof typeof PICKS, text: string): Song {
  const { order, beat } = PICKS[pattern];
  const bars: Bar[] = [];
  for (const { chords, part } of chart(text, id)) {
    chords.forEach((c, k) => bars.push({ chord: c, notes: pluck(c, order.slice(0, order.length / chords.length)), ...(part && k === 0 ? { part } : {}) }));
  }
  return { id, title, by, noteDur: 60 / bpm / beat, beat, bars };
}

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const STRING: Record<string, number> = { E: 0, A: 1, D: 2, G: 3, B: 4, e: 5 };

/**
 * A tune, one note at a time. Notes are written with their octave ("E4", "F#3", "Bb3"), ":2" makes one
 * twice as long, "|" ends a bar. beat is how many note units make one click. The notes are placed in
 * open position. Written as string and fret ("e/7", "B/0", "A/2+e/7" for two at once) a note stays where it is put.
 */
export function tune(id: string, title: string, by: string, bpm: number, beat: number, text: string): Song {
  const bars: Bar[] = [{ notes: [] }];
  for (const tok of text.trim().split(/\s+/)) {
    if (tok === '|') {
      bars.push({ notes: [] });
      continue;
    }
    const [what, long] = tok.split(':');
    const len = long ? Number(long) : 1;
    const notes = what.split('+').map((w): TabNote => {
      const pitch = /^([A-G])([#b]?)(\d)$/.exec(w);
      const fret = /^([EADGBe])\/(\d+)$/.exec(w);
      if (pitch) return midiToTab(NOTE[pitch[1]] + (pitch[2] === '#' ? 1 : pitch[2] === 'b' ? -1 : 0) + 12 * (Number(pitch[3]) + 1));
      if (fret) return { s: STRING[fret[1]], f: Number(fret[2]) };
      throw new Error(`${id}: cannot read the note ${tok}`);
    });
    // of notes struck together the highest leads: it is the tune, the others go with it
    notes.sort((x, y) => y.s - x.s);
    bars[bars.length - 1].notes.push({ ...notes[0], ...(len !== 1 ? { len } : {}), ...(notes.length > 1 ? { more: notes.slice(1) } : {}) });
  }
  return { id, title, by, noteDur: 60 / bpm / beat, beat, bars: bars.filter((b) => b.notes.length) };
}

export const TRAD = 'Traditional';
