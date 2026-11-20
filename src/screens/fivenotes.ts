/**
 * Five notes: one tune a day, found by ear (the rules are in src/game/fivenotes.ts). The app plays the first
 * five notes of a song from the book; the player plays them back, five notes a try, six tries. Each try is
 * marked note by note, and at the end the song is revealed and can be opened.
 *
 * The day's tries are kept, so leaving and coming back finds the grid as it was; a finished day shows its
 * result until the next day brings a new tune.
 */
import { engine } from '../audio/engine';
import { mixInto, tone } from '../audio/synth';
import { dayOf } from '../core/days';
import { L, lang } from '../core/i18n';
import { store, type FiveDay } from '../core/store';
import { HEARINGS, judge, known, NOTES, solved, TRIES, tuneOfDay, tunesOf, type FiveTune, type Mark } from '../game/fivenotes';
import { allSongs, midiToTab } from '../music/content';
import { noteName } from '../music/theory';
import { guitarA4 } from '../music/tuning';
import { $, esc, hear, icon, keys, pianoEars, stopTimer, type Screen } from '../ui/dom';
import { setSimTarget } from '../ui/practice';
import { frame } from './frame';

const NAME_ONLY = (m: number): string => noteName(m).replace(/-?\d+$/, '');
const pcName = (pc: number): string => NAME_ONLY(60 + pc);
/** A song's title as said aloud: without the book's note of which version it is ("(chords)", "(melody)"). */
const said = (title: string): string => title.replace(/\s*\([^)]*\)\s*$/, '');

/** The five notes as tab, large enough to read from a metre away: six strings, high e on top, the frets the app would choose. */
function fiveTab(midis: number[]): string {
  const gap = 22;
  const top = 18;
  let h = '';
  for (let k = 0; k < 6; k++) h += `<line x1="34" x2="${54 + midis.length * 64}" y1="${top + k * gap}" y2="${top + k * gap}" stroke="var(--line)" stroke-width="1.5"/><text x="14" y="${top + k * gap + 5}" font-size="14" fill="var(--faint)" font-family="var(--mono)">${['e', 'B', 'G', 'D', 'A', 'E'][k]}</text>`;
  midis.forEach((m, i) => {
    const t = midiToTab(m);
    const x = 70 + i * 64;
    const y = top + (5 - t.s) * gap;
    h += `<rect x="${x - 15}" y="${y - 14}" width="30" height="28" rx="4" fill="#fcf8f2"/><text x="${x}" y="${y + 9}" font-size="26" font-weight="700" text-anchor="middle" fill="var(--text)" font-family="var(--font)">${t.f}</text>`;
  });
  return `<svg class="fn-tab" viewBox="0 0 ${80 + midis.length * 64} ${top + 5 * gap + 22}" role="img" aria-label="${L('The five notes as tab', 'Die fünf Töne als Tabulatur')}">${h}</svg>`;
}

/** The tunes Five notes draws from: every song of the book with a fair opening, exercises left out. */
export const fiveTunes = (): FiveTune[] => tunesOf(allSongs().filter((s) => !s.exercise));

/** Today's tune and what has been played of it today. */
export function fiveToday(now = Date.now()): { day: number; tune: FiveTune | null; state: FiveDay | null } {
  const day = dayOf(now);
  const tune = tuneOfDay(fiveTunes(), day);
  const kept = store.fivenotes[String(day)];
  // a day kept for another tune (the book changed since) starts afresh
  return { day, tune, state: kept && tune && kept.id === tune.id ? kept : null };
}

