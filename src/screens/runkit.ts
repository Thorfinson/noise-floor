/**
 * What the screens of the games share: menus chosen from the instrument (strum a chord on a card, or play a
 * key), and a few small helpers. Used by the runs (screens/nf.ts) and the lighthouse on a groove
 * (screens/nightrun.ts).
 */
import { engine } from '../audio/engine';
import { L, num } from '../core/i18n';
import { store } from '../core/store';
import { CHORDS } from '../music/theory';
import { hear, pianoEars } from '../ui/dom';
import { chordBox, NF } from '../ui/draw';

/** The chords that pick card 1, 2 and 3 on the guitar, and the keys on the piano. */
export const STRUM = ['Em', 'Am', 'C'];
export const KEYS = ['C', 'D', 'E'];

/** A menu is picked from the instrument on the guitar and the piano; a voice picks with the keys. */
export const menuOn = (): boolean => engine.running && store.settings.strumSelect && store.settings.instrument !== 'voice';

/** Seconds to a tenth, written the way the language writes them: 6.2, 6,2; num() leaves out a tenth that is 0. */
export const tenths = (s: number): string => {
  const t = Math.round(s * 10) / 10;
  return num(t) + (Number.isInteger(t) ? L('.0', ',0') : '');
};

/**
 * Where the picture is only a backdrop (the menu, the page before a run and the one after it), what moves in
 * it drifts slowly: thirty frames a second show that as well as sixty, and spare the battery. Says whether a
 * frame is to be drawn.
 */
export function slowly(): (ts: number) => boolean {
  let drawn = -Infinity;
  return (ts) => {
    if (ts - drawn < 1000 / 30 - 4) return false;
    drawn = ts;
    return true;
  };
}

/** How to pick card i from the instrument. */
export const pickHint = (i: number, piano: boolean): string =>
  menuOn()
    ? piano
      ? L(`Play ${KEYS[i]} or press ${i + 1}`, `Spiel ${KEYS[i]} oder drück ${i + 1}`)
      : // the chord that picks the card, with its shape: nobody should have to know a chord to choose from a menu
        `<svg class="pickfig" viewBox="0 0 96 104" role="img" aria-label="${L(`Chord diagram of ${STRUM[i]}`, `Griffbild von ${STRUM[i]}`)}">${chordBox(CHORDS[STRUM[i]], 14, 24, 68, NF, false, undefined, 15)}</svg><span>${L(`Strum ${STRUM[i]} or press ${i + 1}`, `Schlag ${STRUM[i]} an oder drück ${i + 1}`)}</span>`
    : L(`Press ${i + 1}`, `Drück ${i + 1}`);

/** Where a menu says whether it is listening to the instrument yet. */
export const pickState = (): string => (menuOn() ? `<p class="pickstate" id="pickstate" role="status" aria-live="polite"></p>` : '');

/**
 * A menu chosen from the instrument listens only once the instrument has been quiet for a moment: notes
 * still ringing from a run, or played on after it, must not pick a card. Until then, and from then on, the
 * menu says what it is doing.
 */
export function armed(root: HTMLElement, pick: (i: number) => void, piano: boolean): { heard: (i: number) => void; stop: () => void } {
  const shown = performance.now();
  let last = shown;
  let on = false;
  const say = (): void => {
    const el = root.querySelector<HTMLElement>('#pickstate');
    if (!el) return;
    el.classList.toggle('on', on);
    el.textContent = on
      ? piano
        ? L('Listening: play C, D or E to choose, or press 1, 2, 3.', 'Hört zu: Spiel C, D oder E zum Wählen, oder drück 1, 2, 3.')
        : L('Listening: strum Em, Am or C to choose, or press 1, 2, 3.', 'Hört zu: Schlag Em, Am oder C zum Wählen an, oder drück 1, 2, 3.')
      : L('Let the instrument go quiet for a moment: then it chooses. The keys 1, 2, 3 choose at once.', 'Lass das Instrument einen Moment ruhen: dann wählt es. Die Tasten 1, 2, 3 wählen sofort.');
  };
  const timer = window.setInterval(() => {
    const now = performance.now();
    const ready = now - shown >= 1500 && now - last >= 1000;
    if (ready !== on) {
      on = ready;
      say();
    }
  }, 100);
  say();
  return {
    /** something was played: a card when it is listening and the sound picks one, otherwise the quiet starts again */
    heard: (i) => {
      if (on && i >= 0) pick(i);
      else if (!on) last = performance.now();
    },
    stop: () => clearInterval(timer),
  };
}

/** Lets a menu be operated from the instrument: strum Em, Am or C, or play C, D or E on the piano, for card 1, 2 or 3. */
export function pickMenu(root: HTMLElement, pick: (i: number) => void, piano: boolean): () => void {
  if (!menuOn()) return () => undefined;
  const gate = armed(root, pick, piano);
  const stop = piano
    ? hear(
        root,
        {
          onNote: (e) => {
            const i = [0, 2, 4].indexOf(e.midi % 12);
            gate.heard(i >= 0 && e.conf > 0.7 && e.midi >= 48 && e.midi <= 84 ? i : -1);
          },
        },
        pianoEars,
      )
    : hear(
        root,
        {
          onChord: (e) => {
            const i = e.best ? STRUM.indexOf(e.best) : -1;
            gate.heard(i >= 0 && e.score > 0.8 && e.margin > 0.12 ? i : -1);
          },
        },
        (l) => {
          l.noteDetection = false;
          l.chordCandidates = STRUM;
        },
      );
  return () => {
    gate.stop();
    stop();
  };
}

/** The barre chord a run ends with: the small shape first, then the full one. */
export function bossChord(): string {
  const ladder = store.settings.smallShapes ? ['F#m-easy', 'F#m', 'Bm-easy', 'Bm'] : ['F#m', 'Bm'];
  return ladder.find((c) => store.skills.level('chord:' + c) < 4) ?? 'Bm';
}
