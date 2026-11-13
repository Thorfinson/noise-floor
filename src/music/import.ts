/** Reading the user's own material: a guitar tab pasted as text, and a melody typed as note names. */
import { L } from '../core/i18n';
import type { Bar, PianoNote, TabNote } from './content';

export interface TabImport {
  bars: Bar[];
  /** number of steps found */
  steps: number;
  problems: string[];
}

const MAX_FRET = 24;

/** A line of a tab: an optional string name, then mostly dashes, fret numbers and bar lines. */
function tabBody(line: string): string | null {
  const m = /^\s*[A-Ga-g]?[#b]?\s*([|:\-].*)$/.exec(line);
  if (!m) return null;
  const body = m[1].replace(/\s+$/, '');
  if ((body.match(/-/g)?.length ?? 0) < 3) return null;
  return /^[-0-9|:hpbrstvxHPBRSTVX/\\~()^.*<>= ]+$/.test(body) ? body : null;
}

/**
 * Reads a text tab: blocks of six lines, the high e string on top, fret numbers on dashes, bars split by "|".
 * Numbers in the same column are struck together. With rhythm on, the distance between numbers becomes
 * the length of the notes; playing techniques (h, p, b, / and so on) are ignored.
 */
export function parseTab(text: string, rhythm = true): TabImport {
  const problems: string[] = [];
  const systems: string[][] = [];
  let block: string[] = [];
  const close = (): void => {
    if (block.length === 6) systems.push(block);
    else if (block.length) problems.push(L(`A block of ${block.length} ${block.length === 1 ? 'line' : 'lines'} was skipped: a guitar tab has six, one for each string.`, `Ein Block aus ${block.length} ${block.length === 1 ? 'Zeile' : 'Zeilen'} wurde übersprungen: Eine Gitarren-Tabulatur hat sechs, eine für jede Saite.`));
    block = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const body = tabBody(line);
    if (body === null) close();
    else {
      block.push(body);
      if (block.length === 6) close();
    }
  }
  close();

  interface Found {
    bar: number;
    col: number;
    system: number;
    end: number;
    note: TabNote;
  }
  const found: Found[] = [];
  let bar = 0;
  systems.forEach((rows, system) => {
    const width = Math.max(...rows.map((r) => r.length));
    const used = rows.map(() => new Set<number>());
    let any = false;
    for (let col = 0; col < width; col++) {
      if (rows.filter((r) => r[col] === '|').length >= 4) {
        if (any) bar++;
        any = false;
        continue;
      }
      const notes: TabNote[] = [];
      rows.forEach((r, i) => {
        const ch = r[col];
        if (ch === undefined || ch < '0' || ch > '9' || used[i].has(col)) return;
        let f = Number(ch);
        const next = r[col + 1];
        if (next !== undefined && next >= '0' && next <= '9' && f * 10 + Number(next) <= MAX_FRET) {
          f = f * 10 + Number(next);
          used[i].add(col + 1);
        }
        notes.push({ s: 5 - i, f });
      });
      if (!notes.length) continue;
      notes.sort((a, b) => a.s - b.s);
      const [first, ...more] = notes;
      found.push({ bar, col, system, end: width, note: more.length ? { ...first, more } : first });
      any = true;
    }
    if (any) bar++;
  });

  if (!found.length) {
    if (!problems.length) problems.push(L('No tab found. A tab has six lines of dashes with fret numbers on them, the high e string on top.', 'Keine Tabulatur gefunden. Eine Tabulatur hat sechs Zeilen aus Strichen mit Bundzahlen darauf, die hohe e-Saite oben.'));
    return { bars: [], steps: 0, problems };
  }

  if (rhythm) {
    // the most common distance between two numbers is one note unit
    const gaps = found.map((f, i) => (found[i + 1]?.system === f.system ? found[i + 1].col - f.col : 0));
    const count = new Map<number, number>();
    for (const g of gaps) if (g > 0) count.set(g, (count.get(g) ?? 0) + 1);
    const unit = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 1;
    found.forEach((f, i) => {
      const len = Math.max(0.5, Math.min(4, Math.round(((gaps[i] || unit) / unit) * 2) / 2));
      if (len !== 1) f.note.len = len;
    });
  }

  const bars: Bar[] = [];
  for (const f of found) (bars[f.bar] ??= { notes: [] }).notes.push(f.note);
  return { bars: bars.filter(Boolean), steps: found.length, problems };
}

export interface NotesImport {
  phrases: PianoNote[][];
  notes: number;
  problems: string[];
}

const PITCH: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11, h: 11 };

/**
 * Reads a melody typed as note names: "E4 E4 F4 G4 | G4 F4 E4 D4". A new line or "|" starts a new phrase.
 * Sharps and flats are written F#4 and Bb3, a length after a colon (C4:2 is twice as long), a finger in
 * brackets (E4(3)). An octave that is left out is taken from the note before.
 */
export function parseNotes(text: string): NotesImport {
  const problems: string[] = [];
  const phrases: PianoNote[][] = [];
  let octave = 4;
  let count = 0;
  for (const part of text.split(/[\n|]/)) {
    const phrase: PianoNote[] = [];
    for (const token of part.split(/[\s,;]+/).filter(Boolean)) {
      const m = /^([A-Ha-h])([#♯b♭]?)(\d)?(?::(\d+(?:\.\d+)?))?(?:\((\d)\))?$/.exec(token);
      if (!m) {
        if (problems.length < 6) problems.push(L(`Could not read "${token}".`, `„${token}“ ließ sich nicht lesen.`));
        continue;
      }
      if (m[3]) octave = Number(m[3]);
      const midi = 12 * (octave + 1) + PITCH[m[1].toLowerCase()] + (m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0);
      if (midi < 38 || midi > 96) {
        if (problems.length < 6) problems.push(L(`${token} is outside the range the app listens to (D2 to C7).`, `${token} liegt außerhalb des Bereichs, den die App hört (D2 bis C7).`));
        continue;
      }
      const len = m[4] ? Math.max(0.25, Math.min(8, Number(m[4]))) : 1;
      const fg = m[5] ? Number(m[5]) : 0;
      phrase.push({ midi, ...(fg >= 1 && fg <= 5 ? { fg } : {}), ...(len !== 1 ? { len } : {}) });
      count++;
    }
    if (phrase.length) phrases.push(phrase);
  }
  if (!count && !problems.length) problems.push(L('No notes found. Type note names with their octave, like E4 E4 F4 G4.', 'Keine Noten gefunden. Gib Notennamen mit ihrer Oktave ein, etwa E4 E4 F4 G4.'));
  return { phrases, notes: count, problems };
}
