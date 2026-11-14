/** Drawings shared by several screens, as SVG markup. */
import type { StringResult } from '../audio/listener';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { noteTimes, type PianoNote, type TabNote } from '../music/content';
import { barreStrings, keyName, noteName, pianoChord, STRING_NAMES, type Chord } from '../music/theory';

export interface Palette {
  bg: string;
  panel: string;
  line: string;
  text: string;
  muted: string;
  faint: string;
  now: string;
  nowInk: string;
  good: string;
  bad: string;
}

/** One look for the whole app: ink on paper, one strong blue for "do this now". Learn and the games share it. */
export const LEARN: Palette = { bg: '#f4eee6', panel: '#ece3d6', line: '#cdbfae', text: '#26262e', muted: '#5f5a66', faint: '#8d8791', now: '#1e6aa8', nowInk: '#ffffff', good: '#2e8b6a', bad: '#c0392b' };
/** The palette of the games: ink on paper, and one strong blue for what you are playing now. */
export const NF: Palette = { bg: '#f4eee6', panel: '#ece3d6', line: '#cdbfae', text: '#26262e', muted: '#5f5a66', faint: '#8d8791', now: '#1e6aa8', nowInk: '#ffffff', good: '#2e8b6a', bad: '#c0392b' };
/** Two more tones of the games: ruled lines on paper, and what has been played and is done with. */
export const NFX = { rule: '#b9ab99', dim: '#a79e96' };

export type Mark = StringResult | 'now' | null;

/**
 * Chord diagram, five frets tall, nut at the top. hot colours the whole shape (the chord to play now);
 * marks colours single strings (the result of a string-by-string check).
 */
export function chordBox(c: Chord, ox: number, oy: number, w: number, p: Palette, hot = false, marks?: Mark[], rowH = 26): string {
  const sp = w / 5;
  // a left-handed guitar seen from the front: the strings the other way round, the high e on the left
  const sx = (i: number): number => ox + (lefty() ? 5 - i : i) * sp;
  const col = hot ? p.now : p.text;
  const barre = barreStrings(c);
  const isBarre = barre.length > 0;
  // a shape that reaches above the fifth fret is shown from its lowest fret, with that fret named beside it
  const held = c.frets.filter((f) => f > 0);
  const from = held.length && Math.max(...held) > 5 ? Math.min(...held) - 1 : 0;
  let h = '';
  for (let j = 0; j <= 5; j++) h += `<line x1="${ox}" x2="${ox + w}" y1="${oy + j * rowH}" y2="${oy + j * rowH}" stroke="${j ? p.line : col}" stroke-width="${j ? 1.5 : from ? 1.5 : 4}"/>`;
  if (from) h += `<text x="${ox + w + rowH * 0.35}" y="${oy + rowH * 0.68}" style="font:600 ${(rowH * 0.5).toFixed(1)}px var(--mono);text-anchor:start" fill="${p.muted}">${L(`${from + 1}fr`, `${from + 1}. Bd.`)}</text>`;
  for (let i = 0; i < 6; i++) {
    const x = sx(i);
    const m = marks?.[i];
    const sc = m === 'now' ? p.now : m === 'muted' || m === 'buzz' || m === 'wrong' ? p.bad : p.faint;
    h += `<line x1="${x}" x2="${x}" y1="${oy}" y2="${oy + 5 * rowH}" stroke="${sc}" stroke-width="${m && m !== 'clean' ? 3 : 1.5}"/>`;
    const f = c.frets[i];
    if (f < 0) h += `<path d="M${x - 4} ${oy - 18}l8 8M${x + 4} ${oy - 18}l-8 8" stroke="${p.muted}" stroke-width="1.6"/>`;
    else if (f === 0) h += `<circle cx="${x}" cy="${oy - 14}" r="4" fill="none" stroke="${p.text}" stroke-width="1.6"/>`;
    else if (!(isBarre && c.fingers[i] === 1)) {
      const y = oy + (f - from - 0.5) * rowH;
      h += `<circle cx="${x}" cy="${y}" r="${rowH * 0.3}" fill="${col}"/><text x="${x}" y="${y + rowH * 0.15}" class="fgr" style="font-size:${rowH * 0.42}px" fill="${p.bg}">${c.fingers[i]}</text>`;
    }
  }
  if (isBarre) {
    const y = oy + (c.frets[barre[0]] - from - 0.5) * rowH;
    const x1 = Math.min(sx(barre[0]), sx(barre[barre.length - 1]));
    const x2 = Math.max(sx(barre[0]), sx(barre[barre.length - 1]));
    h += `<rect x="${x1 - rowH * 0.3}" y="${y - rowH * 0.3}" width="${x2 - x1 + rowH * 0.6}" height="${rowH * 0.6}" rx="${rowH * 0.3}" fill="${col}"/><text x="${(x1 + x2) / 2}" y="${y + rowH * 0.15}" class="fgr" style="font-size:${rowH * 0.42}px" fill="${p.bg}">1</text>`;
  }
  return h;
}

