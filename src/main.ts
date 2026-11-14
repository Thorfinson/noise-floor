import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/700.css';
import './styles.css';
import './ui/practice';
import { engine } from './audio/engine';
import { browserLang, L, setLang } from './core/i18n';
import { store } from './core/store';
import { $, applyScale, icon, keys, stopAllLater, type Screen } from './ui/dom';
import { home, progress, settings } from './screens/home';
import { tuner } from './screens/tuner';
import { chordCheck, pianoLesson, songLesson } from './screens/learn';
import { nfRun, nfStart } from './screens/nf';
import { importer, library } from './screens/library';
import { basics, withIntro } from './screens/basics';
import { changeDrill } from './screens/changes';
import { keyCheck } from './screens/keys';
import { session } from './screens/session';
import { repertoirePage, takesPage } from './screens/repertoire';
import { trendsPage } from './screens/trends';
import { chordLibrary, droneTool, metronome, toolsPage } from './screens/tools';
import { compose, jam } from './screens/compose';
import { earTraining } from './screens/ear';
import { strumTrainer } from './screens/strum';
import { fileAtStart, fileState } from './core/progressfile';
import { singAlong, singAlongList } from './screens/singalong';
import { rhythmReading } from './screens/rhythm';
import { hearingCheck } from './screens/check';
import { slurTrainer } from './screens/slur';
import { stride } from './screens/stride';
import { holdTone, pitchMatch, singLesson, voiceRangeTest } from './screens/sing';

interface Route {
  screen: Screen;
  /** an overview page: it carries the main navigation. Pages that are played at show only a way out, top left. */
  nav?: boolean;
  mode: 'learn' | 'nf';
  /** needs the listener before it can do anything */
  audio: boolean;
}

const routes: Record<string, Route> = {
  '': { screen: home, nav: true, mode: 'learn', audio: false },
  progress: { screen: progress, nav: true, mode: 'learn', audio: false },
  repertoire: { screen: repertoirePage, nav: true, mode: 'learn', audio: false },
  takes: { screen: takesPage, nav: true, mode: 'learn', audio: false },
  trends: { screen: trendsPage, nav: true, mode: 'learn', audio: false },
  tools: { screen: toolsPage, nav: true, mode: 'learn', audio: false },
  chords: { screen: chordLibrary, nav: true, mode: 'learn', audio: false },
  metronome: { screen: metronome, mode: 'learn', audio: true },
  drone: { screen: droneTool, mode: 'learn', audio: true },
  compose: { screen: compose, nav: true, mode: 'learn', audio: false },
  jam: { screen: jam, mode: 'learn', audio: true },
  ear: { screen: withIntro('ear', earTraining), mode: 'learn', audio: true },
  strum: { screen: withIntro('strumming', strumTrainer), mode: 'learn', audio: true },
  singalong: { screen: singAlong, mode: 'learn', audio: true },
  rhythm: { screen: rhythmReading, mode: 'learn', audio: true },
  check: { screen: hearingCheck, mode: 'learn', audio: true },
  slur: { screen: withIntro('slur', slurTrainer), mode: 'learn', audio: true },
  singalongs: { screen: singAlongList, nav: true, mode: 'learn', audio: false },
  settings: { screen: settings, nav: true, mode: 'learn', audio: false },
  session: { screen: session, mode: 'learn', audio: true },
  tuner: { screen: withIntro('tuner', tuner), mode: 'learn', audio: true },
  basics: { screen: basics, nav: true, mode: 'learn', audio: true },
  song: { screen: withIntro('song', songLesson), mode: 'learn', audio: true },
  piano: { screen: withIntro('piano', pianoLesson), mode: 'learn', audio: true },
  chord: { screen: withIntro('chord', chordCheck), mode: 'learn', audio: true },
  keys: { screen: withIntro('keys', keyCheck), mode: 'learn', audio: true },
  change: { screen: withIntro('change', changeDrill), mode: 'learn', audio: true },
  songs: { screen: library, nav: true, mode: 'learn', audio: false },
  import: { screen: importer, nav: true, mode: 'learn', audio: false },
  nf: { screen: nfStart, nav: true, mode: 'learn', audio: false },
  run: { screen: withIntro('run', nfRun), mode: 'nf', audio: true },
  stride: { screen: withIntro('stride', stride), mode: 'nf', audio: true },
  // the voice
  range: { screen: withIntro('range', voiceRangeTest), mode: 'learn', audio: true },
  match: { screen: withIntro('match', pitchMatch), mode: 'learn', audio: true },
  hold: { screen: withIntro('hold', holdTone), mode: 'learn', audio: true },
  sing: { screen: withIntro('sing', singLesson), mode: 'learn', audio: true },
};

let cleanup: void | (() => void);

/** Time spent on a screen that is played at: added to the day's practice when the screen is left. */
let playingSince = 0;
function countPlaying(): void {
  if (!playingSince) return;
  const secs = (performance.now() - playingSince) / 1000;
  playingSince = 0;
  // a screen left open while away from the instrument is not practice: at most half an hour at a time
  store.logPractice(Math.min(secs, 1800), Date.now());
  store.savePractice();
}
addEventListener('visibilitychange', () => {
  if (document.hidden) countPlaying();
  else if (document.body.hasAttribute('data-fit')) playingSince = performance.now();
});

