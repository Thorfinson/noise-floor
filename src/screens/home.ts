/** Home, progress and settings: the plain pages. */
import { encodeWav } from '../audio/wav';
import { engine } from '../audio/engine';
import { dayMonth, L, lang, num, setLang } from '../core/i18n';
import { KINDS, kindOf, type SkillKind } from '../core/skills';
import { store, type Instrument } from '../core/store';
import { allPieces, findPiece, findSong } from '../music/content';
import { chordName, CHORDS, noteName } from '../music/theory';
import { $, $$, applyScale, cap, esc, go, hear, icon, keys, micMeter, type Screen } from '../ui/dom';
import { chordBox, LEARN } from '../ui/draw';
import { describe, pieceMaterial } from '../music/material';
import { currentPiece, currentSong, currentSongToSing, pieceProfile, songProfile } from '../music/difficulty';
import { rangeMeasured, voiceRange } from './sing';
import { begun, bindChoose, chooseRow, currentId, dayOf, describeSung, doneToday, focusChord, fullPlan, instrumentOf, plan, resumeAt, setPlanned, songChoices, todaysChords, todaysKeyChords, type Step } from './session';

import { cleanStrings, skillLabel } from '../music/labels';
import { bindPlan, planCard, weekLine } from './habit';
import { trendsPage, weekStats } from './trends';
import { relDay } from '../music/review';
import { askAgain, chooseFile, fileState, forgetFile, takeNewer } from '../core/progressfile';
import { clearTakes } from '../core/takes';
import { TUNINGS } from '../music/tuning';
import { dayStart } from '../core/days';
import { weekHome } from './today';

export { skillLabel };

