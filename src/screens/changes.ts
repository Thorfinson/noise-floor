/**
 * One chord change, taught before it is drilled. First without a clock: the app waits for each chord and
 * says how the change is made. Then one calm minute: back and forth, every clean change counted. That
 * number is the measure of the change (30 a minute keeps a song going, 60 and it needs no more practice).
 * Calm, like everything in Learn: no falling, no score.
 */
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { pairKey } from '../music/difficulty';
import { changeTip, chordName, CHORDS, keyTip, strumIs } from '../music/theory';
import { $, esc, hear, icon, keys, micMeter, pianoEars, type Screen } from '../ui/dom';
import { chordBox, keyChord, LEARN } from '../ui/draw';
import { practiceBar, setSimTarget } from '../ui/practice';
import { isKeyChord } from './keys';

/** strums in the part without a clock: three times there and back */
const WARM = 6;
const MINUTE = 60;

export const changeDrill: Screen = (root, [a0, b0], ctx) => {
  const piano = store.settings.instrument === 'piano';
  const a = piano ? (isKeyChord(a0) ? a0 : 'C') : CHORDS[a0] ? a0 : 'Em';
  const b = piano ? (isKeyChord(b0) && b0 !== a ? b0 : a === 'G' ? 'C' : 'G') : CHORDS[b0] && b0 !== a ? b0 : 'Am';
  const key = pairKey(a, b, piano);
  /** what the player does to a chord: strum it on the guitar, play it on the piano */
  const Verb = piano ? 'Play' : 'Strum';
  let phase: 'warm' | 'ready' | 'minute' | 'done' = 'warm';
  /** strums heard in this phase; the chord wanted next is a for even counts */
  let n = 0;
  let startT = -1;
  let timer = 0;
  let result = '';
  const want = (): string => (n % 2 === 0 ? a : b);
  const name = (id: string): string => chordName(id, piano);

  root.innerHTML = `<header class="top"><div><a class="btn quiet" href="#/">${icon(ctx ? 'x' : 'left')}${ctx ? L('End session', 'Session beenden') : L('Home', 'Start')}</a></div>
      <div class="c">${ctx ? ctx.rail : L(`<b>Chord change</b> · ${esc(name(a))} and ${esc(name(b))}`, `<b>Akkordwechsel</b> · ${esc(name(a))} und ${esc(name(b))}`)}</div><div class="r">${micMeter()}</div></header>
    <div class="stage"><div class="pairbox${piano ? ' keysfig' : ''}">
      <svg class="fit" id="boxa" viewBox="0 0 300 ${piano ? 250 : 330}" role="img" aria-label="${L(`${piano ? 'Keys' : 'Chord diagram'} of ${esc(name(a))}`, `${piano ? 'Tasten' : 'Akkorddiagramm'} von ${esc(name(a))}`)}"></svg>
      <div class="mid2"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="tip" id="tip"></p><p class="big2" id="big" aria-live="polite"></p></div>
      <svg class="fit" id="boxb" viewBox="0 0 300 ${piano ? 250 : 330}" role="img" aria-label="${L(`${piano ? 'Keys' : 'Chord diagram'} of ${esc(name(b))}`, `${piano ? 'Tasten' : 'Akkorddiagramm'} von ${esc(name(b))}`)}"></svg>
    </div></div>${practiceBar()}
    <footer class="bar"><div class="grp"><button class="btn" id="again">${L('Start over', 'Von vorn')} <kbd>R</kbd></button><button class="btn" id="fwd"><span id="fwdl"></span> <kbd>${L('Space', 'Leertaste')}</kbd></button></div>
    <p class="auto">${piano ? L('1 thumb · 2 index · 3 middle · 4 ring · 5 little finger', '1 Daumen · 2 Zeigefinger · 3 Mittelfinger · 4 Ringfinger · 5 kleiner Finger') : L('1 index · 2 middle · 3 ring · 4 little finger', '1 Zeigefinger · 2 Mittelfinger · 3 Ringfinger · 4 kleiner Finger')}</p></footer>`;

  function draw(): void {
    const w = want();
    const live = phase === 'warm' || phase === 'minute' || phase === 'ready';
    for (const [el, id] of [['#boxa', a], ['#boxb', b]] as const) {
      const hot = live && id === w;
      $(el, root).innerHTML = `<text x="150" y="34" class="cn" text-anchor="middle" fill="${hot ? LEARN.now : LEARN.muted}">${esc(name(id))}</text>${piano ? keyChord(id, LEARN, { x: 4, y: 60, w: 292, h: 180 }, hot, [a, b]) : chordBox(CHORDS[id], 60, 82, 180, LEARN, hot, undefined, 44)}`;
    }
    const from = w === a ? b : a;
    const tip = piano ? keyTip(from, w) : changeTip(CHORDS[from], CHORDS[w]);
    const label = ctx ? ctx.label + ' · ' : '';
    if (phase === 'warm') {
      $('#eb', root).textContent = L(`${label}The change ${name(a)} → ${name(b)} · first without a clock · ${Math.min(n + 1, WARM)} of ${WARM}`, `${label}Der Wechsel ${name(a)} → ${name(b)} · erst ohne Uhr · ${Math.min(n + 1, WARM)} von ${WARM}`);
      $('#h1', root).innerHTML = n === 0 ? L(`${Verb} <em>${esc(name(w))}</em>.`, piano ? `Spiel <em>${esc(name(w))}</em>.` : `Schlag <em>${esc(name(w))}</em> an.`) : L(`Change to <em>${esc(name(w))}</em>${piano ? '' : ' and strum'}.`, `Wechsle zu <em>${esc(name(w))}</em>${piano ? '' : ' und schlag an'}.`);
      $('#tip', root).innerHTML =
        n === 0
          ? L(
              `<b>How it works</b>${piano ? `Lay the hand on ${esc(name(a))} and play it once, all keys together.` : `Put ${esc(name(a))} down and strum once, slowly.`} The app waits. Then it shows how to get to ${esc(name(b))}.`,
              `<b>So geht’s</b>${piano ? `Leg die Hand auf ${esc(name(a))} und spiel den Akkord einmal, alle Tasten zusammen.` : `Greif ${esc(name(a))} und schlag einmal langsam an.`} Die App wartet. Dann zeigt sie, wie du zu ${esc(name(b))} kommst.`,
            )
          : `<b>${L('How the change is made', 'So geht der Wechsel')}</b>${esc(tip)}`;
      $('#big', root).textContent = '';
    } else if (phase === 'ready') {
      $('#eb', root).textContent = L(`${label}The change ${name(a)} → ${name(b)} · one calm minute`, `${label}Der Wechsel ${name(a)} → ${name(b)} · eine ruhige Minute`);
      $('#h1', root).innerHTML = L(`Now one minute, back and forth. It starts with your first <em>${esc(name(a))}</em>.`, `Jetzt eine Minute, hin und her. Sie beginnt mit deinem ersten <em>${esc(name(a))}</em>.`);
      $('#tip', root).innerHTML = L(`<b>What counts</b>Every clean change. Not speed for its own sake: even and clean beats fast and muffled. 30 in the minute keeps a song going.`, `<b>Was zählt</b>Jeder saubere Wechsel. Nicht Tempo um seiner selbst willen: Gleichmäßig und sauber schlägt schnell und verwaschen. 30 in der Minute halten einen Song am Laufen.`);
      $('#big', root).textContent = '';
    } else if (phase === 'minute') {
      const left = Math.max(0, Math.ceil(MINUTE - ((engine.listener?.time ?? 0) - startT)));
      $('#eb', root).textContent = L(`${label}The change ${name(a)} → ${name(b)} · one calm minute`, `${label}Der Wechsel ${name(a)} → ${name(b)} · eine ruhige Minute`);
      $('#h1', root).innerHTML = L(`Change to <em>${esc(name(w))}</em>.`, `Wechsle zu <em>${esc(name(w))}</em>.`);
      $('#tip', root).innerHTML = `<b>${L('How the change is made', 'So geht der Wechsel')}</b>${esc(tip)}`;
      $('#big', root).innerHTML = L(`<b>${Math.max(0, n - 1)}</b> changes · <span>${left} s left</span>`, `<b>${Math.max(0, n - 1)}</b> Wechsel · <span>noch ${left} s</span>`);
    } else {
      $('#eb', root).textContent = L(`${label}The change ${name(a)} → ${name(b)} · measured`, `${label}Der Wechsel ${name(a)} → ${name(b)} · gemessen`);
      $('#h1', root).textContent = L(`${Math.max(0, n - 1)} clean changes in the minute.`, `${Math.max(0, n - 1)} ${n - 1 === 1 ? 'sauberer Wechsel' : 'saubere Wechsel'} in der Minute.`);
      $('#tip', root).innerHTML = `<b>${L('Result', 'Ergebnis')}</b>${result}`;
      $('#big', root).textContent = '';
    }
    $('#fwdl', root).textContent = phase === 'warm' ? L('On to the minute', 'Weiter zur Minute') : phase === 'ready' ? L('Skip the minute', 'Minute überspringen') : phase === 'minute' ? L('Stop the minute', 'Minute beenden') : ctx ? L(`Next: ${ctx.after}`, `Als Nächstes: ${ctx.after}`) : L('Once more', 'Noch einmal');
    setSimTarget(phase === 'done' ? null : { kind: 'chord', id: w, piano });
  }

  function enter(p: typeof phase): void {
    clearInterval(timer);
    phase = p;
    n = 0;
    startT = -1;
    draw();
  }

  function finish(): void {
    clearInterval(timer);
    const count = Math.max(0, n - 1);
    const secs = startT < 0 ? 0 : Math.min(MINUTE, (engine.listener?.time ?? 0) - startT);
    // a minute cut short is counted as what a whole minute would have given, if it ran long enough to say
    const rate = secs >= 20 ? Math.round((count * 60) / secs) : 0;
    const before = store.skills.level(key);
    if (rate > 0) store.skills.record(key, rate, Date.now());
    const after = store.skills.level(key);
    store.save();
    const best = store.skills.get(key)?.best ?? 0;
    result =
      rate === 0
        ? L('Too short to measure. A change is measured over at least twenty seconds.', 'Zu kurz zum Messen. Ein Wechsel wird über mindestens zwanzig Sekunden gemessen.')
        : L(
            `${rate} a minute${secs < MINUTE - 1 ? ', counted up from ' + Math.round(secs) + ' seconds' : ''}. ${after > before ? `That is level ${after}. ` : ''}${rate >= 60 ? 'This change needs no more practice.' : rate >= 30 ? 'Enough to keep a song going. 60 is the mark at which it needs no more practice.' : `30 keeps a song going${best > rate ? `; your best is ${Math.round(best)}` : ''}. A minute a day gets there.`}`,
            `${rate} pro Minute${secs < MINUTE - 1 ? ', hochgerechnet aus ' + Math.round(secs) + ' Sekunden' : ''}. ${after > before ? `Das ist Stufe ${after}. ` : ''}${rate >= 60 ? 'Dieser Wechsel braucht keine Übung mehr.' : rate >= 30 ? 'Genug, um einen Song am Laufen zu halten. Ab 60 braucht der Wechsel keine Übung mehr.' : `30 halten einen Song am Laufen${best > rate ? `; dein Bestwert ist ${Math.round(best)}` : ''}. Eine Minute am Tag bringt dich dahin.`}`,
          );
    phase = 'done';
    draw();
  }

  const sure = (e: { best: string | null; score: number; margin: number }): boolean => !!e.best && e.score > 0.6 && e.margin > 0.08;
  const stopHear = hear(
    root,
    {
      onChord: (e) => {
        // on the piano the chord wanted is given when what was heard fits it; the guitar's strum has to be told apart for sure
        if (phase === 'done' || (piano ? !strumIs(e, want(), true) : !sure(e) || e.best !== want())) return;
        if (phase === 'ready') {
          phase = 'minute';
          startT = e.time;
          timer = window.setInterval(() => {
            if ((engine.listener?.time ?? 0) - startT >= MINUTE) finish();
            else draw();
          }, 250);
        }
        n++;
        if (phase === 'warm' && n >= WARM) enter('ready');
        else draw();
      },
    },
    (l) => {
      if (piano) pianoEars(l);
      l.noteDetection = false;
      l.chordCandidates = [a, b];
    },
  );
  const forward = (): void => {
    if (phase === 'warm') enter('ready');
    else if (phase === 'ready') (ctx ? ctx.next() : enter('warm'));
    else if (phase === 'minute') finish();
    else if (ctx) ctx.next();
    else enter('warm');
  };
  const stopKeys = keys({ r: () => enter('warm'), ' ': forward });
  $('#again', root).onclick = () => enter('warm');
  $('#fwd', root).onclick = forward;
  enter('warm');
  return () => {
    clearInterval(timer);
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
};
