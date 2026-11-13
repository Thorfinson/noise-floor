/**
 * Singing. Four screens: finding the range of the voice, matching a tone the app plays, holding a tone
 * steadily, and singing a song, line by line, on the same three rungs as an instrument (the app waits for
 * each note, then with the click, then the whole song at full speed). What is sung is shown on the pitch
 * lane: the notes as bars, the voice as a line. A note counts when the voice has stayed near it for a
 * moment; the octave does not matter, so a low voice and a high one sing the same songs.
 */
import { engine } from '../audio/engine';
import { mixInto, voiceTone } from '../audio/synth';
import { L } from '../core/i18n';
import { TEMPOS } from '../core/playalong';
import { centsOff, fitTo, heldRange, Hold, median, PITCH_LAG, steadiness, type Frame } from '../core/singing';
import { store } from '../core/store';
import { noteTimes } from '../music/content';
import { noteName } from '../music/theory';
import { findSongToSing, sungPhraseKey, type SongToSing } from '../music/voicebook';
import { $, cap, esc, hear, icon, keys, later, stopTimer, voiceEars, type Screen, type SessionCtx } from '../ui/dom';
import { Lane, type LaneLook, type LaneNote } from '../ui/lane';
import { setSimTarget } from '../ui/practice';
import { frame, levelNews, nextStep } from './learn';

export { voiceEars };

/** The voice's range: as measured, or until then one most voices can sing in, a man's an octave below a woman's. */
export function voiceRange(): [number, number] {
  const s = store.settings;
  return s.voiceLow && s.voiceHigh ? [s.voiceLow, s.voiceHigh] : [47, 67];
}
export const rangeMeasured = (): boolean => !!(store.settings.voiceLow && store.settings.voiceHigh);

/**
 * How many semitones a song is moved to lie in this voice: two semitones in from each end, where singing is
 * comfortable (the edges of a range are reached, not sung in), and a little above the middle rather than
 * below it, because an untrained voice tends to sit low.
 */
export function placeFor(s: SongToSing): number {
  const [low, high] = voiceRange();
  const room = high - low >= 12 ? 2 : 1;
  return fitTo(s.phrases.flat().map((n) => n.midi), low + room + 1, high - room);
}

/** "a little higher" and the like, for a voice that is near the note but not on it. */
function direction(off: number): string {
  const a = Math.abs(off);
  if (a <= 15) return L('right on it', 'genau drauf');
  if (off < 0) return a < 60 ? L('a little higher', 'etwas höher') : a < 250 ? L('higher', 'höher') : L('much higher', 'viel höher');
  return a < 60 ? L('a little lower', 'etwas tiefer') : a < 250 ? L('lower', 'tiefer') : L('much lower', 'viel tiefer');
}

/** A tone the app sings for the player to hear: the voice of the practice instrument, without vibrato. */
function model(midis: { midi: number; at: number; len: number }[], unit: number): Float32Array | null {
  const ctx = engine.ctx;
  if (!ctx) return null;
  const sr = ctx.sampleRate;
  const end = Math.max(...midis.map((m) => m.at + m.len)) * unit + 0.4;
  const out = new Float32Array(Math.ceil(end * sr));
  midis.forEach((m, i) => mixInto(out, voiceTone({ sr, midi: m.midi, dur: Math.max(0.25, m.len * unit - 0.04), vibrato: 8, scoop: 10, amp: 0.2, seed: i + 1 }), m.at * unit * sr));
  return out;
}

/**
 * The parts every singing screen shares: the listener set for a voice, the readings of the voice as frames,
 * and whether a model the app is singing is to be ignored (the microphone hears it too).
 */
function voiceListener(root: HTMLElement, onFrame: (f: Frame) => void, onOnset?: (t: number) => void): { stop: () => void; quiet: (seconds: number) => void; listening: () => boolean } {
  let until = 0;
  // a reading an octave away from the one just before is the pitch tracker slipping, not the voice: a voice
  // cannot jump that far in a fiftieth of a second. Moved back, unless it stays there (then the voice did jump).
  let prev: Frame | null = null;
  let slipSince = -1;
  const stop = hear(
    root,
    {
      onPitch: (e) => {
        if (performance.now() < until) return;
        let midi = e.midi + e.cents / 100;
        if (prev && e.time - prev.t < 0.1) {
          const d = midi - prev.midi;
          const oct = Math.round(d / 12);
          if (oct && Math.abs(d - oct * 12) < 1.5) {
            if (slipSince < 0) slipSince = e.time;
            if (e.time - slipSince < 0.15) midi -= oct * 12;
            else slipSince = -1;
          } else slipSince = -1;
        } else slipSince = -1;
        const f = { t: e.time, midi };
        prev = f;
        onFrame(f);
      },
      onOnset: (e) => {
        if (performance.now() >= until) onOnset?.(e.time);
      },
    },
    voiceEars,
  );
  return {
    stop: () => {
      stop();
      if (engine.listener) engine.listener.pitchClarity = 0.8;
    },
    /** what is heard in the next so many seconds is the app's own voice */
    quiet: (seconds) => (until = performance.now() + seconds * 1000),
    listening: () => performance.now() >= until,
  };
}

const voiceSim = (midi: number | null): void => setSimTarget(midi === null ? null : { kind: 'note', midi, voice: true });

/* ───────────────────────── finding the range ───────────────────────── */

/**
 * Finding the range: a low note held, then a high one, both as far as is comfortable, never pressed. What
 * is held is kept as the voice's range; songs are moved into it.
 */
