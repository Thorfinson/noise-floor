/**
 * The tools: what a player reaches for outside the lessons. A page of them for the instrument in use, and
 * the tools of their own here: a metronome (with the beats of a bar, a subdivision and tap tempo), the chord
 * library to look a shape up in, and a drone to sing against or play over.
 */
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { chordKey } from '../music/difficulty';
import { KEY_CHORDS, KEY_CHORDS_ON } from '../music/content';
import { chordName, CHORDS, NOTE_NAMES } from '../music/theory';
import { $, $$, esc, keys, type Screen } from '../ui/dom';
import { chordBox, keyChord, LEARN } from '../ui/draw';
import { frame } from './learn';
import { pips } from './home';

interface Tool {
  href: string;
  name: string;
  about: string;
}

/** The tools of each instrument, the most used first. */
function toolsFor(): Tool[] {
  const inst = store.settings.instrument;
  const common: Tool[] = [
    { href: '#/check', name: L('Hearing check', 'Hörcheck'), about: L('Two minutes: how well the app hears your instrument, your microphone and your room, and what to change.', 'Zwei Minuten: wie gut die App dein Instrument, dein Mikrofon und deinen Raum hört, und was du ändern kannst.') },
    { href: '#/metronome', name: L('Metronome', 'Metronom'), about: L('The beat to play to: tempo, beats in a bar, a subdivision, tap tempo.', 'Der Schlag zum Mitspielen: Tempo, Schläge pro Takt, Unterteilung, Tempo antippen.') },
    { href: '#/drone', name: L('Drone', 'Bordunton'), about: L('A note held under you, with its fifth: to sing against, or to play freely over.', 'Ein Ton, der unter dir liegt, mit seiner Quinte: zum Dagegensingen oder zum freien Spielen darüber.') },
    { href: '#/jam', name: L('Play freely', 'Frei spielen'), about: L('Five notes over a drone or a chord: whatever you play, the app shows what it heard, no score.', 'Fünf Töne über einem Bordun oder einem Akkord: Was du spielst, zeigt die App, ohne Wertung.') },
  ];
  if (inst === 'voice')
    return [
      { href: '#/range', name: L('Your range', 'Dein Stimmumfang'), about: L('The lowest and the highest note you sing comfortably; songs are moved into it.', 'Der tiefste und der höchste Ton, die du bequem singst; Songs werden hineingelegt.') },
      { href: '#/match', name: L('Match the tone', 'Töne treffen'), about: L('Five notes sung back, measured in cents.', 'Fünf Töne nachgesungen, in Cent gemessen.') },
      { href: '#/hold', name: L('Hold a tone', 'Einen Ton halten'), about: L('Five seconds on one note, as steady as you can.', 'Fünf Sekunden auf einem Ton, so ruhig wie möglich.') },
      { href: '#/ear', name: L('Intervals', 'Intervalle'), about: L('A note given, the distance named: sing the second.', 'Ein Ton gegeben, der Abstand genannt: Sing den zweiten.') },
      ...common,
    ];
  const piano = inst === 'piano';
  return [
    piano ? { href: '#/tuner/piano', name: L('Piano pitch', 'Tonhöhe des Klaviers'), about: L('Where your piano’s A is, so that the app hears it right.', 'Wo das A deines Klaviers liegt, damit die App richtig hört.') } : { href: '#/tuner', name: L('Guitar tuner', 'Stimmgerät'), about: L('String by string, which way to turn.', 'Saite für Saite, in welche Richtung du drehst.') },
    { href: '#/chords', name: L('Chord library', 'Griffbibliothek'), about: piano ? L('Every chord as keys, with fingers; pick one to check it.', 'Jeder Akkord als Tasten, mit Fingern; wähl einen, um ihn zu prüfen.') : L('Every shape the app knows, with fingers; pick one to check it string by string.', 'Jeder Griff, den die App kennt, mit Fingern; wähl einen, um ihn Saite für Saite zu prüfen.') },
    ...(piano ? [] : [{ href: '#/singalongs', name: L('Sing and play', 'Singen und spielen'), about: L('The chords of a song over its words: accompany yourself; the app hears the guitar.', 'Die Akkorde eines Songs über seinem Text: Begleite dich selbst; die App hört die Gitarre.') }]),
    ...(piano ? [] : [{ href: '#/strum', name: L('Strumming', 'Schlagmuster'), about: L('Patterns of the right hand: muted, on one chord, with a change.', 'Muster der rechten Hand: abgedämpft, auf einem Akkord, mit Wechsel.') }]),
    { href: '#/ear', name: L('By ear', 'Nach Gehör'), about: L('Motifs of your song played back, chords told apart.', 'Motive deines Songs nachgespielt, Akkorde unterschieden.') },
    ...(piano ? [] : [{ href: '#/slur', name: L('Hammer-on and pull-off', 'Hammer-on und Pull-off'), about: L('Notes the left hand makes sound without a pluck: six patterns, the app hears whether each note sounds.', 'Töne, die die linke Hand ohne Zupfen zum Klingen bringt: sechs Muster, die App hört, ob jeder Ton klingt.') }]),
    { href: '#/rhythm', name: L('Reading rhythm', 'Rhythmus lesen'), about: L('Note values from quarters to sixteenths, played with the click: six levels.', 'Notenwerte von Vierteln bis Sechzehnteln, mit dem Klick gespielt: sechs Stufen.') },
    { href: '#/compose', name: L('Your own song', 'Dein eigener Song'), about: L('A chord progression of your own, heard, kept and learned like any song.', 'Eine eigene Akkordfolge, angehört, behalten und gelernt wie jeder Song.') },
    { href: '#/import', name: L('A tab or a melody', 'Eine Tabulatur oder Melodie'), about: piano ? L('A melody of your own, typed by its note names.', 'Eine eigene Melodie, nach Notennamen eingetippt.') : L('A tab found elsewhere, pasted in.', 'Eine Tabulatur von anderswo, eingefügt.') },
    { href: '#/stride', name: L('Rhythm game', 'Rhythmusspiel'), about: L('Stepping stones in time with the click.', 'Trittsteine im Takt mit dem Klick.') },
    ...common,
  ];
}

