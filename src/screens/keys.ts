/**
 * Chord check on the piano: the keys of a chord one at a time, low to high, each of which has to ring on,
 * and then all of them at once. No clock. What is measured is how long it takes from the moment the chord
 * comes up until all of it has rung: what knowing a chord means. In the guided session it takes today's
 * chords one after the other and never gets stuck: a key that will not ring is left for next time after
 * three tries.
 */
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { KEY_CHORDS, KEY_CHORDS_ON } from '../music/content';
import { chordKey } from '../music/difficulty';
import { isBlackKey, keyLines, keyName, keysAlike, noteName, pianoChord, strumIs, type KeyChord } from '../music/theory';
import { $, esc, hear, icon, keys, later, pianoEars, stopTimer, type Screen } from '../ui/dom';
import { keyboard, keyRange, LEARN, type KeyMark } from '../ui/draw';
import { setSimTarget } from '../ui/practice';
import { frame, levelNews, nextStep } from './learn';

/** How often a key is tried in the guided session before it is left for next time. */
const TRIES = 3;
type Result = 'clean' | 'muted' | 'wrong' | 'buzz' | null;

/** Is this the name of a chord the piano can be asked for? */
export const isKeyChord = (id: string | undefined): id is string => !!id && /^[A-G][#b]?(m7b5|maj7|7sus4|m7|add9|sus4|sus2|69|7|m)?$/.test(id);

export const keyCheck: Screen = (root, ids, ctx) => {
  /** the check at the end of a stage: several chords in a row, from memory, and the result is kept */
  const stageCheck = !ctx && ids[0] === 'check';
  const guided = !!ctx || stageCheck;
  let passed = 0;
  const queue: KeyChord[] = (guided ? ids : ids.slice(0, 1)).filter(isKeyChord).map(pianoChord);
  if (!queue.length) queue.push(pianoChord('C'));
  let q = 0;
  let chord = queue[0];
  /** one step for every key, and one more for all of them together */
  let n = chord.midis.length + 1;
  let at = 0;
  let results: Result[] = [];
  let tries: number[] = [];
  let left = new Set<number>();
  let startT = -1;
  let timer = 0;
  let tip = '';
  let advice = false;
  /** a chord that already rings is first asked for from memory: its keys stay unmarked until asked for or needed */
  let shown = true;

  root.innerHTML = frame(
    `<b>${L('Chord check', 'Akkord-Check')}</b> · <span id="cname"></span>`,
    `<div class="two">
       <div><svg class="fit" id="box" viewBox="0 0 520 330" role="img"></svg><p class="legend" style="text-align:center">${L('1 thumb · 2 index · 3 middle · 4 ring · 5 little finger', '1 Daumen · 2 Zeigefinger · 3 Mittelfinger · 4 Ringfinger · 5 kleiner Finger')}</p></div>
       <div>
         <p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1>
         <p class="tip" id="tip"></p>
         <div class="tiles" id="tiles" role="list" aria-label="${L('Result for each key, and for the chord as a whole', 'Ergebnis für jede Taste und für den Akkord als Ganzes')}"></div>
       </div>
     </div>`,
    `<div class="grp"><button class="btn" id="again">${L('Start over', 'Von vorn')} <kbd>R</kbd></button><button class="btn" id="back">${icon('left')}${L('Back a key', 'Eine Taste zurück')} <kbd>←</kbd></button><button class="btn" id="fwd"><span id="fwdl"></span> <kbd>→</kbd></button>${nextStep(ctx)}</div>${
      ctx
        ? `<p class="auto">${L('No clock. A key that will not ring after three tries is left for next time.', 'Keine Uhr. Eine Taste, die nach drei Versuchen nicht klingt, bleibt fürs nächste Mal.')}</p>`
        : `<nav class="chords" aria-label="${L('Chord', 'Akkord')}">${[...KEY_CHORDS, ...KEY_CHORDS_ON]
            .map((c) => `<a href="#/keys/${encodeURIComponent(c)}" aria-current="${c === chord.id}">${esc(pianoChord(c).name)}</a>`)
            .join('')}</nav>`
    }`,
    ctx,
  );

  /** a key of the chord by the name the chord gives it */
  const plain = (midi: number): string => keyName(midi, chord.id, false);
  /** where the fingers go, in two sentences: the keys with their fingers, then what the shape is like */
  const where = (): string => {
    const lines = keyLines(chord.id);
    // German nouns keep their capital letter
    const fingers = lines.slice(0, -1).map((l, i) => (i ? L(l[0].toLowerCase() + l.slice(1), l) : l));
    return `${fingers.join('; ')}. ${lines[lines.length - 1]}.`;
  };
  const together = (): boolean => at === n - 1;
  const cleanCount = (): number => results.filter((r) => r === 'clean').length;
  const nextName = (): string => (q + 1 < queue.length ? queue[q + 1].name : '');
  /** what the chord is told apart from when all its keys are struck: plain chords that have little in common with it */
  const others = (): string[] => [...KEY_CHORDS, 'D', 'A', 'E'].filter((c) => c !== chord.id && keysAlike(c, chord.id) < 0.6).slice(0, 5);

  function draw(): void {
    const done = at >= n;
    const all = !done && together();
    const last = results[Math.min(at, n - 1)];
    const failed = !!last && last !== 'clean';
    const marks: KeyMark[] = shown
      ? chord.midis.map((midi, i) => ({ midi, fg: chord.fingers[i], hot: !done && (all || i === at), held: true, done: results[i] === 'clean', bad: !!results[i] && results[i] !== 'clean' }))
      : chord.midis.map((midi, i) => ({ midi, done: results[i] === 'clean' }));
    const r = keyRange([60, 76, ...chord.midis], true);
    const box = $('#box', root);
    box.innerHTML =
      `<text x="260" y="44" class="cn" text-anchor="middle" style="font-size:40px" fill="${LEARN.text}">${esc(chord.name)}</text>` +
      keyboard(marks, LEARN, r.lowC, r.octaves, { x: 14, y: 70, w: 492, h: 220, names: true }) +
      (shown ? '' : `<text x="260" y="322" class="lbl" text-anchor="middle" fill="${LEARN.muted}">${L('from memory: S shows the keys', 'auswendig: S zeigt die Tasten')}</text>`);
    box.setAttribute('aria-label', L(`Keyboard with the keys of ${chord.name} and the result for each`, `Tastatur mit den Tasten von ${chord.name} und dem Ergebnis für jede`));
    const cname = root.querySelector('#cname');
    if (cname) cname.textContent = chord.name;
    const which = queue.length > 1 ? L(`Chord ${q + 1} of ${queue.length} · `, `Akkord ${q + 1} von ${queue.length} · `) : '';
    $('#eb', root).textContent = `${ctx ? ctx.label + ' · ' : ''}${which}${chord.name} · ${done ? L('checked', 'geprüft') : all ? L('all keys together', 'alle Tasten zusammen') : L(`key ${at + 1} of ${chord.midis.length}`, `Taste ${at + 1} von ${chord.midis.length}`)}`;
    const key = chord.midis[Math.min(at, chord.midis.length - 1)];
    const fg = chord.fingers[Math.min(at, chord.midis.length - 1)];
    $('#h1', root).innerHTML = done
      ? cleanCount() === n
        ? L('Every key rings, and the chord as a whole.', 'Jede Taste klingt, und der Akkord als Ganzes auch.')
        : L(`${cleanCount()} of ${n} rang clean.`, `${cleanCount()} von ${n} ${cleanCount() === 1 ? 'hat' : 'haben'} sauber geklungen.`)
      : all
        ? failed
          ? L(`That was not ${esc(chord.name)} yet. <em>All its keys</em> down together, once more.`, `Das war noch nicht ${esc(chord.name)}. Noch einmal, <em>alle Tasten</em> zugleich.`)
          : L(`Now <em>all of ${esc(chord.name)}</em> at once.`, `Jetzt <em>den ganzen ${esc(chord.name)}</em> auf einmal.`)
        : failed
          ? L(`${plain(key)} ${last === 'wrong' ? 'was not it' : 'was cut short'}. Play <em>${plain(key)}</em> again and hold it.`, `${last === 'wrong' ? `Das war nicht ${plain(key)}` : `${plain(key)} war zu kurz`}. Spiel <em>${plain(key)}</em> noch einmal und halte die Taste.`)
          : L(`Lay the hand on ${esc(chord.name)}. Play <em>${plain(key)}</em> with finger ${fg} and let it ring.`, `Leg die Hand auf ${esc(chord.name)}. Spiel <em>${plain(key)}</em> mit Finger ${fg} und lass den Ton klingen.`);
    // before the first key: where the fingers go
    const fresh = !done && !tip && at === 0 && results.length === 0;
    $('#tip', root).innerHTML =
      fresh && !shown
        ? L(`<b>From memory</b>You have had ${esc(chord.name)} ringing before. Find it without the picture, then play its keys one at a time, low to high. <kbd>S</kbd> shows the keys.`, `<b>Auswendig</b>${esc(chord.name)} hat bei dir schon geklungen. Finde den Akkord ohne Bild, dann spiel seine Tasten einzeln, von tief nach hoch. <kbd>S</kbd> zeigt die Tasten.`)
        : fresh
          ? L(`<b>How to play ${esc(chord.name)}</b>${esc(where())}<br>Then one key at a time, low to high, and last all of them at once.`, `<b>So spielst du ${esc(chord.name)}</b>${esc(where())}<br>Dann eine Taste nach der anderen, von tief nach hoch, und zuletzt alle auf einmal.`)
          : `<b>${done ? L('Result', 'Ergebnis') : tip ? (advice ? L('Try this', 'Versuch das') : L('Moving on', 'Weiter geht’s')) : L('How it works', 'So geht’s')}</b>${tip || (all ? L('Lift the hand a little and let all its fingers fall together: one sound, not a roll.', 'Heb die Hand ein wenig und lass alle Finger zugleich fallen: ein Klang, nicht nacheinander.') : L('One key at a time, low to high. Keep each one down for a moment, so that it rings on.', 'Eine Taste nach der anderen, von tief nach hoch. Halte jede einen Moment gedrückt, damit sie nachklingt.'))}`;
    $('#tiles', root).innerHTML = [...chord.midis.map(plain), L('All', 'Alle')]
      .map((label, i) => {
        const res = results[i];
        const now = !done && i === at;
        const word = now ? (res && res !== 'clean' ? (res === 'muted' ? L('short', 'kurz') : L('again', 'nochmal')) : L('now', 'jetzt')) : res === 'clean' ? L('clean', 'sauber') : left.has(i) ? L('next time', 'nächstes Mal') : res ? (res === 'muted' ? L('short', 'kurz') : L('not it', 'falsch')) : L('next', 'kommt noch');
        return `<div class="tile ${now ? 'now ' + (res ?? '') : (res ?? '')}" role="listitem"><b>${label}</b><span>${word}</span></div>`;
      })
      .join('');
    $('#fwdl', root).textContent = !done ? (all ? L('Skip this', 'Überspringen') : L('Skip this key', 'Taste überspringen')) : nextName() ? L(`Next chord: ${nextName()}`, `Nächster Akkord: ${nextName()}`) : ctx ? L('Next step', 'Nächster Schritt') : L('Once more', 'Noch einmal');
    $<HTMLButtonElement>('#back', root).disabled = at === 0;
    const l = engine.listener;
    if (done) {
      setSimTarget(null);
      l?.cancelStringCheck();
      if (l) l.chordCandidates = null;
    } else if (all) {
      setSimTarget({ kind: 'chord', id: chord.id, piano: true });
      l?.cancelStringCheck();
      if (l) l.chordCandidates = [chord.id, ...others()];
    } else {
      setSimTarget({ kind: 'note', midi: key, piano: true });
      if (l) l.chordCandidates = null;
      l?.startStringCheck(key);
    }
  }

  /** Starts the check of a chord of the queue. */
  function start(k = q): void {
    stopTimer(timer);
    q = k;
    chord = queue[q];
    n = chord.midis.length + 1;
    at = 0;
    results = [];
    tries = [];
    left = new Set();
    shown = !stageCheck && store.skills.level(chordKey(chord.id, true)) < 2;
    // the clock starts when the chord is shown: finding it is part of knowing it
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

  /** Every key and the whole chord have been clean, tried or skipped. */
  function finishChord(time: number): void {
    const clean = cleanCount();
    const key = chordKey(chord.id, true);
    const after = nextName() ? L(`Next: ${nextName()}.`, `Als Nächstes: ${nextName()}.`) : ctx ? L(`Next: ${ctx.after}.`, `Als Nächstes: ${ctx.after}.`) : L('It starts over in a moment.', 'Gleich geht es von vorn los.');
    if (clean === n && !left.size && startT >= 0) {
      passed++;
      const secs = time - startT;
      const change = store.skills.record(key, secs, Date.now());
      tip = L(`All of it clean, ${secs.toFixed(0)} seconds after the chord came up.${levelNews([change])} ${after}`, `Alles sauber, ${secs.toFixed(0)} Sekunden, nachdem der Akkord erschienen ist.${levelNews([change])} ${after}`);
    } else {
      store.skills.record(key, Infinity, Date.now(), Math.min(5, Math.round((clean / n) * 6)));
      const missing = [...chord.midis.map(plain), L('the chord as a whole', 'der Akkord als Ganzes')].filter((_, i) => results[i] !== 'clean');
      tip = L(`${missing.join(', ')}: not there yet. That is normal for a chord that is new to the hand; it comes back next time. ${after}`, `${missing.join(', ')}: noch nicht so weit. Das ist normal bei einem Akkord, der für die Hand neu ist; beim nächsten Mal kommt er wieder dran. ${after}`);
    }
    if (stageCheck && q === queue.length - 1) {
      if (passed === queue.length) store.progress['check:keys'] = Date.now();
      tip =
        passed === queue.length
          ? L(`All ${queue.length} chords rang clean in a row. The stage is confirmed.`, `Alle ${queue.length} Akkorde haben in einem Zug sauber geklungen. Die Etappe ist bestätigt.`)
          : L(`${passed} of ${queue.length} chords rang clean in a row. The stage is confirmed when all of them do; the ones that did not are on the path.`, `${passed} von ${queue.length} Akkorden ${passed === 1 ? 'hat' : 'haben'} in einem Zug sauber geklungen. Die Etappe ist bestätigt, wenn alle es tun; die übrigen findest du auf dem Weg.`);
    }
    store.save();
    timer = later(guided ? 4000 : 6000, onward, q + 1 < queue.length ? L(`the next chord, ${queue[q + 1].name}`, `der nächste Akkord, ${queue[q + 1].name}`) : ctx ? ctx.after : stageCheck ? L('the path', 'der Weg') : L(`${chord.name} once more`, `noch einmal ${chord.name}`));
  }

  /** Leaves the key (or the whole chord) that is being checked. */
  function skip(time: number): void {
    left.add(at);
    at++;
    tip = '';
    if (at >= n) finishChord(time);
  }

  /** One step went well, or did not. */
  function heard(result: Exclude<Result, null>, time: number, why: string): void {
    if (at >= n) return;
    const i = at;
    if (startT < 0) startT = time;
    results[i] = result;
    if (result === 'clean') {
      left.delete(i);
      at++;
      tip = '';
      if (at >= n) finishChord(time);
    } else {
      tries[i] = (tries[i] ?? 0) + 1;
      tip = why;
      advice = true;
      // the picture comes back as soon as it is needed
      shown = true;
      store.skills.record(chordKey(chord.id, true), Infinity, Date.now(), Math.min(5, Math.round((cleanCount() / n) * 6)));
      store.save();
      if (guided && tries[i] >= TRIES) {
        skip(time);
        if (at < n) {
          tip = L(`${i < chord.midis.length ? plain(chord.midis[i]) : 'The whole chord'} is left for next time. On with ${at < chord.midis.length ? plain(chord.midis[at]) : 'the whole chord'}.`, `${i < chord.midis.length ? plain(chord.midis[i]) : 'Der ganze Akkord'} bleibt fürs nächste Mal. Weiter mit ${at < chord.midis.length ? plain(chord.midis[at]) : 'dem ganzen Akkord'}.`);
          advice = false;
        }
      }
    }
    draw();
  }

  const stopHear = hear(
    root,
    {
      onString: (e) => {
        if (at >= n || together()) return;
        const key = chord.midis[at];
        heard(
          e.result === 'buzz' ? 'clean' : e.result,
          e.time,
          e.result === 'wrong'
            ? L(`That was ${e.heard === null ? 'another key' : noteName(e.heard)}. ${plain(key)} is ${isBlackKey(key) ? 'the black key marked in the picture' : 'the white key marked in the picture'}.`, `Das war ${e.heard === null ? 'eine andere Taste' : noteName(e.heard)}. ${plain(key)} ist ${isBlackKey(key) ? 'die schwarze Taste, die im Bild markiert ist' : 'die weiße Taste, die im Bild markiert ist'}.`)
            : L('Keep the key down a moment longer: press it to the bottom and let the weight of the arm rest in it.', 'Halte die Taste einen Moment länger: Drück sie ganz hinunter und lass das Gewicht des Arms darin ruhen.'),
        );
      },
      onChord: (e) => {
        if (at >= n || !together()) return;
        if (strumIs(e, chord.id, true)) heard('clean', e.time, '');
        else if (e.best && e.best !== chord.id && e.score > 0.7 && e.margin > 0.1) heard('wrong', e.time, L(`That sounded like ${pianoChord(e.best).name}. Look at the marked keys again and let the fingers fall on them together.`, `Das klang nach ${pianoChord(e.best).name}. Schau dir die markierten Tasten noch einmal an und lass die Finger zugleich darauf fallen.`));
        else if (e.score > 0.35) heard('wrong', e.time, L('Not all keys came down together. Lift the hand a little and drop it as one.', 'Nicht alle Tasten gingen zugleich hinunter. Heb die Hand ein wenig und lass sie als Ganzes fallen.'));
      },
    },
    (l) => {
      pianoEars(l);
      l.noteDetection = false;
    },
  );
  const forward = (): void => {
    if (at >= n) return onward();
    skip(engine.listener?.time ?? 0);
    draw();
  };
  const back = (): void => {
    if (at === 0) return;
    stopTimer(timer);
    at = Math.min(at, n) - 1;
    results[at] = null;
    tries[at] = 0;
    left.delete(at);
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