export const voiceRangeTest: Screen = (root, _params, ctx) => {
  let phase: 'low' | 'high' | 'done' = 'low';
  let frames: Frame[] = [];
  let low = 0;
  let high = 0;
  let timer = 0;
  root.innerHTML = frame(
    `<b>${L('Your range', 'Dein Stimmumfang')}</b>`,
    `<div class="head"><div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div></div>
     <canvas class="lane tall" id="lane" role="img" aria-label="${L('Pitch lane: one row for each note, low at the bottom; the dot is your voice', 'Tonhöhen-Spur: eine Zeile für jeden Ton, tief unten; der Punkt ist deine Stimme')}"></canvas>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('Sing on “ah”, at a comfortable loudness.', 'Sing auf „ah“, in angenehmer Lautstärke.')}</p></div>`,
    `<div class="grp"><button class="btn" id="again">${L('Start over', 'Von vorn')} <kbd>R</kbd></button><button class="btn" id="fwd"><span id="fwdl"></span> <kbd>→</kbd></button>${nextStep(ctx)}</div>`,
    ctx,
  );
  const lane = new Lane($<HTMLCanvasElement>('#lane', root));
  lane.setRange(38, 84);
  let voice: number | null = null;
  let lastT = -1;

  function draw(): void {
    const label = ctx ? ctx.label + ' · ' : '';
    $('#eb', root).textContent = `${label}${L('Your range', 'Dein Stimmumfang')} · ${phase === 'low' ? L('1 of 2: low', '1 von 2: tief') : phase === 'high' ? L('2 of 2: high', '2 von 2: hoch') : L('measured', 'gemessen')}`;
    if (phase === 'low') {
      $('#h1', root).innerHTML = L('Sing a <em>low</em> note and hold it.', 'Sing einen <em>tiefen</em> Ton und halte ihn.');
      $('#sub', root).textContent = L('Glide down on “ah” until it is low but still easy, and stay there for a second. No pressing, no growl.', 'Gleite auf „ah“ nach unten, bis es tief, aber noch leicht ist, und bleib eine Sekunde dort. Nicht drücken, nicht knurren.');
    } else if (phase === 'high') {
      $('#h1', root).innerHTML = L('Now a <em>high</em> note, and hold it.', 'Jetzt einen <em>hohen</em> Ton, und halte ihn.');
      $('#sub', root).textContent = L('Glide up until it is high but not strained. It may go light or into a thinner voice: that is fine. Hold it for a second.', 'Gleite nach oben, bis es hoch, aber nicht angestrengt ist. Die Stimme darf leicht und dünner werden: das ist gut so. Halte ihn eine Sekunde.');
    } else {
      $('#h1', root).innerHTML = L(`From <em>${noteName(low)}</em> to <em>${noteName(high)}</em>.`, `Von <em>${noteName(low)}</em> bis <em>${noteName(high)}</em>.`);
      $('#sub', root).textContent = L(
        `${high - low} semitones. Songs are now set a little inside this range, so that their lowest and highest notes stay easy. The range grows with practice: measure it again in a few weeks.`,
        `${high - low} Halbtöne. Songs liegen jetzt etwas innerhalb dieses Umfangs, damit ihr tiefster und höchster Ton leicht bleiben. Der Umfang wächst mit dem Üben: miss ihn in ein paar Wochen noch einmal.`,
      );
    }
    $('#fwdl', root).textContent = phase === 'done' ? L('Once more', 'Nochmal') : L('Skip', 'Überspringen');
    // in the session the step's own button goes on; this one is not needed twice
    $('#fwd', root).hidden = phase === 'done' && !!ctx;
    voiceSim(phase === 'low' ? 45 : phase === 'high' ? 66 : null);
  }

  function paint(): void {
    const band: [number, number] | undefined = phase === 'done' ? [low, high] : phase === 'high' && low ? [low, low] : undefined;
    lane.draw({ look: () => 'up', at: null, trail: [], voice, tol: store.settings.voiceTol, hold: 0, band });
  }

  function onFrame(f: Frame): void {
    if (phase === 'done') return;
    voice = f.midi;
    lastT = f.t;
    frames.push(f);
    // what has been held for long enough: the lowest of it in the low part, the highest in the high part
    const r = heldRange(frames.filter((x) => x.t > f.t - 2.5), 0.7);
    if (r) {
      if (phase === 'low') {
        low = r.low;
        phase = 'high';
        frames = [];
        say('good', `${icon('check')}${L(`Low: ${noteName(low)}.`, `Tief: ${noteName(low)}.`)}`);
      } else if (r.high >= low + 5) {
        high = r.high;
        finish();
      }
      draw();
    }
    paint();
  }

  function say(cls: string, html: string): void {
    const el = $('#fbk', root);
    el.className = 'fbk ' + cls;
    el.innerHTML = html;
  }

  function finish(): void {
    phase = 'done';
    store.settings.voiceLow = low;
    store.settings.voiceHigh = high;
    store.save();
    say('good', `${icon('check')}${L('Saved. The songs follow your voice now.', 'Gespeichert. Die Songs richten sich jetzt nach deiner Stimme.')}`);
    if (ctx) timer = later(5000, ctx.next, ctx.after);
  }

  function start(): void {
    stopTimer(timer);
    phase = 'low';
    frames = [];
    low = high = 0;
    say('info', L('The app listens. Nothing is recorded.', 'Die App hört zu. Nichts wird aufgenommen.'));
    draw();
    paint();
  }

  const ear = voiceListener(root, onFrame);
  const fade = window.setInterval(() => {
    if (voice !== null && (engine.listener?.time ?? 0) - lastT > 0.25) {
      voice = null;
      paint();
    }
  }, 120);
  const forward = (): void => {
    if (phase === 'done') return ctx ? ctx.next() : start();
    if (phase === 'low') {
      // skipped: the range stays as it was
      phase = 'high';
      frames = [];
      low = low || voiceRange()[0];
      draw();
      return;
    }
    high = high || voiceRange()[1];
    finish();
    draw();
  };
  const stopKeys = keys({ r: start, ArrowRight: forward });
  $('#again', root).onclick = start;
  $('#fwd', root).onclick = forward;
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  start();
  return () => {
    stopTimer(timer);
    clearInterval(fade);
    ear.stop();
    stopKeys();
    setSimTarget(null);
  };
};

/* ───────────────────────── matching a tone ───────────────────────── */

const ROUNDS = 5;

/**
 * Matching a tone: the app sings a note, the player sings it back and holds it. Five notes from the middle
 * of the voice. What is measured is how far off the notes that were found were, on average, in cents.
 */