export const toolsPage: Screen = (root) => {
  const inst = store.settings.instrument;
  const name = { guitar: L('Guitar', 'Gitarre'), piano: L('Piano', 'Klavier'), voice: L('Voice', 'Stimme') }[inst];
  root.innerHTML = `<div class="page">
    <div><p class="kick">${L(`Tools · ${name}`, `Werkzeuge · ${name}`)}</p><h1>${L('What you reach for between lessons.', 'Was du zwischen den Lektionen brauchst.')}</h1></div>
    <div class="cards">${toolsFor().map((t) => `<a class="card" href="${t.href}"><h2>${esc(t.name)}</h2><p>${esc(t.about)}</p></a>`).join('')}</div>
  </div>`;
};

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
    ['#/tools', L('Tools', 'Werkzeuge')],
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
    ['#/tools', L('Tools', 'Werkzeuge')],
  );
  const show = (): void => void ($('#dname', root).textContent = `${NOTE_NAMES[root12]}${fifth ? ` + ${NOTE_NAMES[(root12 + 7) % 12]}` : ''}`);
  const sound = (): void => {
    if (on) engine.drone(fifth ? [base(), base() + 7] : [base()], 0.4);
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
    <div><a class="btn quiet" href="#/tools">${L('← Tools', '← Werkzeuge')}</a></div>
    <div><p class="kick">${L('Chord library', 'Griffbibliothek')}</p><h1>${piano ? L('Every chord, as keys.', 'Jeder Akkord, als Tasten.') : L('Every shape the app knows.', 'Jeder Griff, den die App kennt.')}</h1>
      <p class="lede">${L('The bars under each one are your level for it. Pick one to check it: the app listens.', 'Die Balken unter jedem sind deine Stufe dafür. Wähl einen, um ihn zu prüfen: Die App hört zu.')}</p></div>
    ${groups.map(([title, ids]) => `<section><h2 class="h2">${esc(title)}</h2><div class="chordgrid">${ids.filter((c) => piano || CHORDS[c]).map(card).join('')}</div></section>`).join('')}
  </div>`;
};