/** The guitar is held the other way round: chord pictures and the fretboard are drawn mirrored. */
const lefty = (): boolean => store.settings.leftHanded;

/** Text made safe inside markup (the same as the screens' esc; here to keep the drawings free of them). */
const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The size of the type chosen in the settings: 1, 1.15 or 1.3. */
export const typeScale = (): number => ([1, 1.15, 1.3].includes(store.settings.uiScale) ? store.settings.uiScale : 1);

/**
 * Sizes read from a metre away, in units of a 1180-wide drawing. A play screen at 1440 by 900 draws such a
 * drawing about 0.85 to 0.93 times its size, so 36 units come out at 31 to 33 pixels and 34 at 29 to 32:
 * about the 20 minutes of arc that guidelines for displays read at a glance ask of numbers and names that
 * change (a capital about 5.8 mm high at a metre). The type size setting multiplies them.
 */
export const FAR = { fret: 36, chord: 34, key: 22 };

/** How a step of a line looks: still to come, the one to play, played right, missed, outside the bars being looped, or hidden (played by ear). */
export type StepLook = 'up' | 'cur' | 'done' | 'miss' | 'off' | 'hide';

/** A drawn line of music, and where a moment of it lies from left to right. */
export interface Drawn {
  svg: string;
  height: number;
  /** x of a moment, in note units from the start of the line; used for the playhead */
  x: (u: number) => number;
}

export interface TabLine {
  /** bars shown side by side; chord is the name to print above the bar */
  bars: { chord?: string; notes: TabNote[] }[];
  /** how each step looks, counted through all bars */
  look: (i: number) => StepLook;
  /** show finger numbers under the staff */
  fingers?: boolean;
  /** the name to print for a strummed chord; without it the chord's id is printed */
  name?: (id: string) => string;
  /** a syllable under each step, counted through all bars: the words to sing ("_" a note held over) */
  words?: string[];
  /** a slur into each step from the one before: h a hammer-on, p a pull-off (an arc over the two, with its letter) */
  slurs?: ('h' | 'p' | undefined)[];
}

/** Space before the first note of a bar, in note units. */
const BAR_LEAD = 0.5;
const BAR_PAD = 0.6;

/**
 * Tablature read left to right, 1180 units wide. Notes are spaced by their length, a strum is a slash
 * across the staff: a long one for a stroke down, a short one over the thin strings with a tip for a stroke
 * back up. Above a strum stands its chord wherever the chord changes. The markup contains a playhead
 * (class "ph") that is invisible until it is moved. big is the tab of a play screen, read from the
 * instrument: larger numbers and names (FAR, times the type size), and only as much room above the staff
 * as the chord names need; its height is in the result, for the viewBox.
 */
