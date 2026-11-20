/**
 * The chord check: hold a chord, pluck one string at a time, see which ring clean. Also the advice for a
 * string that does not ring, and where the fingers go, in words.
 */
import type { StringResult } from '../audio/listener';
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { dayOf } from '../core/days';
import { store } from '../core/store';
import { barreStrings, chordMidis, CHORDS, noteName, STRING_FULL, STRING_NAMES, stringName, type Chord } from '../music/theory';
import { $, cap, esc, hear, icon, keys, later, learnRing, stopTimer, type Screen, hintFresh, hintSeen } from '../ui/dom';
import { chordBox, LEARN, type Mark } from '../ui/draw';
import { setSimTarget } from '../ui/practice';
import { frame, levelNews, nextStep } from './frame';

/** What to change when a string of a chord does not ring. */
export function stringTip(chordId: string, s: number, result: StringResult, heard: number | null): string {
  const c = CHORDS[chordId];
  const barre = barreStrings(c).includes(s);
  if (result === 'wrong') return L(`That was ${heard === null ? 'another string' : noteName(heard)}. Pluck the ${STRING_FULL[s]} string.`, `Das war ${heard === null ? 'eine andere Saite' : noteName(heard)}. Zupf die ${STRING_FULL[s]}-Saite.`);
  if (result === 'buzz') return L('Move the finger right up behind the fret and press a little harder.', 'Setz den Finger direkt hinter den Bund und drück etwas fester.');
  if (barre) return L(`Roll your index finger slightly onto its bony edge, right behind fret ${c.frets[s]}.`, `Kipp den Zeigefinger leicht auf seine harte Außenkante, direkt hinter dem ${c.frets[s]}. Bund.`);
  if (c.frets[s] === 0) return L('Something is touching this open string. Arch the fingers next to it.', 'Etwas berührt diese leere Saite. Stell die Finger daneben steiler auf.');
  return L('Press with the fingertip, right behind the fret, and keep the finger arched so it stays off the next string.', 'Drück mit der Fingerspitze, direkt hinter dem Bund, und halte den Finger gewölbt, damit er die Nachbarsaite nicht berührt.');
}

const FINGER_NAMES = (): string[] => ['', L('index finger', 'Zeigefinger'), L('middle finger', 'Mittelfinger'), L('ring finger', 'Ringfinger'), L('little finger', 'kleiner Finger')];

/** Where the fingers go, in words, one line per finger. */
export function holdLines(c: Chord): string[] {
  const list = (s: number[]): string => {
    const n = s.map((i) => STRING_FULL[i]);
    return n.length > 1 ? L(`${n.slice(0, -1).join(', ')} and ${n[n.length - 1]} strings`, `${n.slice(0, -1).join('-, ')}- und ${n[n.length - 1]}-Saite`) : L(`${n[0]} string`, `${n[0]}-Saite`);
  };
  const flat = barreStrings(c);
  const barre = flat.length > 0;
  const out: string[] = [];
  if (barre) out.push(L(`Index finger flat across fret ${c.frets[flat[0]]}, from the ${STRING_FULL[flat[0]]} string to the ${STRING_FULL[flat[flat.length - 1]]} string`, `Zeigefinger flach über den ${c.frets[flat[0]]}. Bund, von der ${stringName(flat[0], true)} bis zur ${stringName(flat[flat.length - 1], true)}`));
  for (let s = 0; s < 6; s++) {
    const f = c.fingers[s];
    if (f && !(barre && f === 1)) out.push(L(`${cap(FINGER_NAMES()[f])}: ${STRING_FULL[s]} string, fret ${c.frets[s]}`, `${cap(FINGER_NAMES()[f])}: ${STRING_FULL[s]}-Saite, ${c.frets[s]}. Bund`));
  }
  const unused = c.frets.map((f, i) => (f < 0 ? i : -1)).filter((i) => i >= 0);
  if (unused.length) out.push(L(`The ${list(unused)} ${unused.length > 1 ? 'are' : 'is'} not played`, `Die ${list(unused)} ${unused.length > 1 ? 'werden' : 'wird'} nicht gespielt`));
  // what makes a barre ring is not strength
  if (barre) out.push(L('Thumb behind the neck, opposite the index finger. Index finger close to the fret, rolled a little onto its bony edge', 'Daumen hinter dem Hals, gegenüber dem Zeigefinger. Zeigefinger nah am Bund, leicht auf seine harte Außenkante gekippt'));
  return out;
}

/** How often a string is tried in the guided session before it is left for next time. */
const TRIES = 3;