/** Browsers only start audio after a click or key press, so the first visit to a listening screen stops here. */
function gate(root: HTMLElement, then: () => void): () => void {
  root.innerHTML = `<div class="gate">
    <p class="kick">Noise Floor</p>
    <h1>${L('Ready to listen?', 'Bereit zum Zuhören?')}</h1>
    <p id="gmsg">${store.settings.mic ? (store.settings.instrument === 'voice' ? L('The app needs your microphone to hear your voice. Nothing is sent anywhere; a take you sing to its end is kept in this browser for you to listen back to.', 'Die App braucht dein Mikrofon, um deine Stimme zu hören. Nichts wird irgendwohin geschickt; einen bis zum Ende gesungenen Durchgang behält dieser Browser für dich zum Anhören.') : L('The app needs your microphone to hear your instrument. Nothing is sent anywhere; a take you play to its end is kept in this browser for you to listen back to.', 'Die App braucht dein Mikrofon, um dein Instrument zu hören. Nichts wird irgendwohin geschickt; einen bis zum Ende gespielten Durchgang behält dieser Browser für dich zum Anhören.')) : L('The microphone is switched off in the settings. You can use the practice instrument.', 'Das Mikrofon ist in den Einstellungen ausgeschaltet. Du kannst das Übungsinstrument benutzen.')}</p>
    <button class="btn primary big" id="gstart">${L('Start listening', 'Zuhören starten')} <kbd>${L('Space', 'Leertaste')}</kbd></button>
  </div>`;
  let busy = false;
  const start = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    await engine.start({ mic: store.settings.mic, deviceId: store.settings.deviceId || undefined });
    if (store.settings.mic && !engine.micOn) {
      // no microphone: say so, and carry on with the practice instrument so the app is still usable
      store.settings.practiceInstrument = true;
      $('#gmsg', root).textContent = L(
        `The microphone could not be opened (${engine.micError || 'no device'}). The practice instrument is switched on instead; check the browser's microphone permission to use your own.`,
        `Das Mikrofon ließ sich nicht öffnen (${engine.micError || 'kein Gerät'}). Stattdessen ist das Übungsinstrument eingeschaltet; prüfe die Mikrofon-Erlaubnis des Browsers, um dein eigenes zu benutzen.`,
      );
      $('#gstart', root).textContent = L('Continue', 'Weiter');
      $('#gstart', root).onclick = then;
      busy = false;
      return;
    }
    then();
  };
  $('#gstart', root).onclick = () => void start();
  return keys({ ' ': () => void start(), Enter: () => void start() });
}

