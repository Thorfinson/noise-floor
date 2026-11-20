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
import { $, applyScale, esc, icon, keys, stopAllLater, type Screen } from './ui/dom';
import { home, progress, settings } from './screens/home';
import { tuner } from './screens/tuner';
import { pianoLesson, songLesson } from './screens/learn';
import { chordCheck } from './screens/chordcheck';
import { nfRun, nfStart } from './screens/nf';
import { nightRun } from './screens/nightrun';
import { importer, library } from './screens/library';
import { basics, withIntro } from './screens/basics';
import { learnPage } from './screens/skills';
import { backdrop, hourNow } from './ui/backdrop';
import { DAWN } from './ui/watch';
import { changeDrill } from './screens/changes';
import { keyCheck } from './screens/keys';
import { session } from './screens/session';
import { repertoirePage, takesPage } from './screens/repertoire';
import { trendsPage } from './screens/trends';
import { chordLibrary, droneTool, metronome } from './screens/tools';
import { compose, jam } from './screens/compose';
import { earTraining } from './screens/ear';
import { strumTrainer } from './screens/strum';
import { fileAtStart, fileState } from './core/progressfile';
import { singAlong, singAlongList } from './screens/singalong';
import { rhythmReading } from './screens/rhythm';
import { hearingCheck } from './screens/check';
import { slurTrainer } from './screens/slur';
import { stride } from './screens/stride';
import { dares } from './screens/dares';
import { fivenotes } from './screens/fivenotes';
import { groove } from './screens/groove';
import { freestyle } from './screens/freestyle';
import { placement } from './screens/placement';
import { weekPage } from './screens/today';
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
  learn: { screen: learnPage, nav: true, mode: 'learn', audio: false },
  progress: { screen: progress, nav: true, mode: 'learn', audio: false },
  repertoire: { screen: repertoirePage, nav: true, mode: 'learn', audio: false },
  takes: { screen: takesPage, nav: true, mode: 'learn', audio: false },
  trends: { screen: trendsPage, nav: true, mode: 'learn', audio: false },
  chords: { screen: chordLibrary, nav: true, mode: 'learn', audio: false },
  metronome: { screen: metronome, mode: 'learn', audio: true },
  drone: { screen: droneTool, mode: 'learn', audio: true },
  compose: { screen: compose, nav: true, mode: 'learn', audio: false },
  jam: { screen: jam, mode: 'learn', audio: true },
  groove: { screen: groove, mode: 'learn', audio: true },
  placement: { screen: placement, mode: 'learn', audio: true },
  week: { screen: weekPage, nav: true, mode: 'learn', audio: false },
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
  night: { screen: nightRun, mode: 'nf', audio: true },
  stride: { screen: withIntro('stride', stride), mode: 'nf', audio: true },
  free: { screen: withIntro('free', freestyle), mode: 'nf', audio: true },
  dares: { screen: dares, mode: 'learn', audio: true },
  five: { screen: fivenotes, mode: 'learn', audio: true },
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
    <p id="gmsg">${engine.lost ? L('The microphone stopped: it was unplugged, or another program took it over. Check it, then start listening again.', 'Das Mikrofon ist verstummt: Es wurde ausgesteckt, oder ein anderes Programm hat es übernommen. Prüf es und starte dann das Zuhören neu.') : store.settings.mic ? (store.settings.instrument === 'voice' ? L('The app needs your microphone to hear your voice. Nothing is sent anywhere; a take you sing to its end is kept in this browser for you to listen back to.', 'Die App braucht dein Mikrofon, um deine Stimme zu hören. Nichts wird irgendwohin geschickt; einen bis zum Ende gesungenen Durchgang behält dieser Browser für dich zum Anhören.') : L('The app needs your microphone to hear your instrument. Nothing is sent anywhere; a take you play to its end is kept in this browser for you to listen back to.', 'Die App braucht dein Mikrofon, um dein Instrument zu hören. Nichts wird irgendwohin geschickt; einen bis zum Ende gespielten Durchgang behält dieser Browser für dich zum Anhören.')) : L('The microphone is switched off in the settings. You can use the practice instrument.', 'Das Mikrofon ist in den Einstellungen ausgeschaltet. Du kannst das Übungsinstrument benutzen.')}</p>
    <button class="btn primary big" id="gstart">${L('Start listening', 'Zuhören starten')} <kbd>${L('Space', 'Leertaste')}</kbd></button>
  </div>`;
  let busy = false;
  // the player went elsewhere while the browser asked about the microphone: nothing of this page may come back
  let left = false;
  // the microphone could not be opened: from then on the button and the keys go on with the practice instrument
  let without = false;
  const start = async (): Promise<void> => {
    if (busy || left) return;
    if (without) return then();
    busy = true;
    try {
      await engine.start({ mic: store.settings.mic, deviceId: store.settings.deviceId || undefined });
    } finally {
      busy = false;
    }
    if (left) return;
    if (!engine.running) {
      // nothing runs, not even the practice instrument: say why; the button tries again
      $('#gmsg', root).textContent = engine.startError;
      return;
    }
    if (store.settings.mic && !engine.micOn) {
      // no microphone: say so, and carry on with the practice instrument so the app is still usable
      store.settings.practiceInstrument = true;
      $('#gmsg', root).textContent = L(
        `The microphone could not be opened (${engine.micError || 'no device'}). The practice instrument is switched on instead; check the browser's microphone permission to use your own.`,
        `Das Mikrofon ließ sich nicht öffnen (${engine.micError || 'kein Gerät'}). Stattdessen ist das Übungsinstrument eingeschaltet; prüfe die Mikrofon-Erlaubnis des Browsers, um dein eigenes zu benutzen.`,
      );
      $('#gstart', root).innerHTML = `${L('Continue', 'Weiter')} <kbd>${L('Space', 'Leertaste')}</kbd>`;
      without = true;
      return;
    }
    then();
  };
  $('#gstart', root).onclick = () => void start();
  const stopKeys = keys({ ' ': () => void start(), Enter: () => void start() });
  return () => {
    left = true;
    stopKeys();
  };
}