/**
 * The check at the end of a stage is passed when every chord it asks for has rung clean: each chord once,
 * however often one of them was played again. A check that asks for no chord confirms nothing.
 */
export function stageConfirmed(required: readonly string[], passed: ReadonlySet<string>): boolean {
  return required.length > 0 && required.every((id) => passed.has(id));
}

/**
 * Chord check: hold the chord, pluck one string at a time, see which ring clean. No clock. In the guided
 * session it takes today's chords one after the other and never gets stuck: a string that will not ring
 * is left for next time after three tries, and any string can be skipped or done again.
 */
export const chordCheck: Screen = (root, ids, ctx) => {
  /** the check at the end of a stage: several chords in a row, from memory, and the result is kept */
  const stageCheck = !ctx && ids[0] === 'check';
  const guided = !!ctx || stageCheck;
  const queue = (guided ? ids : ids.slice(0, 1)).map((id) => CHORDS[id]).filter(Boolean);
  /** the chords the stage check asks for, each once; the Em shown when none is named is not one of them */
  const required = [...new Set(queue.map((c) => c.id))];
  /** the chords whose last go rang clean: a chord played again (R, or ←) is not counted twice */
  const passed = new Set<string>();
  if (!queue.length) queue.push(CHORDS['Em']);
  /** practice rather than a check: after the result it waits for the player, who may go again as often as they like */
  const stay = !!ctx && ids.includes('stay');
  let q = 0;
  let chord = queue[0];
  let midis = chordMidis(chord);
  let strings = midis.map((m, i) => (m === null ? -1 : i)).filter((i) => i >= 0);
  let at = 0;
  let results: Mark[] = [];
  let tries: number[] = [];
  let left = new Set<number>();
  let startT = -1;
  let timer = 0;
  let tip = '';
  /** the tip is advice on a string that did not ring, not just news */
  let advice = false;
  /** a chord that already rings is first asked for from memory: its picture stays hidden until asked for or needed */
  let shown = true;

  // the rule of the guided check is said the first two times
  const showRule = hintFresh('chordcheck');
  if (ctx) hintSeen('chordcheck');
  root.innerHTML = frame(
    `<b>${L('Chord check', 'Akkord-Check')}</b> · <span id="cname"></span>`,
    `<div class="two">
       <div><svg class="fit" id="box" viewBox="0 0 400 440" role="img"></svg><p class="legend" style="text-align:center">${L('1 index · 2 middle · 3 ring · 4 little finger', '1 Zeigefinger · 2 Mittelfinger · 3 Ringfinger · 4 kleiner Finger')}</p></div>
       <div>
         <p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1>
         <p class="tip" id="tip"></p>
         <div class="tiles" id="tiles" role="list" aria-label="${L('Result for each string', 'Ergebnis für jede Saite')}"></div>
       </div>
     </div>`,
    `<div class="grp"><button class="btn" id="again">${L('Start over', 'Von vorn')} <kbd>R</kbd></button><button class="btn" id="back">${icon('left')}${L('Back a string', 'Eine Saite zurück')} <kbd>←</kbd></button><button class="btn" id="fwd"><span id="fwdl"></span> <kbd>→</kbd></button>${nextStep(ctx)}</div>${
      ctx
        ? `<p class="auto"${!ids.includes('stay') && !showRule ? ' hidden' : ''}>${ids.includes('stay') ? L('Optional. A barre takes weeks, not minutes: a few tries a day do more than one long fight.', 'Freiwillig. Ein Barré braucht Wochen, nicht Minuten: Ein paar Versuche am Tag bringen mehr als ein langer Kampf.') : L('No clock. A string that will not ring after three tries is left for next time.', 'Keine Uhr. Eine Saite, die nach drei Versuchen nicht klingt, bleibt fürs nächste Mal.')}</p>`
        : `<nav class="chords" aria-label="${L('Chord', 'Akkord')}">${[...new Set(['Em', 'Am', 'E', 'A', 'D', 'C', 'G', 'Dm', 'F', chord.id])]
            .map((id) => CHORDS[id])
            .map((c) => `<a href="#/chord/${encodeURIComponent(c.id)}" aria-current="${c.id === chord.id}">${c.name}</a>`)
            .join('')}<a href="#/chords" data-toolbox="chords">${L('All chords…', 'Alle Griffe …')}</a></nav>`
    }`,
    ctx,
  );

  const cleanCount = (): number => strings.filter((i) => results[i] === 'clean').length;
  const nextName = (): string => (q + 1 < queue.length ? queue[q + 1].name : '');

  function draw(): void {
    const done = at >= strings.length;
    const s = strings[Math.min(at, strings.length - 1)];
    const last = results[s];
    const marks = midis.map((m, i) => (m === null ? null : !done && i === s ? 'now' : (results[i] ?? null))) as Mark[];
    let svg = shown
      ? chordBox(chord, 70, 76, 260, LEARN, false, marks, 62)
      : [0, 1, 2, 3, 4, 5].map((k) => `<line x1="${70 + k * 52}" x2="${70 + k * 52}" y1="76" y2="386" stroke="${LEARN.faint}" stroke-width="1.5"/><line x1="70" x2="330" y1="${76 + k * 62}" y2="${76 + k * 62}" stroke="${k ? LEARN.line : LEARN.text}" stroke-width="${k ? 1.5 : 4}"/>`).join('') + `<text x="200" y="250" class="cn" text-anchor="middle" style="font-size:64px" fill="${LEARN.faint}">?</text>`;
    STRING_NAMES.forEach((n, i) => {
      const x = 70 + (store.settings.leftHanded ? 5 - i : i) * 52;
      const m = marks[i];
      svg += `<text x="${x}" y="40" class="sn" fill="${m === 'now' ? LEARN.now : midis[i] === null ? LEARN.faint : LEARN.text}">${n}</text>`;
      const y = 418;
      const failed = m === 'now' && results[i] && results[i] !== 'clean';
      if (failed) svg += `<path d="M${x - 8} ${y - 8}l16 16M${x + 8} ${y - 8}l-16 16" stroke="${LEARN.bad}" stroke-width="3.4" stroke-linecap="round"/>`;
      else if (m === 'clean') svg += `<path d="M${x - 9} ${y}l6 6 12-13" fill="none" stroke="${LEARN.good}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      else if (m === 'muted' || m === 'buzz' || m === 'wrong') svg += `<path d="M${x - 8} ${y - 8}l16 16M${x + 8} ${y - 8}l-16 16" stroke="${LEARN.bad}" stroke-width="3.4" stroke-linecap="round"/>`;
      else if (midis[i] !== null) svg += `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="${m === 'now' ? LEARN.now : LEARN.faint}" stroke-width="2.5"/>`;
    });
    const box = $('#box', root);
    box.innerHTML = svg;
    box.setAttribute('aria-label', L(`Chord diagram of ${chord.name} with the result for each string`, `Akkorddiagramm von ${chord.name} mit dem Ergebnis für jede Saite`));
    const cname = root.querySelector('#cname');
    if (cname) cname.textContent = chord.name;
    const which = queue.length > 1 ? L(`Chord ${q + 1} of ${queue.length} · `, `Akkord ${q + 1} von ${queue.length} · `) : '';
    $('#eb', root).textContent = `${ctx ? ctx.label + ' · ' : ''}${which}${chord.name} · ${done ? L('checked', 'geprüft') : L(`string ${at + 1} of ${strings.length}`, `Saite ${at + 1} von ${strings.length}`)}`;
    $('#h1', root).innerHTML = done
      ? cleanCount() === strings.length
        ? L('Every string rings clean.', 'Jede Saite klingt sauber.')
        : L(`${cleanCount()} of ${strings.length} strings ring clean.`, `${cleanCount()} von ${strings.length} Saiten ${cleanCount() === 1 ? 'klingt' : 'klingen'} sauber.`)
      : last && last !== 'clean' && last !== 'now'
        ? L(`${STRING_NAMES[s]} ${last === 'muted' ? 'is muted' : last === 'buzz' ? 'buzzes' : 'was not it'}. Pluck the <em>${STRING_FULL[s]} string</em> again.`, `${last === 'muted' ? `${STRING_NAMES[s]} ist abgedämpft` : last === 'buzz' ? `${STRING_NAMES[s]} schnarrt` : `Das war nicht ${STRING_NAMES[s]}`}. Zupf die <em>${STRING_FULL[s]}-Saite</em> noch einmal.`)
        : L(`Hold ${chord.name}. Pluck the <em>${STRING_FULL[s]} string</em>.`, `Halte ${chord.name}. Zupf die <em>${STRING_FULL[s]}-Saite</em>.`);
    // before the first pluck: where the fingers go
    const fresh = !done && !tip && at === 0 && results.length === 0;
    $('#tip', root).innerHTML = fresh && !shown
      ? L(`<b>From memory</b>You have had ${chord.name} ringing before. Put it down without the picture, then pluck one string at a time, low to high. <kbd>S</kbd> shows the shape.`, `<b>Auswendig</b>${chord.name} hat bei dir schon geklungen. Greif ihn ohne Bild, dann zupf eine Saite nach der anderen, von tief nach hoch. <kbd>S</kbd> zeigt den Griff.`)
      : fresh
      ? L(`<b>How to hold ${chord.name}</b>${holdLines(chord).join('.<br>')}.<br>Then pluck one string at a time, low to high, and let each ring.`, `<b>So greifst du ${chord.name}</b>${holdLines(chord).join('.<br>')}.<br>Dann zupf eine Saite nach der anderen, von tief nach hoch, und lass jede klingen.`)
      : `<b>${done ? L('Result', 'Ergebnis') : tip ? (advice ? L('Try this', 'Versuch das') : L('Moving on', 'Weiter geht’s')) : L('How it works', 'So geht’s')}</b>${tip || L('Pluck one string at a time, low to high, and let it ring for a moment.', 'Zupf eine Saite nach der anderen, von tief nach hoch, und lass sie kurz klingen.')}`;
    /** a result as a tile says it */
    const said = (r: Mark): string => L(String(r), r === 'muted' ? 'abgedämpft' : r === 'buzz' ? 'schnarrt' : r === 'wrong' ? 'falsch' : r === 'clean' ? 'sauber' : String(r));
    $('#tiles', root).innerHTML = STRING_NAMES.map((n, i) => {
      const m = marks[i];
      const word = midis[i] === null ? L('not played', 'nicht gespielt') : m === 'now' ? (results[i] && results[i] !== 'clean' ? said(results[i]) : L('now', 'jetzt')) : m === 'clean' ? L('clean', 'sauber') : left.has(i) ? L('next time', 'nächstes Mal') : m ? said(m) : L('next', 'kommt noch');
      return `<div class="tile ${midis[i] === null ? 'skip' : m === 'now' ? 'now ' + (results[i] ?? '') : (m ?? '')}" role="listitem"><b>${n}</b><span>${word}</span></div>`;
    }).join('');
    $('#fwdl', root).textContent = !done ? L('Skip this string', 'Saite überspringen') : nextName() ? L(`Next chord: ${nextName()}`, `Nächster Akkord: ${nextName()}`) : stay ? L('Done for today', 'Fertig für heute') : ctx ? L('Next step', 'Nächster Schritt') : L('Once more', 'Noch einmal');
    $<HTMLButtonElement>('#back', root).disabled = at === 0;
    setSimTarget(done ? null : { kind: 'note', midi: midis[s]!, string: s });
    if (done) engine.listener?.cancelStringCheck();
    else engine.listener?.startStringCheck(midis[s]!);
  }

  /** Starts the check of a chord of the queue. */
  function start(n = q): void {
    stopTimer(timer);
    q = n;
    chord = queue[q];
    midis = chordMidis(chord);
    strings = midis.map((m, i) => (m === null ? -1 : i)).filter((i) => i >= 0);
    at = 0;
    results = [];
    tries = [];
    left = new Set();
    shown = !stageCheck && store.skills.level(`chord:${chord.id}`) < 2;
    // The clock starts when the chord is shown, not at the first pluck: what is measured is how long it
    // takes to find the shape and get every string to ring, which is what knowing a chord means.
    startT = engine.listener?.time ?? -1;
    tip = '';
    draw();
  }

  /** What comes after a chord: the next of today's chords, the next step of the session, or the same chord again. */
  function onward(): void {
    stopTimer(timer);
    if (q + 1 < queue.length) start(q + 1);
    else if (ctx) ctx.next();
    else if (stageCheck) location.hash = '/progress';
    else start(q);
  }

  /** Every string has been clean, tried or skipped. */
  function finishChord(time: number): void {
    const n = strings.length;
    const clean = cleanCount();
    // the tip is shown as HTML: what the session says comes next can hold the title of an own song
    const after = nextName() ? L(`Next: ${nextName()}.`, `Als Nächstes: ${nextName()}.`) : stay ? L('Once more with R, or finish with the right arrow.', 'Noch einmal mit R, oder mit dem Pfeil nach rechts abschließen.') : ctx ? L(`Next: ${esc(ctx.after)}.`, `Als Nächstes: ${esc(ctx.after)}.`) : L('It starts over in a moment.', 'Gleich geht es von vorn los.');
    // the barre project keeps the most strings that rang on each day, its course over the thirty days
    if (store.barre && store.barre.chord === chord.id) {
      const d = String(dayOf(Date.now()));
      store.barre.rings[d] = Math.max(store.barre.rings[d] ?? 0, Math.round((clean / n) * 6));
      store.save();
    }
    if (clean === n && !left.size && startT >= 0) {
      passed.add(chord.id);
      const secs = time - startT;
      const change = store.skills.record(`chord:${chord.id}`, secs, Date.now());
      tip = L(`All ${n} strings clean, ${secs.toFixed(0)} seconds after the chord came up.${levelNews([change])} ${after}`, `Alle ${n} Saiten sauber, ${secs.toFixed(0)} Sekunden, nachdem der Akkord erschienen ist.${levelNews([change])} ${after}`);
    } else {
      passed.delete(chord.id);
      store.skills.record(`chord:${chord.id}`, Infinity, Date.now(), Math.min(5, Math.round((clean / n) * 6)));
      const missing = strings.filter((i) => results[i] !== 'clean').map((i) => STRING_NAMES[i]);
      tip = L(`${missing.join(', ')} ${missing.length > 1 ? 'do' : 'does'} not ring yet. That is normal for a chord that is new to the hand; it comes back next time. ${after}`, `${missing.join(', ')} ${missing.length > 1 ? 'klingen' : 'klingt'} noch nicht. Das ist normal bei einem Akkord, der für die Hand neu ist; beim nächsten Mal kommt er wieder dran. ${after}`);
    }
    if (stageCheck && required.length && q === queue.length - 1) {
      // every chord of the stage, each string clean, in one go: the stage is confirmed
      const ok = stageConfirmed(required, passed);
      const rang = required.filter((id) => passed.has(id)).length;
      if (ok) store.progress['check:open'] = Date.now();
      tip = ok
        ? L(`All ${required.length} chords rang clean in a row. The stage is confirmed.`, `Alle ${required.length} Akkorde haben in einem Zug sauber geklungen. Die Etappe ist bestätigt.`)
        : L(`${rang} of ${required.length} chords rang clean in a row. The stage is confirmed when all of them do; the ones that did not are on the path.`, `${rang} von ${required.length} Akkorden ${rang === 1 ? 'hat' : 'haben'} in einem Zug sauber geklungen. Die Etappe ist bestätigt, wenn alle es tun; die übrigen findest du auf dem Weg.`);
    }
    store.save();
    if (!stay) timer = later(guided ? 4000 : 6000, onward, q + 1 < queue.length ? L(`the next chord, ${queue[q + 1].name}`, `der nächste Akkord, ${queue[q + 1].name}`) : ctx ? ctx.after : stageCheck ? L('the path', 'der Weg') : L(`${chord.name} once more`, `noch einmal ${chord.name}`));
  }

  /** Leaves the string that is being checked. */
  function skip(time: number): void {
    left.add(strings[at]);
    at++;
    tip = '';
    if (at >= strings.length) finishChord(time);
  }

  const stopHear = hear(
    root,
    {
      onString: (e) => {
        if (at >= strings.length) return;
        const s = strings[at];
        if (startT < 0) startT = e.time;
        results[s] = e.result;
        if (e.result === 'clean') {
          learnRing(e.ring);
          left.delete(s);
          at++;
          tip = '';
          if (at >= strings.length) finishChord(e.time);
        } else {
          tries[s] = (tries[s] ?? 0) + 1;
          tip = stringTip(chord.id, s, e.result, e.heard);
          advice = true;
          // the picture comes back as soon as it is needed
          shown = true;
          store.skills.record(`chord:${chord.id}`, Infinity, Date.now(), Math.min(5, Math.round((cleanCount() / strings.length) * 6)));
          store.save();
          // in the session nothing may take for ever: after three tries the string is left for next time
          if (guided && tries[s] >= TRIES) {
            skip(e.time);
            if (at < strings.length) {
              tip = L(`The ${STRING_FULL[s]} string is left for next time. On with the ${STRING_FULL[strings[at]]} string.`, `Die ${STRING_FULL[s]}-Saite bleibt fürs nächste Mal. Weiter mit der ${stringName(strings[at], true)}.`);
              advice = false;
            }
          }
        }
        draw();
      },
    },
    (l) => (l.noteDetection = false),
  );
  const forward = (): void => {
    if (at >= strings.length) return onward();
    skip(engine.listener?.time ?? 0);
    draw();
  };
  const back = (): void => {
    if (at === 0) return;
    stopTimer(timer);
    at = Math.min(at, strings.length) - 1;
    const s = strings[at];
    results[s] = null;
    tries[s] = 0;
    left.delete(s);
    tip = '';
    draw();
  };
  const stopKeys = keys({
    r: () => start(q),
    ArrowLeft: back,
    ArrowRight: forward,
    s: () => {
      shown = true;
      draw();
    },
  });
  $('#again', root).onclick = () => start(q);
  $('#back', root).onclick = back;
  $('#fwd', root).onclick = forward;
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  start(0);
  return () => {
    stopTimer(timer);
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
};
