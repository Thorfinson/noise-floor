/**
 * The start page around the song of the week (the guitar, and the piano once it has a week): the song as the
 * title, its parts showing what sits and what comes today, one button to play, the band as a switch, the
 * player's own recordings then and now, the shelf of songs played whole, and today's set of four steps.
 * Without a song of the week the page asks for one: three that suit, or one of the player's own.
 */
import { L } from '../core/i18n';
import { store, type Instrument } from '../core/store';
import { findPiece, findSong } from '../music/content';
import { repertoire } from '../music/review';
import { songProfile } from '../music/difficulty';
import { CHORDS, chordName } from '../music/theory';
import { arcOf, chooseWeek, needsChoice, type Arc } from '../music/week';
import { dayOf } from '../core/days';
import { $, $$, esc, go, icon, keys } from '../ui/dom';
import type { SkillRecord } from '../core/skills';
import { bindPlan, planCard, weekLine } from './habit';
import { doneToday, fullPlan, plan, resumeAt, setPlanned, songChoices, type Step } from './session';
import { stepPicture } from './home';
import { bindThenNow, stopKept, thenNowPair, thenNowRows } from './thennow';

/** Shows the page again after something it depends on has changed. */
const refresh = (): void => void dispatchEvent(new HashChangeEvent('hashchange'));
/** The set on show as a list to change: which steps the player keeps. Kept while the app is open. */
let editing = false;

/** What a band choice is called on the switch. */
const BANDS = (): ['phones' | 'speakers' | 'click', string, string][] => [
  ['phones', L('Full band', 'Volle Band'), L('For headphones: drums, bass, organ and a lead', 'Für Kopfhörer: Schlagzeug, Bass, Orgel und eine Stimme')],
  ['speakers', L('Speaker band', 'Lautsprecher-Band'), L('Through speakers: a band that keeps out of what the microphone listens for', 'Über Lautsprecher: eine Band, die dem Mikrofon nicht in die Quere kommt')],
  ['click', L('Click', 'Klick'), L('The click alone', 'Nur der Klick')],
];

export const bandSwitch = (): string =>
  `<span class="wsong-band" role="group" aria-label="${L('What plays along', 'Was mitspielt')}">${BANDS()
    .map(([k, name, title]) => `<button type="button" data-band="${k}" aria-pressed="${store.settings.band === k}" title="${esc(title)}">${esc(name)}</button>`)
    .join('')}</span>`;

export function bindBandSwitch(root: HTMLElement, after = refresh): void {
  $$<HTMLButtonElement>('[data-band]', root).forEach(
    (b) =>
      (b.onclick = () => {
        store.settings.band = b.dataset.band as 'phones' | 'speakers' | 'click';
        store.save();
        after();
      }),
  );
}

/** One sentence on where the song stands: what sits, and what today brings. */
export function arcSentence(a: Arc): string {
  const n = a.next;
  if (n.kind === 'done') return L('It is on your shelf. Time for a new song.', 'Er steht im Regal. Zeit für einen neuen Song.');
  if (n.kind === 'whole') return L('Every part sits. Today: the whole song, with the band.', 'Alle Teile sitzen. Heute: der ganze Song, mit Band.');
  const p = a.parts[n.part];
  const before = n.part > 0 ? a.parts[n.part - 1] : null;
  if (n.kind === 'click') return L(`${p.label}: learned. Today in time, with the band.`, `${p.label}: gelernt. Heute im Takt, mit Band.`);
  if (p.learned > 0) return L(`${p.label}: ${p.learned} of ${p.lines.length} lines sit. Today the next.`, `${p.label}: ${p.learned} von ${p.lines.length} Zeilen sitzen. Heute die nächste.`);
  if (before) return L(`The ${before.label.toLowerCase()} runs with the band. Today: the ${p.label.toLowerCase()}.`, `${before.label} läuft mit Band. Heute: ${p.label}.`);
  return L(`Today: ${p.label.toLowerCase() === 'the song' ? 'the first lines' : 'the ' + p.label.toLowerCase()}, line by line.`, `Heute: ${p.label === 'Der Song' ? 'die ersten Zeilen' : p.label}, Zeile für Zeile.`);
}