/** On a screen that is played at, with the listener: a microphone that stops there sends the player back to the gate. */
let listening = false;
engine.onLost = () => {
  if (listening) route();
};
/** The five places, in the order of the number keys. */
const places = (): [string, string, string][] => [
  ['', L('Today', 'Heute'), 'today'],
  ['learn', L('Learn', 'Lernen'), 'learn'],
  ['songs', store.settings.instrument === 'piano' ? L('Pieces', 'Stücke') : L('Songs', 'Songs'), 'songs'],
  ['nf', L('Games', 'Spiele'), 'games'],
  ['progress', L('Progress', 'Fortschritt'), 'progress'],
];
/** Pages that belong to a place light up its entry. */
const PLACE_OF: Record<string, string> = { week: '', basics: 'learn', import: 'songs', repertoire: 'songs', takes: 'songs', singalongs: 'songs', compose: 'songs', trends: 'progress' };

/**
 * The toolbox: tuner, metronome, drone, chords and the hearing check, opened over whatever page is on show (Q,
 * or the button at the top). The page underneath stays in sight, dimmed; closing the toolbox (Esc) opens it
 * again where it was.
 */
const TOOLS = ['tuner', 'metronome', 'drone', 'chords', 'check'];
let toolFrom: string | null = null;
let toolFromTitle = '';
let lastTool = '';
const toolHome = (): string => (store.settings.instrument === 'piano' ? 'tuner/piano' : store.settings.instrument === 'voice' ? 'tuner/any' : 'tuner');
function openToolbox(tool?: string): void {
  const key = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (toolFrom !== null && TOOLS.includes(key)) {
    closeToolbox();
    return;
  }
  toolFrom = location.hash || '#/';
  toolFromTitle = document.title.split(' · ')[0];
  location.hash = '#/' + (tool ?? (lastTool || toolHome()));
}
function closeToolbox(): void {
  if (toolFrom === null) return;
  const back = toolFrom;
  toolFrom = null;
  location.hash = back;
}
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if ((e.target as HTMLElement).closest('input, select, textarea')) return;
  if (e.key === 'q' || e.key === 'Q') {
    e.preventDefault();
    openToolbox();
  } else if (e.key === 'Escape' && toolFrom !== null) {
    e.preventDefault();
    closeToolbox();
  }
});
addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const open = t.closest<HTMLElement>('[data-toolbox]');
  if (open) {
    e.preventDefault();
    openToolbox(open.dataset.toolbox || undefined);
    return;
  }
  if (t.closest('[data-closetools]')) {
    e.preventDefault();
    closeToolbox();
  }
  // the instrument menu closes when anything else is clicked
  const menu = document.querySelector<HTMLDetailsElement>('details.inst[open]');
  if (menu && !menu.contains(t)) menu.open = false;
});