export function tabLine(t: TabLine, p: Palette, big = false): Drawn {
  const k = big ? typeScale() : 1;
  const named = t.bars.some((b) => b.chord || b.notes.some((n) => n.strum));
  // a fret number, its box (which hides the string behind it) and the ring round the one to play now
  const fs = big ? FAR.fret * k : 24;
  const ring = big ? Math.max(24, fs * 0.66) : 19;
  const chordSize = big ? FAR.chord * k : 23;
  // above the staff: the marker of the note to play clears its ring, and the chord names clear the marker
  const top = big ? (named ? Math.max(80, ring + 22 + 0.72 * chordSize) : Math.max(46, ring + 14)) : 56;
  const gap = big ? 28 : 22;
  const left = 90;
  const right = 1160;
  const bottom = top + 5 * gap;
  const times = t.bars.map((b) => noteTimes(b.notes));
  const total = times.reduce((sum, b) => sum + Math.max(1, b.total) + BAR_PAD, 0);
  const scale = (right - left) / total;
  const tri = big ? top - ring - 12 : top - 30;
  // the words under the staff, below the fingers when there are fingers
  const wordsY = bottom + (t.fingers ? 30 : 0) + (big ? Math.max(ring, 24) + 10 + 18 * k : 34);
  const nameY = big ? tri - 4 : top - 36;
  const num = (x: number, y: number, f: string, ink: string, cur: boolean, size = fs): string => {
    const w = big ? size * 0.62 * f.length + 10 : 30;
    const hh = big ? size * 0.82 : 26;
    const style = big ? ` style="font-size:${size.toFixed(1)}px"` : '';
    return cur
      ? `<circle cx="${x}" cy="${y}" r="${big ? Math.max(ring, w / 2 + 2) : ring}" fill="${p.now}"/><text x="${x}" y="${y + size * 0.35}" class="tn${big ? ' big' : ''}"${style} fill="${p.nowInk}">${f}</text>`
      : `<rect x="${x - w / 2}" y="${y - hh / 2}" width="${w}" height="${hh}" fill="${p.bg}"/><text x="${x}" y="${y + size * 0.35}" class="tn${big ? ' big' : ''}"${style} fill="${ink}">${f}</text>`;
  };
  // chord names are placed first and drawn at the end, each as large as the room to the next one allows
  const names: { x: number; text: string }[] = [];
  let prevX = 0;
  let h = '';
  for (let k = 0; k < 6; k++) h += `<line x1="20" x2="${right}" y1="${top + k * gap}" y2="${top + k * gap}" stroke="${p.line}" stroke-width="1.5"/>`;
  ['T', 'A', 'B'].forEach((c, k) => (h += `<text x="50" y="${top + gap * 1.6 + k * gap * 1.35}" class="clef" fill="${p.faint}">${c}</text>`));
  let n = 0;
  let x0 = left;
  const starts: { u: number; x: number }[] = [];
  let u0 = 0;
  let sounding = '';
  t.bars.forEach((bar, b) => {
    h += `<line x1="${x0}" x2="${x0}" y1="${top}" y2="${bottom}" stroke="${p.faint}" stroke-width="2"/>`;
    const strummed = bar.notes.some((note) => note.strum);
    if (bar.chord && !strummed) names.push({ x: x0 + 14, text: bar.chord });
    starts.push({ u: u0, x: x0 + BAR_LEAD * scale });
    bar.notes.forEach((note, j) => {
      const x = x0 + (BAR_LEAD + times[b].at[j]) * scale;
      const look = t.look(n);
      const ink = look === 'done' ? p.good : look === 'miss' ? p.bad : look === 'off' ? p.line : p.text;
      if (look === 'cur') h += `<path d="M${x - 8} ${tri}h16l-8 11z" fill="${p.now}"/>`;
      if (note.strum) {
        // the chord is named where it begins: at the start of the line, and wherever it changes
        if (note.strum !== sounding || (j === 0 && b === 0)) names.push({ x: j === 0 ? x0 + 14 : x - 12, text: t.name ? t.name(note.strum) : note.strum });
        sounding = note.strum;
        const sc = look === 'cur' ? p.nowInk : ink;
        if (look === 'cur') h += `<rect x="${x - 21}" y="${top - 8}" width="42" height="${5 * gap + 16}" rx="10" fill="${p.now}"/>`;
        h += note.up
          ? `<path d="M${x - 6} ${top + 2.7 * gap}L${x + 6} ${top + 0.7 * gap}" stroke="${sc}" stroke-width="5" stroke-linecap="round"/><path d="M${x - 3} ${top + 0.55 * gap}L${x + 7} ${top + 0.35 * gap}L${x + 10.5} ${top + 1.25 * gap}" fill="none" stroke="${sc}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`
          : `<path d="M${x - 9} ${top + 4.1 * gap}L${x + 9} ${top + 0.9 * gap}" stroke="${sc}" stroke-width="8" stroke-linecap="round"/>`;
      } else if (look === 'hide') {
        // by ear: where the note is stays open, only that one comes here
        h += num(x, top + 2.5 * gap, '?', p.faint, false);
      } else {
        // notes struck together sit on neighbouring strings: there the numbers stay within a string's room
        const size = note.more?.length ? Math.min(fs, gap * 1.1) : fs;
        for (const s of [note, ...(note.more ?? [])]) h += num(x, top + (5 - s.s) * gap, String(s.f), ink, look === 'cur', size);
      }
      if (t.fingers && note.fg) h += `<text x="${x}" y="${bottom + 30}" class="fn" fill="${look === 'cur' ? p.now : p.muted}">${note.fg}</text>`;
      const slur = t.slurs?.[n];
      if (slur && n > 0) {
        // the arc from the note before to this one, over the string, with h or p in its middle
        const px = prevX;
        const y = top + (5 - note.s) * gap - ring - 6;
        h += `<path d="M${px + 4} ${y}Q${(px + x) / 2} ${y - 34} ${x - 4} ${y}" fill="none" stroke="${p.text}" stroke-width="2.5"/><text x="${(px + x) / 2}" y="${y - 22}" class="tn" style="font-size:${(22 * k).toFixed(1)}px" fill="${p.muted}">${slur}</text>`;
      }
      prevX = x;
      const word = t.words?.[n];
      if (word && word !== '_') h += `<text x="${x}" y="${wordsY}" class="wd" style="font-size:${(big ? 24 * k : 18).toFixed(1)}px" fill="${look === 'cur' ? p.now : p.text}">${esc(word)}</text>`;
      n++;
    });
    u0 += times[b].total;
    x0 += (Math.max(1, times[b].total) + BAR_PAD) * scale;
  });
  h += `<line x1="${right}" x2="${right}" y1="${top}" y2="${bottom}" stroke="${p.faint}" stroke-width="2"/>`;
  names.forEach((n, i) => {
    // a name runs about 0.62 of its size per letter; a change soon after another makes it smaller, never under 16
    const room = (names[i + 1]?.x ?? right + 20) - n.x - 10;
    const size = Math.max(16, Math.min(chordSize, room / (n.text.length * 0.62)));
    h += `<text x="${n.x}" y="${nameY}" class="chn"${size !== 23 ? ` style="font-size:${size.toFixed(1)}px"` : ''} fill="${p.text}">${n.text}</text>`;
  });
  if (t.fingers) h += `<text x="24" y="${bottom + 30}" class="lbl" fill="${p.muted}">${L('finger', 'Finger')}</text>`;
  h += `<line class="ph" x1="0" x2="0" y1="${tri}" y2="${bottom + 10}" stroke="${p.now}" stroke-width="3" stroke-linecap="round" opacity="0"/>`;
  const x = (u: number): number => {
    let bar = starts[0];
    for (const s of starts) if (u >= s.u) bar = s;
    return Math.max(24, Math.min(right, bar.x + (u - bar.u) * scale));
  };
  const below = bottom + (t.fingers ? 44 : big ? Math.ceil(ring) + 6 : 18);
  return { svg: h, height: t.words ? Math.max(below, Math.ceil(wordsY + 10 * k)) : below, x };
}