export const pips = (level: number, cls = 'on'): string => `<span class="pips" role="img" aria-label="${L(`level ${level} of 5`, `Stufe ${level} von 5`)}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= level ? cls : ''}"></i>`).join('')}</span>`;

/** Shows the page again after something it depends on has changed. */
const refresh = (): void => void dispatchEvent(new HashChangeEvent('hashchange'));
/** The plan on show as a list to change: which steps the player keeps. Kept while the app is open. */
let editingPlan = false;

/** Home is today's session: one clear place to start, everything else underneath. */
export const home: Screen = (root) => {
  const now = Date.now();
  const inst = store.settings.instrument;
  // the guitar's day is built around the song of the week
  if (inst === 'guitar') return weekHome(root, inst, now);
  const piano = inst === 'piano';
  const voice = inst === 'voice';
  const steps = plan();
  const minutes = steps.reduce((sum, st) => sum + st.minutes, 0);
  // a session left half-way today goes on where it stopped
  const at = Math.min(resumeAt(inst, now), steps.length - 1);
  const left = steps.slice(at).reduce((sum, st) => sum + st.minutes, 0);
  const played = Object.keys(store.skills.data);
  const pieceIds = piano ? new Set(allPieces().map((p) => p.id)) : new Set<string>();
  const first = voice ? !played.some((k) => k.startsWith('pitch:') || k.startsWith('tone:') || k.startsWith('sing:') || k.includes('~voice')) && !rangeMeasured() : piano ? !played.some((k) => k.startsWith('finger:piano') || k.startsWith('scale:') || k.startsWith('chord:p.') || (k.startsWith('bar:') && pieceIds.has(k.split(':')[1]))) : store.sessions.length === 0;
  const chord = focusChord();
  const piece = currentPiece();
  const song = currentSong();
  const sung = currentSongToSing();
  // today's goal on the guitar: the chords of today's check that have not rung clean yet, otherwise the slowest of them
  const today = piano || voice ? [] : todaysChords(now);
  const fresh = today.filter((c) => store.skills.level('chord:' + c) < 1).map((c) => CHORDS[c].name);
  const slowest = today[today.length - 1] ?? chord;
  const freshList = fresh.length > 1 ? fresh.slice(0, -1).join(', ') + L(' and ', ' und ') + fresh[fresh.length - 1] : fresh[0];
  const under = store.skills.next('chord:' + slowest)?.value ?? 5;
  const near = store.skills.next('pitch:match')?.value;
  const goal = voice
    ? !rangeMeasured()
      ? L(`your range found, then the first phrases of ${sung.title}`, `dein Umfang gefunden, dann die ersten Phrasen von ${sung.title}`)
      : L(`tones sung back${near ? ` within ${near} cents on average` : ''}, and ${sung.title}: ${describeSung(sung.id)}`, `Töne nachgesungen${near ? ` auf durchschnittlich ${near} Cent genau` : ''}, und ${sung.title}: ${describeSung(sung.id)}`)
    : piano
    ? L(`${piece.title}: ${describe(pieceMaterial(piece)).toLowerCase()}`, `${piece.title}: ${describe(pieceMaterial(piece))}`)
    : fresh.length
      ? L(`every string of ${freshList} rings clean`, `${freshList} ${fresh.length > 1 ? 'klingen' : 'klingt'} auf jeder Saite sauber`)
      : L(`${CHORDS[slowest].name} with all strings clean in under ${under} seconds`, `${CHORDS[slowest].name} mit allen Saiten sauber in unter ${String(under).replace('.', ',')} Sekunden`);
  const intro = voice
    ? L(
        'The app leads you through it. First it finds your range: a low note and a high one, both comfortable, and every song is moved into it. Then come five tones to sing back, a short game of sung patterns and two phrases of a song, with its words or in solfège (do re mi). Any octave counts. Nothing starts before you are ready, and nothing leaves your computer.',
        'Die App führt dich hindurch. Zuerst findet sie deinen Umfang: einen tiefen und einen hohen Ton, beide bequem, und jeder Song wird hineingelegt. Dann kommen fünf Töne zum Nachsingen, ein kurzes Spiel mit gesungenen Mustern und zwei Phrasen eines Songs, mit Text oder in Solmisation (do re mi). Jede Oktave zählt. Nichts beginnt, bevor du bereit bist, und nichts verlässt deinen Computer.',
      )
    : piano
    ? L(
        'The app leads you through it. It listens to how your piano is tuned and gets the hand ready for the piece of the day: a short game for the fingers before a tune, the chords key by key before a piece of chords. Then come two phrases of the piece. Nothing starts before you are ready. You need the piano and the microphone, nothing else.',
        'Die App führt dich hindurch. Sie hört, wie dein Klavier gestimmt ist, und macht die Hand bereit für das Stück des Tages: ein kurzes Spiel für die Finger vor einer Melodie, die Akkorde Taste für Taste vor einem Stück aus Akkorden. Dann kommen zwei Phrasen des Stücks. Nichts beginnt, bevor du bereit bist. Du brauchst das Klavier und das Mikrofon, sonst nichts.',
      )
    : L(
        'The app leads you through it. It tunes the guitar with you and checks the chords of today\'s lines string by string. Then come a short game with those chords and two lines of the song. The hard chord waits at the end, if you like. Nothing starts before you are ready.',
        'Die App führt dich hindurch. Sie stimmt die Gitarre mit dir und prüft die Akkorde der heutigen Zeilen Saite für Saite. Dann kommen ein kurzes Spiel mit diesen Akkorden und zwei Zeilen des Songs. Der schwere Akkord wartet am Ende, wenn du magst. Nichts beginnt, bevor du bereit bist.',
      );
  // the ids in a link may come from a song of the player's own (or a backup): escaped like any text
  const link = (href: string, label: string): string => `<a class="hb" href="#/${esc(href)}">${esc(label)}</a>`;
  // today's session is through: the page says so, shows what was measured today, and offers more
  if (doneToday(inst, now) && !at) return doneHome(root, now, link);
  const heading = first
    ? L(`Your first session: about ${minutes} minutes.`, `Deine erste Session: etwa ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}.`)
    : at
      ? L(`On with step ${at + 1}: ${steps[at].title}.`, `Weiter mit Schritt ${at + 1}: ${steps[at].title}.`)
      : cap(goal) + '.';
  const tile = (href: string, title: string, sub: string, pic: string, tool = ''): string => `<a class="tile2" href="#/${esc(href)}"${tool ? ` data-toolbox="${tool}"` : ''}><span class="pic">${pic}</span><span><b>${esc(title)}</b><small>${esc(sub)}</small></span></a>`;
  root.innerHTML = `<div class="page bare todayp">
    ${fileBanner()}
    <section class="paper herosheet">
      <p class="kick">${first ? L('Start here', 'Fang hier an') : at ? L(`Today · ${left} ${left === 1 ? 'minute' : 'minutes'} left`, `Heute · noch ${left} ${left === 1 ? 'Minute' : 'Minuten'}`) : L(`Today · about ${minutes} minutes`, `Heute · etwa ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`)}</p>
      <h1>${esc(heading)}</h1>
      ${first ? `<p class="lede">${intro}</p>` : at ? `<p class="lede">${L(`You stopped after step ${at}. The steps before it are done.`, `Du hast nach Schritt ${at} aufgehört. Die Schritte davor sind erledigt.`)}</p>` : `<p class="weekrow">${weekLine(now)}</p>`}
      <div class="row heroacts"><a class="btn primary big" id="go" href="#/session">${at ? L(`Continue at step ${at + 1}`, `Weiter mit Schritt ${at + 1}`) : L("Start today's session", 'Heutige Session starten')} <kbd>${L('Space', 'Leertaste')}</kbd></a>${at ? `<a class="btn big" id="anew" href="#/session/new">${L('Start from step 1', 'Ab Schritt 1 beginnen')}</a>` : `<a class="btn big" id="short" href="#/session/short" title="${L('The first step and the song: five minutes count as fully as a whole session.', 'Der erste Schritt und der Song: Fünf Minuten zählen so voll wie eine ganze Session.')}">${L('Only 5 minutes', 'Nur 5 Minuten')}</a>`}</div>
      ${first ? '' : weekNote(inst, now)}
    </section>
    <section class="paper routesheet" aria-labelledby="routeh">
      <div class="sectitle"><h2 id="routeh">${L("Today's route", 'Der Weg von heute')}</h2>${editingPlan && !at ? '' : at ? '' : `<button class="btn quiet" id="editplan">${L('Change the plan', 'Plan ändern')}</button>`}</div>
      ${
        editingPlan && !at
          ? `<ol class="plan editing" aria-label="${L('The steps of your plan', 'Die Schritte deines Plans')}">${fullPlan(now)
              .map((st) => {
                const on = !(store.planOff[inst] ?? []).includes(st.kind);
                return `<li class="${on ? '' : 'off'}"><label class="pl"><input type="checkbox" data-kind="${esc(st.kind)}"${on ? ' checked' : ''}><div><b>${esc(st.title)}</b><small>${esc(st.detail)}</small></div></label><span class="t">${st.minutes} min</span></li>`;
              })
              .join('')}</ol>
            <p class="note">${L('Leave out what you do not need: the plan stays so every day until you bring a step back. The app still fills each step from what it measured.', 'Lass weg, was du nicht brauchst: Der Plan bleibt jeden Tag so, bis du einen Schritt zurückholst. Die App füllt jeden Schritt weiter aus dem, was sie gemessen hat.')}</p>
            <div class="row"><button class="btn" id="plandone">${L('Done', 'Fertig')}</button></div>`
          : `<ol class="plan route" aria-label="${L("Today's steps", 'Heutige Schritte')}">${steps.map((st, i) => `<li class="${i < at ? 'done' : i === at ? 'cur' : ''}"><span class="n">${i < at ? icon('check') : i + 1}</span><span class="pic" aria-hidden="true">${stepPicture(st)}</span><div><b>${esc(st.title)}</b><small>${esc(st.detail)}</small></div><span class="t">${st.minutes} min</span></li>`).join('')}</ol>${!at && (store.planOff[inst] ?? []).length ? `<p class="note planrow">${L(`${(store.planOff[inst] ?? []).length} left out by you`, `${(store.planOff[inst] ?? []).length} von dir weggelassen`)}</p>` : ''}${!at && !begun(currentId(inst)) ? chooseRow(songChoices(inst), currentId(inst)) : ''}`
      }
    </section>
    <div class="todaylow">
      <section class="paper alone" aria-labelledby="aloneh">
        <div class="sectitle"><h2 id="aloneh">${L('Or one thing on its own', 'Oder eine Übung für sich')}</h2><a href="#/songs">${piano ? L('All pieces', 'Alle Stücke') : L('All songs', 'Alle Songs')}</a></div>
        <nav class="tiles2" aria-label="${L('Single exercises', 'Einzelne Übungen')}">
          ${
            voice
              ? tile('sing/' + encodeURIComponent(sung.id), sung.title, L('Your song', 'Dein Song'), PIC.song) + tile('match', L('Match the tone', 'Töne treffen'), L('Five notes sung back', 'Fünf Töne nachgesungen'), PIC.ear) + tile('hold', L('Hold a tone', 'Einen Ton halten'), L('Five seconds, steady', 'Fünf Sekunden, ruhig'), PIC.hold) + tile('range', rangeMeasured() ? L(`Your range: ${noteName(voiceRange()[0])} to ${noteName(voiceRange()[1])}`, `Dein Umfang: ${noteName(voiceRange()[0])} bis ${noteName(voiceRange()[1])}`) : L('Find your range', 'Deinen Umfang finden'), L('Low and high, both easy', 'Tief und hoch, beide bequem'), PIC.range)
              : piano
                ? tile('songs/' + encodeURIComponent(piece.id), piece.title, L('Your piece', 'Dein Stück'), PIC.song) + tile('tuner/piano', L('Piano pitch', 'Tonhöhe des Klaviers'), L('Where its A is', 'Wo sein A liegt'), PIC.tune, 'tuner/piano') + tile('keys/' + encodeURIComponent(todaysKeyChords(now)[0] ?? 'C'), L('Chord check', 'Akkord-Check'), L('Key by key', 'Taste für Taste'), PIC.keys)
                : tile('songs/' + encodeURIComponent(song.id), song.title, L('Your song', 'Dein Song'), chordChips(songChords(song.id))) + tile('tuner', L('Guitar tuner', 'Stimmgerät für die Gitarre'), L('String by string', 'Saite für Saite'), PIC.tune, 'tuner') + tile('chord/' + encodeURIComponent(chord), L('Chord check', 'Akkord-Check'), L('Any chord, string by string', 'Jeder Griff, Saite für Saite'), miniBox(chord, 56))
          }${tile('stride', L('Stepping stones', 'Trittsteine'), L('The rhythm game', 'Das Rhythmusspiel'), PIC.stones)}
        </nav>
        <p class="note">${engine.running ? (engine.micOn ? L('Microphone is on.', 'Das Mikrofon ist an.') : L('Listening to the practice instrument only.', 'Hört nur auf das Übungsinstrument.')) : L('The microphone starts when you begin.', 'Das Mikrofon startet, wenn du beginnst.')}</p>
      </section>
      ${planCard()}
    </div>
  </div>`;
  bindPlan(root, refresh);
  bindFileBanner(root);
  // the player's own plan: steps left out or brought back, and the song chosen among the next ones
  const edit = root.querySelector<HTMLButtonElement>('#editplan');
  if (edit)
    edit.onclick = () => {
      editingPlan = true;
      refresh();
    };
  const done = root.querySelector<HTMLButtonElement>('#plandone');
  if (done)
    done.onclick = () => {
      editingPlan = false;
      refresh();
    };
  $$<HTMLInputElement>('.plan.editing input[data-kind]', root).forEach(
    (b) =>
      (b.onchange = () => {
        setPlanned(b.dataset.kind!, b.checked);
        refresh();
      }),
  );
  bindChoose(root, inst, () => refresh());
  $$('[data-inst]', root).forEach(
    (b) =>
      (b.onclick = () => {
        store.settings.instrument = b.dataset.inst as Instrument;
        store.save();
        refresh();
      }),
  );
  return keys({ ' ': () => go('/session'), Enter: () => go('/session') });
};

/** A chord picture the size of a thumbnail. */
function miniBox(id: string, w = 52): string {
  const c = CHORDS[id];
  return c ? `<svg viewBox="0 0 240 210" width="${w}" role="img" aria-label="${esc(c.name)}">${chordBox(c, 40, 30, 150, LEARN, false, undefined, 34)}</svg>` : `<b class="chipn">${esc(id)}</b>`;
}
const chordChips = (ids: string[], piano = false): string => `<span class="chips2">${ids.slice(0, 4).map((c) => `<b class="chipn">${esc(chordName(c, piano))}</b>`).join('')}</span>`;
function songChords(id: string): string[] {
  try {
    return songProfile(findSong(id)).chords;
  } catch {
    return [];
  }
}
function pieceChords(id: string): string[] {
  try {
    return pieceProfile(findPiece(id)).chords;
  } catch {
    return [];
  }
}
/** Small drawings for what a step or a tile is about, in the ink of the page. */
const PIC = {
  tune: '<svg viewBox="0 0 140 70" width="120"><line x1="10" y1="34" x2="130" y2="34" stroke="#bfb2a2" stroke-width="2"/><line x1="10" y1="26" x2="10" y2="42" stroke="#8d8791" stroke-width="2"/><line x1="130" y1="26" x2="130" y2="42" stroke="#8d8791" stroke-width="2"/><rect x="56" y="20" width="28" height="28" rx="6" fill="none" stroke="#2e8b6a" stroke-width="2.5"/><line x1="78" y1="12" x2="78" y2="56" stroke="#26262e" stroke-width="2.5"/></svg>',
  ear: '<svg viewBox="0 0 120 70" width="96"><path d="M20 40c0-16 10-26 22-26s22 10 22 24c0 9-5 13-10 17-4 3-5 7-9 9-6 3-12-1-12-7" fill="none" stroke="#26262e" stroke-width="3" stroke-linecap="round"/><path d="M80 24c6 6 6 18 0 24M92 16c10 10 10 30 0 40" fill="none" stroke="#8d8791" stroke-width="3" stroke-linecap="round"/></svg>',
  hold: '<svg viewBox="0 0 140 70" width="120"><rect x="14" y="30" width="112" height="10" rx="5" fill="#e3d8c8"/><path d="M14 35c12-3 22 3 34 0s22-3 34 0 22 3 44 0" fill="none" stroke="#26262e" stroke-width="2.5"/></svg>',
  range: '<svg viewBox="0 0 140 70" width="120"><rect x="20" y="50" width="34" height="8" rx="4" fill="#26262e"/><rect x="86" y="12" width="34" height="8" rx="4" fill="#26262e"/><path d="M54 54 86 16" stroke="#8d8791" stroke-width="2" stroke-dasharray="4 4"/></svg>',
  song: '<svg viewBox="0 0 120 70" width="90"><path d="M40 52V16l50-8v36" fill="none" stroke="#26262e" stroke-width="3"/><circle cx="32" cy="52" r="9" fill="#26262e"/><circle cx="82" cy="45" r="9" fill="#26262e"/></svg>',
  keys: '<svg viewBox="0 0 140 70" width="120"><rect x="10" y="10" width="120" height="50" rx="4" fill="#fffdf8" stroke="#b9ab99" stroke-width="1.5"/><path d="M27 10v50M44 10v50M61 10v50M78 10v50M95 10v50M112 10v50" stroke="#b9ab99" stroke-width="1.2"/><path d="M22 10h10v30H22zM39 10h10v30H39zM73 10h10v30H73zM90 10h10v30H90zM107 10h10v30h-10z" fill="#26262e"/><rect x="11" y="44" width="15" height="15" fill="#1e6aa8"/></svg>',
  stones: '<svg viewBox="0 0 140 70" width="120"><path d="M6 44h128" stroke="#9fc4bd" stroke-width="2"/><ellipse cx="26" cy="50" rx="14" ry="5" fill="#26262e"/><ellipse cx="62" cy="50" rx="14" ry="5" fill="#26262e"/><ellipse cx="98" cy="50" rx="14" ry="5" fill="#26262e" opacity=".55"/><circle cx="26" cy="24" r="6" fill="#26262e"/><path d="M26 30v12M20 34l-6 4" stroke="#26262e" stroke-width="3" stroke-linecap="round"/><circle cx="36" cy="22" r="3" fill="#f2b24a"/></svg>',
  strum: '<svg viewBox="0 0 140 70" width="120"><path d="M24 12v40m-9-12 9 13 9-13M60 12v40m-9-12 9 13 9-13M96 56V18m-9 11 9-13 9 13" fill="none" stroke="#26262e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  game: '<svg viewBox="0 0 140 70" width="120"><path d="M58 64l4-46h10l4 46zM60 18v-8h14v8M67 10V4" fill="none" stroke="#26262e" stroke-width="2.5" stroke-linejoin="round"/><path d="M74 14 132 4M60 14 8 4" stroke="#f2b24a" stroke-width="3" opacity=".7"/></svg>',
};
/** The picture of a step of the session: its chords, its song, or what it trains. */
export function stepPicture(st: Step): string {
  const piano = store.settings.instrument === 'piano';
  const pair = (a: string, b: string): string => `<span class="boxes">${miniBox(a, 44)}<svg viewBox="0 0 24 24" width="16"><path d="M4 12h14m-5-5 5 5-5 5" stroke="#26262e" stroke-width="2" fill="none" stroke-linecap="round"/></svg>${miniBox(b, 44)}</span>`;
  // the steps of the guitar's week: warm up on a song, a focus (a chord, a change or a pattern), the song, the encore
  if (!piano && store.settings.instrument === 'guitar')
    switch (st.kind) {
      case 'warm': {
        const ids = songChords(st.params[1] ?? '');
        return ids.length ? chordChips(ids) : PIC.tune;
      }
      case 'focus':
        if (st.params.length === 2 && CHORDS[st.params[0]] && CHORDS[st.params[1]]) return pair(st.params[0], st.params[1]);
        if (CHORDS[st.params[0]]) return miniBox(st.params[0], 58);
        return PIC.strum;
      case 'new':
      case 'encore': {
        const ids = st.params[0] === 'changes' ? [] : songChords(st.params[0] ?? '');
        return ids.length ? chordChips(ids) : PIC.game;
      }
    }
  switch (st.kind) {
    case 'tune':
    case 'pitch':
      return PIC.tune;
    case 'chords':
      return piano ? chordChips(st.params, true) : `<span class="boxes">${st.params.slice(0, 3).map((c) => miniBox(c)).join('')}</span>`;
    case 'barre':
      return miniBox(st.params[0] ?? 'F', 58);
    case 'changes': {
      const two = piano ? [] : todaysChords(Date.now()).slice(0, 2);
      return two.length === 2 ? `<span class="boxes">${miniBox(two[0], 44)}<svg viewBox="0 0 24 24" width="16"><path d="M4 12h14m-5-5 5 5-5 5" stroke="#26262e" stroke-width="2" fill="none" stroke-linecap="round"/></svg>${miniBox(two[1], 44)}</span>` : PIC.game;
    }
    case 'song':
    case 'visit': {
      const id = st.params[0] ?? '';
      const ids = piano ? pieceChords(id) : store.settings.instrument === 'voice' ? [] : songChords(id);
      return ids.length ? chordChips(ids, piano) : PIC.song;
    }
    case 'strum':
      return PIC.strum;
    case 'ear':
    case 'intervals':
    case 'match':
      return PIC.ear;
    case 'warm':
      return PIC.hold;
    case 'range':
      return PIC.range;
    default:
      return PIC.game;
  }
}

/** On the start page: a progress file saved later on another computer, or one the browser must allow again. */
function fileBanner(): string {
  const f = fileState();
  if (f.newer)
    return `<div class="filebar" role="status"><p>${L(`Your progress file is newer than this browser: saved ${dayMonth(f.newer)} at ${new Date(f.newer).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })}, on another computer perhaps.`, `Deine Fortschrittsdatei ist neuer als dieser Browser: gespeichert am ${dayMonth(f.newer)} um ${new Date(f.newer).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })}, vielleicht auf einem anderen Computer.`)}</p><div class="row"><button class="btn primary" id="filetake">${L('Load it', 'Laden')}</button><button class="btn quiet" id="filekeep">${L('Keep this browser’s', 'Die dieses Browsers behalten')}</button></div></div>`;
  // the name of the file is the player's (or a backup's): escaped like any text
  if (f.status === 'ask') return `<div class="filebar" role="status"><p>${L(`Your progress is kept in ${esc(f.name)}: the browser asks before the app may use it again.`, `Dein Fortschritt wird in ${esc(f.name)} gehalten: Der Browser fragt, bevor die App sie wieder nutzen darf.`)}</p><div class="row"><button class="btn" id="fileallow">${L('Allow', 'Erlauben')}</button></div></div>`;
  if (f.unreadable) return `<div class="filebar" role="status"><p>${L(`Your progress file ${esc(f.name)} could not be read. Perhaps it is still being synced from another computer: the app writes nothing into it until it can be read.`, `Deine Fortschrittsdatei ${esc(f.name)} ließ sich nicht lesen. Vielleicht wird sie gerade noch von einem anderen Computer synchronisiert: Die App schreibt nichts hinein, bis sie sich lesen lässt.`)}</p><div class="row"><button class="btn primary" id="fileretry">${L('Read it again', 'Noch einmal lesen')}</button><button class="btn quiet" id="fileover">${L('Write this browser’s progress into it', 'Den Fortschritt dieses Browsers hineinschreiben')}</button></div></div>`;
  return '';
}
function bindFileBanner(root: HTMLElement): void {
  const on = (id: string, fn: () => Promise<unknown>): void => {
    const b = root.querySelector<HTMLButtonElement>('#' + id);
    if (b) b.onclick = () => void fn().then(refresh);
  };
  on('filetake', () => takeNewer(true));
  on('filekeep', () => takeNewer(false));
  on('fileallow', () => askAgain());
  on('fileretry', () => askAgain());
  on('fileover', () => takeNewer(false));
}

/** The week in a line under the start: minutes, new best values, the repertoire; and where to see more. */
function weekNote(inst: Instrument, now: number): string {
  const w = weekStats(inst, now);
  const rep = Object.keys(store.reviews).filter((k) => k.startsWith(inst + ':')).length;
  const parts = [L(`${w.minutes} minutes played this week`, `${w.minutes} Minuten gespielt diese Woche`), ...(w.bests ? [L(`${w.bests} new best ${w.bests === 1 ? 'value' : 'values'}`, `${w.bests} neue Bestwerte`)] : []), ...(rep ? [L(`${rep} in your repertoire`, `${rep} im Repertoire`)] : [])];
  return `<p class="note weeknote">${esc(parts.join(' · '))} · <a href="#/trends">${L('over the weeks', 'über die Wochen')}</a></p>`;
}

/**
 * The start page once today's session is through: done, what was measured today and how far it got, and
 * what can still be done: another round, a game, a song of your choice. Tomorrow the plan is new.
 */
function doneHome(root: HTMLElement, now: number, link: (href: string, label: string) => string): () => void {
  const inst = store.settings.instrument;
  const today = dayOf(now);
  const measured = Object.entries(store.skills.data)
    .filter(([key, r]) => r.last && dayOf(r.last) === today && instrumentOf(key) === inst)
    .sort((a, b) => b[1].last - a[1].last);
  const top = measured.slice(0, 8);
  const songsLabel = inst === 'piano' ? L('Choose a piece', 'Ein Stück wählen') : L('Choose a song', 'Einen Song wählen');
  root.innerHTML = `<div class="page bare todayp">
    <section class="paper herosheet">
      <p class="kick">${L('Today · done', 'Heute · geschafft')}</p>
      <h1>${L("Today's session is done.", 'Die heutige Session ist geschafft.')}</h1>
      <p class="weekrow">${weekLine(now)}</p>
      <p class="lede">${measured.length ? L(`Measured today: ${measured.length} ${measured.length === 1 ? 'skill' : 'skills'}. Everything is kept on this computer; tomorrow's plan takes up what needs it most.`, `Heute gemessen: ${measured.length} ${measured.length === 1 ? 'Fähigkeit' : 'Fähigkeiten'}. Alles bleibt auf diesem Computer gespeichert; der Plan für morgen greift auf, was es am meisten braucht.`) : L("Everything is kept on this computer; tomorrow's plan takes up what needs it most.", 'Alles bleibt auf diesem Computer gespeichert; der Plan für morgen greift auf, was es am meisten braucht.')} ${L('If you want more today:', 'Wenn du heute noch mehr willst:')}</p>
      <div class="row heroacts"><a class="btn primary big" id="go" href="#/session/new">${L('Another round', 'Noch eine Runde')} <kbd>${L('Space', 'Leertaste')}</kbd></a><a class="btn big" href="#/nf">${L('Play a game', 'Ein Spiel spielen')}</a><a class="btn big" href="#/songs">${songsLabel}</a></div>
      ${weekNote(inst, now)}
    </section>
    <div class="todaylow">
      <section class="paper donecard" aria-label="${L('Measured today', 'Heute gemessen')}">
        <div class="sectitle"><h2>${L('Measured today', 'Heute gemessen')}</h2><a href="#/progress">${L('Everything measured', 'Alles Gemessene')}</a></div>
        ${top.length ? `<ul class="res">${top.map(([key, r]) => `<li><span class="k2">${esc(skillLabel(key))}</span>${pips(r.level)}</li>`).join('')}</ul>${measured.length > top.length ? `<p class="note">${L(`and ${measured.length - top.length} more`, `und ${measured.length - top.length} weitere`)} · <a href="#/learn">${L('the path', 'der Weg')}</a></p>` : `<p class="note"><a href="#/learn">${L('See where you are on the path', 'Sieh, wo du auf dem Weg bist')}</a></p>`}` : `<p class="note">${L('Nothing was measured this time. That is fine: the steps are still there tomorrow.', 'Diesmal wurde nichts gemessen. Das ist in Ordnung: Die Schritte sind morgen noch da.')}</p>`}
      </section>
      <section class="paper alone">
        <div class="sectitle"><h2>${L('Or one thing on its own', 'Oder eine Übung für sich')}</h2></div>
        <nav class="links" aria-label="${L('Single exercises', 'Einzelne Übungen')}">${inst === 'voice' ? link('match', L('Match the tone', 'Töne treffen')) + link('hold', L('Hold a tone', 'Einen Ton halten')) : inst === 'piano' ? link('tuner/piano', L('Piano pitch', 'Tonhöhe des Klaviers')) + link('keys/C', L('Chord check', 'Akkord-Check')) : link('tuner', L('Guitar tuner', 'Stimmgerät für die Gitarre')) + link('chord/Em', L('Chord check', 'Akkord-Check'))}${link('stride', L('Rhythm game', 'Rhythmusspiel'))}</nav>
      </section>
    </div>
  </div>`;
  return keys({ ' ': () => go('/session/new'), Enter: () => go('/session/new') });
}

export const progress: Screen = (root) => {
  const now = Date.now();
  const kinds: [SkillKind, string][] = [
    ['chord', L('Chords', 'Akkorde')],
    ['pair', L('Chord changes', 'Akkordwechsel')],
    ['finger', L('Finger patterns', 'Fingermuster')],
    ['bar', L('Songs and pieces', 'Songs und Stücke')],
    ['scale', L('Scales', 'Tonleitern')],
    ['beat', L('Keeping the beat', 'Im Takt bleiben')],
    ['pitch', L('Singing in tune', 'Treffsicher singen')],
    ['tone', L('Holding a tone', 'Einen Ton halten')],
    ['sing', L('Sung patterns', 'Gesungene Muster')],
  ];
  const timed = (kind: SkillKind): boolean => kind === 'chord' || kind === 'scale';
  const fmt = (kind: SkillKind, v: number): string => (!isFinite(v) || v === 0 ? '–' : timed(kind) ? v.toFixed(1) + ' s' : kind === 'bar' ? Math.round(v) + '%' : kind === 'pitch' || kind === 'tone' ? Math.round(v) + ' ct' : String(Math.round(v)));
  const section = ([kind, title]: [SkillKind, string]): string => {
    const found = Object.keys(store.skills.data)
      .filter((k) => kindOf(k) === kind)
      .sort();
    if (!found.length) return '';
    const rows = found
      .map((key) => {
        const r = store.skills.data[key];
        const next = store.skills.next(key);
        const partial = kind === 'pitch' && r.level === 0 && !isFinite(r.best) ? L('not all found yet', 'noch nicht alle getroffen') : timed(kind) && r.level === 0 ? (kind === 'chord' && r.strings ? cleanStrings(key, r.strings) : L('not clean yet', 'noch nicht sauber')) : fmt(kind, r.best);
        // the first try of the last day it was played: what the hands do from cold, beside the best ever
        const cold = r.cold && r.level > 0 ? `${fmt(kind, r.cold[1])}<small class="ago">${relDay(dayStart(r.cold[0]), now)}</small>` : '–';
        return `<tr><td>${esc(skillLabel(key))}${store.skills.rusty(key, now) ? `<span class="tag weak">${L('rusty', 'eingerostet')}</span>` : ''}${store.skills.due(key, now) && !store.skills.rusty(key, now) ? `<span class="tag up">${L('due again', 'wieder fällig')}</span>` : ''}</td><td>${pips(r.level)}</td><td class="n">${partial}</td><td class="n">${cold}</td><td class="n">${next ? (timed(kind) && next.level === 1 ? L('all clean once', 'einmal ganz sauber') : fmt(kind, next.value)) : L('top', 'höchste Stufe')}</td></tr>`;
      })
      .join('');
    const top = Math.max(...found.map((key) => store.skills.data[key].level));
    return `<details class="kind"><summary><b>${title}</b><span>${L(`${found.length} measured`, `${found.length} gemessen`)} · ${KINDS[kind].describe}</span>${pips(top)}</summary><div class="scroll"><table class="fixed"><thead><tr><th>${title}</th><th>${L('Level', 'Stufe')}</th><th class="n">${L('Best', 'Bestwert')}</th><th class="n">${L('Last cold try', 'Zuletzt kalt')}</th><th class="n">${L('Next level at', 'Nächste Stufe bei')}</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  };
  const body = kinds.map(section).join('');
  const names: Record<string, string> = lang() === 'de'
    ? { fingers: 'Fingerrunde', changes: 'Wechselrunde', song: 'Songrunde', keys: 'Tastenrunde', piece: 'Stückrunde', kchanges: 'Wechselrunde, Klavier', sing: 'Stimmrunde', ssong: 'Songrunde, gesungen' }
    : { fingers: 'finger run', changes: 'changes run', song: 'song run', keys: 'key run', piece: 'piece run', kchanges: 'changes run, piano', sing: 'voice run', ssong: 'song run, sung' };
  const inst = store.settings.instrument;
  // over the weeks first, then everything measured: the rank, the days, and every skill in its table
  const stop = trendsPage(root, []);
  root.querySelector('.page')?.insertAdjacentHTML(
    'beforeend',
    `<section class="measured" id="measured">
      <div><p class="kick">${L('Everything measured', 'Alles Gemessene')} · ${inst === 'voice' ? L('voice', 'Stimme') : inst === 'piano' ? L('piano', 'Klavier') : L('guitar', 'Gitarre')}</p><h2>${L(`Rank ${store.skills.rank()}`, `Rang ${store.skills.rank()}`)}</h2><p class="lede">${L('The rank is the total of your skill levels. A level is given for what the microphone heard, never for time spent, and it is never taken away. A skill you have not confirmed for a week is marked rusty and comes back more often in runs.', 'Der Rang ist die Summe deiner Stufen. Eine Stufe gibt es für das, was das Mikrofon gehört hat, nie für die geübte Zeit, und sie wird nie wieder weggenommen. Was du eine Woche lang nicht bestätigt hast, gilt als eingerostet und kommt in Runden öfter dran.')}</p></div>
      <dl class="stats"><div><dt>${L('Rank', 'Rang')}</dt><dd>${store.skills.rank()}</dd></div><div><dt>${L('Days played', 'Tage gespielt')}</dt><dd>${new Set(store.sessions.map((t) => new Date(t).toDateString())).size}</dd></div><div><dt>${L('Days in a row', 'Tage in Folge')}</dt><dd>${store.streak(now)}</dd></div>${Object.entries(store.best)
        .map(([t, sc]) => `<div><dt>${L(`Best ${esc(names[t] ?? t)}`, `Bestwert ${esc(names[t] ?? t)}`)}</dt><dd>${num(sc)}</dd></div>`)
        .join('')}</dl>
      ${body || `<p class="note">${L('Nothing measured yet. Play a lesson, a chord check or a run.', 'Noch nichts gemessen. Spiel eine Lektion, einen Akkord-Check oder eine Runde.')}</p>`}
      <p class="note">${L('Where you are on the path, and every skill with its pages and its practice:', 'Wo du auf dem Weg bist, und jede Fähigkeit mit ihren Seiten und ihrer Übung:')} <a href="#/learn">${L('Learn', 'Lernen')}</a>.</p>
    </section>`,
  );
  return stop;
};