function route(): void {
  stopAllLater();
  countPlaying();
  cleanup?.();
  cleanup = undefined;
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const r = routes[parts[0] ?? ''] ?? routes[''];
  document.body.dataset.mode = r.mode;
  // an overview page gets the main navigation above it; one introduction on its own is a page to work through
  const key = routes[parts[0] ?? ''] ? (parts[0] ?? '') : '';
  const titles: Record<string, string> = {
    '': L('Today', 'Heute'),
    progress: L('Path', 'Weg'),
    repertoire: L('Repertoire', 'Repertoire'),
    takes: L('Recordings', 'Aufnahmen'),
    trends: L('Over the weeks', 'Über die Wochen'),
    tools: L('Tools', 'Werkzeuge'),
    chords: L('Chord library', 'Griffbibliothek'),
    metronome: L('Metronome', 'Metronom'),
    drone: L('Drone', 'Bordunton'),
    compose: L('Your own song', 'Dein eigener Song'),
    jam: L('Play freely', 'Frei spielen'),
    ear: L('By ear', 'Nach Gehör'),
    strum: L('Strumming', 'Anschlagen'),
    singalong: L('Sing and play', 'Singen und spielen'),
    rhythm: L('Reading rhythm', 'Rhythmus lesen'),
    check: L('Hearing check', 'Hörcheck'),
    slur: L('Hammer-on and pull-off', 'Hammer-on und Pull-off'),
    singalongs: L('Sing and play', 'Singen und spielen'),
    settings: L('Settings', 'Einstellungen'),
    session: L('Session', 'Session'),
    tuner: L('Tuner', 'Stimmgerät'),
    basics: L('Basics', 'Grundlagen'),
    song: L('Song', 'Song'),
    piano: L('Piece', 'Stück'),
    chord: L('Chord check', 'Akkord-Check'),
    keys: L('Chord check', 'Akkord-Check'),
    change: L('Chord change', 'Akkordwechsel'),
    songs: store.settings.instrument === 'piano' ? L('Pieces', 'Stücke') : L('Songs', 'Songs'),
    import: L('Add your own', 'Eigenes hinzufügen'),
    nf: L('Games', 'Spiele'),
    run: L('Game', 'Spiel'),
    stride: L('Stepping stones', 'Trittsteine'),
    range: L('Your range', 'Dein Stimmumfang'),
    match: L('Match the tone', 'Töne treffen'),
    hold: L('Hold a tone', 'Einen Ton halten'),
    sing: L('Song', 'Song'),
  };
  document.title = `${titles[key] ?? L('Today', 'Heute')} · Noise Floor`;
  const overview = !!r.nav && !(key === 'basics' && parts[2] === 'try');
  // screens that are played at fill the window and do not scroll; overview pages scroll like any page
  document.body.toggleAttribute('data-fit', r.audio && !overview);
  const root = $('#app');
  root.innerHTML = '';
  scrollTo(0, 0);
  // reading needs no microphone: only what is played at waits for it
  if (r.audio && !overview && !engine.running) {
    cleanup = gate(root, route);
    return;
  }
  if (!overview) {
    playingSince = performance.now();
    cleanup = r.screen(root, parts.slice(1));
    return;
  }
  const inst = store.settings.instrument;
  const piano = inst === 'piano';
  const items: [string, string][] = [
    ['', L('Today', 'Heute')],
    ['songs', piano ? L('Pieces', 'Stücke') : L('Songs', 'Songs')],
    ['nf', L('Games', 'Spiele')],
    ['tools', L('Tools', 'Werkzeuge')],
    ['basics', L('Basics', 'Grundlagen')],
    ['progress', L('Progress', 'Fortschritt')],
  ];
  // pages that belong to a section light up its entry
  const at = key === 'import' ? 'songs' : key === 'repertoire' || key === 'trends' || key === 'takes' ? 'progress' : key === 'chords' || key === 'compose' || key === 'singalongs' ? 'tools' : key;
  const names: Record<string, string> = { guitar: L('Guitar', 'Gitarre'), piano: L('Piano', 'Klavier'), voice: L('Voice', 'Stimme') };
  root.innerHTML = `<header class="nav"><a class="brand" href="#/">Noise Floor</a>
      <nav aria-label="${L('Main', 'Hauptmenü')}">${items.map(([k, label]) => `<a href="#/${k}"${k === at ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
      <div class="navr">
        <a class="gear" href="#/settings"${at === 'settings' ? ' aria-current="page"' : ''} title="${L('Settings', 'Einstellungen')}" aria-label="${L('Settings', 'Einstellungen')}">${icon('gear')}</a>
        <div class="seg" role="group" aria-label="${L('Instrument', 'Instrument')}">${(['guitar', 'piano', 'voice'] as const).map((x) => `<button data-inst="${x}" aria-pressed="${x === inst}">${names[x]}</button>`).join('')}</div>
        <div class="seg lang" role="group" aria-label="${L('Language', 'Sprache')}">${(['en', 'de'] as const).map((x) => `<button data-lang="${x}" aria-pressed="${x === store.settings.lang}" lang="${x}" title="${x === 'en' ? 'English' : 'Deutsch'}">${x.toUpperCase()}</button>`).join('')}</div>
      </div>
    </header><div class="view" id="view"></div>`;
  root.querySelectorAll<HTMLElement>('.nav [data-lang]').forEach(
    (b) =>
      (b.onclick = () => {
        store.settings.lang = b.dataset.lang === 'de' ? 'de' : 'en';
        store.save();
        setLang(store.settings.lang);
        route();
      }),
  );
  root.querySelectorAll<HTMLElement>('.nav [data-inst]').forEach(
    (b) =>
      (b.onclick = () => {
        store.settings.instrument = b.dataset.inst === 'piano' ? 'piano' : b.dataset.inst === 'voice' ? 'voice' : 'guitar';
        store.save();
        route();
      }),
  );
  cleanup = r.screen($('#view', root), parts.slice(1));
}

// a progress file chosen before: whether the browser still lets the app use it, and whether it is newer
void fileAtStart().then(() => {
  if (fileState().newer || fileState().status === 'ask') route();
});

// the language: the one chosen, or at first the browser's
if (!store.settings.lang) store.settings.lang = browserLang();
setLang(store.settings.lang);
applyScale();

// once the app has been opened, it opens without a network too (only in the built app: the files of the dev server change)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('./sw.js')
    .then(() => Promise.all([navigator.serviceWorker.ready, document.fonts.ready]))
    .then(([reg]) => {
      // the first visit loaded its files before the worker was there: it keeps them now, so that the app
      // opens without a network from the first time on, not only from the second
      const here = (u: string): boolean => new URL(u, location.href).origin === location.origin;
      const urls = [new URL('./', location.href).href, location.href.split('#')[0], ...performance.getEntriesByType('resource').map((e) => e.name)].filter(here);
      reg.active?.postMessage({ keep: [...new Set(urls)] });
    })
    .catch(() => undefined);
}

addEventListener('hashchange', route);

// "?autostart" skips the gate where the browser allows audio without a click (the browser tests do)
if (new URLSearchParams(location.search).has('autostart')) {
  engine
    .start({ mic: store.settings.mic, deviceId: store.settings.deviceId || undefined })
    .catch(() => undefined)
    .finally(route);
} else route();
