/**
 * The practice instrument: a synthesized guitar or piano that plays into the same listener as the
 * microphone. It lets you try every screen without an instrument in your hands, and the browser tests use it.
 * Keys: N plays what is asked for, W a wrong note, M a muted note, B a buzzing one, X a hit on muted strings.
 */
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { keysAlike } from '../music/theory';

export type SimTarget =
  /** voice: sung, by the practice voice */
  | { kind: 'note'; midi: number; piano?: boolean; string?: number; detune?: number; voice?: boolean }
  /** wrong: the chord "Wrong note" plays instead, where the screen knows a likely mistake (another chord of the piece) */
  | { kind: 'chord'; id: string; piano?: boolean; wrong?: string }
  | null;

let target: SimTarget = null;

export const setSimTarget = (t: SimTarget): void => {
  target = t;
};

export function simPlay(what: 'right' | 'wrong' | 'muted' | 'buzz' | 'damp'): void {
  const t = target;
  if (!engine.running) return;
  if (what === 'damp') {
    engine.simMute();
    return;
  }
  if (!t) return;
  if (t.kind === 'chord') {
    if (t.piano) {
      // the wrong chord on the piano: of four plain ones, the one that has least in common with the right one
      const other = ['G', 'Dm', 'C', 'Em'].reduce((a, b) => (keysAlike(b, t.id) < keysAlike(a, t.id) ? b : a));
      if (what !== 'muted') engine.simChord(what === 'right' ? t.id : (t.wrong ?? other), true);
    } else if (what === 'muted') engine.simMute();
    else engine.simChord(what === 'right' ? t.id : t.id === 'D' ? 'G' : 'D');
    return;
  }
  const wrong = what === 'wrong';
  if (t.voice) {
    // sung: right, a semitone off, or too short to count
    engine.simVoice(t.midi + (wrong ? 1 : 0), 0, what === 'muted' ? 0.15 : 1.6);
    return;
  }
  // in the tuner, "wrong" is the right string out of tune; everywhere else it is the next note up
  const midi = t.midi + (wrong && !t.detune ? 1 : 0);
  const voice = t.string !== undefined ? 's' + t.string : String(midi);
  engine.simNote(midi, wrong || what === 'right' ? 'clean' : what, t.piano, voice, wrong && t.detune ? t.detune : 0);
}

/** Is the voice the instrument? (Read from the settings without naming the type, which another file widens.) */
const voiced = (): boolean => (store.settings.instrument as string) === 'voice';

export const practiceBar = (): string =>
  store.settings.practiceInstrument
    ? `<div class="practice" role="group" aria-label="${L('Practice instrument', 'Übungsinstrument')}">
        <span>${L('Practice instrument', 'Übungsinstrument')}</span>
        <button data-sim="right">${voiced() ? L('Sing it', 'Singen') : L('Play it', 'Spielen')} <kbd>N</kbd></button>
        <button data-sim="wrong">${L('Wrong note', 'Falscher Ton')} <kbd>W</kbd></button>
        ${
          voiced()
            ? `<button data-sim="muted">${L('Too short', 'Zu kurz')} <kbd>M</kbd></button>`
            : store.settings.instrument === 'piano'
            ? `<button data-sim="muted">${L('Cut short', 'Zu kurz')} <kbd>M</kbd></button>`
            : `<button data-sim="muted">${L('Muted', 'Abgedämpft')} <kbd>M</kbd></button>
        <button data-sim="buzz">${L('Buzz', 'Schnarren')} <kbd>B</kbd></button>
        <button data-sim="damp">${L('Hit muted strings', 'Gedämpft anschlagen')} <kbd>X</kbd></button>`
        }
      </div>`
    : '';

addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sim]');
  if (b) simPlay(b.dataset.sim as 'right');
});
addEventListener('keydown', (e) => {
  if (!store.settings.practiceInstrument || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.target as HTMLElement).closest('input, select, textarea')) return;
  const what = ({ n: 'right', w: 'wrong', m: 'muted', b: 'buzz', x: 'damp' } as const)[e.key.toLowerCase() as 'n'];
  if (what) simPlay(what);
});