export const pitchMatch: Screen = (root, _params, ctx) => {
  const [low, high] = voiceRange();
  const mid = Math.round((low + high) / 2);
  let targets: number[] = [];
  let round = 0;
  let hold: Hold | null = null;
  let results: (number | null)[] = [];
  let tries = 0;
  let voice: number | null = null;
  let lastT = -1;
  let timer = 0;
  let state: 'listen' | 'sing' | 'done' = 'listen';
  const tol = store.settings.voiceTol;

  root.innerHTML = frame(
    `<b>${L('Match the tone', 'Töne treffen')}</b>`,
    `<div class="head"><div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div></div>
     <canvas class="lane" id="lane" role="img" aria-label="${L('Pitch lane: the bar is the note to sing, the dot is your voice', 'Tonhöhen-Spur: der Balken ist der Ton zum Singen, der Punkt ist deine Stimme')}"></canvas>
     <div class="tiles" id="tiles" role="list" aria-label="${L('The notes of this round', 'Die Töne dieser Runde')}"></div>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('Sing on “ah”. Any octave counts.', 'Sing auf „ah“. Jede Oktave zählt.')}</p></div>`,
    `<div class="grp"><button class="btn" id="hearit">${L('Hear it again', 'Nochmal anhören')} <kbd>H</kbd></button><button class="btn" id="again">${L('Start over', 'Von vorn')} <kbd>R</kbd></button><button class="btn" id="fwd"><span id="fwdl"></span> <kbd>→</kbd></button>${nextStep(ctx)}</div>`,
    ctx,
  );
  const lane = new Lane($<HTMLCanvasElement>('#lane', root));

  function say(cls: string, html: string): void {
    const el = $('#fbk', root);
    el.className = 'fbk ' + cls;
    el.innerHTML = html;
  }

  function paint(): void {
    const t = engine.listener?.time ?? 0;
    lane.draw({ look: () => (state === 'done' ? 'done' : 'cur'), at: null, trail: [], voice: voice === null ? null : lane.fold(voice), dotAt: 0, hold: hold ? hold.progress(t) / hold.need : 0, tol });
  }

  function draw(): void {
    const target = targets[Math.min(round, ROUNDS - 1)];
    lane.set([{ midi: target, at: 0, len: 1 }], 1);
    $('#eb', root).textContent = `${ctx ? ctx.label + ' · ' : ''}${L('Match the tone', 'Töne treffen')} · ${state === 'done' ? L('done', 'fertig') : L(`note ${round + 1} of ${ROUNDS}`, `Ton ${round + 1} von ${ROUNDS}`)}`;
    if (state === 'listen') {
      $('#h1', root).innerHTML = L('Listen…', 'Hör zu…');
      $('#sub', root).textContent = L('The app sings a note. Then you.', 'Die App singt einen Ton. Dann du.');
    } else if (state === 'sing') {
      $('#h1', root).innerHTML = L(`Now you: sing <em>${noteName(target)}</em> and hold it.`, `Jetzt du: sing <em>${noteName(target)}</em> und halte ihn.`);
      $('#sub', root).textContent = L('Find the note, then stay on it until the ring around the dot is full.', 'Such den Ton und bleib darauf, bis der Ring um den Punkt voll ist.');
    } else {
      const found = results.filter((r): r is number => r !== null);
      const avg = found.length ? Math.round(found.reduce((a, b) => a + Math.abs(b), 0) / found.length) : 0;
      $('#h1', root).textContent = L(`${found.length} of ${ROUNDS} notes found.`, `${found.length} von ${ROUNDS} Tönen getroffen.`);
      $('#sub', root).textContent = found.length ? L(`On average ${avg} cent${avg === 1 ? '' : 's'} off. A hundred cents are a semitone; under twenty, hardly anyone hears a difference.`, `Im Schnitt ${avg} Cent daneben. Hundert Cent sind ein Halbton; unter zwanzig hört kaum jemand einen Unterschied.`) : '';
    }
    $('#tiles', root).innerHTML = targets
      .map((m, i) => {
        const r = results[i];
        const cls = i === round && state !== 'done' ? 'now' : r === undefined ? '' : r === null ? 'muted' : 'clean';
        const word = i === round && state !== 'done' ? L('now', 'jetzt') : r === undefined ? L('next', 'danach') : r === null ? L('next time', 'nächstes Mal') : `${r > 0 ? '+' : ''}${Math.round(r)} ct`;
        return `<div class="tile ${cls}" role="listitem"><b>${noteName(m).replace(/\d+$/, '')}</b><span>${word}</span></div>`;
      })
      .join('');
    $('#fwdl', root).textContent = state === 'done' ? L('Once more', 'Nochmal') : L('Skip this note', 'Diesen Ton überspringen');
    $('#fwd', root).hidden = state === 'done' && !!ctx;
    voiceSim(state === 'sing' ? target : null);
    paint();
  }

  function play(): void {
    const target = targets[round];
    state = 'listen';
    hold = null;
    draw();
    const sound = model([{ midi: target, at: 0, len: 1 }], 1.2);
    const secs = sound ? engine.demo(sound) : 0;
    ear.quiet(secs + 0.35);
    stopTimer(timer);
    timer = window.setTimeout(() => {
      state = 'sing';
      hold = new Hold(target, tol, 0.6);
      tries = 0;
      say('info', L('Your turn.', 'Du bist dran.'));
      draw();
    }, (secs + 0.35) * 1000);
  }

  function next(result: number | null): void {
    results[round] = result;
    round++;
    if (round >= ROUNDS) return finish();
    timer = window.setTimeout(play, 1300);
    draw();
  }

  function finish(): void {
    state = 'done';
    const found = results.filter((r): r is number => r !== null);
    const avg = found.length ? found.reduce((a, b) => a + Math.abs(b), 0) / found.length : Infinity;
    // a measurement when nearly all were found; otherwise only noted as tried
    let news = '';
    if (found.length >= ROUNDS - 1) news = levelNews([store.skills.record('pitch:match', avg, Date.now())]);
    else store.skills.record('pitch:match', Infinity, Date.now(), Math.round((found.length / ROUNDS) * 6));
    store.save();
    say('good', `${icon('check')}${news || L('Practised.', 'Geübt.')}`);
    draw();
    if (ctx) timer = later(5000, ctx.next, ctx.after);
  }

  function start(): void {
    stopTimer(timer);
    // five notes around the middle of the voice, none twice in a row, steps and small leaps
    targets = [];
    let m = mid;
    for (let i = 0; i < ROUNDS; i++) {
      const step = [-5, -4, -3, -2, 2, 3, 4, 5][Math.floor(Math.random() * 8)];
      m = Math.max(low + 2, Math.min(high - 2, m + (i ? step : 0)));
      targets.push(m);
    }
    round = 0;
    results = [];
    say('info', L('Listen first, then sing it back.', 'Erst zuhören, dann nachsingen.'));
    play();
  }

  function onFrame(f: Frame): void {
    voice = f.midi;
    lastT = f.t;
    if (state === 'sing' && hold) {
      const done = hold.push(f);
      const off = centsOff(f.midi, targets[round]);
      if (done) {
        say('good', `${icon('check')}${noteName(targets[round])}: ${Math.abs(done.cents) <= 15 ? L('right on it.', 'genau getroffen.') : L(`${Math.round(Math.abs(done.cents))} cents ${done.cents > 0 ? 'high' : 'low'}.`, `${Math.round(Math.abs(done.cents))} Cent zu ${done.cents > 0 ? 'hoch' : 'tief'}.`)}`);
        state = 'listen';
        next(done.cents);
      } else if (Math.abs(off) > tol) say('info', cap(direction(off)) + '.');
    }
    paint();
  }

  const ear = voiceListener(root, onFrame);
  const fade = window.setInterval(() => {
    if (voice !== null && (engine.listener?.time ?? 0) - lastT > 0.25) {
      voice = null;
      paint();
    }
  }, 120);
  const forward = (): void => {
    if (state === 'done') return ctx ? ctx.next() : start();
    stopTimer(timer);
    tries++;
    next(null);
  };
  const stopKeys = keys({ r: start, h: () => state !== 'done' && play(), ArrowRight: forward });
  $('#again', root).onclick = start;
  $('#hearit', root).onclick = () => state !== 'done' && play();
  $('#fwd', root).onclick = forward;
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  start();
  return () => {
    stopTimer(timer);
    clearInterval(fade);
    engine.stopDemo();
    ear.stop();
    stopKeys();
    setSimTarget(null);
    void tries;
  };
};

