/**
 * Rhythms to read: two bars of 4/4 written in note values, from quarters and halves to sixteenths. Each is
 * played on muted strings (or one key) with the click; the app hears when each stroke falls, as in the
 * strumming trainer. Reading rhythm is the part of reading music a guitarist needs first.
 *
 * A rhythm is written as tokens: w h q e s (whole, half, quarter, eighth, sixteenth), a dot after one makes
 * it half as long again, a capital letter is a rest of that length; "|" ends a bar.
 */
import { L } from '../core/i18n';

export interface RhythmNote {
  /** start, in sixteenths from the first bar */
  at: number;
  /** length in sixteenths */
  len: number;
  rest: boolean;
  dotted: boolean;
  /** the value as written: 16 whole, 8 half, 4 quarter, 2 eighth, 1 sixteenth */
  value: number;
}

export interface RhythmLevel {
  n: number;
  name: string;
  about: string;
  rhythms: string[];
}

const VALUE: Record<string, number> = { w: 16, h: 8, q: 4, e: 2, s: 1 };

/** The notes of a rhythm, and how many bars it has. Throws when a bar does not add up to 4/4. */
export function parseRhythm(text: string): { notes: RhythmNote[]; bars: number } {
  const notes: RhythmNote[] = [];
  let at = 0;
  let bars = 0;
  for (const bar of text.split('|')) {
    const start = at;
    for (const tok of bar.trim().split(/\s+/).filter(Boolean)) {
      const m = /^([whqesWHQES])(\.?)$/.exec(tok);
      if (!m) throw new Error(`not a note value: ${tok}`);
      const value = VALUE[m[1].toLowerCase()];
      const len = m[2] ? value * 1.5 : value;
      notes.push({ at, len, rest: m[1] !== m[1].toLowerCase(), dotted: !!m[2], value });
      at += len;
    }
    if (at - start !== 16) throw new Error(`a bar of ${at - start} sixteenths: ${bar}`);
    bars++;
  }
  return { notes, bars };
}

export const RHYTHM_LEVELS = (): RhythmLevel[] => [
  { n: 1, name: L('Quarters and halves', 'Viertel und Halbe'), about: L('A quarter is one count, a half two, a whole four.', 'Eine Viertel ist ein Schlag, eine Halbe zwei, eine Ganze vier.'), rhythms: ['q q q q | h h', 'h q q | q q h', 'q q h | w'] },
  { n: 2, name: L('Eighths', 'Achtel'), about: L('Two eighths share a count: down on the number, up on the "and".', 'Zwei Achtel teilen sich einen Schlag: ab auf der Zahl, auf auf dem „und“.'), rhythms: ['e e q e e q | q q h', 'q e e q e e | e e e e h', 'e e e e q q | e e q h'] },
  { n: 3, name: L('Rests', 'Pausen'), about: L('A rest is counted like a note, and nothing is played: the hand passes in the air.', 'Eine Pause wird gezählt wie ein Ton, und nichts wird gespielt: Die Hand geht durch die Luft.'), rhythms: ['q Q q Q | q q h', 'Q q Q q | e e q H', 'q q Q q | E e q h'] },
  { n: 4, name: L('Dotted quarters', 'Punktierte Viertel'), about: L('A dot makes a note half as long again: a dotted quarter lasts a count and a half.', 'Ein Punkt macht einen Ton um die Hälfte länger: Eine punktierte Viertel dauert anderthalb Schläge.'), rhythms: ['q. e q q | q. e h', 'h q. e | q. e q q', 'q. e q. e | q q h'] },
  { n: 5, name: L('Off the beat', 'Gegen den Schlag'), about: L('An eighth, a quarter, an eighth: the middle one begins on the "and" and lasts over the next number.', 'Eine Achtel, eine Viertel, eine Achtel: Die mittlere beginnt auf dem „und“ und dauert über die nächste Zahl.'), rhythms: ['e q e q q | e q e h', 'q e q e q | e q e q q', 'e q e e q e | h h'] },
  { n: 6, name: L('Sixteenths', 'Sechzehntel'), about: L('Four sixteenths share a count: "1 e + a".', 'Vier Sechzehntel teilen sich einen Schlag: „1 e und a“.'), rhythms: ['s s s s q s s s s q | q q h', 'q s s s s h | s s s s s s s s h', 'e s s q e s s q | q q h'] },
];

/** The skill of a rhythm level: its tempo in bpm, measured like a strumming pattern's. */
export const rhythmKey = (n: number, piano = false): string => `beat:${piano ? 'p.' : ''}read-${n}`;