/** The toolbox over the page on show: the page stays underneath, inert; the tool is played at in the sheet. */
function toolbox(root: HTMLElement, key: string, parts: string[], r: Route): void {
  lastTool = parts.join('/');
  document.body.dataset.mode = 'learn';
  document.body.setAttribute('data-fit', '');
  let behind = root.querySelector<HTMLElement>(':scope > .behind');
  if (!behind) {
    behind = document.createElement('div');
    behind.className = 'behind';
    behind.inert = true;
    behind.setAttribute('aria-hidden', 'true');
    behind.append(...root.childNodes);
    root.append(behind);
  }
  root.querySelectorAll(':scope > .scrim, :scope > .toolbox').forEach((el) => el.remove());
  const piano = store.settings.instrument === 'piano';
  const tabs: [string, string][] = [
    [toolHome(), piano ? L('Piano pitch', 'Tonhöhe') : L('Tuner', 'Stimmgerät')],
    ['metronome', L('Metronome', 'Metronom')],
    ['drone', L('Drone', 'Bordunton')],
    ['chords', L('Chords', 'Akkorde')],
    ['check', L('Hearing check', 'Hörcheck')],
  ];
  root.insertAdjacentHTML(
    'beforeend',
    `<div class="scrim" data-closetools></div><aside class="toolbox" role="dialog" aria-modal="true" aria-label="${L('Tools', 'Werkzeuge')}">
      <header class="tbhead"><h2>${L('Tools', 'Werkzeuge')}</h2><a class="btn quiet" href="${esc(toolFrom ?? '#/')}" data-closetools>${icon('x')}${esc(toolFromTitle ? L(`Back to ${toolFromTitle}`, `Zurück zu ${toolFromTitle}`) : L('Back', 'Zurück'))} <kbd>Esc</kbd></a>
        <nav class="seg tbtabs" aria-label="${L('Tools', 'Werkzeuge')}">${tabs.map(([href, label]) => `<a href="#/${href}"${href.split('/')[0] === key ? ' aria-current="true"' : ''}>${label}</a>`).join('')}</nav></header>
      <div class="tbody" id="tbody"></div>
    </aside>`,
  );
  const body = $('#tbody', root);
  if (r.audio && (!engine.running || engine.lost)) {
    cleanup = gate(body, route);
    return;
  }
  playingSince = performance.now();
  cleanup = r.screen(body, parts.slice(1));
  listening = r.audio;
}