/* ───────────────────────── holding a tone ───────────────────────── */

const HOLD_FOR = 5;

/**
 * Holding a tone: the app sings a note in the middle of the voice, the player holds it for five seconds.
 * What is measured is how steady it was: how far the voice wandered around its own middle, in cents.
 */
export const holdTone: Screen = (root, _params, ctx) => {
  const [low, high] = voiceRange();
  const target = Math.round((low + high) / 2) - 2;
  let frames: Frame[] = [];
  let startT = -1;
  let lastT = -1;
  let voice: number | null = null;
  let state: 'listen' | 'sing' | 'done' = 'listen';
  let timer = 0;
  let trail: { u: number; midi: number }[] = [];
  const tol = store.settings.voiceTol;

  root.innerHTML = frame(
    `<b>${L('Hold a tone', 'Einen Ton halten')}</b>`,
    `<div class="head"><div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div></div>
     <canvas class="lane" id="lane" role="img" aria-label="${L('Pitch lane: the bar is the tone to hold, the line is your voice over five seconds', 'Tonhöhen-Spur: der Balken ist der Ton zum Halten, die Linie ist deine Stimme über fünf Sekunden')}"></canvas>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('Breathe in low, into the belly, before you start.', 'Atme vorher tief in den Bauch ein.')}</p></div>`,
    `<div class="grp"><button class="btn" id="hearit">${L('Hear it again', 'Nochmal anhören')} <kbd>H</kbd></button><button class="btn" id="again">${L('Once more', 'Nochmal')} <kbd>R</kbd></button>${nextStep(ctx)}</div>`,
    ctx,
  );
  const lane = new Lane($<HTMLCanvasElement>('#lane', root));
  lane.set([{ midi: target, at: 0, len: HOLD_FOR }], HOLD_FOR);

  function say(cls: string, html: string): void {
    const el = $('#fbk', root);
    el.className = 'fbk ' + cls;
    el.innerHTML = html;
  }

  function paint(): void {
    const now = engine.listener?.time ?? 0;
    const u = startT < 0 ? 0 : Math.min(HOLD_FOR, now - startT);
    lane.draw({ look: () => (state === 'done' ? 'done' : 'cur'), at: state === 'sing' && startT >= 0 ? u : null, trail, voice: voice === null ? null : lane.fold(voice), dotAt: 0, tol });
  }

  function draw(): void {
    $('#eb', root).textContent = `${ctx ? ctx.label + ' · ' : ''}${L('Hold a tone', 'Einen Ton halten')} · ${noteName(target)}`;
    $('#h1', root).innerHTML = state === 'listen' ? L('Listen…', 'Hör zu…') : state === 'sing' ? L(`Sing <em>${noteName(target)}</em> and hold it for ${HOLD_FOR} seconds.`, `Sing <em>${noteName(target)}</em> und halte ihn ${HOLD_FOR} Sekunden.`) : $('#h1', root).innerHTML;
    $('#sub', root).textContent = state === 'sing' ? L('Keep the line flat: the same loudness, the same vowel, steady breath.', 'Halte die Linie flach: gleiche Lautstärke, gleicher Vokal, ruhiger Atem.') : state === 'listen' ? L('The app sings the tone. Then you.', 'Die App singt den Ton. Dann du.') : $('#sub', root).textContent;
    voiceSim(state === 'sing' ? target : null);
    paint();
  }

  function play(): void {
    stopTimer(timer);
    state = 'listen';
    frames = [];
    trail = [];
    startT = -1;
    draw();
    const sound = model([{ midi: target, at: 0, len: 1 }], 1.4);
    const secs = sound ? engine.demo(sound) : 0;
    ear.quiet(secs + 0.35);
    timer = window.setTimeout(() => {
      state = 'sing';
      say('info', L('Your turn. The count starts when you are on the note.', 'Du bist dran. Gezählt wird, sobald du auf dem Ton bist.'));
      draw();
    }, (secs + 0.35) * 1000);
  }

  function finish(): void {
    state = 'done';
    // the first half second is finding the note: the rest is the hold
    const held = frames.filter((f) => f.t >= startT + 0.5);
    const { spread, cents } = steadiness(held, target);
    const news = held.length >= 20 ? levelNews([store.skills.record('tone:steady', spread, Date.now())]) : '';
    store.save();
    $('#h1', root).textContent = held.length >= 20 ? L(`Steady within ${Math.round(spread)} cents.`, `Ruhig innerhalb von ${Math.round(spread)} Cent.`) : L('Too short to measure.', 'Zu kurz zum Messen.');
    $('#sub', root).textContent =
      held.length >= 20
        ? L(
            `${Math.abs(cents) <= 15 ? 'Right on the note' : `On average ${Math.round(Math.abs(cents))} cents ${cents > 0 ? 'high' : 'low'}`}. A trained voice holds a tone within about ten cents; twenty-five is a good start.`,
            `${Math.abs(cents) <= 15 ? 'Genau auf dem Ton' : `Im Schnitt ${Math.round(Math.abs(cents))} Cent zu ${cents > 0 ? 'hoch' : 'tief'}`}. Eine geübte Stimme hält einen Ton auf etwa zehn Cent genau; fünfundzwanzig sind ein guter Anfang.`,
          )
        : L('The voice has to stay on the note for a few seconds. Breathe in first, then sing.', 'Die Stimme muss ein paar Sekunden auf dem Ton bleiben. Erst einatmen, dann singen.');
    say(held.length >= 20 ? 'good' : 'info', `${held.length >= 20 ? icon('check') : ''}${news}`);
    draw();
    if (ctx) timer = later(6000, ctx.next, ctx.after);
  }

  function onFrame(f: Frame): void {
    voice = f.midi;
    lastT = f.t;
    if (state === 'sing') {
      if (startT < 0 && Math.abs(centsOff(f.midi, target)) <= tol) startT = f.t;
      if (startT >= 0) {
        frames.push(f);
        trail.push({ u: f.t - startT, midi: lane.fold(f.midi) });
        if (f.t - startT >= HOLD_FOR) finish();
      } else say('info', cap(direction(centsOff(f.midi, target))) + '.');
    }
    paint();
  }

  const ear = voiceListener(root, onFrame);
  const tick = window.setInterval(() => {
    const now = engine.listener?.time ?? 0;
    if (voice !== null && now - lastT > 0.25) voice = null;
    // a pause longer than a breath in the middle: the hold is over
    if (state === 'sing' && startT >= 0 && now - lastT > 0.6) finish();
    paint();
  }, 100);
  const stopKeys = keys({ r: play, h: play });
  $('#again', root).onclick = play;
  $('#hearit', root).onclick = play;
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  play();
  return () => {
    stopTimer(timer);
    clearInterval(tick);
    engine.stopDemo();
    ear.stop();
    stopKeys();
    setSimTarget(null);
  };
};

