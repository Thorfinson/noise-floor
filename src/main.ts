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
import { $, keys, type Screen } from './ui/dom';
import { home, progress, settings } from './screens/home';
import { tuner } from './screens/tuner';
import { chordCheck, pianoLesson, songLesson } from './screens/learn';
import { nfRun, nfStart } from './screens/nf';
import { importer, library } from './screens/library';
import { basics, withIntro } from './screens/basics';
import { changeDrill } from './screens/changes';
import { keyCheck } from './screens/keys';
import { session } from './screens/session';
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

/** Browsers only start audio after a click or key press, so the first visit to a listening screen stops here. */
function gate(root: HTMLElement, then: () => void): () => void {
  root.innerHTML = `<div class="gate">
    <p class="kick">Noise Floor</p>
    <h1>${L('Ready to listen?', 'Bereit zum Zuhören?')}</h1>
    <p id="gmsg">${store.settings.mic ? (store.settings.instrument === 'voice' ? L('The app needs your microphone to hear your voice. Nothing is recorded or sent anywhere.', 'Die App braucht dein Mikrofon, um deine Stimme zu hören. Nichts wird aufgenommen oder irgendwohin geschickt.') : L('The app needs your microphone to hear your instrument. Nothing is recorded or sent anywhere.', 'Die App braucht dein Mikrofon, um dein Instrument zu hören. Nichts wird aufgenommen oder irgendwohin geschickt.')) : L('The microphone is switched off in the settings. You can use the practice instrument.', 'Das Mikrofon ist in den Einstellungen ausgeschaltet. Du kannst das Übungsinstrument benutzen.')}</p>
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
    cleanup = r.screen(root, parts.slice(1));
    return;
  }
  const inst = store.settings.instrument;
  const piano = inst === 'piano';
  const items: [string, string][] = [
    ['', L('Today', 'Heute')],
    ['songs', piano ? L('Pieces', 'Stücke') : L('Songs', 'Songs')],
    ['nf', L('Games', 'Spiele')],
    ['basics', L('Basics', 'Grundlagen')],
    ['progress', L('Path', 'Weg')],
    ['settings', L('Settings', 'Einstellungen')],
  ];
  const at = key === 'import' ? 'songs' : key;
  const names: Record<string, string> = { guitar: L('Guitar', 'Gitarre'), piano: L('Piano', 'Klavier'), voice: L('Voice', 'Stimme') };
  root.innerHTML = `<header class="nav"><a class="brand" href="#/">Noise Floor</a>
      <nav aria-label="${L('Main', 'Hauptmenü')}">${items.map(([k, label]) => `<a href="#/${k}"${k === at ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
      <div class="navr">
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

// the language: the one chosen, or at first the browser's
if (!store.settings.lang) store.settings.lang = browserLang();
setLang(store.settings.lang);

addEventListener('hashchange', route);

// "?autostart" skips the gate where the browser allows audio without a click (the browser tests do)
if (new URLSearchParams(location.search).has('autostart')) {
  engine
    .start({ mic: store.settings.mic, deviceId: store.settings.deviceId || undefined })
    .catch(() => undefined)
    .finally(route);
} else route();
