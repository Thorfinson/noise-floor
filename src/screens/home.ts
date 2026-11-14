/** Home, progress and settings: the plain pages. */
import { encodeWav } from '../audio/wav';
import { engine } from '../audio/engine';
import { dayMonth, L, lang, num, setLang } from '../core/i18n';
import { KINDS, kindOf, type SkillKind } from '../core/skills';
import { store, type Instrument } from '../core/store';
import { allPieces, KEY_CHORDS } from '../music/content';
import { CHORDS, noteName, pianoChord } from '../music/theory';
import { $, $$, applyScale, esc, go, hear, icon, keys, micMeter, type Screen } from '../ui/dom';
import { describe, pieceMaterial } from './learn';
import { currentPiece, currentSong, currentSongToSing } from '../music/difficulty';
import { rangeMeasured, voiceRange } from './sing';
import { learningPath, OPEN_CHORDS, type Stage } from '../music/path';
import { LANDS, Trail, type StoneState } from '../ui/trail';
import { begun, bindChoose, chooseRow, currentId, dayOf, describeSung, doneToday, focusChord, fullPlan, instrumentOf, plan, resumeAt, setPlanned, songChoices, todaysChords, todaysKeyChords } from './session';

import { skillLabel } from '../music/labels';
import { progressTabs } from './repertoire';
import { bindPlan, planCard, weekLine } from './habit';
import { weekStats } from './trends';
import { relDay } from '../music/review';
import { askAgain, chooseFile, fileState, forgetFile, takeNewer } from '../core/progressfile';
import { TUNINGS } from '../music/tuning';
import { dayStart } from '../core/days';

export { skillLabel };

/**
 * "4 of 5 strings" for a chord that is not clean yet. What is kept is the share of clean strings in sixths
 * (so that every chord counts alike); this turns it back into the strings the chord really has.
 */
export function cleanStrings(key: string, sixths: number): string {
  const id = key.split(':')[1];
  if (id.startsWith('p.')) {
    // on the piano: every key of the chord, and the chord as a whole
    const n = pianoChord(id.slice(2)).midis.length + 1;
    return L(`${Math.min(n - 1, Math.round((sixths * n) / 6))} of ${n} steps`, `${Math.min(n - 1, Math.round((sixths * n) / 6))} von ${n} Schritten`);
  }
  const n = CHORDS[id]?.frets.filter((f) => f >= 0).length ?? 6;
  return L(`${Math.min(n - 1, Math.round((sixths * n) / 6))} of ${n} strings`, `${Math.min(n - 1, Math.round((sixths * n) / 6))} von ${n} Saiten`);
}

