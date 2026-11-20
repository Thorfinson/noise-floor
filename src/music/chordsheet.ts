/**
 * Reading a chord sheet: a song as its chords over its words, the way song sites print it and people copy it from
 * there, or as ChordPro writes it, with the chords in brackets among the words. What comes out is a song of the
 * player's own: its parts once each (what is learned line by line), its form (the order the sheet sings them in),
 * and the words of every bar for every time round.
 */
import { L } from '../core/i18n';
import type { Bar, Song } from './content';
import { tabBody } from './import';
import { STRUMS, strumBar } from './songwriting';
import { CHORDS } from './theory';

/** A chord as a sheet writes it: a root (German sheets call B natural H), what kind of chord, a bass after a slash. */
const SYMBOL = /^\(?([A-H])([#b♯♭]?)([^\s/()]*(?:\([^\s/()]*\))?)(?:\/([A-H][#b♯♭]?))?\)?$/;
/** What may follow the root: minor, major seventh, the numbers of sevenths and the notes above, sus, add, dim, aug. */
const KIND = /^(?:min|mi|maj|ma|dim|aug|sus|add|no|m|M|Δ|°|ø|\+|-|[0-9]|[#b♯♭]|[()])*$/;
/** Marks in a line of chords that are not chords: bar lines, slashes for strums, repeats, "no chord". */
const FILLER = /^(?:\|+:?|:?\|+|\/+|-+|%|\.+|\*+|\(?x\s?\d+\)?|\(?\d+x\)?|N\.?C\.?|[()])$/i;
/** "x2", "(x2)", "2x": play this so many times. */
const TIMES = /\(?(?:x\s?(\d+)|(\d+)\s?x)\)?/i;
const timesOf = (m: RegExpExecArray | null): number => (m ? Math.max(1, Math.min(8, Number(m[1] ?? m[2]))) : 1);

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
/** The spellings the app's chord library may use for a root: Ab and G#m, Bb and A#. */
const SPELL: string[][] = [['C'], ['C#', 'Db'], ['D'], ['Eb', 'D#'], ['E'], ['F'], ['F#', 'Gb'], ['G'], ['Ab', 'G#'], ['A'], ['Bb', 'A#'], ['B']];

/** Is this the symbol of a chord, as a sheet writes one? */
export const isChordSymbol = (t: string): boolean => {
  const m = SYMBOL.exec(t.replace('6/9', '69'));
  return !!m && KIND.test(m[3]);
};

/**
 * The chord of the app's library a sheet's chord is played as. A slash chord is played without its bass; a chord the
 * library has no shape for, as the nearest one it has (Bm7 as Bm, C9 as C7, Cmaj9 as Cmaj7, Csus as C): both count
 * as simplified. G# played as Ab is the same chord spelled otherwise, not a simplification. German sheets (those that
 * write H) read B as B flat. The id is null where not even the plain chord on that root is there (E flat, B flat minor).
 */
export function chordId(symbol: string, transpose = 0, germanB = false): { id: string | null; simplified: boolean } {
  const m = SYMBOL.exec(symbol.trim().replace('6/9', '69'));
  if (!m || !KIND.test(m[3])) return { id: null, simplified: false };
  let pc = germanB && m[1] === 'B' ? 10 : PC[m[1]];
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  else if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  pc = (((pc + transpose) % 12) + 12) % 12;
  let k = m[3].replace(/[()]/g, '').replace(/♯/g, '#').replace(/♭/g, 'b');
  let majSeven = false;
  let minor = false;
  if (/^(maj|ma|M|Δ)/.test(k)) {
    majSeven = true;
    k = k.replace(/^(maj|ma|M|Δ)/, '');
  } else if (/^(min|mi|m|-)/.test(k)) {
    minor = true;
    k = k.replace(/^(min|mi|m|-)/, '');
  }
  const halfDim = k.includes('ø') || (minor && /7(b|-)5/.test(k));
  const dim = /dim|°/.test(k);
  const power = k === '5';
  const sus2 = /sus2/.test(k);
  const sus4 = /sus(?!2)/.test(k);
  const add9 = /add(9|2)/.test(k);
  const sixNine = /69/.test(k);
  const rest = k.replace(/sus[24]?|add(9|2|11)|69|dim|aug|ø|°|\+/g, '').replace(/7(b|-)5/, '7');
  const seventh = /7|9|11|13/.test(rest) || (majSeven && rest === '');
  const roots = SPELL[pc];
  const on = (...qs: string[]): string[] => qs.flatMap((q) => roots.map((r) => r + q));
  const want = halfDim || dim ? on('m7b5', 'm') : power ? on('5', '') : minor ? (seventh ? on('m7', 'm') : on('m')) : sus2 ? on('sus2', '') : sus4 ? (seventh ? on('7sus4', 'sus4', '7', '') : on('sus4', '')) : add9 ? on('add9', '') : sixNine ? on('69', '') : majSeven ? on('maj7', '') : seventh ? on('7', '') : on('');
  const id = want.find((x) => CHORDS[x]) ?? null;
  if (!id) return { id: null, simplified: false };
  const written = halfDim ? 'm7b5' : dim ? 'dim' : power ? '5' : (minor ? 'm' : '') + (sus2 ? 'sus2' : sus4 ? (seventh ? '7sus4' : 'sus4') : add9 ? 'add9' : sixNine ? '69' : majSeven ? 'maj7' : rest);
  return { id, simplified: id.replace(/^[A-G][#b]?/, '') !== written || !!m[4] };
}

export interface SheetOptions {
  id?: string;
  title?: string;
  by?: string;
  /** clicks a minute at full speed */
  bpm?: number;
  pattern?: keyof typeof STRUMS;
  /** bars each chord is held for (a line with a single chord holds it twice as long) */
  perChord?: number;
  /** semitones to move every chord by */
  transpose?: number;
}

export interface SheetImport {
  /** the song, or null when the sheet had no chords to play */
  song: Song | null;
  /** the bars of each part (indexes into song.bars) as the lines of the sheet hold them, for showing it line by line */
  lines: Record<string, number[][]>;
  /** chords played as a simpler one the app has: Cmaj9 as Cmaj7, G/B as G */
  simplified: { from: string; to: string }[];
  /** chords the app has no shape for: their bars keep the chord before */
  unknown: string[];
  /** the fret of the capo the sheet asks for, 0 without */
  capo: number;
  /** the tempo a ChordPro sheet names */
  bpm?: number;
  /** the title and artist a ChordPro sheet names */
  title?: string;
  by?: string;
  /** lines left out: tab, notes about the song, anything that is neither chords nor words */
  skipped: number;
  problems: string[];
  /** a transposition (in semitones, all told) that makes every chord one the app has, where some are not; null where none is needed or none helps */
  suggest: number | null;
}

interface Placed {
  col: number;
  sym: string;
}
interface Pair {
  /** chords over the words, where they stand */
  chords: Placed[];
  /** with bar lines in the chord line: each bar's chords and where the bar begins */
  cells?: { col: number; syms: string[] }[];
  words: string;
  times: number;
}
interface Section {
  name: string;
  times: number;
  pairs: Pair[];
  /** a section of tab or a list of chords: nothing of it is played */
  skip?: boolean;
}

/** A section's name as a song book names its parts: [Verse 2] is a Verse, [Refrain] and [Hook] are a Chorus; null for tab and the like. */
function partKind(name: string): string | null {
  const n = name.toLowerCase().replace(/\(?x\s?\d+\)?|\(?\d+x\)?|[\d:.]+/g, '').trim();
  if (/^(verse|vers|strophe|stanza|couplet)$/.test(n)) return 'Verse';
  if (/^(chorus|refrain|kehrreim|hook)$/.test(n)) return 'Chorus';
  if (/^(pre[- ]?chorus|vorrefrain|pre[- ]?refrain|build)$/.test(n)) return 'Pre-Chorus';
  if (/^(bridge|middle ?eight|mittelteil)$/.test(n)) return 'Bridge';
  if (/^(intro|einleitung|vorspiel)$/.test(n)) return 'Intro';
  if (/^(outro|ending|coda|schluss|nachspiel|end)$/.test(n)) return 'Outro';
  if (/^(interlude|instrumental|solo|zwischenspiel|break|post[- ]?chorus)$/.test(n)) return 'Interlude';
  if (/^(tab|tabs|riff|chords|akkorde|chords used|strumming|tuning)$/.test(n)) return null;
  return n ? n[0].toUpperCase() + n.slice(1) : 'Verse';
}
/** A header written as a line of its own without brackets: "Chorus:", "Verse 2", "Refrain (x2)". */
const HEADER = /^\s*(verse|vers|strophe|stanza|chorus|refrain|kehrreim|hook|pre[- ]?chorus|vorrefrain|bridge|intro|outro|ending|coda|interlude|instrumental|solo|zwischenspiel)\s*\d*\s*(\(?x\s?\d+\)?|\(?\d+x\)?)?\s*:?\s*$/i;
/** Notes about the song that song sites print around it. */
const META = /^\s*(tuning|stimmung|key|tonart|tempo|bpm|difficulty|schwierigkeit|author|artist|interpret|album|strumming|schlagmuster|transpose|chords used|written by|words and music|music by|lyrics by|composer|komponist|rating|tabbed by|submitted by|ver\.|version)\b.*[:=]/i;
const JUNK = /(https?:\/\/|www\.|©|copyright|all rights reserved|ultimate-guitar|songsterr|chordify|autoscroll)/i;

/** The chords of a line that holds nothing but chords (and bar lines, slashes, repeats), each with its column; else null. */
function chordLine(line: string): { chords: Placed[]; cells?: { col: number; syms: string[] }[]; times: number } | null {
  const toks = [...line.matchAll(/\S+/g)].map((m) => ({ col: m.index, t: m[0] }));
  if (!toks.length) return null;
  let times = 1;
  const chords: Placed[] = [];
  for (const { col, t } of toks) {
    if (isChordSymbol(t)) chords.push({ col, sym: t.replace(/^\(|\)$/g, '') });
    else if (FILLER.test(t)) {
      if (/x|\d/i.test(t) && TIMES.test(t)) times = timesOf(TIMES.exec(t));
    } else return null;
  }
  if (!chords.length) return null;
  // bar lines in the chord line: each bar between them is a bar of the song, whatever chords it holds
  if (!line.includes('|')) return { chords, times };
  const cells: { col: number; syms: string[] }[] = [];
  let open: { col: number; syms: string[] } | null = null;
  for (const { col, t } of toks) {
    if (/^:?\|+:?$/.test(t)) {
      if (open?.syms.length) cells.push(open);
      open = { col: col + t.length, syms: [] };
    } else if (isChordSymbol(t) || t === '%') (open ??= { col, syms: [] }).syms.push(t === '%' ? '%' : t.replace(/^\(|\)$/g, ''));
  }
  if (open?.syms.length) cells.push(open);
  return { chords, cells, times };
}

/** A line with chords in brackets among its words, as ChordPro writes them: "[G]Amazing [C]grace". */
function inlineLine(line: string): Pair | null {
  if (!/\[[^\]\s]+\]/.test(line)) return null;
  const chords: Placed[] = [];
  let words = '';
  for (const part of line.split(/(\[[^\]]*\])/)) {
    const m = /^\[([^\]\s]+)\]$/.exec(part);
    if (m && isChordSymbol(m[1])) chords.push({ col: words.length, sym: m[1] });
    else words += part;
  }
  return chords.length ? { chords, words: words.replace(/\s+$/, ''), times: 1 } : null;
}

/** The words of a line cut where the chords stand; a word the cut goes through ends in "-" on the left. */
function cutAt(words: string, cols: number[]): string[] {
  const pieces = cols.map((c, k) => words.slice(k === 0 ? 0 : c, k + 1 < cols.length ? cols[k + 1] : undefined));
  return pieces.map((p, k) => {
    const broken = /\p{L}$/u.test(p) && /^\p{L}/u.test(pieces[k + 1] ?? '');
    return p.trim().replace(/\s+/g, ' ') + (broken ? '-' : '');
  });
}

/** Words shared out over some bars in the given proportions (equal when left out), word by word, never splitting one. */
function spread(text: string, n: number, shares?: number[]): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (n <= 1) return [words.join(' ')];
  const out: string[][] = Array.from({ length: n }, () => []);
  const w = shares && shares.length === n && shares.some((x) => x > 0) ? shares : Array.from({ length: n }, () => 1);
  const total = w.reduce((a, b) => a + b, 0);
  const edges: number[] = [];
  w.reduce((sum, x) => (edges.push((sum + x) / total), sum + x), 0);
  const length = words.reduce((s, x) => s + x.length + 1, 0);
  let at = 0;
  let cell = 0;
  for (const x of words) {
    const mid = (at + x.length / 2) / length;
    while (cell < n - 1 && mid > edges[cell]) cell++;
    out[cell].push(x);
    at += x.length + 1;
  }
  return out.map((c) => c.join(' '));
}

/** Tabs to spaces, so that the columns of chords and words stay where they were typed. */
const untab = (line: string): string => line.replace(/[^\t]*\t/g, (m) => m.slice(0, -1) + ' '.repeat(8 - ((m.length - 1) % 8)));

/**
 * Reads a chord sheet. Section headers ([Verse 1], [Chorus], "Bridge:", {start_of_chorus}) name the parts. A part
 * that comes again with the same chords is that part sung again, with its own words; a header with no lines under it
 * repeats the last time that kind of part was sung; a section of words alone goes to the chords of the first part of
 * its kind, line by line. Without headers, a stanza that comes back word for word is the chorus and the others are
 * verses. A chord gets perChord bars, a line with a single chord twice as many; bar lines in a line of chords
 * ("| G | C D |") give one bar each. The words of each bar are those between its chord and the next. Lines of tab,
 * notes about the song and the like are left out; "Capo 2" is reported.
 */
export function parseChordSheet(text: string, o: SheetOptions = {}): SheetImport {
  const per = Math.max(1, Math.min(8, Math.round(o.perChord ?? 1)));
  const pattern = o.pattern ?? 'folk';
  const transpose = o.transpose ?? 0;
  const problems: string[] = [];
  const lines = text.replace(/\r/g, '').split('\n').map(untab);
  const bracketHeader = (l: string): boolean => /^\s*\[[^\]]+\]\s*$/.test(l) && !isChordSymbol(l.trim().slice(1, -1));
  const headers = lines.some((l) => bracketHeader(l) || HEADER.test(l) || /^\s*\{\s*(soc|sov|sob|start_of_)/i.test(l));
  const kindOf = (l: string): string => {
    const t = l.trim();
    if (!t) return 'blank';
    if (/^\{[^}]*\}$/.test(t)) return 'directive';
    if (bracketHeader(l) || HEADER.test(l)) return 'header';
    if (/^(capo|kapo|capodaster)\b/i.test(t)) return 'capo';
    if (tabBody(l) !== null) return 'tab';
    if (chordLine(l)) return 'chords';
    if (META.test(l) || JUNK.test(l)) return 'meta';
    if (inlineLine(l)) return 'inline';
    return 'words';
  };
  let capo = 0;
  let bpm: number | undefined;
  let title = '';
  let by = '';
  let skipped = 0;
  let inTab = false;
  const sections: Section[] = [];
  let cur: Section | null = null;
  const open = (name: string, times = 1, skip = false): void => {
    cur = { name, times, pairs: [], ...(skip ? { skip } : {}) };
    sections.push(cur);
  };
  const add = (p: Pair): void => {
    if (!cur) open('');
    cur!.pairs.push(p);
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const kind = kindOf(l);
    if (kind === 'blank') {
      // without headers, a blank line ends a stanza
      if (!headers) cur = null;
      continue;
    }
    if (kind === 'directive') {
      const m = /^\s*\{\s*([\w-]+)\s*(?::\s*(.*?))?\s*\}\s*$/.exec(l);
      const d = (m?.[1] ?? '').toLowerCase();
      const v = m?.[2] ?? '';
      if (d === 'title' || d === 't') title = v;
      else if (d === 'artist' || d === 'subtitle' || d === 'st') by ||= v;
      else if (d === 'capo') capo = Number(v) || 0;
      else if (d === 'tempo') bpm = Number(v) || undefined;
      else if (d === 'soc' || d === 'start_of_chorus') open(v || 'Chorus');
      else if (d === 'sov' || d === 'start_of_verse') open(v || 'Verse');
      else if (d === 'sob' || d === 'start_of_bridge') open(v || 'Bridge');
      else if (d === 'sot' || d === 'start_of_tab') inTab = true;
      else if (d === 'eot' || d === 'end_of_tab') inTab = false;
      else if (/^(eoc|eov|eob|end_of_\w+)$/.test(d)) cur = null;
      else if (/^(c|comment|ci|cb|comment_italic)$/.test(d) && HEADER.test(v)) open(v.replace(/:$/, ''));
      continue;
    }
    if (inTab || kind === 'tab' || kind === 'meta') {
      skipped++;
      continue;
    }
    if (kind === 'header') {
      const name = l.trim().replace(/^\[|\]$/g, '').replace(/:$/, '').trim();
      const k = partKind(name);
      open(name.replace(/\s*\(?(?:x\s?\d+|\d+\s?x)\)?\s*/i, '').trim() || (k ?? ''), timesOf(TIMES.exec(name)), k === null);
      continue;
    }
    if (kind === 'capo') {
      const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
      const m = /(\d+)/.exec(l) ?? /\b(i{1,3}|iv|v|vi{1,3}|ix|x)\b/i.exec(l.trim().replace(/^\S+/, ''));
      capo = m ? Math.min(12, Number(m[1]) || roman[m[1].toLowerCase()] || 0) : 0;
      continue;
    }
    if ((cur as Section | null)?.skip) {
      skipped++;
      continue;
    }
    const tail = (w: string): { words: string; times: number } => {
      const r = /\s*\(?(?:x\s?(\d+)|(\d+)\s?x)\)?\s*$/i.exec(w);
      return r ? { words: w.slice(0, r.index), times: timesOf(r) } : { words: w, times: 1 };
    };
    if (kind === 'chords') {
      const c = chordLine(l)!;
      const next = lines[i + 1];
      const below = next !== undefined && kindOf(next) === 'words' ? (i++, tail(next)) : null;
      add({ chords: c.chords, ...(c.cells ? { cells: c.cells } : {}), words: below?.words ?? '', times: below && below.times > 1 ? below.times : c.times });
    } else if (kind === 'inline') add(inlineLine(l)!);
    else add({ chords: [], ...tail(l) });
  }

  // the chords, as the app plays them
  const germanB = lines.some((l) => kindOf(l) === 'chords' && /(^|\s|\(|\|)H/.test(l)) || /\[H[^\]]*\]/.test(text);
  const simplified = new Map<string, string>();
  const unknown = new Set<string>();
  const play = (sym: string): string | null => {
    const r = chordId(sym, transpose, germanB);
    if (!r.id) unknown.add(sym);
    else if (r.simplified) simplified.set(sym, r.id);
    return r.id;
  };

  interface Line {
    n: number;
    /** how the line's words were shared out over its bars: where later words of the part go */
    shares: number[];
  }
  let last: string | null = null;
  /** A section's lines as bars of chords with their words. */
  const lay = (s: Section): { chords: string[][]; words: string[]; lines: Line[] } => {
    const out = { chords: [] as string[][], words: [] as string[], lines: [] as Line[] };
    for (const p of s.pairs) {
      let chords: string[][] = [];
      let words: string[] = [];
      if (p.cells) {
        for (const c of p.cells) {
          const got = c.syms.includes('%') ? (chords[chords.length - 1] ?? []) : c.syms.map(play).filter((x): x is string => !!x);
          const use = got.length ? got : last ? [last] : [];
          if (use.length) last = use[use.length - 1];
          chords.push(use);
        }
        words = cutAt(p.words, p.cells.map((c) => c.col));
      } else if (p.chords.length) {
        const pieces = cutAt(p.words, p.chords.map((c) => c.col));
        const each = per * (p.chords.length === 1 ? 2 : 1);
        p.chords.forEach((c, k) => {
          const use = play(c.sym) ?? last;
          if (use) last = use;
          const split = spread(pieces[k], each);
          // a word the next chord cuts in two keeps its "-" in the last bar of this chord
          if (pieces[k].endsWith('-') && !split[each - 1].endsWith('-')) split[each - 1] += '-';
          for (let b = 0; b < each; b++) {
            chords.push(use ? [use] : []);
            words.push(split[b] ?? '');
          }
        });
      } else if (last) {
        // words with no chords over them: the chord before goes on under them
        chords = Array.from({ length: 2 * per }, () => [last!]);
        words = spread(p.words, 2 * per);
      } else {
        // words before the first chord: above the first header, the title and the artist, which nobody sings
        skipped++;
        if (s.name) problems.push(L(`Left out, as it has no chord before it: "${p.words.trim().slice(0, 40)}"`, `Weggelassen, weil davor kein Akkord steht: „${p.words.trim().slice(0, 40)}“`));
        continue;
      }
      // a bar with no chord at all (an unknown chord before any known one) is left out
      const keep = chords.map((c, b) => (c.length ? b : -1)).filter((b) => b >= 0);
      chords = keep.map((b) => chords[b]);
      words = keep.map((b) => words[b] ?? '');
      if (!chords.length) continue;
      for (let t = 0; t < p.times; t++) {
        out.chords.push(...chords);
        out.words.push(...words);
        out.lines.push({ n: chords.length, shares: words.map((w) => w.length) });
      }
    }
    return out;
  };

  interface Part {
    name: string;
    kind: string;
    chords: string[][];
    lines: Line[];
  }
  const parts: Part[] = [];
  const form: { part: Part; words: string[] }[] = [];
  const sig = (c: string[][]): string => c.map((b) => b.join(',')).join(' ');
  const played = sections.filter((s) => !s.skip);
  if (!headers) {
    const texts = played.map((s) => s.pairs.map((p) => p.words.trim()).join('\n'));
    played.forEach((s, k) => (s.name = texts.indexOf(texts[k]) !== texts.lastIndexOf(texts[k]) ? 'Chorus' : 'Verse'));
  }
  for (const s of played) {
    const kind = partKind(s.name) ?? 'Verse';
    if (!s.pairs.length) {
      // a header alone: that part again, with the words it had the last time
      const again = [...form].reverse().find((f) => f.part.kind === kind);
      if (again) for (let t = 0; t < s.times; t++) form.push({ part: again.part, words: again.words.slice() });
      else if (s.name) problems.push(L(`"${s.name}" has no lines, and nothing of its kind comes before it to repeat.`, `„${s.name}“ hat keine Zeilen, und davor kommt nichts dieser Art, das sich wiederholen ließe.`));
      continue;
    }
    const same = parts.find((p) => p.kind === kind);
    if (same && s.pairs.every((p) => !p.chords.length && !p.cells)) {
      // words alone under a header sung before with chords: the chords of that part, line by line
      const texts = s.pairs.flatMap((p) => Array.from({ length: p.times }, () => p.words.trim()));
      if (texts.length > same.lines.length) {
        problems.push(L(`"${s.name}" has more lines than the ${kind.toLowerCase()} with chords before it: its last lines are sung in the last line.`, `„${s.name}“ hat mehr Zeilen als der Teil mit Akkorden davor: Die letzten Zeilen kommen in seine letzte Zeile.`));
        texts.splice(same.lines.length - 1, texts.length, texts.slice(same.lines.length - 1).join(' '));
      }
      const words = same.lines.flatMap((ln, k) => spread(texts[k] ?? '', ln.n, ln.shares));
      for (let t = 0; t < s.times; t++) form.push({ part: same, words: words.slice() });
      continue;
    }
    const laid = lay(s);
    if (!laid.chords.length) continue;
    let part = parts.find((p) => p.kind === kind && sig(p.chords) === sig(laid.chords));
    if (!part) {
      const n = parts.filter((p) => p.kind === kind).length;
      part = { name: n ? `${kind} ${n + 1}` : kind, kind, chords: laid.chords, lines: laid.lines };
      parts.push(part);
    }
    for (let t = 0; t < s.times; t++) form.push({ part, words: laid.words.slice() });
  }

  const result = (song: Song | null, shown: Record<string, number[][]>): SheetImport => {
    let suggest: number | null = null;
    if (unknown.size && song) {
      // the smallest step that leaves no chord out
      const syms = [...new Set(sections.flatMap((s) => s.pairs.flatMap((p) => [...p.chords.map((c) => c.sym), ...(p.cells ?? []).flatMap((c) => c.syms.filter((x) => x !== '%'))])))];
      for (const t of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6])
        if (syms.every((x) => chordId(x, transpose + t, germanB).id)) {
          suggest = transpose + t;
          break;
        }
    }
    return { song, lines: shown, simplified: [...simplified].map(([from, to]) => ({ from, to })), unknown: [...unknown], capo, ...(bpm ? { bpm } : {}), ...(title ? { title } : {}), ...(by ? { by } : {}), skipped, problems, suggest };
  };
  if (!parts.length) {
    // with nothing to play, what was left out on the way does not matter: only that there were no chords
    problems.length = 0;
    problems.push(L('No chords found. A chord sheet has lines of chords (G, Am, D7 …) above the lines of words, or chords in brackets among the words: [G]Amazing [C]grace.', 'Keine Akkorde gefunden. Ein Akkordblatt hat Zeilen mit Akkorden (G, Am, D7 …) über den Zeilen mit Text, oder Akkorde in Klammern im Text: [G]Amazing [C]grace.'));
    return result(null, {});
  }

  // the song: each part's bars once, in the order the parts first come; the form plays them as the sheet does
  const { beat } = STRUMS[pattern];
  const bars: Bar[] = [];
  const shown: Record<string, number[][]> = {};
  for (const p of parts) {
    const first = form.find((f) => f.part === p)!;
    let at = bars.length;
    p.chords.forEach((c, b) => bars.push({ chord: c[0], notes: strumBar(c, pattern), ...(b === 0 ? { part: p.name } : {}), ...(first.words[b] ? { words: first.words[b] } : {}) }));
    shown[p.name] = p.lines.map((ln) => Array.from({ length: ln.n }, () => at++));
  }
  const verses: Record<string, string[][]> = {};
  const seen = new Set<Part>();
  for (const f of form) {
    if (seen.has(f.part)) (verses[f.part.name] ??= []).push(f.part.chords.map((_, b) => f.words[b] ?? ''));
    seen.add(f.part);
  }
  const author = o.by?.trim() || by;
  const song: Song = {
    id: o.id ?? 'sheet',
    title: (o.title?.trim() || title || L('My song', 'Mein Song')).slice(0, 60),
    ...(author ? { by: author.slice(0, 60) } : {}),
    noteDur: 60 / Math.max(30, Math.min(240, o.bpm ?? bpm ?? 90)) / beat,
    beat,
    bars,
    form: form.map((f) => f.part.name),
    ...(Object.keys(verses).length ? { verses } : {}),
    custom: true,
  };
  return result(song, shown);
}
