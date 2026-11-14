/**
 * Strumming patterns as the trainer teaches them: strokes down and up over the slots of a bar, how many
 * slots make a click, and how the slots are counted. The ones the songbook uses come first, then eighths
 * and sixteenths to build on. Also: which of them a strummed song uses, read off the song.
 */
import { L } from '../core/i18n';
import { STRUMS } from './songwriting';

/** A pattern to practise: its strokes over the slots of a bar, how many slots make a click, and how to count it. */
export interface StrumPattern {
  id: string;
  name: string;
  slots: string;
  /** slots per click */
  beat: number;
  /** what is said on each slot */
  count: string[];
  about: string;
}

const four = ['1', '+', '2', '+', '3', '+', '4', '+'];
/** The patterns of the trainer, easiest first: the ones the songs use, and eighths and sixteenths to build on. */
export const STRUM_PATTERNS = (): StrumPattern[] => [
  { id: 'beat', name: L('Every beat', 'Jeder Schlag'), slots: STRUMS.beat.slots, beat: 2, count: four, about: L('Down on every count. The hand keeps moving: down on the count, back up in the air on the "and".', 'Ab auf jede Zahl. Die Hand bleibt in Bewegung: ab auf der Zahl, in der Luft zurück auf dem „und“.') },
  { id: 'eighths', name: L('Eighths', 'Achtel'), slots: 'DUDUDUDU', beat: 2, count: four, about: L('Down on the counts, up on every "and": the hand never stops, it only touches the strings on the way.', 'Ab auf den Zahlen, auf auf jedem „und“: Die Hand hält nie an, sie berührt die Saiten nur unterwegs.') },
  { id: 'folk', name: L('Down, down-up', 'Ab, ab-auf'), slots: STRUMS.folk.slots, beat: 2, count: four, about: L('Down on 1, down-up on 2, down on 3, down-up on 4: the pattern of countless folk songs.', 'Ab auf 1, ab-auf auf 2, ab auf 3, ab-auf auf 4: das Muster unzähliger Folksongs.') },
  { id: 'pop', name: L('Down, down-up, up-down-up', 'Ab, ab-auf, auf-ab-auf'), slots: STRUMS.pop.slots, beat: 2, count: four, about: L('The third count is felt, not played: the hand goes down in the air and comes back up on its "and".', 'Die dritte Zahl wird gefühlt, nicht gespielt: Die Hand geht in der Luft nach unten und kommt auf ihrem „und“ nach oben.') },
  { id: 'waltz', name: L('Three-four', 'Dreivierteltakt'), slots: STRUMS.waltz.slots, beat: 2, count: ['1', '+', '2', '+', '3', '+'], about: L('Three counts to the bar, the first heavier: ONE two three.', 'Drei Zahlen pro Takt, die erste schwerer: EINS zwei drei.') },
  { id: 'roll', name: L('Six-eight', 'Sechsachteltakt'), slots: STRUMS.roll.slots, beat: 3, count: ['1', '2', '3', '4', '5', '6'], about: L('Two slow beats, each split in three: down, down-up, down, down-up. Count to six.', 'Zwei langsame Schläge, jeder in drei geteilt: ab, ab-auf, ab, ab-auf. Zähl bis sechs.') },
  { id: 'sixteenths', name: L('Sixteenths', 'Sechzehntel'), slots: 'DUDUDUDU', beat: 4, count: ['1', 'e', '+', 'a', '2', 'e', '+', 'a'], about: L('Four strokes to each count, half a bar at a time: 1 e and a. Slowly; it is the same motion as the eighths, twice as fast.', 'Vier Anschläge auf jede Zahl, ein halber Takt nach dem anderen: 1 e und a. Langsam; es ist dieselbe Bewegung wie bei den Achteln, doppelt so schnell.') },
];

export const strumKey = (id: string): string => `beat:strum-${id}`;

/** Which of the trainer's patterns a strummed song uses, read off its first full bar. */
export function strumPatternOf(song: { bars: { notes: { strum?: string; len?: number; up?: boolean }[] }[] }): string | null {
  const bar = song.bars.find((b) => b.notes.length > 1 && b.notes.every((n) => n.strum)) ?? song.bars[0];
  if (!bar?.notes.every((n) => n.strum)) return null;
  const slots = bar.notes.map((n) => (n.up ? 'U' : 'D') + '.'.repeat(Math.max(0, Math.round(n.len ?? 1) - 1))).join('');
  return STRUM_PATTERNS().find((p) => p.slots === slots)?.id ?? null;
}

