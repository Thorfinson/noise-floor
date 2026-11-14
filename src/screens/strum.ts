/**
 * The strumming hand on its own: a pattern of strokes down and up, read left to right, played to the click.
 * Three steps, as guitar teachers take it: first on muted strings, counting out loud, so that only the hand
 * and the count matter; then on one chord the left hand already knows; then with a change of chord at the
 * bar line. A new chord never comes together with a new pattern. The app hears when each stroke falls, not
 * which way the hand moved: the arrows are there to be followed, the timing is what is judged.
 */
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { shapeOf } from '../music/content';
import { chordKey } from '../music/difficulty';
import { OPEN_CHORDS } from '../music/path';
import { STRUM_PATTERNS, strumKey, type StrumPattern } from '../music/strums';
import { changeTip, CHORDS } from '../music/theory';
import { $, esc, hear, icon, keys, later, stopTimer, type Screen, type SessionCtx } from '../ui/dom';
import { chordBox, FAR, LEARN, typeScale } from '../ui/draw';
import { setSimTarget } from '../ui/practice';
import { frame, levelNews, nextStep } from './learn';

/** The three steps: muted strings, one chord, a change. */
export type StrumStage = 0 | 1 | 2;

/** The pattern to work on: the given one, or of those not yet steady at 72 the first. */
const suggested = (id?: string): StrumPattern => {
  const all = STRUM_PATTERNS();
  return all.find((p) => p.id === id) ?? all.find((p) => store.skills.level(strumKey(p.id)) < 3) ?? all[0];
};

/** The chords for the steps with chords: ones that already ring, the pair whose change is best known. */
function chordsFor(): [string, string] {
  const known = OPEN_CHORDS.filter((c) => store.skills.level(chordKey(c, false)) >= 1);
  if (known.length >= 2) return [known[0], known[1]];
  return known.length === 1 ? [known[0], known[0] === 'Em' ? 'Am' : 'Em'] : ['Em', 'Am'];
}

const BARS = 2;