export const pips = (level: number, cls = 'on'): string => `<span class="pips" role="img" aria-label="${L(`level ${level} of 5`, `Stufe ${level} von 5`)}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= level ? cls : ''}"></i>`).join('')}</span>`;

/** Shows the page again after something it depends on has changed. */
const refresh = (): void => void dispatchEvent(new HashChangeEvent('hashchange'));
/** The plan on show as a list to change: which steps the player keeps. Kept while the app is open. */
let editingPlan = false;

/** Home is today's session: one clear place to start, everything else underneath. */
export const home: Screen = (root) => {
  const now = Date.now();
  const inst = store.settings.instrument;
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
  const link = (href: string, label: string): string => `<a class="hb" href="#/${href}">${esc(label)}</a>`;
  // today's session is through: the page says so, shows what was measured today, and offers more
  if (doneToday(inst, now) && !at) return doneHome(root, now, link);
  root.innerHTML = `<div class="page mid">
    ${fileBanner()}
    <div class="today">
      <div>
        <p class="kick">${first ? L('Start here', 'Fang hier an') : weekLine(now)}</p>
        <h1>${at ? L(`Today: ${left} minutes left`, `Heute: noch ${left} ${left === 1 ? 'Minute' : 'Minuten'}`) : L(`Today: about ${minutes} minutes`, `Heute: etwa ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`)}</h1>
        <p class="lede">${at ? L(`You stopped after step ${at}. It goes on with step ${at + 1}: ${esc(steps[at].title)}.`, `Du hast nach Schritt ${at} aufgehört. Es geht weiter mit Schritt ${at + 1}: ${esc(steps[at].title)}.`) : first ? intro : L(`Today's goal: ${esc(goal)}.`, `Heutiges Ziel: ${esc(goal)}.`)}</p>
        <div class="row" style="margin-top:26px"><a class="btn primary big" id="go" href="#/session">${at ? L(`Continue at step ${at + 1}`, `Weiter mit Schritt ${at + 1}`) : L("Start today's session", 'Heutige Session starten')} <kbd>${L('Space', 'Leertaste')}</kbd></a>${at ? `<a class="btn big" id="anew" href="#/session/new">${L('Start from step 1', 'Ab Schritt 1 beginnen')}</a>` : `<a class="btn big" id="short" href="#/session/short" title="${L('The first step and the song: five minutes count as fully as a whole session.', 'Der erste Schritt und der Song: Fünf Minuten zählen so voll wie eine ganze Session.')}">${L('Only 5 minutes', 'Nur 5 Minuten')}</a>`}</div>
        ${first ? '' : weekNote(inst, now)}
      </div>
      <div class="planside">${
        editingPlan && !at
          ? `<ol class="plan editing" aria-label="${L('The steps of your plan', 'Die Schritte deines Plans')}">${fullPlan(now)
              .map((st) => {
                const on = !(store.planOff[inst] ?? []).includes(st.kind);
                return `<li class="${on ? '' : 'off'}"><label class="pl"><input type="checkbox" data-kind="${esc(st.kind)}"${on ? ' checked' : ''}><div><b>${esc(st.title)}</b><small>${esc(st.detail)}</small></div></label><span class="t">${st.minutes} min</span></li>`;
              })
              .join('')}</ol>
            <p class="note">${L('Leave out what you do not need: the plan stays so every day until you bring a step back. The app still fills each step from what it measured.', 'Lass weg, was du nicht brauchst: Der Plan bleibt jeden Tag so, bis du einen Schritt zurückholst. Die App füllt jeden Schritt weiter aus dem, was sie gemessen hat.')}</p>
            <div class="row"><button class="btn" id="plandone">${L('Done', 'Fertig')}</button></div>`
          : `<ol class="plan" aria-label="${L("Today's steps", 'Heutige Schritte')}">${steps.map((st, i) => `<li class="${i < at ? 'done' : i === at ? 'cur' : ''}"><span class="n">${i < at ? icon('check') : i + 1}</span><div><b>${esc(st.title)}</b><small>${esc(st.detail)}</small></div><span class="t">${st.minutes} min</span></li>`).join('')}</ol>${at ? '' : `<div class="row planrow"><button class="btn quiet" id="editplan">${L('Change the plan', 'Plan ändern')}</button>${(store.planOff[inst] ?? []).length ? `<span class="note">${L(`${(store.planOff[inst] ?? []).length} left out by you`, `${(store.planOff[inst] ?? []).length} von dir weggelassen`)}</span>` : ''}</div>`}${!at && !begun(currentId(inst)) ? chooseRow(songChoices(inst), currentId(inst)) : ''}`
      }</div>
    </div>
    <div class="homefoot">
    <div>
      <p class="k" style="margin:0 0 10px">${L('Or one thing on its own', 'Oder eine Übung für sich')}</p>
      <nav class="links" aria-label="${L('Single exercises', 'Einzelne Übungen')}">
        ${voice ? link('sing/' + sung.id, L('Song: ', 'Song: ') + sung.title) : piano ? link('piano/' + piece.id, L('Piece: ', 'Stück: ') + piece.title) : link('song/' + song.id, L('Song: ', 'Song: ') + song.title)}
        ${voice ? link('match', L('Match the tone', 'Töne treffen')) + link('hold', L('Hold a tone', 'Einen Ton halten')) + link('range', rangeMeasured() ? L(`Your range: ${noteName(voiceRange()[0])} to ${noteName(voiceRange()[1])}`, `Dein Umfang: ${noteName(voiceRange()[0])} bis ${noteName(voiceRange()[1])}`) : L('Find your range', 'Deinen Umfang finden')) + link('stride', L('Rhythm game', 'Rhythmusspiel')) : piano ? link('tuner/piano', L('Piano pitch', 'Tonhöhe des Klaviers')) + link('keys/' + encodeURIComponent(todaysKeyChords(now)[0] ?? 'C'), L('Chord check', 'Akkord-Check')) + link('stride', L('Rhythm game', 'Rhythmusspiel')) : link('tuner', L('Guitar tuner', 'Stimmgerät für die Gitarre')) + link('chord/' + encodeURIComponent(chord), L('Chord check', 'Akkord-Check')) + link('stride', L('Rhythm game', 'Rhythmusspiel'))}
      </nav>
      <p class="note" style="margin-top:14px">${engine.running ? (engine.micOn ? L('Microphone is on.', 'Das Mikrofon ist an.') : L('Listening to the practice instrument only.', 'Hört nur auf das Übungsinstrument.')) : L('The microphone starts when you begin.', 'Das Mikrofon startet, wenn du beginnst.')}</p>
    </div>
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

