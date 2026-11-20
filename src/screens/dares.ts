/**
 * Dares (the rules are in src/game/dares.ts): the song of the week, played round after round with the band,
 * under the pressure the player chose. Lights out takes a layer of the chart after every round that holds,
 * climb makes it faster, called deals the chords anew and shows each a beat ahead, clean lets nothing slip,
 * one take allows no second chance and keeps the recording. The best run on a song is its record.
 *
 * #/dares/<song id>, the song of the week when none is given. On the guitar.
 */
import type { ChordEvent, NoteEvent, ThudEvent } from '../audio/listener';
import { engine } from '../audio/engine';
import { renderBand, type BandHandle, type BandMode } from '../audio/band';
import { L } from '../core/i18n';
import { Take, type TakeStep } from '../core/playalong';
import { store } from '../core/store';
import { saveTake, TAKE_MAX } from '../core/takes';
import { afterRound, beats, DARES, DARK_STAGES, deal, describe, has, recordOf, roundHolds, seeded, startRun, type DareId, type DaresRun } from '../game/dares';
import { findSong, shapeOf, SONGS, type Song } from '../music/content';
import { songMaterial, type Line } from '../music/material';
import { strumPatternOf } from '../music/strums';
import { CHORDS, strumIs } from '../music/theory';
import { guitarA4 } from '../music/tuning';
import { partLabel, partsOfMaterial, weekOf } from '../music/week';
import { $, cap, esc, hear, icon, keys, stopTimer, type Screen } from '../ui/dom';
import { chordBox, LEARN, playhead, tabLine, type Drawn, type StepLook } from '../ui/draw';
import { setSimTarget } from '../ui/practice';
import { frame } from './frame';

/** The dares chosen last time, so that the next run starts from them. */
let lastDares: DareId[] = ['dark'];

/** The key a song's record is kept under. */
export const daresKey = (id: string): string => `guitar:${id}`;
/** The id the recording of a run is kept under, beside the song's own takes. */
export const daresTakeId = (id: string): string => `${id}~dares`;

/** A chord picture for the cue. */
const bigChord = (id: string | undefined, w: number): string => {
  const c = id ? CHORDS[shapeOf(id).id] : undefined;
  return c ? `<svg viewBox="0 0 240 210" width="${w}" role="img" aria-label="${esc(c.name)}">${chordBox(c, 40, 30, 150, LEARN, true, undefined, 34)}</svg>` : '';
};