export const fivenotes: Screen = (root) => {
  const inst = store.settings.instrument;
  const piano = inst === 'piano';
  const today = fiveToday();
  const { day, state: kept } = today;
  if (!today.tune || inst === 'voice') {
    root.innerHTML = frame(L('Five notes', 'Fünf Töne'), `<div class="head"><div class="say"><h1>${inst === 'voice' ? L('Five notes is played on the guitar or the piano.', 'Fünf Töne wird auf der Gitarre oder dem Klavier gespielt.') : L('No tune to find today.', 'Heute gibt es keine Melodie zu finden.')}</h1></div></div>`, '', undefined, ['#/nf', L('Games', 'Spiele')]);
    return () => undefined;
  }
  const tune: FiveTune = today.tune;
  const st: FiveDay = kept ?? { id: tune.id, rows: [], hears: 0, done: false };
  /** the notes of the try being played */
  let cur: number[] = [];
  let modelUntil = 0;
  let timer = 0;
  let lights = -1;
  const date = new Date().toLocaleDateString(lang() === 'de' ? 'de-DE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const marksOf = (r: number[]): Mark[] => judge(r, tune.midis);
  const isSolved = (): boolean => st.rows.some((r) => solved(marksOf(r)));
  const hearsLeft = (): number => Math.max(0, 1 + HEARINGS - st.hears);

  root.innerHTML = frame(
    `<b>${L('Five notes', 'Fünf Töne')}</b> · ${esc(date)}`,
    `<div class="fn-wrap">
       <div class="fn-main">
         <div class="say"><p class="eyebrow">${L('A tune from your book · any octave counts', 'Eine Melodie aus deinem Buch · jede Oktave zählt')}</p><h1 id="fnh1"></h1><p class="sub" id="fnsub"></p></div>
         <div class="fn-listen" id="fnlisten" aria-hidden="true">${'<i></i>'.repeat(NOTES)}</div>
         <div class="fn-grid" id="fngrid" role="grid" aria-label="${L('Six tries of five notes', 'Sechs Versuche mit fünf Tönen')}"></div>
       </div>
       <aside class="fn-side" id="fnside"></aside>
     </div>`,
    `<div class="grp do"><button class="btn primary" id="fnhear"></button><button class="btn" id="fnclear">${L('Clear the row', 'Zeile löschen')} <kbd>⌫</kbd></button><a class="btn" id="fnsong" href="#/songs/${encodeURIComponent(tune.id)}" hidden>${L('Open the song', 'Zum Song')}${icon('right')}</a></div>
     <p class="auto" id="fnauto"></p>`,
    undefined,
    ['#/nf', L('Games', 'Spiele')],
  );

  function save(): void {
    store.fivenotes[String(day)] = { id: st.id, rows: st.rows.map((r) => r.slice()), hears: st.hears, done: st.done };
    store.save();
  }

  function draw(): void {
    const done = st.done;
    const win = isSolved();
    $('#fnh1', root).textContent = done ? (win ? L(`Found in ${st.rows.length}.`, `Gefunden in ${st.rows.length}.`) : L('Not found today.', 'Heute nicht gefunden.')) : st.rows.length || cur.length ? L(`Try ${st.rows.length + 1} of ${TRIES}`, `Versuch ${st.rows.length + 1} von ${TRIES}`) : L("Find today's tune.", 'Finde die Melodie von heute.');
    const listening = performance.now() < modelUntil;
    root.dataset.listening = listening ? '1' : '';
    $('#fnsub', root).innerHTML = done
      ? L(`It's the opening of <b>${esc(said(tune.title))}</b>.`, `Es ist der Anfang von <b>${esc(said(tune.title))}</b>.`)
      : listening
        ? L('Listen…', 'Hör zu …')
        : st.hears === 0
        ? L('Listen to its first five notes, then play them back.', 'Hör dir die ersten fünf Töne an, dann spiel sie nach.')
        : L('Play five notes. The row is marked after the fifth.', 'Spiel fünf Töne. Nach dem fünften wird die Zeile bewertet.');
    // the grid: tries played, the one being played, and the empty ones
    let h = '';
    for (let r = 0; r < TRIES; r++) {
      const row = st.rows[r];
      const live = !row && r === st.rows.length && !done;
      h += `<div class="fn-row" role="row"><span>${r + 1}</span>`;
      for (let i = 0; i < NOTES; i++) {
        if (row) {
          const mk = marksOf(row)[i];
          h += `<div class="fn-cell ${mk}" role="gridcell"><b>${NAME_ONLY(row[i])}</b><small>${noteName(row[i])}</small></div>`;
        } else if (live && i < cur.length) h += `<div class="fn-cell" role="gridcell"><b>${NAME_ONLY(cur[i])}</b><small>${noteName(cur[i])}</small></div>`;
        else if (live && i === cur.length && st.hears > 0 && !listening) h += `<div class="fn-cell now" role="gridcell"><b>?</b></div>`;
        else h += `<div class="fn-cell empty" role="gridcell"></div>`;
      }
      h += '</div>';
    }
    $('#fngrid', root).innerHTML = h;
    // beside it: what the tries have shown, or at the end the tune itself, on the instrument
    const k = known(st.rows.map((r) => ({ midis: r, marks: marksOf(r) })));
    const placed = k.placed.map((p) => (p === null ? '·' : pcName(p))).join(' ');
    const side = done
      ? `<p class="eyebrow">${L('The five notes', 'Die fünf Töne')}</p>${piano ? '' : fiveTab(tune.midis)}<p class="fn-names">${tune.midis.map((m) => NAME_ONLY(m)).join(' · ')}</p><p class="fn-grid-sum" aria-label="${L('Your tries', 'Deine Versuche')}">${st.rows.map((r) => marksOf(r).map((m) => `<i class="${m}"></i>`).join('')).join('<br>')}</p>`
      : `<div class="fn-legend"><div><i class="gold"></i>${L('right note, right place', 'richtiger Ton, richtige Stelle')}</div><div><i class="in"></i>${L('in the tune, somewhere else', 'in der Melodie, an anderer Stelle')}</div><div><i class="no"></i>${L('not in the tune', 'nicht in der Melodie')}</div></div>
         ${st.rows.length ? `<p class="fn-known"><b>${L('So far', 'Bisher')}:</b> ${esc(placed)}${k.inside.length ? L(` · in it somewhere: ${k.inside.map(pcName).join(', ')}`, ` · irgendwo darin: ${k.inside.map(pcName).join(', ')}`) : ''}${k.out.length ? L(` · not in it: ${k.out.map(pcName).join(', ')}`, ` · nicht darin: ${k.out.map(pcName).join(', ')}`) : ''}</p>` : ''}`;
    $('#fnside', root).innerHTML = side;
    const hb = $('#fnhear', root);
    hb.innerHTML = done ? `${L('Hear it', 'Anhören')} <kbd>H</kbd>` : st.hears === 0 ? `${L("Hear today's tune", 'Melodie von heute anhören')} <kbd>${L('Space', 'Leertaste')}</kbd>` : `${L('Hear it again', 'Noch einmal hören')} <kbd>H</kbd> · ${hearsLeft()}`;
    (hb as HTMLButtonElement).disabled = !done && st.hears > 0 && hearsLeft() === 0;
    ($('#fnclear', root) as HTMLButtonElement).hidden = done || st.hears === 0;
    $('#fnsong', root).hidden = !done;
    $('#fnauto', root).textContent = done ? L('A new tune tomorrow.', 'Morgen eine neue Melodie.') : st.hears === 0 ? '' : L('A muted hit on the strings clears the row as well.', 'Ein gedämpfter Anschlag auf die Saiten löscht die Zeile ebenfalls.');
    const next = !done && st.hears > 0 && !listening ? tune.midis[cur.length] : null;
    setSimTarget(next === null ? null : { kind: 'note', midi: next, piano, string: piano ? undefined : midiToTab(next).s });
  }

  /** The app plays the five notes through the speakers; what the microphone picks up of them is not the player. */
  function play(): void {
    const c = engine.ctx;
    if (!c) return;
    if (!st.done) {
      if (hearsLeft() === 0) return;
      st.hears++;
      save();
    }
    const sr = c.sampleRate;
    const a4 = piano ? store.settings.pianoA4 : guitarA4();
    const starts: number[] = [];
    let t = 0;
    for (const len of tune.lens) {
      starts.push(t);
      t += len;
    }
    const out = new Float32Array(Math.ceil((t + 1.2) * sr));
    tune.midis.forEach((m, k) => mixInto(out, tone({ sr, midi: m, dur: Math.max(0.9, tune.lens[k] + 0.4), piano, a4, seed: k + 1 }), starts[k] * sr));
    const secs = engine.demo(out);
    modelUntil = performance.now() + secs * 1000 + 250;
    // the five bars light one after the other as the notes sound: the rhythm, not the pitch
    stopTimer(timer);
    const t0 = performance.now();
    const step = (): void => {
      const el = performance.now() - t0;
      lights = starts.findIndex((s, k) => el / 1000 >= s && el / 1000 < s + tune.lens[k]);
      root.querySelectorAll('#fnlisten i').forEach((b, k) => b.classList.toggle('on', k === lights));
      if (performance.now() < modelUntil) timer = window.setTimeout(step, 40);
      else {
        root.querySelectorAll('#fnlisten i').forEach((b) => b.classList.remove('on'));
        draw();
      }
    };
    step();
    draw();
  }

  function clearRow(): void {
    if (st.done || !cur.length) return;
    cur = [];
    draw();
  }

  function noteHeard(midi: number): void {
    if (st.done || st.hears === 0 || performance.now() < modelUntil) return;
    cur.push(midi);
    if (cur.length < NOTES) return draw();
    st.rows.push(cur);
    cur = [];
    if (solved(marksOf(st.rows[st.rows.length - 1])) || st.rows.length >= TRIES) st.done = true;
    save();
    draw();
  }

  const stopEars = hear(
    root,
    {
      onNote: (e) => noteHeard(e.midi),
      onThud: (e) => {
        if (e.hit && performance.now() >= modelUntil) clearRow();
      },
    },
    (l) => {
      if (piano) pianoEars(l);
      l.expected = null;
      l.chordCandidates = null;
      l.noteDetection = true;
    },
  );
  $('#fnhear', root).onclick = play;
  $('#fnclear', root).onclick = clearRow;
  const stopKeys = keys({
    ' ': () => (st.hears === 0 && !st.done ? play() : undefined),
    h: play,
    Backspace: clearRow,
  });
  draw();
  return () => {
    stopEars();
    stopKeys();
    stopTimer(timer);
    engine.stopDemo();
    setSimTarget(null);
  };
};
