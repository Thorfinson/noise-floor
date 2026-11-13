/** Drawings shared by several screens, as SVG markup. */
import type { StringResult } from '../audio/listener';
import { L } from '../core/i18n';
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
    const x = ox + i * sp;
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
    const x1 = ox + barre[0] * sp;
    const x2 = ox + barre[barre.length - 1] * sp;
    h += `<rect x="${x1 - rowH * 0.3}" y="${y - rowH * 0.3}" width="${x2 - x1 + rowH * 0.6}" height="${rowH * 0.6}" rx="${rowH * 0.3}" fill="${col}"/><text x="${(x1 + x2) / 2}" y="${y + rowH * 0.15}" class="fgr" style="font-size:${rowH * 0.42}px" fill="${p.bg}">1</text>`;
  }
  return h;
}

/** How a step of a line looks: still to come, the one to play, played right, or missed. */
export type StepLook = 'up' | 'cur' | 'done' | 'miss';

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
}

/** Space before the first note of a bar, in note units. */
const BAR_LEAD = 0.5;
const BAR_PAD = 0.6;

/**
 * Tablature read left to right, 1180 x 186 units. Notes are spaced by their length, a strum is a slash
 * across the staff: a long one for a stroke down, a short one over the thin strings with a tip for a stroke
 * back up. Above a strum stands its chord wherever the chord changes. The markup contains a playhead
 * (class "ph") that is invisible until it is moved.
 */
export function tabLine(t: TabLine, p: Palette, big = false): Drawn {
  const top = 56;
  const gap = big ? 26 : 22;
  const left = 90;
  const right = 1160;
  const bottom = top + 5 * gap;
  const times = t.bars.map((b) => noteTimes(b.notes));
  const total = times.reduce((sum, b) => sum + Math.max(1, b.total) + BAR_PAD, 0);
  const scale = (right - left) / total;
  const dy = big ? 10 : 8.5;
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
    if (bar.chord && !strummed) h += `<text x="${x0 + 14}" y="${top - 36}" class="chn" fill="${p.text}">${bar.chord}</text>`;
    starts.push({ u: u0, x: x0 + BAR_LEAD * scale });
    bar.notes.forEach((note, j) => {
      const x = x0 + (BAR_LEAD + times[b].at[j]) * scale;
      const look = t.look(n);
      const ink = look === 'done' ? p.good : look === 'miss' ? p.bad : p.text;
      if (look === 'cur') h += `<path d="M${x - 8} ${top - 30}h16l-8 11z" fill="${p.now}"/>`;
      if (note.strum) {
        // the chord is named where it begins: at the start of the line, and wherever it changes
        if (note.strum !== sounding || (j === 0 && b === 0)) h += `<text x="${j === 0 ? x0 + 14 : x - 12}" y="${top - 36}" class="chn" fill="${p.text}">${t.name ? t.name(note.strum) : note.strum}</text>`;
        sounding = note.strum;
        const sc = look === 'cur' ? p.nowInk : ink;
        if (look === 'cur') h += `<rect x="${x - 21}" y="${top - 8}" width="42" height="${5 * gap + 16}" rx="10" fill="${p.now}"/>`;
        h += note.up
          ? `<path d="M${x - 6} ${top + 2.7 * gap}L${x + 6} ${top + 0.7 * gap}" stroke="${sc}" stroke-width="5" stroke-linecap="round"/><path d="M${x - 3} ${top + 0.55 * gap}L${x + 7} ${top + 0.35 * gap}L${x + 10.5} ${top + 1.25 * gap}" fill="none" stroke="${sc}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`
          : `<path d="M${x - 9} ${top + 4.1 * gap}L${x + 9} ${top + 0.9 * gap}" stroke="${sc}" stroke-width="8" stroke-linecap="round"/>`;
      } else {
        for (const s of [note, ...(note.more ?? [])]) {
          const y = top + (5 - s.s) * gap;
          h +=
            look === 'cur'
              ? `<circle cx="${x}" cy="${y}" r="${big ? 21 : 19}" fill="${p.now}"/><text x="${x}" y="${y + dy}" class="tn${big ? ' big' : ''}" fill="${p.nowInk}">${s.f}</text>`
              : `<rect x="${x - 15}" y="${y - 13}" width="30" height="26" fill="${p.bg}"/><text x="${x}" y="${y + dy}" class="tn${big ? ' big' : ''}" fill="${ink}">${s.f}</text>`;
        }
      }
      if (t.fingers && note.fg) h += `<text x="${x}" y="${bottom + 30}" class="fn" fill="${look === 'cur' ? p.now : p.muted}">${note.fg}</text>`;
      n++;
    });
    u0 += times[b].total;
    x0 += (Math.max(1, times[b].total) + BAR_PAD) * scale;
  });
  h += `<line x1="${right}" x2="${right}" y1="${top}" y2="${bottom}" stroke="${p.faint}" stroke-width="2"/>`;
  if (t.fingers) h += `<text x="24" y="${bottom + 30}" class="lbl" fill="${p.muted}">${L('finger', 'Finger')}</text>`;
  h += `<line class="ph" x1="0" x2="0" y1="${top - 30}" y2="${bottom + 10}" stroke="${p.now}" stroke-width="3" stroke-linecap="round" opacity="0"/>`;
  const x = (u: number): number => {
    let bar = starts[0];
    for (const s of starts) if (u >= s.u) bar = s;
    return Math.max(24, Math.min(right, bar.x + (u - bar.u) * scale));
  };
  return { svg: h, height: bottom + (t.fingers ? 44 : 18), x };
}

