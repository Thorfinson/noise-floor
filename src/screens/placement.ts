/**
 * For players who come back to the guitar: the open chords one after the other, each strummed once it is
 * asked for, or passed over. What rings is taken as known, and from then on the session does not check,
 * string by string, chords the hands have had for years. A chord heard ringing as a whole is measured at the
 * first level (it rings); faster levels still come only from the chord check and from songs, as everywhere.
 *
 * One chord at a time, and only the chord asked for counts: Am and C share two of their three notes, and a
 * page that took whatever it heard could credit the wrong one.
 */
import type { ChordEvent } from '../audio/listener';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { OPEN_CHORDS } from '../music/path';
import { CHORDS } from '../music/theory';
import { $, esc, go, hear, keys, type Screen } from '../ui/dom';
import { chordBox, LEARN } from '../ui/draw';
import { setSimTarget } from '../ui/practice';
import { frame } from './frame';

/** The seconds recorded for a chord heard ringing as a whole: inside the first level, far from the second. */
const RINGS = 120;

export const placement: Screen = (root) => {
  const chords = OPEN_CHORDS.filter((c) => CHORDS[c]);
  const known = new Set(chords.filter((c) => store.skills.level('chord:' + c) >= 1));
  const passed = new Set<string>();
  /** the chord asked for now: the first neither known nor passed over */
  const current = (): string | undefined => chords.find((c) => !known.has(c) && !passed.has(c));
  /** the chord asked for has been heard once: a second clear hearing confirms it */
  let once = false;
  const box = (id: string): string => `<div class="place-chord" data-chord="${id}"><svg viewBox="0 0 240 210" role="img" aria-label="${esc(CHORDS[id].name)}">${chordBox(CHORDS[id], 40, 30, 150, LEARN, false, undefined, 34)}</svg><b>${esc(CHORDS[id].name)}</b></div>`;
  root.innerHTML = frame(
    `<b>${L('What you can play', 'Was du schon kannst')}</b>`,
    `<div class="say place-say"><p class="eyebrow">${L('For players coming back', 'Für alle, die wieder anfangen')}</p><h1 id="h1"></h1><p class="sub" id="sub"></p></div>
     <div class="place-grid" id="grid">${chords.map(box).join('')}</div>`,
    `<div class="grp do"><button class="btn" id="skip">${L('I can’t yet', 'Kann ich noch nicht')} <kbd>→</kbd></button><a class="btn primary" id="done" href="#/">${L('Done', 'Fertig')} <kbd>${L('Space', 'Leertaste')}</kbd></a></div><p class="auto">${L('A chord counts once it is heard ringing twice in a row.', 'Ein Akkord zählt, wenn er zweimal hintereinander klingend gehört wird.')}</p>`,
    undefined,
    ['#/', L('Today', 'Heute')],
  );
  function show(): void {
    const c = current();
    for (const id of chords) {
      const el = root.querySelector<HTMLElement>(`[data-chord="${id}"]`)!;
      el.classList.toggle('known', known.has(id));
      el.classList.toggle('passed', passed.has(id));
      el.classList.toggle('now', id === c);
    }
    $('#h1', root).innerHTML = c ? L(`Strum <em>${esc(CHORDS[c].name)}</em>.`, `Schlag <em>${esc(CHORDS[c].name)}</em> an.`) : L('That is all of them.', 'Das waren alle.');
    $('#sub', root).textContent = L(`${known.size} of ${chords.length} known. Not this one? The right arrow passes it.`, `${known.size} von ${chords.length} gekonnt. Diesen nicht? Der Pfeil nach rechts überspringt ihn.`);
    // the practice instrument plays the chord asked for
    setSimTarget(c ? { kind: 'chord', id: c } : null);
  }
  const skip = (): void => {
    const c = current();
    if (!c) return;
    passed.add(c);
    once = false;
    show();
  };
  show();
  const stopEars = hear(
    root,
    {
      onChord: (e: ChordEvent) => {
        const c = current();
        if (!c || !e.best || e.score < 0.7) return;
        if (e.best !== c) {
          once = false;
          return;
        }
        if (!once) {
          once = true;
          return;
        }
        once = false;
        known.add(c);
        if (store.skills.level('chord:' + c) < 1) store.skills.record('chord:' + c, RINGS, Date.now());
        store.save();
        show();
      },
    },
    (l) => {
      l.chordCandidates = chords;
    },
  );
  $('#skip', root).onclick = skip;
  const stopKeys = keys({ ArrowRight: skip, ' ': () => go('/') });
  return () => {
    stopEars();
    stopKeys();
    setSimTarget(null);
  };
};
