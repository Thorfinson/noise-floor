/**
 * The lighthouse on a groove: the chord-change run of the guitar, and "tonight's night", the run of the day.
 * The painting fills the window; the pieces of noise wear their chords in it; a band plays under the run and
 * grows with a chain of clean hits. A slim strip at the bottom shows the band, the groove's chords as a line
 * of tab read left to right, and the shape of the next chord while it is still new. The rules are in
 * game/groove.ts, the picture in ui/watch.ts.
 */
import { engine } from '../audio/engine';
import { renderBand, type BandHandle, type BandParts, type Layer, type LayerGains } from '../audio/band';
import { chime as chimeSound, type Chime } from '../audio/synth';
import { dayOf } from '../core/days';
import { L, lang, num } from '../core/i18n';
import { store } from '../core/store';
import { MuteGesture } from '../game/gesture';
import { fadeFor, Groove, grooveOf, LAYER_AT, LAYER_NAMES, layerGains, vamp, type GrooveEvent, type GrooveMusic, type LayerName } from '../game/groove';
import { NIGHT_BARS, NIGHT_WAVES, nightDate, nightLog, nightRule, nightSeed, noteNight, seeded, type NightRule } from '../game/night';
import { chordBoss } from '../game/run';
import { CHORD_PAIRS, noteTimes, shapeOf, type Song } from '../music/content';
import { currentSong } from '../music/difficulty';
import { chordName, CHORDS, chordsAlike, noteName, STRING_FULL, stringName, strumIs } from '../music/theory';
import { guitarA4 } from '../music/tuning';
import { $, esc, go, hear, keys, learnRing, micMeter, type Screen, type SessionCtx } from '../ui/dom';
import { chordBox, NF, playhead, tabLine } from '../ui/draw';
import { practiceBar, setSimTarget } from '../ui/practice';
import { calm } from '../ui/scene';
import { hourOf, STORM, Watch, type GroovePiece } from '../ui/watch';
import { stringTip } from './chordcheck';
import { pips, skillLabel } from './home';
import { knownChords, nfRun, weakestChange } from './nf';
import { armed, bossChord, menuOn, pickHint, pickState, slowly, STRUM, tenths } from './runkit';

/** Two chords the ear cannot tell apart (D and Dsus4) never share the water. */
const alike = (a: string, b: string): boolean => chordsAlike(CHORDS[a], CHORDS[b]) >= 0.8;

/**
 * The chords the pieces wear: the groove's chords that the hand already knows (a new chord is met in the chord
 * check first), filled up to three with the weakest change and the usual partners; and for the night that
 * mixes them in, a few known chords from outside the song.
 */
function waterChords(music: GrooveMusic): { chords: string[]; extra: string[] } {
  const known = knownChords();
  const ok = (c: string): boolean => !!CHORDS[c] && !c.endsWith('-easy') && known.has(shapeOf(c).id);
  const out: string[] = [];
  const add = (c: string): void => {
    if (out.length < 5 && ok(c) && !out.includes(c) && out.every((d) => !alike(c, d))) out.push(c);
  };
  music.chords.forEach(add);
  if (out.length < 3) weakestChange()?.forEach(add);
  for (const [a, b] of CHORD_PAIRS) {
    if (out.length >= 3) break;
    if (out.includes(a) || out.includes(b)) {
      add(a);
      add(b);
    }
  }
  for (const c of ['Em', 'Am', 'C', 'G', 'D']) if (out.length < 2) add(c);
  const extra: string[] = [];
  for (const c of new Set(CHORD_PAIRS.flat())) if (extra.length < 3 && ok(c) && !out.includes(c) && [...out, ...extra].every((d) => !alike(c, d))) extra.push(c);
  return { chords: out, extra };
}

/** The layers of the band by the names the strip shows. */
const LAYER_LABEL: Record<LayerName, () => string> = {
  drums: () => L('Drums', 'Schlagzeug'),
  bass: () => L('Bass', 'Bass'),
  keys: () => L('Organ', 'Orgel'),
  lead: () => L('Fiddle', 'Geige'),
};

/** A loop of exactly this many samples: what rings on past its end is laid over its start, as it would when it repeats. */
function folded(x: Float32Array, n: number): Float32Array {
  if (n <= 0 || x.length === n) return x;
  const out = new Float32Array(n);
  out.set(x.subarray(0, Math.min(n, x.length)));
  for (let i = n; i < x.length; i++) out[(i - n) % n] += x[i];
  return out;
}

/** What a run on the groove is made of today: the song's groove, the chords on the water, and the night's rule. */
export function groovePlan(night: boolean, now = Date.now()): { today: number; song: Song; music: GrooveMusic; chords: string[]; extra: string[]; rule: NightRule | null } {
  const today = dayOf(now);
  const song = currentSong();
  const weak = weakestChange();
  const music = grooveOf(song) ?? vamp(weak?.[0] ?? 'Em', weak?.[1] ?? 'Am');
  const { chords, extra } = waterChords(music);
  const rule = night ? nightRule(today, (id) => id !== 'mixed' || extra.length > 0) : null;
  return { today, song, music, chords, extra, rule };
}

interface GrooveRunOptions {
  night: boolean;
  /** waves of a run outside the session; the night has its own */
  waves?: number;
  /** the same again: no need to show what it is */
  again?: boolean;
}

