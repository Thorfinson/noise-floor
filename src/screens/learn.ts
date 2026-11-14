/**
 * Learn mode: calm, one task at a time. A song on the guitar or a piece on the piano goes up three
 * rungs: the app waits for you, then you play line by line with the click, then the whole thing at
 * full speed. Also here: the chord check, string by string.
 */
import type { ChordEvent, NoteEvent, StringResult, ThudEvent } from '../audio/listener';
import { engine } from '../audio/engine';
import { backing } from '../audio/backing';
import { mixInto, strum, tone } from '../audio/synth';
import { L } from '../core/i18n';
import { Take, TEMPOS, type TakeStep } from '../core/playalong';
import { loadTake, saveTake, TAKE_MAX, TAKE_RATE, takeMeta } from '../core/takes';
import { encodeWav, resample } from '../audio/wav';
import { dayMonth } from '../core/i18n';
import { store, type Instrument, type TakeMeta } from '../core/store';
import { barKey, findPiece, findSong, noteTimes, phraseKey, shapeOf, songLines, stepKeys, stepMidis, type PianoNote, type PianoPiece, type Song, type TabNote } from '../music/content';
import { enlist, REVIEW_DAYS, reviewed, reviewKey, reviewLines } from '../music/review';
import { barreStrings, changeTip, chordMidis, chordName, chordNotes, CHORDS, isBlackKey, keyName, keysAlike, keysId, keyTip, noteName, pianoChord, STRING_FULL, STRING_NAMES, stringName, strumIs, type Chord } from '../music/theory';
import { $, $$, cap, esc, hear, icon, keys, later, learnRing, micMeter, pianoEars, stopTimer, type Screen, type SessionCtx } from '../ui/dom';
import { melodyWords } from '../music/accompany';
import { guitarA4, guitarSetup } from '../music/tuning';
import { SING_ALONG } from '../music/lyrics';
import { chordBox, chordMarks, fretboard, keyboard, keyRange, LEARN, noteStrip, playhead, tabLine, type Drawn, type KeyMark, type Mark, type StepLook } from '../ui/draw';
import { staffLine } from '../ui/staff';
import { practiceBar, setSimTarget, type SimTarget } from '../ui/practice';
import { skillLabel } from './home';


export const frame = (where: string, stage: string, bar: string, ctx?: SessionCtx, up: [string, string] = ['#/', L('Home', 'Start')]): string => `<header class="top"><div><a class="btn quiet" href="${ctx ? '#/' : up[0]}">${icon(ctx ? 'x' : 'left')}${ctx ? L('End session', 'Session beenden') : up[1]}</a></div>${ctx ? `<div class="c">${ctx.rail}</div><span id="where" hidden></span>` : `<div class="c" id="where">${where}${store.settings.instrument === 'guitar' && guitarSetup() ? ` · ${guitarSetup()}` : ''}</div>`}<div class="r">${micMeter()}</div></header><p class="sideways">${L('Turn the phone on its side: a line of music needs the width.', 'Dreh das Telefon quer: Eine Zeile Musik braucht die Breite.')}</p>
  <div class="stage">${stage}</div>${practiceBar()}<footer class="bar">${bar}</footer>`;

export const nextStep = (ctx?: SessionCtx): string => (ctx ? `<button class="btn" id="nextstep">${ctx.after === L('the summary', 'die Zusammenfassung') ? L('Finish', 'Abschließen') : L('Next step', 'Nächster Schritt')}${icon('right')}</button>` : '');

/** " Am bar and C bar: level 2." for the levels that went up. */
export function levelNews(changes: { key: string; before: number; after: number }[]): string {
  const levels = new Map<number, Set<string>>();
  for (const c of changes) {
    if (c.after <= c.before) continue;
    // inside a lesson the name of the song goes without saying
    const name = skillLabel(c.key).split(', ').pop()!;
    levels.set(c.after, (levels.get(c.after) ?? new Set()).add(name));
  }
  return [...levels].map(([level, names]) => L(` ${[...names].join(' and ')}: level ${level}.`, ` ${[...names].join(' und ')}: Stufe ${level}.`)).join('');
}

/** One thing to play in a lesson: a note (or several at once), or a strum. */
interface Step {
  /** pitches that count; empty for a strum */
  midis: number[];
  /** chord to strum */
  chord?: string;
  /** start, in note units from the start of the line */
  at: number;
  /** the bar (guitar) or phrase (piano) it is measured with */
  bar: number;
  tab?: TabNote;
  key?: PianoNote;
  /** piano: the chord whose keys are being played one after the other at this step */
  over?: string;
  /** piano: a key for the left hand */
  left?: boolean;
  /** piano: a key of the left hand together with the right's (both hands together) */
  both?: boolean;
}

interface Line {
  steps: Step[];
  bars: number[];
  /** length in note units */
  units: number;
  /** metronome clicks, in note units from the start of the line */
  clicks: { u: number; accent: boolean }[];
  /** guitar: the bars as they are drawn */
  tab: { chord?: string; notes: TabNote[] }[];
  /** guitar: the fretboard shows frets from + 1 to from + 5 */
  from: number;
}

/** What a lesson teaches. The same for a song on the guitar and a piece on the piano. */
export interface Material {
  id: string;
  title: string;
  piano: boolean;
  /** seconds per note unit at full speed */
  noteDur: number;
  /** note units per click */
  beat: number;
  /** clicks counted in */
  count: number;
  lines: Line[];
  /** skill a bar or phrase measures */
  skill: (bar: number) => string;
  /** guitar: chord held during a bar; where a bar is shared by two chords, the first */
  chordOf: (bar: number) => string | undefined;
  /** guitar: the chord a bar ends on */
  endOf: (bar: number) => string | undefined;
  /** guitar: the part of the song a bar belongs to, where the song names its parts */
  partOf: (bar: number) => string | undefined;
  /** who wrote it or made it known */
  by?: string;
  /** "line" or "phrase" */
  unit: string;
}

export function songMaterial(song: Song): Material {
  // the length of a whole bar: what most bars have. A first bar that is shorter is an upbeat.
  const lengths = new Map<number, number>();
  for (const b of song.bars) lengths.set(noteTimes(b.notes).total, (lengths.get(noteTimes(b.notes).total) ?? 0) + 1);
  const whole = [...lengths].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]?.[0] ?? 0;
  const lines = songLines(song).map((bars): Line => {
    const steps: Step[] = [];
    const clicks: Line['clicks'] = [];
    const frets: number[] = [];
    let u = 0;
    for (const b of bars) {
      const bar = song.bars[b];
      const { at, total } = noteTimes(bar.notes);
      bar.notes.forEach((n, i) => {
        steps.push({ midis: stepMidis(n), chord: n.strum, at: u + at[i], bar: b, tab: n });
        if (!n.strum) for (const x of [n, ...(n.more ?? [])]) frets.push(x.f);
      });
      if (bar.chord) frets.push(...shapeOf(bar.chord).frets);
      // the clicks of an upbeat are counted back from the bar line it leads to
      const upbeat = b === 0 && total < whole - 1e-6;
      for (let c = upbeat ? total % song.beat : 0; c < total - 1e-6; c += song.beat) clicks.push({ u: u + c, accent: c === 0 && !upbeat });
      u += total;
    }
    const fretted = frets.filter((f) => f > 0);
    const from = fretted.length && Math.max(...fretted) > 5 ? Math.min(...fretted) - 1 : 0;
    return { steps, bars, units: u, clicks, tab: bars.map((b) => ({ chord: song.bars[b].chord ? shapeOf(song.bars[b].chord!).name : undefined, notes: song.bars[b].notes })), from };
  });
  const per = Math.round(Math.max(...song.bars.map((b) => noteTimes(b.notes).total)) / song.beat);
  const endOf = (b: number): string | undefined => {
    const strums = (song.bars[b]?.notes ?? []).filter((n) => n.strum);
    return strums.length ? strums[strums.length - 1].strum : song.bars[b]?.chord;
  };
  const partOf = (b: number): string | undefined => {
    for (let i = Math.min(b, song.bars.length - 1); i >= 0; i--) if (song.bars[i].part) return song.bars[i].part;
    return undefined;
  };
  return { id: song.id, title: song.title, by: song.by, piano: false, noteDur: song.noteDur, beat: song.beat, count: per === 3 ? 3 : 4, lines, skill: (b) => barKey(song, b), chordOf: (b) => song.bars[b]?.chord, endOf, partOf, unit: 'line' };
}

export function pieceMaterial(piece: PianoPiece): Material {
  // the chord a broken passage is in carries on from phrase to phrase until another is named
  let over: string | undefined;
  const lines = piece.phrases.map((notes, k): Line => {
    const { at, total } = noteTimes(notes);
    const clicks: Line['clicks'] = [];
    // a phrase that begins with an upbeat has its first heavy click after it
    const lead = piece.leads?.[k] ?? 0;
    const bar = piece.bar ?? 0;
    for (let c = lead % piece.beat; c < total - 1e-6; c += piece.beat) {
      const bars = bar > 0 ? (c - lead) / bar : -1;
      clicks.push({ u: c, accent: bar > 0 ? Math.abs(bars - Math.round(bars)) < 1e-6 : clicks.length === 0 });
    }
    const steps = notes.map((n, i): Step => {
      if (n.over) over = n.over;
      if (n.chord) over = undefined;
      // a key of the left hand struck with the melody's is judged as the two keys together, as a chord is
      if (n.bass) return { midis: [], chord: keysId([n.bass, n.midi]), at: at[i], bar: k, key: n, both: true };
      return { midis: n.chord ? [] : [n.midi], chord: n.chord, at: at[i], bar: k, key: n, ...(over && !n.chord && !n.left ? { over } : {}), ...(n.left ? { left: true } : {}) };
    });
    return { steps, bars: [k], units: total, clicks, tab: [], from: 0 };
  });
  const named = (k: number): string[] => (piece.phrases[k] ?? []).map((n) => n.chord ?? n.over).filter((c): c is string => !!c);
  const partOf = (k: number): string | undefined => {
    for (let i = Math.min(k, piece.phrases.length - 1); i >= 0; i--) if (piece.parts?.[i]) return piece.parts[i];
    return undefined;
  };
  return { id: piece.id, title: piece.title, by: piece.by, piano: true, noteDur: piece.noteDur, beat: piece.beat, count: piece.count ?? 4, lines, skill: (k) => phraseKey(piece, k), chordOf: () => undefined, endOf: (k) => named(k).pop(), partOf, unit: 'phrase' };
}

const RUNGS = (): string[] => [L('Learn', 'Lernen'), L('With the click', 'Mit Klick'), L('Full speed', 'Volles Tempo')];

/** The unit of a lesson in German, one or more: Zeile, Zeilen; Phrase, Phrasen. */
const unitDe = (m: Material, plural = false): string => (m.piano ? 'Phrase' : 'Zeile') + (plural ? 'n' : '');

/** The rung to practise a line on, from what has been measured: wait, then the click, then the whole piece. */
export function suggest(m: Material, line: number): { stage: number; tempo: number } {
  const level = (ks: string[]): number => Math.min(...ks.map((k) => store.skills.level(k)));
  const here = [...new Set(m.lines[line].bars.map(m.skill))];
  if (level(here) < 1) return { stage: 0, tempo: 50 };
  if (level([...new Set(m.lines.flatMap((l) => l.bars.map(m.skill)))]) >= 3) return { stage: 2, tempo: 100 };
  const best = Math.min(...here.map((k) => store.skills.get(k)?.best ?? 0));
  return { stage: 1, tempo: TEMPOS.find((t) => t >= 50 && t > best) ?? 100 };
}

/** What the session plan says about the next visit to a song or piece. */
export function describe(m: Material): string {
  const line = Math.min(m.lines.length - 1, store.progress[m.id] ?? 0);
  const s = suggest(m, line);
  return s.stage === 0 ? L(`Two ${m.unit}s, starting at ${m.unit} ${line + 1}`, `Zwei ${unitDe(m, true)}, ab ${unitDe(m)} ${line + 1}`) : s.stage === 1 ? L(`With the click at ${s.tempo}%, from ${m.unit} ${line + 1}`, `Mit Klick bei ${s.tempo}%, ab ${unitDe(m)} ${line + 1}`) : L('The whole thing at full speed', 'Das Ganze in vollem Tempo');
}

/** Words under the notes of a melody (K): asked for once, they stay while the app is open. */
const wordsOn = { on: false };

interface Mode {
  stop: () => void;
  /** a take is being played with the click */
  running: () => boolean;
  note: (e: NoteEvent) => void;
  chord: (e: ChordEvent) => void;
  /** a hit after which nothing rang */
  thud: (e: ThudEvent) => void;
  /** Space */
  toggle: () => void;
}