export const dares: Screen = (root, [idParam]) => {
  if (store.settings.instrument !== 'guitar') {
    root.innerHTML = frame(L('Dares', 'Mutproben'), `<div class="head"><div class="say"><h1>${L('Dares is played on the guitar for now.', 'Mutproben werden vorerst auf der Gitarre gespielt.')}</h1><p class="sub">${L('Switch to the guitar at the top of the page.', 'Wechsle oben auf der Seite zur Gitarre.')}</p></div></div>`, '', undefined, ['#/nf', L('Games', 'Spiele')]);
    return () => undefined;
  }
  const id = idParam || weekOf('guitar')?.id || store.current.guitar || SONGS[0].id;
  const song: Song = findSong(id);
  const m = songMaterial(song);
  const parts = partsOfMaterial(m);
  const strummedOnly = m.lines.every((l) => l.steps.every((s) => !!s.chord));
  /** what a round can be: the whole song, or one of its parts */
  const choices = [{ label: L('The whole song', 'Der ganze Song'), lines: m.lines.map((_, k) => k) }, ...(parts.length > 1 ? parts.map((p) => ({ label: p.name === '1' ? L('First half', 'Erste Hälfte') : p.name === '2' ? L('Second half', 'Zweite Hälfte') : partLabel(p.name), lines: p.lines })) : [])];
  const secondsOf = (lines: number[], tempo: number): number => lines.reduce((s, k) => s + m.lines[k].units, 0) * ((m.noteDur * 100) / tempo);
  // the whole song when a round of it is not too long to play many times, otherwise its first part
  let choice = choices.length > 1 && secondsOf(choices[0].lines, 100) > 80 ? 1 : 0;
  let tempo = Math.max(50, Math.min(120, Math.round(Number(store.speeds['dares:' + id]) || 90)));
  const chosen = new Set<DareId>(lastDares.filter((d) => d !== 'called' || strummedOnly));

  let phase: 'pick' | 'count' | 'play' | 'between' | 'done' = 'pick';
  let run: DaresRun = startRun([...chosen], tempo);
  let band: BandHandle | null = null;
  let take: Take | null = null;
  let raf = 0;
  let timer = 0;
  let t0 = 0;
  let endT = 0;
  let dead = 0;
  let recording = false;
  let kept: { samples: Float32Array; sampleRate: number } | null = null;
  let lines: Line[] = [];
  let unitSec = 0;
  /** called: the chord of each bar this round, by bar number */
  let dealt = new Map<number, string>();
  /** the bars of the round in order, with when each begins (note units into the round) */
  let barStarts: { bar: number; u: number }[] = [];

  root.innerHTML = frame(
    `<b>${esc(song.title)}</b> · ${L('Dares', 'Mutproben')}`,
    `<div class="dares" id="dares">
       <div class="head"><div class="dares-big" id="drbig"></div><div class="say"><p class="eyebrow" id="drkick"></p><h1 id="drh1"></h1><p class="sub" id="drsub"></p></div></div>
       <div class="dares-pick" id="drpick"></div>
       <div class="dares-chart" id="drchart"><svg class="fit" id="drl0" preserveAspectRatio="xMidYMid meet"></svg><svg class="fit dares-next" id="drl1" preserveAspectRatio="xMidYMid meet"></svg></div>
       <div class="dares-end" id="drend" hidden></div>
     </div>`,
    `<div class="grp do"><button class="btn primary" id="drgo"></button><button class="btn" id="drlisten" hidden>${icon('play')}${L('Listen to the take', 'Take anhören')} <kbd>L</kbd></button></div>
     <div class="grp how" id="drhow"></div>
     <p class="auto" id="drauto"></p>`,
    undefined,
    ['#/nf', L('Games', 'Spiele')],
  );

  // ───────────────────────── choosing the dares

  function drawPick(): void {
    $('#drkick', root).textContent = L('Your song · tonight', 'Dein Song · heute');
    $('#drh1', root).textContent = L(`${song.title}: what do you dare?`, `${song.title}: Was traust du dich?`);
    const rec = store.dares[daresKey(id)];
    $('#drsub', root).textContent = rec ? L(`Your record: ${describe(rec)}.`, `Dein Rekord: ${describe(rec)}.`) : L('No record yet on this song.', 'Auf diesem Song noch kein Rekord.');
    $('#drbig', root).innerHTML = '';
    $('#drpick', root).hidden = false;
    $('#drchart', root).hidden = true;
    $('#drend', root).hidden = true;
    $('#drpick', root).innerHTML = `<div class="dares-list" role="group" aria-label="${L('Dares', 'Mutproben')}">${DARES.map((d, i) => {
      const off = d.id === 'called' && !strummedOnly;
      return `<button class="dares-dare" data-dare="${d.id}" aria-pressed="${chosen.has(d.id)}"${off ? ' disabled' : ''}><span>${i + 1}</span><b>${d.name}</b><small>${off ? L('Only on songs of strummed chords.', 'Nur bei Songs aus Akkorden.') : d.text}</small></button>`;
    }).join('')}</div>`;
    root.querySelectorAll<HTMLButtonElement>('[data-dare]').forEach((b) => (b.onclick = () => toggleDare(b.dataset.dare as DareId)));
    $('#drgo', root).innerHTML = `${L('Play', 'Spielen')} <kbd>${L('Space', 'Leertaste')}</kbd>`;
    $('#drlisten', root).hidden = true;
    $('#drhow', root).innerHTML = `<span class="stepper"><button class="btn quiet" id="drslow" aria-label="${L('Slower', 'Langsamer')}">−</button><b id="drtempo">${tempo} %</b><button class="btn quiet" id="drfast" aria-label="${L('Faster', 'Schneller')}">+</button></span>${choices.length > 1 ? `<span class="ladder" role="group" aria-label="${L('What a round is', 'Was eine Runde ist')}">${choices.map((c, i) => `<button class="rung" data-choice="${i}" aria-pressed="${i === choice}"><b>${i === 0 ? '∞' : i}</b><span>${esc(c.label)}</span></button>`).join('')}</span>` : ''}`;
    $('#drslow', root).onclick = () => setTempo(tempo - 5);
    $('#drfast', root).onclick = () => setTempo(tempo + 5);
    root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((b) => (b.onclick = () => setChoice(Number(b.dataset.choice))));
    $('#drauto', root).textContent = L(`A round is ${choices[choice].label.toLowerCase()}, about ${Math.round(secondsOf(choices[choice].lines, tempo))} seconds. Strum to start.`, `Eine Runde ist ${choices[choice].label.replace(/^Der /, 'der ')}, etwa ${Math.round(secondsOf(choices[choice].lines, tempo))} Sekunden. Schlag an, um zu starten.`);
    setSimTarget(null);
  }
  function toggleDare(d: DareId): void {
    if (phase !== 'pick' || (d === 'called' && !strummedOnly)) return;
    if (chosen.has(d)) chosen.delete(d);
    else chosen.add(d);
    drawPick();
  }
  function setTempo(t: number): void {
    if (phase !== 'pick') return;
    tempo = Math.max(50, Math.min(120, t));
    drawPick();
  }
  function setChoice(c: number): void {
    if (phase !== 'pick' || c < 0 || c >= choices.length) return;
    choice = c;
    drawPick();
  }

  // ───────────────────────── a round

  /** the chord of a bar this round: the dealt one under "called", otherwise the song's */
  const chordOfBar = (bar: number): string | undefined => dealt.get(bar) ?? m.chordOf(bar) ?? m.lines.flatMap((l) => l.steps).find((s) => s.bar === bar && s.chord)?.chord;

  function startRun0(): void {
    lastDares = [...chosen];
    store.speeds['dares:' + id] = tempo;
    store.save();
    run = startRun([...chosen], tempo);
    kept = null;
    $('#drpick', root).hidden = true;
    $('#drchart', root).hidden = false;
    $('#drhow', root).innerHTML = `<span class="dares-chips">${run.dares.map((d) => `<span class="dares-chip">${DARES.find((x) => x.id === d)!.name}</span>`).join('') || `<span class="dares-chip off">${L('No dares', 'Keine Mutprobe')}</span>`}</span>`;
    if (has(run, 'onetake') && store.settings.recordTakes) {
      engine.record(TAKE_MAX);
      recording = true;
    }
    startRound();
  }

  function startRound(): void {
    phase = 'count';
    dead = 0;
    lines = choices[choice].lines.map((k) => m.lines[k]);
    unitSec = (m.noteDur * 100) / run.tempo;
    const starts = lines.map((_, i) => lines.slice(0, i).reduce((s, x) => s + x.units, 0));
    const total = lines.reduce((s, l) => s + l.units, 0);
    barStarts = [];
    lines.forEach((l, i) => l.steps.forEach((s) => !barStarts.some((b) => b.bar === s.bar) && barStarts.push({ bar: s.bar, u: starts[i] + s.at })));
    dealt = new Map();
    if (has(run, 'called')) {
      const bars = barStarts.map((b) => m.chordOf(b.bar) ?? lines.flatMap((l) => l.steps).find((s) => s.bar === b.bar)?.chord ?? 'C');
      const d = deal(bars, seeded((Date.now() % 100000) + run.rounds * 31));
      barStarts.forEach((b, k) => dealt.set(b.bar, d[k]));
    }
    // a bar counted in, then the round
    const beat = m.beat * unitSec;
    // as many clicks as the song counts in: three in three-four time, otherwise four
    const bar = m.count;
    const now = engine.now();
    for (let k = 0; k < bar; k++) engine.tick(now + 0.3 + k * beat, k === 0, store.settings.click);
    t0 = now + 0.3 + bar * beat;
    endT = t0 + total * unitSec;
    const steps: TakeStep[] = [];
    lines.forEach((l, i) =>
      l.steps.forEach((s) => {
        const chord = s.chord ? (dealt.get(s.bar) ?? s.chord) : undefined;
        steps.push({ midis: s.midis, chord: chord ? shapeOf(chord).id : undefined, t: t0 + (starts[i] + s.at) * unitSec, bar: s.bar });
      }),
    );
    take = new Take(steps);
    startBand(starts, total);
    const l = engine.listener;
    if (l) {
      const ids = [...new Set(steps.map((s) => s.chord).filter((c): c is string => !!c))];
      l.chordCandidates = ids.length ? ids : null;
      l.noteDetection = !strummedOnly;
    }
    drawRound();
    tick();
  }

  function startBand(starts: number[], total: number): void {
    band?.stop(0.2);
    band = null;
    const mode = store.settings.band;
    const clicks: { u: number; accent: boolean }[] = [];
    const chords: { u: number; id: string }[] = [];
    const strums: number[] = [];
    lines.forEach((l, i) => {
      l.clicks.forEach((c) => clicks.push({ u: starts[i] + c.u, accent: c.accent }));
      l.steps.forEach((s) => {
        const c = s.chord ? (dealt.get(s.bar) ?? s.chord) : chordOfBar(s.bar);
        if (c && chords[chords.length - 1]?.id !== c) chords.push({ u: starts[i] + s.at, id: c });
        strums.push(starts[i] + s.at);
      });
    });
    if (mode === 'click' || !engine.ctx || !chords.length) {
      for (const c of clicks) engine.tick(t0 + c.u * unitSec, c.accent, store.settings.click);
      return;
    }
    const bandMode: BandMode = mode === 'phones' ? 'phones' : 'speakers';
    const parts = renderBand({ chords, clicks, units: total, unit: unitSec, sr: engine.ctx.sampleRate, a4: guitarA4(), mode: bandMode, strums, feel: strumPatternOf(song) ?? undefined } as Parameters<typeof renderBand>[0]);
    band = engine.playBand(t0, parts, { drums: 1, bass: 1, keys: 0.8, lead: 0.5 }, { volume: store.settings.bandVolume });
  }

  // the chart, drawn as lights out leaves it
  const drawn: (Drawn | null)[] = [null, null];
  let shownLine = -1;
  function drawLine(cur: number): void {
    const stage = run.stage;
    const called = has(run, 'called');
    [0, 1].forEach((row) => {
      const el = $<SVGSVGElement>(`#drl${row}`, root);
      const l = lines[cur + row];
      // from the third layer on there is no look ahead at the next line
      if (!l || (row === 1 && stage >= 2)) {
        el.innerHTML = '';
        drawn[row] = null;
        return;
      }
      let first = true;
      const name = (c: string): string => {
        if (called) return '';
        if (stage >= 3) return '';
        if (stage === 2) return first ? ((first = false), shapeOf(c).name) : '';
        return shapeOf(c).name;
      };
      const firstBar = l.bars[0];
      const look = (i: number): StepLook => {
        if (row === 1) return 'off';
        const s = l.steps[i];
        if (!s) return 'up';
        if (stage >= 3) return s.chord ? 'off' : 'hide';
        if (stage === 2 && !s.chord && s.bar !== firstBar) return 'hide';
        return 'up';
      };
      const bars = l.tab.map((b, k) => ({ ...b, chord: called || stage >= 3 || (stage === 2 && k > 0) ? undefined : b.chord }));
      const d = tabLine({ bars, look, name, beat: m.beat }, LEARN, row === 0);
      el.innerHTML = d.svg;
      el.setAttribute('viewBox', `0 0 1180 ${d.height}`);
      drawn[row] = d;
    });
  }

  function drawRound(): void {
    shownLine = -1;
    $('#drend', root).hidden = true;
    $('#drchart', root).hidden = false;
    $('#drchart', root).className = `dares-chart dark${run.stage}`;
    $('#drkick', root).textContent = L(`Round ${run.rounds + 1} · ${run.tempo} %`, `Runde ${run.rounds + 1} · ${run.tempo} %`) + (has(run, 'dark') ? L(` · lights out ${run.stage}/${DARK_STAGES}`, ` · Licht aus ${run.stage}/${DARK_STAGES}`) : '') + (recording ? L(' · recording', ' · Aufnahme') : '');
    $('#drh1', root).textContent = L('Count in…', 'Einzählen …');
    $('#drsub', root).textContent = run.held ? L(`${run.held} held so far.`, `${run.held} gehalten bisher.`) : L('Play it through with the band.', 'Spiel ihn mit der Band durch.');
    $('#drgo', root).innerHTML = `${L('Stop', 'Stopp')} <kbd>${L('Space', 'Leertaste')}</kbd>`;
    $('#drauto', root).textContent = has(run, 'clean') ? L('Clean: one wrong or dead strum ends the round.', 'Sauber: Ein falscher oder toter Anschlag beendet die Runde.') : L('A round holds with nine of ten right and hardly a stray sound.', 'Eine Runde hält mit neun von zehn richtig und kaum einem falschen Ton.');
    drawLine(0);
  }

  function tick(): void {
    raf = requestAnimationFrame(tick);
    const now = engine.now();
    const tk = take;
    if (!tk) return;
    if (phase === 'count' && now >= t0 - 0.05) {
      phase = 'play';
      $('#drh1', root).textContent = '';
    }
    const u = (now - t0) / unitSec;
    const starts = lines.map((_, i) => lines.slice(0, i).reduce((s, x) => s + x.units, 0));
    let cur = 0;
    for (let i = 0; i < starts.length; i++) if (u >= starts[i] - 1e-6) cur = i;
    if (cur !== shownLine) {
      shownLine = cur;
      drawLine(cur);
    }
    playhead($('#drl0', root), drawn[0] && u >= 0 ? drawn[0].x(u - starts[cur]) : null);
    // the chord of the moment: as a picture with all the light on, as a name when called, nothing in the dark
    const barNow = [...barStarts].reverse().find((b) => b.u <= Math.max(0, u) + 1e-6);
    const barNext = barStarts.find((b) => b.u > u + 1e-6);
    const called = has(run, 'called');
    const big = $('#drbig', root);
    let show = '';
    if (called) {
      const nowC = barNow ? chordOfBar(barNow.bar) : undefined;
      const soon = barNext && barNext.u - u <= m.beat + 1e-6 ? chordOfBar(barNext.bar) : undefined;
      show = `<b class="dares-call">${esc(nowC ? shapeOf(nowC).name : '')}</b>${soon ? `<span class="dares-soon">${L('next', 'dann')} <b>${esc(shapeOf(soon).name)}</b></span>` : ''}`;
    } else if (run.stage === 0) {
      const c = barNow ? chordOfBar(barNow.bar) : chordOfBar(barStarts[0]?.bar ?? 0);
      show = bigChord(c, 170);
    }
    if (big.dataset.shown !== show) {
      big.dataset.shown = show;
      big.innerHTML = show;
    }
    // the listener names a strum a fifth of a second late: steps are given up only when their report cannot come
    tk.advance(now - 0.25);
    const l = engine.listener;
    if (l && !strummedOnly) {
      const near = tk.near(now - 0.11).flatMap((s) => s.midis);
      l.expected = near.length ? near : null;
    }
    const due = tk.due(now);
    const st = tk.steps[due];
    setSimTarget(!st || phase !== 'play' ? null : st.chord ? { kind: 'chord', id: st.chord } : { kind: 'note', midi: st.midis[0] });
    let s = -1;
    while (s + 1 < tk.steps.length && tk.steps[s + 1].t <= now) s++;
    root.dataset.step = String(s);
    if (now > endT + 0.4) endRound(null);
  }

  /** The round is over, on time or broken early (clean): did it hold, and what comes next. */
  function endRound(broke: string | null): void {
    if (!take || phase === 'between' || phase === 'done' || phase === 'pick') return;
    cancelAnimationFrame(raf);
    band?.stop(broke ? 0.3 : 1.2);
    band = null;
    engine.clearTicks();
    const r = take.result();
    take = null;
    playhead($('#drl0', root), null);
    const held = !broke && roundHolds(r, dead, has(run, 'clean'));
    const before = run;
    run = afterRound(run, held);
    phase = 'between';
    setSimTarget(null);
    if (run.over) return finish();
    $('#drh1', root).textContent = held ? L(`Round ${before.rounds + 1} held.`, `Runde ${before.rounds + 1} gehalten.`) : broke ?? L('That round broke.', 'Die Runde ist gebrochen.');
    const news: string[] = [];
    if (held && has(run, 'climb')) news.push(L(`+4 %, now ${run.tempo} %`, `+4 %, jetzt ${run.tempo} %`));
    if (held && has(run, 'dark') && run.stage > before.stage) news.push([L('the pictures go dark', 'die Griffbilder gehen aus'), L('the names go dark', 'die Namen gehen aus'), L('everything goes dark', 'alles geht aus')][run.stage - 1]);
    if (!held) news.push(L(`${r.hits} of ${r.total} right. Once more.`, `${r.hits} von ${r.total} richtig. Noch einmal.`));
    $('#drsub', root).textContent = cap(news.join(' · ')) + (news.length ? '.' : '');
    stopTimer(timer);
    timer = window.setTimeout(startRound, 2200);
  }

  /** The run is over: keep the take and the record, and say how it went. */
  function finish(): void {
    phase = 'done';
    stopTimer(timer);
    cancelAnimationFrame(raf);
    band?.stop(0.8);
    band = null;
    engine.clearTicks();
    setSimTarget(null);
    let tookIt = false;
    if (recording) {
      recording = false;
      const rec = engine.recorded();
      if (rec.samples.length > rec.sampleRate * 3 && run.held > 0) {
        kept = rec;
        tookIt = true;
        void saveTake('guitar', daresTakeId(id), rec.samples, rec.sampleRate, { t: Date.now(), secs: rec.samples.length / rec.sampleRate, tempo: run.bestTempo, bars: [] });
      }
    }
    const rec = recordOf(run, Date.now(), tookIt);
    const prev = store.dares[daresKey(id)];
    const isNew = beats(rec, prev);
    if (rec && isNew) {
      store.dares[daresKey(id)] = rec;
      store.save();
    }
    $('#drbig', root).innerHTML = '';
    $('#drchart', root).hidden = true;
    const end = $('#drend', root);
    end.hidden = false;
    $('#drkick', root).textContent = `${esc(song.title)} · ${L(`${run.rounds} ${run.rounds === 1 ? 'round' : 'rounds'}`, `${run.rounds} ${run.rounds === 1 ? 'Runde' : 'Runden'}`)}`;
    $('#drh1', root).textContent = rec ? cap(describe(rec)) + '.' : L('Nothing held this time.', 'Diesmal hat nichts gehalten.');
    $('#drsub', root).textContent =
      run.end === 'dark' ? L('Held in the dark.', 'Im Dunkeln gehalten.') : run.end === 'broke' ? L('It broke, and one take means it ends there.', 'Es ist gebrochen, und ein Take heißt: Dort ist Schluss.') : run.end === 'fails' ? L('Three rounds in a row broke.', 'Drei Runden in Folge sind gebrochen.') : run.end === 'stopped' ? L('Stopped.', 'Angehalten.') : L('Through.', 'Durch.');
    end.innerHTML = `${isNew ? `<p><span class="dares-new">${L('New record', 'Neuer Rekord')}</span>${prev ? ` ${L(`Before: ${describe(prev)}.`, `Vorher: ${describe(prev)}.`)}` : ''}</p>` : prev ? `<p>${L(`Your record stays: ${describe(prev)}.`, `Dein Rekord bleibt: ${describe(prev)}.`)}</p>` : ''}${kept ? `<p class="dares-kept">${L('The take is kept: your first and your latest Dares take on this song are under', 'Der Take ist gespeichert: Dein erster und dein neuester Mutproben-Take auf diesem Song liegen unter')} <a href="#/takes/${encodeURIComponent(daresTakeId(id))}">${L('Recordings', 'Aufnahmen')}</a>.</p>` : ''}`;
    $('#drgo', root).innerHTML = `${L('Again', 'Nochmal')} <kbd>${L('Space', 'Leertaste')}</kbd>`;
    $('#drlisten', root).hidden = !kept;
    $('#drhow', root).innerHTML = `<button class="btn quiet" id="drchange">${L('Change the dares', 'Mutproben ändern')}</button><a class="btn quiet" href="#/songs/${encodeURIComponent(id)}">${L('To the song', 'Zum Song')}</a>`;
    $('#drchange', root).onclick = () => {
      phase = 'pick';
      drawPick();
    };
    $('#drauto', root).textContent = '';
  }

  function stopRun(): void {
    if (phase === 'count' || phase === 'play' || phase === 'between') {
      stopTimer(timer);
      cancelAnimationFrame(raf);
      take = null;
      run = { ...run, over: true, end: 'stopped' };
      finish();
    }
  }

  function go(): void {
    if (phase === 'pick') startRun0();
    else if (phase === 'done') {
      phase = 'pick';
      startRun0();
    } else stopRun();
  }

  // ───────────────────────── what the microphone hears

  const stopEars = hear(
    root,
    {
      onChord: (e: ChordEvent) => {
        if (phase === 'pick') {
          if (e.best && e.score > 0.7 && e.margin > 0.1) startRun0();
          return;
        }
        const tk = take;
        if (!tk || (phase !== 'play' && phase !== 'count')) return;
        const want = tk.wanted(e.time);
        let hit: number | null = null;
        if (want?.chord && strumIs(e, want.chord)) hit = tk.chord(want.chord, e.time);
        else if (e.best && e.score > 0.6 && e.margin > 0.08) hit = tk.chord(e.best, e.time);
        if (hit === null && e.best && e.score > 0.6 && has(run, 'clean') && e.time >= t0 - 0.1 && e.time <= endT) endRound(L('A wrong chord: under clean that ends the round.', 'Ein falscher Akkord: Bei „Sauber“ beendet das die Runde.'));
      },
      onNote: (e: NoteEvent) => {
        const tk = take;
        if (!tk || strummedOnly || phase !== 'play') return;
        const hit = tk.note(e.midi, e.time);
        if (hit === null && has(run, 'clean') && e.time >= t0 - 0.1 && e.time <= endT) endRound(L('A wrong note: under clean that ends the round.', 'Ein falscher Ton: Bei „Sauber“ beendet das die Runde.'));
      },
      onThud: (e: ThudEvent) => {
        if (phase !== 'play' || !e.hit || e.time < t0 || e.time > endT) return;
        dead++;
        if (has(run, 'clean')) endRound(L('A dead strum: under clean that ends the round.', 'Ein toter Anschlag: Bei „Sauber“ beendet das die Runde.'));
      },
    },
    (l) => {
      l.chordCandidates = [...new Set(m.lines.flatMap((x) => x.steps.map((s) => s.chord).filter((c): c is string => !!c)).map((c) => shapeOf(c).id))];
      l.noteDetection = !strummedOnly;
    },
  );

  $('#drgo', root).onclick = go;
  $('#drlisten', root).onclick = () => kept && engine.demo(kept.samples);
  const stopKeys = keys({
    ' ': go,
    l: () => kept && engine.demo(kept.samples),
    '-': () => setTempo(tempo - 5),
    '+': () => setTempo(tempo + 5),
    ...Object.fromEntries(DARES.map((d, i) => [String(i + 1), () => toggleDare(d.id)])),
  });
  drawPick();
  return () => {
    stopTimer(timer);
    cancelAnimationFrame(raf);
    band?.stop(0.2);
    engine.clearTicks();
    if (recording) engine.recorded();
    stopEars();
    stopKeys();
    engine.stopDemo();
    setSimTarget(null);
  };
};
