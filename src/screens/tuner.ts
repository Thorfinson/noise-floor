/**
 * Tuner. For the guitar it sees which string is plucked, says which way to turn and ticks the string off
 * when it is in tune; any string can be tuned again at any time. A piano cannot be tuned by its player, so there the app tunes itself:
 * it listens to the piano's A and adopts its pitch. "Any note" shows whatever is sounding.
 */
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { FOLLOW_AFTER, midiToFreq, nearestString, NOTE_NAMES, noteName, OPEN_STRINGS, STRING_FULL, STRING_NAMES, stringName } from '../music/theory';
import { $, $$, hear, icon, keys, later, micMeter, stopTimer, type Screen } from '../ui/dom';
import { keyboard, LEARN } from '../ui/draw';
import { practiceBar, setSimTarget } from '../ui/practice';

const NEEDLE = (): string => `<svg class="needle" viewBox="0 0 640 110" role="img" aria-label="${L('How far the note is from in tune', 'Wie weit der Ton vom gestimmten Ton entfernt ist')}">
  <line x1="20" x2="620" y1="70" y2="70" stroke="var(--line)" stroke-width="3"/>
  <rect x="284" y="52" width="72" height="36" rx="8" fill="none" stroke="var(--good)" stroke-width="2.5"/>
  <path d="M20 58v24M170 62v16M320 46v48M470 62v16M620 58v24" stroke="var(--faint)" stroke-width="2.5"/>
  <text x="20" y="104" class="lbl" fill="var(--muted)">${L('too low', 'zu tief')}</text><text x="620" y="104" class="lbl" text-anchor="end" fill="var(--muted)">${L('too high', 'zu hoch')}</text>
  <circle id="dot" cx="320" cy="70" r="14" fill="var(--now)" opacity="0"/>
</svg>`;
function moveDot(root: HTMLElement, cents: number, ok: boolean): void {
  const dot = $<SVGCircleElement>('#dot', root);
  dot.setAttribute('cx', String(320 + Math.max(-50, Math.min(50, cents)) * 6));
  dot.setAttribute('opacity', '1');
  dot.setAttribute('fill', ok ? 'var(--good)' : 'var(--now)');
}

export const tuner: Screen = (root, [mode], ctx) => {
  const which = mode === 'piano' ? 'piano' : mode === 'any' && !ctx ? 'any' : 'guitar';
  const tab = (id: string, href: string, label: string): string => `<a href="#/tuner${href}" aria-current="${which === id}">${label}</a>`;
  const head = `<header class="top"><div><a class="btn quiet" href="#/">${icon(ctx ? 'x' : 'left')}${ctx ? L('End session', 'Session beenden') : L('Home', 'Start')}</a></div>
    <div class="c">${ctx ? ctx.rail : `<nav class="seg" aria-label="${L('What to tune', 'Was gestimmt wird')}">${tab('guitar', '', L('Guitar', 'Gitarre'))}${tab('piano', '/piano', L('Piano', 'Klavier'))}${tab('any', '/any', L('Any note', 'Beliebiger Ton'))}</nav>`}</div>
    <div class="r">${micMeter()}</div></header>`;
  return which === 'any' ? anyNote(root, head) : which === 'piano' ? piano(root, head, ctx) : guitar(root, head, ctx);
};