/** On the start page: a progress file saved later on another computer, or one the browser must allow again. */
function fileBanner(): string {
  const f = fileState();
  if (f.newer)
    return `<div class="filebar" role="status"><p>${L(`Your progress file is newer than this browser: saved ${dayMonth(f.newer)} at ${new Date(f.newer).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })}, on another computer perhaps.`, `Deine Fortschrittsdatei ist neuer als dieser Browser: gespeichert am ${dayMonth(f.newer)} um ${new Date(f.newer).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })}, vielleicht auf einem anderen Computer.`)}</p><div class="row"><button class="btn primary" id="filetake">${L('Load it', 'Laden')}</button><button class="btn quiet" id="filekeep">${L('Keep this browser’s', 'Die dieses Browsers behalten')}</button></div></div>`;
  if (f.status === 'ask') return `<div class="filebar" role="status"><p>${L(`Your progress is kept in ${f.name}: the browser asks before the app may use it again.`, `Dein Fortschritt wird in ${f.name} gehalten: Der Browser fragt, bevor die App sie wieder nutzen darf.`)}</p><div class="row"><button class="btn" id="fileallow">${L('Allow', 'Erlauben')}</button></div></div>`;
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
  root.innerHTML = `<div class="page mid">
    <div class="today">
      <div>
        <p class="kick">${weekLine(now)}</p>
        <h1>${L("Today's session is done.", 'Die heutige Session ist geschafft.')}</h1>
        <p class="lede">${measured.length ? L(`Measured today: ${measured.length} ${measured.length === 1 ? 'skill' : 'skills'}. Everything is kept on this computer; tomorrow's plan takes up what needs it most.`, `Heute gemessen: ${measured.length} ${measured.length === 1 ? 'Fähigkeit' : 'Fähigkeiten'}. Alles bleibt auf diesem Computer gespeichert; der Plan für morgen greift auf, was es am meisten braucht.`) : L("Everything is kept on this computer; tomorrow's plan takes up what needs it most.", 'Alles bleibt auf diesem Computer gespeichert; der Plan für morgen greift auf, was es am meisten braucht.')} ${L('If you want more today:', 'Wenn du heute noch mehr willst:')}</p>
        ${weekNote(inst, now)}
        <div class="row" style="margin-top:22px"><a class="btn primary big" id="go" href="#/session/new">${L('Another round', 'Noch eine Runde')} <kbd>${L('Space', 'Leertaste')}</kbd></a><a class="btn" href="#/nf">${L('Play a game', 'Ein Spiel spielen')}</a><a class="btn" href="#/songs">${songsLabel}</a></div>
      </div>
      <div class="donecard" aria-label="${L('Measured today', 'Heute gemessen')}">
        <p class="k" style="margin:0 0 10px">${L('Measured today', 'Heute gemessen')}</p>
        ${top.length ? `<ul class="res">${top.map(([key, r]) => `<li><span class="k2">${esc(skillLabel(key))}</span>${pips(r.level)}</li>`).join('')}</ul>${measured.length > top.length ? `<p class="note">${L(`and ${measured.length - top.length} more`, `und ${measured.length - top.length} weitere`)} · <a href="#/progress">${L('the path', 'der Weg')}</a></p>` : `<p class="note"><a href="#/progress">${L('See everything on the path', 'Alles auf dem Weg ansehen')}</a></p>`}` : `<p class="note">${L('Nothing was measured this time. That is fine: the steps are still there tomorrow.', 'Diesmal wurde nichts gemessen. Das ist in Ordnung: Die Schritte sind morgen noch da.')}</p>`}
      </div>
    </div>
    <div>
      <p class="k" style="margin:0 0 10px">${L('Or one thing on its own', 'Oder eine Übung für sich')}</p>
      <nav class="links" aria-label="${L('Single exercises', 'Einzelne Übungen')}">${inst === 'voice' ? link('match', L('Match the tone', 'Töne treffen')) + link('hold', L('Hold a tone', 'Einen Ton halten')) : inst === 'piano' ? link('tuner/piano', L('Piano pitch', 'Tonhöhe des Klaviers')) + link('keys/C', L('Chord check', 'Akkord-Check')) : link('tuner', L('Guitar tuner', 'Stimmgerät für die Gitarre')) + link('chord/Em', L('Chord check', 'Akkord-Check'))}${link('stride', L('Rhythm game', 'Rhythmusspiel'))}</nav>
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
  // the path: where you are, what you can do, what comes next
  const inst = store.settings.instrument;
  const piano = inst === 'piano';
  const stages = learningPath(inst, now);
  const main = stages.filter((s) => s.state !== 'side');
  const side = stages.filter((s) => s.state === 'side');
  const here = main.find((s) => s.state === 'here');
  const doneStages = main.filter((s) => s.state === 'done').length;
  /** the stage whose sheet is open: where the player is, until another is picked */
  let picked = (here ?? main[main.length - 1]).id;
  const total = (s: Stage): number => s.items.length;
  const share = (s: Stage): number => (total(s) ? Math.round((100 * s.done) / total(s)) : 0);
  const where = (s: Stage): string => (s.state === 'done' ? L('done', 'erledigt') : s.state === 'here' ? L('you are here', 'du bist hier') : s.state === 'side' ? L('beside the path', 'neben dem Weg') : L('ahead', 'noch vor dir'));
  // every stone of the map can be picked: a strip of the picture each
  const stopAt = (i: number): number => 13 + (64 * i) / Math.max(1, main.length - 1);
  const stopWide = Math.min(20, 64 / Math.max(1, main.length - 1));

  root.innerHTML = `<div class="page way">
    ${progressTabs('progress')}
    <div class="wayhead">
      <div><p class="kick">${L(`Your path · ${inst}`, `Dein Weg · ${inst === 'voice' ? 'Stimme' : piano ? 'Klavier' : 'Gitarre'}`)}</p>
        <h1>${here ? L(`You are at: ${esc(here.title.toLowerCase())}`, `Du bist bei: ${esc(here.title)}`) : L('Every stage of the path is done.', 'Jede Etappe des Wegs ist geschafft.')}</h1>
        <p class="lede">${here ? `${L(`${here.done} of ${total(here)} done.`, `${here.done} von ${total(here)} erledigt.`)}${here.next ? L(` Next: <b>${esc(here.next)}</b>.`, ` Als Nächstes: <b>${esc(here.next)}</b>.`) : ''}` : L('What is left is beside the path, and whatever you add yourself.', 'Was bleibt, liegt neben dem Weg, dazu alles, was du selbst hinzufügst.')} ${L('The session works on this by itself; every stone on the map can be picked, and nothing is locked.', 'Die Session arbeitet von selbst daran; jeder Stein auf der Karte lässt sich wählen, und nichts ist gesperrt.')}</p></div>
      <div class="row"><a class="btn primary" href="#/session">${L("Start today's session", 'Heutige Session starten')}</a><a class="btn" href="#/songs">${piano ? L('All pieces', 'Alle Stücke') : L('All songs', 'Alle Songs')}</a></div>
    </div>
    <div class="journey">
      <canvas id="waymap" role="img" aria-label="${L('The path as a way over stepping stones: one stone for each stage. The stones of the stages that are done are lit, and the wanderer stands where you are.', 'Der Weg als Pfad über Trittsteine: ein Stein für jede Etappe. Die Steine der geschafften Etappen leuchten, und der Wanderer steht, wo du bist.')}"></canvas>
      <div class="stops" role="tablist" aria-label="${L('The stages of the path', 'Die Etappen des Wegs')}">${main
        .map((s, i) => `<button class="stop" role="tab" id="stop-${s.id}" data-stage="${s.id}" style="left:${(stopAt(i) - stopWide / 2).toFixed(2)}%;width:${stopWide.toFixed(2)}%" aria-selected="${s.id === picked}" aria-controls="stage"><span class="sr">${L(`Stage ${i + 1}: ${esc(s.title)}. ${s.done} of ${total(s)}, ${where(s)}.`, `Etappe ${i + 1}: ${esc(s.title)}. ${s.done} von ${total(s)}, ${where(s)}.`)}</span></button>`)
        .join('')}</div>
    </div>
    <section class="sheet" id="stage" role="tabpanel" aria-live="polite"></section>
    <div class="besides"><p class="k">${L('Beside the path · these take months, and never stand in the way', 'Neben dem Weg · das dauert Monate und steht nie im Weg')}</p>
      <div class="sidecards">${side.map((s) => `<button class="sidecard" data-stage="${s.id}" aria-pressed="false"><b>${esc(s.short)}</b><span>${L(`${s.done} of ${total(s)}`, `${s.done} von ${total(s)}`)}</span><span class="meter"><i style="width:${share(s)}%"></i></span></button>`).join('')}</div></div>
    <section class="measured">
      <div><p class="kick">${L('Everything measured', 'Alles Gemessene')}</p><h2>${L(`Rank ${store.skills.rank()}`, `Rang ${store.skills.rank()}`)}</h2><p class="lede">${L('The rank is the total of your skill levels. A level is given for what the microphone heard, never for time spent, and it is never taken away. A skill you have not confirmed for a week is marked rusty and comes back more often in runs.', 'Der Rang ist die Summe deiner Stufen. Eine Stufe gibt es für das, was das Mikrofon gehört hat, nie für die geübte Zeit, und sie wird nie wieder weggenommen. Was du eine Woche lang nicht bestätigt hast, gilt als eingerostet und kommt in Runden öfter dran.')}</p></div>
      <dl class="stats"><div><dt>${L('Rank', 'Rang')}</dt><dd>${store.skills.rank()}</dd></div><div><dt>${L('Days played', 'Tage gespielt')}</dt><dd>${new Set(store.sessions.map((t) => new Date(t).toDateString())).size}</dd></div><div><dt>${L('Days in a row', 'Tage in Folge')}</dt><dd>${store.streak(now)}</dd></div>${Object.entries(store.best)
        .map(([t, s]) => `<div><dt>${L(`Best ${esc(names[t] ?? t)}`, `Bestwert ${esc(names[t] ?? t)}`)}</dt><dd>${num(s)}</dd></div>`)
        .join('')}</dl>
      ${body || `<p class="note">${L('Nothing measured yet. Play a lesson, a chord check or a run.', 'Noch nichts gemessen. Spiel eine Lektion, einen Akkord-Check oder eine Runde.')}</p>`}
    </section>
  </div>`;

  const sheet = $('#stage', root);
  function show(): void {
    const s = stages.find((x) => x.id === picked) ?? main[0];
    const n = main.indexOf(s);
    // a stage of chords can be confirmed: all of them in a row, from memory
    const check = s.id === 'open' ? { key: 'check:open', href: `#/chord/check/${OPEN_CHORDS.join('/')}`, say: L('all eight in a row, from memory', 'alle acht hintereinander, aus dem Kopf') } : s.id === 'chords' ? { key: 'check:keys', href: `#/keys/check/${KEY_CHORDS.join('/')}`, say: L('all six in a row, from memory', 'alle sechs hintereinander, aus dem Kopf') } : null;
    const confirmed = !!check && s.done === total(s);
    sheet.innerHTML = `<header class="shd ${s.state}">
        <span class="badge">${s.state === 'done' ? icon('check') : n >= 0 ? n + 1 : '+'}</span>
        <div><p class="k">${n >= 0 ? L(`Stage ${n + 1} of ${main.length}`, `Etappe ${n + 1} von ${main.length}`) : L('Beside the path', 'Neben dem Weg')} · ${where(s)}</p><h2>${esc(s.title)}</h2><p>${esc(s.goal)}</p></div>
        <div class="prog"><b>${s.done}<small>${L(` of ${total(s)}`, ` von ${total(s)}`)}</small></b><span class="meter"><i style="width:${share(s)}%"></i></span></div>
      </header>
      ${
        confirmed
          ? store.progress[check!.key]
            ? `<p class="note">${L(`Stage confirmed on ${dayMonth(store.progress[check!.key])}: ${check!.say}.`, `Etappe bestätigt am ${dayMonth(store.progress[check!.key])}: ${check!.say}.`)}</p>`
            : `<p><a class="btn primary" href="${check!.href}">${L(`Stage check: ${check!.say}`, `Etappen-Check: ${check!.say}`)}</a></p>`
          : s.next
            ? `<p class="go"><a class="btn primary" href="${s.nextHref ?? '#/session'}">${L(`Go on with: ${esc(s.next)}`, `Weiter mit: ${esc(s.next)}`)}${icon('right')}</a><span class="note">${L("or let today's session take care of it.", 'oder lass die heutige Session das übernehmen.')}</span></p>`
            : ''
      }
      <ul class="items">${s.items
        .map((i) => `<li class="${i.state}${i.rusty ? ' rusty' : ''}">${i.href ? `<a href="${i.href}">` : '<span>'}<i class="st" aria-hidden="true">${i.state === 'done' ? icon('check') : ''}</i><b>${esc(i.label)}</b><small>${esc(i.rusty ? L('rusty: play it again', 'eingerostet: spiel es noch einmal') : i.note || (i.state === 'new' ? L('new', 'neu') : ''))}</small>${i.href ? '</a>' : '</span>'}</li>`)
        .join('')}</ul>
      <p class="note legend"><span class="key done"></span>${L('done', 'erledigt')} <span class="key work"></span>${L('in work', 'in Arbeit')} <span class="key new"></span>${L('still new', 'noch neu')} <span class="key rusty"></span>${L('done, but not played for a week', 'erledigt, aber eine Woche nicht gespielt')}</p>`;
    $$('.stop', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.stage === picked)));
    $$('.sidecard', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.stage === picked)));
  }
  $$('[data-stage]', root).forEach(
    (b) =>
      (b.onclick = () => {
        picked = b.dataset.stage!;
        show();
      }),
  );
  show();

  // the map: the way as stepping stones in the land the player has got to
  const trail = new Trail($<HTMLCanvasElement>('#waymap', root), Math.min(LANDS.length - 1, Math.floor((doneStages * LANDS.length) / Math.max(1, main.length))), 215);
  const stones = main.map((_, i) => ({ at: i, chord: String(i + 1), bar: i }));
  const states = main.map((s): StoneState => (s.state === 'done' ? 'hit' : 'ahead'));
  const walker = here ? main.indexOf(here) : main.length - 1 + 0.8;
  if (!here) trail.end(true);
  let raf = requestAnimationFrame(function frame(ts: number): void {
    trail.draw({ beat: 0, stones, states, bars: main.length, name: (c) => c, count: () => '', map: { walker, mark: main.findIndex((s) => s.id === picked), label: (i) => [main[i].short, L(`${main[i].done} of ${total(main[i])}`, `${main[i].done} von ${total(main[i])}`)] } }, ts / 1000);
    raf = requestAnimationFrame(frame);
  });
  const stopKeys = keys({
    ArrowRight: () => {
      const i = main.findIndex((s) => s.id === picked);
      picked = main[Math.min(main.length - 1, i + 1)].id;
      show();
    },
    ArrowLeft: () => {
      const i = main.findIndex((s) => s.id === picked);
      picked = main[Math.max(0, i < 0 ? 0 : i - 1)].id;
      show();
    },
  });
  return () => {
    cancelAnimationFrame(raf);
    stopKeys();
  };
};