/** The song in its parts: what sits (in time), what is today, and the whole song with its recording at the end. */
export function formStrip(a: Arc): string {
  const n = a.next;
  const cell = (cls: string, title: string, sub: string): string => `<li class="${cls}"><b>${esc(title)}</b><span>${esc(sub)}</span></li>`;
  const parts = a.parts.map((p, i) => {
    const today = (n.kind === 'learn' || n.kind === 'click') && n.part === i;
    const sits = p.clicked === p.lines.length;
    const sub = sits ? L('in time ✓', 'im Takt ✓') : today ? L('today', 'heute') : p.learned === p.lines.length ? L('learned', 'gelernt') : p.learned ? L(`${p.learned} of ${p.lines.length} lines`, `${p.learned} von ${p.lines.length} Zeilen`) : L(`${p.lines.length} ${p.lines.length === 1 ? 'line' : 'lines'}`, `${p.lines.length} ${p.lines.length === 1 ? 'Zeile' : 'Zeilen'}`);
    return cell(sits ? 'sits' : today ? 'today' : '', p.label, sub);
  });
  const whole = cell(a.whole ? 'sits' : n.kind === 'whole' ? 'today' : 'ahead', L('Whole song', 'Ganzer Song'), a.whole ? L('on the shelf ✓', 'im Regal ✓') : n.kind === 'whole' ? L('today, recorded', 'heute, aufgenommen') : L('then recorded', 'dann aufgenommen'));
  return `<ol class="wsong-form" aria-label="${L('The song in its parts', 'Der Song in Teilen')}">${parts.join('')}${whole}</ol>`;
}

/** The songs on the shelf as spines, the song of the week as an empty place at the end. */
function shelf(inst: Instrument, weekTitle: string): string {
  const items = repertoire(inst).slice(-7);
  const hues = ['#7d4a5e', '#2f5d6b', '#b9792a', '#4c5a8a', '#6b7d4a', '#8a4c4c', '#4a6b6b'];
  const spines = items.map((r, i) => `<a class="wsong-spine" href="#/songs/${encodeURIComponent(r.id)}" style="--c:${hues[i % hues.length]};--h:${58 + ((i * 7) % 14)}px" title="${esc(r.title)}"><span>${esc(r.title)}</span></a>`).join('');
  return `<div class="wsong-shelf" aria-label="${L('Your shelf', 'Dein Regal')}">${spines}<span class="wsong-spine empty" style="--h:56px" title="${esc(weekTitle)}"><span>${esc(weekTitle)}</span></span></div>`;
}

/** The chords of a song as chips. */
const chips = (ids: string[], piano = false): string => `<span class="chips2">${ids.slice(0, 5).map((c) => `<b class="chipn">${esc(chordName(c, piano))}</b>`).join('')}</span>`;

/**
 * Asks for the song of the week: three that suit the player now, each with why, and the way to bring one's own.
 * Used on the start page when there is none, and on its own page (#/week) to change it.
 */
export function chooseView(inst: Instrument, opts: { first?: boolean; done?: string } = {}): string {
  const choices = songChoices(inst, 3);
  const card = (c: { id: string; title: string; why: string }, i: number): string => {
    let ids: string[] = [];
    try {
      ids = inst === 'piano' ? [] : songProfile(findSong(c.id)).chords;
    } catch {
      ids = [];
    }
    const by = inst === 'piano' ? findPiece(c.id).by : findSong(c.id).by;
    return `<article class="wsong-pick${i === 0 ? ' first' : ''}"><div class="wsong-pickhead">${ids.length ? chips(ids) : ''}</div><div class="wsong-pickbody"><h3>${esc(c.title)}</h3>${by ? `<p class="by">${esc(by)}</p>` : ''}<p class="why">${esc(c.why)}</p><div class="row"><button class="btn${i === 0 ? ' primary' : ''}" data-week="${esc(c.id)}">${L('This one', 'Diesen')}${i === 0 ? ` <kbd>${L('Space', 'Leertaste')}</kbd>` : ''}</button><a class="btn quiet" href="#/songs/${encodeURIComponent(c.id)}">${L('Listen', 'Reinhören')}</a></div></div></article>`;
  };
  return `<section class="paper herosheet wsong-choose">
      <p class="kick">${opts.done ? L('A new week', 'Eine neue Woche') : opts.first ? L('Start here', 'Fang hier an') : L('The song of the week', 'Der Song der Woche')}</p>
      <h1>${inst === 'piano' ? L('Which piece do you want to play by Sunday?', 'Welches Stück willst du am Sonntag spielen können?') : L('Which song do you want to play by Sunday?', 'Welchen Song willst du am Sonntag spielen können?')}</h1>
      <p class="lede">${opts.done ? esc(opts.done) + ' ' : ''}${L('One song a week. Everything you practise serves it, and on the last day you record it with the band.', 'Ein Song pro Woche. Alles, was du übst, dient ihm, und am letzten Tag nimmst du ihn mit Band auf.')}</p>
    </section>
    <div class="wsong-picks">${choices.map(card).join('')}</div>
    ${opts.first && !Object.keys(store.skills.data).some((k) => k.startsWith('chord:') && !k.startsWith('chord:p.')) ? `<section class="paper wsong-own"><div><h2>${L('Played before?', 'Schon mal gespielt?')}</h2><p class="note">${L('Strum the chords you know: what rings is skipped from then on.', 'Schlag die Akkorde an, die du kannst: Was klingt, wird ab dann übersprungen.')}</p></div><div class="row"><a class="btn" href="#/placement">${L('Play what you know', 'Vorspielen, was du kannst')}</a></div></section>` : ''}
    <section class="paper wsong-own"><div><h2>${L('Or your own song', 'Oder dein eigener Song')}</h2><p class="note">${L('Paste the chords over the words, as song sites show them. It stays on this computer.', 'Füg die Akkorde über dem Text ein, so wie Songseiten sie zeigen. Er bleibt auf diesem Computer.')}</p></div><div class="row"><a class="btn" href="#/import">${L('Paste a chord sheet', 'Akkordblatt einfügen')}</a><a class="btn quiet" href="#/songs">${L('All songs', 'Alle Songs')}</a></div></section>`;
}