/** The piano's A, played once: the app adopts its pitch. */
function piano(root: HTMLElement, head: string, ctx: Parameters<Screen>[2]): () => void {
  const A = 69;
  let recent: number[] = [];
  let timer = 0;
  let done = false;

  root.innerHTML = `${head}<div class="stage"><div class="tuner">
      <p class="eyebrow">${ctx ? ctx.label + ' · ' : ''}${L('Match the app to your piano', 'Die App auf dein Klavier einstellen')}</p>
      <h1 id="h1" aria-live="polite"></h1>
      ${NEEDLE()}
      <p class="sub" id="msg" aria-live="polite"></p>
    </div>
    <svg class="fit" id="kb" viewBox="0 0 1180 300" role="img" aria-label="${L('Keyboard with the A above middle C highlighted', 'Tastatur, auf der das A über dem mittleren C hervorgehoben ist')}"></svg></div>${practiceBar()}
    <footer class="bar"><div class="grp"><button class="btn" id="again">${L('Listen again', 'Noch einmal hören')} <kbd>R</kbd></button><button class="btn quiet" id="std">${L('Back to A = 440', 'Zurück zu A = 440')}</button>${ctx ? `<button class="btn quiet" id="skip">${L('Skip', 'Überspringen')}${icon('right')}</button>` : ''}</div>
    <p class="auto" id="ref"></p></footer>`;
  $('#kb', root).innerHTML = keyboard([{ midi: A, hot: true }], LEARN, 60, 2);
  const showRef = (): void => {
    $('#ref', root).textContent = L(
      `The app hears your piano with A = ${store.settings.pianoA4.toFixed(1)} Hz. A piano drifts with the seasons, so this is asked at the start of every session.`,
      `Die App hört dein Klavier mit A = ${store.settings.pianoA4.toFixed(1).replace('.', ',')} Hz. Ein Klavier verändert sich mit den Jahreszeiten, deshalb wird das zu Beginn jeder Session abgefragt.`,
    );
  };

  function listen(): void {
    stopTimer(timer);
    done = false;
    recent = [];
    key = null;
    $('#h1', root).innerHTML = L('Play the <em>A above middle C</em> and hold it.', 'Spiel das <em>A über dem mittleren C</em> und halte es.');
    $('#msg', root).textContent = L('Middle C is the C in the middle of the keyboard, marked C4 here. The A is five white keys to its right.', 'Das mittlere C ist das C in der Mitte der Tastatur, hier mit C4 markiert. Das A liegt fünf weiße Tasten rechts davon.');
    $<SVGCircleElement>('#dot', root).setAttribute('opacity', '0');
    setSimTarget({ kind: 'note', midi: A, piano: true });
    showRef();
  }

  // The A is measured on its fundamental alone, in the spectrum, so that a key still sounding from before
  // (or the pedal) does not pull the result. The pitch of the whole sound only says which key it was.
  let key: { midi: number; time: number } | null = null;
  const wrongKey = (midi: number, nearA: boolean): void => {
    recent = [];
    $('#msg', root).textContent = L(
      `That was ${noteName(midi)}. Play the A: the highlighted key.${nearA ? ' If that was the A, your piano is more than half a semitone off: enter its pitch in the settings.' : ''}`,
      `Das war ${noteName(midi)}. Spiel das A: die hervorgehobene Taste.${nearA ? ' Falls das das A war, weicht dein Klavier um mehr als einen halben Halbton ab: Trag seine Tonhöhe in den Einstellungen ein.' : ''}`,
    );
  };
  const stopHear = hear(
    root,
    {
      onPitch: (e) => {
        key = { midi: e.midi, time: e.time };
      },
      onPartial: (e) => {
        if (done || e.level < 0.004) return;
        // against standard pitch, whatever the app was set to before
        const cents = 1200 * Math.log2(e.freq / 440);
        const heard = key && e.time - key.time < 0.3 ? key.midi : null;
        // A key next to the A is a whole semitone away, a piano out of tune hardly ever more than half of one.
        if (Math.abs(cents) > 65) {
          if (heard !== null) wrongKey(heard, heard === A - 1 || heard === A + 1);
          return;
        }
        // another note can have a partial where the A is: an A in any octave is fine, anything else is not
        if (heard !== null && (heard - A) % 12 !== 0) {
          wrongKey(heard, false);
          return;
        }
        recent.push(cents);
        if (recent.length > 12) recent.shift();
        const mid = recent.slice().sort((a, b) => a - b)[recent.length >> 1];
        moveDot(root, mid, Math.abs(mid) <= 6);
        if (recent.length < 12 || recent.some((c) => Math.abs(c - mid) > 6)) return;
        done = true;
        store.settings.pianoA4 = Math.round(Math.min(470, Math.max(400, 440 * Math.pow(2, mid / 1200))) * 10) / 10;
        store.save();
        setSimTarget(null);
        const off = Math.round(Math.abs(mid));
        $('#h1', root).innerHTML = L(`Your piano's A is at <em>${store.settings.pianoA4.toFixed(1)} Hz</em>.`, `Das A deines Klaviers liegt bei <em>${store.settings.pianoA4.toFixed(1).replace('.', ',')} Hz</em>.`);
        $('#msg', root).textContent = off <= 4 ? L('That is standard pitch.', 'Das ist der Kammerton.') : L(`${off} cents ${mid < 0 ? 'below' : 'above'} standard pitch. The app now listens at your piano's pitch.`, `${off} Cent ${mid < 0 ? 'unter' : 'über'} dem Kammerton. Die App hört jetzt in der Tonhöhe deines Klaviers.`);
        showRef();
        if (ctx) timer = later(2400, ctx.next, ctx.after);
      },
    },
    (l) => {
      l.a4 = 440;
      l.pitchTracking = true;
      l.noteDetection = false;
      // the strongest partial within five semitones of the A
      l.partialBand = [330, 587];
    },
  );
  const stopKeys = keys({ r: listen });
  $('#again', root).onclick = listen;
  $('#std', root).onclick = () => {
    store.settings.pianoA4 = 440;
    store.save();
    showRef();
  };
  const skip = root.querySelector<HTMLElement>('#skip');
  if (skip && ctx) skip.onclick = ctx.next;
  listen();
  return () => {
    stopTimer(timer);
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
}

/**
 * The guitar tuner. Pluck any string: the app sees which one it is, says which way to turn, and ticks it
 * off when it is in tune. Nothing is final: a string that was ticked is measured again whenever it is
 * plucked, and loses its tick when it has gone off, as it does when the wrong peg was turned.
 */
function guitar(root: HTMLElement, head: string, ctx: Parameters<Screen>[2]): () => void {
  /** the string on show */
  let at = 0;
  /** chosen by hand: measured against this string whatever is heard, for a string so far off that it sounds like its neighbour */
  let locked = false;
  const done = [false, false, false, false, false, false];
  let recent: number[] = [];
  let steady = 0;
  /** readings in a row that say a ticked string is off */
  let off = 0;
  let cand = -1;
  let candCount = 0;
  let timer = 0;
  let finished = false;
  /** what the headline says about the string on show */
  let state: 'ask' | 'low' | 'high' | 'ok' | 'other' = 'ask';
  /** when a pitch was last heard, to say so when nothing arrives at all */
  let lastHeard = performance.now();

  root.innerHTML = `${head}<div class="stage"><div class="tuner">
      <p class="eyebrow" id="eb"></p>
      <h1 id="h1" aria-live="polite"></h1>
      ${NEEDLE()}
      <p class="sub" id="msg" aria-live="polite"></p>
      <div class="strings" id="strings" role="group" aria-label="${L('Strings', 'Saiten')}"></div>
      <p class="legend" id="how">${L('Pluck any string: the app sees which one it is. To pick one yourself, click it or use <kbd>←</kbd> <kbd>→</kbd>.', 'Zupf irgendeine Saite: Die App erkennt, welche es ist. Um selbst eine zu wählen, klick sie an oder nimm <kbd>←</kbd> <kbd>→</kbd>.')}</p>
    </div></div>${practiceBar()}
    <footer class="bar"><div class="grp"><button class="btn" id="again">${L('Start over', 'Von vorn')} <kbd>R</kbd></button>${ctx ? `<button class="btn" id="skip">${icon('right')}<span id="skipl">${L('Skip tuning', 'Stimmen überspringen')}</span></button>` : ''}</div>
    <p class="auto">${L('Follow the string to its peg before you turn. If the dot does not move while you turn, it is the wrong peg.', 'Folge der Saite bis zu ihrem Wirbel, bevor du drehst. Wenn sich der Punkt beim Drehen nicht bewegt, ist es der falsche Wirbel.')}</p></footer>`;

  const tuned = (): number => done.filter(Boolean).length;
  const target = (i: number): number => midiToFreq(OPEN_STRINGS[i], store.settings.a4);

  function draw(): void {
    const name = STRING_FULL[at];
    const Name = name[0].toUpperCase() + name.slice(1);
    const de = stringName(at);
    const De = de[0].toUpperCase() + de.slice(1);
    $('#eb', root).textContent = L(`${ctx ? ctx.label + ' · ' : ''}Tune up · ${tuned()} of 6 in tune`, `${ctx ? ctx.label + ' · ' : ''}Stimmen · ${tuned()} von 6 gestimmt`);
    $('#h1', root).innerHTML = finished
      ? L('All six strings are in tune.', 'Alle sechs Saiten sind gestimmt.')
      : state === 'ok'
        ? L(`<em>${Name} string</em>: in tune.`, `<em>${De}</em>: gestimmt.`)
        : state === 'low'
          ? L(`<em>${Name} string</em>: tighten it.`, `<em>${De}</em>: spann sie fester.`)
          : state === 'high'
            ? L(`<em>${Name} string</em>: loosen it.`, `<em>${De}</em>: lockere sie.`)
            : L(`Pluck the <em>${name} string</em>.`, `Zupf die <em>${de}</em>.`);
    $('#strings', root).innerHTML = STRING_NAMES.map((n, i) => `<button data-s="${i}" class="${done[i] ? 'ok' : ''}${!finished && i === at ? ' hit' : ''}" aria-pressed="${!finished && i === at}" aria-label="${L(`${STRING_FULL[i]} string${done[i] ? ', in tune' : ''}`, `${stringName(i)}${done[i] ? ', gestimmt' : ''}`)}">${n}${done[i] ? icon('check') : ''}</button>`).join('');
    $$('#strings button', root).forEach((b) => (b.onclick = () => pick(Number(b.dataset.s))));
    const skipl = root.querySelector('#skipl');
    if (skipl) skipl.textContent = finished ? L('Next step', 'Nächster Schritt') : tuned() ? L('Go on with what is tuned', 'Mit dem Gestimmten weitermachen') : L('Skip tuning', 'Stimmen überspringen');
    setSimTarget(finished ? null : { kind: 'note', midi: OPEN_STRINGS[at], string: at, detune: -35 });
  }

  /** Puts a string on show. */
  function show(i: number, byHand: boolean): void {
    stopTimer(timer);
    at = i;
    locked = byHand;
    finished = false;
    recent = [];
    steady = 0;
    off = 0;
    cand = -1;
    candCount = 0;
    state = 'ask';
    $<SVGCircleElement>('#dot', root).setAttribute('opacity', '0');
    $('#msg', root).textContent = done[i] ? L(`Ticked off. Pluck it to check it again.`, `Abgehakt. Zupf sie, um sie noch einmal zu prüfen.`) : L(`It should sound like ${noteName(OPEN_STRINGS[i])}.`, `Sie sollte wie ${noteName(OPEN_STRINGS[i])} klingen.`);
    draw();
  }

  /** The player picks a string: it is tuned again from scratch. */
  function pick(i: number): void {
    done[i] = false;
    show(i, true);
  }

  function stringDone(): void {
    done[at] = true;
    locked = false;
    steady = 0;
    off = 0;
    state = 'ok';
    const next = [1, 2, 3, 4, 5].map((d) => (at + d) % 6).find((i) => !done[i]);
    if (next === undefined) {
      finished = true;
      $('#msg', root).textContent = ctx ? L(`Next: ${ctx.after}, in a moment. Pluck a string to check it once more.`, `Gleich als Nächstes: ${ctx.after}. Zupf eine Saite, um sie noch einmal zu prüfen.`) : L('Pluck any string to check it once more.', 'Zupf irgendeine Saite, um sie noch einmal zu prüfen.');
      draw();
      if (ctx) timer = later(3000, ctx.next, ctx.after);
      return;
    }
    $('#msg', root).textContent = L(`Next: the ${STRING_FULL[next]} string. Or pluck any other.`, `Als Nächstes: die ${stringName(next)}. Oder zupf eine andere.`);
    draw();
    timer = window.setTimeout(() => show(next, false), 1400);
  }

  const stopHear = hear(
    root,
    {
      onPitch: (e) => {
        lastHeard = performance.now();
        const centsTo = (i: number): number => 1200 * Math.log2(e.freq / target(i));
        // which string is this? The nearest one, unless the player has picked one by hand
        const heard = locked ? at : nearestString(e.freq, store.settings.a4);
        if (heard !== at) {
          // a ticked string that is still in tune has nothing new to say: it may simply be ringing on
          if (done[heard] && Math.abs(centsTo(heard)) <= 10) return;
          candCount = cand === heard ? candCount + 1 : 1;
          cand = heard;
          if (candCount < FOLLOW_AFTER) return;
          show(heard, false);
        }
        cand = -1;
        candCount = 0;
        recent.push(centsTo(at));
        if (recent.length > 7) recent.shift();
        if (recent.length < 4) return;
        const c = recent.slice().sort((a, b) => a - b)[recent.length >> 1];
        const ok = Math.abs(c) <= 6;
        if (done[at]) {
          // a ticked string, plucked again: it keeps its tick unless it stays clearly off
          off = Math.abs(c) > 10 ? off + 1 : 0;
          if (off < 12) {
            if (finished) return;
            moveDot(root, c, Math.abs(c) <= 10);
            if (state !== 'ok') {
              state = 'ok';
              draw();
            }
            return;
          }
          done[at] = false;
          finished = false;
          stopTimer(timer);
          off = 0;
        }
        moveDot(root, c, ok);
        // picked by hand, and what sounds is plainly another string in tune
        const other = locked && Math.abs(c) > 250 ? OPEN_STRINGS.findIndex((_, i) => i !== at && Math.abs(centsTo(i)) < 60) : -1;
        const semis = Math.round(Math.abs(c) / 50) / 2;
        const was = state;
        state = ok ? 'ok' : other >= 0 ? 'ask' : c < 0 ? 'low' : 'high';
        $('#msg', root).textContent = ok
          ? L('Hold it a moment.', 'Lass sie einen Moment klingen.')
          : other >= 0
            ? L(`That sounds like the ${STRING_FULL[other]} string. Pluck the ${STRING_FULL[at]} string, or click ${STRING_NAMES[other]} below to tune that one.`, `Das klingt nach der ${stringName(other, true)}. Zupf die ${stringName(at)} oder klick unten auf ${STRING_NAMES[other]}, um jene zu stimmen.`)
            : Math.abs(c) > 60
              ? L(`About ${semis} ${semis === 1 ? 'semitone' : 'semitones'} too ${c < 0 ? 'low' : 'high'}. Turn slowly and pluck again.`, `Etwa ${String(semis).replace('.', ',')} ${semis === 1 ? 'Halbton' : 'Halbtöne'} zu ${c < 0 ? 'tief' : 'hoch'}. Dreh langsam und zupf noch einmal.`)
              : L(`${Math.round(Math.abs(c))} cents too ${c < 0 ? 'low' : 'high'}: a small turn.`, `${Math.round(Math.abs(c))} Cent zu ${c < 0 ? 'tief' : 'hoch'}: eine kleine Drehung.`);
        if (state !== was) draw();
        steady = ok ? steady + 1 : 0;
        if (steady >= 14) stringDone();
      },
    },
    (l) => {
      l.pitchTracking = true;
      l.noteDetection = false;
    },
  );
  function restart(): void {
    done.fill(false);
    show(0, false);
  }
  const step = (d: number): void => pick((at + d + 6) % 6);
  const stopKeys = keys({ r: restart, ArrowLeft: () => step(-1), ArrowRight: () => step(1) });
  // The first screen of a session is where a microphone that hears nothing shows: say so instead of waiting for ever.
  const deaf = window.setInterval(() => {
    if (!engine.micOn || finished || tuned() || state !== 'ask' || performance.now() - lastHeard < 12000) return;
    $('#msg', root).textContent = L(
      'Nothing heard yet. Pluck the string firmly, close to the microphone. If the bars at the top right do not move at all, the microphone is the problem: End session, then Settings → Test the microphone.',
      'Noch nichts gehört. Zupf die Saite kräftig, nah am Mikrofon. Wenn sich die Balken oben rechts gar nicht bewegen, liegt es am Mikrofon: Session beenden, dann Einstellungen → Mikrofon testen.',
    );
  }, 2000);
  $('#again', root).onclick = restart;
  const skip = root.querySelector<HTMLElement>('#skip');
  if (skip && ctx) skip.onclick = ctx.next;
  show(0, false);
  return () => {
    stopTimer(timer);
    clearInterval(deaf);
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
}

/** Whatever is sounding, with the option to make it the reference pitch. */
function anyNote(root: HTMLElement, head: string): () => void {
  root.innerHTML = `${head}<div class="stage"><div class="tuner">
      <div class="big" id="note" aria-live="polite">–</div>
      ${NEEDLE()}
      <p class="sub" id="cents">${L('Play one note and let it ring.', 'Spiel einen Ton und lass ihn klingen.')}</p>
    </div></div>
    <footer class="bar"><div class="grp"><button class="btn" id="adopt" disabled>${L('Tune the app to this note', 'Die App auf diesen Ton stimmen')}</button><button class="btn quiet" id="std">${L('Back to A = 440', 'Zurück zu A = 440')}</button></div><p class="auto" id="ref"></p></footer>`;
  const recent: { midi: number; cents: number; freq: number }[] = [];
  let shown: { midi: number; freq: number } | null = null;
  const showRef = (): void => {
    $('#ref', root).textContent = L(
      `Reference for the guitar: A = ${store.settings.a4.toFixed(1)} Hz. To tune the guitar to another instrument, play that instrument's A and use the button.`,
      `Bezugston für die Gitarre: A = ${store.settings.a4.toFixed(1).replace('.', ',')} Hz. Um die Gitarre auf ein anderes Instrument zu stimmen, spiel das A dieses Instruments und nimm den Knopf.`,
    );
  };
  showRef();
  const stop = hear(
    root,
    {
      onPitch: (e) => {
        recent.push(e);
        if (recent.length > 5) recent.shift();
        const mid = recent.slice().sort((a, b) => a.cents - b.cents)[recent.length >> 1];
        if (recent.filter((r) => r.midi === mid.midi).length < 3) return;
        shown = mid;
        const off = Math.round(mid.cents);
        $('#note', root).innerHTML = `${NOTE_NAMES[mid.midi % 12]}<small>${Math.floor(mid.midi / 12) - 1}</small>`;
        $('#cents', root).textContent = Math.abs(off) <= 4 ? L('In tune.', 'Gestimmt.') : L(`${Math.abs(off)} cents too ${off < 0 ? 'low' : 'high'}.`, `${Math.abs(off)} Cent zu ${off < 0 ? 'tief' : 'hoch'}.`);
        moveDot(root, mid.cents, Math.abs(off) <= 4);
        $<HTMLButtonElement>('#adopt', root).disabled = false;
      },
    },
    (l) => {
      l.pitchTracking = true;
      l.noteDetection = false;
    },
  );
  const setA4 = (hz: number): void => {
    store.settings.a4 = Math.round(hz * 10) / 10;
    store.save();
    if (engine.listener) engine.listener.a4 = store.settings.a4;
    recent.length = 0;
    showRef();
  };
  $('#adopt', root).onclick = () => {
    // whatever note is sounding becomes exactly in tune: shift the reference by its deviation
    if (shown) setA4(store.settings.a4 * (shown.freq / midiToFreq(shown.midi, store.settings.a4)));
  };
  $('#std', root).onclick = () => setA4(440);
  return stop;
}