export const strumTrainer: Screen = (root, [pid, stageParam, a, b], ctx?: SessionCtx) => {
  const pattern = suggested(pid);
  const [c1, c2] = a && CHORDS[a] ? [a, CHORDS[b] ? b : a] : chordsFor();
  let stage: StrumStage = stageParam === '1' ? 1 : stageParam === '2' ? 2 : stageParam === '0' ? 0 : store.skills.level(strumKey(pattern.id)) >= 1 ? 2 : 0;
  const level = store.skills.level(strumKey(pattern.id));
  let bpm = Math.max(50, Math.min(120, store.speeds[strumKey(pattern.id)] ?? (pattern.beat === 4 ? 50 : 60)));
  const slotsPerBar = pattern.slots.length;
  const strokes = [...pattern.slots].map((c, i) => ({ c, i })).filter((x) => x.c !== '.');
  /** the slots of a take: two bars, the chord of each */
  type Slot = { t: number; c: string; bar: number; state: 'wait' | 'hit' | 'miss' };
  let slots: Slot[] = [];
  let t0 = 0;
  let slotSec = 0.25;
  let raf = 0;
  let timer = 0;
  let running = false;
  let strays = 0;
  let cleanRuns = 0;
  let latency = 0;

  root.innerHTML = frame(
    `<b>${L('Strumming', 'Anschlagen')}</b> · ${esc(pattern.name)}`,
    `<div class="head">
       <svg id="cbox" class="chordfig" viewBox="0 0 230 210" role="img" aria-label="${L('The chord to hold', 'Der Akkord zum Halten')}"></svg>
       <div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div>
       <div class="ladder" role="group" aria-label="${L('Steps', 'Schritte')}">${[L('Muted strings', 'Abgedämpft'), L('One chord', 'Ein Akkord'), L('With a change', 'Mit Wechsel')].map((r, i) => `<button class="rung" id="st${i}" aria-pressed="false"><b>${i + 1}</b><span>${r}</span></button>`).join('')}<p class="rungnote" id="rungnote"></p></div>
     </div>
     <svg class="fit" id="pat" viewBox="0 0 1180 230" role="img" aria-label="${L('The pattern, two bars, read left to right: arrows down and up, the count under them', 'Das Muster, zwei Takte, von links nach rechts: Pfeile ab und auf, darunter die Zählzeiten')}"></svg>
     <div class="pats seg" role="group" aria-label="${L('Pattern', 'Muster')}">${STRUM_PATTERNS().map((p) => `<a href="#/strum/${p.id}" aria-current="${p.id === pattern.id}">${esc(p.name)}</a>`).join('')}</div>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('↓ down across all strings · ↑ up across the thin ones · • the hand passes in the air', '↓ ab über alle Saiten · ↑ auf über die dünnen · • die Hand geht in der Luft vorbei')}</p></div>`,
    `<div class="grp"><button class="btn primary" id="go"><span>${L('Start', 'Starten')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn quiet" id="slower" aria-label="${L('Slower', 'Langsamer')}">−5 <kbd>−</kbd></button><b id="bpm"></b><button class="btn quiet" id="faster" aria-label="${L('Faster', 'Schneller')}">+5 <kbd>+</kbd></button>${nextStep(ctx)}</div>
     <p class="auto">${L('The app hears when each stroke falls. Count out loud: it is what keeps the hand in time.', 'Die App hört, wann jeder Anschlag fällt. Zähl laut mit: Das hält die Hand im Takt.')}</p>`,
    ctx,
  );

  const say = (cls: string, html: string): void => {
    const el = $('#fbk', root);
    el.className = 'fbk ' + cls;
    el.innerHTML = html;
  };
  const chordOf = (bar: number): string => (stage === 2 && bar % 2 === 1 ? c2 : c1);

  function draw(now = -1): void {
    $('#eb', root).textContent = `${ctx ? ctx.label + ' · ' : ''}${esc(pattern.name)} · ${[L('muted strings', 'abgedämpft'), L(`on ${shapeOf(c1).name}`, `auf ${shapeOf(c1).name}`), L(`${shapeOf(c1).name} and ${shapeOf(c2).name}, a change at each bar line`, `${shapeOf(c1).name} und ${shapeOf(c2).name}, Wechsel an jedem Taktstrich`)][stage]} · ${bpm} bpm`;
    $('#bpm', root).textContent = `${bpm} bpm`;
    ['0', '1', '2'].forEach((k, i) => $('#st' + k, root).setAttribute('aria-pressed', String(i === stage)));
    $('#rungnote', root).textContent = [
      L('The left hand lies across the strings and stops them: only the rhythm sounds. Count out loud.', 'Die linke Hand liegt quer über den Saiten und dämpft sie: Nur der Rhythmus klingt. Zähl laut mit.'),
      L('The same pattern with a chord you know: the hand keeps the motion, the chord rings.', 'Dasselbe Muster mit einem Akkord, den du kennst: Die Hand behält die Bewegung, der Akkord klingt.'),
      L('A change at each bar line. The last up-stroke before it may be played on open strings: that buys the time.', 'Ein Wechsel an jedem Taktstrich. Der letzte Aufschlag davor darf auf leeren Saiten fallen: Das verschafft die Zeit.'),
    ][stage];
    // the chord picture: what the left hand holds now
    const k = now < 0 ? 0 : Math.max(0, Math.min(BARS - 1, Math.floor((now - t0) / (slotSec * slotsPerBar))));
    const cid = chordOf(k);
    const box = $('#cbox', root);
    box.toggleAttribute('hidden', stage === 0);
    if (stage > 0) {
      const c = shapeOf(cid);
      box.innerHTML = `<text x="4" y="24" class="lbl" fill="${LEARN.muted}">${L('hold', 'halten')}</text><text x="4" y="64" class="cn" style="font-size:${c.name.length > 4 ? 22 : 36}px" fill="${LEARN.text}">${c.name}</text>` + chordBox(c, 96, 44, 120, LEARN, false, undefined, 32);
    }
    // the pattern: two bars of slots, an arrow where the hand strikes
    const left = 60;
    const w = (1160 - left) / (BARS * slotsPerBar);
    let h = '';
    for (let bar = 0; bar < BARS; bar++) {
      const x0 = left + bar * slotsPerBar * w;
      h += `<line x1="${x0}" x2="${x0}" y1="40" y2="190" stroke="${LEARN.faint}" stroke-width="2"/>`;
      // the chord and the count are read from the instrument: their size follows FAR and the type size
      if (stage > 0) h += `<text x="${x0 + 10}" y="36" class="chn" style="font-size:${FAR.chord * typeScale()}px" fill="${LEARN.text}">${shapeOf(chordOf(bar)).name}</text>`;
      for (let s = 0; s < slotsPerBar; s++) {
        const x = x0 + (s + 0.5) * w;
        const c = pattern.slots[s];
        const slot = slots.find((q) => q.bar === bar && Math.round((q.t - t0) / slotSec) - bar * slotsPerBar === s);
        const ink = slot?.state === 'hit' ? LEARN.good : slot?.state === 'miss' ? LEARN.bad : LEARN.text;
        const due = running && slot && slot.state === 'wait' && Math.abs(now - slot.t) < slotSec / 2;
        if (due) h += `<rect x="${x - w / 2 + 4}" y="46" width="${w - 8}" height="110" rx="10" fill="${LEARN.now}" opacity="0.14"/>`;
        if (c === 'D') h += `<path d="M${x} 62L${x} 136M${x - 14} 120L${x} 138L${x + 14} 120" fill="none" stroke="${due ? LEARN.now : ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
        else if (c === 'U') h += `<path d="M${x} 136L${x} 82M${x - 11} 96L${x} 80L${x + 11} 96" fill="none" stroke="${due ? LEARN.now : ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
        else h += `<circle cx="${x}" cy="100" r="5" fill="${LEARN.faint}"/>`;
        const word = pattern.count[s % pattern.count.length];
        h += `<text x="${x}" y="186" class="tn" style="font-size:${(/^\d$/.test(word) ? 32 : 22) * typeScale()}px" fill="${/^\d$/.test(word) ? LEARN.text : LEARN.muted}">${word === '+' ? L('+', 'u') : word}</text>`;
      }
    }
    h += `<line x1="1160" x2="1160" y1="40" y2="190" stroke="${LEARN.faint}" stroke-width="2"/>`;
    if (running && now >= t0 - 1e-3) {
      const x = left + ((now - t0) / slotSec) * w;
      if (x <= 1160) h += `<line x1="${x}" x2="${x}" y1="40" y2="160" stroke="${LEARN.now}" stroke-width="3"/>`;
    }
    $('#pat', root).innerHTML = h;
  }

  function begin(): void {
    stop();
    slotSec = 60 / bpm / pattern.beat;
    const beat = slotSec * pattern.beat;
    const start = engine.now() + 0.5;
    const countIn = Math.round(slotsPerBar / pattern.beat);
    t0 = start + countIn * beat;
    const vol = store.settings.click;
    const low = store.settings.clickSound === 'click';
    for (let k = 0; k < countIn; k++) engine.tick(start + k * beat, k === 0, vol, low);
    for (let bar = 0; bar < BARS; bar++) for (let k = 0; k < countIn; k++) engine.tick(t0 + (bar * countIn + k) * beat, k === 0, vol, low);
    latency = engine.micOn ? (store.settings.latency >= 0 ? store.settings.latency : engine.latencyEstimate()) : 0;
    slots = [];
    for (let bar = 0; bar < BARS; bar++) for (const s of strokes) slots.push({ t: t0 + (bar * slotsPerBar + s.i) * slotSec, c: s.c, bar, state: 'wait' });
    strays = 0;
    running = true;
    $('#go span', root).textContent = L('Stop', 'Stopp');
    $('#h1', root).innerHTML = L('Get ready…', 'Mach dich bereit…');
    $('#sub', root).textContent = L(`${countIn} clicks counted in, then two bars.`, `${countIn} Klicks zum Einzählen, dann zwei Takte.`);
    say('info', stage === 0 ? L('Hand flat on the strings, and count out loud with the click.', 'Hand flach auf die Saiten, und zähl laut mit dem Klick.') : L('Hold the chord, and count out loud with the click.', 'Halt den Akkord, und zähl laut mit dem Klick.'));
    setSimTarget(stage === 0 ? { kind: 'mute' } : { kind: 'chord', id: c1 });
    raf = requestAnimationFrame(tick);
  }

  function stop(): void {
    cancelAnimationFrame(raf);
    stopTimer(timer);
    engine.clearTicks();
    running = false;
    $('#go span', root).textContent = L('Start', 'Starten');
  }

  /** How far from its moment a stroke still counts: a third of the way to the next slot, at least 70 ms. */
  const window = (): number => Math.max(0.07, Math.min(0.15, slotSec * 0.42));

  function tick(): void {
    raf = requestAnimationFrame(tick);
    const now = engine.now();
    for (const s of slots) if (s.state === 'wait' && now - latency > s.t + window() + 0.08) s.state = 'miss';
    if (now >= t0) {
      $('#h1', root).innerHTML = (() => {
        const due = slots.find((s) => s.state === 'wait');
        return due ? `<em>${pattern.count[Math.round((due.t - t0) / slotSec) % slotsPerBar % pattern.count.length]}</em> ${due.c === 'U' ? L('up', 'auf') : L('down', 'ab')}` : L('…', '…');
      })();
      $('#sub', root).textContent = '';
    }
    setSimTarget(stage === 0 ? { kind: 'mute' } : { kind: 'chord', id: chordOf(Math.max(0, Math.floor((now - t0) / (slotSec * slotsPerBar)))) });
    draw(now);
    if (slots.every((s) => s.state !== 'wait') && now > t0 + BARS * slotsPerBar * slotSec + 0.2) done();
  }

  function onStroke(time: number): void {
    if (!running) return;
    const t = time - latency;
    const near = slots.filter((s) => s.state === 'wait' && Math.abs(t - s.t) <= window()).sort((x, y) => Math.abs(t - x.t) - Math.abs(t - y.t))[0];
    if (near) near.state = 'hit';
    // a stroke between the slots of the pattern, where the hand should pass in the air
    else if (t > t0 - slotSec / 2 && t < t0 + BARS * slotsPerBar * slotSec) strays++;
  }

  function done(): void {
    stop();
    const hits = slots.filter((s) => s.state === 'hit').length;
    const clean = hits >= Math.ceil(0.9 * slots.length) && strays <= 1;
    let news = '';
    if (clean && stage > 0) news = levelNews([store.skills.record(strumKey(pattern.id), bpm, Date.now())]);
    cleanRuns = clean ? cleanRuns + 1 : 0;
    let then: string;
    if (clean && cleanRuns >= 2 && stage < 2) {
      stage = (stage + 1) as StrumStage;
      cleanRuns = 0;
      then = L(`Twice clean: on to step ${stage + 1}.`, `Zweimal sauber: weiter mit Schritt ${stage + 1}.`);
    } else if (clean && cleanRuns >= 2) {
      bpm = Math.min(120, bpm + 5);
      cleanRuns = 0;
      then = L(`Twice clean: now ${bpm} bpm.`, `Zweimal sauber: jetzt ${bpm} bpm.`);
    } else if (hits < 0.6 * slots.length && bpm > 50) {
      bpm = Math.max(50, bpm - 5);
      then = L(`A little slower: ${bpm} bpm.`, `Etwas langsamer: ${bpm} bpm.`);
    } else then = L('Once more.', 'Noch einmal.');
    store.speeds[strumKey(pattern.id)] = bpm;
    store.save();
    $('#h1', root).innerHTML = clean ? L('In time.', 'Im Takt.') : L(`${hits} of ${slots.length}.`, `${hits} von ${slots.length}.`);
    say(clean ? 'good' : 'info', `${clean ? icon('check') : ''}${L(`${hits} of ${slots.length} strokes on time${strays ? `, ${strays} between them` : ''}.`, `${hits} von ${slots.length} Anschlägen im Takt${strays ? `, ${strays} dazwischen` : ''}.`)}${news} ${then}`);
    draw();
    if (ctx && store.skills.level(strumKey(pattern.id)) > level) timer = later(3500, ctx.next, ctx.after);
    else timer = later(2600, begin, L('the next take', 'der nächste Durchgang'));
  }

  const stopHear = hear(root, {
    onOnset: (e) => onStroke(e.time),
  });
  const setStage = (s: StrumStage): void => {
    stage = s;
    cleanRuns = 0;
    stop();
    draw();
  };
  const tempo = (d: number): void => {
    bpm = Math.max(40, Math.min(160, bpm + d));
    store.speeds[strumKey(pattern.id)] = bpm;
    store.save();
    if (running) begin();
    else draw();
  };
  const stopKeys = keys({
    ' ': () => (running ? stop() : begin()),
    '1': () => setStage(0),
    '2': () => setStage(1),
    '3': () => setStage(2),
    '-': () => tempo(-5),
    '+': () => tempo(5),
    '=': () => tempo(5),
  });
  [0, 1, 2].forEach((i) => ($('#st' + i, root).onclick = () => setStage(i as StrumStage)));
  $('#go', root).onclick = () => (running ? stop() : begin());
  $('#slower', root).onclick = () => tempo(-5);
  $('#faster', root).onclick = () => tempo(5);
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  $('#h1', root).innerHTML = L(`<em>${esc(pattern.name)}</em>`, `<em>${esc(pattern.name)}</em>`);
  $('#sub', root).textContent = pattern.about;
  say('info', stage === 2 ? changeTip(shapeOf(c1), shapeOf(c2)) || L('Space to start.', 'Leertaste zum Starten.') : L('Space to start: one bar is counted in.', 'Leertaste zum Starten: Ein Takt wird eingezählt.'));
  draw();
  return () => {
    stop();
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
};