function lesson(root: HTMLElement, m: Material, wanted: string | undefined, ctx?: SessionCtx): () => void {
  const n = m.lines.length;
  const inst: Instrument = m.piano ? 'piano' : 'guitar';
  let line = Math.min(n - 1, store.progress[m.id] ?? 0);
  const first = suggest(m, line);
  /**
   * A visit to an old song: two lines, cold, at full speed and with no run-up. After a visit that fell apart
   * the next one plays them with the click at 85%.
   */
  let review: { lines: number[]; relearn: boolean } | null = wanted === 'review' ? { lines: reviewLines(inst, m.id), relearn: !!store.reviews[reviewKey(inst, m.id)]?.relearn } : null;
  if (review) line = review.lines[0];
  let stage = review ? (review.relearn ? 1 : 2) : wanted === '1' ? 0 : wanted === '2' ? 1 : wanted === '3' ? 2 : first.stage;
  let tempo = review?.relearn ? 85 : first.tempo;
  let mode: Mode | null = null;
  /** bars played round and round, with one bar counted in, until the player stops it */
  let loop: { from: number; to: number } | null = null;
  /** clean runs of the loop in a row: after three the tempo rises by 5% (when the setting says so) */
  let loopClean = 0;
  /** "bar 3" or "bars 3–4", or the phrases of the piano */
  const barsSaid = (r: { from: number; to: number }): string =>
    m.piano
      ? r.from === r.to
        ? L(`phrase ${r.from + 1}`, `Phrase ${r.from + 1}`)
        : L(`phrases ${r.from + 1}–${r.to + 1}`, `Phrasen ${r.from + 1}–${r.to + 1}`)
      : r.from === r.to
        ? L(`bar ${r.from + 1}`, `Takt ${r.from + 1}`)
        : L(`bars ${r.from + 1}–${r.to + 1}`, `Takte ${r.from + 1}–${r.to + 1}`);
  /** the last bar there is: of the song, or the last phrase of the piece */
  const lastBar = Math.max(...m.lines.flatMap((l) => l.bars));
  /** a performance: the whole thing at full speed with no marks while it is played, and the player judges first */
  let perform = false;
  /** by ear: on the first rung the notes are hidden and the line is heard first; T shows them */
  let byEar = false;
  let revealed = false;
  // counted over the whole visit, for the guided session
  let linesDone = 0;
  let takes = 0;
  let fails = 0;
  const range = m.piano ? keyRange(m.lines.flatMap((l) => l.steps.flatMap((s) => stepKeys(s.key!)))) : { lowC: 60, octaves: 2 };
  /** the name of a chord as this lesson shows it */
  const nameOf = (id: string): string => (m.piano ? chordName(id, true) : shapeOf(id).name);
  /** piano: a lesson of chords only has no single keys to listen for */
  const chordsOnly = m.piano && m.lines.every((l) => l.steps.every((s) => s.chord));
  const strummed = [...new Set(m.lines.flatMap((l) => l.steps.map((s) => s.chord).filter((c): c is string => !!c)))];
  /** the words of a melody that is also sung, a syllable for each step; null for anything else */
  const melody = strummed.length ? null : melodyWords(m.id, m.lines.reduce((s, l) => s + l.steps.length, 0));
  const fingers = m.piano ? L('Fingers: 1 thumb · 2 index · 3 middle · 4 ring · 5 little finger', 'Finger: 1 Daumen · 2 Zeigefinger · 3 Mittelfinger · 4 Ringfinger · 5 kleiner Finger') : L('Fingers: 1 index · 2 middle · 3 ring · 4 little finger', 'Finger: 1 Zeigefinger · 2 Mittelfinger · 3 Ringfinger · 4 kleiner Finger');

  root.innerHTML = frame(
    '',
    `<div class="head">
       ${m.piano ? '' : `<svg id="cbox" class="chordfig" viewBox="0 0 230 210" role="img" aria-label="${L('Chord diagram: where your fingers go for the chord to hold', 'Akkorddiagramm: wo deine Finger für den Akkord hinkommen, den du hältst')}"></svg>`}
       <div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div>
       <div class="ladder" role="group" aria-label="${L('How to practise', 'Wie du übst')}">${RUNGS().map((r, i) => `<button class="rung" id="st${i}" aria-pressed="false"><b>${i + 1}</b><span>${r}<small id="st${i}s"></small></span></button>`).join('')}<p class="rungnote" id="rungnote" aria-live="polite"></p></div>
     </div>
     <svg class="fit" id="rowA" viewBox="0 0 1180 ${m.piano ? 180 : 186}" role="img" aria-label="${L(`${m.piano ? 'The notes of this phrase, read left to right' : 'Tablature of this line, read left to right'}, with a marker on the one to play`, `${m.piano ? 'Die Noten dieser Phrase, von links nach rechts gelesen' : 'Tabulatur dieser Zeile, von links nach rechts gelesen'}, mit einer Markierung auf dem, was jetzt dran ist`)}"></svg>
     <svg class="fit" id="rowB" viewBox="0 0 1180 ${m.piano ? 180 : 186}" role="img" aria-label="${L('What comes next', 'Was danach kommt')}" hidden></svg>
     <svg class="fit" id="hands" viewBox="0 0 1180 ${m.piano ? 226 : 224}" role="img" aria-label="${m.piano ? L('Keyboard: the highlighted key is the one to play, with its finger number', 'Tastatur: die hervorgehobene Taste ist die, die du spielst, mit ihrer Fingernummer') : L('Fretboard: numbered dots show where your fingers go, the vibrating string is the one to pluck', 'Griffbrett: nummerierte Punkte zeigen, wo deine Finger hinkommen, die schwingende Saite ist die, die du zupfst')}"></svg>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${fingers}</p></div>
     <div class="takebox" id="takebox" hidden>
       <div class="selfrate" id="selfrate" hidden role="group" aria-label="${L('How many slips did you hear?', 'Wie viele Patzer hast du gehört?')}"><span>${L('Slips you heard:', 'Gehörte Patzer:')}</span>${['0', '1', '2', '3+'].map((v, i) => `<button class="btn" data-rate="${i}">${v} <kbd>${i}</kbd></button>`).join('')}</div>
       <div class="barmap" id="barmap" role="group" aria-label="${L('The recording, bar by bar: pick one to hear it', 'Die Aufnahme, Takt für Takt: wähl einen, um ihn zu hören')}"></div>
       <div class="row"><button class="btn" id="listen">${L('Listen back', 'Anhören')} <kbd>P</kbd></button><button class="btn quiet" id="firsttake" hidden>${L('Your first recording', 'Deine erste Aufnahme')}</button><button class="btn quiet" id="savetake">${L('Save as a file', 'Als Datei speichern')}</button><span class="note" id="takenote"></span></div>
     </div>`,
    `<div class="grp"><button class="btn quiet" id="prev">${icon('left')}${L('Previous', 'Zurück')} <kbd>←</kbd></button><button class="btn" id="again">${L('Again', 'Nochmal')} <kbd>R</kbd></button><button class="btn" id="hearit">${L('Hear it', 'Anhören')} <kbd>H</kbd></button><button class="btn quiet" id="next">${L('Next', 'Weiter')} <kbd>→</kbd>${icon('right')}</button>${nextStep(ctx)}</div>
     <div class="grp" id="tempobox" hidden><button class="btn quiet" id="slower" title="${L('Slower by 5%', 'Um 5 % langsamer')}" aria-label="${L('Slower by 5%', 'Um 5 % langsamer')}">−5 % <kbd>−</kbd></button><b id="tempo"></b><button class="btn quiet" id="faster" title="${L('Faster by 5%, up to 125%', 'Um 5 % schneller, bis 125 %')}" aria-label="${L('Faster by 5%', 'Um 5 % schneller')}">+5 % <kbd>+</kbd></button><button class="btn" id="pause"><span>${L('Pause', 'Pause')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn quiet tog" id="loopbtn" aria-pressed="false" title="${L('The bars on show go round and round with the click, one bar counted in, until L again.', 'Die gezeigten Takte laufen mit dem Klick im Kreis, ein Takt eingezählt, bis wieder L.')}">${L('Loop', 'Schleife')} <kbd>L</kbd></button></div>
     <details class="more" id="more"><summary class="btn quiet">${L('More', 'Mehr')}</summary><div class="morepanel">
       <p class="k">${L('Loop', 'Schleife')}</p><div class="row"><button class="btn quiet" id="widenl">${L('Take in the bar before', 'Takt davor dazu')} <kbd>[</kbd></button><button class="btn quiet" id="widenr">${L('Take in the bar after', 'Takt danach dazu')} <kbd>]</kbd></button></div>
       <p class="k">${L('Playing along', 'Mitspielen')}</p><div class="row"><button class="btn quiet tog" id="backbtn" aria-pressed="false">${L('Backing: bass and chords', 'Begleitung: Bass und Akkorde')} <kbd>A</kbd></button>${melody ? `<button class="btn quiet tog" id="wordsbtn" aria-pressed="${wordsOn.on}">${L('Words under the notes', 'Text unter den Noten')} <kbd>K</kbd></button>` : ''}${SING_ALONG[m.id] ? `<a class="btn quiet" href="#/singalong/${encodeURIComponent(m.id)}">${L('Sing and play: the words under the chords', 'Singen und spielen: der Text unter den Akkorden')}</a>` : ''}</div><p class="note">${L('Headphones only: through speakers the microphone would hear the backing as your playing.', 'Nur mit Kopfhörern: Über Lautsprecher würde das Mikrofon die Begleitung als dein Spiel hören.')}</p>
       ${m.piano ? `<p class="k">${L('The music', 'Die Noten')}</p><div class="row"><button class="btn quiet tog" id="staffbtn" aria-pressed="false">${L('On the staff', 'Als Notenzeile')} <kbd>S</kbd></button><button class="btn quiet" id="namesbtn"></button></div><p class="note">${L('The staff as in printed music, with the left hand on its own staff below. The names under the notes are a help to leave away: by default they go once a phrase sits.', 'Die Notenzeile wie in gedruckten Noten, die linke Hand auf einem eigenen System darunter. Die Namen unter den Noten sind eine Hilfe zum Weglassen: Von selbst verschwinden sie, sobald eine Phrase sitzt.')}</p>` : ''}
       <p class="k">${L('Learning a line', 'Eine Zeile lernen')}</p><div class="row"><button class="btn quiet tog" id="earbtn" aria-pressed="false">${L('By ear: notes hidden', 'Nach Gehör: Töne verdeckt')} <kbd>E</kbd></button><button class="btn quiet tog" id="imagbtn" aria-pressed="false">${L('Rest the hands: listen and imagine', 'Hände ausruhen: zuhören und vorstellen')} <kbd>I</kbd></button></div><p class="note">${L('On rung 1 the line is played first and the notes stay hidden; T shows them.', 'Auf Stufe 1 wird die Zeile zuerst vorgespielt, und die Töne bleiben verdeckt; T zeigt sie.')}</p>
       <p class="k">${L('Full speed', 'Volles Tempo')}</p><div class="row"><button class="btn quiet tog" id="perfbtn" aria-pressed="false">${L('Performance: no marks, recorded', 'Vortrag: ohne Markierungen, aufgenommen')} <kbd>V</kbd></button></div><p class="note">${L('The whole thing from the top. You say how it went before the app does, then listen back bar by bar.', 'Das Ganze von vorn. Du sagst, wie es lief, bevor die App es tut; dann hörst du es Takt für Takt an.')}</p>
     </div></details>
     <p class="auto" id="auto"></p>`,
    ctx,
    ['#/songs', m.piano ? L('Pieces', 'Stücke') : L('Songs', 'Songs')],
  );
  const rowA = $<SVGSVGElement>('#rowA', root);
  const rowB = $<SVGSVGElement>('#rowB', root);
  const hands = $<SVGSVGElement>('#hands', root);
  const say = (cls: string, html: string): void => {
    const el = $('#fbk', root);
    el.className = 'fbk ' + cls;
    el.innerHTML = html;
  };
  /** piano: the mistake nearest at hand is another chord of the piece, one that does not sound much like the right one */
  const mistaken = (id: string): string | undefined => (m.piano ? strummed.find((c) => c !== id && keysAlike(c, id) < 0.5) : undefined);
  const target = (s: Step): SimTarget => (s.chord ? { kind: 'chord', id: s.chord, piano: m.piano, wrong: mistaken(s.chord) } : { kind: 'note', midi: s.midis[0], piano: m.piano, string: s.tab?.s });
  const expect = (midis: number[]): void => {
    const l = engine.listener;
    if (l) l.expected = midis.length ? midis : null;
  };

  function drawLine(el: Element, li: number, look: (i: number) => StepLook, hidden = false): Drawn {
    const l = m.lines[li];
    // the words of the line, a syllable under each note, when asked for (K) and when nothing is hidden
    const from = m.lines.slice(0, li).reduce((s, x) => s + x.steps.length, 0);
    const said = melody && wordsOn.on && !hidden ? melody.slice(from, from + l.steps.length) : undefined;
    // the piano's music as note blocks, or on the staff: with the names of the notes until the phrase sits
    const names = store.settings.noteNames === 'on' || (store.settings.noteNames === 'auto' && store.skills.level(m.skill(l.bars[0])) < 2);
    const d = m.piano
      ? store.settings.notation === 'staff'
        ? staffLine(
            l.steps.map((s) => s.key!),
            look,
            LEARN,
            { names, fingers: true },
          )
        : noteStrip(
            l.steps.map((s) => s.key!),
            look,
            LEARN,
            said,
          )
      : tabLine({ bars: hidden ? l.tab.map((b) => ({ ...b, chord: b.chord ? '?' : undefined })) : l.tab, look, name: (id) => (hidden ? '?' : shapeOf(id).name), words: said }, LEARN, true);
    el.innerHTML = d.svg;
    el.setAttribute('viewBox', `0 0 1180 ${d.height}`);
    return d;
  }

  /** The chord a step is played over: the one it strums or strikes, otherwise the one its bar holds or its keys belong to. */
  const chordAt = (s: Step | null | undefined): string | undefined => (s ? (s.chord ?? s.over ?? m.chordOf(s.bar)) : undefined);

  /** The chord to hold, large, next to the instruction. */
  function drawChord(step: Step | null | undefined): void {
    if (m.piano) return;
    const box = $('#cbox', root);
    const id = chordAt(step);
    box.toggleAttribute('hidden', !id);
    if (!id) return;
    const c = shapeOf(id);
    box.innerHTML = `<text x="4" y="24" class="lbl" fill="${LEARN.muted}">${L('hold', 'halten')}</text><text x="4" y="64" class="cn" style="font-size:${c.name.length > 4 ? 22 : 36}px" fill="${LEARN.text}">${c.name}</text>` + chordBox(c, 96, 44, 120, LEARN, false, undefined, 32);
  }

  /** Fretboard or keyboard for the step to play. */
  function drawHands(step: Step | null, prev: Step | null, li: number): void {
    if (m.piano) {
      const marks: KeyMark[] = [];
      // what was played last keeps a green edge, unless it is asked for again
      if (prev) for (const k of stepKeys(prev.key!)) marks.push({ midi: k, done: true });
      if (step?.chord) marks.push(...chordMarks(step.chord, true));
      else if (step) {
        // the other keys of the chord that is being broken stay in sight
        if (step.over) for (const k of chordMarks(step.over, false, false)) marks.push({ ...k, ...(prev && stepKeys(prev.key!).includes(k.midi) ? { done: true } : {}) });
        marks.push({ midi: step.midis[0], fg: step.key?.fg, hot: true });
      }
      hands.innerHTML = keyboard(marks, LEARN, range.lowC, range.octaves, { x: 16, y: 6, w: 1148, h: 212, names: true });
      return;
    }
    const id = chordAt(step);
    const pluck = step && !step.chord ? step.tab! : null;
    const dots = id
      ? shapeOf(id)
          .frets.map((f, s) => ({ s, f, fg: shapeOf(id).fingers[s] }))
          .filter((d) => d.f > 0)
      : pluck
        ? [pluck, ...(pluck.more ?? [])].filter((x) => x.f > 0).map((x) => ({ s: x.s, f: x.f, fg: x.fg ?? 0 }))
        : [];
    hands.innerHTML = fretboard(dots, pluck, LEARN, m.lines[li].from);
  }

  /**
   * What comes after the step on show while the chord stays: how many more strums or notes on it, and the
   * chord it changes to then (in this line or the next). Said instead of the same instruction again and
   * again, so that playing on one chord is seen to go somewhere.
   */
  function ahead(steps: Step[], i: number, li: number): string {
    const id = chordAt(steps[i]);
    if (!id) return '';
    let k = 0;
    while (i + k < steps.length && chordAt(steps[i + k]) === id) k++;
    const after = i + k < steps.length ? chordAt(steps[i + k]) : chordAt(m.lines[li + 1]?.steps[0]);
    const name = m.piano ? chordName(id, true) : shapeOf(id).name;
    const next = after && after !== id ? (m.piano ? chordName(after, true) : shapeOf(after).name) : '';
    const strum = !!steps[i].chord && !m.piano;
    if (k <= 1) return next ? L(`The last ${strum ? 'strum' : 'note'} on ${name}, then the change to ${next}.`, `${strum ? 'Der letzte Anschlag' : 'Der letzte Ton'} auf ${name}, dann Wechsel zu ${next}.`) : '';
    if (strum) return L(`${k} strums of ${name} from here${next ? `, then the change to ${next}` : ''}.`, `Noch ${k}-mal ${name}${next ? `, dann Wechsel zu ${next}` : ''}.`);
    return L(`${k} ${m.piano && steps[i].chord ? 'strikes' : 'notes'} on ${name} from here${next ? `, then ${next}` : ''}.`, `Noch ${k} ${m.piano && steps[i].chord ? 'Anschläge' : 'Töne'} auf ${name}${next ? `, dann ${next}` : ''}.`);
  }

  function instruction(cur: Step, prev: Step | null, upcoming = ''): { h1: string; sub: string } {
    if (m.piano) {
      const k = cur.key!;
      // the chord before this step: of the step before, or at the start of a phrase what the phrase before ended on
      const was = prev ? chordAt(prev) : cur.bar > 0 ? m.endOf(cur.bar - 1) : undefined;
      if (cur.both) {
        const [bass, top] = pianoChord(cur.chord!).midis;
        return { h1: L(`Both hands: <em>${keyName(bass)}</em> left, <em>${keyName(top)}</em> right, together.`, `Beide Hände: <em>${keyName(bass)}</em> links, <em>${keyName(top)}</em> rechts, zusammen.`), sub: L('The left little finger on the bass, struck at the same moment as the melody key.', 'Der linke kleine Finger auf dem Bass, im selben Moment angeschlagen wie die Melodietaste.') };
      }
      if (cur.chord) {
        const c = pianoChord(cur.chord);
        const keysOf = c.keys;
        // after the left hand's root, the chord of the right is the same chord: no change to speak of
        const fromLeft = !!prev?.left;
        if (was && was !== cur.chord && !fromLeft) return { h1: L(`Change to <em>${c.name}</em>.`, `Wechsle zu <em>${c.name}</em>.`), sub: keyTip(was, cur.chord) };
        if (fromLeft) return { h1: L(`Now the right hand: <em>${c.name}</em>.`, `Jetzt die rechte Hand: <em>${c.name}</em>.`), sub: L(`${keysOf.join(', ')}, struck together, while the left lets its key go.`, `${keysOf.join(', ')}, zusammen angeschlagen, während die linke ihre Taste loslässt.`) };
        return {
          h1: was ? L(`<em>${c.name}</em> once more.`, `<em>${c.name}</em> noch einmal.`) : L(`Play <em>${c.name}</em>: all its keys at once.`, `Spiel <em>${c.name}</em>: alle Tasten zugleich.`),
          sub: was && upcoming ? upcoming : L(
            `${keysOf.slice(0, -1).join(', ')} and ${keysOf[keysOf.length - 1]} with fingers ${c.fingers.slice(0, -1).join(', ')} and ${c.fingers[c.fingers.length - 1]}. Strike them together and let them ring.`,
            `${keysOf.slice(0, -1).join(', ')} und ${keysOf[keysOf.length - 1]} mit den Fingern ${c.fingers.slice(0, -1).join(', ')} und ${c.fingers[c.fingers.length - 1]}. Schlag sie zusammen an und lass sie klingen.`,
          ),
        };
      }
      if (cur.left) return { h1: L(`Left hand: <em>${keyName(k.midi)}</em>, little finger.`, `Linke Hand: <em>${keyName(k.midi)}</em>, kleiner Finger.`), sub: cur.chord ? '' : L('The root of the chord the right hand strikes next, an octave lower. Then the right hand.', 'Der Grundton des Akkords, den die rechte Hand als Nächstes anschlägt, eine Oktave tiefer. Dann die rechte Hand.') };
      const begins = !!k.over && was !== k.over;
      return {
        h1: L(`Play <em>${keyName(k.midi, cur.over)}</em>${k.fg ? ` with finger ${k.fg}` : ''}.`, `Spiel <em>${keyName(k.midi, cur.over)}</em>${k.fg ? ` mit Finger ${k.fg}` : ''}.`),
        sub: begins
          ? L(`Now the keys of ${chordName(k.over!, true)}, one after the other. ${was ? keyTip(was, k.over!) : 'Lay the hand on the whole chord first.'}`, `Jetzt die Tasten von ${chordName(k.over!, true)}, eine nach der anderen. ${was ? keyTip(was, k.over!) : 'Leg die Hand zuerst auf den ganzen Akkord.'}`)
          : isBlackKey(k.midi)
            ? L('It is a black key.', 'Es ist eine schwarze Taste.')
            : prev && prev.midis[0] === k.midi
              ? L('The same key again.', 'Noch einmal dieselbe Taste.')
              : '',
      };
    }
    const id = chordAt(cur);
    const name = id ? shapeOf(id).name : '';
    // the chord before this step: of the step before, or at the start of a line what the bar before ended on
    const before = prev ? chordAt(prev) : cur.bar > 0 ? m.endOf(cur.bar - 1) : undefined;
    const change = !!before && !!id && before !== id;
    // at a change: which fingers stay, which keep their shape
    const how = change ? changeTip(shapeOf(before!), shapeOf(id!)) : '';
    if (cur.chord)
      return {
        h1: change ? L(`Change to <em>${name}</em> and strum.`, `Wechsle zu <em>${name}</em> und schlag an.`) : L(`Strum <em>${name}</em>${cur.tab?.up ? ', on the way back up' : ''}.`, `Schlag <em>${name}</em> an${cur.tab?.up ? ', auf dem Weg zurück nach oben' : ''}.`),
        sub: how || (cur.tab?.up ? `${L('An upstroke: the hand comes back up and brushes only the thin strings.', 'Ein Aufschlag: Die Hand kommt zurück nach oben und streift nur die dünnen Saiten.')} ${upcoming}`.trim() : upcoming || L('One stroke down across the strings of the chord.', 'Ein Abschlag über die Saiten des Akkords.')),
      };
    const t = cur.tab!;
    if (id) return { h1: L(`${change ? `Change to ${name}.` : `Hold ${name}.`} Pluck the <em>${STRING_FULL[t.s]} string</em>.`, `${change ? `Wechsle zu ${name}.` : `Halte ${name}.`} Zupf die <em>${STRING_FULL[t.s]}-Saite</em>.`), sub: how || (prev ? upcoming : '') || L('Fingers go where the diagram shows, and stay down while you pluck.', 'Die Finger kommen dahin, wo das Diagramm sie zeigt, und bleiben liegen, während du zupfst.') };
    if (t.more) return { h1: L('Pluck the <em>marked strings</em> together.', 'Zupf die <em>markierten Saiten</em> zusammen.'), sub: '' };
    return { h1: L(`Pluck the <em>${STRING_FULL[t.s]} string</em>, ${t.f ? 'fret ' + t.f : 'open'}.`, `Zupf die <em>${STRING_FULL[t.s]}-Saite</em>, ${t.f ? t.f + '. Bund' : 'leer'}.`), sub: L(`It sounds like ${noteName(cur.midis[0])}.${t.fg ? ` Finger ${t.fg}.` : ''}`, `Der Ton ist ${noteName(cur.midis[0])}.${t.fg ? ` Finger ${t.fg}.` : ''}`) };
  }

  const where = (li: number): void => {
    const part = m.partOf(m.lines[li].bars[0]);
    $('#where', root).innerHTML = `<b>${esc(m.title)}</b>${m.by ? ` · ${esc(m.by)}` : ''} · ${part && part !== 'All' ? `${esc(part.toLowerCase())} · ` : ''}${L(`${m.unit} ${li + 1} of ${n}`, `${unitDe(m)} ${li + 1} von ${n}`)}${!m.piano && guitarSetup() ? ` · ${guitarSetup()}` : ''}`;
  };
  /**
   * A model to listen to before playing: the line as it should sound, a little slower than full speed.
   * Hearing the goal first helps most with getting the order and the shape of a passage right.
   */
  let modelUntil = 0;
  let modelTimer = 0;
  const modelPlaying = (): boolean => performance.now() < modelUntil;
  /** K: the words of the melody under its notes, or not; the choice stays while the app is open. */
  function toggleWords(): void {
    if (!melody) return;
    wordsOn.on = !wordsOn.on;
    $('#wordsbtn', root)?.setAttribute('aria-pressed', String(wordsOn.on));
    setStage(stage);
  }

  /** The model of these steps (u: their place in note units), at this many seconds a unit. */
  function modelSound(parts: { s: Step; u: number }[], unit: number, sr: number): Float32Array {
    const ring = m.piano ? 1.2 : 1.8;
    const a4 = m.piano ? store.settings.pianoA4 : guitarA4();
    const from = parts[0].u;
    const out = new Float32Array(Math.ceil(((parts[parts.length - 1].u - from + 1) * unit + ring) * sr));
    parts.forEach(({ s, u }, i) => {
      const sound = s.chord ? (m.piano ? strum(pianoChord(s.chord).midis, sr, ring, { a4, piano: true, amp: 0.2 }, 5) : strum(chordNotes(shapeOf(s.chord)), sr, ring, { a4 })) : s.midis.reduce((mix, midi) => (mixInto(mix, tone({ sr, midi, dur: ring, piano: m.piano, a4, seed: i + 1 }), 0), mix), new Float32Array(Math.ceil(ring * sr)));
      mixInto(out, sound, (u - from) * unit * sr);
    });
    return out;
  }

  /**
   * Resting the hands (I): the app plays the line on show and shows each step while it sounds, on the tab
   * and on the fretboard or keys; nothing listens and nothing is measured. Followed in the head, the eyes
   * open and then closed, it is practice of its own: small but measured in studies of mental practice, and
   * it spares sore fingertips. I again, or any move to another line or rung, ends it.
   */
  let imagining = 0;
  function stopImagine(): void {
    if (!imagining) return;
    cancelAnimationFrame(imagining);
    imagining = 0;
    stopModel();
    $('#imagbtn', root).setAttribute('aria-pressed', 'false');
  }
  function imagine(): void {
    const actx = engine.ctx;
    if (!actx) return;
    if (imagining) {
      stopImagine();
      go(line);
      return;
    }
    mode?.stop();
    stopModel();
    const all = m.lines[line].steps;
    if (!all.length) return;
    // at the tempo practised at; on the first rung a little slower than full speed, as H plays it
    const unit = stage === 1 ? (m.noteDur * 100) / tempo : m.noteDur / 0.75;
    const seconds = engine.demo(modelSound(all.map((s) => ({ s, u: s.at })), unit, actx.sampleRate));
    const startAt = performance.now();
    const from = all[0].at;
    $('#imagbtn', root).setAttribute('aria-pressed', 'true');
    $('#h1', root).innerHTML = L('Listen, and play it in your head.', 'Hör zu, und spiel es im Kopf.');
    $('#sub', root).textContent = L('Watch where each note goes. Then I once more, with your eyes closed.', 'Schau, wohin jeder Ton geht. Dann noch einmal I, mit geschlossenen Augen.');
    say('info', L('Nothing is listened to or measured now: the hands rest.', 'Jetzt wird nichts gehört und nichts gemessen: Die Hände ruhen.'));
    setSimTarget(null);
    expect([]);
    let shown = -1;
    const tick = (): void => {
      const u = from + (performance.now() - startAt) / 1000 / unit;
      let k = 0;
      while (k + 1 < all.length && all[k + 1].at <= u) k++;
      if (k !== shown) {
        shown = k;
        const d = drawLine(rowA, line, (i) => (i < k ? 'done' : i === k ? 'cur' : 'up'));
        drawChord(all[k]);
        hands.removeAttribute('hidden');
        drawHands(all[k], k > 0 ? all[k - 1] : null, line);
        playhead(rowA, d.x(all[k].at));
      }
      if ((performance.now() - startAt) / 1000 < seconds) imagining = requestAnimationFrame(tick);
      else {
        stopImagine();
        go(line);
        say('info', L('Once more with your eyes closed (I), or play it now.', 'Noch einmal mit geschlossenen Augen (I), oder spiel es jetzt.'));
      }
    };
    imagining = requestAnimationFrame(tick);
  }

  function hearIt(): void {
    const ctx = engine.ctx;
    if (!ctx) return;
    // during a take it pauses the take: the model is heard between tries, never over one
    if (mode?.running()) mode.toggle();
    const sr = ctx.sampleRate;
    // what is on show: the bars of the loop, or the line
    const lines = loop ? m.lines.filter((l) => l.bars.some((b) => b >= loop!.from && b <= loop!.to)) : [m.lines[line]];
    const parts: { s: Step; u: number }[] = [];
    let u0 = 0;
    for (const l of lines) {
      for (const s of l.steps) if (!loop || (s.bar >= loop.from && s.bar <= loop.to)) parts.push({ s, u: u0 + s.at });
      u0 += l.units;
    }
    if (!parts.length) return;
    // on the first rung a little slower than full speed; with the click at the tempo it is practised at
    const unit = stage === 0 && !loop ? m.noteDur / 0.75 : (m.noteDur * 100) / tempo;
    const seconds = engine.demo(modelSound(parts, unit, sr));
    modelUntil = performance.now() + seconds * 1000 + 400;
    say('info', stage === 0 && !loop ? L(`Listen: this is how the ${m.unit} goes, a little slower than full speed.`, `Hör zu: So klingt die ${unitDe(m)}, ein wenig langsamer als im vollen Tempo.`) : L(`Listen: ${loop ? barsSaid(loop) : `the ${m.unit}`} at ${tempo}%. Then Space to play.`, `Hör zu: ${loop ? barsSaid(loop) : `die ${unitDe(m)}`} bei ${tempo}%. Dann Leertaste zum Spielen.`));
    clearTimeout(modelTimer);
    modelTimer = window.setTimeout(() => say('info', L('Now you. Take your time.', 'Jetzt du. Lass dir Zeit.')), seconds * 1000 + 400);
  }

  const strumHit = (e: ChordEvent, want: string): boolean => strumIs(e, want, m.piano);

  /** Rung 1: the app waits until it hears the right thing. */
  function waitMode(): Mode {
    const all = m.lines[line].steps;
    let at = 0;
    const times: number[] = [];
    const slipped = new Set<number>();
    let slips = 0;
    let timer = 0;
    let strumT = -1;
    rowB.toggleAttribute('hidden', true);
    hands.removeAttribute('hidden');
    rowA.style.opacity = '1';
    $('#tempobox', root).hidden = true;
    $('#hearit', root).hidden = false;
    $('#auto', root).hidden = false;
    $('#auto', root).textContent = L(`Waits until it hears the right ${chordsOnly ? 'chord' : strummed.length ? 'note or chord' : m.piano ? 'key' : 'note'}. No rush.`, `Die App wartet, bis sie ${chordsOnly ? 'den richtigen Akkord' : strummed.length ? 'den richtigen Ton oder Akkord' : m.piano ? 'die richtige Taste' : 'den richtigen Ton'} hört. Keine Eile.`);

    function draw(): void {
      const done = at >= all.length;
      const cur = all[Math.min(at, all.length - 1)];
      const prev = at > 0 ? all[at - 1] : null;
      // by ear nothing gives the next note away: not the tab, not the fretboard, not the words
      const hidden = byEar && !revealed && !done;
      const text = hidden
        ? { h1: cur.chord ? L('The next chord, by ear.', 'Der nächste Akkord, nach Gehör.') : L(`The next ${m.piano ? 'key' : 'note'}, by ear.`, `Der nächste ${m.piano ? 'Ton' : 'Ton'}, nach Gehör.`), sub: L('H plays the line again; T shows it.', 'H spielt die Zeile noch einmal; T zeigt sie.') }
        : instruction(cur, prev, done ? '' : ahead(all, at, line));
      where(line);
      const bars = m.lines[line].bars;
      const count = done ? '' : ` · ${cur.chord && !cur.both ? (m.piano ? L(`chord ${at + 1} of ${all.length}`, `Akkord ${at + 1} von ${all.length}`) : L(`strum ${at + 1} of ${all.length}`, `Anschlag ${at + 1} von ${all.length}`)) : m.piano ? L(`key ${at + 1} of ${all.length}`, `Taste ${at + 1} von ${all.length}`) : L(`note ${at + 1} of ${all.length}`, `Ton ${at + 1} von ${all.length}`)}`;
      $('#eb', root).textContent = L(
        `${ctx ? `${ctx.label} · ${m.title} · ` : ''}${cap(m.unit)} ${line + 1} of ${n}${m.piano ? '' : ` · bar${bars.length > 1 ? `s ${bars[0] + 1}–${bars[bars.length - 1] + 1}` : ` ${bars[0] + 1}`}`}${count} · the app waits for you`,
        `${ctx ? `${ctx.label} · ${m.title} · ` : ''}${unitDe(m)} ${line + 1} von ${n}${m.piano ? '' : ` · ${bars.length > 1 ? `Takte ${bars[0] + 1}–${bars[bars.length - 1] + 1}` : `Takt ${bars[0] + 1}`}`}${count} · die App wartet auf dich`,
      );
      $('#h1', root).innerHTML = done ? L(`${cap(m.unit)} done.`, `${unitDe(m)} geschafft.`) : text.h1;
      $('#sub', root).textContent = done ? '' : text.sub;
      if (hidden) $('#cbox', root)?.toggleAttribute('hidden', true);
      else drawChord(cur);
      drawLine(rowA, line, (i) => (i < at ? 'done' : hidden ? 'hide' : i === at ? 'cur' : 'up'), hidden);
      hands.toggleAttribute('hidden', hidden);
      if (!hidden) drawHands(done ? null : cur, prev, line);
      expect(done ? [] : cur.midis);
      setSimTarget(done ? null : target(cur));
    }

    function finish(): void {
      const changes = [];
      const speeds: number[] = [];
      for (const b of m.lines[line].bars) {
        const idx = all.map((s, i) => (s.bar === b ? i : -1)).filter((i) => i >= 0);
        const dur = times[idx[idx.length - 1]] - times[idx[0]];
        const written = (all[idx[idx.length - 1]].at - all[idx[0]].at) * m.noteDur;
        if (!(dur > 0) || written <= 0) continue;
        const speed = (written / dur) * 100;
        speeds.push(speed);
        // only a bar played without a slip counts as a measurement
        if (!slipped.has(b)) changes.push(store.skills.record(m.skill(b), speed, Date.now()));
      }
      const avg = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;
      linesDone++;
      store.progress[m.id] = (line + 1) % n;
      store.save();
      const leave = !!ctx && linesDone >= 2;
      const last = line === n - 1;
      const then = leave
        ? L(`That is the ${m.piano ? 'piece' : 'song'} for today.`, `Das war ${m.piano ? 'das Stück' : 'der Song'} für heute.`)
        : last && !ctx
          ? L(`That was the last ${m.unit}. Press 2 to play with the click.`, `Das war die letzte ${unitDe(m)}. Drück 2, um mit Klick zu spielen.`)
          : L(`Next ${m.unit} in a moment.`, `Gleich kommt die nächste ${unitDe(m)}.`);
      moveOn = () => (leave ? ctx!.next() : go(line + 1));
      // Where it slipped is where the practice is: that bar once more, alone and slowly, before going on.
      const spot = [...slipped].sort((a, b) => a - b)[0];
      const idx = spot === undefined ? [] : all.map((s, i) => (s.bar === spot ? i : -1)).filter((i) => i >= 0);
      const again = idx.length > 1 && !spotted;
      say(
        'good',
        L(
          `${icon('check')}${speeds.length ? `${avg}% of full speed, ` : ''}${slips ? `${slips} ${slips === 1 ? 'slip' : 'slips'}` : 'no slips'}.${levelNews(changes)} ${again ? `${m.piano ? 'The phrase' : `Bar ${spot + 1}`} once more first.` : then}`,
          `${icon('check')}${speeds.length ? `${avg}% des vollen Tempos, ` : ''}${slips ? `${slips} Patzer` : 'keine Patzer'}.${levelNews(changes)} ${again ? `Erst noch einmal ${m.piano ? 'die Phrase' : `Takt ${spot + 1}`}.` : then}`,
        ),
      );
      draw();
      if (!again) {
        timer = later(2800, moveOn, leave ? ctx!.after : L(`the next ${m.unit}`, `die nächste ${unitDe(m)}`));
        return;
      }
      spotted = true;
      afterSpot = then;
      timer = later(2600, () => {
        at = idx[0];
        spotEnd = idx[idx.length - 1] + 1;
        say('info', L(`Once more, only ${m.piano ? 'this phrase' : `bar ${spot + 1}`}, as slowly as you like.`, `Noch einmal, nur ${m.piano ? 'diese Phrase' : `Takt ${spot + 1}`}, so langsam, wie du magst.`));
        draw();
      }, m.piano ? L('this phrase once more, alone', 'diese Phrase noch einmal, allein') : L(`bar ${spot + 1} once more, alone`, `Takt ${spot + 1} noch einmal, allein`));
    }
    let moveOn: () => void = () => undefined;
    /** while the bar that slipped is played once more: the step after its last; -1 otherwise */
    let spotEnd = -1;
    let spotted = false;
    let afterSpot = '';

    function hit(time: number, cur: Step): void {
      times[at] = time;
      at++;
      if (spotEnd >= 0 && at >= spotEnd) {
        // the bar again is done: now it goes on
        spotEnd = -1;
        at = all.length;
        say('good', `${icon('check')}${L('That is it.', 'Genau so.')} ${afterSpot}`);
        draw();
        timer = later(2400, moveOn, ctx && linesDone >= 2 ? ctx.after : L(`the next ${m.unit}`, `die nächste ${unitDe(m)}`));
      } else if (at >= all.length) finish();
      else {
        say('good', `${icon('check')}${cur.chord ? L(`${nameOf(cur.chord)}: right.`, `${nameOf(cur.chord)}: richtig.`) : m.piano ? L(`${keyName(cur.midis[0], cur.over)}: right key.`, `${keyName(cur.midis[0], cur.over)}: richtige Taste.`) : L(`${cap(STRING_FULL[cur.tab!.s])} string: right.`, `${cap(STRING_FULL[cur.tab!.s])}-Saite: richtig.`)}`);
        draw();
      }
    }
    let lastSlipT = -1;
    function slip(cur: Step, html: string, time = -1): void {
      slips++;
      lastSlipT = time;
      slipped.add(cur.bar);
      say('bad', html);
    }

    // until the first note: what to do (on the first line), and how to read what is on the screen
    const strums = m.lines[line].steps.every((s) => s.chord);
    const one = m.piano ? (strums ? L('chord', 'Akkord') : L('key', 'Taste')) : strums ? L('strum', 'Anschlag') : L('note', 'Ton');
    const each = m.piano ? (strums ? 'Akkord für Akkord' : 'Taste für Taste') : strums ? 'Anschlag für Anschlag' : 'Ton für Ton';
    const what = line === 0 ? `${L(`Play the ${m.unit} from left to right, one ${one} at a time: the app waits for each and moves the marker on. A clean ${m.unit} brings the next.`, `Spiel die ${unitDe(m)} von links nach rechts, ${each}: Die App wartet jeweils und rückt die Markierung weiter. Ist die ${unitDe(m)} sauber, kommt die nächste.`)} ` : '';
    // on the first line what to do, on the others how to read it: one sentence or two, never a paragraph
    say(
      'info',
      what ||
      (m.piano
        ? chordsOnly
          ? L('Read left to right: each block is one chord, all its keys at once.', 'Lies von links nach rechts: Jeder Block ist ein Akkord, alle Tasten zugleich.')
          : L('Read left to right. Take your time.', 'Lies von links nach rechts. Lass dir Zeit.')
        : m.lines[line].steps.every((s) => s.chord)
          ? L('Read left to right: each slash is one strum.', 'Lies von links nach rechts: Jeder Schrägstrich ist ein Anschlag.')
          : L('Tab: a line is a string, lowest at the bottom. A number is a fret, 0 is open.', 'Tabulatur: Eine Linie ist eine Saite, die tiefste unten. Eine Zahl ist ein Bund, 0 heißt leer.')),
    );
    draw();
    // by ear the line is heard before anything else
    if (byEar && !revealed) timer = window.setTimeout(hearIt, 500);
    return {
      stop: () => stopTimer(timer),
      running: () => false,
      toggle: () => undefined,
      // A string that was struck but did not ring: the commonest fault of all, and worth saying so.
      // (It is reported a moment later than a note would be, so it may follow a "wrong note" for the same pluck.)
      thud: (e) => {
        const cur = all[at];
        // only a string that was struck: letting go of a chord also ends in silence
        if (!cur || !e.hit || e.time < strumT + 0.3) return;
        slipped.add(cur.bar);
        if (e.time > lastSlipT + 0.1) slips++;
        say('bad', cur.chord ? L('The strings were dead: nothing rang. Press the chord down and strum again.', 'Die Saiten waren tot: Nichts hat geklungen. Drück den Akkord fest und schlag noch einmal an.') : L('That one was dead: nothing rang. Press the string down right behind the fret and pluck again.', 'Die Saite war tot: Nichts hat geklungen. Drück sie direkt hinter dem Bund nieder und zupf noch einmal.'));
      },
      note: (e) => {
        const cur = all[at];
        // the single notes inside a strum are not notes of their own
        if (!cur || cur.chord || e.time < strumT + 0.3) return;
        if (cur.midis.includes(e.midi)) hit(e.time, cur);
        else if (byEar && !revealed) slip(cur, L(`Heard ${noteName(e.midi)}: not the next one. Listen again (H) and try ${e.midi > cur.midis[0] ? 'lower' : 'higher'}.`, `Gehört: ${noteName(e.midi)}, nicht der nächste. Hör noch einmal hin (H) und versuch es ${e.midi > cur.midis[0] ? 'tiefer' : 'höher'}.`), e.time);
        else
          slip(
            cur,
            m.piano
              ? L(`Heard ${keyName(e.midi, cur.over)}. This one is ${keyName(cur.midis[0], cur.over)}.`, `Gehört: ${keyName(e.midi, cur.over)}. Gefragt ist ${keyName(cur.midis[0], cur.over)}.`)
              : L(`Heard ${noteName(e.midi)}. This one is ${noteName(cur.midis[0])}: ${STRING_FULL[cur.tab!.s]} string, ${cur.tab!.f ? 'fret ' + cur.tab!.f : 'open'}.`, `Gehört: ${noteName(e.midi)}. Gefragt ist ${noteName(cur.midis[0])}: ${STRING_FULL[cur.tab!.s]}-Saite, ${cur.tab!.f ? cur.tab!.f + '. Bund' : 'leer'}.`),
            e.time,
          );
      },
      chord: (e) => {
        const cur = all[at];
        if (!cur?.chord) return;
        if (strumHit(e, cur.chord)) {
          strumT = e.time;
          hit(e.time, cur);
        } else if (e.best && e.best !== cur.chord && e.score > 0.7 && e.margin > 0.1) slip(cur, byEar && !revealed ? L(`Heard ${chordName(e.best, m.piano)}: not this one. Listen again (H).`, `Gehört: ${chordName(e.best, m.piano)}, nicht dieser. Hör noch einmal hin (H).`) : L(`Heard ${chordName(e.best, m.piano)}. This one is ${nameOf(cur.chord)}.`, `Gehört: ${chordName(e.best, m.piano)}. Gefragt ist ${nameOf(cur.chord)}.`));
      },
    };
  }

  /** Rungs 2 and 3: play with the click. One line at a time, or the whole piece from this line on. */
  function clickMode(): Mode {
    const whole = stage === 2 && !review && !loop;
    if (stage === 2) tempo = 100;
    // the lines a loop runs through: every line one of its bars is in
    const looped = loop ? m.lines.map((_, i) => i).filter((i) => m.lines[i].bars.some((b) => b >= loop!.from && b <= loop!.to)) : null;
    const idxs = review ? review.lines : looped ?? (whole ? m.lines.map((_, i) => i).slice(line) : [line]);
    const rows = [rowA, rowB];
    // a note is only reported some 0.15 s after it was played, a strum after 0.25 s
    const grace = strummed.length ? 0.36 : 0.22;
    let take: Take | null = null;
    let flat: Step[] = [];
    /** where each step lies, in note units from the start of the first of the lines */
    let gu: number[] = [];
    let lineStart: number[] = [];
    let stepBase: number[] = [];
    let drawn: (Drawn | null)[] = [null, null];
    let raf = 0;
    let timer = 0;
    let start = 0;
    let t0 = 0;
    let unit = 1;
    let beat = 1;
    let endT = 0;
    let latency = 0;
    let played = tempo;
    let shown = '';
    let recFrom = -1;
    rowB.toggleAttribute('hidden', idxs.length < 2);
    // two lines on show leave no room for the fretboard; the chord picture stays
    hands.toggleAttribute('hidden', whole || idxs.length > 1 || (!!review && !review.relearn));
    $('#tempobox', root).hidden = false;
    $<HTMLButtonElement>('#slower', root).disabled = whole || !!review;
    $<HTMLButtonElement>('#faster', root).disabled = whole || !!review;
    $('#auto', root).hidden = true;
    // the model can be heard between takes on every rung; during a take, asking for it pauses the take
    $('#hearit', root).hidden = false;

    /** the bar a take is limited to, after one that fell apart there; null for a whole line */
    let spot: number | null = null;
    let spotting = false;
    /** the bars a take is limited to: the one that fell apart, or the loop; null for the lines as they are */
    let range: { from: number; to: number } | null = null;
    let uShift = 0;
    const inRange = (s: Step): boolean => !range || (s.bar >= range.from && s.bar <= range.to);

    function cancel(): void {
      cancelAnimationFrame(raf);
      stopTimer(timer);
      engine.clearTicks();
      take = null;
      rows.forEach((r) => playhead(r, null));
      delete root.dataset.step;
    }

    function begin(): void {
      cancel();
      takes++;
      played = tempo;
      unit = (m.noteDur * 100) / tempo;
      beat = m.beat * unit;
      start = engine.now() + 0.5;
      range = loop ? { ...loop } : spot !== null && !whole ? { from: spot, to: spot } : null;
      spotting = !loop && range !== null;
      flat = [];
      gu = [];
      lineStart = [];
      stepBase = [];
      const clicks: { u: number; accent: boolean }[] = [];
      let u0 = 0;
      for (const li of idxs) {
        const l = m.lines[li];
        lineStart.push(u0);
        stepBase.push(flat.length);
        for (const c of l.clicks) clicks.push({ u: u0 + c.u, accent: c.accent });
        for (const s of l.steps) {
          flat.push(s);
          gu.push(u0 + s.at);
        }
        u0 += l.units;
      }
      // a take of some bars only: they alone, with the click running through them and one bar counted in
      const inside = flat.map((s, i) => (inRange(s) ? i : -1)).filter((i) => i >= 0);
      if (range && !inside.length) range = null;
      uShift = range ? gu[inside[0]] : 0;
      const after = range ? flat.findIndex((s, i) => i > inside[inside.length - 1] && !inRange(s)) : -1;
      const uEnd = range ? (after >= 0 ? gu[after] : u0) : u0;
      // a line that begins with an upbeat starts that much before the click the count leads up to
      const upbeat = range ? 0 : (m.lines[idxs[0]].clicks[0]?.u ?? 0);
      t0 = start + m.count * beat - upbeat * unit;
      const vol = store.settings.click;
      const low = store.settings.clickSound === 'click';
      for (let k = 0; k < m.count; k++) engine.tick(start + k * beat, k === 0, vol, low);
      for (const c of clicks) if (c.u >= uShift - 1e-6 && c.u < uEnd - 1e-6) engine.tick(t0 + (c.u - uShift) * unit, c.accent, vol, low);
      // a note played on the click arrives a little after it: through the speakers and back through the microphone
      latency = engine.micOn ? (store.settings.latency >= 0 ? store.settings.latency : engine.latencyEstimate()) : 0;
      // in a take of some bars the steps before them count as played, the ones after them never come
      const steps: TakeStep[] = flat.map((s, i) => ({ midis: s.midis, chord: s.chord, t: inRange(s) ? t0 + (gu[i] - uShift) * unit + latency : gu[i] < uShift ? -1e9 : 1e9, bar: s.bar }));
      endT = t0 + (uEnd - uShift) * unit;
      take = new Take(steps);
      steps.forEach((s, i) => (s.t === -1e9 ? (take!.state[i] = 'hit') : undefined));
      // under headphones: a bass and the chords with it
      if (store.settings.backing && engine.ctx) {
        const chords: { u: number; id: string }[] = [];
        let was: string | undefined;
        flat.forEach((s, i) => {
          const id = chordAt(s);
          if (id && id !== was && gu[i] >= uShift - 1e-6 && gu[i] < uEnd - 1e-6) chords.push({ u: gu[i] - uShift, id });
          if (id) was = id;
        });
        // a stretch that starts inside a chord takes that chord along from its first beat
        const before = flat.filter((_, i) => gu[i] < uShift - 1e-6).map(chordAt).filter(Boolean).pop();
        if (before && (!chords.length || chords[0].u > 1e-6)) chords.unshift({ u: 0, id: before });
        const sound = backing({ chords, clicks: clicks.filter((c) => c.u >= uShift - 1e-6 && c.u < uEnd - 1e-6).map((c) => ({ u: c.u - uShift, accent: c.accent })), units: uEnd - uShift, unit, sr: engine.ctx.sampleRate, a4: m.piano ? store.settings.pianoA4 : guitarA4() });
        engine.playAt(t0, sound, 0.9);
      }
      // the whole piece, or a loop, is recorded, to be listened to afterwards
      recFrom = whole && engine.micOn && store.settings.recordTakes ? engine.now() : -1;
      if (recFrom >= 0) engine.record(TAKE_MAX);
      if (whole) $('#takebox', root).hidden = true;
      shown = '';
      $('#tempo', root).textContent = `${tempo}%`;
      $('#pause span', root).textContent = L('Pause', 'Pause');
      say(
        'info',
        loop
          ? L(`The loop, ${barsSaid(loop)}, at ${tempo}%. One bar is counted in; it goes round until you stop it (L).`, `Die Schleife, ${barsSaid(loop)}, bei ${tempo}%. Ein Takt wird eingezählt; sie läuft, bis du sie anhältst (L).`)
          : spotting
          ? L(`Only ${m.piano ? 'this phrase' : `bar ${spot! + 1}`} this time: that is where it fell apart.`, `Diesmal nur ${m.piano ? 'diese Phrase' : `Takt ${spot! + 1}`}: Dort ging es schief.`)
          : review
            ? review.relearn
              ? L(`An old ${m.piano ? 'piece' : 'song'} again: two ${m.unit}s with the click at ${tempo}%, as last time they slipped.`, `${m.piano ? 'Ein altes Stück' : 'Ein alter Song'} wieder: zwei ${unitDe(m, true)} mit Klick bei ${tempo}%, weil sie letztes Mal verrutscht sind.`)
              : L(`An old ${m.piano ? 'piece' : 'song'}, from cold: two ${m.unit}s at full speed, no run-up. Whatever comes out is fine; it shows what has stayed.`, `${m.piano ? 'Ein altes Stück' : 'Ein alter Song'}, aus dem Stand: zwei ${unitDe(m, true)} im vollen Tempo, ohne Anlauf. Was herauskommt, ist in Ordnung; es zeigt, was geblieben ist.`)
          : whole
            ? L('Play each one as the marker reaches it, from here to the end.', 'Spiel immer dann, wenn die Markierung ankommt, von hier bis zum Ende.')
            : L(`Play each one as the marker reaches it. It moves on when the ${m.unit} was clean.`, `Spiel immer dann, wenn die Markierung ankommt. Es geht weiter, wenn die ${unitDe(m)} sauber war.`),
      );
      raf = requestAnimationFrame(tick);
    }

    function render(k: number, due: number, counting: number): void {
      const tk = take!;
      const look = (g: number): StepLook => (range && !inRange(flat[g]) ? 'off' : perform ? (g === due ? 'cur' : 'up') : tk.state[g] === 'hit' ? 'done' : tk.state[g] === 'miss' ? 'miss' : g === due ? 'cur' : 'up');
      for (const r of [0, 1]) {
        if (r === 1 && rowB.hasAttribute('hidden')) continue;
        const kk = k % 2 === r ? k : k + 1;
        if (kk < idxs.length) {
          drawn[r] = drawLine(rows[r], idxs[kk], (i) => look(stepBase[kk] + i));
          rows[r].style.opacity = kk === k ? '1' : '0.5';
        } else {
          drawn[r] = null;
          rows[r].innerHTML = '';
        }
      }
      const step = flat[due >= 0 ? due : flat.length - 1];
      const prev = due > 0 ? flat[due - 1] : null;
      where(idxs[k]);
      $('#eb', root).textContent = `${ctx ? `${ctx.label} · ${m.title} · ` : ''}${loop ? L(`Loop · ${barsSaid(loop)} · ${tempo}%${loopClean ? ` · ${loopClean} clean in a row` : ''}`, `Schleife · ${barsSaid(loop)} · ${tempo}%${loopClean ? ` · ${loopClean} sauber in Folge` : ''}`) : perform ? L('Performance · no marks while you play · full speed', 'Vortrag · keine Markierungen beim Spielen · volles Tempo') : review ? L(`Played again from cold · ${cap(m.unit)}s ${idxs.map((x) => x + 1).join(' and ')} · ${tempo}%`, `Wiederholen aus dem Stand · ${unitDe(m, true)} ${idxs.map((x) => x + 1).join(' und ')} · ${tempo}%`) : whole ? L('Full speed, to the end', 'Volles Tempo, bis zum Ende') : L(`${cap(m.unit)} ${idxs[k] + 1} of ${n} · with the click at ${tempo}%`, `${unitDe(m)} ${idxs[k] + 1} von ${n} · mit Klick bei ${tempo}%`)}`;
      const id = chordAt(step);
      // the chord that comes after this one: the next step that is played over another
      const after = chordAt(flat.slice(Math.max(0, due) + 1).find((s) => chordAt(s) !== id)) ?? m.chordOf(step.bar + 1);
      $('#h1', root).innerHTML = counting > 0 ? L(`Get ready: <em>${counting}</em>`, `Mach dich bereit: <em>${counting}</em>`) : id ? `<em>${nameOf(id)}</em>${after && after !== id ? L(` · then ${nameOf(after)}`, ` · dann ${nameOf(after)}`) : ''}` : L('Play along.', 'Spiel mit.');
      $('#sub', root).textContent = counting > 0 ? L(`${m.count} clicks, then you.`, `${m.count} Klicks, dann du.`) : '';
      drawChord(step);
      if (!whole) drawHands(step, prev, idxs[k]);
      setSimTarget(due >= 0 ? target(flat[due]) : null);
    }

    function tick(): void {
      raf = requestAnimationFrame(tick);
      const tk = take;
      if (!tk) return;
      const now = engine.now();
      const u = (now - t0) / unit + uShift;
      let k = 0;
      while (k + 1 < idxs.length && u >= lineStart[k + 1]) k++;
      const all = tk.advance(now - grace);
      const due = tk.due(now);
      const counting = now < t0 ? Math.min(m.count, m.count - Math.max(0, Math.floor((now - start) / beat + 1e-6))) : 0;
      const key = `${k}|${tk.version}|${due}|${counting}`;
      if (key !== shown) {
        shown = key;
        render(k, due, counting);
      }
      const d = drawn[k % 2];
      playhead(rows[k % 2], d && u > -1.5 ? d.x(u - lineStart[k]) : null);
      playhead(rows[1 - (k % 2)], null);
      expect(tk.near(now - 0.11).flatMap((s) => s.midis));
      // for the practice instrument and the browser check: the last step whose moment has come
      let s = -1;
      while (s + 1 < tk.steps.length && tk.steps[s + 1].t <= now) s++;
      root.dataset.step = String(s);
      if (now > endT + 0.2 && (all || spotting)) done();
    }

    function done(): void {
      const tk = take!;
      const r = tk.result();
      cancelAnimationFrame(raf);
      rows.forEach((row) => playhead(row, null));
      // what was recorded, with where each bar lies in it
      const rec = recFrom >= 0 ? engine.recorded() : null;
      // the whole piece at full speed: its bars as a row to look at, and with a recording to listen to
      if (whole) {
        const zero = recFrom >= 0 ? recFrom : t0;
        const starts = new Map<number, number>();
        flat.forEach((s, i) => inRange(s) && !starts.has(s.bar) && starts.set(s.bar, t0 + (gu[i] - uShift) * unit - zero));
        const order = [...starts.entries()].sort((a, b) => a[1] - b[1]);
        const kept = rec && rec.samples.length > rec.sampleRate ? rec : null;
        const meta = { t: Date.now(), secs: kept ? kept.samples.length / kept.sampleRate : 0, tempo: played, bars: order.map(([bar, from], k) => ({ bar, from: Math.max(0, from), to: order[k + 1]?.[1] ?? endT - zero, clean: r.cleanBars.includes(bar) })) };
        showTake(kept ? { samples: kept.samples, rate: kept.sampleRate, meta } : { samples: new Float32Array(0), rate: 48000, meta }, !!perform);
        if (kept) void saveTake(inst, m.id, kept.samples, kept.sampleRate, meta);
      }
      recFrom = -1;
      if (loop) {
        // the loop is practice that counts: clean bars are measured, and three clean runs in a row speed it up
        const now = Date.now();
        const changes = r.cleanBars.map((b) => store.skills.record(m.skill(b), played, now));
        const clean = r.hits === r.total && r.strays === 0;
        loopClean = clean ? loopClean + 1 : 0;
        let up = '';
        if (loopClean >= 3 && store.settings.autoTempo && tempo < 125) {
          tempo = Math.min(125, tempo + 5);
          loopClean = 0;
          up = L(` Three clean in a row: now ${tempo}%.`, ` Dreimal sauber in Folge: jetzt ${tempo}%.`);
        }
        store.save();
        say(clean ? 'good' : 'info', `${clean ? icon('check') : ''}${L(`${r.hits} of ${r.total} on the click at ${played}%.`, `${r.hits} von ${r.total} auf dem Klick bei ${played}%.`)}${levelNews(changes)}${up}${!clean && !up ? L(' Round it goes again.', ' Sie läuft noch einmal.') : ''}`);
        take = null;
        setSimTarget(null);
        timer = later(1800, begin, L(`the loop again, at ${tempo}%`, `die Schleife noch einmal, bei ${tempo}%`));
        return;
      }
      if (spotting) {
        // the bar alone is practice, not a measurement: say how it went and play the line again
        const idx = flat.map((s, i) => (s.bar === spot ? i : -1)).filter((i) => i >= 0);
        const hit = idx.filter((i) => tk.state[i] === 'hit').length;
        spot = null;
        spotting = false;
        say(hit === idx.length ? 'good' : 'info', `${hit === idx.length ? icon('check') : ''}${L(`That bar: ${hit} of ${idx.length} on the click. Now the whole ${m.unit} again.`, `Dieser Takt: ${hit} von ${idx.length} auf dem Klick. Jetzt noch einmal die ganze ${unitDe(m)}.`)}`);
        take = null;
        setSimTarget(null);
        timer = later(2400, begin, L(`the whole ${m.unit} again`, `noch einmal die ganze ${unitDe(m)}`));
        return;
      }
      const now = Date.now();
      const changes = r.cleanBars.map((b) => store.skills.record(m.skill(b), played, now));
      // learn how late a note on the click arrives on this setup, from takes that mostly worked
      if (engine.micOn && r.hits >= Math.max(4, 0.6 * r.total)) store.settings.latency = Math.max(0, Math.min(0.35, latency + 0.5 * r.offset));
      const clean = r.hits === r.total && r.strays === 0;
      const ms = Math.round(Math.abs(r.offset) * 1000);
      const timing = r.hits < 3 ? '' : ms < 30 ? L(' Right on the click.', ' Genau auf dem Klick.') : L(` Mostly ${ms} ms ${r.offset > 0 ? 'late' : 'early'}.`, ` Meist ${ms} ms ${r.offset > 0 ? 'zu spät' : 'zu früh'}.`);
      let then: string;
      let leave = false;
      const visit = !!review;
      if (review) {
        // a visit is a measurement of what has stayed, not practice: say how it went and leave it there
        then = reviewed(inst, m.id, clean);
        leave = !!ctx;
        review = null;
      } else if (whole) {
        store.progress[m.id] = 0;
        leave = !!ctx;
        then = clean
          ? L(`That is the whole ${m.piano ? 'piece' : 'song'} at full speed.`, `Das ist ${m.piano ? 'das ganze Stück' : 'der ganze Song'} in vollem Tempo.`)
          : L(`${r.cleanBars.length} of ${r.bars.length} ${m.piano ? 'phrases' : 'bars'} clean.${leave ? '' : ' Press R or Space to play it again.'}`, `${r.cleanBars.length} von ${r.bars.length} ${m.piano ? 'Phrasen' : 'Takten'} sauber.${leave ? '' : ' Drück R oder die Leertaste, um es noch einmal zu spielen.'}`);
      } else if (clean) {
        linesDone++;
        fails = 0;
        const wrapped = line === n - 1;
        store.progress[m.id] = (line + 1) % n;
        if (wrapped && tempo < 100) tempo = TEMPOS.find((x) => x > tempo) ?? 100;
        leave = !!ctx && linesDone >= 2;
        then = leave ? L('That is it for today.', 'Das war’s für heute.') : wrapped ? L(`Through to the end. From the top at ${tempo}%.`, `Durch bis zum Ende. Von vorn bei ${tempo}%.`) : L(`Next ${m.unit}.`, `Nächste ${unitDe(m)}.`);
      } else {
        if (r.hits < 0.6 * r.total) fails++;
        const slower = fails >= 2 && tempo > TEMPOS[0];
        if (slower) {
          tempo = [...TEMPOS].reverse().find((x) => x < tempo) ?? TEMPOS[0];
          fails = 0;
        }
        leave = !!ctx && takes >= 6;
        // where it fell apart is where the practice is: that bar alone first, then the line again
        const failed = r.bars.filter((b) => !r.cleanBars.includes(b));
        spot = !leave && !slower && r.bars.length > 1 && failed.length ? failed[0] : null;
        then = leave
          ? L('Enough for today. It will be there tomorrow.', 'Genug für heute. Morgen ist es noch da.')
          : slower
            ? L(`Once more, a little slower: ${tempo}%.`, `Noch einmal, etwas langsamer: ${tempo}%.`)
            : spot !== null
              ? L(`First only ${m.piano ? 'the phrase' : `bar ${spot + 1}`}, where it fell apart.`, `Erst nur ${m.piano ? 'die Phrase' : `Takt ${spot + 1}`}, wo es schiefging.`)
              : L('Once more.', 'Noch einmal.');
      }
      // played clean all through for the first time: it joins the repertoire and starts coming back
      if (enlist(inst, m.id)) then += L(` New in your repertoire: it comes back in ${REVIEW_DAYS[0]} days, from cold.`, ` Neu in deinem Repertoire: Es kommt in ${REVIEW_DAYS[0]} Tagen wieder, aus dem Stand.`);
      store.save();
      // after a performance the player says first how it went; the app's verdict waits for that
      const verdict = (): void => {
        say(clean ? 'good' : 'info', `${clean ? icon('check') : ''}${L(`${r.hits} of ${r.total} on the click at ${played}%.${r.strays ? ` ${r.strays} extra.` : ''}`, `${r.hits} von ${r.total} auf dem Klick bei ${played}%.${r.strays ? ` ${r.strays} zu viel.` : ''}`)}${timing}${levelNews(changes)} ${then}`);
        $('#h1', root).innerHTML = clean ? L('Clean.', 'Sauber.') : L(`${r.hits} of ${r.total}.`, `${r.hits} von ${r.total}.`);
      };
      const wasPerform = perform;
      render(Math.max(0, idxs.length - 1), -1, 0);
      take = null;
      setSimTarget(null);
      /** what comes after the verdict: nothing moves on before the player has said how it went */
      const onward = (): void => {
        if (leave) timer = later(3200, ctx!.next, ctx!.after);
        else if (visit) $('#pause span', root).textContent = L('Play', 'Spielen');
        // the take of one bar belongs to this visit of the line: it starts here, not from scratch
        else if (!whole) timer = later(2600, () => (clean ? go(line + 1) : spot !== null ? begin() : go(line)), clean ? L(`the next ${m.unit}`, `die nächste ${unitDe(m)}`) : spot !== null ? L(`bar ${spot + 1} alone`, `Takt ${spot + 1} allein`) : L(`the same ${m.unit} again`, `noch einmal dieselbe ${unitDe(m)}`));
        else $('#pause span', root).textContent = L('Play', 'Spielen');
      };
      if (wasPerform) {
        $('#h1', root).innerHTML = L('How did it go?', 'Wie lief es?');
        say('info', L('Before the app says how it heard it: how many slips did you hear yourself? (0 to 3)', 'Bevor die App sagt, wie sie es gehört hat: Wie viele Patzer hast du selbst gehört? (0 bis 3)'));
        selfRate(r.bars.length - r.cleanBars.length, () => {
          verdict();
          onward();
        });
      } else {
        verdict();
        onward();
      }
    }

    begin();
    return {
      stop: () => {
        cancel();
        if (recFrom >= 0) engine.recorded();
        recFrom = -1;
      },
      running: () => !!take,
      toggle: () => {
        if (take) {
          cancel();
          $('#h1', root).innerHTML = L('Paused.', 'Pausiert.');
          $('#sub', root).textContent = L('Space to go on.', 'Leertaste zum Weitermachen.');
          $('#pause span', root).textContent = L('Play', 'Spielen');
        } else begin();
      },
      note: (e) => {
        if (!take || take.nearest(e.time)?.chord) return;
        if (take.note(e.midi, e.time) === null && e.time > t0 - beat / 2 && e.time < endT && !perform) say('bad', L(`Heard ${noteName(e.midi)} where it does not belong.`, `Gehört: ${noteName(e.midi)}, an einer Stelle, an der nichts zu spielen ist.`));
      },
      thud: () => undefined,
      chord: (e) => {
        if (!take) return;
        const want = take.wanted(e.time)?.chord;
        if (want && strumHit(e, want)) take.chord(want, e.time);
        else if (e.best && e.score > 0.7 && e.margin > 0.1) take.chord(e.best, e.time);
      },
    };
  }

  function setStage(s: number): void {
    mode?.stop();
    stage = s;
    RUNGS().forEach((_, i) => $('#st' + i, root).setAttribute('aria-pressed', String(i === s)));
    $('#st0s', root).textContent = L('waits for you', 'wartet auf dich');
    $('#st1s', root).textContent = L(`${m.unit} by ${m.unit}, ${s === 1 ? tempo : suggest(m, line).tempo}%`, `${unitDe(m)} für ${unitDe(m)}, ${s === 1 ? tempo : suggest(m, line).tempo}%`);
    $('#st2s', root).textContent = L('start to end', 'von Anfang bis Ende');
    // what the rung on show does, and what comes after it: the captions of the rungs are hidden on small screens
    $('#rungnote', root).textContent = review
      ? L(`A visit from cold: two ${m.unit}s at full speed, measured as they come. Then 1, 2 or 3 to practise on.`, `Ein Besuch aus dem Stand: zwei ${unitDe(m, true)} im vollen Tempo, gemessen, wie sie kommen. Danach 1, 2 oder 3 zum Üben.`)
      : loop
        ? L(`The loop goes round until L ends it. [ and ] take in the bar before or after.${store.settings.autoTempo ? ' Three clean runs in a row: 5% faster.' : ''}`, `Die Schleife läuft, bis L sie beendet. [ und ] nehmen den Takt davor oder danach dazu.${store.settings.autoTempo ? ' Dreimal sauber in Folge: 5 % schneller.' : ''}`)
        : perform
          ? L('A performance: no marks while you play, and a recording to listen to. You say first how it went.', 'Ein Vortrag: keine Markierungen beim Spielen, und eine Aufnahme zum Anhören. Du sagst zuerst, wie es lief.')
          : [
      L(`Waits for every ${m.piano ? 'key' : 'note and strum'}, no clock. When the ${m.unit}s sit: 2, with the click.`, `Wartet auf jeden ${m.piano ? 'Ton' : 'Ton und Anschlag'}, ohne Uhr. Sitzen die ${m.piano ? 'Phrasen' : 'Zeilen'}: weiter mit 2, mit Klick.`),
      L(`In time with the click, ${m.unit} by ${m.unit}; the tempo rises when it goes well. Then: 3.`, `Im Takt mit dem Klick, ${unitDe(m)} für ${unitDe(m)}; das Tempo steigt, wenn es gut geht. Danach: 3.`),
      L(`The whole ${m.piano ? 'piece' : 'song'} at full speed, from here to the end.`, `${m.piano ? 'Das ganze Stück' : 'Der ganze Song'} im vollen Tempo, von hier bis zum Ende.`),
    ][s];
    mode = s === 0 ? waitMode() : clickMode();
  }

  /** Go to a line and start it on the current rung. */
  /** Ends a model that is playing: the player has moved on. */
  function stopModel(): void {
    engine.stopDemo();
    clearTimeout(modelTimer);
    modelUntil = 0;
  }

  function go(li: number): void {
    stopImagine();
    stopModel();
    // moving to another line leaves a visit to an old song, a loop and a performance: from here on it is practice
    review = null;
    loop = null;
    perform = false;
    // a new line by ear is hidden again
    revealed = false;
    extras();
    line = (li + n) % n;
    setStage(stage);
  }

  /** The player picks a rung: that is practice, whatever the lesson was opened for. */
  function pick(s: number): void {
    stopImagine();
    review = null;
    loop = null;
    perform = false;
    extras();
    setStage(s);
  }

  /** The tempo by hand: in steps of 5%, from 25% up to 125% (beyond the song's own speed, to have room to spare), as Yousician has it. */
  function setTempo(step: number): void {
    if ((stage !== 1 && !loop) || review) return;
    tempo = Math.max(25, Math.min(125, Math.round(tempo / 5) * 5 + 5 * step));
    fails = 0;
    loopClean = 0;
    setStage(stage === 2 ? 1 : stage);
  }

  /** The buttons say what is switched on. */
  function extras(): void {
    $('#loopbtn', root).setAttribute('aria-pressed', String(!!loop));
    $<HTMLButtonElement>('#widenl', root).disabled = !loop || loop.from === 0;
    $<HTMLButtonElement>('#widenr', root).disabled = !loop || loop.to === lastBar;
    $('#backbtn', root).setAttribute('aria-pressed', String(store.settings.backing));
    $('#perfbtn', root).setAttribute('aria-pressed', String(perform));
    $('#earbtn', root).setAttribute('aria-pressed', String(byEar));
    if (m.piano) {
      $('#staffbtn', root).setAttribute('aria-pressed', String(store.settings.notation === 'staff'));
      $('#namesbtn', root).textContent = { auto: L('Note names: until it sits', 'Notennamen: bis es sitzt'), on: L('Note names: always', 'Notennamen: immer'), off: L('Note names: never', 'Notennamen: nie') }[store.settings.noteNames];
    }
  }

  /** S: the piano's music on the staff, or as note blocks; kept for next time. */
  function toggleStaff(): void {
    if (!m.piano) return;
    store.settings.notation = store.settings.notation === 'staff' ? 'strip' : 'staff';
    store.save();
    extras();
    setStage(stage);
  }

  /** E: by ear on the first rung, or back to reading. */
  function toggleEar(): void {
    byEar = !byEar;
    revealed = false;
    extras();
    pick(0);
  }

  /** L: the bars on show go round and round with the click; L again ends it. */
  function toggleLoop(): void {
    review = null;
    perform = false;
    loopClean = 0;
    if (loop) {
      loop = null;
      setStage(1);
    } else {
      const bars = m.lines[line].bars;
      loop = { from: bars[0], to: bars[bars.length - 1] };
      setStage(1);
    }
    extras();
  }

  /** [ and ]: the loop takes in the bar before it, or the bar after it. */
  function widen(side: number): void {
    if (!loop) return toggleLoop();
    if (side < 0) loop.from = Math.max(0, loop.from - 1);
    else loop.to = Math.min(lastBar, loop.to + 1);
    loopClean = 0;
    setStage(1);
    extras();
  }

  /** B: the accompaniment, on or off. It is kept for next time. */
  function toggleBacking(): void {
    store.settings.backing = !store.settings.backing;
    store.save();
    extras();
    say('info', store.settings.backing ? L('Backing on: a bass and the chords under the click, from the next take. Headphones only: through speakers the microphone would hear it as your playing.', 'Begleitung an: ein Bass und die Akkorde unter dem Klick, ab dem nächsten Durchgang. Nur mit Kopfhörern: Über Lautsprecher würde das Mikrofon sie als dein Spiel hören.') : L('Backing off.', 'Begleitung aus.'));
  }

  /** V: a performance of the whole thing, or back to practice. */
  function togglePerform(): void {
    perform = !perform;
    review = null;
    loop = null;
    // a performance is the whole thing, from the top
    if (perform) line = 0;
    setStage(perform ? 2 : stage);
    extras();
  }

  /** The recording on show: the one just made, or one that was kept. */
  let heardTake: { samples: Float32Array; rate: number; meta: TakeMeta } | null = null;
  /** the bars of the last take at full speed, recorded or not */
  let shownTake: { samples: Float32Array; rate: number; meta: TakeMeta } | null = null;
  /** the player is asked for their count of slips: what to do with the answer */
  let rating: ((n: number) => void) | null = null;

  function paintBars(hidden: boolean): void {
    const t = shownTake;
    if (!t) return;
    $('#barmap', root).innerHTML = t.meta.bars.map((b, k) => `<button class="bm${hidden ? '' : b.clean ? ' ok' : ' bad'}" data-k="${k}" aria-label="${esc(barsSaid({ from: b.bar, to: b.bar }))}${hidden ? '' : b.clean ? L(': clean', ': sauber') : L(': not clean', ': nicht sauber')}">${b.bar + 1}</button>`).join('');
    $$<HTMLButtonElement>('#barmap [data-k]', root).forEach((el) => (el.onclick = () => {
      const b = t.meta.bars[Number(el.dataset.k)];
      if (t.samples.length) playBack(t.samples, t.rate, Math.max(0, b.from - 0.15), b.to + 0.4, barsSaid({ from: b.bar, to: b.bar }));
    }));
  }

  /** Shows the recording just made under the music, as a row of bars to pick from. */
  function showTake(t: { samples: Float32Array; rate: number; meta: TakeMeta }, hideVerdict: boolean): void {
    // without a recording (no microphone, or recording switched off) the bars are there to look at, not to hear
    const audible = t.samples.length > 0;
    heardTake = audible ? t : null;
    shownTake = t;
    $('#takebox', root).hidden = false;
    paintBars(hideVerdict);
    const first = takeMeta(inst, m.id, 'first');
    $('#firsttake', root).hidden = !first;
    $('#listen', root).hidden = !audible;
    $('#savetake', root).hidden = !audible;
    $('#takenote', root).textContent = !audible ? (store.settings.recordTakes ? L('Nothing was recorded: the microphone is off.', 'Nichts wurde aufgenommen: Das Mikrofon ist aus.') : L('Recording is switched off in the settings.', 'Das Aufnehmen ist in den Einstellungen ausgeschaltet.')) : first ? L(`Your first recording of it is from ${dayMonth(first.t)}, at ${first.tempo}%.`, `Deine erste Aufnahme davon ist vom ${dayMonth(first.t)}, bei ${first.tempo}%.`) : L('Kept in this browser as your first recording of it.', 'In diesem Browser als deine erste Aufnahme davon gespeichert.');
  }

  /** The player's count of slips, asked for before the app's verdict is shown, and kept beside it. */
  function selfRate(app: number, then: () => void): void {
    $('#selfrate', root).hidden = false;
    rating = (n) => {
      rating = null;
      $('#selfrate', root).hidden = true;
      store.ratings.push({ t: Date.now(), self: n, app });
      store.save();
      paintBars(false);
      then();
      const same = Math.min(n, 3) === Math.min(app, 3);
      $('#takenote', root).textContent = same ? L(`You heard it as the app did: ${app === 0 ? 'no slips' : `slips in ${app} ${app === 1 ? 'bar' : 'bars'}`}.`, `Du hast es gehört wie die App: ${app === 0 ? 'keine Patzer' : `Patzer in ${app} ${app === 1 ? 'Takt' : 'Takten'}`}.`) : L(`You counted ${n === 3 ? '3 or more' : n}; the app heard slips in ${app} ${app === 1 ? 'bar' : 'bars'}. Listen back to the red ones to hear what it heard.`, `Du hast ${n === 3 ? '3 oder mehr' : n} gezählt; die App hörte Patzer in ${app} ${app === 1 ? 'Takt' : 'Takten'}. Hör dir die roten an, um zu hören, was sie gehört hat.`);
    };
    $$<HTMLButtonElement>('#selfrate [data-rate]', root).forEach((b) => (b.onclick = () => rating?.(Number(b.dataset.rate))));
  }

  /** Plays part of a recording through the speakers; what the microphone hears of it meanwhile is not playing. */
  function playBack(samples: Float32Array, rate: number, from = 0, to = Infinity, what = ''): void {
    const ctx = engine.ctx;
    if (!ctx) return;
    if (mode?.running()) mode.toggle();
    let part = samples.subarray(Math.floor(from * rate), Math.min(samples.length, Math.floor(to * rate)));
    if (rate !== ctx.sampleRate) part = resample(part, rate, ctx.sampleRate);
    const seconds = engine.demo(part);
    modelUntil = performance.now() + seconds * 1000 + 300;
    say('info', what ? L(`Listening back: ${what}.`, `Zum Anhören: ${what}.`) : L('Listening back to your take.', 'Dein Durchgang zum Anhören.'));
  }

  const stopHear = hear(
    root,
    {
      onNote: (e) => {
        if (!modelPlaying()) mode?.note(e);
      },
      onChord: (e) => {
        if (!modelPlaying()) mode?.chord(e);
      },
      ...(m.piano
        ? {}
        : {
            onThud: (e: ThudEvent) => {
              if (!modelPlaying()) mode?.thud(e);
            },
          }),
    },
    (l) => {
      if (m.piano) pianoEars(l);
      l.chordCandidates = strummed.length ? strummed : null;
      if (chordsOnly) l.noteDetection = false;
    },
  );
  $('#hearit', root).onclick = hearIt;
  const stopKeys = keys({
    ArrowLeft: () => go(line - 1),
    ArrowRight: () => go(line + 1),
    r: () => go(line),
    h: hearIt,
    '1': () => (rating ? rating(1) : pick(0)),
    '2': () => (rating ? rating(2) : pick(1)),
    '3': () => (rating ? rating(3) : pick(2)),
    '0': () => rating?.(0),
    l: toggleLoop,
    '[': () => widen(-1),
    ']': () => widen(1),
    a: toggleBacking,
    v: togglePerform,
    e: toggleEar,
    s: toggleStaff,
    i: imagine,
    k: toggleWords,
    t: () => {
      if (!byEar || revealed) return;
      revealed = true;
      setStage(stage);
    },
    p: () => heardTake && playBack(heardTake.samples, heardTake.rate),
    '-': () => setTempo(-1),
    '+': () => setTempo(1),
    '=': () => setTempo(1),
    ' ': () => mode?.toggle(),
  });
  $('#prev', root).onclick = () => go(line - 1);
  $('#next', root).onclick = () => go(line + 1);
  $('#again', root).onclick = () => go(line);
  $('#slower', root).onclick = () => setTempo(-1);
  $('#faster', root).onclick = () => setTempo(1);
  $('#pause', root).onclick = () => mode?.toggle();
  $('#loopbtn', root).onclick = toggleLoop;
  $('#widenl', root).onclick = () => widen(-1);
  $('#widenr', root).onclick = () => widen(1);
  $('#backbtn', root).onclick = toggleBacking;
  $('#perfbtn', root).onclick = togglePerform;
  $('#earbtn', root).onclick = toggleEar;
  $('#imagbtn', root).onclick = imagine;
  const wb = root.querySelector<HTMLButtonElement>('#wordsbtn');
  if (wb) wb.onclick = toggleWords;
  if (m.piano) {
    $('#staffbtn', root).onclick = toggleStaff;
    $('#namesbtn', root).onclick = () => {
      const order = ['auto', 'on', 'off'] as const;
      store.settings.noteNames = order[(order.indexOf(store.settings.noteNames) + 1) % 3];
      store.save();
      extras();
      setStage(stage);
    };
  }
  $('#listen', root).onclick = () => heardTake && playBack(heardTake.samples, heardTake.rate);
  $('#firsttake', root).onclick = async () => {
    const first = await loadTake(inst, m.id, 'first');
    if (first) playBack(first, TAKE_RATE, 0, Infinity, L(`your first recording, from ${dayMonth(takeMeta(inst, m.id, 'first')!.t)}`, `deine erste Aufnahme, vom ${dayMonth(takeMeta(inst, m.id, 'first')!.t)}`));
  };
  $('#savetake', root).onclick = () => {
    const t = heardTake;
    if (!t) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([encodeWav(t.samples, t.rate)], { type: 'audio/wav' }));
    a.download = `${m.id}-${new Date(t.meta.t).toISOString().slice(0, 10)}.wav`;
    a.click();
    URL.revokeObjectURL(a.href);
    $('#takenote', root).textContent = L('Saved to your downloads folder, to keep or to send.', 'In deinem Download-Ordner gespeichert, zum Behalten oder Verschicken.');
  };
  RUNGS().forEach((_, i) => ($('#st' + i, root).onclick = () => pick(i)));
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  extras();
  setStage(stage);
  return () => {
    stopImagine();
    mode?.stop();
    stopModel();
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
}