/**
 * A phrase for the piano, read left to right, 1180 x 180 units: every note is a block that starts where
 * the note starts and is as long as the note; higher notes sit higher. Finger numbers run underneath.
 * A chord struck as a whole is a block with its name and a bar on its left edge, placed by its lowest key;
 * where a chord is broken into single keys its name stands above the key it begins with.
 */
export function noteStrip(notes: PianoNote[], look: (i: number) => StepLook, p: Palette): Drawn {
  const left = 96;
  const right = 1150;
  const { at, total } = noteTimes(notes);
  const scale = (right - left) / Math.max(4, total);
  const hi = Math.max(...notes.map((n) => n.midi));
  const lo = Math.min(hi - 7, ...notes.map((n) => n.midi));
  const boxH = 38;
  const named = notes.some((n) => n.over);
  const top = named ? 30 : 8;
  let h = `<line x1="${left}" x2="${right}" y1="150" y2="150" stroke="${p.line}" stroke-width="1.5"/>`;
  if (notes.some((n) => n.fg)) h += `<text x="24" y="172" class="lbl" fill="${p.muted}">${L('finger', 'Finger')}</text>`;
  if (named) h += `<text x="24" y="20" class="lbl" fill="${p.muted}">${L('chord', 'Akkord')}</text>`;
  // the chord whose keys are being played one after the other gives them their names
  let over: string | undefined;
  notes.forEach((n, i) => {
    if (n.over) over = n.over;
    const x = left + at[i] * scale;
    const w = Math.max(44, (n.len ?? 1) * scale - 8);
    const y = top + ((hi - n.midi) / (hi - lo)) * (144 - top - boxH);
    const l = look(i);
    const edge = l === 'cur' ? p.now : l === 'done' ? p.good : l === 'miss' ? p.bad : p.line;
    const ink = l === 'cur' ? p.nowInk : l === 'done' ? p.good : l === 'miss' ? p.bad : p.text;
    h += `<rect x="${x}" y="${y}" width="${w}" height="${boxH}" rx="9" fill="${l === 'cur' ? p.now : p.panel}" stroke="${edge}" stroke-width="2.5"/>`;
    if (n.chord) {
      const name = pianoChord(n.chord).name;
      // three short lines for the keys that go down together
      for (let k = 0; k < 3; k++) h += `<line x1="${x + 9}" x2="${x + 17}" y1="${y + 11 + k * 8}" y2="${y + 11 + k * 8}" stroke="${ink}" stroke-width="3" stroke-linecap="round" opacity="0.75"/>`;
      h += `<text x="${x + 24}" y="${y + 26}" class="rn" style="text-anchor:start${name.length > 4 && w < 90 ? ';font-size:15px' : ''}" fill="${ink}">${name}</text>`;
    } else h += `<text x="${x + 22}" y="${y + 26}" class="rn" fill="${ink}">${keyName(n.midi, over)}</text>`;
    if (n.over) h += `<text x="${x + 2}" y="20" class="chn" style="font-size:19px" fill="${l === 'cur' ? p.now : p.text}">${pianoChord(n.over).name}</text><line x1="${x}" x2="${x}" y1="26" y2="150" stroke="${p.line}" stroke-width="1.5" stroke-dasharray="3 4"/>`;
    if (n.fg) h += `<text x="${x + 22}" y="172" class="fn" fill="${l === 'cur' ? p.now : p.muted}">${n.fg}</text>`;
  });
  h += `<line class="ph" x1="0" x2="0" y1="2" y2="152" stroke="${p.now}" stroke-width="3" stroke-linecap="round" opacity="0"/>`;
  return { svg: h, height: 180, x: (u) => Math.max(8, Math.min(right, left + u * scale)) };
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
  const nx = (f: number): number => FRET_X(f - from) - (FRET_X(f - from) - FRET_X(f - from - 1)) * 0.3;
  let h = `<rect x="110" y="8" width="${FRET_X(5) - 110}" height="191" rx="6" fill="${p.panel}" stroke="${p.line}" stroke-width="2"/>`;
  for (let k = 1; k <= 5; k++) {
    if ([3, 5, 7, 9, 12].includes(k + from)) h += `<circle cx="${(FRET_X(k) + FRET_X(k - 1)) / 2}" cy="103.5" r="7" fill="${p.line}"/>`;
    h += `<line x1="${FRET_X(k)}" x2="${FRET_X(k)}" y1="8" y2="199" stroke="${p.faint}" stroke-width="3"/><text x="${(FRET_X(k) + FRET_X(k - 1)) / 2}" y="216" class="fn" fill="${p.faint}">${k + from}</text>`;
  }
  h += from ? `<line x1="110" x2="110" y1="8" y2="199" stroke="${p.faint}" stroke-width="3"/>` : `<rect x="102" y="6" width="10" height="195" rx="2" fill="${p.text}"/>`;
  for (let i = 0; i < 6; i++) {
    const y = sy(i);
    const on = pluck?.s === i;
    h += `<text x="34" y="${y + 6}" class="sn" fill="${on ? p.now : p.muted}">${STRING_NAMES[i]}</text>`;
    if (on) {
      let d = `M70 ${y}`;
      for (let x = 70; x < 1200; x += 40) d += 'q10 -6 20 0q10 6 20 0';
      h += `<g clip-path="url(#fbclip)"><path class="vib" d="${d}" fill="none" stroke="${p.now}" stroke-width="5"/></g>`;
    } else h += `<line x1="110" x2="1150" y1="${y}" y2="${y}" stroke="${p.muted}" stroke-width="${[3.4, 3, 2.6, 2, 1.6, 1.3][i]}"/>`;
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
    if (pluck.f === 0) h += `<circle cx="74" cy="${y}" r="13" fill="${p.bg}" stroke="${p.now}" stroke-width="4"/><text x="74" y="${y + 5.5}" class="opn" fill="${p.now}">0</text>`;
    else if (!onDot && shown(pluck.f)) h += `<circle cx="${nx(pluck.f)}" cy="${y}" r="15" fill="${p.now}"/><text x="${nx(pluck.f)}" y="${y + 6}" class="dn" fill="${p.nowInk}">${pluck.fg ?? ''}</text>`;
    h += `<path d="M1170 ${y - 10}L1154 ${y}L1170 ${y + 10}z" fill="${p.now}"/>`;
  }
  return `<defs><clipPath id="fbclip"><rect x="112" y="0" width="1040" height="224"/></clipPath></defs>${h}`;
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
