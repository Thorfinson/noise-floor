/**
 * Learn mode: calm, one task at a time. A song on the guitar or a piece on the piano goes up three
 * rungs: the app waits for you, then you play line by line with the click, then the whole thing at
 * full speed. What a lesson teaches is worked out in music/material.ts; the recording of a take is shown by
 * takepanel.ts; the chord check is in chordcheck.ts.
 */
import type { ChordEvent, NoteEvent, ThudEvent } from '../audio/listener';
import { engine } from '../audio/engine';
import { backing } from '../audio/backing';
import { renderBand, type BandHandle } from '../audio/band';
import { songSound } from '../audio/songsound';
import { mixInto, strum, tone } from '../audio/synth';
import { L } from '../core/i18n';
import { Take, TEMPOS, type TakeStep } from '../core/playalong';
import { saveTake, TAKE_MAX } from '../core/takes';
import { store, type Instrument } from '../core/store';
import { findPiece, findSong, partLabel, shapeOf, stepKeys, type Song } from '../music/content';
import { pieceMaterial, songMaterial, suggest, unitDe, type Material, type Step } from '../music/material';
import { enlist, REVIEW_DAYS, reviewed, reviewKey, reviewLines } from '../music/review';
import { changeTip, chordName, chordNotes, isBlackKey, keyName, keysAlike, keyTip, noteName, pianoChord, STRING_FULL, strumIs } from '../music/theory';
import { $, cap, esc, hear, icon, keys, later, pianoEars, stopTimer, type Screen, type SessionCtx } from '../ui/dom';
import { melodyWords, said as wordsOf, tuneOf } from '../music/accompany';
import { guitarA4, guitarSetup } from '../music/tuning';
import { SING_ALONG } from '../music/lyrics';
import { strumPatternOf } from '../music/strums';
import { lineTakeId } from '../core/takes';
import { chordBox, chordMarks, fretboard, keyboard, keyRange, LEARN, noteStrip, playhead, tabLine, type Drawn, type KeyMark, type StepLook } from '../ui/draw';
import { staffLine } from '../ui/staff';
import { setSimTarget, type SimTarget } from '../ui/practice';
import { frame, levelNews, nextStep } from './frame';
import { takeBox, takePanel } from './takepanel';

/** The three rungs as the dock names them: in full, and short for a narrow window. */
const RUNGS = (piano: boolean): { long: string; short: string }[] => [
  { long: L('Learn', 'Lernen'), short: L('Learn', 'Lernen') },
  { long: L('With the click', 'Mit Klick'), short: L('Click', 'Klick') },
  piano ? { long: L('Whole piece', 'Ganzes Stück'), short: L('Whole', 'Ganz') } : { long: L('Whole song', 'Ganzer Song'), short: L('Whole', 'Ganz') },
];

/** What plays along on the guitar, as the switch names it. */
const bandName = (): string => (store.settings.band === 'phones' ? L('Full band (headphones)', 'Volle Band (Kopfhörer)') : store.settings.band === 'speakers' ? L('Band for speakers', 'Band für Lautsprecher') : L('The click alone', 'Nur der Klick'));

/** A triangle to play, for the buttons that sound something. */
const PLAY = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.8l10 6.2-10 6.2z" fill="currentColor"/></svg>';

/** Where a line stands: learned without a clock; clean with the click at full speed, else the tempo the click starts at. */
export interface LineState {
  learned: boolean;
  clicked: boolean;
  tempo: number;
}

/** What the path strip of a lesson shows: every line's two rungs, the whole song, and whether it is kept. */
export interface PathState {
  lines: LineState[];
  /** played clean from start to end at full speed: it is in the repertoire */
  whole: boolean;
  /** when the repertoire wants it again; null when it is not in it */
  due: number | null;
}

/**
 * Where a song or piece stands on its way, from what has been measured: a line is learned when every bar of
 * it is at level 1 (clean without a clock, at half its speed or more, as music/material.ts suggests the
 * click from there), and done with the click at level 4 (clean at full speed). The tempo of the click is the
 * one the lesson would start the line at. The whole of it is done once it is in the repertoire.
 */
export function pathState(m: Material, skills: { level: (key: string) => number; get: (key: string) => { best: number } | undefined }, kept?: { due: number }): PathState {
  const lines = m.lines.map((l): LineState => {
    const keys = [...new Set(l.bars.map(m.skill))];
    const level = Math.min(...keys.map((k) => skills.level(k)));
    const best = Math.min(...keys.map((k) => skills.get(k)?.best ?? 0));
    return { learned: level >= 1, clicked: level >= 4, tempo: TEMPOS.find((t) => t >= 50 && t > best) ?? 100 };
  });
  return { lines, whole: !!kept, due: kept ? kept.due : null };
}

/** The sheet over the first song lesson is left out under the browser checks, as the handbook's pages are, unless they ask for it. */
const howSkipped = (): boolean => {
  const q = new URLSearchParams(location.search);
  return q.has('autostart') && !q.has('intros') && !q.has('how');
};

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