/** A song on the guitar. The second part of the address picks the rung: 1, 2 or 3. */
export const songLesson: Screen = (root, [id, rung], ctx) => {
  const song = findSong(id);
  if (!ctx && store.current.guitar !== song.id) {
    store.current.guitar = song.id;
    store.save();
  }
  store.opened('guitar', song.id);
  return lesson(root, songMaterial(song), rung, ctx);
};

/** A piece on the piano. */
export const pianoLesson: Screen = (root, [id, rung], ctx) => {
  const piece = findPiece(id);
  if (!ctx && store.current.piano !== piece.id) {
    store.current.piano = piece.id;
    store.save();
  }
  store.opened('piano', piece.id);
  return lesson(root, pieceMaterial(piece), rung, ctx);
};

/** What to change when a string of a chord does not ring. */
export function stringTip(chordId: string, s: number, result: StringResult, heard: number | null): string {
  const c = CHORDS[chordId];
  const barre = barreStrings(c).includes(s);
  if (result === 'wrong') return L(`That was ${heard === null ? 'another string' : noteName(heard)}. Pluck the ${STRING_FULL[s]} string.`, `Das war ${heard === null ? 'eine andere Saite' : noteName(heard)}. Zupf die ${STRING_FULL[s]}-Saite.`);
  if (result === 'buzz') return L('Move the finger right up behind the fret and press a little harder.', 'Setz den Finger direkt hinter den Bund und drück etwas fester.');
  if (barre) return L(`Roll your index finger slightly onto its bony edge, right behind fret ${c.frets[s]}.`, `Kipp den Zeigefinger leicht auf seine harte Außenkante, direkt hinter dem ${c.frets[s]}. Bund.`);
  if (c.frets[s] === 0) return L('Something is touching this open string. Arch the fingers next to it.', 'Etwas berührt diese leere Saite. Stell die Finger daneben steiler auf.');
  return L('Press with the fingertip, right behind the fret, and keep the finger arched so it stays off the next string.', 'Drück mit der Fingerspitze, direkt hinter dem Bund, und halte den Finger gewölbt, damit er die Nachbarsaite nicht berührt.');
}

