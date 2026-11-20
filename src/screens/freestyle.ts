/**
 * Freestyle: a solo of the player's own over the band, scored like a skate run. Nothing is shown to be played.
 * Whatever the guitar does is named as a trick the moment it is heard; different tricks in one line multiply;
 * the line is banked by ending it on the root and letting it ring, and lost when the beat falls apart. A banked
 * line rises into the sky and stays there as a curtain of light, so that a run paints the aurora. The rules are in
 * game/freestyle.ts; this page hears the guitar, plays the band and paints.
 *
 * What the listener is trusted with (measured on recordings, tests/real/freebench.ts): single notes, named right
 * in 95 to 100 of 100; hits on muted strings; and a strummed chord of the groove, told from a single note by the
 * rule in strumOf (game/freestyle.ts): no single note was taken for a strum, about a third of real strums are
 * caught. A strum that is not caught is never counted against the player. Hammer-ons and pull-offs are told by
 * their speed only.
 *
 * #/free/<spot>/<seconds>: the spot (game/freestyle.ts SPOTS) and, for the browser checks, a shorter run.
 */
import type { ChordEvent, NoteEvent } from '../audio/listener';
import { engine } from '../audio/engine';
import { renderBand, type BandHandle, type BandMode, type BandParts, type LayerGains } from '../audio/band';
import { resample } from '../audio/wav';
import { L, num } from '../core/i18n';
import { store, type Lick } from '../core/store';
import { loadTake, saveTake, TAKE_RATE } from '../core/takes';
import { Freestyle, NOTE_CONF, RUN_SECONDS, SPOTS, spotOf, STRUM_SCORE, strumOf, sureNote, worth, type FreeEvent, type FreeNews, type Landed, type Line, type Spot, type Trick } from '../game/freestyle';
import { FADE_IN, FADE_OUT } from '../game/groove';
import { chordName } from '../music/theory';
import { guitarA4 } from '../music/tuning';
import { $, esc, hear, keys, micMeter, type Screen } from '../ui/dom';
import { setSimTarget } from '../ui/practice';
import { Watch } from '../ui/watch';
import { slowly } from './runkit';

export const trickName = (t: Trick): string =>
  ({
    arpeggio: L('Arpeggio', 'Arpeggio'),
    run: L('Run', 'Lauf'),
    skip: L('String skip', 'Saitensprung'),
    octave: L('Octave', 'Oktave'),
    stutter: L('Stutter', 'Stotterer'),
    double: L('Double time', 'Doppeltempo'),
    push: L('Push', 'Push'),
    span: L('Low to high', 'Tief bis hoch'),
    chk: L('Chk', 'Chk'),
    stab: L('Stab', 'Akkordschlag'),
    hammer: L('Hammer-on', 'Hammer-on'),
    pull: L('Pull-off', 'Pull-off'),
  })[t];

const spotName = (s: Spot): string => (s.id === 'harbour' ? L('Harbour at night', 'Hafen bei Nacht') : L('Night coast', 'Nachtküste'));
const keyName = (s: Spot): string => (s.root === 7 ? L('G major', 'G-Dur') : L('E minor', 'E-Moll'));
const rootName = (s: Spot): string => (s.root === 7 ? 'G' : 'E');
const goalText = (s: Spot, i: number): string =>
  [L(`${num(s.goalScore)} points in a run`, `${num(s.goalScore)} Punkte in einer Runde`), L(`A line of ${s.goalTricks} different tricks`, `Eine Linie aus ${s.goalTricks} verschiedenen Tricks`), L('Low E to high e in one line', 'Tiefe E- bis hohe e-Saite in einer Linie')][i];
const bestKey = (s: Spot): string => `free:${s.id}`;
const goalKey = (s: Spot, i: number): string => `free:goal:${s.id}:${i}`;

/* ───────────────────────── tab and box as SVG (the strip at the bottom, and the end) */

const INK = '#26262e';
const FAINT = '#8d8791';
const RULE = '#cdbfae';
const AMBER = '#b9792a';
const NOW = '#1e6aa8';
const PAPER = '#fcf8f2';

interface TabItem {
  kind: 'note' | 'chk' | 'stab';
  s?: number;
  f?: number;
  slur?: boolean;
  chord?: string;
  /** pulled off rather than hammered on */
  down?: boolean;
}
const CHORD_TAB: Record<string, number[]> = { Em: [0, 2, 2, 0, 0, 0], G: [3, 2, 0, 0, 0, 3], D: [-1, -1, 0, 2, 3, 2], C: [-1, 3, 2, 0, 1, 0], Am: [-1, 0, 2, 2, 1, 0] };

/** The last things played as tab, read left to right; the high e string on top. */
export function tabSvg(items: TabItem[], ink = INK): string {
  const y = (s: number): number => 99 - s * 15.4;
  const COL = 37;
  let h = `<g stroke="${RULE}" stroke-width="1.5">${[0, 1, 2, 3, 4, 5].map((s) => `<line x1="34" x2="892" y1="${y(s)}" y2="${y(s)}"/>`).join('')}</g>`;
  h += `<g font-family="IBM Plex Sans, sans-serif" font-weight="700" text-anchor="middle"><text x="16" y="48" font-size="13" fill="${FAINT}">T</text><text x="16" y="65" font-size="13" fill="${FAINT}">A</text><text x="16" y="82" font-size="13" fill="${FAINT}">B</text>`;
  const fret = (x: number, s: number, f: number): string => `<rect x="${x - 10}" y="${y(s) - 10}" width="20" height="20" fill="${PAPER}"/><text x="${x}" y="${y(s) + 7}" font-size="19" fill="${ink}">${f}</text>`;
  items.slice(-23).forEach((e, i) => {
    const x = 58 + i * COL;
    if (e.kind === 'chk') h += [2, 3].map((s) => `<rect x="${x - 8}" y="${y(s) - 9}" width="16" height="18" fill="${PAPER}"/><text x="${x}" y="${y(s) + 6}" font-size="16" fill="${FAINT}">×</text>`).join('');
    else if (e.kind === 'stab') h += (CHORD_TAB[e.chord ?? ''] ?? []).map((f, s) => (f < 0 ? '' : fret(x, s, f))).join('') + `<text x="${x}" y="10" font-size="11.5" fill="${AMBER}">${esc(chordName(e.chord ?? ''))}</text>`;
    else if (e.s !== undefined && e.f !== undefined) {
      h += fret(x, e.s, e.f);
      if (e.slur) h += `<text x="${x - COL / 2}" y="${y(e.s) - 5}" font-size="12" font-weight="500" fill="${AMBER}">${e.down ? 'p' : 'h'}</text>`;
    }
  });
  return h + '</g>';
}
const tabOf = (ev: FreeEvent[]): TabItem[] => ev.map((e) => ({ kind: e.kind, s: e.s, f: e.f, slur: e.slur, chord: e.chord, down: e.got.includes('pull') }));
const tabOfLick = (l: Lick): TabItem[] => l.notes.map((n) => ({ kind: n.kind, s: n.s, f: n.f, slur: n.slur, chord: n.chord }));