function lesson(root: HTMLElement, m: Material, wanted: string | undefined, ctx?: SessionCtx, song?: Song, at?: string): () => void {
  const n = m.lines.length;
  const inst: Instrument = m.piano ? 'piano' : 'guitar';
  /** a song of chords as it is sung over them: its tune (heard with H) and the words of each bar (under the tab) */
  const tune = song ? tuneOf(song) : null;
  // the line asked for in the address (counted from 1), otherwise where the song was left
  const asked = Number(at);
  let line = Number.isInteger(asked) && asked >= 1 && asked <= n ? asked - 1 : Math.min(n - 1, store.progress[m.id] ?? 0);
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
       <div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p><p class="fbk info" id="fbk"></p><div class="slacts" id="slacts" hidden></div></div>
     </div>
     <svg class="fit" id="rowA" viewBox="0 0 1180 ${m.piano ? 180 : 186}" role="img" aria-label="${L(`${m.piano ? 'The notes of this phrase, read left to right' : 'Tablature of this line, read left to right'}, with a marker on the one to play`, `${m.piano ? 'Die Noten dieser Phrase, von links nach rechts gelesen' : 'Tabulatur dieser Zeile, von links nach rechts gelesen'}, mit einer Markierung auf dem, was jetzt dran ist`)}"></svg>
     <svg class="fit" id="rowB" viewBox="0 0 1180 ${m.piano ? 180 : 186}" role="img" aria-label="${L('What comes next', 'Was danach kommt')}" hidden></svg>
     <svg class="fit" id="hands" viewBox="0 0 1180 ${m.piano ? 226 : 224}" role="img" aria-label="${m.piano ? L('Keyboard: the highlighted key is the one to play, with its finger number', 'Tastatur: die hervorgehobene Taste ist die, die du spielst, mit ihrer Fingernummer') : L('Fretboard: numbered dots show where your fingers go, the vibrating string is the one to pluck', 'Griffbrett: nummerierte Punkte zeigen, wo deine Finger hinkommen, die schwingende Saite ist die, die du zupfst')}"></svg>
     <div class="foot"><p class="legend">${fingers}</p></div>
     ${takeBox()}`,
    `<div class="grp do"><button class="btn" id="hearit" title="${m.piano ? L('Hear this phrase as it should sound', 'Diese Phrase anhören, wie sie klingen soll') : L(`Hear this line as it should sound${tune ? ', with its tune' : ''}`, `Diese Zeile anhören, wie sie klingen soll${tune ? ', mit der Melodie' : ''}`)}">${PLAY}<span class="sll">${m.piano ? L('Hear this phrase', 'Phrase anhören') : L('Hear this line', 'Zeile anhören')}</span><span class="sls">${L('Hear', 'Anhören')}</span> <kbd>H</kbd></button><button class="btn" id="again">${L('Again', 'Nochmal')} <kbd>R</kbd></button></div>
     <div class="grp move"><button class="btn quiet" id="prev" title="${m.piano ? L('The phrase before (←)', 'Die Phrase davor (←)') : L('The line before (←)', 'Die Zeile davor (←)')}">${icon('left')}<span class="t">${cap(m.piano ? L('phrase', 'Phrase') : L('line', 'Zeile'))}</span> <kbd>←</kbd></button><button class="btn quiet" id="next" title="${m.piano ? L('The next phrase (→)', 'Die nächste Phrase (→)') : L('The next line (→)', 'Die nächste Zeile (→)')}"><span class="t">${cap(m.piano ? L('phrase', 'Phrase') : L('line', 'Zeile'))}</span> <kbd>→</kbd>${icon('right')}</button>${nextStep(ctx)}</div>
     <div class="grp how" id="tempobox" hidden><span class="stepper"><button class="btn quiet" id="slower" title="${L('Slower by 5% (−)', 'Um 5 % langsamer (−)')}" aria-label="${L('Slower by 5%', 'Um 5 % langsamer')}">−</button><b id="tempo"></b><button class="btn quiet" id="faster" title="${L('Faster by 5%, up to 125% (+)', 'Um 5 % schneller, bis 125 % (+)')}" aria-label="${L('Faster by 5%', 'Um 5 % schneller')}">+</button></span><button class="btn" id="pause"><span>${L('Pause', 'Pause')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn quiet tog" id="loopbtn" aria-pressed="false" title="${L('The bars on show go round and round with the click, one bar counted in, until L again.', 'Die gezeigten Takte laufen mit dem Klick im Kreis, ein Takt eingezählt, bis wieder L.')}">${L('Loop', 'Schleife')} <kbd>L</kbd></button></div>
     <div class="ladder slrungs" role="group" aria-label="${L('Step', 'Stufe')}">${RUNGS(m.piano)
       .map((r, i) => `<button class="rung" id="st${i}" aria-pressed="false" title="${[L('Learn: no clock, the app waits for you', 'Lernen: ohne Uhr, die App wartet auf dich'), L(`With the click: ${m.unit} by ${m.unit}, in time`, `Mit Klick: ${unitDe(m)} für ${unitDe(m)}, im Takt`), m.piano ? L('The whole piece at full speed', 'Das ganze Stück im vollen Tempo') : L('The whole song at full speed', 'Der ganze Song im vollen Tempo')][i]} (${i + 1})"><b>${i + 1}</b><span class="sll">${r.long}</span><span class="sls">${r.short}</span></button>`)
       .join('')}</div>
     <details class="more" id="more"><summary class="btn quiet">${L('More', 'Mehr')}</summary><div class="morepanel">
       <div class="row"><button class="btn quiet" id="howbtn">${L('How this works', 'So funktioniert es')}</button></div>
       <p class="k">${L('Loop', 'Schleife')}</p><div class="row"><button class="btn quiet" id="widenl">${L('Take in the bar before', 'Takt davor dazu')} <kbd>[</kbd></button><button class="btn quiet" id="widenr">${L('Take in the bar after', 'Takt danach dazu')} <kbd>]</kbd></button></div>
       <p class="k">${L('Playing along', 'Mitspielen')}</p><div class="row"><button class="btn quiet tog" id="backbtn" aria-pressed="false">${m.piano ? L('Backing: bass and chords', 'Begleitung: Bass und Akkorde') : `<span id="bandname">${bandName()}</span>`} <kbd>A</kbd></button>${melody ? `<button class="btn quiet tog" id="wordsbtn" aria-pressed="${wordsOn.on}">${L('Words under the notes', 'Text unter den Noten')} <kbd>K</kbd></button>` : ''}${SING_ALONG[m.id] ? `<a class="btn quiet" href="#/singalong/${encodeURIComponent(m.id)}">${L('Sing and play: the words under the chords', 'Singen und spielen: der Text unter den Akkorden')}</a>` : ''}</div><p class="note">${m.piano ? L('Headphones only: through speakers the microphone would hear the backing as your playing.', 'Nur mit Kopfhörern: Über Lautsprecher würde das Mikrofon die Begleitung als dein Spiel hören.') : L('A switches: full band for headphones, the band for speakers, the click alone.', 'A schaltet um: volle Band für Kopfhörer, die Band für Lautsprecher, nur der Klick.')}</p>
       ${m.piano ? `<p class="k">${L('The music', 'Die Noten')}</p><div class="row"><button class="btn quiet tog" id="staffbtn" aria-pressed="false">${L('On the staff', 'Als Notenzeile')} <kbd>S</kbd></button><button class="btn quiet" id="namesbtn"></button></div><p class="note">${L('The staff as in printed music, with the left hand on its own staff below. The names under the notes are a help to leave away: by default they go once a phrase sits.', 'Die Notenzeile wie in gedruckten Noten, die linke Hand auf einem eigenen System darunter. Die Namen unter den Noten sind eine Hilfe zum Weglassen: Von selbst verschwinden sie, sobald eine Phrase sitzt.')}</p>` : ''}
       <p class="k">${L('Learning a line', 'Eine Zeile lernen')}</p><div class="row"><button class="btn quiet tog" id="earbtn" aria-pressed="false">${L('By ear: notes hidden', 'Nach Gehör: Töne verdeckt')} <kbd>E</kbd></button><button class="btn quiet tog" id="imagbtn" aria-pressed="false">${L('Rest the hands: listen and imagine', 'Hände ausruhen: zuhören und vorstellen')} <kbd>I</kbd></button></div><p class="note">${L('On rung 1 the line is played first and the notes stay hidden; T shows them.', 'Auf Stufe 1 wird die Zeile zuerst vorgespielt, und die Töne bleiben verdeckt; T zeigt sie.')}</p>
       <p class="k">${L('Full speed', 'Volles Tempo')}</p><div class="row"><button class="btn quiet tog" id="perfbtn" aria-pressed="false">${L('Performance: no marks, recorded', 'Vortrag: ohne Markierungen, aufgenommen')} <kbd>V</kbd></button></div><p class="note">${L('The whole thing from the top. You say how it went before the app does, then listen back bar by bar.', 'Das Ganze von vorn. Du sagst, wie es lief, bevor die App es tut; dann hörst du es Takt für Takt an.')}</p>
     </div></details>`,
    ctx,
    // the way out leads to the page of this song, where it can be heard and its way through it is laid out
    [`#/songs/${encodeURIComponent(m.id)}`, `<span class="sltitle">${esc(m.title)}</span>`],
    `<nav class="slband" aria-label="${m.piano ? L('Your way through the piece', 'Dein Weg durch das Stück') : L('Your way through the song', 'Dein Weg durch den Song')}">
       <div class="slpath" id="slpath"></div>
       <span class="slar" aria-hidden="true">→</span><button class="slstep" id="slwhole" type="button"></button><span class="slar" aria-hidden="true">→</span><span class="slstep" id="slkeep"></span>
       <p class="slsay" id="slsay" aria-live="polite"></p>
     </nav>`,
  );
  const rowA = $<SVGSVGElement>('#rowA', root);
  const rowB = $<SVGSVGElement>('#rowB', root);
  const hands = $<SVGSVGElement>('#hands', root);
  const say = (cls: string, html: string): void => {
    const el = $('#fbk', root);
    el.className = 'fbk ' + cls;
    el.innerHTML = html;
    el.hidden = false;
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
      : tabLine(
          {
            bars: hidden ? l.tab.map((b) => ({ ...b, chord: b.chord ? '?' : undefined })) : l.tab,
            look,
            name: (id) => (hidden ? '?' : shapeOf(id).name),
            words: said,
            // every strum with its direction and its count; under the bars the words sung over them
            beat: m.beat,
            // the song's own words of each bar where it has them (its whole form is written out), else the sung tune's syllables
            barWords: hidden ? undefined : song && l.bars.some((b) => song.bars[b]?.words) ? l.bars.map((b) => song.bars[b]?.words ?? '') : tune?.words ? l.bars.map((b) => wordsOf(tune.words![b] ?? [])) : undefined,
          },
          LEARN,
          true,
        );
    el.innerHTML = d.svg;
    el.setAttribute('viewBox', `0 0 1180 ${d.height}`);
    return d;
  }

  /** The chord a step is played over: the one it strums or strikes, otherwise the one its bar holds or its keys belong to. */
  const chordAt = (s: Step | null | undefined): string | undefined => (s ? (s.chord ?? s.over ?? m.chordOf(s.bar)) : undefined);
  // what the app heard stands beside the chord picture, where the eyes are, in the room the picture leaves
  // under the instruction; a lesson without one says it under the music
  if (m.piano || !m.lines.some((l) => l.steps.some((s) => !!chordAt(s)))) $('.foot', root).prepend($('#fbk', root));

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
    // a strum shows nothing on the fretboard the chord picture beside the instruction does not: on a low window it goes first
    hands.classList.toggle('same', !pluck);
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
        h1: change ? L(`Change to <em>${name}</em> and strum.`, `Wechsle zu <em>${name}</em> und schlag an.`) : L(`Strum <em>${name}</em>, ${cur.tab?.up ? 'on the way back up' : 'down'}.`, `Schlag <em>${name}</em> an, ${cur.tab?.up ? 'auf dem Weg zurück nach oben' : 'nach unten'}.`),
        sub: how || (cur.tab?.up ? `${L('An upstroke: the hand comes back up and brushes only the thin strings.', 'Ein Aufschlag: Die Hand kommt zurück nach oben und streift nur die dünnen Saiten.')} ${upcoming}`.trim() : upcoming || L('One stroke down across the strings of the chord.', 'Ein Abschlag über die Saiten des Akkords.')),
      };
    const t = cur.tab!;
    if (id) return { h1: L(`${change ? `Change to ${name}.` : `Hold ${name}.`} Pluck the <em>${STRING_FULL[t.s]} string</em>.`, `${change ? `Wechsle zu ${name}.` : `Halte ${name}.`} Zupf die <em>${STRING_FULL[t.s]}-Saite</em>.`), sub: how || (prev ? upcoming : '') || L('Fingers go where the diagram shows, and stay down while you pluck.', 'Die Finger kommen dahin, wo das Diagramm sie zeigt, und bleiben liegen, während du zupfst.') };
    if (t.more) return { h1: L('Pluck the <em>marked strings</em> together.', 'Zupf die <em>markierten Saiten</em> zusammen.'), sub: '' };
    return { h1: L(`Pluck the <em>${STRING_FULL[t.s]} string</em>, ${t.f ? 'fret ' + t.f : 'open'}.`, `Zupf die <em>${STRING_FULL[t.s]}-Saite</em>, ${t.f ? t.f + '. Bund' : 'leer'}.`), sub: L(`It sounds like ${noteName(cur.midis[0])}.${t.fg ? ` Finger ${t.fg}.` : ''}`, `Der Ton ist ${noteName(cur.midis[0])}.${t.fg ? ` Finger ${t.fg}.` : ''}`) };
  }

  /** The top bar: the line on show (the title is the way out, on the left), its part, who the song is by, the capo. */
  const where = (li: number): void => {
    const part = m.partOf(m.lines[li].bars[0]);
    $('#where', root).innerHTML = `<b>${L(`${cap(m.unit)} ${li + 1} of ${n}`, `${unitDe(m)} ${li + 1} von ${n}`)}</b>${part && part !== 'All' ? ` · ${esc(partLabel(part))}` : ''}${m.by ? ` · ${esc(m.by === 'Traditional' ? L('Traditional', 'Traditionell') : m.by)}` : ''}${!m.piano && guitarSetup() ? ` · ${guitarSetup()}` : ''}`;
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
    setStage(stage, playing());
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
    const slow = stage === 0 && !loop;
    const unit = slow ? m.noteDur / 0.75 : (m.noteDur * 100) / tempo;
    // a song of chords whose tune the app has: the line as the song goes, its tune sung over the strums
    const sung = !loop && !m.piano && !!tune?.melody.length;
    const seconds = engine.demo(sung ? songSound(m, { sr, speed: m.noteDur / unit, instrument: true, tune: tune!.melody, lines: [line, line], a4: guitarA4() }).samples : modelSound(parts, unit, sr));
    modelUntil = performance.now() + seconds * 1000 + 400;
    const what = sung ? L(`the ${m.unit} with its tune`, `die ${unitDe(m)} mit ihrer Melodie`) : loop ? barsSaid(loop) : L(`the ${m.unit}`, `die ${unitDe(m)}`);
    say('info', slow ? L(`Listen: this is how ${what} goes, a little slower than full speed.`, `Hör zu: So klingt ${what}, ein wenig langsamer als im vollen Tempo.`) : L(`Listen: ${what} at ${tempo}%. Then Space to play.`, `Hör zu: ${what} bei ${tempo}%. Dann Leertaste zum Spielen.`));
    clearTimeout(modelTimer);
    modelTimer = window.setTimeout(() => say('info', stage === 0 ? L('Now you. Take your time.', 'Jetzt du. Lass dir Zeit.') : L('Now you.', 'Jetzt du.')), seconds * 1000 + 400);
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
    $('.legend', root).hidden = false;
    rowA.style.opacity = '1';
    $('#tempobox', root).hidden = true;
    $('#hearit', root).hidden = false;

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
      // that the app waits is said once, in the band above
      $('#eb', root).textContent = L(
        `${ctx ? `${ctx.label} · ${m.title} · ` : ''}${cap(m.unit)} ${line + 1} of ${n}${m.piano ? '' : ` · bar${bars.length > 1 ? `s ${bars[0] + 1}–${bars[bars.length - 1] + 1}` : ` ${bars[0] + 1}`}`}${count}`,
        `${ctx ? `${ctx.label} · ${m.title} · ` : ''}${unitDe(m)} ${line + 1} von ${n}${m.piano ? '' : ` · ${bars.length > 1 ? `Takte ${bars[0] + 1}–${bars[bars.length - 1] + 1}` : `Takt ${bars[0] + 1}`}`}${count}`,
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
      // clean, and not too halting: the line sits. Outside a session nothing moves on by itself then: the
      // player is offered the click, or the next line, and picks
      const sits = !ctx && !slips && pathNow().lines[line].learned;
      const then = sits
        ? ''
        : leave
          ? L(`That is the ${m.piano ? 'piece' : 'song'} for today.`, `Das war ${m.piano ? 'das Stück' : 'der Song'} für heute.`)
          : last && !ctx
            ? L(`That was the last ${m.unit}. Press 2 to play with the click.`, `Das war die letzte ${unitDe(m)}. Drück 2, um mit Klick zu spielen.`)
            : L(`Next ${m.unit} in a moment.`, `Gleich kommt die nächste ${unitDe(m)}.`);
      moveOn = () => (leave ? ctx!.next() : go(line + 1, true));
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
      showPath();
      if (sits) return sitsView(0, L(`${avg}% of full speed`, `${avg}% des vollen Tempos`));
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

    // until the first note: how to read what is on the screen, in one sentence (that the app waits is said in
    // the band above, what comes after a clean line when it comes)
    say(
      'info',
      m.piano
        ? chordsOnly
          ? L('Read left to right: each block is one chord, all its keys at once.', 'Lies von links nach rechts: Jeder Block ist ein Akkord, alle Tasten zugleich.')
          : L('Read left to right. Take your time.', 'Lies von links nach rechts. Lass dir Zeit.')
        : m.lines[line].steps.every((s) => s.chord)
          ? L('Read left to right: one strum on each slash, the way its arrow points.', 'Lies von links nach rechts: ein Anschlag auf jeden Schrägstrich, in die Richtung seines Pfeils.')
          : L('Tab: a line is a string, lowest at the bottom. A number is a fret, 0 is open.', 'Tabulatur: Eine Linie ist eine Saite, die tiefste unten. Eine Zahl ist ein Bund, 0 heißt leer.'),
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

  /**
   * Rungs 2 and 3: play with the click. One line at a time, or the whole piece from this line on. Nothing runs
   * until the player gives the sign: the first strum (or note, or key) of the take, or Space; then the click
   * counts in. A lesson that is being played already counts in straight away (straight).
   */
  function clickMode(straight = false): Mode {
    const whole = stage === 2 && !review && !loop;
    if (stage === 2) tempo = 100;
    /** the band of this take, faded out when it ends or is left */
    let band: BandHandle | null = null;
    // the lines a loop runs through: every line one of its bars is in
    const looped = loop ? m.lines.map((_, i) => i).filter((i) => m.lines[i].bars.some((b) => b >= loop!.from && b <= loop!.to)) : null;
    const idxs = review ? review.lines : looped ?? (whole ? m.lines.map((_, i) => i).slice(line) : [line]);
    /** one line with the click is recorded too: its first and its latest take are what "then and now" plays */
    const lineTake = stage === 1 && !review && !loop && idxs.length === 1;
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
    // two lines on show leave no room for the fretboard, nor for the legend of the fingers; the chord picture stays
    $('.legend', root).hidden = idxs.length > 1;
    hands.toggleAttribute('hidden', whole || idxs.length > 1 || (!!review && !review.relearn));
    $('#tempobox', root).hidden = false;
    $<HTMLButtonElement>('#slower', root).disabled = whole || !!review;
    $<HTMLButtonElement>('#faster', root).disabled = whole || !!review;
    // the model can be heard between takes on every rung; during a take, asking for it pauses the take
    $('#hearit', root).hidden = false;

    /** the bar a take is limited to, after one that fell apart there; null for a whole line */
    let spot: number | null = null;
    let spotting = false;
    /** the bars a take is limited to: the one that fell apart, or the loop; null for the lines as they are */
    let range: { from: number; to: number } | null = null;
    let uShift = 0;
    const inRange = (s: Step): boolean => !range || (s.bar >= range.from && s.bar <= range.to);
    /** waiting for the player's sign to start */
    let armed = false;
    /** the step that is played as the sign: the first of the take */
    const first = idxs.flatMap((li) => m.lines[li].steps).find((s) => !loop || (s.bar >= loop.from && s.bar <= loop.to));

    function cancel(): void {
      cancelAnimationFrame(raf);
      stopTimer(timer);
      engine.clearTicks();
      take = null;
      rows.forEach((r) => playhead(r, null));
      delete root.dataset.step;
    }

    /** What the take is, over the cue: the lines, the loop, a performance, a visit; and the tempo. */
    function eyebrow(k: number): string {
      return `${ctx ? `${ctx.label} · ${m.title} · ` : ''}${loop ? L(`Loop · ${barsSaid(loop)} · ${tempo}%${loopClean ? ` · ${loopClean} clean in a row` : ''}`, `Schleife · ${barsSaid(loop)} · ${tempo}%${loopClean ? ` · ${loopClean} sauber in Folge` : ''}`) : perform ? L('Performance · no marks while you play · full speed', 'Vortrag · keine Markierungen beim Spielen · volles Tempo') : review ? L(`Played again from cold · ${cap(m.unit)}s ${idxs.map((x) => x + 1).join(' and ')} · ${tempo}%`, `Wiederholen aus dem Stand · ${unitDe(m, true)} ${idxs.map((x) => x + 1).join(' und ')} · ${tempo}%`) : whole ? L('Full speed, to the end', 'Volles Tempo, bis zum Ende') : L(`${cap(m.unit)} ${idxs[k] + 1} of ${n} · with the click at ${tempo}%`, `${unitDe(m)} ${idxs[k] + 1} von ${n} · mit Klick bei ${tempo}%`)}`;
    }

    /**
     * Nothing runs: the lines are on show with their first step marked, and the app listens for it. Played (or
     * Space), it starts the count-in.
     */
    function arm(): void {
      cancel();
      armed = true;
      root.dataset.armed = '';
      const s = first;
      rows.forEach((row, r) => {
        if (r === 1 && rowB.hasAttribute('hidden')) return;
        const li = idxs[r];
        if (li === undefined) return void (row.innerHTML = '');
        drawLine(row, li, (i) => {
          const st = m.lines[li].steps[i];
          return loop && (st.bar < loop.from || st.bar > loop.to) ? 'off' : st === s ? 'cur' : 'up';
        });
        row.style.opacity = r === 0 ? '1' : '0.5';
      });
      where(idxs[0]);
      $('#eb', root).textContent = eyebrow(0);
      if (s) {
        const name = s.chord ? nameOf(s.chord) : m.piano ? keyName(s.midis[0], s.over) : noteName(s.midis[0]);
        $('#h1', root).innerHTML = s.chord && !m.piano ? L(`Strum <em>${name}</em> to start.`, `Schlag <em>${name}</em> an, um zu starten.`) : L(`Play <em>${name}</em> to start.`, `Spiel <em>${name}</em>, um zu starten.`);
      }
      $('#sub', root).textContent = L(`Then ${m.count} clicks count you in, and you play along. Space starts it too.`, `Dann zählen ${m.count} Klicks dich ein, und du spielst mit. Die Leertaste startet auch.`);
      drawChord(s);
      if (s && !hands.hasAttribute('hidden')) drawHands(s, null, idxs[0]);
      expect(s ? s.midis : []);
      setSimTarget(s ? target(s) : null);
      $('#tempo', root).textContent = `${tempo}%`;
      $('#pause span', root).textContent = L('Start', 'Start');
      say('info', perform || review ? '' : L(`Not sure how it goes? H plays it first, at ${tempo}%.`, `Nicht sicher, wie es geht? H spielt es zuerst vor, bei ${tempo}%.`));
    }

    /** A take: the count-in, then the lines with the click. Given the sign, or straight on from the take before. */
    function begin(): void {
      cancel();
      armed = false;
      delete root.dataset.armed;
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
      // the band: on the guitar under every take in time, unless the player wants the click alone; through
      // speakers it is the band arranged around what the microphone listens for (audio/band.ts)
      if (store.settings.band !== 'click' && engine.ctx && !m.piano) {
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
        const strums = flat.filter((s, i) => !!s && gu[i] >= uShift - 1e-6 && gu[i] < uEnd - 1e-6).map((s) => gu[flat.indexOf(s)] - uShift);
        const parts = renderBand({ chords, clicks: clicks.filter((c) => c.u >= uShift - 1e-6 && c.u < uEnd - 1e-6).map((c) => ({ u: c.u - uShift, accent: c.accent })), units: uEnd - uShift, unit, sr: engine.ctx.sampleRate, a4: guitarA4(), mode: store.settings.band === 'phones' ? 'phones' : 'speakers', strums, feel: song ? (strumPatternOf(song) ?? undefined) : undefined });
        band = engine.playBand(t0, parts, { drums: 1, bass: 1, keys: 0.8, lead: whole ? 0.6 : 0 }, { volume: store.settings.bandVolume });
      } else if (store.settings.backing && engine.ctx && m.piano) {
        // the piano keeps its soft bass and chords under headphones, as before
        const chords: { u: number; id: string }[] = [];
        let was: string | undefined;
        flat.forEach((s, i) => {
          const id = chordAt(s);
          if (id && id !== was && gu[i] >= uShift - 1e-6 && gu[i] < uEnd - 1e-6) chords.push({ u: gu[i] - uShift, id });
          if (id) was = id;
        });
        engine.playAt(t0, backing({ chords, clicks: clicks.filter((c) => c.u >= uShift - 1e-6 && c.u < uEnd - 1e-6).map((c) => ({ u: c.u - uShift, accent: c.accent })), units: uEnd - uShift, unit, sr: engine.ctx.sampleRate, a4: store.settings.pianoA4 }), 0.9);
      }
      // the whole piece, or a loop, is recorded, to be listened to afterwards
      recFrom = (whole || lineTake) && engine.micOn && store.settings.recordTakes ? engine.now() : -1;
      if (recFrom >= 0) engine.record(TAKE_MAX);
      if (whole) panel.hide();
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
      $('#eb', root).textContent = eyebrow(k);
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
        panel.show(kept ? { samples: kept.samples, rate: kept.sampleRate, meta } : { samples: new Float32Array(0), rate: 48000, meta }, !!perform);
        if (kept) void saveTake(inst, m.id, kept.samples, kept.sampleRate, meta);
      } else if (lineTake && rec && rec.samples.length > rec.sampleRate) {
        const zero = recFrom;
        const meta = { t: Date.now(), secs: rec.samples.length / rec.sampleRate, tempo: played, bars: m.lines[idxs[0]].bars.map((bar) => ({ bar, from: 0, to: endT - zero, clean: r.cleanBars.includes(bar) })) };
        void saveTake(inst, lineTakeId(m.id, idxs[0]), rec.samples, rec.sampleRate, meta);
      }
      band?.stop(1.2);
      band = null;
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
      /** the line went clean at full speed: outside a session the player picks what comes next */
      let sits = false;
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
        sits = !ctx && played >= 100;
        if (!sits && wrapped && tempo < 100) tempo = TEMPOS.find((x) => x > tempo) ?? 100;
        leave = !!ctx && linesDone >= 2;
        then = sits ? '' : leave ? L('That is it for today.', 'Das war’s für heute.') : wrapped ? L(`Through to the end. From the top at ${tempo}%.`, `Durch bis zum Ende. Von vorn bei ${tempo}%.`) : L(`Next ${m.unit}.`, `Nächste ${unitDe(m)}.`);
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
        showPath();
        if (leave) timer = later(3200, ctx!.next, ctx!.after);
        else if (visit) $('#pause span', root).textContent = L('Play', 'Spielen');
        else if (sits) {
          $('#pause span', root).textContent = L('Play', 'Spielen');
          sitsView(1, L(`${r.hits} of ${r.total} on the click`, `${r.hits} von ${r.total} auf dem Klick`));
        }
        // the take of one bar belongs to this visit of the line: it starts here, not from scratch
        else if (!whole) timer = later(2600, () => (clean ? go(line + 1, true) : spot !== null ? begin() : go(line, true)), clean ? L(`the next ${m.unit}`, `die nächste ${unitDe(m)}`) : spot !== null ? L(`bar ${spot + 1} alone`, `Takt ${spot + 1} allein`) : L(`the same ${m.unit} again`, `noch einmal dieselbe ${unitDe(m)}`));
        else $('#pause span', root).textContent = L('Play', 'Spielen');
      };
      if (wasPerform) {
        $('#h1', root).innerHTML = L('How did it go?', 'Wie lief es?');
        say('info', L('Before the app says how it heard it: how many slips did you hear yourself? (0 to 3)', 'Bevor die App sagt, wie sie es gehört hat: Wie viele Patzer hast du selbst gehört? (0 bis 3)'));
        panel.selfRate(r.bars.length - r.cleanBars.length, () => {
          verdict();
          onward();
        });
      } else {
        verdict();
        onward();
      }
    }

    if (straight) begin();
    else arm();
    return {
      stop: () => {
        cancel();
        armed = false;
        delete root.dataset.armed;
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
        // waiting for the sign: the first note of the take starts it
        if (armed) {
          if (first && !first.chord && first.midis.includes(e.midi)) begin();
          return;
        }
        if (!take || take.nearest(e.time)?.chord) return;
        if (take.note(e.midi, e.time) === null && e.time > t0 - beat / 2 && e.time < endT && !perform) say('bad', L(`Heard ${noteName(e.midi)} where it does not belong.`, `Gehört: ${noteName(e.midi)}, an einer Stelle, an der nichts zu spielen ist.`));
      },
      thud: () => undefined,
      chord: (e) => {
        // waiting for the sign: the first chord of the take starts it
        if (armed) {
          if (first?.chord && strumHit(e, first.chord)) begin();
          return;
        }
        if (!take) return;
        const want = take.wanted(e.time)?.chord;
        if (want && strumHit(e, want)) take.chord(want, e.time);
        else if (e.best && e.score > 0.7 && e.margin > 0.1) take.chord(e.best, e.time);
      },
    };
  }

  /**
   * Puts the lesson on a rung and starts it there: the first rung waits for the first note at once; with the
   * click nothing runs before the player's sign, unless straight (the lesson is being played already, or the
   * player asked for it: R, Space).
   */
  function setStage(s: number, straight = false): void {
    mode?.stop();
    // a question about the slips of a take that is no longer on show is not answered any more: its answer
    // would be kept for the wrong take and move the session on in the middle of the next one
    panel.drop();
    stage = s;
    $('#slacts', root).hidden = true;
    $('#fbk', root).hidden = false;
    RUNGS(m.piano).forEach((_, i) => $('#st' + i, root).setAttribute('aria-pressed', String(i === s)));
    mode = s === 0 ? waitMode() : clickMode(straight);
    showPath();
  }

  /** Is a take being played right now? A change of a switch then goes on playing; otherwise it starts nothing. */
  const playing = (): boolean => !!mode?.running();

  /** Where the song stands, from what has been measured until now. */
  const pathNow = (): PathState => pathState(m, store.skills, store.reviews[reviewKey(inst, m.id)]);

  /**
   * The band under the top bar: every line with its two rungs, the whole song, keeping it; the line and the
   * rung on show marked, and one sentence on what that rung is.
   */
  function showPath(sat?: number): void {
    const p = pathNow();
    const unit = m.piano ? L('Phrase', 'Phrase') : L('Line', 'Zeile');
    // many lines are numbers only, so that the row stays short
    const terse = n > 6;
    const on = !review && !perform;
    $('#slpath', root).innerHTML =
      (terse ? `<span class="slname">${m.piano ? L('Phrases', 'Phrasen') : L('Lines', 'Zeilen')}</span>` : '') +
      p.lines
        .map((l, i) => {
          const cur = i === line && on && stage < 2;
          const r1 = l.learned ? '<i class="ok">✓</i>' : `<i${cur && stage === 0 ? ' class="on"' : ''}>1</i>`;
          const r2 = l.clicked ? '<i class="ok">✓</i>' : `<i class="${cur && stage === 1 ? 'on' : ''}${l.learned ? ' pct' : ''}">${l.learned ? `${l.tempo}%` : '2'}</i>`;
          const said = `${unit} ${i + 1}: ${l.learned ? L('learned without a clock', 'ohne Uhr gelernt') : L('not learned yet', 'noch nicht gelernt')}; ${l.clicked ? L('clean with the click at full speed', 'mit Klick sauber im vollen Tempo') : l.learned ? L(`with the click from ${l.tempo}%`, `mit Klick ab ${l.tempo}%`) : L('then with the click', 'danach mit Klick')}`;
          return `<button type="button" class="slln${i === line && on ? ' cur' : ''}" data-line="${i}" title="${said}" aria-label="${said}"${i === line ? ' aria-current="step"' : ''}>${terse ? `<b>${i + 1}</b>` : `${unit} ${i + 1}`} ${r1}${r2}</button>`;
        })
        .join('');
    const whole = $('#slwhole', root);
    whole.className = `slstep${stage === 2 && on ? ' cur' : ''}${p.whole ? ' ok' : ''}`;
    whole.innerHTML = `${m.piano ? L('Whole piece', 'Ganzes Stück') : L('Whole song', 'Ganzer Song')} <i class="${p.whole ? 'ok' : stage === 2 && on ? 'on' : ''}">${p.whole ? '✓' : '3'}</i>`;
    const days = p.due === null ? 0 : Math.max(0, Math.ceil((p.due - Date.now()) / 86400000));
    const keep = $('#slkeep', root);
    keep.className = `slstep${review ? ' cur' : ''}${p.due !== null ? ' kept' : ''}`;
    keep.textContent = p.due === null ? L('Keep it', 'Behalten') : days ? L(`Keep it · back in ${days} ${days === 1 ? 'day' : 'days'}`, `Behalten · wieder in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`) : L('Keep it · due today', 'Behalten · heute fällig');
    // the one sentence on the rung on show
    const step = (k: number, name: string, what: string): string => `${L(`Step ${k} of 3`, `Stufe ${k} von 3`)} · <b>${name}</b>${what}`;
    const names = RUNGS(m.piano).map((r) => r.long);
    $('#slsay', root).innerHTML = review
      ? `<b>${L('Keep it', 'Behalten')}:</b> ${L(`from cold, two ${m.unit}s at full speed`, `aus dem Stand, zwei ${unitDe(m, true)} im vollen Tempo`)}`
      : loop
        ? `<b>${L('Loop', 'Schleife')}:</b> ${L('goes round until L ends it; [ and ] take in a bar more', 'läuft, bis L sie beendet; [ und ] nehmen einen Takt dazu')}`
        : perform
          ? `<b>${L('Performance', 'Vortrag')}:</b> ${L('no marks while you play, recorded; you say first how it went', 'keine Markierungen beim Spielen, aufgenommen; du sagst zuerst, wie es lief')}`
          : sat !== undefined
            ? step(sat + 1, names[sat], L(` done for ${m.unit} ${line + 1}`, ` geschafft für ${unitDe(m)} ${line + 1}`))
            : step(
                stage + 1,
                names[stage],
                [
                  L(': no clock, the app waits for you', ': ohne Uhr, die App wartet auf dich'),
                  L(`: in time, from ${tempo}%`, `: im Takt, ab ${tempo}%`),
                  L(': start to end at full speed, recorded', ': von Anfang bis Ende im vollen Tempo, aufgenommen'),
                ][stage],
              );
    // the line on show stays in sight in a row that scrolls; a row with more beyond its end fades out there
    const row = $('#slpath', root);
    const cur = row.querySelector<HTMLElement>('.slln.cur');
    if (cur && (cur.offsetLeft < row.scrollLeft || cur.offsetLeft + cur.offsetWidth > row.scrollLeft + row.clientWidth - 36)) row.scrollLeft = Math.max(0, cur.offsetLeft - 60);
    fade();
  }
  /** The row of lines fades out at its end while there are more beyond it. */
  const fade = (): void => {
    const row = $('#slpath', root);
    row.classList.toggle('over', row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
  };
  $('#slpath', root).onscroll = fade;

  /**
   * A line sits (on the first rung: clean without a clock; with the click: clean at full speed). Nothing moves
   * on by itself: what comes next is offered, the step up first.
   */
  function sitsView(rung: number, how: string): void {
    const p = pathNow();
    const next = (line + 1) % n;
    const t = suggest(m, line).tempo;
    const btn = (id: string, cls: string, label: string, key: string): string => `<button class="btn${cls}" id="${id}" type="button">${label} <kbd>${key}</kbd></button>`;
    const unitN = (i: number): string => (m.piano ? L(`phrase ${i + 1}`, `Phrase ${i + 1}`) : L(`line ${i + 1}`, `Zeile ${i + 1}`));
    const whole = m.piano ? L('the whole piece', 'das ganze Stück') : L('the whole song', 'den ganzen Song');
    $('#h1', root).innerHTML = `<span class="slok">${cap(unitN(line))} ${rung === 0 ? L('sits.', 'sitzt.') : L('sits at full speed.', 'sitzt im vollen Tempo.')}</span>`;
    let acts: string;
    if (rung === 0) {
      $('#eb', root).textContent = `${cap(unitN(line))} · ${L('clean, without a clock', 'sauber, ohne Uhr')} · ${how}`;
      $('#sub', root).textContent = L(`Next: the same ${m.unit} with the click, ${t < 100 ? `slowly (${t}%)` : 'at full speed'}.${n > 1 ? ` Or learn ${unitN(next)} first and add the click later.` : ''}`, `Als Nächstes: dieselbe ${unitDe(m)} mit Klick, ${t < 100 ? `langsam (${t}%)` : 'im vollen Tempo'}.${n > 1 ? ` Oder lern erst ${unitN(next)} und nimm den Klick später dazu.` : ''}`);
      acts = btn('situp', ' primary big', L('With the click', 'Mit Klick'), '2') + (n > 1 ? btn('sitnext', ' big', L(`Learn ${unitN(next)} first`, `Erst ${unitN(next)} lernen`), '→') : '');
    } else {
      // every line clean at full speed: the whole song is the step up; otherwise the next line with the click
      const all = p.lines.every((l) => l.clicked);
      $('#eb', root).textContent = `${cap(unitN(line))} · ${L('clean with the click at full speed', 'sauber mit Klick im vollen Tempo')} · ${how}`;
      $('#sub', root).textContent = all ? L(`Every ${m.unit} goes at full speed now. Next: ${whole}, from start to end.`, `Jede ${unitDe(m)} geht jetzt im vollen Tempo. Als Nächstes: ${whole}, von Anfang bis Ende.`) : L(`Next: ${unitN(next)} with the click. Or ${whole} already, from start to end.`, `Als Nächstes: ${unitN(next)} mit Klick. Oder schon ${whole}, von Anfang bis Ende.`);
      const toWhole = (cls: string): string => btn('sitwhole', cls, cap(whole), '3');
      const toNext = (cls: string): string => (n > 1 ? btn('sitnext', cls, L(`${cap(unitN(next))} with the click`, `${cap(unitN(next))} mit Klick`), '→') : '');
      acts = all ? toWhole(' primary big') + toNext(' big') : toNext(' primary big') + toWhole(' big');
    }
    acts += btn('sitagain', ' quiet', L('Once more', 'Noch einmal'), 'R');
    const box = $('#slacts', root);
    box.innerHTML = acts;
    box.hidden = false;
    // what was measured is in the line over the cue now: the buttons take its place
    $('#fbk', root).hidden = true;
    const on = (id: string, fn: () => void): void => {
      const b = root.querySelector<HTMLButtonElement>('#' + id);
      if (b) b.onclick = fn;
    };
    on('situp', () => pick(1));
    on('sitnext', () => go(line + 1));
    on('sitwhole', () => pick(2));
    on('sitagain', () => go(line, true));
    showPath(rung);
  }

  /** Ends a model that is playing: the player has moved on. */
  function stopModel(): void {
    engine.stopDemo();
    clearTimeout(modelTimer);
    modelUntil = 0;
  }

  /**
   * Go to a line and start it on the current rung. The lesson goes on by itself (straight) after a take, and
   * when the player asks for the line again; a line the player picks waits for the sign. With the click a
   * line picked starts at the tempo it is at (as the band shows it).
   */
  function go(li: number, straight = false): void {
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
    if (!straight && stage === 1) {
      tempo = suggest(m, line).tempo;
      fails = 0;
    }
    setStage(stage, straight);
  }

  /** The player picks a rung: that is practice, whatever the lesson was opened for. With the click it starts at the line's tempo. */
  function pick(s: number): void {
    stopImagine();
    stopModel();
    if (s === 1 && (stage !== 1 || review || loop)) tempo = suggest(m, line).tempo;
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
    setStage(stage === 2 ? 1 : stage, playing());
  }

  /** The buttons say what is switched on. */
  function extras(): void {
    $('#loopbtn', root).setAttribute('aria-pressed', String(!!loop));
    $<HTMLButtonElement>('#widenl', root).disabled = !loop || loop.from === 0;
    $<HTMLButtonElement>('#widenr', root).disabled = !loop || loop.to === lastBar;
    $('#backbtn', root).setAttribute('aria-pressed', String(m.piano ? store.settings.backing : store.settings.band !== 'click'));
    const bn = root.querySelector('#bandname');
    if (bn) bn.textContent = bandName();
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
    setStage(stage, playing());
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
    const was = playing();
    if (loop) {
      loop = null;
      setStage(1, was);
    } else {
      const bars = m.lines[line].bars;
      loop = { from: bars[0], to: bars[bars.length - 1] };
      setStage(1, was);
    }
    extras();
  }

  /** [ and ]: the loop takes in the bar before it, or the bar after it. */
  function widen(side: number): void {
    if (!loop) return toggleLoop();
    if (side < 0) loop.from = Math.max(0, loop.from - 1);
    else loop.to = Math.min(lastBar, loop.to + 1);
    loopClean = 0;
    setStage(1, playing());
    extras();
  }

  /** B: the accompaniment, on or off. It is kept for next time. */
  function toggleBacking(): void {
    if (!m.piano) {
      // the guitar: full band, the band for speakers, the click alone, and round again
      store.settings.band = store.settings.band === 'phones' ? 'speakers' : store.settings.band === 'speakers' ? 'click' : 'phones';
      store.save();
      extras();
      say('info', L(`${bandName()}, from the next take.`, `${bandName()}, ab dem nächsten Durchgang.`));
      return;
    }
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

  const panel = takePanel(root, {
    inst,
    id: m.id,
    barsSaid,
    say,
    pause: () => {
      if (mode?.running()) mode.toggle();
    },
    playing: (seconds) => (modelUntil = performance.now() + seconds * 1000 + 300),
  });

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
    r: () => go(line, true),
    h: hearIt,
    '1': () => panel.rate(1) || pick(0),
    '2': () => panel.rate(2) || pick(1),
    '3': () => panel.rate(3) || pick(2),
    '0': () => panel.rate(0),
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
    p: panel.listen,
    '-': () => setTempo(-1),
    '+': () => setTempo(1),
    '=': () => setTempo(1),
    ' ': () => mode?.toggle(),
  });
  $('#prev', root).onclick = () => go(line - 1);
  $('#next', root).onclick = () => go(line + 1);
  $('#again', root).onclick = () => go(line, true);
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
      setStage(stage, playing());
    };
  }
  RUNGS(m.piano).forEach((_, i) => ($('#st' + i, root).onclick = () => pick(i)));
  if (ctx) $('#nextstep', root).onclick = ctx.next;
  // a line in the band goes to that line; the whole song to the third rung
  $('#slpath', root).onclick = (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-line]');
    if (b) go(Number(b.dataset.line));
  };
  $('#slwhole', root).onclick = () => pick(2);

  /**
   * How a song is learned here, over the lesson: the three rungs, what each does and until when, and how one
   * moves up. Shown over the first song lesson of an instrument, and from More whenever asked for. Nothing
   * runs or listens underneath; closed, the lesson starts the line on show.
   */
  let closeHow: (() => void) | null = null;
  function showHow(first: boolean): void {
    mode?.stop();
    mode = null;
    stopModel();
    setSimTarget(null);
    expect([]);
    ($('#more', root) as HTMLDetailsElement).open = false;
    const P = LEARN;
    const slash = (x: number, ink: string): string => `<line x1="${x - 6}" y1="54" x2="${x + 6}" y2="26" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
    const rule = `<line x1="10" y1="40" x2="210" y2="40" stroke="${P.line}" stroke-width="2"/>`;
    const pics = [
      `${rule}${[40, 90, 140, 190].map((x, i) => slash(x, i === 0 ? P.now : P.text)).join('')}<text x="90" y="16" class="lbl" style="text-anchor:middle" fill="${P.faint}">${L('waits…', 'wartet …')}</text>`,
      `${rule}${[40, 90, 140, 190].map((x) => slash(x, P.text) + `<circle cx="${x}" cy="12" r="4" fill="${P.faint}"/>`).join('')}<line x1="110" y1="22" x2="110" y2="60" stroke="${P.now}" stroke-width="3"/>`,
      `${[0, 1, 2, 3].map((i) => `<rect x="${10 + i * 52}" y="22" width="44" height="26" rx="6" fill="${i < 2 ? '#d6eadf' : P.panel}"/><text x="${32 + i * 52}" y="40" class="lbl" style="text-anchor:middle;font-weight:700;font-size:12px" fill="${i < 2 ? P.good : P.faint}">${m.piano ? L(`Phr. ${i + 1}`, `Phr. ${i + 1}`) : L(`Line ${i + 1}`, `Zeile ${i + 1}`)}</text>`).join('')}<circle cx="200" cy="12" r="5" fill="#b9792a"/><text x="186" y="16" class="lbl" style="text-anchor:end;font-size:12px" fill="#b9792a">rec</text>`,
    ];
    const one = m.piano ? L('key', 'Taste') : L('strum or note', 'Anschlag und jeden Ton');
    const cards = [
      [L('Learn', 'Lernen'), L(`No clock. The app waits until it hears each ${one}, so you can look at your fingers and find ${m.piano ? 'the key' : 'the chord'}.`, `Ohne Uhr. Die App wartet, bis sie jede${m.piano ? ' Taste' : 'n Anschlag und jeden Ton'} hört; so kannst du auf deine Finger schauen und ${m.piano ? 'die Taste' : 'den Griff'} finden.`), L(`Until the ${m.unit} goes clean, without long stops`, `Bis die ${unitDe(m)} sauber geht, ohne lange Pausen`)],
      [L('With the click', 'Mit Klick'), L(`The same ${m.unit} in time with a click. It starts slow and gets faster when it goes well.`, `Dieselbe ${unitDe(m)} im Takt mit einem Klick. Sie beginnt langsam und wird schneller, wenn es gut geht.`), L('Until it is clean at full speed', 'Bis sie im vollen Tempo sauber ist')],
      [m.piano ? L('The whole piece', 'Das ganze Stück') : L('The whole song', 'Der ganze Song'), L('Start to end at full speed, recorded so you can listen back.', 'Von Anfang bis Ende im vollen Tempo, aufgenommen, damit du es dir anhören kannst.'), L('Then it joins your repertoire', 'Dann kommt es in dein Repertoire')],
    ];
    const box = document.createElement('div');
    box.className = 'slhowwrap';
    box.innerHTML = `<div class="slscrim"></div>
      <section class="slhow" role="dialog" aria-modal="true" aria-labelledby="slhowh">
        <div><p class="k">${first ? (m.piano ? L('Your first piece', 'Dein erstes Stück') : L('Your first song lesson', 'Deine erste Song-Lektion')) : L('How this works', 'So funktioniert es')}</p><h2 id="slhowh">${m.piano ? L('How you learn a piece here', 'Wie du hier ein Stück lernst') : L('How you learn a song here', 'Wie du hier einen Song lernst')}</h2></div>
        <div class="slcards">${cards.map(([h, p, until], i) => `<div><span class="n">${i + 1}</span><h3>${h}</h3><svg class="slpic" viewBox="0 0 220 64" aria-hidden="true">${pics[i]}</svg><p>${p}</p><small>${until}</small></div>`).join('')}</div>
        <p class="slmore">${L(`You decide when to move up a step; when a ${m.unit} sits, the app says so and offers the next one. <b>H</b> plays the ${m.unit} you are on${tune ? ', with the tune' : ''}. The band at the top always shows where you are.`, `Du entscheidest, wann du eine Stufe höher gehst; sitzt eine ${unitDe(m)}, sagt die App es dir und bietet die nächste an. <b>H</b> spielt die ${unitDe(m)}, an der du bist${tune ? ', mit der Melodie' : ''}. Das Band oben zeigt immer, wo du stehst.`)}</p>
        <div class="slgo"><button class="btn primary big" id="howgo" type="button">${first ? L(`Got it: start ${m.unit} ${line + 1}`, `Verstanden: ${unitDe(m)} ${line + 1} beginnen`) : L(`Back to ${m.unit} ${line + 1}`, `Zurück zu ${unitDe(m)} ${line + 1}`)} <kbd>${L('Space', 'Leertaste')}</kbd></button>${first ? `<label class="sloff"><input type="checkbox" id="howoff" checked> ${L("Don't show this again", 'Nicht mehr zeigen')}</label>` : ''}</div>
      </section>`;
    root.append(box);
    const close = (): void => {
      if (!closeHow) return;
      closeHow = null;
      removeEventListener('keydown', onKey, true);
      // left ticked, the sheet is not shown again over a lesson of this instrument (it stays under More)
      if (first && box.querySelector<HTMLInputElement>('#howoff')?.checked) {
        store.settings.lessonHowOff = { ...store.settings.lessonHowOff, [inst]: true };
        store.save();
      }
      box.remove();
      setStage(stage);
    };
    // while the sheet is open its keys are the only ones: Space or Enter closes it, Escape too; the lesson's wait
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement).closest?.('input')) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key !== 'Tab') e.stopPropagation();
    };
    addEventListener('keydown', onKey, true);
    box.querySelector<HTMLButtonElement>('#howgo')!.onclick = close;
    closeHow = () => {
      removeEventListener('keydown', onKey, true);
      box.remove();
    };
    box.querySelector<HTMLButtonElement>('#howgo')!.focus();
  }
  $('#howbtn', root).onclick = () => showHow(false);

  extras();
  // the first song lesson of an instrument opens with how it works; nothing starts before it is read
  if (!store.settings.lessonHowOff[inst] && !review && !howSkipped()) {
    const s0 = m.lines[line].steps[0];
    RUNGS(m.piano).forEach((_, i) => $('#st' + i, root).setAttribute('aria-pressed', String(i === stage)));
    where(line);
    if (s0) $('#h1', root).innerHTML = instruction(s0, null).h1;
    drawLine(rowA, line, () => 'up');
    drawChord(s0);
    drawHands(s0 ?? null, null, line);
    showPath();
    showHow(true);
  } else setStage(stage);
  return () => {
    closeHow?.();
    stopImagine();
    mode?.stop();
    stopModel();
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
}

/**
 * A song on the guitar. The second part of the address picks the rung: 1, 2 or 3 (review for a visit from cold,
 * anything else the rung the app suggests); a third the line to open at, counted from 1 (#/song/<id>/1/3).
 */
export const songLesson: Screen = (root, [id, rung, at], ctx) => {
  const song = findSong(id);
  // an address to a song that is not there (an own song deleted since) shows the first one, but does not
  // make it the song the session works on
  if (song.id === id) {
    if (!ctx && store.current.guitar !== song.id) {
      store.current.guitar = song.id;
      store.save();
    }
    store.opened('guitar', song.id);
  }
  return lesson(root, songMaterial(song), rung, ctx, song, at);
};

/** A piece on the piano: the address as for a song (#/piano/<id>/<rung>/<phrase>). */
export const pianoLesson: Screen = (root, [id, rung, at], ctx) => {
  const piece = findPiece(id);
  if (piece.id === id) {
    if (!ctx && store.current.piano !== piece.id) {
      store.current.piano = piece.id;
      store.save();
    }
    store.opened('piano', piece.id);
  }
  return lesson(root, pieceMaterial(piece), rung, ctx, undefined, at);
};
