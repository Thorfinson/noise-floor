/**
 * By ear: the app plays, the player plays it back on the instrument, without looking. Three kinds:
 * - motifs: two to four notes from the song being learned, played back before the tab is shown;
 * - chords: one of the chords the player knows, strummed (or struck) by the app, and told apart by playing it;
 * - sing, then play: the motif sung first, then found on the instrument.
 * Playing by ear goes with improvising, playing from memory and sight-reading (McPherson's five ways of
 * making music); most apps leave it out, or test it with buttons on a screen. Here the microphone judges it
 * on the real instrument. The motifs come from the player's own song, so that this is practice for it too.
 */
import { engine } from '../audio/engine';
import { mixInto, strum, tone } from '../audio/synth';
import { L } from '../core/i18n';
import { centsOff, Hold, type Frame } from '../core/singing';
import { store } from '../core/store';
import { guitarA4 } from '../music/tuning';
import { KEY_CHORDS, songLines, tabMidi, type Song } from '../music/content';
import { chordKey, currentPiece, currentSong, piecesByDifficulty, songProfile, songsByDifficulty } from '../music/difficulty';
import { OPEN_CHORDS } from '../music/path';
import { chordName, chordNotes, CHORDS, midiToTab, noteName, pianoChord, strumIs } from '../music/theory';
import { $, cap, esc, hear, icon, keys, later, pianoEars, stopTimer, type Screen } from '../ui/dom';
import { keyboard, keyRange, LEARN, tabLine } from '../ui/draw';
import { setSimTarget } from '../ui/practice';
import { frame, levelNews, nextStep } from './learn';
import { direction, model, voiceListener, voiceRange } from './sing';

export type EarKind = 'motif' | 'chords' | 'sing';

/** The skill a round of a kind measures, on the guitar or the piano. */
export const earKey = (kind: EarKind, piano: boolean): string => `ear:${piano ? 'p.' : ''}${kind}`;

/** A seeded random, so that a round can be repeated in the tests. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Where the motifs come from: the single notes of the song or piece being learned, line by line. A song of
 * strummed chords has none, and then the easiest tune of the book stands in.
 */
export function motifSource(piano: boolean): { title: string; lines: number[][] } {
  const notesOfSong = (s: Song): number[][] => songLines(s).map((bars) => bars.flatMap((b) => s.bars[b].notes.filter((n) => !n.strum).map(tabMidi)));
  if (piano) {
    const p = currentPiece();
    const lines = p.phrases.map((ph) => ph.filter((n) => !n.chord).map((n) => n.midi));
    if (lines.flat().length >= 8) return { title: p.title, lines };
    const tune = piecesByDifficulty().find((x) => (x.kind ?? 'melody') === 'melody')!;
    return { title: tune.title, lines: tune.phrases.map((ph) => ph.map((n) => n.midi)) };
  }
  const s = currentSong();
  const lines = notesOfSong(s);
  if (lines.flat().length >= 8) return { title: s.title, lines };
  const tune = songsByDifficulty().find((x) => songProfile(x).kind === 'melody')!;
  return { title: tune.title, lines: notesOfSong(tune) };
}

/**
 * Motifs for a round: so many notes in a row from one line, not all the same note, none twice. Longer as
 * the ear gets better: two or three notes at first, four later.
 */