/** The box of the spot on the neck: the notes, the roots ringed, the one just played filled. */
export function boxSvg(spot: Spot, lit: string, scale = 1): string {
  const y = (s: number): number => 82 - s * 14;
  const fx = (f: number): number => (f === 0 ? 16 : 34 + (f - 0.5) * 30);
  let h = `<g stroke="#c9bdac" stroke-width="1.2">${[0, 1, 2, 3, 4, 5].map((s) => `<line x1="34" x2="154" y1="${y(s)}" y2="${y(s)}"/>`).join('')}${[1, 2, 3, 4].map((f) => `<line x1="${34 + f * 30}" x2="${34 + f * 30}" y1="${y(5)}" y2="${y(0)}"/>`).join('')}</g>`;
  h += `<line x1="34" x2="34" y1="${y(5)}" y2="${y(0)}" stroke="${INK}" stroke-width="3"/>`;
  for (const p of spot.box) {
    const on = lit === `${p.s}:${p.f}`;
    const root = p.m % 12 === spot.root;
    h += `<circle cx="${fx(p.f)}" cy="${y(p.s)}" r="${5.2 * scale}" fill="${on ? NOW : p.f ? '#cfc2b0' : PAPER}" stroke="${on ? NOW : root ? AMBER : '#b8ab98'}" stroke-width="${root ? 2.4 : 1.2}"/>`;
  }
  return h;
}

/* ───────────────────────── the page */