export function bindChoose(root: HTMLElement, inst: Instrument, after = refresh): () => void {
  const pick = (id: string): void => {
    chooseWeek(inst, id);
    after();
  };
  $$<HTMLButtonElement>('[data-week]', root).forEach((b) => (b.onclick = () => pick(b.dataset.week!)));
  const first = root.querySelector<HTMLButtonElement>('[data-week]');
  return keys({ ' ': () => first && pick(first.dataset.week!) });
}

/** #/week: choose another song of the week. */
export const weekPage = (root: HTMLElement): (() => void) => {
  const inst = store.settings.instrument === 'piano' ? 'piano' : 'guitar';
  root.innerHTML = `<div class="page bare todayp">${chooseView(inst)}</div>`;
  return bindChoose(root, inst, () => go('/'));
};

/** The start page of an instrument with a week. Returns its cleanup. */
export function weekHome(root: HTMLElement, inst: Instrument, now = Date.now()): () => void {
  if (needsChoice(inst)) {
    const done = arcOf(inst);
    const first = !store.sessions.length;
    root.innerHTML = `<div class="page bare todayp">${chooseView(inst, { first, done: done?.whole ? L(`${done.title} is on your shelf.`, `${done.title} steht in deinem Regal.`) : undefined })}</div>`;
    return bindChoose(root, inst);
  }
  const a = arcOf(inst, undefined, now)!;
  const steps: Step[] = plan(now);
  const at = Math.min(resumeAt(inst, now), steps.length - 1);
  const done = doneToday(inst, now) && !at;
  const minutes = steps.reduce((s, st) => s + st.minutes, 0);
  const weekday = new Date(now).toLocaleDateString(L('en', 'de'), { weekday: 'long' });
  const pair = thenNowPair(inst, a.id);
  const freePart = a.next.kind === 'learn' || a.next.kind === 'click' ? Math.max(0, a.next.part - (a.next.kind === 'learn' ? 1 : 0)) : 0;
  const free = inst === 'guitar' ? `#/groove/${encodeURIComponent(a.id)}/free/${freePart}` : '#/songs';
  root.innerHTML = `<div class="page bare todayp">
    <div class="wsong-top">
      <section class="paper herosheet wsong-hero">
        <p class="kick">${esc(weekday)} · ${done ? L('done for today', 'heute geschafft') : L(`day ${a.day} of your week with`, `Tag ${a.day} deiner Woche mit`)}</p>
        <h1>${esc(a.title)}</h1>
        <p class="lede">${esc(arcSentence(a))}</p>
        ${formStrip(a)}
        <div class="row heroacts">${
          done
            ? `<a class="btn primary big" id="go" href="${free}">${L('Keep playing, with the band', 'Weiterspielen, mit Band')} <kbd>${L('Space', 'Leertaste')}</kbd></a><a class="btn big" href="#/session/new">${L('Another round', 'Noch eine Runde')}</a>`
            : `<a class="btn primary big" id="go" href="#/session">${at ? L(`Go on at step ${at + 1}`, `Weiter mit Schritt ${at + 1}`) : L('Play', 'Spielen')} <kbd>${L('Space', 'Leertaste')}</kbd></a>${at ? `<a class="btn big" id="anew" href="#/session/new">${L('From the start', 'Von vorn')}</a>` : `<a class="btn big" id="short" href="#/session/short">${L('Only 5 minutes', 'Nur 5 Minuten')}</a>`}`
        }</div>
        <div class="wsong-bandrow">${inst === 'guitar' ? bandSwitch() : ''}<span class="weekrow">${weekLine(now)}</span></div>
      </section>
      <section class="paper wsong-listen">
        <p class="kick">${L('Listen', 'Hör mal')}</p>
        ${pair ? `<h2>${L('Then and now', 'Damals und jetzt')}</h2>${thenNowRows(inst, pair, now)}` : `<h2>${L('Your sound', 'Dein Klang')}</h2><p class="note">${L('From your first line with the click on, the app keeps your first take and your latest. Here you hear them side by side.', 'Ab deiner ersten Zeile mit Klick behält die App deine erste und deine letzte Aufnahme. Hier hörst du sie nebeneinander.')}</p>`}
        <p class="note wsong-shelfsaid">${(() => {
          const n = repertoire(inst).length;
          return n ? L(`Your shelf: ${n} ${n === 1 ? 'song' : 'songs'} you can play whole.`, `Dein Regal: ${n} ${n === 1 ? 'Song' : 'Songs'}, die du ganz spielen kannst.`) : L('Your shelf: the songs you can play whole will stand here.', 'Dein Regal: Hier stehen die Songs, die du ganz spielen kannst.');
        })()}</p>
        ${shelf(inst, a.title)}
      </section>
    </div>
    <section class="paper routesheet" aria-labelledby="seth">
      <div class="sectitle"><h2 id="seth">${done ? L('Today', 'Heute') : L(`Today · ${minutes} minutes`, `Heute · ${minutes} Minuten`)}</h2><span class="row">${editing || at ? '' : `<button class="btn quiet" id="editplan">${L('Change the plan', 'Plan ändern')}</button>`}<a href="#/week">${L('Another song', 'Anderer Song')}</a></span></div>
      ${
        editing && !at
          ? `<ol class="plan editing" aria-label="${L('The steps of your plan', 'Die Schritte deines Plans')}">${fullPlan(now)
              .map((st) => {
                const on = !(store.planOff[inst] ?? []).includes(st.kind);
                return `<li class="${on ? '' : 'off'}"><label class="pl"><input type="checkbox" data-kind="${esc(st.kind)}"${on ? ' checked' : ''}><div><b>${esc(st.title)}</b><small>${esc(st.detail)}</small></div></label><span class="t">${st.minutes} min</span></li>`;
              })
              .join('')}</ol>
            <p class="note">${L('Leave out what you do not need: the plan stays so every day until you bring a step back.', 'Lass weg, was du nicht brauchst: Der Plan bleibt jeden Tag so, bis du einen Schritt zurückholst.')}</p>
            <div class="row"><button class="btn" id="plandone">${L('Done', 'Fertig')}</button></div>`
          : `<ol class="plan route" aria-label="${L("Today's steps", 'Heutige Schritte')}">${steps.map((st, i) => `<li class="${done || i < at ? 'done' : i === at ? 'cur' : ''}"><span class="n">${done || i < at ? icon('check') : i + 1}</span><span class="pic" aria-hidden="true">${stepPicture(st)}</span><div><b>${esc(st.title)}</b><small>${esc(st.detail)}</small></div><span class="t">${st.minutes} min</span></li>`).join('')}</ol>${!at && (store.planOff[inst] ?? []).length ? `<p class="note planrow">${L(`${(store.planOff[inst] ?? []).length} left out by you`, `${(store.planOff[inst] ?? []).length} von dir weggelassen`)}</p>` : ''}`
      }
      <p class="note wsong-after">${L('Then:', 'Danach:')} <a href="${free}">${L('play on freely, with the band', 'frei weiterspielen, mit Band')}</a>${!store.barre && inst === 'guitar' ? ` · <button class="linkbtn" id="barrego">${L('Start the barre project (30 days, 2 minutes)', 'Barré-Projekt starten (30 Tage, 2 Minuten)')}</button>` : ''}</p>
    </section>
  </div>`;
  bindBandSwitch(root);
  bindThenNow(root);
  // the player's own plan: steps left out or brought back
  const edit = root.querySelector<HTMLButtonElement>('#editplan');
  if (edit)
    edit.onclick = () => {
      editing = true;
      refresh();
    };
  const pd = root.querySelector<HTMLButtonElement>('#plandone');
  if (pd)
    pd.onclick = () => {
      editing = false;
      refresh();
    };
  $$<HTMLInputElement>('.plan.editing input[data-kind]', root).forEach(
    (b) =>
      (b.onchange = () => {
        setPlanned(b.dataset.kind!, b.checked);
        refresh();
      }),
  );
  const bg = root.querySelector<HTMLButtonElement>('#barrego');
  if (bg)
    bg.onclick = () => {
      // the small shape first where the app shows small shapes: the way to the full barre goes through it
      const chord = store.settings.smallShapes && CHORDS['F#m-easy'] ? 'F#m-easy' : 'F#m';
      store.barre = { chord, start: dayOf(now), rings: {} };
      store.save();
      refresh();
    };
  const goNow = (): void => go(done ? free.slice(1) : '/session');
  const stopKeys = keys({ ' ': goNow, Enter: goNow });
  return () => {
    stopKeys();
    stopKept();
  };
}

/**
 * The end of a day with the song of the week: one sentence for what changed (the chorus sits, the song is on
 * the shelf), the first and the latest recording to hear side by side, up to three things that got better as
 * sentences, and what tomorrow brings. Then play on freely with the band, or finish.
 */
export function weekSummary(root: HTMLElement, o: { inst: Instrument; before: Arc | null; skillsBefore: Record<string, SkillRecord>; minutes: number; now: number }): () => void {
  const a = arcOf(o.inst, o.before?.id, o.now);
  if (!a) return () => undefined;
  const b = o.before;
  // the headline: the biggest step the song made today
  let head = L('Well played.', 'Gut gespielt.');
  if (a.whole && b && !b.whole) head = L(`${a.title} is on your shelf.`, `${a.title} steht in deinem Regal.`);
  else if (b)
    for (let i = a.parts.length - 1; i >= 0; i--) {
      const p = a.parts[i];
      const was = b.parts[i];
      if (!was) continue;
      if (p.clicked === p.lines.length && was.clicked < was.lines.length) {
        head = L(`The ${p.label.toLowerCase()} runs in time.`, `${p.label} läuft im Takt.`);
        break;
      }
      if (p.learned === p.lines.length && was.learned < was.lines.length) {
        head = L(`The ${p.label.toLowerCase()} sits.`, `${p.label} sitzt.`);
        break;
      }
      if (p.learned > was.learned) {
        head = L(`${p.learned} of ${p.lines.length} lines of the ${p.label.toLowerCase()} sit.`, `${p.learned} von ${p.lines.length} Zeilen: ${p.label}.`);
        break;
      }
    }
  // what got better, as sentences: changes in seconds, chords that ring now, lines faster
  const gains: { big: string; say: string }[] = [];
  for (const [key, is] of Object.entries(store.skills.data)) {
    const was = o.skillsBefore[key];
    if (was && was.best === is.best && was.level === is.level && (was.strings ?? 0) === (is.strings ?? 0)) continue;
    const [kind, x, y] = key.split(':');
    if (kind === 'pair' && !x.startsWith('p.') && y === undefined) {
      const [p, q] = x.split('>');
      if (!CHORDS[p] || !CHORDS[q] || !is.best) continue;
      const now = (60 / is.best).toFixed(1);
      const then = was?.best ? (60 / was.best).toFixed(1) : '';
      gains.push({ big: then && then !== now ? `${then} → ${now} s` : `${now} s`, say: L(`the change ${CHORDS[p].name} → ${CHORDS[q].name}`, `der Wechsel ${CHORDS[p].name} → ${CHORDS[q].name}`) });
    } else if (kind === 'chord' && !x.startsWith('p.') && CHORDS[x]) {
      if (is.level >= 1 && (!was || was.level < 1)) gains.push({ big: CHORDS[x].name, say: L('rings on every string now', 'klingt jetzt auf jeder Saite') });
      else if ((is.strings ?? 0) > (was?.strings ?? 0)) gains.push({ big: L(`${is.strings} of 6`, `${is.strings} von 6`), say: L(`strings of ${CHORDS[x].name} ring`, `Saiten von ${CHORDS[x].name} klingen`) });
    }
  }
  for (let i = 0; i < a.parts.length; i++) {
    const p = a.parts[i];
    const was = b?.parts[i];
    if (was && p.learned > was.learned) gains.push({ big: L(`${p.learned} of ${p.lines.length}`, `${p.learned} von ${p.lines.length}`), say: L(`lines of the ${p.label.toLowerCase()} sit`, `Zeilen sitzen: ${p.label}`) });
  }
  const tomorrow = a.next.kind === 'done' ? L('choose the next song.', 'den nächsten Song wählen.') : a.next.kind === 'whole' ? L('the whole song, with the band, recorded.', 'der ganze Song, mit Band, aufgenommen.') : L(`${a.parts[a.next.part].label}, ${a.next.kind === 'learn' ? 'line by line' : 'in time with the band'}.`, `${a.parts[a.next.part].label}, ${a.next.kind === 'learn' ? 'Zeile für Zeile' : 'im Takt mit Band'}.`);
  const pair = thenNowPair(o.inst, a.id);
  const freePart = a.next.kind === 'learn' || a.next.kind === 'click' ? a.next.part : 0;
  const free = `#/groove/${encodeURIComponent(a.id)}/free/${freePart}`;
  root.innerHTML = `<div class="page bare todayp wsong-endp"><section class="paper wsong-end">
      <p class="kick">${L(`${o.minutes} ${o.minutes === 1 ? 'minute' : 'minutes'} played`, `${o.minutes} ${o.minutes === 1 ? 'Minute' : 'Minuten'} gespielt`)} <span class="weekrow">${weekLine(o.now)}</span></p>
      <h1 id="endh1">${esc(head)}</h1>
      ${pair ? `<p class="lede">${L('Listen to where you started.', 'Hör dir an, wo du angefangen hast.')}</p>${thenNowRows(o.inst, pair, o.now)}` : ''}
      ${gains.length ? `<div class="wsong-gains">${gains.slice(0, 3).map((g) => `<div><b>${esc(g.big)}</b><span>${esc(g.say)}</span></div>`).join('')}</div>` : `<p class="note">${L('Nothing new was measured today. Playing counts all the same: the week goes on tomorrow.', 'Heute wurde nichts Neues gemessen. Gespielt ist trotzdem gespielt: Die Woche geht morgen weiter.')}</p>`}
      ${store.plan ? '' : planCard()}
      <div class="wsong-tomorrow"><p><b>${L('Tomorrow:', 'Morgen:')}</b> ${esc(tomorrow)}</p><div class="row"><a class="btn primary" id="free" href="${o.inst === 'guitar' ? free : '#/songs'}">${L('Play on freely, with the band', 'Weiterspielen, frei mit Band')} <kbd>${L('Space', 'Leertaste')}</kbd></a><a class="btn" id="finish" href="#/">${L('Finish', 'Fertig')}</a></div></div>
    </section></div>`;
  bindThenNow(root);
  bindPlan(root, () => {
    const card = root.querySelector('#plancard');
    if (card) card.outerHTML = planCard();
  });
  const stopKeys = keys({ ' ': () => go(free.slice(1)), Escape: () => go('/') });
  $('#free', root).focus();
  return () => {
    stopKeys();
    stopKept();
  };
}

/** The barre project's course: the most strings that rang on each of its days, as a row of small bars. */
export function barreCard(now = Date.now()): string {
  const b = store.barre;
  if (!b || !CHORDS[b.chord]) return '';
  const day = Math.max(1, dayOf(now) - b.start + 1);
  const days = Array.from({ length: Math.min(30, Math.max(day, 7)) }, (_, i) => b.rings[String(b.start + i)] ?? 0);
  const best = Math.max(0, ...days);
  return `<div class="plancard barrecard"><p class="k">${L(`Barre project · day ${Math.min(day, 30)} of 30`, `Barré-Projekt · Tag ${Math.min(day, 30)} von 30`)}</p><p class="said">${esc(CHORDS[b.chord].name)}: ${best ? L(`up to ${best} of 6 strings ring`, `bis zu ${best} von 6 Saiten klingen`) : L('not played yet', 'noch nicht gespielt')}</p><div class="barre-days" aria-hidden="true">${days.map((r, i) => `<i style="--r:${r}" class="${i + 1 === day ? 'today' : ''}"></i>`).join('')}</div></div>`;
}
