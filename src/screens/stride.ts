/**
 * Stepping Stones: the rhythm game. A wanderer with a lantern crosses the water on stones, one stone for
 * every strum, and the land goes by behind. The stones come in time with the click; the chord changes at
 * every bar line. Strum as the wanderer lands. Read left to right: what comes next is on the right.
 * On the piano a stone is a chord struck with the right hand, all its keys at once. With the voice a stone
 * is a short sung "ta" on a note, and the note changes at every bar line (do in one bar, mi in the next).
 */
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { makeWalk, PATTERNS, Walk, WALK_TEMPI, type Pattern } from '../game/stride';
import { CHORD_PAIRS, KEY_PAIRS, shapeOf } from '../music/content';
import { pairKey } from '../music/difficulty';
import { changeTip, chordName, CHORDS, keyTip, noteName } from '../music/theory';
import { $, esc, hear, keys, micMeter, pianoEars, type Screen } from '../ui/dom';
import { chordBox, keyboard, keyChord, keyRange, NF, NFX } from '../ui/draw';
import { centsOff, median, type Frame } from '../core/singing';
import { voiceKeys } from '../game/run';
import { voiceEars, voiceRange } from './sing';
import { LANDS, Trail, type StoneState } from '../ui/trail';
import { practiceBar, setSimTarget } from '../ui/practice';
import { pips } from './home';
import { beatKey, knownChords } from './nf';

const BARS = 8;

/** A sung stone's note is named "v" and its MIDI number: the walk treats it like a chord. */
const sungMidi = (id: string): number => Number(id.slice(1));
/** The two notes of a sung walk: do and mi of the key that suits the voice best. */
function notesToWalk(): [string, string] {
  const [low, high] = voiceRange();
  const keys = voiceKeys(low, high);
  const root = keys[Math.floor(keys.length / 2)];
  return [`v${root}`, `v${root + 4}`];
}
/** What a voice does in each pattern. */
const VOICE_ABOUT: Record<string, () => string> = {
  four: () => L('One “ta” on each beat. Move to the new note between two of them.', 'Ein „ta“ auf jeden Schlag. Zum neuen Ton gehst du zwischen zwei davon.'),
  half: () => L('Two a bar. More time for the new note, and a beat of silence to feel.', 'Zwei pro Takt. Mehr Zeit für den neuen Ton, und ein stiller Schlag zum Fühlen.'),
  rest: () => L('Leave the second beat empty and come back in on three.', 'Lass den zweiten Schlag leer und steig auf drei wieder ein.'),
  push: () => L('Two quick ones on the third beat: “ta-ta”.', 'Zwei schnelle auf dem dritten Schlag: „ta-ta“.'),
};

/** The pattern to work on: the first whose level is lowest. */
function suggested(piano: boolean | 'voice'): Pattern {
  return PATTERNS.reduce((a, b) => (store.skills.level(beatKey(b.id, piano)) < store.skills.level(beatKey(a.id, piano)) ? b : a));
}

/** The two chords of the walk: the change between known chords that is slowest so far. */
function pairToWalk(piano: boolean): [string, string] {
  const known = knownChords(piano);
  if (piano) {
    const pairs = KEY_PAIRS.filter(([a, b]) => known.has(a) && known.has(b));
    return pairs.sort((x, y) => store.skills.level(pairKey(x[0], x[1], true)) - store.skills.level(pairKey(y[0], y[1], true)))[0] ?? ['C', 'G'];
  }
  const pairs = CHORD_PAIRS.filter(([a, b]) => known.has(shapeOf(a).id) && known.has(shapeOf(b).id));
  const [a, b] = pairs.sort((x, y) => store.skills.level(`pair:${x[0]}>${x[1]}`) - store.skills.level(`pair:${y[0]}>${y[1]}`))[0] ?? ['Em', 'Am'];
  return [shapeOf(a).id, shapeOf(b).id];
}

