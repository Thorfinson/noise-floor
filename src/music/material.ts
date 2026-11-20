/**
 * What a lesson teaches, without drawing: a song on the guitar or a piece on the piano as lines of steps
 * with their clicks, and the rung to practise a line on from what has been measured. The lesson screen
 * plays it; the start page, the session plan and the song list describe it.
 */
import { L } from '../core/i18n';
import { TEMPOS } from '../core/playalong';
import { store } from '../core/store';
import { barKey, joinWords, noteTimes, phraseKey, shapeOf, songLines, stepMidis, type PianoNote, type PianoPiece, type Song, type TabNote } from './content';
import { keysId } from './theory';

/** One thing to play in a lesson: a note (or several at once), or a strum. */
export interface Step {
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

export interface Line {
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
  /** guitar: the words sung over a bar the first time its part is played, where the song has words */
  wordsOf?: (bar: number) => string | undefined;
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
  return { id: song.id, title: song.title, by: song.by, piano: false, noteDur: song.noteDur, beat: song.beat, count: per === 3 ? 3 : 4, lines, skill: (b) => barKey(song, b), chordOf: (b) => song.bars[b]?.chord, endOf, partOf, wordsOf: (b) => song.bars[b]?.words, unit: 'line' };
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

/**
 * The words of a line of the material as one line to read ("I come from Alabama with my banjo on my knee"), the
 * words of its bars joined; empty where the song has no words there. What the lesson can show under a line.
 */
export const lineWords = (m: Material, line: number): string => (m.wordsOf ? joinWords((m.lines[line]?.bars ?? []).map(m.wordsOf)) : '');

/** The unit of a lesson in German, one or more: Zeile, Zeilen; Phrase, Phrasen. */
export const unitDe = (m: Material, plural = false): string => (m.piano ? 'Phrase' : 'Zeile') + (plural ? 'n' : '');

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
