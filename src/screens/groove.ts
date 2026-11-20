/**
 * In the groove: the band plays the chords of a part of a song round and round, and the player plays along.
 * Nothing is measured and nothing can go wrong; the chord the app hears lights up when it is the one of the
 * moment. It is how a session warms up ("Einspielen", a few rounds, then on) and what "keep playing" after a
 * session opens (as long as you like, the tempo and the part your choice).
 *
 * Why: playing with a band is what makes a beginner sound like music, and the first minutes of a day decide
 * whether it feels like playing or like a test. A warm-up that is already music needs no willpower.
 */
import type { ChordEvent } from '../audio/listener';
import { engine } from '../audio/engine';
import { renderBand, type BandHandle, type BandMode } from '../audio/band';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { findSong, shapeOf, type Song } from '../music/content';
import { songMaterial, type Line, type Material } from '../music/material';
import { strumPatternOf } from '../music/strums';
import { CHORDS, chordsAlike } from '../music/theory';
import { guitarA4 } from '../music/tuning';
import { partsOfMaterial, partLabel } from '../music/week';
import { $, esc, hear, keys, later, stopTimer, type Screen, type SessionCtx } from '../ui/dom';
import { chordBox, LEARN, playhead, tabLine, type Drawn } from '../ui/draw';
import { setSimTarget } from '../ui/practice';
import { frame, nextStep } from './frame';

/** About how long a warm-up plays before it moves on, in seconds: enough to settle in, short enough to stay a warm-up. */
const WARM_SECONDS = 70;

/** A chord picture for the cue. */
const bigChord = (id: string | undefined, w: number): string => {
  const c = id ? CHORDS[shapeOf(id).id] : undefined;
  return c ? `<svg viewBox="0 0 240 210" width="${w}" role="img" aria-label="${esc(c.name)}">${chordBox(c, 40, 30, 150, LEARN, true, undefined, 34)}</svg>` : '';
};

/** The lines of one part (by its index in partsOfMaterial), at most four of them: a groove is a short loop. */
function loopLines(m: Material, part: number): Line[] {
  const parts = partsOfMaterial(m);
  const p = parts[Math.max(0, Math.min(parts.length - 1, part))];
  return p.lines.slice(0, 4).map((k) => m.lines[k]);
}

/**
 * #/groove/<id>/<warm|free>/<part>. With a session it is the warm-up: a few rounds, then the next step.
 * Without one it plays until the player leaves.
 */