/** A run on the groove. Used for the guitar's changes run (nfRun) and for the night. */
export function grooveRun(root: HTMLElement, ctx: SessionCtx | undefined, o: GrooveRunOptions): () => void {
  const began = Date.now();
  const night = o.night;
  const { today, music, chords, extra, rule } = groovePlan(night, began);
  const stored = Number(store.speeds.groove);
  const lat = engine.micOn ? (store.settings.latency >= 0 ? store.settings.latency : engine.latencyEstimate()) : 0;
  const waves = night ? NIGHT_WAVES : ctx ? 2 : Math.max(1, Math.min(6, o.waves || 4));
  // the night ends with its weakest chord, string by string; a full run with the barre
  const weakestChord = chords.slice().sort((a, b) => store.skills.level('chord:' + shapeOf(a).id) - store.skills.level('chord:' + shapeOf(b).id))[0];
  const boss = ctx ? null : chordBoss(night ? shapeOf(weakestChord).id : bossChord());
  /** the skill of a change, under the name the other screens give it */
  const pairOf = (a: string, b: string): string => {
    const known = CHORD_PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (known) return `pair:${known[0]}>${known[1]}`;
    if (store.skills.get(`pair:${b}>${a}`)) return `pair:${b}>${a}`;
    if (store.skills.get(`pair:${a}>${b}`)) return `pair:${a}>${b}`;
    const at = (c: string): number => (music.chords.includes(c) ? music.chords.indexOf(c) : 99);
    return at(a) <= at(b) ? `pair:${a}>${b}` : `pair:${b}>${a}`;
  };
  const pairLabel = (a: string, b: string): string => {
    const [x, y] = pairOf(a, b).slice(5).split('>');
    return `${chordName(x)} → ${chordName(y)}`;
  };
  const g = new Groove({
    chords,
    extra,
    pairKey: pairOf,
    pairLabel,
    // the night is the same all day, whatever was learned since the morning: every change counts the same;
    // a changes run sends the slow ones more often
    weight: night ? () => 1 : (k) => store.skills.weight(k, began),
    rng: night ? seeded(nightSeed(today)) : Math.random,
    bpm: Number.isFinite(stored) && stored > 0 ? stored : 66,
    beatsPerBar: music.beatsPerBar,
    waves,
    // a wave is as long in four as in three: sixty-four beats, sixteen bars of four
    barsPerWave: Math.max(4, Math.round((night ? NIGHT_BARS * 4 : 64) / music.beatsPerBar)),
    boss,
    lat,
    rule: rule?.id ?? null,
  });
  /** every chord of the run: what the listener tells apart */
  const runChords = g.chords;
  const dateName = nightDate(today, lang());
  const title = night ? L(`The night of ${dateName}`, `Die Nacht vom ${dateName}`) : L('Changes run', 'Wechselrunde');
  const mutePause = store.settings.mutePause;
  const gesture = new MuteGesture();
  const ups: string[] = [];
  const bandMode = store.settings.band;
  let gate: 'ready' | 'go' = 'ready';
  let view: string = 'ready';
  let paused = false;
  let pausedAt = -1;
  let playFrom = -Infinity;
  let raf = 0;
  let bannerTimer = 0;
  let closing = 0;
  let debriefed = false;
  let summary: { score: number; best: boolean } | null = null;
  let restarted: void | (() => void);
  let cueHits = 0;
  let stopMenu: () => void = () => undefined;
  let menuStrum: ((id: string, score: number, margin: number) => void) | null = null;
  let tempoNote = '';
  let bossTip = '';

  // ───────────────────────── the page

  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  canvas.className = 'world';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', L('A lighthouse over the sea. Pieces of noise drift in toward the lamp, each with a chord written large on it; the one that will reach the lamp first has a ring round it.', 'Ein Leuchtturm über dem Meer. Rauschen treibt auf die Lampe zu, jedes Teil mit einem großen Akkord darauf; das Teil, das die Lampe zuerst erreicht, trägt einen Ring.'));
  const hourShift = Number(new URLSearchParams(location.search).get('hour')) || 0;
  const scene = new Watch(canvas, hourOf(1, waves) + hourShift);
  root.innerHTML = `<header class="hud night-hud">
      <div class="g"><a class="hb leave" href="${ctx ? '#/' : '#/nf'}">${ctx ? L('✕ End session', '✕ Session beenden') : L('‹ Games', '‹ Spiele')}</a>${ctx ? `<span class="k">${esc(ctx.label)}</span>` : ''}<span class="night-title" id="ttl"></span></div>
      <div class="g"></div>
      <div class="g">${micMeter()}<span class="night-lamp" id="lamp" role="img"></span><span class="night-score"><b id="score">0</b><span class="mult" id="mult">×1</span></span><button class="hb" id="pause" aria-pressed="false" hidden><span>${L('Pause', 'Pause')}</span><kbd>${L('Space', 'Leertaste')}</kbd></button>${ctx ? `<button class="hb" id="skipstep">${L('Next step', 'Nächster Schritt')}</button>` : ''}</div>
    </header>
    <div id="mid" class="night-mid"><div class="arena night-sea" id="arena"><div class="banner" id="banner" hidden></div><p class="night-cue" id="cue" hidden></p><div class="night-sheet" id="sheet" hidden></div></div></div>
    <footer class="night-strip" id="strip"></footer>
    ${practiceBar()}`;
  root.prepend(canvas);
  const mid = $('#mid', root);
  const arena = $('#arena', root);
  const sheet = $('#sheet', root);
  const strip = $('#strip', root);
  scene.over = arena;

  /** The sheet over the picture goes, and what was on it with it: nothing hidden stays to be found. */
  function hideSheet(): void {
    sheet.hidden = true;
    sheet.innerHTML = '';
    sheet.id = 'sheet';
  }

  function banner(text: string, ms = 1800, big = false): void {
    const el = $('#banner', root);
    el.textContent = text;
    el.classList.toggle('count', big);
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => (el.hidden = true), ms);
  }

  // ───────────────────────── the band and the beat

  let band: BandHandle | null = null;
  let parts: BandParts | null = null;
  /** when unit 0 of the loop sounds (scheduled); the tempo it was made for */
  let bandAt = 0;
  let bandBpm = 0;
  /** the drums keep the beat; without them (the click alone, or a band without drums) the click does */
  let clickAlong = bandMode === 'click';
  /** the clicks to give: from t0, every beat, until `until` */
  let ticks: { t0: number; beat: number; bar: number; until: number } | null = null;
  let ticked = -Infinity;
  const chimes = new Map<Chime, Float32Array>();
  const unitSecs = (bpm: number): number => 60 / bpm / music.unitsPerBeat;

  function makeBand(bpm: number): void {
    parts = null;
    bandBpm = bpm;
    if (bandMode === 'click' || !engine.ctx) return;
    const clicks: { u: number; accent: boolean }[] = [];
    for (let u = 0; u < music.units - 1e-6; u += music.unitsPerBeat) clicks.push({ u, accent: Math.round(u / music.unitsPerBeat) % music.beatsPerBar === 0 });
    const sr = engine.ctx.sampleRate;
    try {
      const made = renderBand({ chords: music.band, clicks, units: music.units, unit: unitSecs(bpm), sr, a4: guitarA4(), mode: bandMode, strums: clicks.map((c) => c.u), feel: music.feel, seed: night ? nightSeed(today) : (Math.random() * 1e6) | 0 });
      const n = Math.round(music.units * unitSecs(bpm) * sr);
      const layers = Object.fromEntries(Object.entries(made.layers).map(([k, v]) => [k, folded(v, n)])) as Record<Layer, Float32Array>;
      parts = { layers, events: made.events, length: n / sr };
      clickAlong = !layers.drums.some((v) => v !== 0);
    } catch {
      parts = null;
      clickAlong = true;
    }
  }

  const gainsOf = (level: number): LayerGains => layerGains(level);
  const DRUMS_ONLY: LayerGains = { drums: 1, bass: 0, keys: 0, lead: 0 };

  function playBand(at: number, gains: LayerGains): void {
    band?.stop(0.4);
    band = null;
    bandAt = at;
    if (parts) band = engine.playBand(at, parts, gains, { loop: true, volume: store.settings.bandVolume });
  }

  /** Every layer to the gains of a level, fading as a miss or a gain asks. */
  function setLayers(gains: LayerGains, ramp: number): void {
    if (!band) return;
    for (const l of LAYER_NAMES) band.setGain(l, gains[l] ?? 0, ramp);
  }

  function scheduleTicks(now: number): void {
    if (!ticks || store.settings.click <= 0) return;
    const { t0, beat, bar, until } = ticks;
    let k = Math.ceil((Math.max(ticked + 1e-3, now - 0.02) - t0) / beat);
    for (; t0 + k * beat < Math.min(until, now + 0.6); k++) {
      ticked = t0 + k * beat;
      engine.tick(ticked, ((k % bar) + bar) % bar === 0, store.settings.click, store.settings.clickSound === 'click');
    }
  }

  /** A chime of the game on a beat, with the band: through the speakers, above what the listener hears. */
  function chimeAt(kind: Chime, at: number): void {
    const c = engine.ctx;
    const vol = store.settings.chimes;
    if (!c || vol <= 0) return;
    let s = chimes.get(kind);
    if (!s) chimes.set(kind, (s = chimeSound(c.sampleRate, kind)));
    engine.playAt(at, s, vol);
  }

  /** The player hears what was scheduled a moment ago: the picture follows the ear. */
  const heardLag = (): number => Math.max(0, Math.min(0.2, engine.ctx?.outputLatency ?? 0));

  // ───────────────────────── before the first wave

  function ready(): void {
    view = 'ready';
    mid.dataset.gate = 'ready';
    const l = engine.listener;
    if (l) {
      l.cancelStringCheck();
      l.chordCandidates = runChords;
      l.noteDetection = false;
    }
    const played = night ? nightLog(store.progress, today, 1).find((e) => e.day === today) : undefined;
    sheet.hidden = false;
    // named as every run's briefing is, for whoever looks for it (the walk-through, the browser checks)
    sheet.id = 'brief';
    sheet.className = 'night-sheet night-ready';
    sheet.innerHTML = `<p class="kick">${esc(title)}${rule ? ` · ${esc(rule.name)}` : ` · ${L(`${waves} ${waves === 1 ? 'wave' : 'waves'}`, `${waves} ${waves === 1 ? 'Welle' : 'Wellen'}`)}`}</p>
      <h1>${L('Play the chord on a piece to strike it.', 'Spiel den Akkord eines Teils, um es zu treffen.')}</h1>
      ${rule ? `<p class="lede">${esc(rule.text)}</p>` : ''}
      <div class="night-chords" role="list" aria-label="${L('The chords of tonight', 'Die Akkorde dieser Runde')}">${runChords.map((c) => `<figure role="listitem"><svg viewBox="0 0 120 132" role="img" aria-label="${L(`Chord diagram of ${chordName(c)}`, `Griffbild von ${chordName(c)}`)}">${chordBox(shapeOf(c), 18, 26, 86, NF, false, undefined, 19)}</svg><figcaption>${chordName(c)}</figcaption></figure>`).join('')}</div>
      <div class="row"><button class="btn primary big" id="begin">${L('Start', 'Starten')} <kbd>${L('Space', 'Leertaste')}</kbd></button><span class="note">${menuOn() ? L('or strum one of the chords. ', 'oder schlag einen der Akkorde an. ') : ''}${played ? L(`Best tonight: ${num(played.best)} (${played.tries} ${played.tries === 1 ? 'try' : 'tries'}).`, `Bestwert heute: ${num(played.best)} (${played.tries} ${played.tries === 1 ? 'Versuch' : 'Versuche'}).`) : ''}</span></div>`;
    $('#begin', root).onclick = begin;
    drawStrip(true);
    hud();
    setSimTarget({ kind: 'chord', id: runChords[0] });
  }

  /** The player is ready: the band is made, a bar is counted in, and the first wave begins on its first beat. */
  function begin(): void {
    if (gate !== 'ready') return;
    gate = 'go';
    mid.dataset.gate = 'count';
    hideSheet();
    $('#pause', root).hidden = false;
    makeBand(g.bpm);
    const beat = 60 / g.bpm;
    const count = music.beatsPerBar >= 3 ? music.beatsPerBar : 2 * music.beatsPerBar;
    const T0 = engine.now() + 0.4 + count * beat;
    ticks = { t0: T0 - count * beat, beat, bar: music.beatsPerBar, until: clickAlong ? Infinity : T0 - 1e-3 };
    ticked = -Infinity;
    playBand(T0, gainsOf(g.level));
    g.start(T0);
    layout();
  }

  // ───────────────────────── the phases of a run

  function layout(): void {
    view = g.state;
    stopMenu();
    stopMenu = () => undefined;
    menuStrum = null;
    const l = engine.listener;
    if (l) {
      l.cancelStringCheck();
      l.expected = null;
      l.noteDetection = false;
      l.chordCandidates = view === 'playing' ? runChords : null;
    }
    $('#ttl', root).textContent = title;
    if (view === 'playing') {
      hideSheet();
      scene.aim(hourOf(g.wave, g.waves) + hourShift);
      drawStrip(true);
      if (g.wave === 1) showCue();
    } else if (view === 'perk') {
      // the band thins to the drums while the hand is free, and the click is quiet (engine.clearTicks would
      // stop the band with the clicks: no click is given from here on instead)
      setLayers(DRUMS_ONLY, 1.5);
      ticks = null;
      $('#cue', root).hidden = true;
      sheet.hidden = false;
      sheet.className = 'night-sheet night-pick';
      sheet.innerHTML = `<p class="kick">${L(`Wave ${g.wave} of ${g.waves} cleared`, `Welle ${g.wave} von ${g.waves} geschafft`)}</p><h1>${L('Pick one.', 'Wähl eins.')}</h1>${pickState()}
        <div class="cards">${g.offered.map((p, i) => `<button class="card" data-perk="${p.id}"><h2>${p.name}</h2><p>${p.text}</p><span class="pick">${pickHint(i, false)}</span></button>`).join('')}</div>`;
      const pick = (i: number): void => {
        if (g.offered[i]) choose(g.offered[i].id);
      };
      sheet.querySelectorAll<HTMLElement>('[data-perk]').forEach((b, i) => (b.onclick = () => pick(i)));
      stopMenu = menuKeepingRun(pick);
      setSimTarget({ kind: 'chord', id: STRUM[0] });
    } else if (view === 'boss') {
      setLayers(DRUMS_ONLY, 1.5);
      ticks = null;
      $('#cue', root).hidden = true;
      hideSheet();
      scene.aim(STORM);
      banner(L('The Mute', 'Die Stille'), 2200);
      strip.className = 'night-strip night-boss';
      strip.innerHTML = `<svg id="bbox" viewBox="0 0 230 200" role="img" aria-label="${L('Chord diagram', 'Griffbild')}"></svg><div><h2 id="bh1" aria-live="polite"></h2><p class="tip" id="btip"></p><div class="tiles" id="btiles" role="list" aria-label="${L('Result for each string', 'Ergebnis für jede Saite')}"></div></div><button class="hb" id="giveup">${L('Leave the Mute', 'Die Stille verlassen')} <kbd>G</kbd></button>`;
      $('#giveup', root).onclick = () => g.bossGiveUp();
      drawBoss();
    } else if (view === 'between') {
      nextWave();
    } else {
      // over or won: the results are kept at once, the picture gets a moment to end
      settle();
      scene.end(g.state === 'won');
      band?.stop(3);
      band = null;
      ticks = null;
      $('#cue', root).hidden = true;
      banner(g.state === 'won' ? L('The light held', 'Das Licht hat gehalten') : L('The light is out', 'Das Licht ist aus'), 4000);
      closing = window.setTimeout(debrief, 2600);
    }
  }

  /** The first wave is the explanation: one line, until the player has struck twice. */
  function showCue(): void {
    const cue = $('#cue', root);
    cue.textContent = L('Play the chord on a piece to strike it.', 'Spiel den Akkord eines Teils, um es zu treffen.');
    cue.hidden = cueHits >= 2;
  }

  function choose(id: string): void {
    g.choosePerk(id);
    if (g.state === 'between') layout();
  }

  /** The next wave: at a new tempo the band is made again and counted in; at the same tempo it plays on. */
  function nextWave(): void {
    const now = engine.now();
    const beat = 60 / g.bpm;
    const bar = music.beatsPerBar * beat;
    let T1: number;
    if (g.bpm !== bandBpm) {
      makeBand(g.bpm);
      T1 = now + 0.4 + bar;
      ticks = { t0: T1 - bar, beat, bar: music.beatsPerBar, until: clickAlong ? Infinity : T1 - 1e-3 };
      ticked = -Infinity;
      playBand(T1, gainsOf(g.level));
    } else {
      // on the next bar line of the band that plays on
      T1 = bandAt + Math.ceil((now + 0.6 - bandAt) / bar) * bar;
      setLayers(gainsOf(g.level), 0.6);
      ticks = clickAlong ? { t0: T1 - bar, beat, bar: music.beatsPerBar, until: Infinity } : null;
      ticked = -Infinity;
    }
    g.startWave(T1);
    if (tempoNote) {
      banner(tempoNote, 2600);
      tempoNote = '';
    } else banner(L(`Wave ${g.wave}`, `Welle ${g.wave}`));
    layout();
  }

  /** The upgrade cards listen through the run's own connection to the listener, once the guitar is quiet. */
  function menuKeepingRun(pick: (i: number) => void): () => void {
    const l = engine.listener;
    if (!l || !menuOn()) return () => undefined;
    const gate2 = armed(root, pick, false);
    l.chordCandidates = STRUM;
    menuStrum = (id, score, margin) => {
      const i = STRUM.indexOf(id);
      gate2.heard(i >= 0 && score > 0.8 && margin > 0.12 ? i : -1);
    };
    return () => {
      gate2.stop();
      menuStrum = null;
    };
  }

  // ───────────────────────── the strip under the picture

  let stripShown = '';
  let tabCur = -2;
  let tabX: ((u: number) => number) | null = null;
  function drawStrip(full = false): void {
    if (view === 'boss') return;
    const now = engine.now();
    const nx = g.state === 'playing' ? g.next(now) : null;
    const nextChord = nx?.chord ?? (g.state === 'ready' ? runChords[0] : '');
    // a chord's shape is shown while it is still new to the hand: below level 2 of the chord check
    const showShape = !!nextChord && store.skills.level('chord:' + shapeOf(nextChord).id) < 2;
    const key = `${g.level}:${g.chain}:${showShape ? nextChord : ''}`;
    if (!full && key === stripShown) return;
    if (full || !strip.classList.contains('night-strip') || strip.classList.contains('night-boss')) {
      strip.className = 'night-strip';
      strip.innerHTML = `<div class="night-layers" id="layers"></div><div class="night-tab"><svg id="tab" role="img" aria-label="${L('The chords of the groove as tab, read left to right; the line shows where the band is', 'Die Akkorde des Grooves als Tabulatur, von links nach rechts gelesen; der Strich zeigt, wo die Band ist')}"></svg></div><div class="night-next" id="next"></div>`;
      tabCur = -2;
      drawTab(0);
    }
    stripShown = key;
    const lv = g.level;
    const goal = LAYER_AT[Math.min(LAYER_AT.length - 1, lv + 1)];
    $('#layers', root).innerHTML = `${LAYER_NAMES.map((n, i) => `<div class="night-row${i <= lv ? ' on' : ''}"><i></i>${LAYER_LABEL[n]()}</div>`).join('')}<div class="night-chain">${L(`Chain ${g.chain}`, `Kette ${g.chain}`)}</div><div class="night-meter" aria-hidden="true">${Array.from({ length: LAYER_AT[LAYER_AT.length - 1] }, (_, i) => `<i class="${i < g.chain ? 'on' : i < goal ? 'to' : ''}"></i>`).join('')}</div>`;
    $('#next', root).innerHTML = showShape ? `<svg viewBox="0 0 120 132" role="img" aria-label="${L(`Chord diagram of ${chordName(nextChord)}`, `Griffbild von ${chordName(nextChord)}`)}">${chordBox(shapeOf(nextChord), 18, 26, 86, NF, true, undefined, 19)}</svg><b>${chordName(nextChord)}</b>` : '';
  }

  /** The groove as tab, with the strum the band is on marked; drawn again only when that strum changes. */
  function drawTab(u: number): void {
    const svg = root.querySelector<SVGSVGElement>('#tab');
    if (!svg) return;
    let n = 0;
    let cur = -1;
    let at = 0;
    for (const b of music.bars) {
      const t = noteTimes(b.notes);
      t.at.forEach((x) => {
        if (u >= at + x - 1e-6) cur = n;
        n++;
      });
      at += Math.max(music.beatsPerBar * music.unitsPerBeat, t.total);
    }
    if (cur === tabCur) {
      if (tabX) playhead(svg, u < 0 ? null : tabX(u));
      return;
    }
    tabCur = cur;
    const d = tabLine({ bars: music.bars, look: (i) => (i === cur ? 'cur' : 'up'), name: (id) => chordName(id) }, NF);
    svg.setAttribute('viewBox', `0 0 1180 ${d.height}`);
    svg.innerHTML = d.svg;
    tabX = d.x;
    playhead(svg, u < 0 ? null : d.x(u));
  }

  function hud(): void {
    $('#ttl', root).textContent = `${title} · ${L(`Wave ${Math.max(1, g.wave)} of ${g.waves}`, `Welle ${Math.max(1, g.wave)} von ${g.waves}`)}`;
    $('#score', root).textContent = num(g.score);
    $('#mult', root).textContent = '×' + g.mult;
    const lamp = $('#lamp', root);
    if (lamp.childElementCount !== g.maxIntegrity || lamp.querySelectorAll('.f').length !== Math.max(0, g.integrity)) {
      lamp.innerHTML = Array.from({ length: g.maxIntegrity }, (_, i) => `<i class="${i < g.integrity ? 'f' : ''}"></i>`).join('');
      lamp.setAttribute('aria-label', L(`Lamp: ${Math.max(0, g.integrity)} of ${g.maxIntegrity} lights`, `Lampe: ${Math.max(0, g.integrity)} von ${g.maxIntegrity} Lichtern`));
    }
  }

  // ───────────────────────── the Mute

  function drawBoss(): void {
    const b = g.boss;
    if (!b || view !== 'boss' || !b.chord) return;
    const n = b.steps.length;
    const at = Math.min(b.at, n - 1);
    const st = b.steps[at];
    const lastRes = b.results[b.at];
    const failed = lastRes && lastRes !== 'clean';
    const chord = CHORDS[b.chord];
    const marks = chord.frets.map((f, i) => {
      const k = b.steps.findIndex((x) => x.string === i);
      return f < 0 ? null : k === b.at ? 'now' : b.results[k];
    });
    $('#bbox', root).innerHTML = chordBox(chord, 60, 30, 110, NF, false, marks, 29);
    $('#bh1', root).innerHTML = failed
      ? L(`${st.label} ${lastRes === 'muted' ? 'is muted' : lastRes === 'buzz' ? 'buzzes' : 'was not it'}. Pluck the <em>${STRING_FULL[st.string!]} string</em> again.`, `${lastRes === 'muted' ? `Die ${st.label}-Saite ist abgedämpft` : lastRes === 'buzz' ? `Die ${st.label}-Saite schnarrt` : `Das war nicht die ${st.label}-Saite`}. Zupf die <em>${stringName(st.string!)}</em> noch einmal.`)
      : L(`Hold ${chord.name}. Pluck the <em>${STRING_FULL[st.string!]} string</em>.`, `Halte ${chord.name}. Zupf die <em>${stringName(st.string!)}</em>.`);
    $('#btip', root).textContent = bossTip;
    const DE: Record<string, string> = { clean: 'sauber', muted: 'abgedämpft', buzz: 'schnarrt', wrong: 'falsch', now: 'jetzt', next: 'danach' };
    $('#btiles', root).innerHTML = b.steps
      .map((x, i) => {
        const r = b.results[i];
        const word = r ?? (i === b.at ? 'now' : 'next');
        return `<div class="tile ${r ?? ''}${i === b.at ? ' now' : ''}" role="listitem"${i === b.at ? ' aria-current="true"' : ''}><b>${x.label}</b><span>${L(word, DE[word])}</span></div>`;
      })
      .join('');
    if (g.state !== 'boss') {
      $('#bh1', root).textContent = L('Every seal is down.', 'Alle Siegel sind gebrochen.');
      $('#btip', root).textContent = '';
      setSimTarget(null);
      return;
    }
    setSimTarget({ kind: 'note', midi: st.midi, string: st.string });
    engine.listener?.startStringCheck(st.midi);
  }

  // ───────────────────────── the end

  function settle(): void {
    const now = Date.now();
    for (const m of [...g.leftovers(), ...g.measurements().filter((x) => x.key.startsWith('chord:'))]) {
      const ch = store.skills.record(m.key, m.value, now, m.strings);
      if (ch.after > ch.before) ups.push(L(`${skillLabel(m.key)}: level ${ch.after}.`, `${skillLabel(m.key)}: Stufe ${ch.after}.`));
    }
    store.runs.push({ t: now, type: night ? 'night' : 'changes', score: g.score, wave: g.wave, waves: g.waves, rows: g.rows() });
    if (!night) store.best.changes = Math.max(store.best.changes ?? 0, g.score);
    store.speeds.groove = g.bpm;
    // where the strums fell tells how late this microphone and these speakers are: kept for the next run
    if (engine.micOn && g.offsets.length >= 8) store.settings.latency = Math.max(0, Math.min(0.35, g.lat));
    const best = night ? noteNight(store.progress, today, { score: g.score, level: g.bestLevel, held: g.state === 'won' }).best : false;
    summary = { score: g.score, best };
    store.save();
  }

  /** One sentence, three gains as sentences, and the way on; the table behind "Details". */
  function debrief(): void {
    if (debriefed || !summary) return;
    debriefed = true;
    clearTimeout(closing);
    scene.over = null;
    setSimTarget(null);
    const won = g.state === 'won';
    const minutes = Math.max(1, Math.round((Date.now() - began) / 60000));
    const head = won ? L(`The light held: ${num(g.score)} points.`, `Das Licht hat gehalten: ${num(g.score)} Punkte.`) : L(`The light went out in wave ${g.wave}: ${num(g.score)} points.`, `Das Licht ging in Welle ${g.wave} aus: ${num(g.score)} Punkte.`);
    const gains: string[] = [];
    if (ups.length) gains.push(ups[0]);
    if (summary.best && (nightLog(store.progress, today, 1)[0]?.tries ?? 0) > 1) gains.push(L('Your best night today.', 'Deine beste Nacht heute.'));
    gains.push(
      g.bestLevel >= 3
        ? L('The whole band played with you.', 'Die ganze Band hat mit dir gespielt.')
        : g.bestLevel === 2
          ? L('Bass and organ came in; the fiddle comes at a chain of 16.', 'Bass und Orgel kamen dazu; die Geige kommt bei einer Kette von 16.')
          : g.bestLevel === 1
            ? L('The bass came in; the organ comes at a chain of 8.', 'Der Bass kam dazu; die Orgel kommt bei einer Kette von 8.')
            : L('Four clean hits in a row bring in the bass.', 'Vier saubere Treffer in Folge holen den Bass dazu.'),
    );
    let fastest: { label: string; v: number } | null = null;
    for (const [, s] of g.pairs) for (const v of s.values) if (!fastest || v > fastest.v) fastest = { label: s.label, v };
    if (fastest) gains.push(L(`Your quickest change: ${fastest.label}, ${Math.round(fastest.v)} a minute.`, `Dein schnellster Wechsel: ${fastest.label}, ${Math.round(fastest.v)} pro Minute.`));
    if (g.hits) gains.push(L(`${g.inTime} of ${g.hits} hits on the beat.`, `${g.inTime} von ${g.hits} Treffern im Takt.`));
    const b = g.boss;
    if (b && b.startT >= 0) gains.push(L(`The Mute: ${b.results.filter((r) => r === 'clean').length} of ${b.steps.length} strings clean.`, `Die Stille: ${b.results.filter((r) => r === 'clean').length} von ${b.steps.length} Saiten sauber.`));
    gains.push(g.settled ? L(`Settled at ${g.bpm} beats a minute.`, `Angekommen bei ${g.bpm} Schlägen pro Minute.`) : L(`Next time at ${g.bpm} beats a minute.`, `Nächstes Mal bei ${g.bpm} Schlägen pro Minute.`));
    const rows = g.rows();
    const log = night ? nightLog(store.progress, today, 7) : [];
    const level = (n: number): string => [L('drums', 'Schlagzeug'), L('bass', 'Bass'), L('organ', 'Orgel'), L('fiddle', 'Geige')][Math.max(0, Math.min(3, n))];
    sheet.hidden = false;
    sheet.className = 'night-sheet night-end';
    sheet.innerHTML = `<p class="kick">${esc(title)}${rule ? ` · ${esc(rule.name)}` : ''} · ${minutes} min</p>
      <h1>${head}</h1>
      <ul class="night-gains">${gains
        .slice(0, 3)
        .map((x) => `<li>${esc(x)}</li>`)
        .join('')}</ul>
      <div class="row">${ctx ? `<button class="btn primary" id="onward">${L('Next step', 'Weiter')} <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn" id="rerun">${L('Again', 'Nochmal')}</button>` : `<button class="btn primary" id="rerun">${L('Again', 'Nochmal')} <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn" id="onward">${L('Go on', 'Weiter')}</button>`}</div>
      <details class="night-more"><summary>${L('Details', 'Details')}</summary>
        <table><thead><tr><th>${L('Change', 'Wechsel')}</th><th>${L('Level', 'Stufe')}</th><th class="n">${L('Heard', 'Gehört')}</th><th class="n">${L('Clean', 'Sauber')}</th><th class="n">${L('Avg s per change', 'Schnitt s pro Wechsel')}</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${pips(store.skills.level(r.key))}</td><td class="n">${r.sent}</td><td class="n">${r.cleared}</td><td class="n">${r.avg ? tenths(r.avg) + ' s' : '–'}</td></tr>`).join('')}
        ${b ? `<tr><td>${L('The Mute', 'Die Stille')} · ${esc(b.name)}</td><td>${pips(store.skills.level(b.key))}</td><td class="n">1</td><td class="n">${L(`${b.results.filter((r) => r === 'clean').length} of ${b.steps.length} strings`, `${b.results.filter((r) => r === 'clean').length} von ${b.steps.length} Saiten`)}</td><td class="n">${b.endT >= 0 ? tenths(b.endT - b.startT) + ' s' : '–'}</td></tr>` : ''}
        </tbody></table>
        ${log.length ? `<table class="night-log"><thead><tr><th>${L('Night', 'Nacht')}</th><th>${L('Rule', 'Regel')}</th><th class="n">${L('Best', 'Bestwert')}</th><th class="n">${L('Tries', 'Versuche')}</th><th>${L('Band', 'Band')}</th></tr></thead><tbody>${log.map((e) => `<tr><td>${esc(nightDate(e.day, lang()))}</td><td>${esc(nightRule(e.day).name)}</td><td class="n">${num(e.best)}</td><td class="n">${e.tries}</td><td>${esc(level(e.level))}${e.held ? ' · ✓' : ''}</td></tr>`).join('')}</tbody></table>` : ''}
      </details>`;
    $('#pause', root).hidden = true;
    // the strip has done its work: the picture and the sheet are what is left
    strip.hidden = true;
    $('#rerun', root).onclick = rerun;
    $('#onward', root).onclick = onward;
    $('#cue', root).hidden = true;
  }

  function onward(): void {
    if (ctx) ctx.next();
    else go('/nf');
  }

  function rerun(): void {
    dispose();
    restarted = grooveRun(root, ctx, { ...o, again: true });
  }

  // ───────────────────────── what happens, as it happens

  function onEvent(e: GrooveEvent, now: number): void {
    if (e.type === 'strike') {
      scene.fire(e.id, now - heardLag(), e.at, e.inTime);
      chimeAt(e.inTime ? 'clear' : 'hit', e.at);
      cueHits++;
      if (cueHits >= 2) $('#cue', root).hidden = true;
    } else if (e.type === 'miss') scene.missed();
    else if (e.type === 'land') {
      scene.reached(e.id);
      engine.chime('blow', store.settings.chimes);
    } else if (e.type === 'layers') {
      if (view === 'playing') setLayers(gainsOf(e.level), fadeFor(e.before, e.level));
      if (e.level > e.before) scene.swelled();
    } else if (e.type === 'measure') {
      const ch = store.skills.record(e.key, e.value, Date.now());
      if (ch.after > ch.before) {
        ups.push(L(`${skillLabel(e.key)}: level ${ch.after}.`, `${skillLabel(e.key)}: Stufe ${ch.after}.`));
        store.save();
        banner(L(`${skillLabel(e.key)} · level ${ch.after}`, `${skillLabel(e.key)} · Stufe ${ch.after}`), 2600);
      }
    } else if (e.type === 'bell') {
      scene.rang(e.id);
      engine.chime('step', store.settings.chimes);
    } else if (e.type === 'tempo') {
      // said when the next wave starts: once, when it has settled, and whenever it moves
      tempoNote = e.settled ? L(`Settled: ${e.bpm} bpm`, `Angekommen: ${e.bpm} bpm`) : e.bpm !== e.before ? L(`Tempo ${e.bpm} bpm`, `Tempo ${e.bpm} bpm`) : '';
    }
  }

  /** How far each piece has come as the picture shows it: a surge on every beat, a rest between. */
  const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3);
  function pieces(clock: number, now: number): GroovePiece[] {
    const nx = g.state === 'playing' ? g.next(now) : null;
    return g.pieces
      .filter((p) => p.state !== 'landed')
      .map((p) => {
        const b = Math.max(0, (clock - p.born) / g.beat);
        const total = p.travel / g.beat;
        const drawn = calm() ? b / total : (Math.floor(b) + easeOut(b - Math.floor(b))) / total;
        return { id: p.id, name: chordName(p.chord), lane: p.lane, p: Math.max(0, Math.min(1, drawn)), next: p === nx };
      });
  }

  function frame(ts: number): void {
    raf = requestAnimationFrame(frame);
    const backdrop = gate === 'ready' || debriefed;
    if (backdrop && !backdropDue(ts)) return;
    scene.measure();
    if (backdrop) {
      scene.draw(null, ts / 1000, false);
      return;
    }
    const now = engine.now();
    if (!paused) g.update(now);
    if (gesture.due(engine.listener?.time ?? 0)) setPaused(!paused);
    for (const e of g.events.splice(0)) onEvent(e, now);
    if (g.state !== view && !summary) layout();
    if (!paused) scheduleTicks(now);
    const clock = paused ? pausedAt - heardLag() : now - heardLag();
    const beatNow = (clock - g.t0) / g.beat;
    // the count before the first wave: its numbers, as the clicks fall; then the wave is on
    if (mid.dataset.gate === 'count') {
      const count = music.beatsPerBar >= 3 ? music.beatsPerBar : 2 * music.beatsPerBar;
      const c = Math.ceil(-beatNow);
      const el = $('#banner', root);
      if (beatNow >= 0 || view !== 'playing') {
        mid.dataset.gate = 'go';
        el.hidden = true;
      } else if (c >= 1 && c <= count) {
        el.hidden = false;
        el.classList.add('count');
        el.textContent = String(count + 1 - c);
      }
    }
    const nx = view === 'playing' ? g.next(now) : null;
    if (view === 'playing') setSimTarget(nx ? { kind: 'chord', id: nx.chord } : null);
    canvas.dataset.next = nx?.chord ?? '';
    canvas.dataset.level = String(g.level);
    canvas.dataset.pieces = String(g.drifting().length);
    canvas.dataset.near = nx ? g.progress(nx, now).toFixed(3) : '';
    scene.drawGroove({ clock, phase: beatNow < 0 ? -1 : beatNow - Math.floor(beatNow), pieces: view === 'boss' ? [] : pieces(clock, now), level: g.level, integrity: Math.max(0, g.integrity), maxIntegrity: g.maxIntegrity, boss: view === 'boss' || (g.boss && summary) ? g.boss : null }, ts / 1000);
    if (view === 'playing') {
      drawStrip();
      // where the band is in its loop, read on the tab line
      // before the band begins (the count) nothing is marked yet
      const from = parts ? bandAt : g.t0;
      const per = unitSecs(parts ? bandBpm : g.bpm);
      if (!paused) drawTab(clock < from ? -1 : (((clock - from) / per) % music.units + music.units) % music.units);
    }
    hud();
  }
  const backdropDue = slowly();

  /** A pause stops the band; it plays on from where it was, and so does everything on the water. */
  function setPaused(v: boolean): void {
    if (summary || view !== 'playing' || gate !== 'go' || v === paused) return;
    paused = v;
    const now = engine.now();
    if (v) {
      pausedAt = now;
      band?.stop(0.3);
      band = null;
      engine.clearTicks();
      ticked = -Infinity;
    } else {
      const shift = now - pausedAt;
      g.resumed(shift);
      bandAt += shift;
      if (ticks) ticks = { ...ticks, t0: ticks.t0 + shift, until: ticks.until + shift };
      playFrom = now;
      if (parts) band = engine.playBand(bandAt, parts, gainsOf(g.level), { loop: true, volume: store.settings.bandVolume });
      pausedAt = -1;
    }
    const b = $('#pause', root);
    b.setAttribute('aria-pressed', String(v));
    $('span', b).textContent = v ? L('Resume', 'Weiter') : L('Pause', 'Pause');
    if (v) banner(mutePause ? L('Paused · Space or two muted hits', 'Pausiert · Leertaste oder zwei gedämpfte Anschläge') : L('Paused', 'Pausiert'), 1e9);
    else $('#banner', root).hidden = true;
  }

  // ───────────────────────── listening

  const sure = (e: { best: string | null; score: number; margin: number }): boolean => !!e.best && e.score > 0.6 && e.margin > 0.08;
  const stopHear = hear(
    root,
    {
      onChord: (e) => {
        if (gate === 'ready') {
          if (menuOn() && e.best && e.score > 0.7 && e.margin > 0.1 && runChords.includes(e.best)) begin();
          return;
        }
        if (sure(e)) gesture.played(e.time);
        if (view === 'perk') {
          if (e.best) menuStrum?.(e.best, e.score, e.margin);
          return;
        }
        if (paused || view !== 'playing' || e.time < playFrom) return;
        const now = engine.now();
        // the chord a piece wears is given when the strum fits it, the likeliest first; otherwise what was heard for sure
        const fits = g
          .drifting()
          .map((p) => p.chord)
          .filter((c) => strumIs(e, c))
          .sort((a, b) => (e.sims[b] ?? 0) - (e.sims[a] ?? 0));
        if (fits.length) g.chord(fits[0], e.time, now);
        else if (sure(e)) g.chord(e.best!, e.time, now);
      },
      onString: (e) => {
        const b = g.boss;
        if (view !== 'boss' || !b || g.state !== 'boss') return;
        const st = b.steps[b.at];
        if (e.result === 'clean') learnRing(e.ring);
        const due = b.at;
        g.bossString(e.result, e.time);
        scene.seal(due, e.result === 'clean');
        if (e.result === 'clean') engine.chime((g.state as string) === 'won' ? 'win' : 'clear', store.settings.chimes);
        bossTip = e.result === 'clean' ? '' : b.chord ? stringTip(b.chord, st.string!, e.result, e.heard) + (e.heard !== null && e.result === 'wrong' ? L(` (${noteName(e.heard)} heard)`, ` (${noteName(e.heard)} gehört)`) : '') : '';
        drawBoss();
      },
      ...(mutePause
        ? {
            onThud: (e) => {
              if (view === 'playing' && gate === 'go') gesture.thud(e.time, e.hit);
            },
            onOnset: (e) => {
              if (gate === 'go') gesture.onset(e.time);
            },
          }
        : {}),
    },
    (l) => {
      l.noteDetection = false;
      l.chordCandidates = runChords;
    },
  );
  const stopKeys = keys({
    ' ': () => (debriefed ? (ctx ? onward() : rerun()) : summary ? debrief() : gate === 'ready' ? begin() : setPaused(!paused)),
    g: () => g.bossGiveUp(),
    '1': () => g.state === 'perk' && g.offered[0] && choose(g.offered[0].id),
    '2': () => g.state === 'perk' && g.offered[1] && choose(g.offered[1].id),
    '3': () => g.state === 'perk' && g.offered[2] && choose(g.offered[2].id),
  });
  $('#pause', root).onclick = () => setPaused(!paused);
  if (ctx) $('#skipstep', root).onclick = ctx.next;

  function dispose(): void {
    cancelAnimationFrame(raf);
    clearTimeout(bannerTimer);
    clearTimeout(closing);
    band?.stop(0.4);
    band = null;
    ticks = null;
    engine.clearTicks();
    stopMenu();
    stopHear();
    stopKeys();
    setSimTarget(null);
  }

  ready();
  if (o.again) begin();
  raf = requestAnimationFrame(frame);
  return () => {
    if (restarted) restarted();
    else dispose();
  };
}

/**
 * Tonight's night, as a page of its own (#/night) and as the last step of a session (the encore), which gives
 * it a SessionCtx: then "Next step" goes on to the session's end. The night is played on the guitar; the piano
 * and the voice get their own run instead.
 */
export const nightRun: Screen = (root, params, ctx) => {
  if (store.settings.instrument === 'voice') return nfRun(root, ['sing'], ctx);
  if (store.settings.instrument === 'piano') return nfRun(root, ['kchanges'], ctx);
  return grooveRun(root, ctx, { night: true, again: params[0] === 'again' });
};