export const freestyle: Screen = (root, [spotParam, secsParam]) => {
  if (store.settings.instrument !== 'guitar') {
    root.innerHTML = `<div class="page mid"><div><p class="kick">${L('Freestyle', 'Freestyle')}</p><h1>${L('Freestyle is played on the guitar.', 'Freestyle wird auf der Gitarre gespielt.')}</h1><p class="lede">${L('Switch the instrument to the guitar in the settings to play it.', 'Stell in den Einstellungen die Gitarre als Instrument ein, um es zu spielen.')}</p></div><div class="row"><a class="btn primary" href="#/nf">${L('Games', 'Spiele')}</a></div></div>`;
    return;
  }
  let spot = spotOf(spotParam);
  const seconds = Math.max(10, Math.min(RUN_SECONDS, Number(secsParam) || RUN_SECONDS));
  const practice = store.settings.practiceInstrument;
  const bandMode = store.settings.band;

  let g = new Freestyle(spot, { seconds });
  let view: 'ready' | 'count' | 'play' | 'end' = 'ready';
  let paused = false;
  let pausedAt = 0;
  let raf = 0;
  /** the time the listener's demo plays: what the microphone hears meanwhile is the demo */
  let quietUntil = 0;

  const canvas = document.createElement('canvas');
  canvas.className = 'world';
  canvas.setAttribute('aria-hidden', 'true');
  const scene = new Watch(canvas, spot.hour);
  const sky = document.createElement('canvas');
  sky.className = 'free-sky';
  sky.setAttribute('role', 'img');
  sky.setAttribute('aria-label', L('Your line drawn across the night sky as a band of light, read left to right; the lines you landed hang above it.', 'Deine Linie als Lichtband über den Nachthimmel gezogen, von links nach rechts gelesen; die gelandeten Linien hängen darüber.'));
  const keyRow = (ks: string[]): string => ks.map((k) => `<kbd>${k}</kbd>`).join('');
  root.innerHTML = `<header class="hud night-hud free-hud">
      <div class="g"><a class="hb leave" href="#/nf">${L('‹ Games', '‹ Spiele')}</a><span class="night-title" id="ftitle"></span></div>
      <div class="g"></div>
      <div class="g">${micMeter()}<span class="free-stat"><span class="k">${L('Time', 'Zeit')}</span><b id="ftime"></b></span><span class="free-stat"><span class="k">${L('Score', 'Punkte')}</span><b id="fscore">0</b></span><span class="free-layers" id="flayers" aria-label="${L('The band', 'Die Band')}">${(['drums', 'bass', 'keys', 'lead'] as const).map((l) => `<span><i></i>${{ drums: L('drums', 'Drums'), bass: L('bass', 'Bass'), keys: L('keys', 'Keys'), lead: L('lead', 'Lead') }[l]}</span>`).join('')}</span><button class="hb" id="fpause" hidden><span>${L('Pause', 'Pause')}</span><kbd>${L('Space', 'Leertaste')}</kbd></button></div>
    </header>
    <div id="mid" class="night-mid"><div class="arena night-sea free-sea" id="arena">
      <div class="banner" id="banner" hidden></div>
      <div class="free-combo" id="combo" hidden><p class="free-tricks"><span id="ftricks"></span><b id="fmult"></b><span id="fpts"></span></p><p class="free-pocket" id="fpocket">${L('pocket', 'Groove')}<span class="bar"><i id="fneedle"></i></span></p></div>
      <div class="night-sheet free-sheet" id="sheet" hidden></div>
    </div></div>
    <footer class="free-strip" id="strip">
      <div class="free-tab"><span class="k" id="ftabcap"></span><svg id="ftab" viewBox="0 0 900 110" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${L('Your line as tab', 'Deine Linie als Tab')}"></svg></div>
      <div class="free-box"><svg id="fbox" viewBox="0 0 160 92" role="img"></svg><span class="k" id="fland"></span></div>
      <div class="free-goals" id="fgoals"></div>
    </footer>
    ${practice ? `<div class="practice free-practice" role="group" aria-label="${L('Practice instrument', 'Übungsinstrument')}"><span>${L('Practice instrument', 'Übungsinstrument')}</span><span>${keyRow(['A', 'S', 'D', 'F', 'G', 'H'])} ${L('open strings', 'leere Saiten')}</span><span><kbd>${L('Shift', 'Umschalt')}</kbd> + ${L('key: fretted', 'Taste: gegriffen')}</span><span><kbd>X</kbd> ${L('muted hit', 'gedämpfter Anschlag')}</span><span><kbd>J</kbd> ${L('strum', 'Akkord')}</span></div>` : ''}`;
  root.prepend(sky);
  root.prepend(canvas);
  const arena = $('#arena', root);
  const sheet = $('#sheet', root);
  scene.over = arena;
  setSimTarget(null);

  // ───────────────────────── the band and the beat

  let band: BandHandle | null = null;
  let parts: BandParts | null = null;
  let bandAt = 0;
  let clickAlong = bandMode === 'click';
  let ticks: { t0: number; until: number } | null = null;
  let ticked = -Infinity;
  let level = -1;

  function makeBand(): void {
    parts = null;
    clickAlong = bandMode === 'click';
    if (bandMode === 'click' || !engine.ctx) return;
    const units = spot.chords.length * 8;
    const clicks = Array.from({ length: units / 2 }, (_, k) => ({ u: 2 * k, accent: (2 * k) % 8 === 0 }));
    const mode: BandMode = bandMode === 'phones' ? 'phones' : 'speakers';
    try {
      // through speakers the band keeps off every eighth the player may play on: its pitched parts fall silent,
      // the drums above what the listener hears stay. Single notes over a band in the room were not measured.
      parts = renderBand({ chords: spot.chords.map((id, i) => ({ u: i * 8, id })), clicks, units, unit: g.eighth, sr: engine.ctx.sampleRate, a4: guitarA4(), mode, strums: mode === 'speakers' ? Array.from({ length: units }, (_, u) => u) : clicks.map((c) => c.u), feel: spot.feel, seed: (Math.random() * 1e6) | 0, loop: true });
      clickAlong = !parts.layers.drums.some((v) => v !== 0);
    } catch {
      parts = null;
      clickAlong = true;
    }
  }
  const gainsOf = (lv: number): LayerGains => ({ drums: 1, bass: lv >= 1 ? 1 : 0, keys: lv >= 2 ? 0.8 : 0, lead: lv >= 3 ? 0.6 : 0 });
  function setLevel(lv: number): void {
    if (lv === level) return;
    const ramp = lv < level ? FADE_OUT : FADE_IN;
    level = lv;
    $$layers().forEach((el, i) => el.classList.toggle('on', i <= lv));
    if (!band) return;
    const gains = gainsOf(lv);
    for (const l of ['drums', 'bass', 'keys', 'lead'] as const) band.setGain(l, gains[l] ?? 0, ramp);
  }
  const $$layers = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('#flayers > span')];
  function scheduleTicks(now: number): void {
    if (!ticks || store.settings.click <= 0) return;
    const { t0, until } = ticks;
    const beat = g.beat;
    let k = Math.ceil((Math.max(ticked + 1e-3, now - 0.02) - t0) / beat);
    for (; t0 + k * beat < Math.min(until, now + 0.6); k++) {
      ticked = t0 + k * beat;
      engine.tick(ticked, ((k % 4) + 4) % 4 === 0, store.settings.click, store.settings.clickSound === 'click');
    }
  }
  /** The player hears what was scheduled a moment ago: the picture follows the ear. */
  const heardLag = (): number => Math.max(0, Math.min(0.2, engine.ctx?.outputLatency ?? 0));

  // ───────────────────────── recording, to keep the best line

  let recFrom = 0;
  let rec: { samples: Float32Array; sampleRate: number } | null = null;
  const recording = (): boolean => engine.micOn && store.settings.recordTakes;
  /** the sound of a line, from the recording of the run: from a little before its first note to its ringing out */
  function soundOf(l: Line): Float32Array | null {
    if (!rec) return null;
    const from = Math.max(0, Math.round((l.start + g.lat - 0.3 - recFrom) * rec.sampleRate));
    const to = Math.min(rec.samples.length, Math.round((l.ev[l.ev.length - 1].t + g.lat + 1.4 - recFrom) * rec.sampleRate));
    return to - from > rec.sampleRate * 0.3 ? rec.samples.slice(from, to) : null;
  }
  function listen(samples: Float32Array, rate: number): void {
    const ctx = engine.ctx;
    if (!ctx) return;
    const s = rate === ctx.sampleRate ? samples : resample(samples, rate, ctx.sampleRate);
    quietUntil = engine.now() + engine.demo(s) + 0.4;
  }

  // ───────────────────────── before a run

  const title = (): string => `${L('Freestyle', 'Freestyle')} · ${spotName(spot)} · ${keyName(spot)}`;
  function ready(): void {
    view = 'ready';
    arena.dataset.view = 'ready';
    $('#fpause', root).hidden = true;
    $('#combo', root).hidden = true;
    $('#ftitle', root).textContent = title();
    $('#strip', root).hidden = true;
    sheet.hidden = false;
    sheet.id = 'brief';
    const best = store.best[bestKey(spot)] ?? 0;
    const bandSay =
      bandMode === 'phones'
        ? L('The full band plays: for headphones.', 'Die volle Band spielt: für Kopfhörer.')
        : bandMode === 'click'
          ? L('Only the click keeps the beat.', 'Nur der Klick hält den Takt.')
          : L('Through speakers the band keeps to the drums, so that your notes are heard. With headphones on, choose the full band in the settings.', 'Über Lautsprecher spielt die Band nur Schlagzeug, damit deine Töne zu hören sind. Mit Kopfhörern wähl in den Einstellungen die volle Band.');
    const licks = store.licks.slice(0, 3);
    sheet.innerHTML = `<p class="kick">${esc(title())} · ${spot.bpm} bpm</p>
      <h1>${L('A solo is a line of tricks. Land it, or lose it.', 'Ein Solo ist eine Linie aus Tricks. Lande sie, oder verlier sie.')}</h1>
      <div class="free-brief">
        <ol class="free-rules">
          <li>${L('Play anything from the box, on the beat. Every open string is in it.', 'Spiel irgendwas aus dem Kasten, im Takt. Jede leere Saite gehört dazu.')}</li>
          <li>${L('Whatever you do is named as a trick. Different tricks in one line multiply.', 'Was du tust, wird als Trick benannt. Verschiedene Tricks in einer Linie multiplizieren sich.')}</li>
          <li>${L(`End on ${rootName(spot)} and let it ring two beats: the line is banked. Lose the beat: it is lost.`, `Ende auf ${rootName(spot)} und lass es zwei Schläge klingen: Die Linie ist gesichert. Verlierst du den Takt, ist sie weg.`)}</li>
        </ol>
        <figure class="free-bigbox"><svg viewBox="0 0 160 92" role="img" aria-label="${L(`The notes of the box on the neck; the ${rootName(spot)}s ringed`, `Die Töne des Kastens auf dem Griffbrett; die ${rootName(spot)}s umrandet`)}">${boxSvg(spot, '', 1.15)}</svg><figcaption>${L(`frets 0 to 3 · ringed: ${rootName(spot)}`, `Bund 0 bis 3 · umrandet: ${rootName(spot)}`)}</figcaption></figure>
      </div>
      <div class="free-spots" role="group" aria-label="${L('Where to play', 'Wo du spielst')}">${SPOTS.map((s, i) => `<button class="free-spot" data-spot="${s.id}" aria-pressed="${s.id === spot.id}"><kbd>${i + 1}</kbd><b>${esc(spotName(s))}</b><span>${esc(keyName(s))} · ${s.bpm} bpm${store.best[bestKey(s)] ? ` · ${L('best', 'Bestwert')} ${num(store.best[bestKey(s)])}` : ''}</span></button>`).join('')}</div>
      <ul class="free-goallist">${[0, 1, 2].map((i) => `<li class="${store.progress[goalKey(spot, i)] ? 'done' : ''}">${esc(goalText(spot, i))}</li>`).join('')}</ul>
      ${licks.length ? `<div class="free-licks"><span class="k">${L('Your licks', 'Deine Licks')}</span>${licks.map((l, i) => `<button class="free-lick" data-lick="${i}" title="${L('Listen', 'Anhören')}"><svg viewBox="0 0 900 110" preserveAspectRatio="xMinYMid meet">${tabSvg(tabOfLick(l))}</svg><span>▶ ${num(l.total)}</span></button>`).join('')}</div>` : ''}
      <p class="note">${esc(bandSay)}</p>
      <div class="row"><button class="btn primary big" id="begin">${L('Start', 'Starten')} <kbd>${L('Space', 'Leertaste')}</kbd></button><span class="note">${L('or pluck a string', 'oder zupf eine Saite')}${best ? ` · ${L('best here', 'Bestwert hier')} ${num(best)}` : ''}</span></div>`;
    $('#begin', root).onclick = begin;
    sheet.querySelectorAll<HTMLButtonElement>('[data-spot]').forEach((b) => (b.onclick = () => choose(b.dataset.spot!)));
    sheet.querySelectorAll<HTMLButtonElement>('[data-lick]').forEach(
      (b) =>
        (b.onclick = async () => {
          const l = licks[Number(b.dataset.lick)];
          const s = l && (await loadTake('guitar', l.id, 'last'));
          if (s) listen(s, TAKE_RATE);
        }),
    );
    strip(null);
    hud(0);
  }
  function choose(id: string): void {
    if (view !== 'ready' || id === spot.id) return;
    spot = spotOf(id);
    g = new Freestyle(spot, { seconds });
    scene.aim(spot.hour);
    history.replaceState(null, '', `#/free/${spot.id}${secsParam ? '/' + secsParam : ''}`);
    ready();
  }

  /** The player is ready: the band is made, a bar is counted in, and the run begins on its first beat. */
  function begin(): void {
    if (view !== 'ready') return;
    view = 'count';
    arena.dataset.view = 'count';
    sheet.hidden = true;
    sheet.innerHTML = '';
    sheet.id = 'sheet';
    $('#strip', root).hidden = false;
    $('#fpause', root).hidden = false;
    $('#combo', root).hidden = false;
    g = new Freestyle(spot, { seconds, lat: engine.micOn ? engine.speakerLatency() : heardLag() });
    makeBand();
    const T0 = engine.now() + 0.4 + 4 * g.beat;
    ticks = { t0: T0 - 4 * g.beat, until: clickAlong ? Infinity : T0 - 1e-3 };
    ticked = -Infinity;
    level = -1;
    band?.stop(0.3);
    band = parts ? engine.playBand(T0, parts, gainsOf(0), { loop: true, volume: store.settings.bandVolume }) : null;
    bandAt = T0;
    setLevel(0);
    g.start(T0);
    lastLanded = null;
    lit = '';
    dirty = true;
    sky2.reset();
    pend.length = 0;
    rec = null;
    if (recording()) {
      engine.record(seconds + 30);
      recFrom = engine.now();
    }
  }

  // ───────────────────────── what is heard

  interface Pend {
    t: number;
    note?: NoteEvent;
    chord?: ChordEvent;
    done: boolean;
    took?: 'note' | 'stab';
  }
  const pend: Pend[] = [];
  const pendAt = (t: number): Pend => {
    let p = pend.find((x) => Math.abs(x.t - t) < 0.03);
    if (!p) pend.push((p = { t, done: false }));
    while (pend.length > 12) pend.shift();
    return p;
  };
  /** One onset is decided: a strum, a note, or nothing the game can be sure of. */
  function decide(p: Pend): void {
    if (p.done) return;
    p.done = true;
    if (view !== 'play' && view !== 'count') return;
    const stab = strumOf(p.note, p.chord, spot.chords);
    if (stab) {
      p.took = 'stab';
      g.stab(stab, p.t);
      return;
    }
    const n = p.note;
    if (!n || n.conf < NOTE_CONF) return;
    // something that sounded like a strum and was not caught as one is not held against the player
    const strummy = !!p.chord && p.chord.score >= STRUM_SCORE;
    p.took = 'note';
    g.note(n.midi, p.t, sureNote(n) && !strummy);
  }
  /** Onsets whose chord would have been reported by now are decided with what there is. */
  function flush(): void {
    const lt = engine.listener?.time ?? 0;
    for (const p of pend) if (!p.done && lt > p.t + 0.32) decide(p);
  }
  const deaf = (): boolean => engine.now() < quietUntil;

  const stopHear = hear(
    root,
    {
      onNote: (e) => {
        if (deaf() || paused) return;
        pendAt(e.time).note = e;
      },
      onChord: (e) => {
        if (deaf() || paused) return;
        const p = pendAt(e.time);
        p.chord = e;
        decide(p);
      },
      onThud: (e) => {
        if (!e.hit || deaf() || paused || (view !== 'play' && view !== 'count')) return;
        const p = pend.find((x) => Math.abs(x.t - e.time) < 0.03);
        if (p && !p.done) decide(p);
        if (p?.took) return;
        g.chk(e.time);
      },
      onOnset: () => {
        if (view === 'ready' && !deaf() && sheet.querySelector('#begin')) begin();
      },
    },
    (l) => {
      l.noteDetection = true;
      l.expected = spot.box.map((p) => p.m);
      l.chordCandidates = [...new Set(SPOTS.flatMap((s) => s.chords))];
    },
  );

  // ───────────────────────── what the rules say

  let lastLanded: Landed | null = null;
  let droppedAt = -Infinity;
  let lit = '';
  let dirty = true;
  function onNews(n: FreeNews, now: number): void {
    const vol = store.settings.chimes;
    if (n.type === 'played') {
      if (n.ev.kind === 'note') lit = `${n.ev.s}:${n.ev.f}`;
      dirty = true;
    } else if (n.type === 'trick') {
      sky2.label(trickName(n.trick), n.points, n.ev, n.i);
      if (n.i === 0) engine.chime('hit', vol * 0.7);
    } else if (n.type === 'clam') {
      sky2.clam(n.t, n.m);
    } else if (n.type === 'landed') {
      lastLanded = n.landed;
      sky2.landed(n.landed);
      engine.chime(n.landed.clean ? 'win' : 'clear', vol);
      dirty = true;
    } else if (n.type === 'lost') {
      droppedAt = now;
      sky2.lost(n.line, n.points);
      engine.chime('blow', vol);
      dirty = true;
    } else if (n.type === 'over') finish();
  }

  // ───────────────────────── the end of a run

  let kept = false;
  function finish(): void {
    view = 'end';
    arena.dataset.view = 'end';
    $('#fpause', root).hidden = true;
    $('#combo', root).hidden = true;
    $('#strip', root).hidden = true;
    ticks = null;
    engine.clearTicks();
    band?.stop(1.2);
    band = null;
    if (recording()) rec = engine.recorded();
    const before = store.best[bestKey(spot)] ?? 0;
    const record = g.score > before;
    if (record) store.best[bestKey(spot)] = g.score;
    const newGoals = g.goals.map((v, i) => v && !store.progress[goalKey(spot, i)]);
    g.goals.forEach((v, i) => v && (store.progress[goalKey(spot, i)] = 1));
    store.save();
    kept = false;
    const b = g.best;
    const sound = b ? soundOf(b.line) : null;
    sheet.hidden = false;
    sheet.id = 'result';
    sheet.innerHTML = `<p class="kick">${L('Run over', 'Runde vorbei')} · ${esc(spotName(spot))}</p>
      <h1 class="free-total">${num(g.score)}</h1>
      <p class="lede">${record ? L('Your best here.', 'Dein Bestwert hier.') : before ? L(`Best here: ${num(before)}.`, `Bestwert hier: ${num(before)}.`) : ''} ${L(`${g.sky.length} ${g.sky.length === 1 ? 'line' : 'lines'} landed, ${g.lost} lost.`, `${g.sky.length} ${g.sky.length === 1 ? 'Linie' : 'Linien'} gelandet, ${g.lost} verloren.`)}</p>
      ${
        b
          ? `<div class="free-bestline"><div class="free-besthead"><p><b>${L('Your best line', 'Deine beste Linie')}</b> · ${num(b.total)} · ×${b.mult}</p>${sound ? `<button class="btn sm" id="fhear">${L('Listen', 'Anhören')} <kbd>L</kbd></button>` : ''}<button class="btn sm" id="fkeep">${L('Keep this lick', 'Lick behalten')} <kbd>K</kbd></button></div><div class="free-chips">${[...b.line.set].map((t) => `<span>${esc(trickName(t))}</span>`).join('')}${b.clean ? `<span>${L('Clean landing', 'Saubere Landung')}</span>` : ''}</div><svg viewBox="0 0 900 110" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${L('Your best line as tab', 'Deine beste Linie als Tab')}">${tabSvg(tabOf(b.line.ev))}</svg></div>`
          : `<p class="note">${L(`No line landed. End a line on ${rootName(spot)} and wait two beats.`, `Keine Linie gelandet. Ende eine Linie auf ${rootName(spot)} und warte zwei Schläge.`)}</p>`
      }
      <ul class="free-goallist">${[0, 1, 2].map((i) => `<li class="${store.progress[goalKey(spot, i)] ? 'done' : ''}">${esc(goalText(spot, i))}${newGoals[i] ? ` · <b>${L('new', 'neu')}</b>` : ''}</li>`).join('')}</ul>
      <div class="row"><button class="btn primary big" id="again">${L('Again', 'Noch mal')} <kbd>${L('Space', 'Leertaste')}</kbd></button><a class="btn quiet" href="#/nf">${L('Games', 'Spiele')}</a></div>`;
    $('#again', root).onclick = again;
    const hearBtn = sheet.querySelector<HTMLButtonElement>('#fhear');
    if (hearBtn && sound && rec) hearBtn.onclick = () => listen(sound, rec!.sampleRate);
    const keepBtn = sheet.querySelector<HTMLButtonElement>('#fkeep');
    if (keepBtn && b) keepBtn.onclick = () => void keep(b, sound);
    hud(engine.now());
  }
  async function keep(b: Landed, sound: Float32Array | null): Promise<void> {
    if (kept) return;
    kept = true;
    const t = Date.now();
    const lick: Lick = {
      id: `free-${t}`,
      t,
      spot: spot.id,
      total: b.total,
      tricks: [...b.line.set],
      notes: b.line.ev.map((e) => ({ kind: e.kind, d: Math.max(0, e.t - b.line.start), ...(e.s !== undefined ? { s: e.s, f: e.f } : {}), ...(e.slur ? { slur: true } : {}), ...(e.chord ? { chord: e.chord } : {}) })),
    };
    store.licks.unshift(lick);
    store.licks.splice(30);
    store.save();
    if (sound && rec) await saveTake('guitar', lick.id, sound, rec.sampleRate, { t, secs: sound.length / rec.sampleRate, tempo: 100, bars: [] });
    const btn = sheet.querySelector<HTMLButtonElement>('#fkeep');
    if (btn) {
      btn.disabled = true;
      btn.textContent = L('Kept: it is on the start of Freestyle', 'Behalten: Es steht am Anfang von Freestyle');
    }
  }
  function again(): void {
    if (view !== 'end') return;
    engine.stopDemo();
    quietUntil = 0;
    view = 'ready';
    begin2();
  }
  /** Again: straight into the count, the same spot. */
  function begin2(): void {
    view = 'ready';
    begin();
  }

  // ───────────────────────── pause

  function setPaused(v: boolean): void {
    if ((view !== 'play' && view !== 'count') || v === paused) return;
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
      if (ticks) ticks = { t0: ticks.t0 + shift, until: ticks.until + shift };
      sky2.shift(shift);
      if (parts) band = engine.playBand(bandAt, parts, gainsOf(Math.max(0, level)), { loop: true, volume: store.settings.bandVolume });
    }
    const b = $('#fpause', root);
    b.setAttribute('aria-pressed', String(v));
    $('span', b).textContent = v ? L('Resume', 'Weiter') : L('Pause', 'Pause');
    const ban = $('#banner', root);
    ban.classList.remove('count');
    ban.textContent = L('Paused', 'Pausiert');
    ban.hidden = !v;
  }

  // ───────────────────────── the strip and the head

  let comboKey = '';
  let shown = 0;
  function strip(line: Line | null): void {
    const items = line ? tabOf(line.ev) : lastLanded ? tabOf(lastLanded.line.ev) : [];
    $('#ftab', root).innerHTML = tabSvg(items, line ? INK : '#a39c95');
    $('#ftabcap', root).textContent = line ? L('Your line', 'Deine Linie') : lastLanded ? L(`Last line · ${num(lastLanded.total)}`, `Letzte Linie · ${num(lastLanded.total)}`) : L('Your line', 'Deine Linie');
    $('#fbox', root).innerHTML = boxSvg(spot, lit);
    $('#fland', root).textContent = L(`land on ${rootName(spot)}`, `lande auf ${rootName(spot)}`);
    $('#fgoals', root).innerHTML = `<span class="k">${L('This spot', 'Dieser Ort')}</span>${[0, 1, 2].map((i) => `<span class="${g.goals[i] || store.progress[goalKey(spot, i)] ? 'done' : ''}"><i></i>${esc(goalText(spot, i))}</span>`).join('')}`;
  }
  function hud(now: number): void {
    shown += (g.score - shown) * 0.16;
    if (Math.abs(g.score - shown) < 1) shown = g.score;
    $('#fscore', root).textContent = num(Math.round(shown));
    const left = view === 'ready' ? g.seconds : g.timeLeft(now);
    $('#ftime', root).textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    arena.dataset.score = String(g.score);
    arena.dataset.lines = String(g.sky.length);
    arena.dataset.lost = String(g.lost);
    const l = g.line;
    arena.dataset.tricks = l ? l.tricks.join(' ') : '';
    if (view === 'play' || view === 'count') {
      const cur = l ? l.set.size : lastLanded && now - lastLanded.at < 2 * 4 * g.beat ? lastLanded.mult : 0;
      setLevel(now - droppedAt < 4 * g.beat ? 0 : cur >= 5 ? 3 : cur >= 3 ? 2 : l || g.score ? 1 : 0);
    }
    // the line so far, as a skate game writes a combo: each trick once, in the order it first came
    let key = '';
    if (l && l.tricks.length) {
      const seen = new Map<Trick, number>();
      for (const t of l.tricks) seen.set(t, (seen.get(t) ?? 0) + 1);
      let names = [...seen].map(([t, k]) => (k > 1 ? `${esc(trickName(t))} <small>×${k}</small>` : esc(trickName(t))));
      if (names.length > 5) names = ['…', ...names.slice(-5)];
      key = `${names.join('+')}|${l.set.size}|${worth(l)}`;
      if (key !== comboKey) {
        $('#ftricks', root).innerHTML = names.join(' + ');
        $('#fmult', root).textContent = `×${l.set.size}`;
        $('#fpts', root).textContent = num(worth(l));
      }
    } else {
      key = `${l ? 'notes' : 'idle'}|${view}`;
      if (key !== comboKey) {
        $('#ftricks', root).textContent = l ? L('Notes so far: do something with them', 'Bisher nur Töne: mach etwas daraus') : view === 'play' ? L(`Play a line. End it on ${rootName(spot)}.`, `Spiel eine Linie. Ende auf ${rootName(spot)}.`) : '';
        $('#fmult', root).textContent = '';
        $('#fpts', root).textContent = l ? num(l.base) : '';
      }
    }
    comboKey = key;
    $('#combo', root).classList.toggle('idle', !(l && l.tricks.length));
    const w = Math.min(1, g.wobble);
    $('#fneedle', root).style.left = `${50 + Math.sin(now * (7 + w * 16)) * w * 46}%`;
    $('#fpocket', root).classList.toggle('hot', w > 0.6);
    if (dirty) {
      strip(l);
      dirty = false;
    }
  }

  // ───────────────────────── the sky

  const sky2 = new Sky(sky, () => arena.getBoundingClientRect(), () => g);

  // ───────────────────────── the frame

  const backdropDue = slowly();
  function frame(ts: number): void {
    raf = requestAnimationFrame(frame);
    const now = engine.now();
    const still = view === 'ready' || view === 'end';
    if (still && !backdropDue(ts)) return;
    scene.measure();
    scene.draw(null, ts / 1000, false);
    if (view === 'ready') {
      sky2.clear();
      return;
    }
    if (view === 'end') {
      sky2.draw(sky2.frozen, false);
      hud(now);
      return;
    }
    if (!paused) {
      flush();
      g.update(now);
      scheduleTicks(now);
    }
    for (const n of g.news.splice(0)) onNews(n, now);
    if ((view as string) === 'end') return;
    const clock = (paused ? pausedAt : now) - heardLag();
    if (view === 'count') {
      const c = Math.ceil((g.t0 - clock) / g.beat);
      const ban = $('#banner', root);
      if (clock >= g.t0) {
        view = 'play';
        arena.dataset.view = 'play';
        ban.hidden = true;
        comboKey = '';
      } else if (c >= 1 && c <= 4) {
        ban.hidden = false;
        ban.classList.add('count');
        ban.textContent = String(5 - c);
      }
    }
    sky2.draw(clock, true);
    hud(now);
  }

  /** the practice instrument: a key plays the open string, with Shift the fretted note of the box on it (Q is the toolbox) */
  const P_KEYS = ['a', 's', 'd', 'f', 'g', 'h'];
  const simNote = (s: number, fretted: boolean): void => {
    const p = spot.box.filter((x) => x.s === s)[fretted ? 1 : 0];
    if (p) engine.simNote(p.m, 'clean', false, 's' + s);
  };
  const stopKeys = keys({
    ' ': () => (view === 'ready' ? begin() : view === 'end' ? again() : setPaused(!paused)),
    '1': () => choose(SPOTS[0].id),
    '2': () => SPOTS[1] && choose(SPOTS[1].id),
    l: () => sheet.querySelector<HTMLButtonElement>('#fhear')?.click(),
    k: () => sheet.querySelector<HTMLButtonElement>('#fkeep')?.click(),
    ...(practice
      ? {
          ...Object.fromEntries(P_KEYS.map((k, s) => [k, (e: KeyboardEvent) => simNote(s, e.shiftKey)])),
          j: () => engine.simChord(g.started ? g.chordAt(engine.now() - heardLag()) : spot.chords[0]),
        }
      : {}),
  });
  $('#fpause', root).onclick = () => setPaused(!paused);

  ready();
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    band?.stop(0.4);
    band = null;
    ticks = null;
    engine.clearTicks();
    engine.stopDemo();
    if (view === 'play' || view === 'count') engine.recorded();
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
};

/* ───────────────────────── the sky: the line being played, the lines landed, the names of the tricks */

interface Fx {
  kind: 'label' | 'big';
  text: string;
  sub?: string;
  bad?: boolean;
  t: number;
  m: number;
  i: number;
  born: number;
}
interface Hung {
  line: Line;
  total: number;
  mult: number;
  born: number;
  slot: number;
}
interface Frag {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  vx: number;
  vy: number;
  born: number;
}
const colOf = (mult: number): string => (mult >= 6 ? '#ffd27a' : mult >= 3 ? '#c9f0a6' : '#9ff0d0');
const ease = (p: number): number => 1 - (1 - p) ** 3;

/** The overlay over the painting. Times are on the listener's clock, as the player hears the band. */
class Sky {
  private readonly c: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private fx: Fx[] = [];
  private hung: Hung[] = [];
  private frags: Frag[] = [];
  private slots = 0;
  /** the clock of the last frame, to draw the end of a run still */
  frozen = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly rect: () => DOMRect,
    private readonly game: () => Freestyle,
  ) {
    this.c = canvas.getContext('2d')!;
  }

  reset(): void {
    this.fx = [];
    this.hung = [];
    this.frags = [];
    this.slots = 0;
  }
  shift(s: number): void {
    for (const f of this.fx) {
      f.t += s;
      f.born += s;
    }
    for (const h of this.hung) h.born += s;
    for (const f of this.frags) f.born += s;
  }
  label(text: string, v: number, e: FreeEvent, i: number): void {
    this.fx.push({ kind: 'label', text: `${text} ${v}`, t: e.t, m: e.m ?? (e.kind === 'stab' ? 64 : 0), i, born: e.t });
  }
  clam(t: number, m: number): void {
    this.fx.push({ kind: 'label', text: '✕', bad: true, t, m, i: 0, born: t });
  }
  landed(l: Landed): void {
    this.hung.push({ line: l.line, total: l.total, mult: l.mult, born: l.at, slot: this.slots++ % 6 });
    if (this.hung.length > 6) this.hung.shift();
    this.fx.push({ kind: 'big', text: l.clean ? L('Clean landing', 'Saubere Landung') : l.loose ? L('Loose end · half', 'Offenes Ende · halb') : L('Landed', 'Gelandet'), sub: '+' + num(l.total), t: l.at, m: 0, i: 0, born: l.at });
  }
  lost(line: Line, points: number): void {
    const at = line.ev[line.ev.length - 1].t;
    const geo = this.geo();
    const ns = line.ev.filter((x) => x.m !== undefined);
    for (let i = 1; i < ns.length; i++)
      this.frags.push({ x1: geo.X(ns[i - 1].t, at), y1: geo.Y(ns[i - 1].m!), x2: geo.X(ns[i].t, at), y2: geo.Y(ns[i].m!), vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 90, born: at });
    this.fx.push({ kind: 'big', text: L('Line lost', 'Linie verloren'), sub: '−' + num(points), bad: true, t: at, m: 0, i: 0, born: at });
  }
  clear(): void {
    this.size();
    this.c.clearRect(0, 0, this.W, this.H);
  }

  private size(): void {
    const d = Math.min(2, devicePixelRatio || 1);
    const w = innerWidth;
    const h = innerHeight;
    if (w !== this.W || h !== this.H || this.canvas.width !== Math.round(w * d)) {
      this.W = w;
      this.H = h;
      this.canvas.width = Math.round(w * d);
      this.canvas.height = Math.round(h * d);
    }
    this.c.setTransform(d, 0, 0, d, 0, 0);
  }
  /** where things are: the pen (now), the speed of the paper, the height of a note, the band the landed lines hang in */
  private geo(): { pen: number; pxs: number; lo: number; hi: number; top: number; left: number; right: number; X: (te: number, t: number) => number; Y: (m: number) => number } {
    const r = this.rect();
    const left = r.left + 16;
    const right = r.right - 16;
    const top = r.top + 8;
    const hi = r.top + Math.max(96, Math.min(150, r.height * 0.3));
    const lo = Math.max(hi + 80, r.bottom - 96);
    const pen = r.left + r.width * 0.72;
    const pxs = r.width * 0.085;
    return { pen, pxs, lo, hi, top, left, right, X: (te, t) => pen - (t - te) * pxs, Y: (m) => lo - ((Math.min(70, Math.max(40, m)) - 40) / 30) * (lo - hi) };
  }

  private trace(ns: FreeEvent[], X: (e: FreeEvent) => number, Y: (m: number) => number, endX: number): [number, number][] {
    const c = this.c;
    const pts: [number, number][] = [];
    c.beginPath();
    ns.forEach((e, i) => {
      const x = X(e);
      const y = Y(e.m!);
      if (i === 0) c.moveTo(x, y);
      else {
        const p = ns[i - 1];
        const px = X(p);
        const py = Y(p.m!);
        if (e.slur) c.bezierCurveTo(px + (x - px) * 0.55, py, px + (x - px) * 0.45, y, x, y);
        else {
          const k = Math.max(px, x - 14);
          c.lineTo(k, py);
          c.bezierCurveTo(k + 8, py, x - 6, y, x, y);
        }
      }
      pts.push([x, y]);
    });
    if (ns.length) {
      const l = ns[ns.length - 1];
      const x = Math.max(endX, X(l));
      c.lineTo(x, Y(l.m!));
      pts.push([x, Y(l.m!)]);
    }
    return pts;
  }
  private ribbon(ns: FreeEvent[], X: (e: FreeEvent) => number, Y: (m: number) => number, endX: number, col: string, w: number, a: number, hang: number, veil: number): void {
    if (!ns.length) return;
    const c = this.c;
    // the curtain that hangs from the line, as the aurora hangs from its upper edge
    const pts = this.trace(ns, X, Y, endX);
    const ys = pts.map((p) => p[1]);
    const top = Math.min(...ys);
    const bot = Math.max(...ys) + hang;
    c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1] + hang);
    c.lineTo(pts[0][0], pts[0][1] + hang);
    c.closePath();
    const grad = c.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'rgba(159,240,208,0)');
    c.save();
    c.globalAlpha = a * veil;
    c.fillStyle = grad;
    c.fill();
    c.restore();
    this.trace(ns, X, Y, endX);
    c.save();
    c.lineCap = c.lineJoin = 'round';
    c.globalAlpha = a;
    c.strokeStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 16;
    c.lineWidth = w;
    c.stroke();
    c.shadowBlur = 0;
    c.globalAlpha = a * 0.9;
    c.strokeStyle = '#fff';
    c.lineWidth = Math.max(1.2, w * 0.3);
    c.stroke();
    c.restore();
  }

  draw(t: number, moving: boolean): void {
    if (moving) this.frozen = t;
    this.size();
    const c = this.c;
    const g = this.game();
    const geo = this.geo();
    const { pen, pxs, lo, hi, top, left, right } = geo;
    c.clearRect(0, 0, this.W, this.H);
    c.save();
    c.beginPath();
    c.rect(left - 16, top - 8, right - left + 32, lo + 40 - top);
    c.clip();
    const bar = 4 * g.beat;
    // bars and the band's chords, walking left with the time
    c.font = '500 13px "IBM Plex Mono", monospace';
    c.textBaseline = 'alphabetic';
    for (let b = Math.floor((t - (pen - left) / pxs - g.t0) / bar); g.t0 + b * bar < t + (right - pen) / pxs; b++) {
      const at = g.t0 + b * bar;
      const x = geo.X(at, t);
      if (x < left - 40) continue;
      c.strokeStyle = 'rgba(243,238,230,.16)';
      c.lineWidth = 1.5;
      c.setLineDash([4, 9]);
      c.beginPath();
      c.moveTo(x, hi - 24);
      c.lineTo(x, lo + 22);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = at <= t && t < at + bar ? 'rgba(255,210,122,.95)' : 'rgba(243,238,230,.55)';
      c.fillText(chordName(g.chordAt(at + 0.01)), x + 8, hi - 12);
      for (let q = 1; q < 4; q++) {
        c.fillStyle = 'rgba(243,238,230,.22)';
        c.fillRect(geo.X(at + q * g.beat, t) - 1, lo + 16, 2, 6);
      }
    }
    // the lines landed: they rise and stay, smaller, as curtains of light
    const gap = (right - left - 520) / 5;
    for (const it of this.hung) {
      const p = ease(Math.min(1, Math.max(0, (t - it.born) / 1.1)));
      const ns = it.line.ev.filter((x) => x.m !== undefined);
      if (!ns.length) continue;
      const sx = left + it.slot * Math.max(60, gap);
      const sy = top + 46 + (it.slot % 2) * 14;
      const sh = Math.max(24, Math.min(46, (hi - top) * 0.45));
      const X = (e: FreeEvent): number => geo.X(e.t, t) * (1 - p) + (sx + (e.t - it.line.start) * pxs * 0.45) * p;
      const Y = (m: number): number => geo.Y(m) * (1 - p) + (sy - ((Math.min(70, Math.max(40, m)) - 40) / 30) * sh) * p;
      const end = X(ns[ns.length - 1]) + 2 * g.beat * pxs * (1 - p * 0.5);
      this.ribbon(ns, X, Y, end, colOf(it.mult), 5.5 - 2.4 * p, 1 - 0.2 * p, 70 - 20 * p, 0.3 + 0.1 * p);
      if (p > 0.6) {
        c.globalAlpha = (p - 0.6) * 2.5;
        c.font = '500 12px "IBM Plex Mono", monospace';
        c.fillStyle = colOf(it.mult);
        c.fillText(num(it.total), X(ns[0]), Y(ns[0].m!) + 18);
        c.globalAlpha = 1;
      }
    }
    // the line being played
    const L0 = g.line;
    if (L0) {
      const ns = L0.ev.filter((x) => x.m !== undefined);
      const X = (e: FreeEvent): number => geo.X(e.t, t);
      this.ribbon(ns, X, geo.Y, pen, colOf(L0.set.size), 5.5, 1, 90, 0.3);
      for (const e of L0.ev) {
        const x = geo.X(e.t, t);
        if (e.kind === 'chk') {
          c.strokeStyle = 'rgba(243,238,230,.9)';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(x - 5, lo + 6);
          c.lineTo(x + 5, lo + 16);
          c.moveTo(x + 5, lo + 6);
          c.lineTo(x - 5, lo + 16);
          c.stroke();
        } else if (e.kind === 'stab') {
          c.strokeStyle = 'rgba(255,210,122,.6)';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(x, geo.Y(45));
          c.lineTo(x, geo.Y(66));
          c.stroke();
          c.fillStyle = '#ffd27a';
          for (const m of [45, 52, 59, 66]) {
            c.beginPath();
            c.arc(x, geo.Y(m), 3.6, 0, 7);
            c.fill();
          }
        } else if (!e.slur) {
          c.fillStyle = e.inTime === false ? '#ff8f7d' : '#fff';
          c.beginPath();
          c.arc(x, geo.Y(e.m!), 4.5, 0, 7);
          c.fill();
        }
      }
      const l = ns[ns.length - 1];
      if (l) {
        const r = 9 + 3 * Math.sin(t * 9);
        c.fillStyle = 'rgba(255,255,255,.95)';
        c.shadowColor = colOf(L0.set.size);
        c.shadowBlur = 22;
        c.beginPath();
        c.arc(pen, geo.Y(l.m!), r, 0, 7);
        c.fill();
        c.shadowBlur = 0;
        // the two beats of rest that bank it: a ring that closes
        const wait = g.resting(t);
        if (wait > 0.2) {
          c.strokeStyle = 'rgba(255,210,122,.95)';
          c.lineWidth = 3;
          c.beginPath();
          c.arc(pen, geo.Y(l.m!), 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * wait);
          c.stroke();
        }
      }
    }
    // the pen, pulsing with the beat
    if (moving) {
      const ph = 1 - ((((t - g.t0) / g.beat) % 1) + 1) % 1;
      c.strokeStyle = `rgba(243,238,230,${0.1 + 0.18 * ph * ph})`;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(pen, hi - 24);
      c.lineTo(pen, lo + 22);
      c.stroke();
    }
    // what was lost falls into the sea
    this.frags = this.frags.filter((f) => t - f.born < 1.5);
    for (const f of this.frags) {
      const a = Math.max(0, t - f.born);
      const dx = f.vx * a;
      const dy = f.vy * a + 260 * a * a;
      const k = a / 1.5;
      c.strokeStyle = `rgba(${Math.round(159 - 140 * k)},${Math.round(240 - 220 * k)},${Math.round(208 - 170 * k)},${1 - k})`;
      c.lineWidth = 4;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(f.x1 + dx, f.y1 + dy);
      c.lineTo(f.x2 + dx * 1.3, f.y2 + dy * 1.15);
      c.stroke();
    }
    c.restore();
    // names of the tricks, rising from where they were played; the landing and the loss, large
    this.fx = this.fx.filter((f) => t - f.born < (f.kind === 'big' ? 2.2 : 1.6));
    for (const f of this.fx) {
      const a = Math.max(0, t - f.born);
      c.textAlign = 'center';
      c.shadowColor = 'rgba(5,10,25,.95)';
      if (f.kind === 'label') {
        const x = geo.X(f.t, t);
        const y = (f.m ? geo.Y(f.m) : lo) - 22 - a * 26 - f.i * 20;
        c.globalAlpha = Math.max(0, 1 - a / 1.6);
        c.font = '700 15px "IBM Plex Sans", sans-serif';
        c.shadowBlur = 8;
        c.fillStyle = f.bad ? '#ff8f7d' : '#ffd27a';
        c.fillText(f.text, x, y);
      } else {
        const y = hi + (lo - hi) * 0.3 - ease(Math.min(1, a / 0.5)) * 14;
        c.globalAlpha = Math.min(1, a / 0.15) * Math.max(0, Math.min(1, (2.2 - a) / 0.5));
        c.shadowBlur = 16;
        const x = left + (right - left) * 0.42;
        c.font = `700 ${Math.round(Math.min(46, this.W * 0.034))}px "IBM Plex Sans", sans-serif`;
        c.fillStyle = f.bad ? '#ff8f7d' : '#fff';
        c.fillText(f.text, x, y);
        c.font = `700 ${Math.round(Math.min(34, this.W * 0.026))}px "IBM Plex Mono", monospace`;
        c.fillStyle = f.bad ? '#ff8f7d' : '#ffd27a';
        c.fillText(f.sub ?? '', x, y + 42);
      }
      c.shadowBlur = 0;
      c.globalAlpha = 1;
      c.textAlign = 'left';
    }
  }
}