export const groove: Screen = (root, [id, how = 'free', partParam = '0'], ctx?: SessionCtx) => {
  const song: Song = findSong(id);
  const m = songMaterial(song);
  const warm = how === 'warm';
  const parts = partsOfMaterial(m);
  let part = Math.max(0, Math.min(parts.length - 1, Number(partParam) || 0));
  // a warm-up is comfortable: a little under full speed; playing freely starts there too and goes where the player likes
  let tempo = warm ? 85 : 90;
  const mode = store.settings.band;
  let band: BandHandle | null = null;
  let running = false;
  let t0 = 0;
  let raf = 0;
  let rounds = 0;
  let heard = 0;
  let movingOn = 0;

  let lines = loopLines(m, part);
  const units = (): number => lines.reduce((s, l) => s + l.units, 0);
  const unit = (): number => (m.noteDur * 100) / tempo;
  /** rounds of the loop in a warm-up: as many as fit about seventy seconds, one to four */
  const WARM_ROUNDS = Math.max(1, Math.min(4, Math.round(WARM_SECONDS / (units() * unit()))));
  /** where each line begins in the loop, in note units */
  const starts = (): number[] => lines.map((_, i) => lines.slice(0, i).reduce((s, x) => s + x.units, 0));
  /** the chord of the loop at a moment (note units into the loop) */
  const chordAt = (u: number): string | undefined => {
    let at: string | undefined;
    const st = starts();
    lines.forEach((ln, i) => ln.steps.forEach((s) => s.chord && st[i] + s.at <= u + 1e-6 && (at = s.chord)));
    return at ?? lines[0]?.steps.find((s) => s.chord)?.chord;
  };

  const where = `<b>${esc(song.title)}</b> · ${L('In the groove', 'Im Groove')}`;
  const partName = (n: string): string => (n === '1' ? L('First half', 'Erste Hälfte') : n === '2' ? L('Second half', 'Zweite Hälfte') : partLabel(n));
  const partKeys = parts.length > 1 && !warm ? parts.map((p, i) => `<button class="rung" data-part="${i}" aria-pressed="${i === part}" title="${esc(partName(p.name))}"><b>${i + 1}</b><span>${esc(partName(p.name))}</span></button>`).join('') : '';
  const bandSaid = mode === 'click' ? L('with the click', 'mit Klick') : mode === 'phones' ? L('with the full band', 'mit voller Band') : L('with the band', 'mit Band');
  root.innerHTML = frame(
    where,
    `<div class="head">
       <div class="groove-chord" id="gbig"></div>
       <div class="say">
         <p class="eyebrow" id="gkick">${warm ? `${ctx ? esc(ctx.label) + ' · ' : ''}${L('Warm-up', 'Einspielen')} · ${bandSaid}` : `${L('Play freely', 'Frei spielen')} · ${bandSaid}`} · <span id="gtempo">${tempo}</span> %</p>
         <h1 id="gh1">${L('Strum to start.', 'Schlag an, und es geht los.')}</h1>
         <p class="sub" id="gsub">${warm ? L(`${WARM_ROUNDS} rounds, nothing is measured.`, `${WARM_ROUNDS} Runden, nichts wird gemessen.`) : L('As long as you like.', 'So lange du willst.')}</p>
       </div>
     </div>
     <svg class="fit" id="gl0" preserveAspectRatio="xMidYMid meet"></svg><svg class="fit groove-next" id="gl1" preserveAspectRatio="xMidYMid meet"></svg>`,
    `<div class="grp do"><button class="btn primary" id="gplay">${L('Start', 'Los')} <kbd>${L('Space', 'Leertaste')}</kbd></button>${nextStep(ctx)}</div>
     <div class="grp how">${warm ? '' : `<span class="stepper"><button class="btn quiet" id="gslow" title="${L('Slower (−)', 'Langsamer (−)')}" aria-label="${L('Slower', 'Langsamer')}">−</button><b id="gtempo2">${tempo} %</b><button class="btn quiet" id="gfast" title="${L('Faster (+)', 'Schneller (+)')}" aria-label="${L('Faster', 'Schneller')}">+</button></span>`}</div>
     ${partKeys ? `<div class="ladder" role="group" aria-label="${L('Part', 'Teil')}">${partKeys}</div>` : ''}`,
    ctx,
    ['#/songs/' + encodeURIComponent(song.id), L('Song', 'Song')],
  );

  const drawn: (Drawn | null)[] = [null, null];
  /** draws the line the loop is in, and the one after it, faint */
  function draw(cur: number): void {
    [0, 1].forEach((row) => {
      const l = lines[(cur + row) % lines.length];
      const el = $<SVGSVGElement>(`#gl${row}`, root);
      if (!l || (row === 1 && lines.length < 2)) {
        el.innerHTML = '';
        drawn[row] = null;
        return;
      }
      const d = tabLine({ bars: l.tab, look: () => (row === 0 ? 'up' : 'off'), name: (c) => shapeOf(c).name, beat: m.beat, barWords: l.bars.map((b) => song.bars[b]?.words ?? '') }, LEARN, row === 0);
      el.innerHTML = d.svg;
      el.setAttribute('viewBox', `0 0 1180 ${d.height}`);
      drawn[row] = d;
    });
  }
  let shownLine = -1;
  let shownChord: string | undefined;
  function showChord(c: string | undefined): void {
    if (c === shownChord) return;
    shownChord = c;
    $('#gbig', root).innerHTML = bigChord(c, 200) + (c ? `<b class="groove-name">${esc(shapeOf(c).name)}</b>` : '');
    if (running) $('#gh1', root).textContent = c ? shapeOf(c).name : '';
    setSimTarget(c ? { kind: 'chord', id: shapeOf(c).id } : null);
  }
  draw(0);
  showChord(chordAt(0));

  /** the band for the loop, or the click alone */
  function startSound(at: number): void {
    const u = unit();
    const st = starts();
    const chords: { u: number; id: string }[] = [];
    const clicks: { u: number; accent: boolean }[] = [];
    const strums: number[] = [];
    lines.forEach((l, i) => {
      l.steps.forEach((s) => {
        if (s.chord && chords[chords.length - 1]?.id !== s.chord) chords.push({ u: st[i] + s.at, id: s.chord });
        strums.push(st[i] + s.at);
      });
      l.clicks.forEach((c) => clicks.push({ u: st[i] + c.u, accent: c.accent }));
    });
    if (mode === 'click' || !engine.ctx) {
      // the click alone, scheduled a round at a time
      const round = (k: number): void => {
        for (const c of clicks) engine.tick(at + (k * units() + c.u) * u, c.accent, store.settings.click);
      };
      for (let k = 0; k < 40; k++) round(k);
      return;
    }
    const bandMode: BandMode = mode === 'phones' ? 'phones' : 'speakers';
    const parts = renderBand({ chords, clicks, units: units(), unit: u, sr: engine.ctx.sampleRate, a4: guitarA4(), mode: bandMode, strums, feel: strumPatternOf(song) ?? undefined, loop: true });
    band = engine.playBand(at, parts, { drums: 1, bass: 1, keys: 0.8, lead: 0.6 }, { loop: true, volume: store.settings.bandVolume });
  }

  function stopSound(): void {
    band?.stop(0.4);
    band = null;
    engine.clearTicks();
  }

  function start(): void {
    if (running) return;
    running = true;
    rounds = 0;
    heard = 0;
    const u = unit();
    // one bar counted in with the click, then the band
    const bar = (lines[0]?.clicks.filter((c) => c.u < lines[0].units).length || 4) || 4;
    const beat = m.beat * u;
    const now = engine.now();
    for (let k = 0; k < bar; k++) engine.tick(now + 0.25 + k * beat, k === 0, store.settings.click);
    t0 = now + 0.25 + bar * beat;
    startSound(t0);
    $('#gplay', root).innerHTML = `${L('Pause', 'Pause')} <kbd>${L('Space', 'Leertaste')}</kbd>`;
    $('#gsub', root).textContent = L('Count in…', 'Einzählen …');
    tick();
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(raf);
    stopSound();
    $('#gplay', root).innerHTML = `${L('Go on', 'Weiter')} <kbd>${L('Space', 'Leertaste')}</kbd>`;
    playhead($('#gl0', root), null);
  }

  function tick(): void {
    raf = requestAnimationFrame(tick);
    const now = engine.now();
    const u = (now - t0) / unit();
    if (u < 0) return;
    const round = Math.floor(u / units());
    const inLoop = u - round * units();
    const st = starts();
    let cur = 0;
    for (let i = 0; i < st.length; i++) if (inLoop >= st[i] - 1e-6) cur = i;
    if (cur !== shownLine) {
      shownLine = cur;
      draw(cur);
    }
    playhead($('#gl0', root), drawn[0] ? drawn[0].x(inLoop - st[cur]) : null);
    showChord(chordAt(inLoop));
    if (round !== rounds) {
      rounds = round;
      if (warm && rounds >= WARM_ROUNDS && !movingOn) finish();
    }
    $('#gsub', root).textContent = warm ? L(`Round ${Math.min(rounds + 1, WARM_ROUNDS)} of ${WARM_ROUNDS}`, `Runde ${Math.min(rounds + 1, WARM_ROUNDS)} von ${WARM_ROUNDS}`) : L(`Round ${rounds + 1}`, `Runde ${rounds + 1}`);
  }

  /** the warm-up is through: a word, then the next step after a few seconds (or at once with Space) */
  function finish(): void {
    stop();
    $('#gh1', root).textContent = L('Warmed up.', 'Eingespielt.');
    $('#gsub', root).textContent = heard ? L(`${heard} chords heard on the spot.`, `${heard} Akkorde genau zur rechten Zeit gehört.`) : L('On to the next step.', 'Weiter zum nächsten Schritt.');
    if (ctx) movingOn = later(4000, () => ctx.next(), ctx.after);
  }

  // the chord heard lights up when it is the one of the moment (heard a little late, so the moment it was played counts)
  const stopEars = hear(
    root,
    {
      onChord: (e: ChordEvent) => {
        if (!running || !e.best || e.score < 0.6) return;
        const u = (e.time - t0) / unit();
        if (u < -0.5) {
          // a strum before the count-in has ended does not count; a strum to start does (handled by onOnset)
          return;
        }
        const want = chordAt(((u % units()) + units()) % units());
        const a = CHORDS[shapeOf(want ?? '').id];
        const b = CHORDS[e.best];
        if (want && a && b && (a === b || chordsAlike(a, b) > 0.9)) {
          heard++;
          const big = $('#gbig', root);
          big.classList.remove('groove-hit');
          void big.offsetWidth;
          big.classList.add('groove-hit');
        }
      },
      onOnset: () => {
        // a strum starts it, as everywhere a timed thing starts on the player's signal
        if (!running && !movingOn) start();
      },
    },
    (l) => {
      l.chordCandidates = [...new Set(lines.flatMap((x) => x.steps.map((s) => s.chord).filter((c): c is string => !!c)).map((c) => shapeOf(c).id))];
    },
  );

  const toggle = (): void => {
    if (movingOn && ctx) {
      stopTimer(movingOn);
      ctx.next();
      return;
    }
    if (running) stop();
    else start();
  };
  $('#gplay', root).onclick = toggle;
  const nx = root.querySelector<HTMLButtonElement>('#nextstep');
  if (nx) nx.onclick = () => ctx?.next();
  const setTempo = (t: number): void => {
    tempo = Math.max(50, Math.min(120, t));
    $('#gtempo', root).textContent = String(tempo);
    const t2 = root.querySelector('#gtempo2');
    if (t2) t2.textContent = `${tempo} %`;
    if (running) {
      stop();
      start();
    }
  };
  const setPart = (p: number): void => {
    if (p === part || p < 0 || p >= parts.length) return;
    part = p;
    lines = loopLines(m, part);
    root.querySelectorAll('[data-part]').forEach((b) => b.setAttribute('aria-pressed', String(Number((b as HTMLElement).dataset.part) === part)));
    shownLine = -1;
    draw(0);
    showChord(chordAt(0));
    if (running) {
      stop();
      start();
    }
  };
  root.querySelector<HTMLButtonElement>('#gslow')?.addEventListener('click', () => setTempo(tempo - 5));
  root.querySelector<HTMLButtonElement>('#gfast')?.addEventListener('click', () => setTempo(tempo + 5));
  root.querySelectorAll<HTMLButtonElement>('[data-part]').forEach((b) => (b.onclick = () => setPart(Number(b.dataset.part))));
  const stopKeys = keys({
    ' ': toggle,
    '-': () => !warm && setTempo(tempo - 5),
    '+': () => !warm && setTempo(tempo + 5),
    ...Object.fromEntries(parts.map((_, i) => [String(i + 1), () => !warm && setPart(i)])),
    ...(ctx ? { ArrowRight: () => ctx.next() } : {}),
  });
  return () => {
    cancelAnimationFrame(raf);
    stopSound();
    stopEars();
    stopKeys();
    if (movingOn) stopTimer(movingOn);
    setSimTarget(null);
  };
};