export function pickMotifs(lines: number[][], count: number, len: number, rnd: () => number): number[][] {
  const all: number[][] = [];
  for (const l of lines) for (let i = 0; i + len <= l.length; i++) {
    const m = l.slice(i, i + len);
    if (new Set(m).size > 1 && Math.max(...m) - Math.min(...m) <= 12) all.push(m);
  }
  const seen = new Set<string>();
  const out: number[][] = [];
  let guard = 0;
  while (out.length < count && all.length && guard++ < 500) {
    const m = all[Math.floor(rnd() * all.length)];
    const k = m.join(',');
    if (seen.has(k) && seen.size < all.length) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

/** The chords to tell apart: the ones that already ring for the player, at least two of them. */
export function earChords(piano: boolean): string[] {
  const pool = piano ? KEY_CHORDS : OPEN_CHORDS;
  const known = pool.filter((c) => store.skills.level(chordKey(c, piano)) >= 1);
  const level = store.skills.level(earKey('chords', piano));
  const want = level >= 3 ? 4 : 3;
  const base = known.length >= 2 ? known : piano ? ['C', 'G', 'Am'] : ['Em', 'Am', 'C'];
  return base.slice(0, Math.max(2, Math.min(want, base.length)));
}

/** An interval to sing: how many semitones, its name, and a song of the book that begins with it, to hear it in. */
export interface Interval {
  semis: number;
  name: string;
  song: string;
}

/** The intervals by how far the ear has come: steps and thirds first, then fourths and fifths, then the wide ones. */
export const INTERVALS = (): Interval[] => [
  { semis: 2, name: L('a step up (major second)', 'ein Schritt hinauf (große Sekunde)'), song: L('“Frère Jacques”', '„Bruder Jakob“') },
  { semis: -2, name: L('a step down (major second)', 'ein Schritt hinab (große Sekunde)'), song: L('“Mary Had a Little Lamb”', '„Mary Had a Little Lamb“') },
  { semis: 4, name: L('a major third up', 'eine große Terz hinauf'), song: L('“When the Saints Go Marching In”', '„When the Saints Go Marching In“') },
  { semis: 3, name: L('a minor third up', 'eine kleine Terz hinauf'), song: L('“Greensleeves”', '„Greensleeves“') },
  { semis: -4, name: L('a major third down', 'eine große Terz hinab'), song: L('“Swing Low, Sweet Chariot”', '„Swing Low, Sweet Chariot“') },
  { semis: 5, name: L('a fourth up', 'eine Quarte hinauf'), song: L('“Amazing Grace”', '„Amazing Grace“') },
  { semis: 7, name: L('a fifth up', 'eine Quinte hinauf'), song: L('“Twinkle, Twinkle, Little Star”', '„Morgen kommt der Weihnachtsmann“') },
  { semis: -3, name: L('a minor third down', 'eine kleine Terz hinab'), song: L('“Kuckuck, Kuckuck”', '„Kuckuck, Kuckuck“') },
  { semis: 9, name: L('a major sixth up', 'eine große Sexte hinauf'), song: L('“My Bonnie Lies over the Ocean”', '„My Bonnie Lies over the Ocean“') },
  { semis: 12, name: L('an octave up', 'eine Oktave hinauf'), song: L('the same note, higher', 'derselbe Ton, höher') },
];

/** The intervals of a round at this level of the ear: the first four, then six, then all. */
export const intervalsFor = (level: number): Interval[] => INTERVALS().slice(0, level >= 3 ? 10 : level >= 1 ? 7 : 4);

/**
 * Intervals, sung: the app sings a note and names an interval; the singer sings the note that far away and
 * holds it. Each interval is named with a song that begins with it, the way singers learn to find them.
 */
const voiceIntervals: Screen = (root, _params, ctx) => {
  const [low, high] = voiceRange();
  const ROUND = ctx ? 4 : 8;
  const level = store.skills.level('ear:v.interval');
  const pool = intervalsFor(level);
  const rnd = seeded(Date.now() & 0xffff);
  const tol = store.settings.voiceTol;
  let items: { from: number; iv: Interval }[] = [];
  let i = 0;
  let results: boolean[] = [];
  let first = true;
  let state: 'listen' | 'sing' | 'done' = 'listen';
  let hold: Hold | null = null;
  let timer = 0;
  let wrong = -1;
  root.innerHTML = frame(
    `<b>${L('By ear', 'Nach Gehör')}</b> · ${L('Intervals', 'Intervalle')}`,
    `<div class="head"><div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div></div>
     <div class="tiles" id="tiles" role="list" aria-label="${L('This round', 'Diese Runde')}"></div>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('Sing on “ah”. Any octave counts.', 'Sing auf „ah“. Jede Oktave zählt.')}</p></div>`,
    `<div class="grp"><button class="btn" id="hearit">${L('Hear the note again', 'Den Ton nochmal')} <kbd>H</kbd></button><button class="btn quiet" id="show">${L('Hear the target', 'Den Zielton hören')} <kbd>T</kbd></button><button class="btn quiet" id="skip">${L('Skip', 'Überspringen')} <kbd>→</kbd></button><button class="btn quiet" id="again">${L('New round', 'Neue Runde')} <kbd>R</kbd></button>${nextStep(ctx)}</div>`,
    ctx,
  );
  const say = (cls: string, html: string): void => {
    const el = $('#fbk', root);
    el.className = 'fbk ' + cls;
    el.innerHTML = html;
  };
  const target = (): number => items[i].from + items[i].iv.semis;
  function draw(): void {
    const it = items[Math.min(i, items.length - 1)];
    $('#eb', root).textContent = `${ctx ? ctx.label + ' · ' : ''}${L('Intervals', 'Intervalle')} · ${state === 'done' ? L('done', 'fertig') : L(`${i + 1} of ${items.length}`, `${i + 1} von ${items.length}`)}`;
    $('#h1', root).innerHTML = state === 'done' ? L(`${results.filter(Boolean).length} of ${results.length} at the first try.`, `${results.filter(Boolean).length} von ${results.length} beim ersten Versuch.`) : state === 'listen' ? L('Listen…', 'Hör zu…') : L(`Now sing <em>${it.iv.name}</em>.`, `Jetzt sing <em>${it.iv.name}</em>.`);
    $('#sub', root).textContent = state === 'done' ? L('Hearing a distance before singing it: what makes a melody singable from the page.', 'Einen Abstand hören, bevor man ihn singt: Das macht eine Melodie vom Blatt singbar.') : L(`As at the start of ${it.iv.song}. Hold the note until the ring is full.`, `Wie am Anfang von ${it.iv.song}. Halt den Ton, bis der Ring voll ist.`);
    $('#tiles', root).innerHTML = items.map((x, k) => `<div class="tile ${k < results.length ? (results[k] ? 'clean' : 'muted') : k === i && state !== 'done' ? 'now' : ''}" role="listitem"><b>${x.iv.semis > 0 ? '↑' : '↓'} ${Math.abs(x.iv.semis)}</b><span>${k < results.length ? (results[k] ? L('first try', 'erster Versuch') : L('with help', 'mit Hilfe')) : k === i && state !== 'done' ? L('now', 'jetzt') : L('next', 'danach')}</span></div>`).join('');
    setSimTarget(state === 'sing' ? { kind: 'note', midi: target(), voice: true } : null);
  }
  function sound(midi: number): number {
    const s = model([{ midi, at: 0, len: 1 }], 1.1);
    const secs = s ? engine.demo(s) : 0;
    ear.quiet(secs + 0.3);
    return secs;
  }
  function play(): void {
    if (state === 'done') return;
    stopTimer(timer);
    state = 'listen';
    draw();
    const secs = sound(items[i].from);
    timer = window.setTimeout(() => {
      state = 'sing';
      hold = new Hold(target(), tol, 0.5);
      wrong = -1;
      say('info', L('Your turn.', 'Du bist dran.'));
      draw();
    }, (secs + 0.3) * 1000);
  }
  function next(ok: boolean): void {
    results.push(ok);
    i++;
    hold = null;
    if (i >= items.length) return finish();
    first = true;
    timer = later(1400, play, L('the next interval', 'das nächste Intervall'));
    state = 'listen';
    draw();
  }
  function finish(): void {
    state = 'done';
    const right = results.filter(Boolean).length;
    const news = levelNews([store.skills.record('ear:v.interval', Math.round((100 * right) / Math.max(1, results.length)), Date.now())]);
    store.save();
    say('good', `${icon('check')}${L(`${right} of ${results.length} at the first try.`, `${right} von ${results.length} beim ersten Versuch.`)}${news}`);
    draw();
    if (ctx) timer = later(4500, ctx.next, ctx.after);
  }
  function start(): void {
    stopTimer(timer);
    items = Array.from({ length: ROUND }, () => {
      const iv = pool[Math.floor(rnd() * pool.length)];
      // the first note so placed that the second lies comfortably in the voice too
      const lo = Math.max(low + 2, low + 2 - Math.min(0, iv.semis));
      const hi = Math.min(high - 2, high - 2 - Math.max(0, iv.semis));
      const from = hi >= lo ? lo + Math.floor(rnd() * (hi - lo + 1)) : Math.round((low + high) / 2) - Math.round(iv.semis / 2);
      return { from, iv };
    });
    i = 0;
    results = [];
    first = true;
    say('info', L('The app sings a note and names an interval: sing the note that far from it.', 'Die App singt einen Ton und nennt ein Intervall: Sing den Ton, der so weit davon entfernt ist.'));
    play();
  }
  const ear = voiceListener(root, (f: Frame) => {
    if (state !== 'sing' || !hold) return;
    const done = hold.push(f);
    if (done) {
      say('good', `${icon('check')}${noteName(target())}: ${Math.abs(done.cents) <= 20 ? L('right on it.', 'genau getroffen.') : L(`${Math.round(Math.abs(done.cents))} cents ${done.cents > 0 ? 'high' : 'low'}.`, `${Math.round(Math.abs(done.cents))} Cent zu ${done.cents > 0 ? 'hoch' : 'tief'}.`)}`);
      state = 'listen';
      return next(first);
    }
    const off = centsOff(f.midi, target());
    if (Math.abs(off) > tol) {
      if (wrong < 0) wrong = f.t;
      if (f.t - wrong > 0.7) {
        first = false;
        say('info', cap(direction(off)) + '.');
      }
    } else wrong = -1;
  });
  const stopKeys = keys({
    h: play,
    t: () => {
      if (state !== 'sing') return;
      first = false;
      sound(target());
    },
    r: start,
    ArrowRight: () => (state === 'done' ? (ctx ? ctx.next() : start()) : next(false)),
  });
  $('#hearit', root).onclick = play;
  $('#show', root).onclick = () => {
    if (state !== 'sing') return;
    first = false;
    sound(target());
  };
  $('#skip', root).onclick = () => (state === 'done' ? (ctx ? ctx.next() : start()) : next(false));
  $('#again', root).onclick = start;
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  start();
  return () => {
    stopTimer(timer);
    engine.stopDemo();
    ear.stop();
    stopKeys();
    setSimTarget(null);
  };
};

export const earTraining: Screen = (root, params, ctx) => {
  if (store.settings.instrument === 'voice') return voiceIntervals(root, params, ctx);
  const [which] = params;
  const piano = store.settings.instrument === 'piano';
  const kind: EarKind = which === 'chords' ? 'chords' : which === 'sing' ? 'sing' : 'motif';
  const ROUND = ctx ? 3 : 6;
  const level = store.skills.level(earKey(kind, piano));
  const len = level >= 3 ? 4 : level >= 1 ? 3 : 2;
  const source = motifSource(piano);
  const chords = earChords(piano);
  const rnd = seeded(Date.now() & 0xffff);
  let items: { motif: number[]; chord?: string }[] = [];
  let i = 0;
  let at = 0;
  /** played back right without a slip and without looking */
  let clean = true;
  let shown = false;
  let results: boolean[] = [];
  let state: 'listen' | 'sing' | 'play' | 'done' = 'listen';
  let timer = 0;
  let hold: Hold | null = null;
  let modelUntil = 0;
  let stopEars: () => void = () => undefined;
  const titles = { motif: L('Play it back', 'Nachspielen'), chords: L('Which chord?', 'Welcher Akkord?'), sing: L('Sing it, then play it', 'Erst singen, dann spielen') };

  root.innerHTML = frame(
    `<b>${L('By ear', 'Nach Gehör')}</b> · ${titles[kind]}`,
    `<div class="head"><div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div>
       ${ctx ? '' : `<nav class="seg earkinds" aria-label="${L('Kind', 'Art')}">${(['motif', 'chords', 'sing'] as EarKind[]).map((k) => `<a href="#/ear/${k}" aria-current="${k === kind}">${titles[k]}</a>`).join('')}</nav>`}</div>
     <div class="tiles" id="tiles" role="list" aria-label="${L('This round', 'Diese Runde')}"></div>
     <svg class="fit" id="reveal" viewBox="0 0 1180 ${piano ? 226 : 186}" role="img" aria-label="${L('What was played, shown after asking for it', 'Was gespielt wurde, gezeigt, wenn du darum bittest')}" hidden></svg>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${kind === 'chords' ? L(`The chords of this round: ${chords.map((c) => chordName(c, piano)).join(', ')}`, `Die Akkorde dieser Runde: ${chords.map((c) => chordName(c, piano)).join(', ')}`) : L(`From ${source.title}. Any octave counts.`, `Aus ${source.title}. Jede Oktave zählt.`)}</p></div>`,
    `<div class="grp"><button class="btn" id="hearit">${L('Hear it again', 'Nochmal anhören')} <kbd>H</kbd></button><button class="btn quiet" id="show">${kind === 'chords' ? L('Name it', 'Namen zeigen') : L('Show it', 'Zeigen')} <kbd>T</kbd></button><button class="btn quiet" id="skip">${L('Skip', 'Überspringen')} <kbd>→</kbd></button><button class="btn quiet" id="again">${L('New round', 'Neue Runde')} <kbd>R</kbd></button>${nextStep(ctx)}</div>
     <p class="auto">${L('Nothing is shown before you ask: listen, then play. A slip costs nothing; hear it again and start over.', 'Nichts wird gezeigt, bevor du fragst: hören, dann spielen. Ein Patzer kostet nichts; hör es noch einmal und fang von vorn an.')}</p>`,
    ctx,
  );

  const say = (cls: string, html: string): void => {
    const el = $('#fbk', root);
    el.className = 'fbk ' + cls;
    el.innerHTML = html;
  };
  const cur = (): { motif: number[]; chord?: string } => items[Math.min(i, items.length - 1)];
  const playing = (): boolean => performance.now() < modelUntil;
  const a4 = piano ? store.settings.pianoA4 : guitarA4();

  /** The app plays the motif or the chord, through the speakers; what the microphone hears of it is not the player. */
  function play(): void {
    const c = engine.ctx;
    if (!c || state === 'done') return;
    const sr = c.sampleRate;
    const it = cur();
    let out: Float32Array;
    if (it.chord) out = piano ? strum(pianoChord(it.chord).midis, sr, 1.8, { a4, piano: true, amp: 0.2 }, 5) : strum(chordNotes(CHORDS[it.chord]), sr, 2, { a4 });
    else {
      const gap = 0.62;
      out = new Float32Array(Math.ceil((it.motif.length * gap + 1.4) * sr));
      it.motif.forEach((m, k) => mixInto(out, tone({ sr, midi: m, dur: 1.4, piano, a4, seed: k + 1 }), k * gap * sr));
    }
    const secs = engine.demo(out);
    modelUntil = performance.now() + secs * 1000 + 250;
    stopTimer(timer);
    state = 'listen';
    draw();
    timer = window.setTimeout(() => {
      state = kind === 'sing' && at === 0 && !hold?.done ? 'sing' : 'play';
      listen();
      draw();
    }, secs * 1000 + 250);
  }

  /** The ears for what comes now: the voice while singing, the instrument while playing. */
  function listen(): void {
    stopEars();
    if (state === 'sing') {
      hold = new Hold(cur().motif[at], store.settings.voiceTol, 0.3);
      let wrong = -1;
      const ear = voiceListener(root, (f: Frame) => {
        if (playing() || state !== 'sing' || !hold) return;
        const done = hold.push(f);
        if (done) {
          at++;
          wrong = -1;
          if (at >= cur().motif.length) {
            say('good', `${icon('check')}${L('Sung. Now find it on the instrument.', 'Gesungen. Jetzt such es auf dem Instrument.')}`);
            at = 0;
            state = 'play';
            listen();
          } else hold = new Hold(cur().motif[at], store.settings.voiceTol, 0.3);
          draw();
          return;
        }
        const off = centsOff(f.midi, cur().motif[at]);
        if (Math.abs(off) > store.settings.voiceTol) {
          if (wrong < 0) wrong = f.t;
          if (f.t - wrong > 0.5) say('info', L(`Note ${at + 1}: ${direction(off)}.`, `Ton ${at + 1}: ${direction(off)}.`));
        } else wrong = -1;
      });
      stopEars = ear.stop;
      setSimTarget({ kind: 'note', midi: cur().motif[at], voice: true });
      return;
    }
    const it = cur();
    stopEars = hear(
      root,
      it.chord
        ? {
            onChord: (e) => {
              if (playing() || state !== 'play') return;
              if (strumIs(e, it.chord!, piano)) return right();
              if (e.best && e.best !== it.chord && e.score > 0.7 && e.margin > 0.1) {
                clean = false;
                say('bad', L(`That was ${chordName(e.best, piano)}. Listen again: this one is ${chordName(it.chord!, piano)}.`, `Das war ${chordName(e.best, piano)}. Hör noch einmal hin: Dieser ist ${chordName(it.chord!, piano)}.`));
                shown = true;
                draw();
                timer = window.setTimeout(play, 1400);
              }
            },
          }
        : {
            onNote: (e) => {
              if (playing() || state !== 'play') return;
              const want = it.motif[at];
              if ((e.midi - want) % 12 === 0) {
                at++;
                if (at >= it.motif.length) return right();
                say('good', `${icon('check')}${L(`${at} of ${it.motif.length}.`, `${at} von ${it.motif.length}.`)}`);
                if (engine.listener) engine.listener.expected = [it.motif[at]];
                setSimTarget({ kind: 'note', midi: it.motif[at], piano, string: midiToTab(it.motif[at]).s });
                draw();
              } else {
                clean = false;
                at = 0;
                say('bad', L(`Heard ${noteName(e.midi)}. From the start: hear it again (H), or ask to see it (T).`, `Gehört: ${noteName(e.midi)}. Von vorn: hör es noch einmal (H) oder lass es dir zeigen (T).`));
                draw();
              }
            },
          },
      (l) => {
        if (piano) pianoEars(l);
        if (it.chord) {
          l.noteDetection = false;
          l.chordCandidates = chords;
        } else l.expected = [it.motif[at]];
      },
    );
    setSimTarget(it.chord ? { kind: 'chord', id: it.chord, piano } : { kind: 'note', midi: it.motif[at], piano, string: midiToTab(it.motif[at]).s });
  }

  function right(): void {
    stopEars();
    stopEars = () => undefined;
    results.push(clean && !shown);
    say('good', `${icon('check')}${clean && !shown ? L('By ear, at the first try.', 'Nach Gehör, beim ersten Versuch.') : L('Got it.', 'Geschafft.')}`);
    i++;
    if (i >= items.length) return finish();
    state = 'listen';
    draw();
    timer = later(1500, next, kind === 'chords' ? L('the next chord', 'der nächste Akkord') : L('the next motif', 'das nächste Motiv'));
  }

  function next(): void {
    at = 0;
    clean = true;
    shown = false;
    hold = null;
    play();
  }

  function finish(): void {
    stopEars();
    stopEars = () => undefined;
    state = 'done';
    setSimTarget(null);
    const right = results.filter(Boolean).length;
    const share = Math.round((100 * right) / Math.max(1, results.length));
    const news = levelNews([store.skills.record(earKey(kind, piano), share, Date.now())]);
    store.save();
    say('good', `${icon('check')}${L(`${right} of ${results.length} at the first try, by ear.`, `${right} von ${results.length} beim ersten Versuch, nach Gehör.`)}${news}`);
    draw();
    if (ctx) timer = later(4500, ctx.next, ctx.after);
  }

  function draw(): void {
    const it = cur();
    $('#eb', root).textContent = `${ctx ? ctx.label + ' · ' : ''}${titles[kind]} · ${state === 'done' ? L('done', 'fertig') : L(`${kind === 'chords' ? 'chord' : 'motif'} ${i + 1} of ${items.length}`, `${kind === 'chords' ? 'Akkord' : 'Motiv'} ${i + 1} von ${items.length}`)}`;
    const h1 =
      state === 'done'
        ? L(`${results.filter(Boolean).length} of ${results.length} by ear.`, `${results.filter(Boolean).length} von ${results.length} nach Gehör.`)
        : state === 'listen'
          ? L('Listen…', 'Hör zu…')
          : state === 'sing'
            ? L(`Sing it back: note ${at + 1} of ${it.motif.length}.`, `Sing es nach: Ton ${at + 1} von ${it.motif.length}.`)
            : it.chord
              ? L('Which chord was it? Play it.', 'Welcher Akkord war das? Spiel ihn.')
              : L(`Now you: play it back. Note ${at + 1} of ${it.motif.length}.`, `Jetzt du: spiel es nach. Ton ${at + 1} von ${it.motif.length}.`);
    $('#h1', root).innerHTML = h1;
    $('#sub', root).textContent =
      state === 'done'
        ? L('Playing by ear grows slowly and carries over: to improvising, to playing from memory, to reading.', 'Spielen nach Gehör wächst langsam und färbt ab: aufs Improvisieren, aufs Auswendigspielen, aufs Lesen.')
        : state === 'sing'
          ? L('Singing it first fixes it in the ear; any octave counts. S skips the singing.', 'Erst singen prägt es dem Ohr ein; jede Oktave zählt. S überspringt das Singen.')
          : it.chord
            ? L(`One of ${chords.map((c) => chordName(c, piano)).join(', ')}.`, `Einer von ${chords.map((c) => chordName(c, piano)).join(', ')}.`)
            : L(`${it.motif.length} notes; the first is ${shown || at > 0 ? noteName(it.motif[0]) : 'yours to find'}.`, `${it.motif.length} Töne; den ersten ${shown || at > 0 ? `kennst du: ${noteName(it.motif[0])}` : 'findest du selbst'}.`);
    $('#tiles', root).innerHTML = items
      .map((x, k) => {
        const done = k < results.length;
        const name = x.chord ? chordName(x.chord, piano) : x.motif.map((m) => noteName(m).replace(/\d+$/, '')).join(' ');
        const word = done ? (results[k] ? L('by ear', 'nach Gehör') : L('with help', 'mit Hilfe')) : k === i && state !== 'done' ? L('now', 'jetzt') : L('next', 'danach');
        return `<div class="tile ${done ? (results[k] ? 'clean' : 'muted') : k === i && state !== 'done' ? 'now' : ''}" role="listitem"><b>${done || (k === i && shown) ? esc(name) : '?'}</b><span>${word}</span></div>`;
      })
      .join('');
    // shown only when asked: the motif as tab or keys, the chord's name
    const svg = $('#reveal', root);
    svg.toggleAttribute('hidden', !shown || !!it.chord || state === 'done');
    if (shown && !it.chord && state !== 'done') {
      if (piano) {
        const r = keyRange(it.motif, true);
        svg.innerHTML = keyboard(it.motif.map((m, k) => ({ midi: m, hot: k === at, done: k < at })), LEARN, r.lowC, r.octaves, { x: 16, y: 6, w: 1148, h: 212, names: true });
      } else {
        const d = tabLine({ bars: [{ notes: it.motif.map((m) => midiToTab(m)) }], look: (k) => (k < at ? 'done' : k === at ? 'cur' : 'up') }, LEARN, true);
        svg.innerHTML = d.svg;
        svg.setAttribute('viewBox', `0 0 1180 ${d.height}`);
      }
    }
    $('#skip', root).hidden = state === 'done';
    $('#show', root).hidden = state === 'done';
  }

  function start(): void {
    stopTimer(timer);
    stopEars();
    items =
      kind === 'chords'
        ? Array.from({ length: ROUND }, () => ({ motif: [] as number[], chord: chords[Math.floor(rnd() * chords.length)] }))
        : pickMotifs(source.lines, ROUND, len, rnd).map((motif) => ({ motif }));
    // a chord never twice in a row: that would be no question
    for (let k = 1; k < items.length; k++) if (items[k].chord && items[k].chord === items[k - 1].chord) items[k].chord = chords[(chords.indexOf(items[k].chord!) + 1) % chords.length];
    i = 0;
    results = [];
    if (!items.length) {
      state = 'done';
      say('info', L('There is nothing here to play by ear yet.', 'Hier gibt es noch nichts nach Gehör zu spielen.'));
      return draw();
    }
    say('info', kind === 'chords' ? L('Listen, then play the chord you heard.', 'Hör zu, dann spiel den Akkord, den du gehört hast.') : L('Listen, then play it back. Nothing is shown before you ask.', 'Hör zu, dann spiel es nach. Nichts wird gezeigt, bevor du fragst.'));
    next();
  }

  const reveal = (): void => {
    if (state === 'done') return;
    shown = true;
    if (cur().chord) say('info', L(`It is ${chordName(cur().chord!, piano)}.`, `Es ist ${chordName(cur().chord!, piano)}.`));
    draw();
  };
  const skip = (): void => {
    if (state === 'done') return ctx ? ctx.next() : start();
    stopTimer(timer);
    stopEars();
    clean = false;
    results.push(false);
    i++;
    if (i >= items.length) return finish();
    next();
  };
  const stopKeys = keys({
    h: play,
    t: reveal,
    r: start,
    s: () => {
      if (state !== 'sing') return;
      at = 0;
      state = 'play';
      listen();
      draw();
    },
    ArrowRight: skip,
  });
  $('#hearit', root).onclick = play;
  $('#show', root).onclick = reveal;
  $('#skip', root).onclick = skip;
  $('#again', root).onclick = start;
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  start();
  return () => {
    stopTimer(timer);
    stopEars();
    engine.stopDemo();
    stopKeys();
    setSimTarget(null);
  };
};