export const settings: Screen = (root) => {
  const s = store.settings;
  const field = (id: string, label: string, small: string, control: string): string => `<div class="field"><label for="${id}">${label}<small>${small}</small></label>${control}</div>`;
  const check = (id: string, on: boolean): string => `<input id="${id}" type="checkbox" ${on ? 'checked' : ''}>`;
  root.innerHTML = `<div class="page">
    <div><p class="kick">${L('Settings', 'Einstellungen')}</p><h1>${L('Listening and tuning', 'Hören und Stimmen')}</h1></div>
    <div>
      <p class="k">${L('Language', 'Sprache')}</p>
      ${field('lang', L('Language of the app', 'Sprache der App'), L('English or German. The same choice is at the top right, EN and DE.', 'Englisch oder Deutsch. Dieselbe Wahl gibt es oben rechts, EN und DE.'), `<select id="lang"><option value="en" lang="en"${lang() === 'en' ? ' selected' : ''}>English</option><option value="de" lang="de"${lang() === 'de' ? ' selected' : ''}>Deutsch</option></select>`)}
      <p class="k">${L('Seeing it', 'Ansicht')}</p>
      ${field('scale', L('Size of the type', 'Schriftgröße'), L('Larger, for reading from a metre or more away with the instrument in your hands. On the screens you play at it enlarges what you read while playing (the instruction, the numbers and names of the music, what the app says), and the buttons keep their size.', 'Größer, zum Lesen aus einem Meter oder mehr, mit dem Instrument in den Händen. Auf den Bildschirmen, an denen du spielst, vergrößert sie, was du beim Spielen liest (die Anweisung, die Zahlen und Namen der Musik, was die App sagt), und die Knöpfe behalten ihre Größe.'), `<select id="scale">${[[1, L('Normal', 'Normal')], [1.15, L('Larger', 'Größer')], [1.3, L('Largest', 'Am größten')]].map(([v, n]) => `<option value="${v}"${s.uiScale === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`)}
      ${field('capo', L('Capo', 'Kapodaster'), L('The fret the capo sits at. The app hears the guitar as written: a C shape stays a C shape, and everything sounds that much higher.', 'Der Bund, in dem der Kapodaster sitzt. Die App hört die Gitarre wie notiert: Ein C-Griff bleibt ein C-Griff, und alles klingt entsprechend höher.'), `<select id="capo">${[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}"${n === (s.capo || 0) ? ' selected' : ''}>${n ? L(`Fret ${n}`, `${n}. Bund`) : L('None', 'Keiner')}</option>`).join('')}</select>`)}
      ${field('tuning', L('Tuning of the guitar', 'Stimmung der Gitarre'), L('Tuned a half or a whole step down, the guitar is heard as written, as with a capo. Drop D and the open tunings are in the tuner, for playing of your own.', 'Einen Halb- oder Ganzton tiefer gestimmt, wird die Gitarre wie notiert gehört, wie mit Kapodaster. Drop D und die offenen Stimmungen sind im Stimmgerät, zum eigenen Spielen.'), `<select id="tuning">${TUNINGS()
        .filter((t) => t.lessons)
        .map((t) => `<option value="${t.id}"${t.id === s.tuning ? ' selected' : ''}>${esc(t.name)}</option>`)
        .join('')}</select>`)}
      ${field('lefty', L('Left-handed guitar', 'Linkshänder-Gitarre'), L('Chord pictures and the fretboard mirrored, the high e string on the left, as you see your guitar.', 'Griffbilder und Griffbrett gespiegelt, die hohe e-Saite links, so wie du deine Gitarre siehst.'), check('lefty', s.leftHanded))}
      <p class="k">${L('Microphone', 'Mikrofon')}</p>
      ${field('mic', L('Use the microphone', 'Mikrofon benutzen'), L('Off: the app only hears the built-in practice instrument.', 'Aus: Die App hört nur das eingebaute Übungsinstrument.'), check('mic', s.mic))}
      ${field('dev', L('Which microphone', 'Welches Mikrofon'), L('The names appear once the microphone has been allowed.', 'Die Namen erscheinen, sobald das Mikrofon erlaubt ist.'), `<select id="dev"><option value="">${L('System default', 'Systemstandard')}</option></select>`)}
      <div class="field"><div><b>${L('Hearing check', 'Hörcheck')}</b><small>${store.progress[`check:${s.instrument}`] ? L(`Last time ${store.progress[`checkscore:${s.instrument}`] ?? 0}% heard right, ${dayMonth(store.progress[`check:${s.instrument}`])}.`, `Zuletzt ${store.progress[`checkscore:${s.instrument}`] ?? 0} % richtig gehört, am ${dayMonth(store.progress[`check:${s.instrument}`])}.`) : L('Two minutes: the app asks for strings, chords, keys or notes and says how well it hears your instrument in your room, and what to change.', 'Zwei Minuten: Die App bittet um Saiten, Akkorde, Tasten oder Töne und sagt, wie gut sie dein Instrument in deinem Raum hört, und was du ändern kannst.')}</small></div><div class="row"><a class="btn" href="#/check">${L('Start the hearing check', 'Hörcheck starten')}</a></div></div>
      <div class="field"><div><b>${L('Is it hearing you?', 'Hört es dich?')}</b><small id="testmsg">${L('Start the test and play a note. The bars should move and the note should be named.', 'Starte den Test und spiel einen Ton. Die Balken sollten sich bewegen, und der Ton sollte benannt werden.')}</small></div><div class="row"><button class="btn" id="test">${L('Test the microphone', 'Mikrofon testen')}</button><span id="testout" hidden>${micMeter()}</span><b id="heard"></b></div></div>
      <div class="field"><div><b>${L('When something is not heard right', 'Wenn etwas nicht richtig gehört wird')}</b><small id="recmsg">${L('Record it: play what the app gets wrong, for up to 30 seconds. The file holds exactly what the app heard and goes to your downloads folder.', 'Nimm es auf: Spiel bis zu 30 Sekunden lang, was die App falsch versteht. Die Datei enthält genau das, was die App gehört hat, und landet in deinem Download-Ordner.')}</small></div><div class="row"><button class="btn" id="rec">${L('Record', 'Aufnehmen')}</button></div></div>
      <p class="k">${L('Playing', 'Spielen')}</p>
      ${field('click', L('Metronome loudness', 'Lautstärke des Metronoms'), L('For playing along with the click. All the way left: silent, the marker still moves.', 'Zum Mitspielen mit dem Klick. Ganz links: stumm, die Markierung bewegt sich trotzdem.'), `<input id="click" type="range" min="0" max="1" step="0.05" value="${s.click}">`)}
      ${field('chimes', L('Sounds of the games', 'Klänge der Spiele'), L('Small glassy chimes for a hit, a cleared phrase, a lit stone. They are pitched so high that the listening is not disturbed by them. All the way left: silent.', 'Kleine gläserne Klänge für einen Treffer, eine geschaffte Phrase, einen leuchtenden Stein. Sie liegen so hoch, dass sie das Zuhören nicht stören. Ganz links: stumm.'), `<input id="chimes" type="range" min="0" max="1" step="0.05" value="${s.chimes}">`)}
      ${field('csound', L('Metronome sound', 'Klang des Metronoms'), L('The high tick does not disturb the listening when the microphone hears it from the speakers. The low click is easier on the ear, but only with headphones.', 'Das hohe Ticken stört das Zuhören nicht, wenn das Mikrofon es aus den Lautsprechern hört. Der tiefe Klick ist angenehmer fürs Ohr, aber nur mit Kopfhörern.'), `<select id="csound"><option value="tick"${s.clickSound === 'tick' ? ' selected' : ''}>${L('High tick (for speakers)', 'Hohes Ticken (für Lautsprecher)')}</option><option value="click"${s.clickSound === 'click' ? ' selected' : ''}>${L('Low click (headphones only)', 'Tiefer Klick (nur mit Kopfhörern)')}</option></select>`)}
      ${field('small', L('Small shapes for barre chords', 'Kleine Griffe für Barré-Akkorde'), L('Songs and runs show F♯m and Bm on four strings until the full barre has rung clean in the chord check.', 'Songs und Runden zeigen F♯m und Bm auf vier Saiten, bis das volle Barré im Akkord-Check sauber geklungen hat.'), check('small', s.smallShapes))}
      ${field('mute', L('Pause a run by muting the strings', 'Eine Runde durch Abdämpfen pausieren'), L('Hit the muted strings twice in a row and then stop: that pauses a Noise Floor run. The same again goes on.', 'Schlag die abgedämpften Saiten zweimal hintereinander an und hör dann auf: Das pausiert eine Noise-Floor-Runde. Dasselbe noch einmal, und es geht weiter.'), check('mute', s.mutePause))}
      ${field('strum', L('Choose menu cards from the instrument', 'Menükarten mit dem Instrument wählen'), L('Strum Em, Am or C, or play C, D or E on the piano, for the first, second or third card. With the voice the number keys choose.', 'Schlag Em, Am oder C an oder spiel C, D oder E am Klavier, für die erste, zweite oder dritte Karte. Bei der Stimme wählen die Zifferntasten.'), check('strum', s.strumSelect))}
      ${field('prac', L('Show the practice instrument', 'Übungsinstrument zeigen'), L('Buttons and keys (N, W, M, B, X) that play notes for you, to try things without an instrument.', 'Knöpfe und Tasten (N, W, M, B, X), die Töne für dich spielen, um ohne Instrument etwas auszuprobieren.'), check('prac', s.practiceInstrument))}
      ${field('rectakes', L('Record takes at full speed', 'Durchgänge im vollen Tempo aufnehmen'), L('To listen back, bar by bar, and to hear weeks of practice: the first recording of each song and the latest stay in this browser, nowhere else.', 'Zum Anhören, Takt für Takt, und um Wochen des Übens zu hören: Die erste Aufnahme jedes Songs und die neueste bleiben in diesem Browser, nirgends sonst.'), check('rectakes', s.recordTakes))}
      ${field('autotempo', L('In a loop, the tempo rises by itself', 'In der Schleife steigt das Tempo von selbst'), L('After three clean runs in a row, 5% faster, up to 125%.', 'Nach drei sauberen Durchläufen in Folge 5 % schneller, bis 125 %.'), check('autotempo', s.autoTempo))}
      ${field('weekgoal', L('Days a week to play', 'Tage pro Woche zum Spielen'), L('The week counts, not an unbroken chain: missed days do not undo anything.', 'Die Woche zählt, nicht eine ununterbrochene Kette: Verpasste Tage machen nichts zunichte.'), `<select id="weekgoal">${[2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}"${s.weekGoal === n ? ' selected' : ''}>${L(`${n} days`, `${n} Tage`)}</option>`).join('')}</select>`)}
      <p class="k">${L('Tuning', 'Stimmung')}</p>
      ${field('a4', L('Guitar: tuning reference, A in Hz', 'Gitarre: Stimmton, A in Hz'), L('440 is standard.', '440 ist der Standard.'), `<input id="a4" type="number" min="400" max="470" step="0.1" value="${s.a4}">`)}
      ${field('pa4', L('Piano: pitch of its A in Hz', 'Klavier: Tonhöhe seines A in Hz'), L('Measured at the start of every piano session. An old piano is often lower than 440.', 'Wird zu Beginn jeder Klavier-Session gemessen. Ein altes Klavier liegt oft tiefer als 440.'), `<input id="pa4" type="number" min="400" max="470" step="0.1" value="${s.pianoA4}">`)}
      ${field('buzz', L('Buzz tolerance', 'Toleranz fürs Schnarren'), L('Left: stricter, more strings count as buzzing. Right: more forgiving.', 'Links: strenger, mehr Saiten gelten als schnarrend. Rechts: nachsichtiger.'), `<input id="buzz" type="range" min="0.2" max="1.2" step="0.05" value="${s.buzz}">`)}
      ${field('ring', L('How long a string must ring', 'Wie lange eine Saite klingen muss'), L('For the chord check. Left: forgiving. Right: a string that sounds only briefly counts as muted too. The chord check also adjusts to how your guitar rings; this is the least it asks for.', 'Für den Akkord-Check. Links: nachsichtig. Rechts: Eine Saite, die nur kurz klingt, gilt auch als abgedämpft. Der Akkord-Check passt sich außerdem an, wie deine Gitarre klingt; dies ist das Mindeste, was er verlangt.'), `<input id="ring" type="range" min="0.03" max="0.4" step="0.01" value="${s.ring}">`)}
      <p class="k">${L('Voice', 'Stimme')}</p>
      <div class="field"><div><b>${L('Your range', 'Dein Stimmumfang')}</b><small>${rangeMeasured() ? L(`Measured: ${noteName(s.voiceLow)} to ${noteName(s.voiceHigh)}. Songs are set a little inside it.`, `Gemessen: ${noteName(s.voiceLow)} bis ${noteName(s.voiceHigh)}. Songs liegen etwas innerhalb davon.`) : L('Not measured yet: the first singing session does it. Until then songs are set for a middle voice.', 'Noch nicht gemessen: Die erste Gesangs-Session misst ihn. Bis dahin liegen Songs für eine mittlere Stimme.')}</small></div><div class="row"><a class="btn" href="#/range">${rangeMeasured() ? L('Measure again', 'Neu messen') : L('Measure now', 'Jetzt messen')}</a></div></div>
      ${field('vtol', L('How near a sung note must be', 'Wie genau ein gesungener Ton sein muss'), L('In cents, a hundredth of a semitone. 50 is the measure singing studies use: the right semitone. 35 is stricter; 75 is kind to a voice that is just starting.', 'In Cent, einem Hundertstel Halbton. 50 ist das Maß, das Gesangsstudien nehmen: der richtige Halbton. 35 ist strenger; 75 ist nachsichtig mit einer Stimme, die gerade anfängt.'), `<select id="vtol">${[35, 50, 75].map((v) => `<option value="${v}"${s.voiceTol === v ? ' selected' : ''}>${v} ${L('cents', 'Cent')}</option>`).join('')}</select>`)}
      <div class="field"><div><b>${L('Timing with the click', 'Timing mit dem Klick')}</b><small id="latmsg"></small></div><div class="row"><button class="btn" id="latmeasure">${L('Measure now', 'Jetzt messen')}</button><button class="btn quiet" id="latreset">${L('Forget', 'Vergessen')}</button></div></div>
      <p class="k">${L('Your data', 'Deine Daten')}</p>
      <div class="field"><div><b>${L('Progress file', 'Fortschrittsdatei')}</b><small id="filemsg"></small></div><div class="row" id="filerow"></div></div>
      <div class="field"><div><b>${L('Backup', 'Sicherung')}</b><small>${L('Everything is kept in this browser on this computer. A backup file holds your levels, scores, settings and your own songs.', 'Alles wird in diesem Browser auf diesem Computer gespeichert. Eine Sicherungsdatei enthält deine Stufen, Punkte, Einstellungen und deine eigenen Songs.')}</small></div><div class="row"><button class="btn" id="export">${L('Save a backup file', 'Sicherungsdatei speichern')}</button><button class="btn" id="import">${L('Load a backup', 'Sicherung laden')}</button><input id="file" type="file" accept="application/json,.json" hidden></div></div>
    </div>
    <div class="row"><button class="btn" id="reset">${L('Erase all progress', 'Gesamten Fortschritt löschen')}</button><span class="note" id="msg">${L('Changes are saved at once and stay on this computer.', 'Änderungen werden sofort gespeichert und bleiben auf diesem Computer.')}</span></div>
  </div>`;
  const say = (text: string): void => {
    $('#msg', root).textContent = text;
  };
  const bind = (id: string, apply: (el: HTMLInputElement) => void): void => {
    $<HTMLInputElement>('#' + id, root).onchange = (e) => {
      apply(e.target as HTMLInputElement);
      store.save();
    };
  };
  const hz = (el: HTMLInputElement): number => Math.min(470, Math.max(400, Number(el.value) || 440));
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
  bind('a4', (el) => (s.a4 = hz(el)));
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
  $('#test', root).onclick = async () => {
    stopTest();
    if (!engine.running) await engine.start({ mic: s.mic, deviceId: s.deviceId || undefined });
    await listMics();
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
    if (!engine.running) await engine.start({ mic: s.mic, deviceId: s.deviceId || undefined });
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
  $('#latmeasure', root).onclick = async () => {
    if (measuring) return;
    stopTest();
    if (!engine.running) await engine.start({ mic: s.mic, deviceId: s.deviceId || undefined });
    if (!engine.micOn) {
      $('#latmsg', root).textContent = L('This needs the microphone, and the sound must come from speakers, not headphones.', 'Dafür braucht es das Mikrofon, und der Klang muss aus Lautsprechern kommen, nicht aus Kopfhörern.');
      return;
    }
    const heard: number[] = [];
    const stop = hear(root, { onOnset: (e) => heard.push(e.time) }, (l) => (l.noteDetection = false));
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
            : L(`Kept in ${f.name}${f.lastWritten ? `, last written at ${new Date(f.lastWritten).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })}` : ''}.`, `In ${f.name} gehalten${f.lastWritten ? `, zuletzt geschrieben um ${new Date(f.lastWritten).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })}` : ''}.`);
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
      say(L('This removes all levels, scores and run history. Your own songs and settings stay. It cannot be undone.', 'Das entfernt alle Stufen, Punkte und den Verlauf der Runden. Deine eigenen Songs und Einstellungen bleiben. Es lässt sich nicht rückgängig machen.'));
      return;
    }
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
    stopTest();
    endRecording(false);
    clearTimeout(measuring);
    engine.clearTicks();
  };
};