/**
 * A phrase for the piano, read left to right, 1180 x 180 units: every note is a block that starts where
 * the note starts and is as long as the note; higher notes sit higher. Finger numbers run underneath.
 * A chord struck as a whole is a block with its name and a bar on its left edge, placed by its lowest key;
 * where a chord is broken into single keys its name stands above the key it begins with.
 */
export function noteStrip(notes: PianoNote[], look: (i: number) => StepLook, p: Palette, words?: string[]): Drawn {
  const left = 96;
  const right = 1150;
  const { at, total } = noteTimes(notes);
  const scale = (right - left) / Math.max(4, total);
  const hi = Math.max(...notes.map((n) => n.midi));
  const lo = Math.min(hi - 7, ...notes.map((n) => n.midi));
  // the names of the keys, read from the bench (nearer than a guitar is held): FAR.key times the type size
  const k = typeScale();
  const fs = FAR.key * k;
  const boxH = Math.max(38, fs * 1.7);
  const named = notes.some((n) => n.over);
  // a row under the fingers for the keys of the left hand, when it plays with the right
  const bassRow = notes.some((n) => n.bass);
  const overSize = 22 * k;
  const overY = Math.max(20, overSize * 0.8);
  const top = named ? overY + 10 : 8;
  let h = `<line x1="${left}" x2="${right}" y1="150" y2="150" stroke="${p.line}" stroke-width="1.5"/>`;
  if (notes.some((n) => n.fg)) h += `<text x="24" y="172" class="lbl" fill="${p.muted}">${L('finger', 'Finger')}</text>`;
  if (named) h += `<text x="24" y="20" class="lbl" fill="${p.muted}">${L('chord', 'Akkord')}</text>`;
  // the chord whose keys are being played one after the other gives them their names
  let over: string | undefined;
  notes.forEach((n, i) => {
    if (n.over) over = n.over;
    const x = left + at[i] * scale;
    const w = Math.max(44, (n.len ?? 1) * scale - 8);
    const l = look(i);
    // by ear the height of a note would give it away: it waits in the middle
    const y = l === 'hide' ? (top + 144 - boxH) / 2 : top + ((hi - n.midi) / (hi - lo)) * (144 - top - boxH);
    const edge = l === 'cur' ? p.now : l === 'done' ? p.good : l === 'miss' ? p.bad : p.line;
    const ink = l === 'cur' ? p.nowInk : l === 'done' ? p.good : l === 'miss' ? p.bad : l === 'off' ? p.line : p.text;
    h += `<rect x="${x}" y="${y}" width="${w}" height="${boxH}" rx="9" fill="${l === 'cur' ? p.now : p.panel}" stroke="${edge}" stroke-width="2.5"/>`;
    const ty = y + boxH / 2 + fs * 0.35;
    const tx = x + Math.min(w / 2, Math.max(22, fs));
    if (l === 'hide') h += `<text x="${tx}" y="${ty}" class="rn" style="font-size:${fs}px" fill="${p.faint}">?</text>`;
    else if (n.chord) {
      const name = pianoChord(n.chord).name;
      // three short lines for the keys that go down together
      for (let j = 0; j < 3; j++) h += `<line x1="${x + 9}" x2="${x + 17}" y1="${y + boxH / 2 - 8 + j * 8}" y2="${y + boxH / 2 - 8 + j * 8}" stroke="${ink}" stroke-width="3" stroke-linecap="round" opacity="0.75"/>`;
      // a long name in a short box gets smaller rather than run out of it
      const size = Math.min(fs, (w - 30) / (name.length * 0.6));
      h += `<text x="${x + 24}" y="${ty}" class="rn" style="text-anchor:start;font-size:${Math.max(13, size).toFixed(1)}px" fill="${ink}">${name}</text>`;
    } else h += `<text x="${tx}" y="${ty}" class="rn" style="font-size:${fs}px" fill="${ink}">${keyName(n.midi, over)}</text>`;
    if (n.over) h += `<text x="${x + 2}" y="${overY}" class="chn" style="font-size:${overSize}px" fill="${l === 'cur' ? p.now : p.text}">${pianoChord(n.over).name}</text><line x1="${x}" x2="${x}" y1="${overY + 6}" y2="150" stroke="${p.line}" stroke-width="1.5" stroke-dasharray="3 4"/>`;
    // a key of the left hand struck with this one: its name under the line, marked L
    if (n.bass && l !== 'hide') h += `<text x="${tx}" y="198" class="lbl" style="text-anchor:middle;font-size:${(15 * k).toFixed(1)}px;font-weight:700" fill="${l === 'cur' ? p.now : p.muted}">L ${keyName(n.bass)}</text>`;
    if (n.fg && l !== 'hide') h += `<text x="${tx}" y="174" class="fn" style="font-size:${(18 * k).toFixed(1)}px" fill="${l === 'cur' ? p.now : p.muted}">${n.fg}</text>`;
    const word = words?.[i];
    if (word && word !== '_' && l !== 'hide') h += `<text x="${tx}" y="${(bassRow ? 224 : 200) + 10 * k}" class="wd" style="font-size:${(22 * k).toFixed(1)}px" fill="${l === 'cur' ? p.now : p.text}">${esc(word)}</text>`;
  });
  h += `<line class="ph" x1="0" x2="0" y1="2" y2="152" stroke="${p.now}" stroke-width="3" stroke-linecap="round" opacity="0"/>`;
  return { svg: h, height: words ? Math.ceil((bassRow ? 236 : 212) + 12 * k) : bassRow ? 208 : 180, x: (u) => Math.max(8, Math.min(right, left + u * scale)) };
}

