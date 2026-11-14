/**
 * Reading rhythm: two bars in note values on one line, played with the click: on muted strings on the guitar,
 * on one key on the piano. The app hears when each stroke falls (as in the strumming trainer) and marks each
 * note on time, missed, or a stroke where a rest is. Six levels, from quarters to sixteenths; two clean takes
 * in a row bring the next rhythm, and the tempo rises when every rhythm of a level is clean.
 */
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { parseRhythm, RHYTHM_LEVELS, rhythmKey, type RhythmNote } from '../music/rhythms';
import { $, $$, esc, hear, icon, keys, later, pianoEars, stopTimer, type Screen } from '../ui/dom';
import { LEARN } from '../ui/draw';
import { setSimTarget } from '../ui/practice';
import { frame, levelNews } from './learn';

type State = 'wait' | 'hit' | 'miss';

/** The count spoken at a place in the bar, in sixteenths: 1 e + a 2 e + a … */
const countAt = (pos: number): string => {
  const p = pos % 16;
  return p % 4 === 0 ? String(p / 4 + 1) : p % 4 === 2 ? L('+', 'u') : p % 4 === 1 ? 'e' : 'a';
};

/**
 * Two bars of rhythm on one line, 1180 by 230 units: noteheads on the line, stems up, eighths and sixteenths
 * beamed within a beat (a lone one flagged), rests, dots, and the count under every note.
 */
export function rhythmLine(notes: RhythmNote[], bars: number, look: (i: number) => State | 'now' | 'up', P = LEARN): string {
  const y = 118;
  const left = 110;
  const right = 1160;
  const barW = (right - left) / bars;
  const x = (at: number): number => left + Math.floor(at / 16) * barW + 34 + ((at % 16) / 16) * (barW - 60);
  let h = `<line x1="40" x2="${right}" y1="${y}" y2="${y}" stroke="${P.line}" stroke-width="2"/>`;
  h += `<text x="64" y="${y - 6}" class="clef" style="font-size:34px" fill="${P.text}">4</text><text x="64" y="${y + 30}" class="clef" style="font-size:34px" fill="${P.text}">4</text>`;
  for (let b = 0; b <= bars; b++) h += `<line x1="${left + b * barW}" x2="${left + b * barW}" y1="${y - 26}" y2="${y + 26}" stroke="${P.faint}" stroke-width="${b === bars ? 4 : 2}"/>`;
  const ink = (i: number): string => {
    const l = look(i);
    return l === 'hit' ? P.good : l === 'miss' ? P.bad : l === 'now' ? P.now : P.text;
  };
  const stemTop = y - 62;
  // beams: notes of an eighth or shorter, side by side within one beat
  const beamed = new Set<number>();
  for (let beat = 0; beat < bars * 4; beat++) {
    const group = notes.map((n, i) => ({ n, i })).filter(({ n }) => !n.rest && n.value <= 2 && n.at >= beat * 4 && n.at + n.len <= beat * 4 + 4);
    if (group.length < 2) continue;
    group.forEach(({ i }) => beamed.add(i));
    const x1 = x(group[0].n.at) + 12;
    const x2 = x(group[group.length - 1].n.at) + 12;
    const col = ink(group[0].i);
    h += `<rect x="${x1 - 1.5}" y="${stemTop}" width="${x2 - x1 + 3}" height="8" fill="${col}"/>`;
    // the second beam over sixteenths: across a run of them, or a stub for one alone
    group.forEach(({ n }, k) => {
      if (n.value !== 1) return;
      const nx = x(n.at) + 12;
      const next = group[k + 1];
      const prev = group[k - 1];
      if (next && next.n.value === 1) h += `<rect x="${nx - 1.5}" y="${stemTop + 13}" width="${x(next.n.at) + 12 - nx + 3}" height="7" fill="${col}"/>`;
      else if (!(prev && prev.n.value === 1)) h += `<rect x="${next ? nx - 1.5 : nx - 16}" y="${stemTop + 13}" width="17.5" height="7" fill="${col}"/>`;
    });
  }
  notes.forEach((n, i) => {
    const nx = x(n.at);
    const col = ink(i);
    if (n.rest) {
      if (n.value === 4) h += `<path d="M${nx - 5} ${y - 30}l11 13-8 9 10 13c-9-4-16 0-9 9-13-5-12-17 1-13l-11-12 9-10z" fill="${col}"/>`;
      else if (n.value === 2) h += `<circle cx="${nx - 4}" cy="${y - 14}" r="5" fill="${col}"/><path d="M${nx - 4} ${y - 9}q8 2 12-6L${nx + 1} ${y + 18}" fill="none" stroke="${col}" stroke-width="3"/>`;
      else if (n.value === 8) h += `<rect x="${nx - 12}" y="${y - 11}" width="26" height="11" fill="${col}"/>`;
      else if (n.value === 16) h += `<rect x="${nx - 12}" y="${y}" width="26" height="11" fill="${col}"/>`;
      else h += `<circle cx="${nx - 4}" cy="${y - 18}" r="4.5" fill="${col}"/><circle cx="${nx - 8}" cy="${y - 4}" r="4.5" fill="${col}"/><path d="M${nx - 4} ${y - 14}q8 2 11-5L${nx - 2} ${y + 20}" fill="none" stroke="${col}" stroke-width="3"/>`;
    } else {
      const open = n.value >= 8;
      h += `<ellipse cx="${nx}" cy="${y}" rx="13" ry="9.5" transform="rotate(-20 ${nx} ${y})" fill="${open ? P.bg : col}" stroke="${col}" stroke-width="${open ? 3.4 : 1}"/>`;
      if (n.value < 16) h += `<line x1="${nx + 12}" x2="${nx + 12}" y1="${y - 3}" y2="${stemTop}" stroke="${col}" stroke-width="3"/>`;
      // a lone eighth or sixteenth: its flags
      if (n.value <= 2 && !beamed.has(i)) for (let f = 0; f < (n.value === 1 ? 2 : 1); f++) h += `<path d="M${nx + 12} ${stemTop + f * 13}c4 12 20 16 14 38c-1-14-8-20-14-22" fill="${col}"/>`;
    }
    if (n.dotted) h += `<circle cx="${nx + 26}" cy="${y - 4}" r="4.5" fill="${col}"/>`;
    h += `<text x="${nx}" y="${y + 66}" class="tn" style="font-size:${n.at % 4 === 0 ? 30 : 22}px" fill="${n.rest ? P.faint : n.at % 4 === 0 ? P.text : P.muted}">${n.rest ? '(' + countAt(n.at) + ')' : countAt(n.at)}</text>`;
  });
  return h;
}