const FINGER_NAMES = (): string[] => ['', L('index finger', 'Zeigefinger'), L('middle finger', 'Mittelfinger'), L('ring finger', 'Ringfinger'), L('little finger', 'kleiner Finger')];

/** Where the fingers go, in words, one line per finger. */
export function holdLines(c: Chord): string[] {
  const list = (s: number[]): string => {
    const n = s.map((i) => STRING_FULL[i]);
    return n.length > 1 ? L(`${n.slice(0, -1).join(', ')} and ${n[n.length - 1]} strings`, `${n.slice(0, -1).join('-, ')}- und ${n[n.length - 1]}-Saite`) : L(`${n[0]} string`, `${n[0]}-Saite`);
  };
  const flat = barreStrings(c);
  const barre = flat.length > 0;
  const out: string[] = [];
  if (barre) out.push(L(`Index finger flat across fret ${c.frets[flat[0]]}, from the ${STRING_FULL[flat[0]]} string to the ${STRING_FULL[flat[flat.length - 1]]} string`, `Zeigefinger flach über den ${c.frets[flat[0]]}. Bund, von der ${stringName(flat[0], true)} bis zur ${stringName(flat[flat.length - 1], true)}`));
  for (let s = 0; s < 6; s++) {
    const f = c.fingers[s];
    if (f && !(barre && f === 1)) out.push(L(`${cap(FINGER_NAMES()[f])}: ${STRING_FULL[s]} string, fret ${c.frets[s]}`, `${cap(FINGER_NAMES()[f])}: ${STRING_FULL[s]}-Saite, ${c.frets[s]}. Bund`));
  }
  const unused = c.frets.map((f, i) => (f < 0 ? i : -1)).filter((i) => i >= 0);
  if (unused.length) out.push(L(`The ${list(unused)} ${unused.length > 1 ? 'are' : 'is'} not played`, `Die ${list(unused)} ${unused.length > 1 ? 'werden' : 'wird'} nicht gespielt`));
  // what makes a barre ring is not strength
  if (barre) out.push(L('Thumb behind the neck, opposite the index finger. Index finger close to the fret, rolled a little onto its bony edge', 'Daumen hinter dem Hals, gegenüber dem Zeigefinger. Zeigefinger nah am Bund, leicht auf seine harte Außenkante gekippt'));
  return out;
}