/** Moves the playhead of a drawn line (tabLine or noteStrip) to x, or hides it. */
export function playhead(svg: Element | null, x: number | null): void {
  const ph = svg?.querySelector('.ph');
  if (!ph) return;
  if (x === null) ph.setAttribute('opacity', '0');
  else {
    ph.setAttribute('x1', x.toFixed(1));
    ph.setAttribute('x2', x.toFixed(1));
    ph.setAttribute('opacity', '1');
  }
}

const FRET_X = (n: number): number => 110 + 4100 * (1 - Math.pow(2, -n / 12));

/**
 * Fretboard seen from above, nut on the left, 1180 x 224 units. dots are the fingers of the chord
 * being held, pluck is the string to play (with its fret when it is not part of the chord).
 * from moves the window up the neck: the first fret shown is from + 1.
 */
export function fretboard(dots: { s: number; f: number; fg: number }[], pluck: TabNote | null, p: Palette, from = 0): string {
  const sy = (i: number): number => 26 + (5 - i) * 31;
  // a left-handed guitar: the nut on the right, the frets counting to the left
  const L2 = lefty();
  const fx = (x: number): number => (L2 ? 1180 - x : x);
  const nx = (f: number): number => fx(FRET_X(f - from) - (FRET_X(f - from) - FRET_X(f - from - 1)) * 0.3);
  let h = `<rect x="${Math.min(fx(110), fx(FRET_X(5)))}" y="8" width="${FRET_X(5) - 110}" height="191" rx="6" fill="${p.panel}" stroke="${p.line}" stroke-width="2"/>`;
  for (let k = 1; k <= 5; k++) {
    if ([3, 5, 7, 9, 12].includes(k + from)) h += `<circle cx="${fx((FRET_X(k) + FRET_X(k - 1)) / 2)}" cy="103.5" r="7" fill="${p.line}"/>`;
    h += `<line x1="${fx(FRET_X(k))}" x2="${fx(FRET_X(k))}" y1="8" y2="199" stroke="${p.faint}" stroke-width="3"/><text x="${fx((FRET_X(k) + FRET_X(k - 1)) / 2)}" y="216" class="fn" fill="${p.faint}">${k + from}</text>`;
  }
  h += from ? `<line x1="${fx(110)}" x2="${fx(110)}" y1="8" y2="199" stroke="${p.faint}" stroke-width="3"/>` : `<rect x="${L2 ? fx(112) : 102}" y="6" width="10" height="195" rx="2" fill="${p.text}"/>`;
  for (let i = 0; i < 6; i++) {
    const y = sy(i);
    const on = pluck?.s === i;
    h += `<text x="${fx(34)}" y="${y + 6}" class="sn" fill="${on ? p.now : p.muted}">${STRING_NAMES[i]}</text>`;
    if (on) {
      let d = `M70 ${y}`;
      for (let x = 70; x < 1200; x += 40) d += 'q10 -6 20 0q10 6 20 0';
      h += `<g clip-path="url(#fbclip)"><g${L2 ? ' transform="translate(1180 0) scale(-1 1)"' : ''}><path class="vib" d="${d}" fill="none" stroke="${p.now}" stroke-width="5"/></g></g>`;
    } else h += `<line x1="${fx(110)}" x2="${fx(1150)}" y1="${y}" y2="${y}" stroke="${p.muted}" stroke-width="${[3.4, 3, 2.6, 2, 1.6, 1.3][i]}"/>`;
  }
  const shown = (f: number): boolean => f > from && f <= from + 5;
  let onDot = false;
  for (const d of dots) {
    if (!shown(d.f)) continue;
    const hot = !!pluck && d.s === pluck.s && d.f === pluck.f;
    onDot ||= hot;
    h += `<circle cx="${nx(d.f)}" cy="${sy(d.s)}" r="15" fill="${hot ? p.now : p.text}"/><text x="${nx(d.f)}" y="${sy(d.s) + 6}" class="dn" fill="${hot ? p.nowInk : p.bg}">${d.fg || ''}</text>`;
  }
  if (pluck) {
    const y = sy(pluck.s);
    if (pluck.f === 0) h += `<circle cx="${fx(74)}" cy="${y}" r="13" fill="${p.bg}" stroke="${p.now}" stroke-width="4"/><text x="${fx(74)}" y="${y + 5.5}" class="opn" fill="${p.now}">0</text>`;
    else if (!onDot && shown(pluck.f)) h += `<circle cx="${nx(pluck.f)}" cy="${y}" r="15" fill="${p.now}"/><text x="${nx(pluck.f)}" y="${y + 6}" class="dn" fill="${p.nowInk}">${pluck.fg ?? ''}</text>`;
    h += L2 ? `<path d="M10 ${y - 10}L26 ${y}L10 ${y + 10}z" fill="${p.now}"/>` : `<path d="M1170 ${y - 10}L1154 ${y}L1170 ${y + 10}z" fill="${p.now}"/>`;
  }
  return `<defs><clipPath id="fbclip"><rect x="${L2 ? 28 : 112}" y="0" width="1040" height="224"/></clipPath></defs>${h}`;
}