export const stride: Screen = (root, [pid, again]) => {
  const voice = store.settings.instrument === 'voice';
  const piano = store.settings.instrument === 'piano';
  const who = voice ? 'voice' : piano;
  const pattern = PATTERNS.find((p) => p.id === pid) ?? suggested(who);
  const pair = voice ? notesToWalk() : pairToWalk(piano);
  const stones = makeWalk(pattern, pair, BARS);
  const skill = beatKey(pattern.id, who);
  const speedKey = `stride:${voice ? 'v.' : piano ? 'p.' : ''}${pattern.id}`;
  /** how a chord is sounded on this instrument */
  const strum = piano ? 'play' : 'strum';
  const nameOf = (c: string): string => (voice ? noteName(sungMidi(c)).replace(/\d+$/, '') : chordName(c, piano));
  const tipFor = (a: string, b: string): string => {
    if (!voice) return piano ? keyTip(a, b) : changeTip(CHORDS[a], CHORDS[b]);
    const d = sungMidi(b) - sungMidi(a);
    return L(`${d > 0 ? 'Up' : 'Down'} a third to ${nameOf(b)}: hear the new note in your head on the last beat of the bar.`, `Eine Terz ${d > 0 ? 'hinauf' : 'hinab'} zum ${nameOf(b)}: Hör den neuen Ton auf dem letzten Schlag des Takts schon im Kopf.`);
  };
  /** a sung note on a little keyboard, for where the guitar shows a chord diagram */
  const noteFig = (c: string, box: { x: number; y: number; w: number; h: number }, hot: boolean): string => {
    const r = keyRange(pair.map(sungMidi), true);
    return keyboard([{ midi: sungMidi(c), hot }], NF, r.lowC, r.octaves, box);
  };
  const fingers = voice ? L('on “ta”, short and light; any octave counts', 'auf „ta“, kurz und leicht; jede Oktave zählt') : piano ? L('1 thumb · 2 index · 3 middle · 4 ring · 5 little finger', '1 Daumen · 2 Zeigefinger · 3 Mittelfinger · 4 Ringfinger · 5 kleiner Finger') : L('1 index · 2 middle · 3 ring · 4 little finger', '1 Zeigefinger · 2 Mittelfinger · 3 Ringfinger · 4 kleiner Finger');
  // On the piano the quick pair is the same chord twice, a third of a second apart at 100: quicker than that
  // the second of the two cannot be told from the first ringing on.
  const TEMPI = piano && pattern.id === 'push' ? WALK_TEMPI.filter((t) => t <= 100) : WALK_TEMPI;
  let bpm = TEMPI.includes(store.speeds[speedKey]) ? store.speeds[speedKey] : 60;
  let phase: 'brief' | 'count' | 'walk' | 'done' = 'brief';
  let walk: Walk | null = null;
  /** the moment of beat 0 on the audio clock (what is heard arrives `lat` later) */
  let t0 = 0;
  let lat = 0;
  let ticked = -5;
  let raf = 0;
  let nextShown = -2;
  let restarted: void | (() => void);
  const landIndex = Math.max(0, PATTERNS.indexOf(pattern));
  /** the picture: it lies behind everything, from the briefing to the result */
  const canvas = document.createElement('canvas');
  canvas.id = 'play';
  canvas.className = 'world';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', L(`A wanderer with a lantern crosses the water on stones, one for every ${voice ? 'sung note' : piano ? 'chord' : 'strum'}, read left to right. A stone met in time is lit.`, `Ein Wanderer mit einer Laterne überquert das Wasser auf Steinen, einer für jeden ${piano ? 'Akkord' : 'Anschlag'}, von links nach rechts gelesen. Ein Stein, der im Takt getroffen wird, leuchtet.`));
  let trail = new Trail(canvas, landIndex);
  let closing = 0;
  const names = pair.map(nameOf);
  const total = stones.length;

  root.innerHTML = `<header class="hud">
      <div class="g"><a class="hb leave" href="#/nf">${L('‹ Games', '‹ Spiele')}</a><span class="k" style="color:var(--now)">${L('Stepping stones', 'Trittsteine')}</span><span class="k">${esc(pattern.name)}</span></div>
      <div class="g"><span class="k">${L('In time', 'Im Takt')}</span><b><span id="hits">0</span><small>/${total}</small></b><span class="mult" id="run"></span></div>
      <div class="g"><span class="k">${L('Tempo', 'Tempo')}</span><b id="bpm">${bpm}</b>${micMeter()}</div>
    </header>
    <div id="mid" style="flex:1;display:flex;flex-direction:column;position:relative;min-height:0"></div>
    ${practiceBar()}
    <footer class="hints" id="hints"></footer>`;
  const mid = $('#mid', root);
  root.prepend(canvas);
  const fromInstrument = (): boolean => !voice && engine.running && store.settings.strumSelect;

  function brief(): void {
    phase = 'brief';
    mid.dataset.gate = 'brief';
    const best = store.skills.get(skill)?.best;
    mid.innerHTML = `<div class="page mid" id="brief">
        <div><p class="kick">${L(`Rhythm · ${esc(LANDS[landIndex].name)} · ${BARS} bars · ${bpm} beats a minute`, `Rhythmus · ${esc(LANDS[landIndex].name)} · ${BARS} Takte · ${bpm} Schläge pro Minute`)}</p><h1>${L(`Keep the pulse: ${esc(names.join(' and '))}`, `Halte den Puls: ${esc(names.join(' und '))}`)}</h1></div>
        <div class="brief2">
          <div class="shapes${piano || voice ? ' keysfig' : ''}" role="list" aria-label="${voice ? L('The notes of this walk', 'Die Töne dieser Überquerung') : L('The chords of this walk', 'Die Akkorde dieser Überquerung')}">${pair.map((c) => (voice ? `<figure role="listitem"><svg viewBox="0 0 220 150" role="img" aria-label="${L(`The note ${nameOf(c)} on the keyboard`, `Der Ton ${nameOf(c)} auf der Tastatur`)}">${noteFig(c, { x: 4, y: 8, w: 212, h: 134 }, false)}</svg><figcaption>${nameOf(c)} · ${c === pair[0] ? 'do' : 'mi'}</figcaption></figure>` : piano ? `<figure role="listitem"><svg viewBox="0 0 220 150" role="img" aria-label="${L(`The keys of ${nameOf(c)}`, `Die Tasten von ${nameOf(c)}`)}">${keyChord(c, NF, { x: 4, y: 8, w: 212, h: 134 }, false, pair)}</svg><figcaption>${nameOf(c)}</figcaption></figure>` : `<figure role="listitem"><svg viewBox="0 0 170 190" role="img" aria-label="${L(`Chord diagram of ${CHORDS[c].name}`, `Griffbild von ${CHORDS[c].name}`)}">${chordBox(CHORDS[c], 30, 34, 110, NF, false, undefined, 28)}</svg><figcaption>${CHORDS[c].name}</figcaption></figure>`)).join('')}</div>
          <div class="side">
            <p class="count" aria-label="${L('How the bar is counted', 'Wie der Takt gezählt wird')}">${pattern.count.split(' ').map((c) => `<b class="${c === '·' ? 'off' : ''}">${c}</b>`).join('')}</p>
            <ol class="how"><li>${voice ? L('A wanderer crosses the water on stones, in time with the click. Every stone is one short sung “ta”: sing it as the wanderer lands, and the stone is lit.', 'Ein Wanderer überquert das Wasser auf Steinen, im Takt mit dem Klick. Jeder Stein ist ein kurzes gesungenes „ta“: Sing es, wenn der Wanderer landet, und der Stein leuchtet.') : L(`A wanderer crosses the water on stones, in time with the click. Every stone is ${piano ? 'the chord once, all its keys together: play' : 'one strum: strum'} as the wanderer lands, and the stone is lit.`, `Ein Wanderer überquert das Wasser auf Steinen, im Takt mit dem Klick. Jeder Stein ist ${piano ? 'einmal der Akkord, alle seine Tasten zusammen: Spiel ihn' : 'ein Anschlag: Schlag an'}, wenn der Wanderer landet, und der Stein leuchtet.`)}</li><li>${esc(voice ? VOICE_ABOUT[pattern.id]() : piano ? pattern.aboutKeys : pattern.about)} ${voice ? L('The note changes at every bar line:', 'Der Ton wechselt an jedem Taktstrich:') : L('The chord changes at every bar line:', 'Der Akkord wechselt an jedem Taktstrich:')} ${esc(tipFor(pair[0], pair[1]))}</li><li>${L('Nothing is lost by a miss: the wanderer goes on, and the next stone is a new chance.', 'Ein verpasster Stein kostet nichts: Der Wanderer geht weiter, und der nächste Stein ist eine neue Chance.')} ${best ? L(`Your best: ${Math.round(best)} beats a minute.`, `Dein Bestwert: ${Math.round(best)} Schläge pro Minute.`) : L('Nine of ten stones in time and the tempo counts.', 'Neun von zehn Steinen im Takt, und das Tempo zählt.')}</li></ol>
            <div class="row"><button class="btn primary big" id="begin">${L('Start', 'Starten')} <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn" id="slower">${L('Slower', 'Langsamer')} <kbd>−</kbd></button><button class="btn" id="faster">${L('Faster', 'Schneller')} <kbd>+</kbd></button></div>
            <p class="note">${fromInstrument() ? L(`Or ${strum} ${esc(names[0])} to start. `, piano ? `Oder spiel ${esc(names[0])}, um zu starten. ` : `Oder schlag ${esc(names[0])} an, um zu starten. `) : ''}${L('It counts one bar in. Other patterns: ', 'Erst wird ein Takt eingezählt. Andere Muster: ')}${PATTERNS.map((p, i) => `<a href="#/stride/${p.id}"${p === pattern ? ' aria-current="true"' : ''}>${i + 1} ${esc(p.name)}</a> ${pips(store.skills.level(beatKey(p.id, who)))}`).join(' · ')}</p>
          </div>
        </div>
      </div>`;
    $('#hints', root).innerHTML = `<span><b>${L('Count', 'Zählen')}</b>${esc(pattern.count)}</span><span><b>${voice ? L('Voice', 'Stimme') : L('Fingers', 'Finger')}</b>${fingers}</span>`;
    $('#begin', root).onclick = begin;
    $('#slower', root).onclick = () => tempo(-1);
    $('#faster', root).onclick = () => tempo(1);
    setSimTarget(voice ? { kind: 'note', midi: sungMidi(pair[0]), voice: true } : { kind: 'chord', id: pair[0], piano });
  }

  function tempo(step: number): void {
    if (phase !== 'brief') return;
    bpm = TEMPI[Math.max(0, Math.min(TEMPI.length - 1, TEMPI.indexOf(bpm) + step))];
    store.speeds[speedKey] = bpm;
    store.save();
    $('#bpm', root).textContent = String(bpm);
    brief();
  }

  function begin(): void {
    if (phase !== 'brief') return;
    phase = 'count';
    mid.dataset.gate = 'count';
    const beat = 60 / bpm;
    lat = engine.micOn ? (store.settings.latency >= 0 ? store.settings.latency : engine.latencyEstimate()) : 0;
    t0 = engine.now() + 0.4 + 4 * beat;
    walk = new Walk(stones, bpm, t0 + lat);
    ticked = -5;
    nextShown = -2;
    mid.innerHTML = `<div class="arena walk" id="arena">
        <div class="banner" id="banner" hidden></div>
      </div>
      <div class="console"><svg id="con" viewBox="0 0 1200 190" role="img" aria-label="${voice ? L('The note to sing now, the bar with its count, and the note that comes next', 'Der Ton, den du jetzt singst, der Takt mit seiner Zählung und der Ton, der danach kommt') : L('The chord to hold now, the bar with its count, and the chord that comes next', 'Der Akkord, den du jetzt greifst, der Takt mit seiner Zählung und der Akkord, der danach kommt')}"></svg></div>`;
    $('#hints', root).innerHTML = `<span><b>${voice ? L('Sing “ta”', 'Sing „ta“') : piano ? L('Play the chord', 'Spiel den Akkord') : L('Strum', 'Schlag an')}</b>${L('as the wanderer lands on a stone', 'wenn der Wanderer auf einem Stein landet')}</span><span><b>${L('Stop', 'Stopp')}</b>${L('Space ends the walk', 'Leertaste beendet die Überquerung')}</span><span><b>${voice ? L('Voice', 'Stimme') : L('Fingers', 'Finger')}</b>${fingers}</span>`;
    trail = new Trail(canvas, landIndex);
    trail.over = $('#arena', root);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function consoleSvg(i: number, beatNow: number): string {
    const st = stones[Math.max(0, Math.min(total - 1, i))];
    const bar = Math.max(0, Math.floor(beatNow / 4));
    const now = st.chord;
    const after = stones.find((s) => s.bar === st.bar + 1)?.chord ?? null;
    let h = `<text x="8" y="26" class="ck">${voice ? L('SING', 'SING') : piano ? L('PLAY', 'SPIEL') : L('HOLD', 'HALTE')}</text><text x="8" y="70" class="cn" fill="${NF.now}">${nameOf(now)}</text>${voice ? noteFig(now, { x: 96, y: 40, w: 214, h: 124 }, true) : piano ? keyChord(now, NF, { x: 96, y: 40, w: 214, h: 124 }, true, pair) : chordBox(CHORDS[now], 130, 40, 120, NF, true, undefined, 28)}`;
    // the bar, read left to right: four beats, a slash where a strum falls
    h += `<text x="330" y="26" class="ck">${L(`BAR ${Math.min(BARS, bar + 1)} OF ${BARS} · COUNT`, `TAKT ${Math.min(BARS, bar + 1)} VON ${BARS} · ZÄHLEN`)}</text>`;
    for (let k = 0; k < 4; k++) {
      const x = 330 + k * 130;
      const on = Math.floor(beatNow) % 4 === k && beatNow >= 0;
      h += `<rect x="${x}" y="44" width="118" height="118" rx="8" fill="${on ? NF.now : NF.panel}" opacity="${on ? 0.16 : 1}" stroke="${on ? NF.now : NFX.rule}" stroke-width="1.5"/><text x="${x + 12}" y="68" class="lk" fill="${on ? NF.now : NF.muted}">${k + 1}</text>`;
      for (const b of pattern.beats.filter((v) => Math.floor(v) === k)) {
        const sx = x + 44 + (b - k) * 96;
        h += `<path d="M${sx - 9} 142l18 -62" stroke="${on ? NF.now : NF.text}" stroke-width="7" stroke-linecap="round"/>`;
      }
    }
    if (after && after !== now) h += `<text x="900" y="26" class="ck">${L('NEXT BAR', 'NÄCHSTER TAKT')}</text><text x="900" y="70" class="cn" fill="${NF.muted}">${nameOf(after)}</text>${voice ? noteFig(after, { x: 978, y: 40, w: 214, h: 124 }, false) : piano ? keyChord(after, NF, { x: 978, y: 40, w: 214, h: 124 }, false, pair) : chordBox(CHORDS[after], 1010, 40, 120, NF, false, undefined, 28)}<text x="330" y="184" class="ct" fill="${NF.now}">${esc(tipFor(now, after))}</text>`;
    return h;
  }

  function frame(): void {
    if (!walk || phase === 'brief' || (phase === 'done' && !closing)) {
      // nothing is being walked: the land lies still, with the wanderer waiting on the bank
      trail.draw({ beat: phase === 'done' ? BARS * 4 + 1.5 : -1.2, stones, states: lastStates, bars: BARS, name: nameOf, count: (i) => (stones[i].at % 1 ? '+' : String((stones[i].at % 4) + 1)) }, performance.now() / 1000);
      raf = requestAnimationFrame(frame);
      return;
    }
    const w = walk;
    const now = engine.now();
    const beat = w.beat;
    const beatNow = (now - t0) / beat;
    if (phase === 'count' && beatNow >= -0.05) {
      phase = 'walk';
      mid.dataset.gate = 'go';
    }
    // the click: the bar counted in, then every beat, a little ahead of time
    while ((ticked + 1) * beat + t0 < now + 0.6 && ticked + 1 < BARS * 4) {
      ticked++;
      if (store.settings.click > 0) engine.tick(t0 + ticked * beat, ((ticked % 4) + 4) % 4 === 0, store.settings.click, store.settings.clickSound === 'click');
    }
    for (const i of w.advance(now)) trail.say(i, L('missed', 'verpasst'), true);
    const banner = root.querySelector<HTMLElement>('#banner');
    if (banner) {
      const c = Math.ceil(-beatNow);
      banner.hidden = phase !== 'count' || c < 1 || c > 4;
      banner.classList.add('count');
      banner.textContent = String(5 - c);
    }
    const states = w.steps.map((s): StoneState => (s.state === 'hit' ? (s.wrong ? 'wrong' : 'hit') : s.state));
    lastStates = states;
    trail.draw({ beat: beatNow, stones, states, bars: BARS, name: nameOf, count: (i) => (stones[i].at % 1 ? '+' : String((stones[i].at % 4) + 1)) }, performance.now() / 1000);
    const streak = trail.run;
    $('#run', root).textContent = streak >= 3 ? L(`${streak} in a row`, `${streak} in Folge`) : '';
    const next = w.next(now);
    if (next !== nextShown || Math.floor(beatNow * 2) !== Math.floor((beatNow - 0.02) * 2)) {
      nextShown = next;
      $('#con', root).innerHTML = consoleSvg(next < 0 ? total - 1 : next, beatNow);
      setSimTarget(next < 0 ? null : voice ? { kind: 'note', midi: sungMidi(stones[next].chord), voice: true } : { kind: 'chord', id: stones[next].chord, piano });
    }
    // for whoever plays along from outside: the last stone whose moment has come. Counted up, never
    // matched to a narrow moment, so that a frame that comes late cannot skip a stone.
    let dueNow = -1;
    while (dueNow + 1 < stones.length && now >= w.due(dueNow + 1) - 0.03) dueNow++;
    if (dueNow >= 0) root.dataset.step = String(dueNow);
    const res = w.result();
    $('#hits', root).textContent = String(res.hits);
    if (now > t0 + w.length + 0.5 && phase !== 'done') finish();
    raf = requestAnimationFrame(frame);
  }
  let lastStates: StoneState[] = stones.map(() => 'ahead');

  function finish(): void {
    if (!walk || phase === 'done') return;
    phase = 'done';
    engine.clearTicks();
    setSimTarget(null);
    const r = walk.result();
    const before = store.skills.level(skill);
    if (r.kept) store.skills.record(skill, bpm, Date.now());
    const after = store.skills.level(skill);
    // the click reaches the microphone later than it is sent: learn that from where the strums fell
    if (engine.micOn && r.hits >= Math.max(4, 0.6 * r.total)) store.settings.latency = Math.max(0, Math.min(0.35, lat + 0.5 * r.lean));
    const i = TEMPI.indexOf(bpm);
    const nextBpm = r.kept ? TEMPI[Math.min(TEMPI.length - 1, i + 1)] : r.hits < 0.6 * r.total ? TEMPI[Math.max(0, i - 1)] : bpm;
    store.speeds[speedKey] = nextBpm;
    store.save();
    // the picture gets a moment to end: the far bank, and the beacon if the pulse was kept
    trail.end(r.kept);
    if (r.kept) engine.chime('win', store.settings.chimes);
    const show = (): void => {
      closing = 0;
      mid.dataset.gate = 'done';
      trail.over = null;
      result(r, before, after, nextBpm);
    };
    if (walk.next(engine.now()) < 0) closing = window.setTimeout(show, 1700);
    else show();
  }

  /** What the walk showed. */
  function result(r: ReturnType<Walk['result']>, before: number, after: number, nextBpm: number): void {
    const ms = Math.round(Math.abs(r.lean) * 1000);
    const lean = r.hits < 3 ? '' : ms < 25 ? L('Right on the beat on average.', 'Im Schnitt genau auf dem Schlag.') : r.lean > 0 ? L(`On average ${ms} ms late: begin the change a little earlier, during the last ${piano ? 'chord' : 'strum'} of the bar.`, `Im Schnitt ${ms} ms zu spät: Beginn den Wechsel etwas früher, während ${piano ? 'des letzten Akkords' : 'des letzten Anschlags'} im Takt.`) : L(`On average ${ms} ms early: wait for the click, let the wanderer land first.`, `Im Schnitt ${ms} ms zu früh: Warte auf den Klick, lass den Wanderer erst landen.`);
    mid.innerHTML = `<div class="page mid">
        <div><p class="kick">${esc(pattern.name)} · ${esc(names.join(L(' and ', ' und ')))} · ${L(`${bpm} beats a minute`, `${bpm} Schläge pro Minute`)}</p>
          <h1>${L(`${r.hits} of ${r.total} stones in time.`, `${r.hits} von ${r.total} Steinen im Takt.`)}</h1>
          <p class="lede">${lean} ${r.wrong ? (voice ? L(`${r.wrong} ${r.wrong === 1 ? 'was' : 'were'} in time but on another note.`, `${r.wrong} ${r.wrong === 1 ? 'war' : 'waren'} im Takt, aber auf einem anderen Ton.`) : L(`${r.wrong} ${r.wrong === 1 ? 'was' : 'were'} in time but still the old chord.`, `${r.wrong} ${r.wrong === 1 ? 'war' : 'waren'} im Takt, aber noch der alte Akkord.`)) : ''} ${r.stray ? L(`${r.stray} fell between the stones.`, `${r.stray} ${r.stray === 1 ? 'fiel' : 'fielen'} zwischen die Steine.`) : ''}</p></div>
        <dl class="stats"><div><dt>${L('In time', 'Im Takt')}</dt><dd>${Math.round((100 * r.hits) / r.total)}%</dd></div><div><dt>${L('Spread', 'Streuung')}</dt><dd>${Math.round(r.spread * 1000)} ms</dd></div><div><dt>${L('Level', 'Stufe')}</dt><dd>${after}${after > before ? ' ↑' : ''}</dd></div></dl>
        <p class="note">${r.kept ? L(`That tempo counts. Next: ${nextBpm === bpm ? 'the same tempo, the top one' : `${nextBpm} beats a minute`}.`, `Das Tempo zählt. Als Nächstes: ${nextBpm === bpm ? 'dasselbe Tempo, das höchste' : `${nextBpm} Schläge pro Minute`}.`) : nextBpm < bpm ? L(`Next time slower: ${nextBpm} beats a minute.`, `Nächstes Mal langsamer: ${nextBpm} Schläge pro Minute.`) : L('Nine of ten stones in time and the tempo counts. Once more at this tempo.', 'Neun von zehn Steinen im Takt, und das Tempo zählt. Noch einmal in diesem Tempo.')}</p>
        <div class="row"><button class="btn primary" id="rerun">${L('Again', 'Nochmal')} <kbd>${L('Space', 'Leertaste')}</kbd></button><a class="btn" href="#/stride">${L('Next pattern', 'Nächstes Muster')}</a><a class="btn quiet" href="#/nf">${L('Other game', 'Anderes Spiel')}</a></div>
      </div>`;
    $('#bpm', root).textContent = String(nextBpm);
    $('#run', root).textContent = '';
    $('#hints', root).innerHTML = '';
    $('#rerun', root).onclick = rerun;
  }

  function rerun(): void {
    dispose();
    restarted = stride(root, [pattern.id, 'again']);
  }

  const sure = (e: { best: string | null; score: number; margin: number }): boolean => !!e.best && e.score > 0.6 && e.margin > 0.08;
  /** a stone was met: what it says above the stone */
  function landed(i: number): void {
    if (i < 0 || !walk) return;
    const st = walk.steps[i];
    if (st.state !== 'hit') return;
    const ms = Math.round(st.offset * 1000);
    if (!st.wrong) engine.chime('step', store.settings.chimes);
    trail.say(i, st.wrong ? (voice ? L('other note', 'anderer Ton') : L('old chord', 'alter Akkord')) : Math.abs(ms) < 35 ? L('in time', 'im Takt') : ms > 0 ? L(`${ms} ms late`, `${ms} ms zu spät`) : L(`${-ms} ms early`, `${-ms} ms zu früh`), st.wrong);
  }
  /*
   * The voice: a stone is met by the start of a sung "ta" (an onset); which note it was is told by the
   * pitch heard in the tenth of a second after it. The walk is told the moment of the start, so a voice that
   * needs a moment to settle on the note is not late for it.
   */
  let sung: { t: number; frames: Frame[] } | null = null;
  function decide(): void {
    if (!sung || !walk) return;
    const s = sung;
    sung = null;
    let id: string | null = null;
    if (s.frames.length >= 2) {
      const m = median(s.frames.map((f) => f.midi));
      id = pair.find((c) => Math.abs(centsOff(m, sungMidi(c))) <= 100) ?? 'other';
    }
    landed(walk.strum(s.t, id));
  }
  const stopVoice = voice
    ? hear(
        root,
        {
          onOnset: (e) => {
            if (phase !== 'walk' || !walk) return;
            decide();
            sung = { t: e.time, frames: [] };
          },
          onPitch: (e) => {
            if (!sung) return;
            if (e.time >= sung.t) sung.frames.push({ t: e.time, midi: e.midi + e.cents / 100 });
            if (sung.frames.length >= 5 || e.time > sung.t + 0.2) decide();
          },
        },
        voiceEars,
      )
    : () => undefined;
  // a start that brought no pitch with it is decided after a moment, as a stone met on no note in particular
  const pending = voice
    ? window.setInterval(() => {
        if (sung && (engine.listener?.time ?? 0) > sung.t + 0.25) decide();
      }, 60)
    : 0;
  const stopHear = voice ? stopVoice : hear(
    root,
    {
      onChord: (e) => {
        if (phase === 'brief') {
          if (fromInstrument() && sure(e) && e.score > 0.7) begin();
          return;
        }
        if (phase !== 'walk' || !walk) return;
        landed(walk.strum(e.time, sure(e) ? e.best : null));
      },
    },
    (l) => {
      if (piano) pianoEars(l);
      l.noteDetection = false;
      l.chordCandidates = pair;
    },
  );
  const stopKeys = keys({
    ' ': () => (phase === 'brief' ? begin() : phase === 'done' && !closing ? rerun() : finish()),
    '-': () => tempo(-1),
    '+': () => tempo(1),
    '=': () => tempo(1),
    '1': () => (location.hash = '/stride/' + PATTERNS[0].id),
    '2': () => (location.hash = '/stride/' + PATTERNS[1].id),
    '3': () => (location.hash = '/stride/' + PATTERNS[2].id),
    '4': () => (location.hash = '/stride/' + PATTERNS[3].id),
  });
  function dispose(): void {
    cancelAnimationFrame(raf);
    clearTimeout(closing);
    clearInterval(pending);
    engine.clearTicks();
    stopHear();
    stopKeys();
    setSimTarget(null);
    delete root.dataset.step;
  }

  brief();
  raf = requestAnimationFrame(frame);
  if (again) begin();
  return () => {
    if (restarted) restarted();
    else dispose();
  };
};