/** How often a string is tried in the guided session before it is left for next time. */
const TRIES = 3;

/**
 * Chord check: hold the chord, pluck one string at a time, see which ring clean. No clock. In the guided
 * session it takes today's chords one after the other and never gets stuck: a string that will not ring
 * is left for next time after three tries, and any string can be skipped or done again.
 */
export const chordCheck: Screen = (root, ids, ctx) => {
  /** the check at the end of a stage: several chords in a row, from memory, and the result is kept */
  const stageCheck = !ctx && ids[0] === 'check';
  const guided = !!ctx || stageCheck;
  let passed = 0;
  const queue = (guided ? ids : ids.slice(0, 1)).map((id) => CHORDS[id]).filter(Boolean);
  if (!queue.length) queue.push(CHORDS['Em']);
  /** practice rather than a check: after the result it waits for the player, who may go again as often as they like */
  const stay = !!ctx && ids.includes('stay');
  let q = 0;
  let chord = queue[0];
  let midis = chordMidis(chord);
  let strings = midis.map((m, i) => (m === null ? -1 : i)).filter((i) => i >= 0);
  let at = 0;
  let results: Mark[] = [];
  let tries: number[] = [];
  let left = new Set<number>();
  let startT = -1;
  let timer = 0;
  let tip = '';
  /** the tip is advice on a string that did not ring, not just news */
  let advice = false;
  /** a chord that already rings is first asked for from memory: its picture stays hidden until asked for or needed */
  let shown = true;

  root.innerHTML = frame(
    `<b>${L('Chord check', 'Akkord-Check')}</b> · <span id="cname"></span>`,
    `<div class="two">
       <div><svg class="fit" id="box" viewBox="0 0 400 440" role="img"></svg><p class="legend" style="text-align:center">${L('1 index · 2 middle · 3 ring · 4 little finger', '1 Zeigefinger · 2 Mittelfinger · 3 Ringfinger · 4 kleiner Finger')}</p></div>
       <div>
         <p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1>
         <p class="tip" id="tip"></p>
         <div class="tiles" id="tiles" role="list" aria-label="${L('Result for each string', 'Ergebnis für jede Saite')}"></div>
       </div>
     </div>`,
    `<div class="grp"><button class="btn" id="again">${L('Start over', 'Von vorn')} <kbd>R</kbd></button><button class="btn" id="back">${icon('left')}${L('Back a string', 'Eine Saite zurück')} <kbd>←</kbd></button><button class="btn" id="fwd"><span id="fwdl"></span> <kbd>→</kbd></button>${nextStep(ctx)}</div>${
      ctx
        ? `<p class="auto">${ids.includes('stay') ? L('Optional. A barre takes weeks, not minutes: a few tries a day do more than one long fight.', 'Freiwillig. Ein Barré braucht Wochen, nicht Minuten: Ein paar Versuche am Tag bringen mehr als ein langer Kampf.') : L('No clock. A string that will not ring after three tries is left for next time.', 'Keine Uhr. Eine Saite, die nach drei Versuchen nicht klingt, bleibt fürs nächste Mal.')}</p>`
        : `<nav class="chords" aria-label="${L('Chord', 'Akkord')}">${[...new Set(['Em', 'Am', 'E', 'A', 'D', 'C', 'G', 'Dm', 'F', chord.id])]
            .map((id) => CHORDS[id])
            .map((c) => `<a href="#/chord/${encodeURIComponent(c.id)}" aria-current="${c.id === chord.id}">${c.name}</a>`)
            .join('')}<a href="#/chords">${L('All chords…', 'Alle Griffe …')}</a></nav>`
    }`,
    ctx,
  );

  const cleanCount = (): number => strings.filter((i) => results[i] === 'clean').length;
  const nextName = (): string => (q + 1 < queue.length ? queue[q + 1].name : '');

  function draw(): void {
    const done = at >= strings.length;
    const s = strings[Math.min(at, strings.length - 1)];
    const last = results[s];
    const marks = midis.map((m, i) => (m === null ? null : !done && i === s ? 'now' : (results[i] ?? null))) as Mark[];
    let svg = shown
      ? chordBox(chord, 70, 76, 260, LEARN, false, marks, 62)
      : [0, 1, 2, 3, 4, 5].map((k) => `<line x1="${70 + k * 52}" x2="${70 + k * 52}" y1="76" y2="386" stroke="${LEARN.faint}" stroke-width="1.5"/><line x1="70" x2="330" y1="${76 + k * 62}" y2="${76 + k * 62}" stroke="${k ? LEARN.line : LEARN.text}" stroke-width="${k ? 1.5 : 4}"/>`).join('') + `<text x="200" y="250" class="cn" text-anchor="middle" style="font-size:64px" fill="${LEARN.faint}">?</text>`;
    STRING_NAMES.forEach((n, i) => {
      const x = 70 + (store.settings.leftHanded ? 5 - i : i) * 52;
      const m = marks[i];
      svg += `<text x="${x}" y="40" class="sn" fill="${m === 'now' ? LEARN.now : midis[i] === null ? LEARN.faint : LEARN.text}">${n}</text>`;
      const y = 418;
      const failed = m === 'now' && results[i] && results[i] !== 'clean';
      if (failed) svg += `<path d="M${x - 8} ${y - 8}l16 16M${x + 8} ${y - 8}l-16 16" stroke="${LEARN.bad}" stroke-width="3.4" stroke-linecap="round"/>`;
      else if (m === 'clean') svg += `<path d="M${x - 9} ${y}l6 6 12-13" fill="none" stroke="${LEARN.good}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      else if (m === 'muted' || m === 'buzz' || m === 'wrong') svg += `<path d="M${x - 8} ${y - 8}l16 16M${x + 8} ${y - 8}l-16 16" stroke="${LEARN.bad}" stroke-width="3.4" stroke-linecap="round"/>`;
      else if (midis[i] !== null) svg += `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="${m === 'now' ? LEARN.now : LEARN.faint}" stroke-width="2.5"/>`;
    });
    const box = $('#box', root);
    box.innerHTML = svg;
    box.setAttribute('aria-label', L(`Chord diagram of ${chord.name} with the result for each string`, `Akkorddiagramm von ${chord.name} mit dem Ergebnis für jede Saite`));
    const cname = root.querySelector('#cname');
    if (cname) cname.textContent = chord.name;
    const which = queue.length > 1 ? L(`Chord ${q + 1} of ${queue.length} · `, `Akkord ${q + 1} von ${queue.length} · `) : '';
    $('#eb', root).textContent = `${ctx ? ctx.label + ' · ' : ''}${which}${chord.name} · ${done ? L('checked', 'geprüft') : L(`string ${at + 1} of ${strings.length}`, `Saite ${at + 1} von ${strings.length}`)}`;
    $('#h1', root).innerHTML = done
      ? cleanCount() === strings.length
        ? L('Every string rings clean.', 'Jede Saite klingt sauber.')
        : L(`${cleanCount()} of ${strings.length} strings ring clean.`, `${cleanCount()} von ${strings.length} Saiten ${cleanCount() === 1 ? 'klingt' : 'klingen'} sauber.`)
      : last && last !== 'clean' && last !== 'now'
        ? L(`${STRING_NAMES[s]} ${last === 'muted' ? 'is muted' : last === 'buzz' ? 'buzzes' : 'was not it'}. Pluck the <em>${STRING_FULL[s]} string</em> again.`, `${last === 'muted' ? `${STRING_NAMES[s]} ist abgedämpft` : last === 'buzz' ? `${STRING_NAMES[s]} schnarrt` : `Das war nicht ${STRING_NAMES[s]}`}. Zupf die <em>${STRING_FULL[s]}-Saite</em> noch einmal.`)
        : L(`Hold ${chord.name}. Pluck the <em>${STRING_FULL[s]} string</em>.`, `Halte ${chord.name}. Zupf die <em>${STRING_FULL[s]}-Saite</em>.`);
    // before the first pluck: where the fingers go
    const fresh = !done && !tip && at === 0 && results.length === 0;
    $('#tip', root).innerHTML = fresh && !shown
      ? L(`<b>From memory</b>You have had ${chord.name} ringing before. Put it down without the picture, then pluck one string at a time, low to high. <kbd>S</kbd> shows the shape.`, `<b>Auswendig</b>${chord.name} hat bei dir schon geklungen. Greif ihn ohne Bild, dann zupf eine Saite nach der anderen, von tief nach hoch. <kbd>S</kbd> zeigt den Griff.`)
      : fresh
      ? L(`<b>How to hold ${chord.name}</b>${holdLines(chord).join('.<br>')}.<br>Then pluck one string at a time, low to high, and let each ring.`, `<b>So greifst du ${chord.name}</b>${holdLines(chord).join('.<br>')}.<br>Dann zupf eine Saite nach der anderen, von tief nach hoch, und lass jede klingen.`)
      : `<b>${done ? L('Result', 'Ergebnis') : tip ? (advice ? L('Try this', 'Versuch das') : L('Moving on', 'Weiter geht’s')) : L('How it works', 'So geht’s')}</b>${tip || L('Pluck one string at a time, low to high, and let it ring for a moment.', 'Zupf eine Saite nach der anderen, von tief nach hoch, und lass sie kurz klingen.')}`;
    /** a result as a tile says it */
    const said = (r: Mark): string => L(String(r), r === 'muted' ? 'abgedämpft' : r === 'buzz' ? 'schnarrt' : r === 'wrong' ? 'falsch' : r === 'clean' ? 'sauber' : String(r));
    $('#tiles', root).innerHTML = STRING_NAMES.map((n, i) => {
      const m = marks[i];
      const word = midis[i] === null ? L('not played', 'nicht gespielt') : m === 'now' ? (results[i] && results[i] !== 'clean' ? said(results[i]) : L('now', 'jetzt')) : m === 'clean' ? L('clean', 'sauber') : left.has(i) ? L('next time', 'nächstes Mal') : m ? said(m) : L('next', 'kommt noch');
      return `<div class="tile ${midis[i] === null ? 'skip' : m === 'now' ? 'now ' + (results[i] ?? '') : (m ?? '')}" role="listitem"><b>${n}</b><span>${word}</span></div>`;
    }).join('');
    $('#fwdl', root).textContent = !done ? L('Skip this string', 'Saite überspringen') : nextName() ? L(`Next chord: ${nextName()}`, `Nächster Akkord: ${nextName()}`) : stay ? L('Done for today', 'Fertig für heute') : ctx ? L('Next step', 'Nächster Schritt') : L('Once more', 'Noch einmal');
    $<HTMLButtonElement>('#back', root).disabled = at === 0;
    setSimTarget(done ? null : { kind: 'note', midi: midis[s]!, string: s });
    if (done) engine.listener?.cancelStringCheck();
    else engine.listener?.startStringCheck(midis[s]!);
  }

  /** Starts the check of a chord of the queue. */
  function start(n = q): void {
    stopTimer(timer);
    q = n;
    chord = queue[q];
    midis = chordMidis(chord);
    strings = midis.map((m, i) => (m === null ? -1 : i)).filter((i) => i >= 0);
    at = 0;
    results = [];
    tries = [];
    left = new Set();
    shown = !stageCheck && store.skills.level(`chord:${chord.id}`) < 2;
    // The clock starts when the chord is shown, not at the first pluck: what is measured is how long it
    // takes to find the shape and get every string to ring, which is what knowing a chord means.
    startT = engine.listener?.time ?? -1;
    tip = '';
    draw();
  }

  /** What comes after a chord: the next of today's chords, the next step of the session, or the same chord again. */
  function onward(): void {
    stopTimer(timer);
    if (q + 1 < queue.length) start(q + 1);
    else if (ctx) ctx.next();
    else if (stageCheck) location.hash = '/progress';
    else start(q);
  }

  /** Every string has been clean, tried or skipped. */
  function finishChord(time: number): void {
    const n = strings.length;
    const clean = cleanCount();
    const after = nextName() ? L(`Next: ${nextName()}.`, `Als Nächstes: ${nextName()}.`) : stay ? L('Once more with R, or finish with the right arrow.', 'Noch einmal mit R, oder mit dem Pfeil nach rechts abschließen.') : ctx ? L(`Next: ${ctx.after}.`, `Als Nächstes: ${ctx.after}.`) : L('It starts over in a moment.', 'Gleich geht es von vorn los.');
    if (clean === n && !left.size && startT >= 0) {
      passed++;
      const secs = time - startT;
      const change = store.skills.record(`chord:${chord.id}`, secs, Date.now());
      tip = L(`All ${n} strings clean, ${secs.toFixed(0)} seconds after the chord came up.${levelNews([change])} ${after}`, `Alle ${n} Saiten sauber, ${secs.toFixed(0)} Sekunden, nachdem der Akkord erschienen ist.${levelNews([change])} ${after}`);
    } else {
      store.skills.record(`chord:${chord.id}`, Infinity, Date.now(), Math.min(5, Math.round((clean / n) * 6)));
      const missing = strings.filter((i) => results[i] !== 'clean').map((i) => STRING_NAMES[i]);
      tip = L(`${missing.join(', ')} ${missing.length > 1 ? 'do' : 'does'} not ring yet. That is normal for a chord that is new to the hand; it comes back next time. ${after}`, `${missing.join(', ')} ${missing.length > 1 ? 'klingen' : 'klingt'} noch nicht. Das ist normal bei einem Akkord, der für die Hand neu ist; beim nächsten Mal kommt er wieder dran. ${after}`);
    }
    if (stageCheck && q === queue.length - 1) {
      // every chord of the stage, each string clean, in one go: the stage is confirmed
      if (passed === queue.length) store.progress['check:open'] = Date.now();
      tip =
        passed === queue.length
          ? L(`All ${queue.length} chords rang clean in a row. The stage is confirmed.`, `Alle ${queue.length} Akkorde haben in einem Zug sauber geklungen. Die Etappe ist bestätigt.`)
          : L(`${passed} of ${queue.length} chords rang clean in a row. The stage is confirmed when all of them do; the ones that did not are on the path.`, `${passed} von ${queue.length} Akkorden ${passed === 1 ? 'hat' : 'haben'} in einem Zug sauber geklungen. Die Etappe ist bestätigt, wenn alle es tun; die übrigen findest du auf dem Weg.`);
    }
    store.save();
    if (!stay) timer = later(guided ? 4000 : 6000, onward, q + 1 < queue.length ? L(`the next chord, ${queue[q + 1].name}`, `der nächste Akkord, ${queue[q + 1].name}`) : ctx ? ctx.after : stageCheck ? L('the path', 'der Weg') : L(`${chord.name} once more`, `noch einmal ${chord.name}`));
  }

  /** Leaves the string that is being checked. */
  function skip(time: number): void {
    left.add(strings[at]);
    at++;
    tip = '';
    if (at >= strings.length) finishChord(time);
  }

  const stopHear = hear(
    root,
    {
      onString: (e) => {
        if (at >= strings.length) return;
        const s = strings[at];
        if (startT < 0) startT = e.time;
        results[s] = e.result;
        if (e.result === 'clean') {
          learnRing(e.ring);
          left.delete(s);
          at++;
          tip = '';
          if (at >= strings.length) finishChord(e.time);
        } else {
          tries[s] = (tries[s] ?? 0) + 1;
          tip = stringTip(chord.id, s, e.result, e.heard);
          advice = true;
          // the picture comes back as soon as it is needed
          shown = true;
          store.skills.record(`chord:${chord.id}`, Infinity, Date.now(), Math.min(5, Math.round((cleanCount() / strings.length) * 6)));
          store.save();
          // in the session nothing may take for ever: after three tries the string is left for next time
          if (guided && tries[s] >= TRIES) {
            skip(e.time);
            if (at < strings.length) {
              tip = L(`The ${STRING_FULL[s]} string is left for next time. On with the ${STRING_FULL[strings[at]]} string.`, `Die ${STRING_FULL[s]}-Saite bleibt fürs nächste Mal. Weiter mit der ${stringName(strings[at], true)}.`);
              advice = false;
            }
          }
        }
        draw();
      },
    },
    (l) => (l.noteDetection = false),
  );
  const forward = (): void => {
    if (at >= strings.length) return onward();
    skip(engine.listener?.time ?? 0);
    draw();
  };
  const back = (): void => {
    if (at === 0) return;
    stopTimer(timer);
    at = Math.min(at, strings.length) - 1;
    const s = strings[at];
    results[s] = null;
    tries[s] = 0;
    left.delete(s);
    tip = '';
    draw();
  };
  const stopKeys = keys({
    r: () => start(q),
    ArrowLeft: back,
    ArrowRight: forward,
    s: () => {
      shown = true;
      draw();
    },
  });
  $('#again', root).onclick = () => start(q);
  $('#back', root).onclick = back;
  $('#fwd', root).onclick = forward;
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  start(0);
  return () => {
    stopTimer(timer);
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
};