const KEY_POS = [0.5, 1, 1.5, 2, 2.5, 3.5, 4, 4.5, 5, 5.5, 6, 6.5];
const isBlack = (m: number): boolean => [1, 3, 6, 8, 10].includes(m % 12);

export interface KeyMark {
  midi: number;
  fg?: number;
  /** the key to play now */
  hot?: boolean;
  /** just played right */
  done?: boolean;
  /** a key of the chord that is shown, without being the one to play now */
  held?: boolean;
  /** the key did not ring, or was not the one */
  bad?: boolean;
}

export interface KeyboardBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** print note names on the white keys */
  names?: boolean;
}

/**
 * Piano keys from a C upward; octaves may be a fraction (1.5 ends on an F). Marked keys carry their
 * finger number; the hot one is filled. Without a box it fills a 1180 x 300 drawing.
 */
export function keyboard(marks: KeyMark[], p: Palette, lowC = 60, octaves = 2, box: KeyboardBox = { x: 16, y: 20, w: 1148, h: 260, names: true }): string {
  const whites: number[] = [];
  const blacks: number[] = [];
  for (let m = lowC; m < lowC + Math.round(12 * octaves); m++) (isBlack(m) ? blacks : whites).push(m);
  const W = box.w / whites.length;
  const kc = (m: number): number => box.x + (Math.floor((m - lowC) / 12) * 7 + KEY_POS[m % 12]) * W;
  const mark = new Map(marks.map((m) => [m.midi, m]));
  const bw = W * 0.62;
  const bh = box.h * 0.63;
  const r = Math.min(22, W * 0.38);
  let h = '';
  // the edge of a key says how it went: green for one that rang, red for one that did not
  const edge = (m: KeyMark | undefined): string => (m && !m.hot && (m.done || m.bad) ? (m.done ? p.good : p.bad) : '');
  for (const k of whites) {
    const m = mark.get(k);
    h += `<rect x="${kc(k) - W / 2 + 1.5}" y="${box.y}" width="${W - 3}" height="${box.h}" rx="${Math.min(7, W * 0.1)}" fill="${m?.hot ? p.now : m?.held ? '#cfe0ee' : '#fffdf8'}"${edge(m) ? ` stroke="${edge(m)}" stroke-width="5"` : ''}/>`;
    if (box.names) h += `<text x="${kc(k)}" y="${box.y + box.h - 14}" class="kn" fill="${m?.hot ? p.nowInk : '#4b5565'}">${noteName(k)}</text>`;
  }
  for (const k of blacks) {
    const m = mark.get(k);
    h += `<rect x="${kc(k) - bw / 2}" y="${box.y}" width="${bw}" height="${bh}" rx="${Math.min(5, W * 0.07)}" fill="${m?.hot ? p.now : m?.held ? '#3f7099' : '#26262e'}" stroke="${edge(m) || p.line}" stroke-width="${edge(m) ? 5 : 1.5}"/>`;
  }
  for (const m of marks) {
    if (m.midi < lowC || m.midi >= lowC + Math.round(12 * octaves) || !m.fg) continue;
    const y = box.y + (isBlack(m.midi) ? bh - r - 6 : box.h - r - (box.names ? 44 : 10));
    h += m.hot
      ? `<circle cx="${kc(m.midi)}" cy="${y}" r="${r}" fill="${p.nowInk}"/><text x="${kc(m.midi)}" y="${y + r * 0.36}" class="kb" style="font-size:${r}px" fill="${p.now}">${m.fg ?? ''}</text>`
      : `<circle cx="${kc(m.midi)}" cy="${y}" r="${r * 0.8}" fill="${isBlack(m.midi) ? '#26262e' : '#fffdf8'}" stroke="#4b5565" stroke-width="2"/><text x="${kc(m.midi)}" y="${y + r * 0.3}" class="kb" style="font-size:${r * 0.85}px" fill="${isBlack(m.midi) ? '#fffdf8' : '#4b5565'}">${m.fg}</text>`;
  }
  return h;
}

