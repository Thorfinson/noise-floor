/**
 * The tools of the toolbox (Q, over any page): a metronome (with the beats of a bar, a subdivision and tap
 * tempo), the chord library to look a shape up in, and a drone to sing against or play over. The tuner and the
 * hearing check are screens of their own, also in the toolbox.
 */
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { chordKey } from '../music/difficulty';
import { KEY_CHORDS, KEY_CHORDS_ON } from '../music/content';
import { chordName, CHORDS, NOTE_NAMES } from '../music/theory';
import { $, $$, esc, keys, type Screen } from '../ui/dom';
import { chordBox, keyChord, LEARN } from '../ui/draw';
import { frame } from './frame';
import { pips } from './home';

/* ───────────────────────── the metronome ───────────────────────── */

export const metronome: Screen = (root) => {
  let bpm = Math.max(30, Math.min(240, store.speeds['metronome'] ?? 72));
  let per = Math.max(2, Math.min(7, store.speeds['metronome:per'] ?? 4));
  let sub = Math.max(1, Math.min(4, store.speeds['metronome:sub'] ?? 1));
  let on = false;
  let next = 0;
  let count = 0;
  let timer = 0;
  let raf = 0;
  let taps: number[] = [];
  const scheduled: { t: number; beat: number; sub: number }[] = [];
  root.innerHTML = frame(
    `<b>${L('Metronome', 'Metronom')}</b>`,
    `<div class="metro">
       <p class="eyebrow">${L('The beat to play to', 'Der Schlag zum Mitspielen')}</p>
       <h1 id="bpm" aria-live="polite"></h1>
       <div class="beats" id="beats" aria-hidden="true"></div>
       <div class="row">
         <div class="seg" role="group" aria-label="${L('Beats in a bar', 'Schläge pro Takt')}">${[2, 3, 4, 5, 6, 7].map((n) => `<button data-per="${n}" aria-pressed="${n === per}">${n}</button>`).join('')}</div>
         <div class="seg" role="group" aria-label="${L('Subdivision', 'Unterteilung')}">${[
           [1, L('quarters', 'Viertel')],
           [2, L('eighths', 'Achtel')],
           [3, L('triplets', 'Triolen')],
           [4, L('sixteenths', 'Sechzehntel')],
         ]
           .map(([n, s]) => `<button data-sub="${n}" aria-pressed="${n === sub}">${s}</button>`)
           .join('')}</div>
       </div>
       <p class="note">${L('The first beat of a bar is accented. The sound and its loudness are in the settings; with the low click, use headphones while the app listens.', 'Der erste Schlag eines Takts ist betont. Klang und Lautstärke stehen in den Einstellungen; mit dem tiefen Klick nimm Kopfhörer, solange die App zuhört.')}</p>
     </div>`,
    `<div class="grp"><button class="btn primary" id="go"><span>${L('Start', 'Starten')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn quiet" id="slower">−5 <kbd>−</kbd></button><button class="btn quiet" id="faster">+5 <kbd>+</kbd></button><button class="btn" id="tap">${L('Tap the tempo', 'Tempo antippen')} <kbd>T</kbd></button></div>`,
    undefined,
    ['#/', L('Home', 'Start')],
  );
  const show = (): void => {
    $('#bpm', root).innerHTML = `${bpm} <small>bpm</small>`;
    $('#beats', root).innerHTML = Array.from({ length: per }, (_, i) => `<i class="${i === 0 ? 'one' : ''}"></i>`).join('');
  };
  const save = (): void => {
    store.speeds['metronome'] = bpm;
    store.speeds['metronome:per'] = per;
    store.speeds['metronome:sub'] = sub;
    store.save();
  };
  /** Schedules the clicks of the next half second, again and again: the audio clock keeps the time. */
  const pump = (): void => {
    const now = engine.now();
    const step = 60 / bpm / sub;
    while (next < now + 0.5) {
      const beat = Math.floor(count / sub) % per;
      const s = count % sub;
      // the downbeat accented, the beats plain, the subdivisions soft
      engine.tick(next, beat === 0 && s === 0, s === 0 ? store.settings.click || 0.5 : 0.5 * (store.settings.click || 0.5), store.settings.clickSound === 'click');
      scheduled.push({ t: next, beat, sub: s });
      next += step;
      count++;
    }
  };
  const light = (): void => {
    raf = requestAnimationFrame(light);
    const now = engine.now();
    while (scheduled.length > 1 && scheduled[1].t <= now) scheduled.shift();
    const cur = scheduled[0];
    if (!cur || cur.t > now) return;
    $$('#beats i', root).forEach((el, i) => el.classList.toggle('lit', i === cur.beat && now - cur.t < 0.15));
  };
  const start = (): void => {
    if (!engine.running) return;
    on = true;
    next = engine.now() + 0.1;
    count = 0;
    scheduled.length = 0;
    pump();
    timer = window.setInterval(pump, 100);
    raf = requestAnimationFrame(light);
    $('#go span', root).textContent = L('Stop', 'Stopp');
  };
  const stop = (): void => {
    on = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    engine.clearTicks();
    $$('#beats i', root).forEach((el) => el.classList.remove('lit'));
    $('#go span', root).textContent = L('Start', 'Starten');
  };
  const restart = (): void => {
    save();
    show();
    if (on) {
      stop();
      start();
    }
  };
  const tempo = (d: number): void => {
    bpm = Math.max(30, Math.min(240, bpm + d));
    restart();
  };
  const tap = (): void => {
    const t = performance.now();
    taps = [...taps.filter((x) => t - x < 3000), t];
    if (taps.length >= 3) {
      const gaps = taps.slice(1).map((x, i) => x - taps[i]);
      bpm = Math.max(30, Math.min(240, Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length))));
      restart();
    }
  };
  $$('[data-per]', root).forEach((b) => (b.onclick = () => {
    per = Number(b.dataset.per);
    $$('[data-per]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    restart();
  }));
  $$('[data-sub]', root).forEach((b) => (b.onclick = () => {
    sub = Number(b.dataset.sub);
    $$('[data-sub]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    restart();
  }));
  $('#go', root).onclick = () => (on ? stop() : start());
  $('#slower', root).onclick = () => tempo(-5);
  $('#faster', root).onclick = () => tempo(5);
  $('#tap', root).onclick = tap;
  const stopKeys = keys({ ' ': () => (on ? stop() : start()), '-': () => tempo(-5), '+': () => tempo(5), '=': () => tempo(5), t: tap, ArrowUp: () => tempo(1), ArrowDown: () => tempo(-1) });
  show();
  return () => {
    stop();
    stopKeys();
  };
};

/* ───────────────────────── the drone ───────────────────────── */

export const droneTool: Screen = (root) => {
  let root12 = Math.max(0, Math.min(11, store.speeds['drone:root'] ?? 9));
  let fifth = (store.speeds['drone:fifth'] ?? 1) === 1;
  let on = false;
  const voice = store.settings.instrument === 'voice';
  const base = (): number => (voice ? 48 : 45) + ((root12 - (voice ? 0 : 9) + 12) % 12);
  root.innerHTML = frame(
    `<b>${L('Drone', 'Bordunton')}</b>`,
    `<div class="metro">
       <p class="eyebrow">${L('A note held under you', 'Ein Ton, der unter dir liegt')}</p>
       <h1 id="dname" aria-live="polite"></h1>
       <div class="seg notes" role="group" aria-label="${L('The note', 'Der Ton')}">${NOTE_NAMES.map((n, i) => `<button data-root="${i}" aria-pressed="${i === root12}">${n}</button>`).join('')}</div>
       <div class="row"><label class="check"><input type="checkbox" id="fifth" ${fifth ? 'checked' : ''}> ${L('With its fifth', 'Mit seiner Quinte')}</label></div>
       <p class="note">${L('Sing a scale against it and hear each note settle, or play freely over it. Through speakers the microphone hears the drone too: this page does not listen.', 'Sing eine Tonleiter dagegen und hör, wie sich jeder Ton setzt, oder spiel frei darüber. Über Lautsprecher hört das Mikrofon den Bordun mit: Diese Seite hört nicht zu.')}</p>
     </div>`,
    `<div class="grp"><button class="btn primary" id="go"><span>${L('Start', 'Starten')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button></div>`,
    undefined,
    ['#/', L('Home', 'Start')],
  );
  const show = (): void => void ($('#dname', root).textContent = `${NOTE_NAMES[root12]}${fifth ? ` + ${NOTE_NAMES[(root12 + 7) % 12]}` : ''}`);
  const sound = (): void => {
    // the note named, at the tuning reference: not moved by a capo or a lowered tuning the last lesson left in the listener
    if (on) engine.drone(fifth ? [base(), base() + 7] : [base()], 0.4, store.settings.instrument === 'piano' ? store.settings.pianoA4 : store.settings.a4);
  };
  const toggle = (): void => {
    on = !on;
    if (on) sound();
    else engine.drone([]);
    $('#go span', root).textContent = on ? L('Stop', 'Stopp') : L('Start', 'Starten');
  };
  $$('[data-root]', root).forEach((b) => (b.onclick = () => {
    root12 = Number(b.dataset.root);
    store.speeds['drone:root'] = root12;
    store.save();
    $$('[data-root]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    show();
    sound();
  }));
  $<HTMLInputElement>('#fifth', root).onchange = (e) => {
    fifth = (e.target as HTMLInputElement).checked;
    store.speeds['drone:fifth'] = fifth ? 1 : 0;
    store.save();
    show();
    sound();
  };
  $('#go', root).onclick = toggle;
  const stopKeys = keys({ ' ': toggle });
  show();
  return () => {
    engine.drone([]);
    stopKeys();
  };
};

/* ───────────────────────── the chord library ───────────────────────── */

/** The guitar's chords in groups, as a chord book has them. */
const GROUPS = (): [string, string[]][] => [
  [L('Open chords', 'Offene Akkorde'), ['Em', 'E', 'Am', 'A', 'C', 'G', 'D', 'Dm']],
  [L('Sevenths', 'Septakkorde'), ['E7', 'A7', 'D7', 'G7', 'C7', 'B7', 'Am7', 'Em7', 'Dm7', 'Cmaj7', 'Fmaj7', 'Gmaj7', 'Dmaj7']],
  [L('Colours', 'Farben'), ['Cadd9', 'Dsus4', 'Dsus2', 'Asus4', 'Asus2', 'A7sus4', 'D69', 'F#m7b5', 'Bm7b5']],
  [L('Small barre and small shapes', 'Kleines Barré und kleine Griffe'), ['F', 'F#m-easy', 'Bm-easy']],
  [L('Full barre', 'Großes Barré'), ['F#m', 'Bm', 'Fm', 'F#', 'Gm', 'G#m', 'Ab', 'Bb', 'B', 'Cm', 'C#m', 'Db']],
  [L('Power chords', 'Powerchords'), ['E5', 'A5', 'D5', 'G5', 'C5', 'F5', 'B5']],
];

export const chordLibrary: Screen = (root) => {
  const piano = store.settings.instrument === 'piano';
  const card = (id: string): string => {
    const lv = store.skills.level(chordKey(id, piano));
    const fig = piano ? keyChord(id, LEARN, { x: 6, y: 8, w: 228, h: 120, names: false }) : chordBox(CHORDS[id], 40, 30, 150, LEARN, false, undefined, 34);
    return `<a class="chordcard" href="#/${piano ? 'keys' : 'chord'}/${encodeURIComponent(id)}"><b>${esc(chordName(id, piano))}</b><svg viewBox="0 0 240 ${piano ? 136 : 210}" role="img" aria-label="${esc(chordName(id, piano))}">${fig}</svg><span>${pips(lv)}</span></a>`;
  };
  const groups: [string, string[]][] = piano
    ? [
        [L('The first six: white keys only', 'Die ersten sechs: nur weiße Tasten'), KEY_CHORDS],
        [L('With black keys, and sevenths', 'Mit schwarzen Tasten, und Septakkorde'), KEY_CHORDS_ON],
      ]
    : GROUPS();
  root.innerHTML = `<div class="page">
    <div class="back"><a class="btn quiet" href="#/">${L('← Home', '← Start')}</a></div>
    <div><p class="kick">${L('Chord library', 'Griffbibliothek')}</p><h1>${piano ? L('Every chord, as keys.', 'Jeder Akkord, als Tasten.') : L('Every shape the app knows.', 'Jeder Griff, den die App kennt.')}</h1>
      <p class="lede">${L('The bars under each one are your level for it. Pick one to check it: the app listens.', 'Die Balken unter jedem sind deine Stufe dafür. Wähl einen, um ihn zu prüfen: Die App hört zu.')}</p></div>
    ${groups.map(([title, ids]) => `<section><h2 class="h2">${esc(title)}</h2><div class="chordgrid">${ids.filter((c) => piano || CHORDS[c]).map(card).join('')}</div></section>`).join('')}
  </div>`;
};