export const settings: Screen = (root) => {
  const s = store.settings;
  const field = (id: string, label: string, small: string, control: string): string => `<div class="field"><label for="${id}">${label}<small>${small}</small></label>${control}</div>`;
  const check = (id: string, on: boolean): string => `<input id="${id}" type="checkbox" ${on ? 'checked' : ''}>`;
  // a value of the settings in an attribute: they may come from a backup file, so escaped like any text
  const val = (v: number | string): string => esc(String(v));
  const INDEX: [string, string][] = [
    ['lang', L('Language', 'Sprache')],
    ['seeing', L('Seeing it', 'Ansicht')],
    ['mic', L('Microphone', 'Mikrofon')],
    ['playing', L('Playing', 'Spielen')],
    ['tuning', L('Tuning', 'Stimmung')],
    ['voice', L('Voice', 'Stimme')],
    ['data', L('Your data', 'Deine Daten')],
  ];
  root.innerHTML = `<div class="page settingsp">
    <div><p class="kick">${L('Settings', 'Einstellungen')}</p><h1>${L('Settings', 'Einstellungen')}</h1><p class="lede">${L('Saved at once, on this computer.', 'Sofort gespeichert, auf diesem Computer.')}</p></div>
    <div class="setgrid"><nav class="setindex" aria-label="${L('Groups', 'Gruppen')}">${INDEX.map(([id, label]) => `<a href="#set-${id}" data-to="set-${id}">${label}</a>`).join('')}</nav><div class="setbody">
      <section class="setgroup" id="set-lang"><h2>${L('Language', 'Sprache')}</h2>
      ${field('lang', L('Language of the app', 'Sprache der App'), L('English or German. Chosen once, so it is not in the top bar: the first visit takes the language of the browser.', 'Englisch oder Deutsch. Einmal gewählt, darum nicht oben in der Leiste: Der erste Besuch nimmt die Sprache des Browsers.'), `<select id="lang"><option value="en" lang="en"${lang() === 'en' ? ' selected' : ''}>English</option><option value="de" lang="de"${lang() === 'de' ? ' selected' : ''}>Deutsch</option></select>`)}
      </section><section class="setgroup" id="set-seeing"><h2>${L('Seeing it', 'Ansicht')}</h2>
      ${field('scale', L('Size of the type', 'Schriftgröße'), L('Larger, for reading from a metre or more away with the instrument in your hands. On the screens you play at it enlarges what you read while playing (the instruction, the numbers and names of the music, what the app says), and the buttons keep their size.', 'Größer, zum Lesen aus einem Meter oder mehr, mit dem Instrument in den Händen. Auf den Bildschirmen, an denen du spielst, vergrößert sie, was du beim Spielen liest (die Anweisung, die Zahlen und Namen der Musik, was die App sagt), und die Knöpfe behalten ihre Größe.'), `<select id="scale">${[[1, L('Normal', 'Normal')], [1.15, L('Larger', 'Größer')], [1.3, L('Largest', 'Am größten')]].map(([v, n]) => `<option value="${v}"${s.uiScale === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`)}
      ${field('capo', L('Capo', 'Kapodaster'), L('The fret the capo sits at. The app hears the guitar as written: a C shape stays a C shape, and everything sounds that much higher.', 'Der Bund, in dem der Kapodaster sitzt. Die App hört die Gitarre wie notiert: Ein C-Griff bleibt ein C-Griff, und alles klingt entsprechend höher.'), `<select id="capo">${[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}"${n === (s.capo || 0) ? ' selected' : ''}>${n ? L(`Fret ${n}`, `${n}. Bund`) : L('None', 'Keiner')}</option>`).join('')}</select>`)}
      ${field('tuning', L('Tuning of the guitar', 'Stimmung der Gitarre'), L('Tuned a half or a whole step down, the guitar is heard as written, as with a capo. Drop D and the open tunings are in the tuner, for playing of your own.', 'Einen Halb- oder Ganzton tiefer gestimmt, wird die Gitarre wie notiert gehört, wie mit Kapodaster. Drop D und die offenen Stimmungen sind im Stimmgerät, zum eigenen Spielen.'), `<select id="tuning">${TUNINGS()
        .filter((t) => t.lessons)
        .map((t) => `<option value="${t.id}"${t.id === s.tuning ? ' selected' : ''}>${esc(t.name)}</option>`)
        .join('')}</select>`)}
      ${field('lefty', L('Left-handed guitar', 'Linkshänder-Gitarre'), L('Chord pictures and the fretboard mirrored, the high e string on the left, as you see your guitar.', 'Griffbilder und Griffbrett gespiegelt, die hohe e-Saite links, so wie du deine Gitarre siehst.'), check('lefty', s.leftHanded))}
      </section><section class="setgroup" id="set-mic"><h2>${L('Microphone', 'Mikrofon')}</h2>
      ${field('mic', L('Use the microphone', 'Mikrofon benutzen'), L('Off: the app only hears the built-in practice instrument.', 'Aus: Die App hört nur das eingebaute Übungsinstrument.'), check('mic', s.mic))}
      ${field('dev', L('Which microphone', 'Welches Mikrofon'), L('The names appear once the microphone has been allowed.', 'Die Namen erscheinen, sobald das Mikrofon erlaubt ist.'), `<select id="dev"><option value="">${L('System default', 'Systemstandard')}</option></select>`)}
      <div class="field"><div><b>${L('Hearing check', 'Hörcheck')}</b><small>${store.progress[`check:${s.instrument}`] ? L(`Last time ${store.progress[`checkscore:${s.instrument}`] ?? 0}% heard right, ${dayMonth(store.progress[`check:${s.instrument}`])}.`, `Zuletzt ${store.progress[`checkscore:${s.instrument}`] ?? 0} % richtig gehört, am ${dayMonth(store.progress[`check:${s.instrument}`])}.`) : L('Two minutes: the app asks for strings, chords, keys or notes and says how well it hears your instrument in your room, and what to change.', 'Zwei Minuten: Die App bittet um Saiten, Akkorde, Tasten oder Töne und sagt, wie gut sie dein Instrument in deinem Raum hört, und was du ändern kannst.')}</small></div><div class="row"><a class="btn" href="#/check">${L('Start the hearing check', 'Hörcheck starten')}</a></div></div>
      <div class="field"><div><b>${L('Is it hearing you?', 'Hört es dich?')}</b><small id="testmsg">${L('Start the test and play a note. The bars should move and the note should be named.', 'Starte den Test und spiel einen Ton. Die Balken sollten sich bewegen, und der Ton sollte benannt werden.')}</small></div><div class="row"><button class="btn" id="test">${L('Test the microphone', 'Mikrofon testen')}</button><span id="testout" hidden>${micMeter()}</span><b id="heard"></b></div></div>
      <div class="field"><div><b>${L('When something is not heard right', 'Wenn etwas nicht richtig gehört wird')}</b><small id="recmsg">${L('Record it: play what the app gets wrong, for up to 30 seconds. The file holds exactly what the app heard and goes to your downloads folder.', 'Nimm es auf: Spiel bis zu 30 Sekunden lang, was die App falsch versteht. Die Datei enthält genau das, was die App gehört hat, und landet in deinem Download-Ordner.')}</small></div><div class="row"><button class="btn" id="rec">${L('Record', 'Aufnehmen')}</button></div></div>
      </section><section class="setgroup" id="set-playing"><h2>${L('Playing', 'Spielen')}</h2>
      ${field('click', L('Metronome loudness', 'Lautstärke des Metronoms'), L('For playing along with the click. All the way left: silent, the marker still moves.', 'Zum Mitspielen mit dem Klick. Ganz links: stumm, die Markierung bewegt sich trotzdem.'), `<input id="click" type="range" min="0" max="1" step="0.05" value="${val(s.click)}">`)}
      ${field('chimes', L('Sounds of the games', 'Klänge der Spiele'), L('Small glassy chimes for a hit, a cleared phrase, a lit stone. They are pitched so high that the listening is not disturbed by them. All the way left: silent.', 'Kleine gläserne Klänge für einen Treffer, eine geschaffte Phrase, einen leuchtenden Stein. Sie liegen so hoch, dass sie das Zuhören nicht stören. Ganz links: stumm.'), `<input id="chimes" type="range" min="0" max="1" step="0.05" value="${val(s.chimes)}">`)}
      ${field('csound', L('Metronome sound', 'Klang des Metronoms'), L('The high tick does not disturb the listening when the microphone hears it from the speakers. The low click is easier on the ear, but only with headphones.', 'Das hohe Ticken stört das Zuhören nicht, wenn das Mikrofon es aus den Lautsprechern hört. Der tiefe Klick ist angenehmer fürs Ohr, aber nur mit Kopfhörern.'), `<select id="csound"><option value="tick"${s.clickSound === 'tick' ? ' selected' : ''}>${L('High tick (for speakers)', 'Hohes Ticken (für Lautsprecher)')}</option><option value="click"${s.clickSound === 'click' ? ' selected' : ''}>${L('Low click (headphones only)', 'Tiefer Klick (nur mit Kopfhörern)')}</option></select>`)}
      ${field('small', L('Small shapes for barre chords', 'Kleine Griffe für Barré-Akkorde'), L('Songs and runs show F♯m and Bm on four strings until the full barre has rung clean in the chord check.', 'Songs und Runden zeigen F♯m und Bm auf vier Saiten, bis das volle Barré im Akkord-Check sauber geklungen hat.'), check('small', s.smallShapes))}
      ${field('mute', L('Pause a run by muting the strings', 'Eine Runde durch Abdämpfen pausieren'), L('Hit the muted strings twice in a row and then stop: that pauses a Noise Floor run. The same again goes on.', 'Schlag die abgedämpften Saiten zweimal hintereinander an und hör dann auf: Das pausiert eine Noise-Floor-Runde. Dasselbe noch einmal, und es geht weiter.'), check('mute', s.mutePause))}
      ${field('strum', L('Choose menu cards from the instrument', 'Menükarten mit dem Instrument wählen'), L('Strum Em, Am or C, or play C, D or E on the piano, for the first, second or third card. With the voice the number keys choose.', 'Schlag Em, Am oder C an oder spiel C, D oder E am Klavier, für die erste, zweite oder dritte Karte. Bei der Stimme wählen die Zifferntasten.'), check('strum', s.strumSelect))}
      ${field('prac', L('Show the practice instrument', 'Übungsinstrument zeigen'), L('Buttons and keys (N, W, M, B, X) that play notes for you, to try things without an instrument.', 'Knöpfe und Tasten (N, W, M, B, X), die Töne für dich spielen, um ohne Instrument etwas auszuprobieren.'), check('prac', s.practiceInstrument))}
      ${field('rectakes', L('Record takes at full speed', 'Durchgänge im vollen Tempo aufnehmen'), L('To listen back, bar by bar, and to hear weeks of practice: the first recording of each song and the latest stay in this browser, nowhere else.', 'Zum Anhören, Takt für Takt, und um Wochen des Übens zu hören: Die erste Aufnahme jedes Songs und die neueste bleiben in diesem Browser, nirgends sonst.'), check('rectakes', s.recordTakes))}
      ${field('autotempo', L('In a loop, the tempo rises by itself', 'In der Schleife steigt das Tempo von selbst'), L('After three clean runs in a row, 5% faster, up to 125%.', 'Nach drei sauberen Durchläufen in Folge 5 % schneller, bis 125 %.'), check('autotempo', s.autoTempo))}
      ${field('weekgoal', L('Days a week to play', 'Tage pro Woche zum Spielen'), L('The week counts, not an unbroken chain: missed days do not undo anything.', 'Die Woche zählt, nicht eine ununterbrochene Kette: Verpasste Tage machen nichts zunichte.'), `<select id="weekgoal">${[2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}"${s.weekGoal === n ? ' selected' : ''}>${L(`${n} days`, `${n} Tage`)}</option>`).join('')}</select>`)}
      </section><section class="setgroup" id="set-tuning"><h2>${L('Tuning', 'Stimmung')}</h2>
      ${field('a4', L('Guitar: tuning reference, A in Hz', 'Gitarre: Stimmton, A in Hz'), L('440 is standard.', '440 ist der Standard.'), `<input id="a4" type="number" min="415" max="466" step="0.1" value="${val(s.a4)}">`)}
      ${field('pa4', L('Piano: pitch of its A in Hz', 'Klavier: Tonhöhe seines A in Hz'), L('Measured at the start of every piano session. An old piano is often lower than 440.', 'Wird zu Beginn jeder Klavier-Session gemessen. Ein altes Klavier liegt oft tiefer als 440.'), `<input id="pa4" type="number" min="400" max="470" step="0.1" value="${val(s.pianoA4)}">`)}
      ${field('buzz', L('Buzz tolerance', 'Toleranz fürs Schnarren'), L('Left: stricter, more strings count as buzzing. Right: more forgiving.', 'Links: strenger, mehr Saiten gelten als schnarrend. Rechts: nachsichtiger.'), `<input id="buzz" type="range" min="0.2" max="1.2" step="0.05" value="${val(s.buzz)}">`)}
      ${field('ring', L('How long a string must ring', 'Wie lange eine Saite klingen muss'), L('For the chord check. Left: forgiving. Right: a string that sounds only briefly counts as muted too. The chord check also adjusts to how your guitar rings; this is the least it asks for.', 'Für den Akkord-Check. Links: nachsichtig. Rechts: Eine Saite, die nur kurz klingt, gilt auch als abgedämpft. Der Akkord-Check passt sich außerdem an, wie deine Gitarre klingt; dies ist das Mindeste, was er verlangt.'), `<input id="ring" type="range" min="0.03" max="0.4" step="0.01" value="${val(s.ring)}">`)}
      </section><section class="setgroup" id="set-voice"><h2>${L('Voice', 'Stimme')}</h2>
      <div class="field"><div><b>${L('Your range', 'Dein Stimmumfang')}</b><small>${rangeMeasured() ? L(`Measured: ${noteName(s.voiceLow)} to ${noteName(s.voiceHigh)}. Songs are set a little inside it.`, `Gemessen: ${noteName(s.voiceLow)} bis ${noteName(s.voiceHigh)}. Songs liegen etwas innerhalb davon.`) : L('Not measured yet: the first singing session does it. Until then songs are set for a middle voice.', 'Noch nicht gemessen: Die erste Gesangs-Session misst ihn. Bis dahin liegen Songs für eine mittlere Stimme.')}</small></div><div class="row"><a class="btn" href="#/range">${rangeMeasured() ? L('Measure again', 'Neu messen') : L('Measure now', 'Jetzt messen')}</a></div></div>
      ${field('vtol', L('How near a sung note must be', 'Wie genau ein gesungener Ton sein muss'), L('In cents, a hundredth of a semitone. 50 is the measure singing studies use: the right semitone. 35 is stricter; 75 is kind to a voice that is just starting.', 'In Cent, einem Hundertstel Halbton. 50 ist das Maß, das Gesangsstudien nehmen: der richtige Halbton. 35 ist strenger; 75 ist nachsichtig mit einer Stimme, die gerade anfängt.'), `<select id="vtol">${[35, 50, 75].map((v) => `<option value="${v}"${s.voiceTol === v ? ' selected' : ''}>${v} ${L('cents', 'Cent')}</option>`).join('')}</select>`)}
      <div class="field"><div><b>${L('Timing with the click', 'Timing mit dem Klick')}</b><small id="latmsg"></small></div><div class="row"><button class="btn" id="latmeasure">${L('Measure now', 'Jetzt messen')}</button><button class="btn quiet" id="latreset">${L('Forget', 'Vergessen')}</button></div></div>
      </section><section class="setgroup" id="set-data"><h2>${L('Your data', 'Deine Daten')}</h2>
      <div class="field"><div><b>${L('Progress file', 'Fortschrittsdatei')}</b><small id="filemsg"></small></div><div class="row" id="filerow"></div></div>
      <div class="field"><div><b>${L('Backup', 'Sicherung')}</b><small>${L('Everything is kept in this browser on this computer. A backup file holds your levels, scores, settings and your own songs.', 'Alles wird in diesem Browser auf diesem Computer gespeichert. Eine Sicherungsdatei enthält deine Stufen, Punkte, Einstellungen und deine eigenen Songs.')}</small></div><div class="row"><button class="btn" id="export">${L('Save a backup file', 'Sicherungsdatei speichern')}</button><button class="btn" id="import">${L('Load a backup', 'Sicherung laden')}</button><input id="file" type="file" accept="application/json,.json" hidden></div></div>
    </section></div></div>
    <div class="row"><button class="btn" id="reset">${L('Erase all progress', 'Gesamten Fortschritt löschen')}</button><span class="note" id="msg">${L('Changes are saved at once and stay on this computer.', 'Änderungen werden sofort gespeichert und bleiben auf diesem Computer.')}</span></div>
  </div>`;
  const say = (text: string): void => {
    $('#msg', root).textContent = text;
  };
  $$<HTMLAnchorElement>('.setindex a', root).forEach(
    (a) =>
      (a.onclick = (e) => {
        e.preventDefault();
        root.querySelector('#' + a.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }),
  );
  const bind = (id: string, apply: (el: HTMLInputElement) => void): void => {
    $<HTMLInputElement>('#' + id, root).onchange = (e) => {
      apply(e.target as HTMLInputElement);
      store.save();
    };
  };
  // the guitar's A within what the tuner allows (415 to 466); a piano may sit lower or higher
  const hz = (el: HTMLInputElement, lo = 400, hi = 470): number => Math.min(hi, Math.max(lo, Number(el.value) || 440));
  bind('mic', (el) => {
    s.mic = el.checked;
    endRecording(false);
    void engine.stop();
  });
  bind('prac', (el) => (s.practiceInstrument = el.checked));
  bind('strum', (el) => (s.strumSelect = el.checked));
  bind('small', (el) => (s.smallShapes = el.checked));
  bind('mute', (el) => (s.mutePause = el.checked));
  bind('lefty', (el) => (s.leftHanded = el.checked));
  bind('rectakes', (el) => (s.recordTakes = el.checked));
  bind('autotempo', (el) => (s.autoTempo = el.checked));
  $<HTMLSelectElement>('#capo', root).onchange = (e) => {
    s.capo = Number((e.target as HTMLSelectElement).value) || 0;
    store.save();
  };
  $<HTMLSelectElement>('#tuning', root).onchange = (e) => {
    s.tuning = (e.target as HTMLSelectElement).value;
    store.save();
  };
  $<HTMLSelectElement>('#scale', root).onchange = (e) => {
    s.uiScale = Number((e.target as HTMLSelectElement).value) || 1;
    store.save();
    applyScale();
  };
  bind('click', (el) => (s.click = Number(el.value)));
  bind('chimes', (el) => {
    s.chimes = Number(el.value);
    engine.chime('clear', s.chimes);
  });
  bind('a4', (el) => (s.a4 = hz(el, 415, 466)));
  bind('pa4', (el) => (s.pianoA4 = hz(el)));
  bind('buzz', (el) => (s.buzz = Number(el.value)));
  bind('ring', (el) => (s.ring = Number(el.value)));
  $<HTMLSelectElement>('#vtol', root).onchange = (e) => {
    s.voiceTol = [35, 50, 75].includes(Number((e.target as HTMLSelectElement).value)) ? Number((e.target as HTMLSelectElement).value) : 50;
    store.save();
  };
  $<HTMLSelectElement>('#weekgoal', root).onchange = (e) => {
    s.weekGoal = Math.max(2, Math.min(7, Number((e.target as HTMLSelectElement).value) || 4));
    store.save();
  };
  $<HTMLSelectElement>('#csound', root).onchange = (e) => {
    s.clickSound = (e.target as HTMLSelectElement).value === 'click' ? 'click' : 'tick';
    store.save();
  };
  $<HTMLSelectElement>('#lang', root).onchange = (e) => {
    s.lang = (e.target as HTMLSelectElement).value === 'de' ? 'de' : 'en';
    store.save();
    setLang(s.lang);
    refresh();
  };

  // which microphone
  const dev = $<HTMLSelectElement>('#dev', root);
  const listMics = async (): Promise<void> => {
    const mics = await engine.microphones();
    dev.innerHTML = `<option value="">${L('System default', 'Systemstandard')}</option>` + mics.map((m) => `<option value="${esc(m.id)}"${m.id === s.deviceId ? ' selected' : ''}>${esc(m.label)}</option>`).join('');
  };
  void listMics();
  dev.onchange = () => {
    s.deviceId = dev.value;
    store.save();
    stopTest();
    endRecording(false);
    void engine.stop();
    $('#testmsg', root).textContent = L('Microphone changed. Start the test to try it.', 'Mikrofon gewechselt. Starte den Test, um es auszuprobieren.');
  };

  // microphone test: level and the last note heard
  let stopTest: () => void = () => undefined;
  // The page was left while the browser asked about the microphone: what comes back after that must not
  // take the listener over from the page that is on show now.
  let left = false;
  const ready = async (): Promise<boolean> => {
    if (!engine.running || engine.lost) await engine.start({ mic: s.mic, deviceId: s.deviceId || undefined });
    return !left;
  };
  $('#test', root).onclick = async () => {
    stopTest();
    if (!(await ready())) return;
    await listMics();
    if (left) return;
    $('#testout', root).hidden = false;
    $('#heard', root).textContent = '';
    $('#testmsg', root).textContent = engine.micOn
      ? L(`Listening through ${engine.micLabel || 'the microphone'}. Play a single note.`, `Hört über ${engine.micLabel || 'das Mikrofon'}. Spiel einen einzelnen Ton.`)
      : s.mic
        ? L(`The microphone could not be opened (${engine.micError || 'no device'}). Check the browser's permission for this page.`, `Das Mikrofon ließ sich nicht öffnen (${engine.micError || 'kein Gerät'}). Prüfe die Erlaubnis des Browsers für diese Seite.`)
        : L('The microphone is switched off above.', 'Das Mikrofon ist oben ausgeschaltet.');
    stopTest = hear(root, {
      onNote: (e) => {
        $('#heard', root).textContent = L(`Heard ${noteName(e.midi)}`, `Gehört: ${noteName(e.midi)}`);
      },
    });
  };

  // a recording of what the listener was given, for finding out why something was not heard right
  const REC_SECONDS = 30;
  let recTimer = 0;
  const recBtn = $('#rec', root);
  const endRecording = (save: boolean): void => {
    if (!recTimer) return;
    clearInterval(recTimer);
    recTimer = 0;
    recBtn.textContent = L('Record', 'Aufnehmen');
    const { samples, sampleRate } = engine.recorded();
    if (!save) return;
    if (samples.length < 0.5 * sampleRate) {
      $('#recmsg', root).textContent = L('That was too short to be of use. Record again and play for a few seconds.', 'Das war zu kurz, um etwas zu nützen. Nimm noch einmal auf und spiel ein paar Sekunden lang.');
      return;
    }
    const d = new Date();
    const two = (n: number): string => String(n).padStart(2, '0');
    const name = `noise-floor-heard-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.wav`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([encodeWav(samples, sampleRate)], { type: 'audio/wav' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    $('#recmsg', root).textContent = L(
      `Saved ${Math.round(samples.length / sampleRate)} seconds as ${name} in your downloads folder. "npm run hear" with the path of that file shows what the app made of it.`,
      `${Math.round(samples.length / sampleRate)} Sekunden als ${name} in deinem Download-Ordner gespeichert. „npm run hear“ mit dem Pfad dieser Datei zeigt, was die App daraus gemacht hat.`,
    );
  };
  recBtn.onclick = async () => {
    if (recTimer) return endRecording(true);
    // (a second click while the microphone opens finds the recording already begun)
    if (!(await ready()) || recTimer) return;
    if (!engine.micOn) {
      $('#recmsg', root).textContent = s.mic
        ? L(`The microphone could not be opened (${engine.micError || 'no device'}). Check the browser's permission for this page.`, `Das Mikrofon ließ sich nicht öffnen (${engine.micError || 'kein Gerät'}). Prüfe die Erlaubnis des Browsers für diese Seite.`)
        : L('The microphone is switched off above: there is nothing to record.', 'Das Mikrofon ist oben ausgeschaltet: Es gibt nichts aufzunehmen.');
      return;
    }
    engine.record(REC_SECONDS);
    $('#recmsg', root).textContent = L('Recording. Play what the app gets wrong: single strings, the chord, the muted hits.', 'Aufnahme läuft. Spiel, was die App falsch versteht: einzelne Saiten, den Akkord, die gedämpften Anschläge.');
    const show = (): void => {
      recBtn.textContent = L(`Stop and save (${Math.max(0, Math.ceil(REC_SECONDS - engine.recordedSeconds))})`, `Stoppen und speichern (${Math.max(0, Math.ceil(REC_SECONDS - engine.recordedSeconds))})`);
    };
    show();
    recTimer = window.setInterval(() => {
      show();
      if (engine.recordedSeconds >= REC_SECONDS - 0.02) endRecording(true);
    }, 250);
  };

  const showLatency = (): void => {
    $('#latmsg', root).textContent =
      s.latency < 0
        ? L('Sound takes a moment from the speakers to the microphone and into the app. "Measure now" plays six clicks and times them. Without that, the app learns it while you play along.', 'Der Klang braucht einen Moment von den Lautsprechern zum Mikrofon und in die App. „Jetzt messen“ spielt sechs Klicks und misst ihre Zeit. Ohne das lernt die App es, während du mitspielst.')
        : L(`A note played on the click arrives ${Math.round(s.latency * 1000)} ms later on this setup, and the app allows for it. Measure again when you change speakers or microphone.`, `Ein Ton, der auf den Klick gespielt wird, kommt bei diesem Aufbau ${Math.round(s.latency * 1000)} ms später an, und die App rechnet damit. Miss noch einmal, wenn du Lautsprecher oder Mikrofon wechselst.`);
  };
  showLatency();
  $('#latreset', root).onclick = () => {
    s.latency = -1;
    store.save();
    showLatency();
  };
  // Six low clicks through the speakers; the microphone hears them come back. No playing needed.
  let measuring = 0;
  let stopMeasure: () => void = () => undefined;
  $('#latmeasure', root).onclick = async () => {
    if (measuring) return;
    // taken at once: a second click while the microphone opens must not start a second measurement
    measuring = -1;
    stopTest();
    if (!(await ready())) return;
    if (!engine.micOn) {
      measuring = 0;
      $('#latmsg', root).textContent = L('This needs the microphone, and the sound must come from speakers, not headphones.', 'Dafür braucht es das Mikrofon, und der Klang muss aus Lautsprechern kommen, nicht aus Kopfhörern.');
      return;
    }
    const heard: number[] = [];
    const stop = (stopMeasure = hear(root, { onOnset: (e) => heard.push(e.time) }, (l) => (l.noteDetection = false)));
    const first = engine.now() + 0.8;
    const clicks = Array.from({ length: 6 }, (_, k) => first + k * 0.5);
    for (const t of clicks) engine.tick(t, false, 1, true);
    $('#latmsg', root).textContent = L('Six clicks. Keep quiet for a moment...', 'Sechs Klicks. Sei einen Moment still …');
    measuring = window.setTimeout(() => {
      measuring = 0;
      stop();
      const late = clicks.map((t) => heard.find((h) => h > t - 0.02 && h < t + 0.4)).flatMap((h, k) => (h === undefined ? [] : [h - clicks[k]]));
      if (late.length < 4) {
        $('#latmsg', root).textContent = L('The microphone did not hear the clicks. With headphones that is how it should be: the app then learns the timing while you play along.', 'Das Mikrofon hat die Klicks nicht gehört. Mit Kopfhörern ist das richtig so: Die App lernt das Timing dann, während du mitspielst.');
        return;
      }
      s.latency = Math.max(0, Math.min(0.35, late.sort((a, b) => a - b)[late.length >> 1]));
      store.save();
      showLatency();
    }, 4400);
  };

  // the progress file: chosen once, written after every change, read when it is newer
  const showFile = (): void => {
    const f = fileState();
    $('#filemsg', root).textContent =
      f.status === 'unsupported'
        ? L('Not in this browser: Edge or Chrome on a computer can keep your progress in a file of your own. Here the backup file below does it by hand.', 'Nicht in diesem Browser: Edge oder Chrome auf einem Computer können deinen Fortschritt in einer eigenen Datei halten. Hier tut es die Sicherungsdatei unten von Hand.')
        : f.status === 'none'
          ? L('Your progress in a file you choose, written after every change: put it in a folder your computers share (OneDrive, Dropbox, a USB stick) and choose the same file on each. No account, nothing sent anywhere.', 'Dein Fortschritt in einer Datei deiner Wahl, nach jeder Änderung geschrieben: Leg sie in einen Ordner, den deine Computer teilen (OneDrive, Dropbox, ein USB-Stick), und wähl auf jedem dieselbe Datei. Kein Konto, nichts wird irgendwohin geschickt.')
          : f.status === 'ask'
            ? L(`Kept in ${f.name}. The browser asks once a visit before the app may write to it again.`, `In ${f.name} gehalten. Der Browser fragt einmal pro Besuch, bevor die App wieder hineinschreiben darf.`)
            : L(`Kept in ${f.name}${f.lastWritten ? `, last written at ${new Date(f.lastWritten).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })}` : ''}.`, `In ${f.name} gehalten${f.lastWritten ? `, zuletzt geschrieben um ${new Date(f.lastWritten).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })}` : ''}.`) +
              (f.unreadable ? L(' It could not be read the last time: nothing is written into it until it can be (the start page asks).', ' Beim letzten Mal ließ sie sich nicht lesen: Es wird nichts hineingeschrieben, bis das wieder geht (die Startseite fragt).') : '');
    $('#filerow', root).innerHTML =
      f.status === 'unsupported'
        ? ''
        : f.status === 'none'
          ? `<button class="btn" id="filenew">${L('Keep it in a new file', 'In einer neuen Datei halten')}</button><button class="btn quiet" id="fileopen">${L('Take a file from another computer', 'Eine Datei von einem anderen Computer nehmen')}</button>`
          : `${f.status === 'ask' ? `<button class="btn" id="fileask">${L('Allow writing to it', 'Schreiben erlauben')}</button>` : ''}<button class="btn quiet" id="filestop">${L('Stop using the file', 'Datei nicht mehr nutzen')}</button>`;
    const on = (id: string, fn: () => Promise<void>): void => {
      const b = root.querySelector<HTMLButtonElement>('#' + id);
      if (b) b.onclick = () => void fn();
    };
    const picked = async (r: string): Promise<void> => {
      if (r === 'loaded') {
        await engine.stop();
        refresh();
        return;
      }
      if (r === 'not-ours') say(L('That file is not a Noise Floor progress file. Nothing was changed.', 'Diese Datei ist keine Noise-Floor-Fortschrittsdatei. Nichts wurde geändert.'));
      showFile();
    };
    on('filenew', async () => picked(await chooseFile(false)));
    on('fileopen', async () => picked(await chooseFile(true)));
    on('fileask', async () => {
      await askAgain();
      refresh();
    });
    on('filestop', async () => {
      await forgetFile();
      showFile();
    });
  };
  showFile();

  $('#export', root).onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([store.backup()], { type: 'application/json' }));
    a.download = `noise-floor-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    say(L('Backup saved to your downloads folder.', 'Sicherung in deinem Download-Ordner gespeichert.'));
  };
  const file = $<HTMLInputElement>('#file', root);
  $('#import', root).onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (store.restore(await f.text())) {
      await engine.stop();
      refresh();
    } else say(L('That file is not a Noise Floor backup. Nothing was changed.', 'Diese Datei ist keine Noise-Floor-Sicherung. Nichts wurde geändert.'));
  };

  let armed = false;
  $('#reset', root).onclick = () => {
    if (!armed) {
      armed = true;
      $('#reset', root).textContent = L('Click again to erase', 'Zum Löschen noch einmal klicken');
      say(L('This removes all levels, scores, run history and the recordings of your takes. Your own songs and settings stay. It cannot be undone.', 'Das entfernt alle Stufen, Punkte, den Verlauf der Runden und die Aufnahmen deiner Durchgänge. Deine eigenen Songs und Einstellungen bleiben. Es lässt sich nicht rückgängig machen.'));
      return;
    }
    // the sound of the recordings too, not only their index: it is the largest thing the app keeps
    void clearTakes();
    store.skills.data = {};
    store.runs = [];
    store.best = {};
    store.speeds = {};
    store.sessions = [];
    store.progress = {};
    store.reviews = {};
    store.practice = {};
    store.ratings = [];
    store.takes = {};
    store.save();
    $('#reset', root).textContent = L('Erased', 'Gelöscht');
  };
  return () => {
    left = true;
    stopTest();
    endRecording(false);
    clearTimeout(measuring);
    stopMeasure();
    engine.clearTicks();
  };
};