/** The keys of a chord as marks for a keyboard drawing: all of them the ones to play (hot), or only shown as held. */
export const chordMarks = (id: string, hot: boolean, fingers = true): KeyMark[] => {
  const c = pianoChord(id);
  return c.midis.map((midi, i) => ({ midi, ...(fingers ? { fg: c.fingers[i] } : {}), ...(hot ? { hot: true } : { held: true }) }));
};

/**
 * A chord on the piano as a picture: a stretch of keyboard from middle C with the chord's keys marked and,
 * where there is room, the finger on each. Drawn into the box given; `chords` are all the chords shown
 * side by side, so that every picture covers the same keys.
 */
export function keyChord(id: string, p: Palette, box: KeyboardBox, hot = false, chords: string[] = [id], fingers = true): string {
  const r = keyRange([60, ...chords.flatMap((c) => pianoChord(c).midis)], true);
  return keyboard(chordMarks(id, hot, fingers), p, r.lowC, r.octaves, box);
}

/**
 * The C to start a keyboard drawing from, and how many octaves it needs, to show all of these notes:
 * at least two whole octaves, or with tight just up to the end of the group of keys the highest is in.
 */
export function keyRange(midis: number[], tight = false): { lowC: number; octaves: number } {
  const lowC = Math.floor(Math.min(...midis) / 12) * 12;
  let keys = Math.max(...midis) - lowC + 1;
  if (!tight) return { lowC, octaves: Math.max(2, Math.ceil(keys / 12)) };
  while ((lowC + keys) % 12 !== 0 && (lowC + keys) % 12 !== 5) keys++;
  return { lowC, octaves: keys / 12 };
}