/* ───────────────────────── singing a song ───────────────────────── */

interface SungLine {
  notes: LaneNote[];
  units: number;
  /** clicks, in units from the start of the line */
  clicks: { u: number; accent: boolean }[];
  phrase: number;
}

/** A song to sing, moved into the voice: its phrases as lines. */
function sungLines(s: SongToSing, shift: number): SungLine[] {
  return s.phrases.map((ph, k) => {
    const { at, total } = noteTimes(ph);
    const lead = s.leads?.[k] ?? 0;
    const bar = s.bar ?? 0;
    const clicks: SungLine['clicks'] = [];
    for (let c = lead % s.beat; c < total - 1e-6; c += s.beat) {
      const bars = bar > 0 ? (c - lead) / bar : -1;
      clicks.push({ u: c, accent: bar > 0 ? Math.abs(bars - Math.round(bars)) < 1e-6 : clicks.length === 0 });
    }
    return { notes: ph.map((n, i) => ({ midi: n.midi + shift, at: at[i], len: n.len ?? 1 })), units: total, clicks, phrase: k };
  });
}

const RUNGS = (): string[] => [L('Learn', 'Lernen'), L('With the click', 'Mit Klick'), L('Full speed', 'Volles Tempo')];

/**
 * A song, sung. Rung 1: the app waits for each note to be held. Rung 2: line by line with the click, a note
 * counting when the voice lay on it for most of its length. Rung 3: from this line to the end at full speed.
 */