function route(): void {
  stopAllLater();
  countPlaying();
  cleanup?.();
  cleanup = undefined;
  listening = false;
  const parts = location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => {
      // a link with a broken %-escape is taken as it stands, rather than leaving the page empty
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  // only the routes themselves: "toString" or "constructor" in the address is no page
  const key = Object.hasOwn(routes, parts[0] ?? '') ? (parts[0] ?? '') : parts[0] === 'tools' ? 'tools' : '';
  if (key === 'tools') {
    // the old address of the tools: the toolbox, over today's page
    history.replaceState(null, '', '#/');
    route();
    openToolbox();
    return;
  }
  const r = routes[key];
  // an overview page gets the main navigation above it; one introduction on its own is a page to work through
  const titles: Record<string, string> = {
    '': L('Today', 'Heute'),
    learn: L('Learn', 'Lernen'),
    progress: L('Progress', 'Fortschritt'),
    repertoire: L('Repertoire', 'Repertoire'),
    takes: L('Recordings', 'Aufnahmen'),
    trends: L('Over the weeks', 'Über die Wochen'),
    chords: L('Chord library', 'Griffbibliothek'),
    metronome: L('Metronome', 'Metronom'),
    drone: L('Drone', 'Bordunton'),
    compose: L('Your own song', 'Dein eigener Song'),
    jam: L('Play freely', 'Frei spielen'),
    groove: L('In the groove', 'Im Groove'),
    placement: L('What you can play', 'Was du schon kannst'),
    week: L('Song of the week', 'Song der Woche'),
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
    basics: L('Handbook', 'Handbuch'),
    song: L('Song', 'Song'),
    piano: L('Piece', 'Stück'),
    chord: L('Chord check', 'Akkord-Check'),
    keys: L('Chord check', 'Akkord-Check'),
    change: L('Chord change', 'Akkordwechsel'),
    songs: store.settings.instrument === 'piano' ? L('Pieces', 'Stücke') : L('Songs', 'Songs'),
    import: L('Add your own', 'Eigenes hinzufügen'),
    nf: L('Games', 'Spiele'),
    run: L('Game', 'Spiel'),
    night: L('Tonight', 'Die Nacht'),
    stride: L('Stepping stones', 'Trittsteine'),
    free: L('Freestyle', 'Freestyle'),
    range: L('Your range', 'Dein Stimmumfang'),
    match: L('Match the tone', 'Töne treffen'),
    hold: L('Hold a tone', 'Einen Ton halten'),
    sing: L('Song', 'Song'),
  };
  const root = $('#app');
  // a tool opened from the toolbox: over the page that was on show
  if (toolFrom !== null && TOOLS.includes(key)) {
    document.title = `${titles[key]} · Noise Floor`;
    toolbox(root, key, parts, r);
    return;
  }
  toolFrom = null;
  document.body.dataset.mode = r.mode;
  document.title = `${titles[key] ?? L('Today', 'Heute')} · Noise Floor`;
  const overview = !!r.nav && !(key === 'basics' && parts[2] === 'try');
  // screens that are played at fill the window and do not scroll; overview pages scroll like any page
  document.body.toggleAttribute('data-fit', r.audio && !overview);
  root.innerHTML = '';
  scrollTo(0, 0);
  // reading needs no microphone: only what is played at waits for it
  if (r.audio && !overview && (!engine.running || engine.lost)) {
    cleanup = gate(root, route);
    return;
  }
  if (!overview) {
    playingSince = performance.now();
    cleanup = r.screen(root, parts.slice(1));
    listening = r.audio;
    return;
  }
  const inst = store.settings.instrument;
  const items = places();
  const at = PLACE_OF[key] ?? key;
  const names: Record<string, string> = { guitar: L('Guitar', 'Gitarre'), piano: L('Piano', 'Klavier'), voice: L('Voice', 'Stimme') };
  root.innerHTML = `<header class="nav"><div class="navin">
      <a class="brand" href="#/">Noise Floor</a>
      <details class="inst"><summary title="${L('Instrument: guitar, piano or voice', 'Instrument: Gitarre, Klavier oder Stimme')}">${icon(inst)}<span class="lbl">${names[inst]}</span><span class="caret" aria-hidden="true">▾</span></summary>
        <div class="instmenu" role="group" aria-label="${L('Instrument', 'Instrument')}">${(['guitar', 'piano', 'voice'] as const).map((x) => `<button type="button" data-inst="${x}" aria-pressed="${x === inst}">${icon(x)}${names[x]}</button>`).join('')}</div></details>
      <nav class="places" aria-label="${L('Main', 'Hauptmenü')}">${items.map(([k, label], i) => `<a href="#/${k}"${k === at ? ' aria-current="page"' : ''}>${label}<i aria-hidden="true">${i + 1}</i></a>`).join('')}</nav>
      <div class="navr">
        <button class="tbx" type="button" data-toolbox title="${L('Tools: tuner, metronome, drone, chords, hearing check', 'Werkzeuge: Stimmgerät, Metronom, Bordunton, Akkorde, Hörcheck')}">${icon('fork')}<span class="lbl">${L('Tools', 'Werkzeuge')}</span> <kbd>Q</kbd></button>
        <a class="gear" href="#/settings"${at === 'settings' ? ' aria-current="page"' : ''} title="${L('Settings', 'Einstellungen')}" aria-label="${L('Settings', 'Einstellungen')}">${icon('gear')}</a>
      </div>
    </div></header><div class="view" id="view"></div>
    <nav class="tabbar" aria-label="${L('Main', 'Hauptmenü')}">${items.map(([k, label, ic]) => `<a href="#/${k}"${k === at ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('')}</nav>`;
  root.querySelectorAll<HTMLElement>('.nav [data-inst]').forEach(
    (b) =>
      (b.onclick = () => {
        store.settings.instrument = b.dataset.inst === 'piano' ? 'piano' : b.dataset.inst === 'voice' ? 'voice' : 'guitar';
        store.save();
        route();
      }),
  );
  const shown = r.screen($('#view', root), parts.slice(1));
  // the painted world behind the page: each place has its scene (the games paint their own)
  const scene = at === '' ? `watch:${hourNow()}` : at === 'learn' ? 'marsh:0' : at === 'songs' ? 'watch:2' : at === 'progress' ? 'watch:3' : at === 'settings' ? `watch:${DAWN}` : '';
  if (scene) backdrop($('#view', root), scene);
  // the number keys go to the five places, where the page itself has no use for them
  const placeKeys = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= items.length && items[n - 1][0] !== key) {
      e.preventDefault();
      location.hash = '#/' + items[n - 1][0];
    }
  };
  addEventListener('keydown', placeKeys);
  cleanup = () => {
    removeEventListener('keydown', placeKeys);
    shown?.();
  };
}

// a progress file chosen before: whether the browser still lets the app use it, and whether it is newer
void fileAtStart().then(() => {
  if (fileState().newer || fileState().status === 'ask' || fileState().unreadable) route();
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
