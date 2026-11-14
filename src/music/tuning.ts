/**
 * The capo and the tuning of the guitar. With a capo, or with the whole guitar tuned a half or a whole step
 * down, everything sounds that far from what is written; the app then hears with its reference A moved by as
 * much, so a C shape stays a C shape and every song, chord and exercise works as written. Tunings that move
 * single strings (Drop D, open tunings, DADGAD) change what a shape sounds like string by string; they are in
 * the tuner, for playing of your own, and the lessons say that they expect the guitar tuned as written.
 */
import { L } from '../core/i18n';
import { store } from '../core/store';

export interface Tuning {
  id: string;
  name: string;
  /** semitones each string lies from standard tuning, low E first */
  strings: number[];
  /** the lessons work in it (all strings moved alike) */
  lessons: boolean;
}

export const TUNINGS = (): Tuning[] => [
  { id: 'standard', name: L('Standard: E A D G B E', 'Standard: E A D G H E'), strings: [0, 0, 0, 0, 0, 0], lessons: true },
  { id: 'half', name: L('Half a step down: E♭ A♭ D♭ G♭ B♭ E♭', 'Einen Halbton tiefer: Es As Des Ges B Es'), strings: [-1, -1, -1, -1, -1, -1], lessons: true },
  { id: 'whole', name: L('A whole step down: D G C F A D', 'Einen Ganzton tiefer: D G C F A D'), strings: [-2, -2, -2, -2, -2, -2], lessons: true },
  { id: 'dropd', name: 'Drop D: D A D G B E', strings: [-2, 0, 0, 0, 0, 0], lessons: false },
  { id: 'openg', name: L('Open G: D G D G B D', 'Open G: D G D G H D'), strings: [-2, -2, 0, 0, 0, -2], lessons: false },
  { id: 'opend', name: L('Open D: D A D F♯ A D', 'Open D: D A D Fis A D'), strings: [-2, 0, 0, -1, -2, -2], lessons: false },
  { id: 'dadgad', name: 'DADGAD', strings: [-2, 0, 0, 0, -2, -2], lessons: false },
];

export const tuningOf = (id: string): Tuning => TUNINGS().find((t) => t.id === id) ?? TUNINGS()[0];

/** How many semitones the guitar sounds above what is written: the capo up, a tuning down. */
export const guitarShift = (): number => Math.max(0, Math.min(9, store.settings.capo || 0)) + tuningOf(store.settings.tuning).strings[0] * (tuningOf(store.settings.tuning).lessons ? 1 : 0);

/** The A the guitar is heard and played back with, so that what is written stays what is heard. */
export const guitarA4 = (): number => store.settings.a4 * Math.pow(2, guitarShift() / 12);

/** "capo 2", "a half step down" or both, for the line at the top of a lesson; empty in standard tuning without a capo. */
export function guitarSetup(): string {
  const parts: string[] = [];
  if (store.settings.capo) parts.push(L(`capo ${store.settings.capo}`, `Kapo ${store.settings.capo}`));
  if (store.settings.tuning === 'half') parts.push(L('a half step down', 'einen Halbton tiefer'));
  if (store.settings.tuning === 'whole') parts.push(L('a whole step down', 'einen Ganzton tiefer'));
  return parts.join(' · ');
}