export const singLesson: Screen = (root, [id, rung], ctx) => {
  const song = findSongToSing(id);
  if (!ctx && store.current.voice !== song.id) {
    store.current.voice = song.id;
    store.save();
  }
  const shift = placeFor(song);
  const lines = sungLines(song, shift);
  const n = lines.length;
  const tol = store.settings.voiceTol;
  let line = Math.min(n - 1, store.progress[song.id] ?? 0);
  const level = (k: number): number => store.skills.level(sungPhraseKey(song, k));
  let stage = rung === '1' ? 0 : rung === '2' ? 1 : rung === '3' ? 2 : level(line) < 1 ? 0 : lines.every((_, k) => level(k) >= 3) ? 2 : 1;
  let tempo = stage === 1 ? (TEMPOS.find((t) => t >= 50 && t > (store.skills.get(sungPhraseKey(song, line))?.best ?? 0)) ?? 100) : 50;
  let mode: { stop: () => void; frame: (f: Frame) => void; onset: (t: number) => void; toggle: () => void } | null = null;
  let linesDone = 0;
  let voice: number | null = null;
  let lastT = -1;

  root.innerHTML = frame(
    '',
    `<div class="head">
       <div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div>
       <div class="ladder" role="group" aria-label="${L('How to practise', 'Wie üben')}">${RUNGS().map((r, i) => `<button class="rung" id="st${i}" aria-pressed="false"><b>${i + 1}</b><span>${r}<small id="st${i}s"></small></span></button>`).join('')}</div>
     </div>
     <canvas class="lane" id="lane" role="img" aria-label="${L('Pitch lane, read left to right: each bar is a note to sing, higher bars are higher notes; the line is your voice', 'Tonhöhen-Spur, von links nach rechts zu lesen: jeder Balken ist ein Ton zum Singen, höhere Balken sind höhere Töne; die Linie ist deine Stimme')}"></canvas>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('Sing on “la” or “loo”. Any octave counts.', 'Sing auf „la“ oder „lu“. Jede Oktave zählt.')}</p></div>`,
    `<div class="grp"><button class="btn quiet" id="prev">${icon('left')}${L('Previous', 'Zurück')} <kbd>←</kbd></button><button class="btn" id="again">${L('Again', 'Nochmal')} <kbd>R</kbd></button><button class="btn" id="hearit">${L('Hear it', 'Anhören')} <kbd>H</kbd></button><button class="btn quiet" id="next">${L('Next', 'Weiter')} <kbd>→</kbd>${icon('right')}</button>${nextStep(ctx)}</div>
     <div class="grp" id="tempobox" hidden><button class="btn quiet" id="slower">${L('Slower', 'Langsamer')} <kbd>−</kbd></button><b id="tempo"></b><button class="btn quiet" id="faster">${L('Faster', 'Schneller')} <kbd>+</kbd></button><button class="btn" id="pause"><span>${L('Pause', 'Pause')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button></div>
     <p class="auto" id="auto"></p>`,
    ctx,
    ['#/songs', L('Songs', 'Songs')],
  );
  const lane = new Lane($<HTMLCanvasElement>('#lane', root));
  const say = (cls: string, html: string): void => {
    const el = $('#fbk', root);
    el.className = 'fbk ' + cls;
    el.innerHTML = html;
  };
  const where = (li: number): void => {
    $('#where', root).innerHTML = `<b>${esc(song.title)}</b>${song.by ? ` · ${esc(song.by)}` : ''} · ${L(`phrase ${li + 1} of ${n}`, `Phrase ${li + 1} von ${n}`)}`;
  };

  /** "Hear it": the line sung by the app, a little slower than full speed. */
  let modelUntil = 0;
  function hearIt(): void {
    if (stage !== 0) return;
    const l = lines[line];
    const unit = song.noteDur / 0.75;
    const sound = model(l.notes, unit);
    if (!sound) return;
    const secs = engine.demo(sound);
    ear.quiet(secs + 0.3);
    modelUntil = performance.now() + (secs + 0.3) * 1000;
    say('info', L(`Listen: this is how the phrase goes.`, `Hör zu: so geht die Phrase.`));
    window.setTimeout(() => performance.now() >= modelUntil - 50 && say('info', L('Now you.', 'Jetzt du.')), (secs + 0.3) * 1000);
  }

  /** Rung 1: the app waits until each note has been held. */
  function waitMode(): typeof mode {
    const l = lines[line];
    let at = 0;
    let hold = new Hold(l.notes[0].midi, tol, 0.25);
    /** the note before was the same: a new one has to begin (a new syllable, a breath) before this one counts */
    let fresh = true;
    const times: number[] = [];
    let slips = 0;
    let wrongSince = -1;
    let timer = 0;
    lane.set(l.notes, l.units);
    $('#tempobox', root).hidden = true;
    $('#hearit', root).hidden = false;
    $('#auto', root).hidden = false;
    $('#auto', root).textContent = L('Waits until it hears each note held. No rush.', 'Wartet, bis es jeden Ton gehalten hört. Keine Eile.');

    function draw(): void {
      const done = at >= l.notes.length;
      const cur = l.notes[Math.min(at, l.notes.length - 1)];
      where(line);
      $('#eb', root).textContent = `${ctx ? `${ctx.label} · ${song.title} · ` : ''}${L(`Phrase ${line + 1} of ${n} · the app waits for you`, `Phrase ${line + 1} von ${n} · die App wartet auf dich`)}`;
      $('#h1', root).innerHTML = done ? L('Phrase done.', 'Phrase geschafft.') : L(`Sing <em>${noteName(cur.midi)}</em>.`, `Sing <em>${noteName(cur.midi)}</em>.`);
      const prev = at > 0 ? l.notes[at - 1] : null;
      $('#sub', root).textContent = done
        ? ''
        : !fresh
          ? L('The same note again: a new “la” on it.', 'Derselbe Ton noch einmal: ein neues „la“ darauf.')
          : prev
            ? cur.midi === prev.midi
              ? ''
              : L(`${Math.abs(cur.midi - prev.midi)} semitone${Math.abs(cur.midi - prev.midi) === 1 ? '' : 's'} ${cur.midi > prev.midi ? 'up' : 'down'} from the last.`, `${Math.abs(cur.midi - prev.midi)} Halbt${Math.abs(cur.midi - prev.midi) === 1 ? 'on' : 'öne'} ${cur.midi > prev.midi ? 'höher' : 'tiefer'} als der letzte.`)
            : L('The first note. “Hear it” sings the phrase for you.', 'Der erste Ton. „Anhören“ singt dir die Phrase vor.');
      voiceSim(done ? null : cur.midi);
      paint();
    }
    function paint(): void {
      const now = engine.listener?.time ?? 0;
      lane.draw({ look: (i) => (i < at ? 'done' : i === at ? 'cur' : 'up'), at: null, trail: [], voice: voice === null ? null : lane.fold(voice), dotAt: Math.min(at, l.notes.length - 1), hold: fresh ? hold.progress(now) / hold.need : 0, tol });
    }
    function finish(): void {
      const written = (l.notes[l.notes.length - 1].at - l.notes[0].at) * song.noteDur;
      const took = times[times.length - 1] - times[0];
      const speed = took > 0 && written > 0 ? (written / took) * 100 : 0;
      const news = !slips && speed > 0 ? levelNews([store.skills.record(sungPhraseKey(song, line), speed, Date.now())]) : '';
      linesDone++;
      store.progress[song.id] = (line + 1) % n;
      store.save();
      const leave = !!ctx && linesDone >= 2;
      say('good', `${icon('check')}${speed ? L(`${Math.round(speed)}% of full speed, `, `${Math.round(speed)}% vom vollen Tempo, `) : ''}${slips ? L(`${slips} ${slips === 1 ? 'slip' : 'slips'}`, `${slips} ${slips === 1 ? 'Patzer' : 'Patzer'}`) : L('no slips', 'keine Patzer')}.${news} ${leave ? L('That is the song for today.', 'Das war der Song für heute.') : L('Next phrase in a moment.', 'Gleich die nächste Phrase.')}`);
      draw();
      timer = later(2800, () => (leave ? ctx!.next() : go(line + 1)), leave ? ctx!.after : L('the next phrase', 'die nächste Phrase'));
    }
    say('info', L('Read left to right. A higher bar is a higher note.', 'Von links nach rechts lesen. Ein höherer Balken ist ein höherer Ton.'));
    draw();
    return {
      stop: () => stopTimer(timer),
      toggle: () => undefined,
      onset: () => {
        fresh = true;
      },
      frame: (f) => {
        if (at >= l.notes.length) return;
        const cur = l.notes[at];
        if (!fresh) {
          // a breath or a new syllable on the same note: a gap in the voice, or a clear onset
          if (f.t - lastT > 0.09) fresh = true;
          else return paint();
        }
        const held = hold.push(f);
        if (held) {
          times[at] = held.from;
          at++;
          wrongSince = -1;
          if (at >= l.notes.length) return finish();
          const next = l.notes[at];
          fresh = centsOff(next.midi, cur.midi) !== 0;
          hold = new Hold(next.midi, tol, 0.25);
          say('good', `${icon('check')}${noteName(cur.midi)}: ${L('right.', 'richtig.')}`);
          draw();
          return;
        }
        const off = centsOff(f.midi, cur.midi);
        // still on the note just sung, on the way to this one: that is waiting, not a slip
        const before = at > 0 ? l.notes[at - 1].midi : null;
        if (before !== null && Math.abs(centsOff(f.midi, before)) <= tol) {
          wrongSince = -1;
          return paint();
        }
        if (Math.abs(off) > tol) {
          if (wrongSince < 0) wrongSince = f.t;
          // held clearly elsewhere for a moment: a slip, and which way to go
          if (f.t - wrongSince > 0.5) {
            if (f.t - wrongSince < 0.55) slips++;
            say('bad', L(`You are on ${noteName(Math.round(lane.fold(f.midi)))}. This one is ${noteName(cur.midi)}: ${direction(off)}.`, `Du bist auf ${noteName(Math.round(lane.fold(f.midi)))}. Dieser ist ${noteName(cur.midi)}: ${direction(off)}.`));
          }
        } else wrongSince = -1;
        paint();
      },
    };
  }

  /** Rungs 2 and 3: with the click. A note counts when the voice lay on it for most of its length. */
  function clickMode(): typeof mode {
    const whole = stage === 2;
    if (whole) tempo = 100;
    const idxs = whole ? lines.map((_, i) => i).slice(line) : [line];
    // the lines one after the other, as one
    let u0 = 0;
    const notes: (LaneNote & { line: number })[] = [];
    const clicks: { u: number; accent: boolean }[] = [];
    for (const li of idxs) {
      for (const nt of lines[li].notes) notes.push({ ...nt, at: nt.at + u0, line: li });
      for (const c of lines[li].clicks) clicks.push({ u: c.u + u0, accent: c.accent });
      u0 += lines[li].units;
    }
    const units = u0;
    const count = song.count ?? 4;
    let raf = 0;
    let timer = 0;
    let unit = 1;
    let t0 = 0;
    let latency = 0;
    let running = false;
    let heard: Frame[] = [];
    let trail: { u: number; midi: number }[] = [];
    const state: ('up' | 'done' | 'close' | 'miss')[] = notes.map(() => 'up');
    lane.set(notes, units);
    $('#tempobox', root).hidden = false;
    $<HTMLButtonElement>('#slower', root).disabled = whole;
    $<HTMLButtonElement>('#faster', root).disabled = whole;
    $('#auto', root).hidden = true;
    $('#hearit', root).hidden = true;

    function begin(): void {
      cancel();
      unit = (song.noteDur * 100) / tempo;
      const beat = song.beat * unit;
      const start = engine.now() + 0.5;
      const upbeat = lines[idxs[0]].clicks[0]?.u ?? 0;
      t0 = start + count * beat - upbeat * unit;
      // what the microphone hears arrives late, and a pitch is named a moment after that
      latency = (engine.micOn ? (store.settings.latency >= 0 ? store.settings.latency : engine.latencyEstimate()) : 0) + PITCH_LAG;
      const vol = store.settings.click;
      const low = store.settings.clickSound === 'click';
      for (let k = 0; k < count; k++) engine.tick(start + k * beat, k === 0, vol, low);
      for (const c of clicks) engine.tick(t0 + c.u * unit, c.accent, vol, low);
      heard = [];
      trail = [];
      state.fill('up');
      running = true;
      $('#tempo', root).textContent = `${tempo}%`;
      $('#pause span', root).textContent = L('Pause', 'Pause');
      say('info', whole ? L('Sing each note as the line reaches it, from here to the end.', 'Sing jeden Ton, wenn die Linie ihn erreicht, von hier bis zum Ende.') : L('Sing each note as the line reaches it.', 'Sing jeden Ton, wenn die Linie ihn erreicht.'));
      raf = requestAnimationFrame(tick);
    }
    function cancel(): void {
      cancelAnimationFrame(raf);
      stopTimer(timer);
      engine.clearTicks();
      running = false;
    }
    /**
     * How note i was sung: one pitch for the note, the middle of what was heard in it, leaving out the first
     * fifth of a second (the voice slides into a note) and the last tenth (it leaves for the next). On it within
     * the tolerance; close within twice it (shown, not counted against the singer); otherwise missed.
     */
    function judge(i: number): 'done' | 'close' | 'miss' {
      const nt = notes[i];
      const len = nt.len * unit;
      const a = t0 + nt.at * unit + Math.min(0.2, len * 0.3) + latency;
      const b = t0 + nt.at * unit + len - Math.min(0.1, len * 0.15) + latency;
      const inside = heard.filter((f) => f.t >= a && f.t <= b);
      if (inside.length < 2) return 'miss';
      const off = Math.abs(median(inside.map((f) => centsOff(f.midi, nt.midi))));
      return off <= tol ? 'done' : off <= 2 * tol ? 'close' : 'miss';
    }
    function tick(): void {
      raf = requestAnimationFrame(tick);
      const now = engine.now();
      const u = (now - t0) / unit;
      // notes whose time is over (and whose readings have arrived) are judged
      notes.forEach((nt, i) => {
        if (state[i] === 'up' && now > t0 + (nt.at + nt.len) * unit + latency + 0.15) state[i] = judge(i);
      });
      const cur = notes.findIndex((nt) => u < nt.at + nt.len);
      const li = cur >= 0 ? notes[cur].line : idxs[idxs.length - 1];
      where(li);
      $('#eb', root).textContent = `${ctx ? `${ctx.label} · ${song.title} · ` : ''}${whole ? L('Full speed, to the end', 'Volles Tempo, bis zum Ende') : L(`Phrase ${line + 1} of ${n} · with the click at ${tempo}%`, `Phrase ${line + 1} von ${n} · mit Klick bei ${tempo}%`)}`;
      $('#h1', root).innerHTML = u < 0 ? L(`Get ready: <em>${Math.min(count, Math.ceil(-u / song.beat))}</em>`, `Mach dich bereit: <em>${Math.min(count, Math.ceil(-u / song.beat))}</em>`) : cur >= 0 ? `<em>${noteName(notes[cur].midi)}</em>` : '';
      $('#sub', root).textContent = '';
      voiceSim(cur >= 0 && u > notes[cur].at - 0.2 ? notes[cur].midi : null);
      root.dataset.step = String(notes.filter((nt) => now >= t0 + nt.at * unit).length - 1);
      lane.draw({ look: (i) => (state[i] === 'up' ? (i === cur ? 'cur' : 'up') : state[i]), at: u, trail, voice: voice === null ? null : lane.fold(voice), tol });
      if (now > t0 + units * unit + latency + 0.3 && state.every((s) => s !== 'up')) done();
    }
    function done(): void {
      cancel();
      delete root.dataset.step;
      const hits = state.filter((s) => s === 'done').length;
      const close = state.filter((s) => s === 'close').length;
      const changes = [];
      const now = Date.now();
      for (const li of idxs) {
        const mine = notes.map((nt, i) => (nt.line === li ? i : -1)).filter((i) => i >= 0);
        if (mine.every((i) => state[i] === 'done')) changes.push(store.skills.record(sungPhraseKey(song, li), tempo, now));
      }
      const clean = hits === notes.length;
      let then: string;
      let leave = false;
      if (whole) {
        store.progress[song.id] = 0;
        leave = !!ctx;
        then = clean ? L('That is the whole song at full speed.', 'Das war der ganze Song im vollen Tempo.') : L('Press R or Space to sing it again.', 'Drück R oder die Leertaste, um ihn nochmal zu singen.');
      } else if (clean) {
        linesDone++;
        store.progress[song.id] = (line + 1) % n;
        leave = !!ctx && linesDone >= 2;
        if (line === n - 1 && tempo < 100) tempo = TEMPOS[TEMPOS.indexOf(tempo) + 1] ?? 100;
        then = leave ? L('That is it for today.', 'Das war es für heute.') : L('Next phrase.', 'Nächste Phrase.');
      } else {
        if (hits + close < 0.6 * notes.length && tempo > TEMPOS[0]) tempo = TEMPOS[Math.max(0, TEMPOS.indexOf(tempo) - 1)];
        then = L('Once more.', 'Nochmal.');
      }
      store.save();
      const near = close ? L(` ${close} close (amber): nearly there.`, ` ${close} knapp daneben (gelb): fast.`) : '';
      say(clean ? 'good' : 'info', `${clean ? icon('check') : ''}${L(`${hits} of ${notes.length} notes on pitch at ${tempo}%.`, `${hits} von ${notes.length} Tönen getroffen bei ${tempo}%.`)}${near}${levelNews(changes)} ${then}`);
      $('#h1', root).textContent = clean ? L('Clean.', 'Sauber.') : L(`${hits} of ${notes.length}.`, `${hits} von ${notes.length}.`);
      if (leave) timer = later(3200, ctx!.next, ctx!.after);
      else if (!whole) timer = later(2600, () => go(clean ? line + 1 : line), clean ? L('the next phrase', 'die nächste Phrase') : L('the same phrase again', 'noch einmal dieselbe Phrase'));
      else $('#pause span', root).textContent = L('Play', 'Start');
    }
    begin();
    return {
      stop: cancel,
      toggle: () => {
        if (running) {
          cancel();
          $('#h1', root).textContent = L('Paused.', 'Pausiert.');
          $('#pause span', root).textContent = L('Play', 'Start');
        } else begin();
      },
      onset: () => undefined,
      frame: (f) => {
        if (!running) return;
        heard.push(f);
        trail.push({ u: (f.t - latency - t0) / unit, midi: lane.fold(f.midi) });
      },
    };
  }

  function setStage(s: number): void {
    mode?.stop();
    stage = s;
    RUNGS().forEach((_, i) => $('#st' + i, root).setAttribute('aria-pressed', String(i === s)));
    $('#st0s', root).textContent = L('waits for you', 'wartet auf dich');
    $('#st1s', root).textContent = L(`phrase by phrase, ${tempo}%`, `Phrase für Phrase, ${tempo}%`);
    $('#st2s', root).textContent = L('start to end', 'von Anfang bis Ende');
    mode = s === 0 ? waitMode() : clickMode();
  }
  function go(li: number): void {
    engine.stopDemo();
    line = (li + n) % n;
    setStage(stage);
  }
  function setTempo(step: number): void {
    if (stage !== 1) return;
    tempo = TEMPOS[Math.max(0, Math.min(TEMPOS.length - 1, TEMPOS.indexOf(tempo) + step))];
    setStage(1);
  }

  const ear = voiceListener(
    root,
    (f) => {
      voice = f.midi;
      mode?.frame(f);
      lastT = f.t;
    },
    (t) => mode?.onset(t),
  );
  const fade = window.setInterval(() => {
    if (voice !== null && (engine.listener?.time ?? 0) - lastT > 0.25) voice = null;
  }, 120);
  const stopKeys = keys({
    ArrowLeft: () => go(line - 1),
    ArrowRight: () => go(line + 1),
    r: () => go(line),
    h: hearIt,
    '1': () => setStage(0),
    '2': () => setStage(1),
    '3': () => setStage(2),
    '-': () => setTempo(-1),
    '+': () => setTempo(1),
    '=': () => setTempo(1),
    ' ': () => mode?.toggle(),
  });
  $('#prev', root).onclick = () => go(line - 1);
  $('#next', root).onclick = () => go(line + 1);
  $('#again', root).onclick = () => go(line);
  $('#hearit', root).onclick = hearIt;
  $('#slower', root).onclick = () => setTempo(-1);
  $('#faster', root).onclick = () => setTempo(1);
  $('#pause', root).onclick = () => mode?.toggle();
  RUNGS().forEach((_, i) => ($('#st' + i, root).onclick = () => setStage(i)));
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  setStage(stage);
  return () => {
    mode?.stop();
    clearInterval(fade);
    engine.stopDemo();
    ear.stop();
    stopKeys();
    setSimTarget(null);
  };
};

export type { LaneLook, SessionCtx };