export const rhythmReading: Screen = (root, [lv], ctx) => {
  const piano = store.settings.instrument === 'piano';
  const levels = RHYTHM_LEVELS();
  let level = Math.max(1, Math.min(levels.length, Number(lv) || 1));
  let pick = 0;
  let bpm = store.speeds[rhythmKey(level, piano)] ?? 60;
  let running = false;
  let raf = 0;
  let timer = 0;
  let t0 = 0;
  let sixteenth = 0.25;
  let latency = 0;
  let cleanRuns = 0;
  let strays = 0;
  let notes: RhythmNote[] = [];
  let bars = 2;
  let state: State[] = [];

  root.innerHTML = frame(
    `<b>${L('Reading rhythm', 'Rhythmus lesen')}</b>`,
    `<div class="head"><div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div></div>
     <div class="pats seg" role="group" aria-label="${L('Level', 'Stufe')}">${levels.map((l) => `<button data-lv="${l.n}" aria-pressed="${l.n === level}">${l.n} · ${esc(l.name)}</button>`).join('')}</div>
     <svg class="fit" id="rhy" viewBox="0 0 1180 230" role="img" aria-label="${L('Two bars of rhythm in note values, read left to right, the count under each note', 'Zwei Takte Rhythmus in Notenwerten, von links nach rechts gelesen, die Zählzeit unter jeder Note')}"></svg>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L(`One stroke on each note, ${piano ? 'on one key' : 'on muted strings'}; nothing on a rest. Count out loud.`, `Ein Anschlag auf jede Note, ${piano ? 'auf einer Taste' : 'auf abgedämpften Saiten'}; nichts auf einer Pause. Zähl laut mit.`)}</p></div>`,
    `<div class="grp"><button class="btn primary" id="go"><span>${L('Start', 'Starten')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn quiet" id="slower" aria-label="${L('Slower', 'Langsamer')}">−5 <kbd>−</kbd></button><b id="bpm"></b><button class="btn quiet" id="faster" aria-label="${L('Faster', 'Schneller')}">+5 <kbd>+</kbd></button><button class="btn quiet" id="other">${L('Another rhythm', 'Ein anderer Rhythmus')} <kbd>N</kbd></button></div>
     <p class="auto">${L('The app hears when each stroke falls, not which note it is.', 'Die App hört, wann jeder Anschlag fällt, nicht welcher Ton es ist.')}</p>`,
    ctx,
    ['#/tools', L('Tools', 'Werkzeuge')],
  );

  const say = (cls: string, html: string): void => {
    const el = $('#fbk', root);
    el.className = `fbk ${cls}`;
    el.innerHTML = html;
  };
  const load = (): void => {
    const r = parseRhythm(levels[level - 1].rhythms[pick % levels[level - 1].rhythms.length]);
    notes = r.notes;
    bars = r.bars;
    state = notes.map(() => 'wait');
  };
  function draw(now = 0): void {
    const due = running ? notes.findIndex((n, i) => !n.rest && state[i] === 'wait') : -1;
    $('#rhy', root).innerHTML = rhythmLine(notes, bars, (i) => (notes[i].rest ? 'up' : state[i] === 'wait' ? (i === due && now >= t0 - 0.4 ? 'now' : 'up') : state[i]));
    const l = levels[level - 1];
    $('#eb', root).textContent = L(`Level ${level} of ${levels.length} · rhythm ${(pick % l.rhythms.length) + 1} of ${l.rhythms.length} · ${bpm} bpm`, `Stufe ${level} von ${levels.length} · Rhythmus ${(pick % l.rhythms.length) + 1} von ${l.rhythms.length} · ${bpm} bpm`);
    $('#bpm', root).textContent = `${bpm} bpm`;
    $$('[data-lv]', root).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.lv) === level)));
  }
  const intro = (): void => {
    const l = levels[level - 1];
    $('#h1', root).innerHTML = `<em>${esc(l.name)}</em>`;
    $('#sub', root).textContent = l.about;
  };

  /** How far from its moment a stroke still counts: a third of the way to the next sixteenth or more, 70 to 150 ms. */
  const window = (): number => Math.max(0.07, Math.min(0.15, sixteenth * 1.2));

  function begin(): void {
    stop();
    load();
    sixteenth = 60 / bpm / 4;
    const beat = sixteenth * 4;
    const start = engine.now() + 0.5;
    t0 = start + 4 * beat;
    const vol = store.settings.click;
    const low = store.settings.clickSound === 'click';
    for (let k = 0; k < 4 + bars * 4; k++) engine.tick(start + k * beat, k % 4 === 0, vol, low);
    latency = engine.micOn ? (store.settings.latency >= 0 ? store.settings.latency : engine.latencyEstimate()) : 0;
    strays = 0;
    running = true;
    $('#go span', root).textContent = L('Stop', 'Stopp');
    $('#h1', root).innerHTML = L('Get ready…', 'Mach dich bereit…');
    $('#sub', root).textContent = L('Four clicks counted in, then the two bars.', 'Vier Klicks zum Einzählen, dann die zwei Takte.');
    say('info', L('Count out loud with the click.', 'Zähl laut mit dem Klick.'));
    setSimTarget(piano ? { kind: 'note', midi: 60, piano: true } : { kind: 'mute' });
    raf = requestAnimationFrame(tick);
  }
  function stop(): void {
    cancelAnimationFrame(raf);
    stopTimer(timer);
    engine.clearTicks();
    running = false;
    $('#go span', root).textContent = L('Start', 'Starten');
  }
  function tick(): void {
    raf = requestAnimationFrame(tick);
    const now = engine.now();
    // a note is missed once the report of a stroke on it could no longer come (it arrives some 0.2 s late)
    notes.forEach((n, i) => {
      if (!n.rest && state[i] === 'wait' && now - latency > t0 + n.at * sixteenth + window() + 0.25) state[i] = 'miss';
    });
    if (now >= t0) {
      const due = notes.findIndex((n, i) => !n.rest && state[i] === 'wait');
      $('#h1', root).innerHTML = due >= 0 ? `<em>${countAt(notes[due].at)}</em>` : '…';
      $('#sub', root).textContent = '';
    }
    draw(now);
    if (now > t0 + bars * 16 * sixteenth + 0.45) done();
  }
  function onStroke(time: number): void {
    if (!running) return;
    const t = time - latency;
    const near = notes
      .map((n, i) => ({ n, i }))
      .filter(({ n, i }) => !n.rest && state[i] === 'wait' && Math.abs(t - (t0 + n.at * sixteenth)) <= window())
      .sort((a, b) => Math.abs(t - (t0 + a.n.at * sixteenth)) - Math.abs(t - (t0 + b.n.at * sixteenth)))[0];
    if (near) state[near.i] = 'hit';
    else if (t > t0 - sixteenth * 2 && t < t0 + bars * 16 * sixteenth) strays++;
  }
  function done(): void {
    stop();
    const played = notes.filter((n) => !n.rest).length;
    const hits = state.filter((s) => s === 'hit').length;
    const clean = hits === played && strays === 0;
    let news = '';
    if (clean) news = levelNews([store.skills.record(rhythmKey(level, piano), bpm, Date.now())]);
    cleanRuns = clean ? cleanRuns + 1 : 0;
    const l = levels[level - 1];
    let then: string;
    if (clean && cleanRuns >= 2) {
      cleanRuns = 0;
      pick++;
      if (pick % l.rhythms.length === 0) {
        // every rhythm of the level clean twice: the next level, or the tempo up at the last
        if (level < levels.length) {
          level++;
          pick = 0;
          then = L(`Every rhythm clean: on to level ${level}.`, `Jeder Rhythmus sauber: weiter mit Stufe ${level}.`);
        } else {
          bpm = Math.min(140, bpm + 5);
          then = L(`Every rhythm clean: now ${bpm} bpm.`, `Jeder Rhythmus sauber: jetzt ${bpm} bpm.`);
        }
      } else then = L('Twice clean: the next rhythm.', 'Zweimal sauber: der nächste Rhythmus.');
    } else if (hits < 0.6 * played && bpm > 45) {
      bpm = Math.max(45, bpm - 5);
      then = L(`A little slower: ${bpm} bpm.`, `Etwas langsamer: ${bpm} bpm.`);
    } else then = L('Once more.', 'Noch einmal.');
    store.speeds[rhythmKey(level, piano)] = bpm;
    store.save();
    $('#h1', root).innerHTML = clean ? L('In time.', 'Im Takt.') : L(`${hits} of ${played}.`, `${hits} von ${played}.`);
    say(clean ? 'good' : 'info', `${clean ? icon('check') : ''}${L(`${hits} of ${played} notes on time${strays ? `, ${strays} ${strays === 1 ? 'stroke' : 'strokes'} where nothing was written` : ''}.`, `${hits} von ${played} Noten im Takt${strays ? `, ${strays} ${strays === 1 ? 'Anschlag' : 'Anschläge'}, wo nichts stand` : ''}.`)}${news} ${then}`);
    draw();
    load();
    timer = later(2800, begin, L('the next take', 'der nächste Durchgang'));
  }

  const stopHear = hear(root, { onOnset: (e) => onStroke(e.time) }, piano ? pianoEars : undefined);
  const setLevel = (n: number): void => {
    stop();
    level = n;
    pick = 0;
    cleanRuns = 0;
    bpm = store.speeds[rhythmKey(level, piano)] ?? 60;
    load();
    intro();
    say('info', L('Space to start: one bar is counted in.', 'Leertaste zum Starten: Ein Takt wird eingezählt.'));
    draw();
  };
  const tempo = (d: number): void => {
    bpm = Math.max(40, Math.min(160, bpm + d));
    store.speeds[rhythmKey(level, piano)] = bpm;
    store.save();
    if (running) begin();
    else draw();
  };
  const other = (): void => {
    stop();
    pick++;
    cleanRuns = 0;
    load();
    draw();
  };
  const stopKeys = keys({ ' ': () => (running ? stop() : begin()), '-': () => tempo(-5), '+': () => tempo(5), '=': () => tempo(5), n: other });
  $$('[data-lv]', root).forEach((b) => (b.onclick = () => setLevel(Number(b.dataset.lv))));
  $('#go', root).onclick = () => (running ? stop() : begin());
  $('#slower', root).onclick = () => tempo(-5);
  $('#faster', root).onclick = () => tempo(5);
  $('#other', root).onclick = other;
  setLevel(level);
  return () => {
    stop();
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
};
