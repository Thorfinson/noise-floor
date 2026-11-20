/**
 * For players who come back to the guitar: strum the chords you know, and what rings is taken as known. Then
 * the session does not check, string by string, chords the hands have had for years. A chord heard ringing
 * as a whole is measured at the first level (it rings); faster levels still come only from the chord check
 * and from songs, as everywhere.
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
  const heard = new Set(chords.filter((c) => store.skills.level('chord:' + c) >= 1));
  /** chords heard once already: a second clear hearing in a row confirms it */
  let pending: string | null = null;
  const box = (id: string): string => `<div class="place-chord${heard.has(id) ? ' known' : ''}" data-chord="${id}"><svg viewBox="0 0 240 210" role="img" aria-label="${esc(CHORDS[id].name)}">${chordBox(CHORDS[id], 40, 30, 150, LEARN, false, undefined, 34)}</svg><b>${esc(CHORDS[id].name)}</b></div>`;
  root.innerHTML = frame(
    `<b>${L('What you can play', 'Was du schon kannst')}</b>`,
    `<div class="say place-say"><p class="eyebrow">${L('For players coming back', 'Für alle, die wieder anfangen')}</p><h1 id="h1">${L('Strum every chord you know.', 'Schlag jeden Akkord an, den du kannst.')}</h1><p class="sub" id="sub">${L('What rings is taken as known.', 'Was klingt, gilt als gekonnt.')}</p></div>
     <div class="place-grid" id="grid">${chords.map(box).join('')}</div>`,
    `<div class="grp do"><a class="btn primary" id="done" href="#/">${L('Done', 'Fertig')} <kbd>${L('Space', 'Leertaste')}</kbd></a></div><p class="auto">${L('A chord counts once it is heard ringing twice in a row.', 'Ein Akkord zählt, wenn er zweimal hintereinander klingend gehört wird.')}</p>`,
    undefined,
    ['#/', L('Today', 'Heute')],
  );
  const mark = (id: string): void => {
    heard.add(id);
    if (store.skills.level('chord:' + id) < 1) store.skills.record('chord:' + id, RINGS, Date.now());
    store.save();
    const b = root.querySelector<HTMLElement>(`[data-chord="${id}"]`);
    b?.classList.add('known');
    $('#sub', root).textContent = L(`${heard.size} of ${chords.length} known.`, `${heard.size} von ${chords.length} gekonnt.`);
    // the practice instrument plays the next one not yet heard
    const next = chords.find((c) => !heard.has(c));
    setSimTarget(next ? { kind: 'chord', id: next } : null);
  };
  setSimTarget({ kind: 'chord', id: chords.find((c) => !heard.has(c)) ?? chords[0] });
  const stopEars = hear(
    root,
    {
      onChord: (e: ChordEvent) => {
        if (!e.best || e.score < 0.7 || e.margin < 0.05 || !chords.includes(e.best)) return;
        if (heard.has(e.best)) return;
        if (pending === e.best) {
          pending = null;
          mark(e.best);
        } else pending = e.best;
      },
    },
    (l) => {
      l.chordCandidates = chords;
    },
  );
  const stopKeys = keys({ ' ': () => go('/') });
  return () => {
    stopEars();
    stopKeys();
    setSimTarget(null);
  };
};
