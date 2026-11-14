/**
 * Staff notation for the piano, read left to right, 1180 units wide: a treble staff for the right hand and,
 * when the left hand plays (notes marked `left`), a bass staff under it, joined by a brace. Notes are placed by their length like
 * the note strip, so that the playhead moves evenly; their heads, stems and flags follow the written lengths
 * (a quarter is one note unit). Sharps and flats are written before each note that needs one, as a beginner's
 * edition does, rather than in a key signature to be remembered. Note names and finger numbers can be printed
 * under the notes, as a help that is later left away.
 */
import { L } from '../core/i18n';
import { noteTimes, stepKeys, type PianoNote } from '../music/content';
import { keyName, pianoChord } from '../music/theory';
import type { Drawn, Palette, StepLook } from './draw';

export interface StaffOpts {
  /** print the name of each note under it */
  names?: boolean;
  /** print the finger numbers above the treble staff */
  fingers?: boolean;
}

/** The letter a key is written on, counted in letters from C0, and its sign: ♯ or ♭ or none. */
export function spell(midi: number, chord?: string): { step: number; sign: '' | '♯' | '♭' } {
  const name = keyName(midi, chord, false);
  const letter = 'CDEFGAB'.indexOf(name[0]);
  const sign = name.includes('♯') ? '♯' : name.includes('♭') ? '♭' : '';
  // a flat on C or a sharp on B crosses into the octave next door
  const pc = ((midi % 12) + 12) % 12;
  let octave = Math.floor(midi / 12) - 1;
  if (name[0] === 'C' && sign === '♭') octave++;
  if (name[0] === 'B' && sign === '♯' && pc === 0) octave--;
  return { step: octave * 7 + letter, sign };
}

/** Steps of the lines of each staff, from the bottom line up: E4 G4 B4 D5 F5, and G2 B2 D3 F3 A3. */
const TREBLE_BOTTOM = 4 * 7 + 2; // E4
const BASS_BOTTOM = 2 * 7 + 4; // G2

/**
 * Notes as a staff. Returns the drawing and where a moment lies, like the note strip.
 * The height is 230 for one staff, 340 for two.
 */
export function staffLine(notes: PianoNote[], look: (i: number) => StepLook, p: Palette, o: StaffOpts = {}): Drawn {
  const left = 120;
  const right = 1150;
  const { at, total } = noteTimes(notes);
  const scale = (right - left) / Math.max(4, total);
  const gap = 14;
  const two = notes.some((n) => n.left);
  const trebleTop = 70;
  const trebleBottom = trebleTop + 4 * gap;
  const bassTop = trebleBottom + 70;
  const bassBottom = bassTop + 4 * gap;
  const height = two ? bassBottom + 64 : trebleBottom + 70;
  const yOf = (step: number, bass: boolean): number => (bass ? bassBottom : trebleBottom) - (step - (bass ? BASS_BOTTOM : TREBLE_BOTTOM)) * (gap / 2);
  let h = '';
  const lines = (top: number): string => [0, 1, 2, 3, 4].map((k) => `<line x1="40" x2="${right}" y1="${top + k * gap}" y2="${top + k * gap}" stroke="${p.line}" stroke-width="1.5"/>`).join('');
  h += lines(trebleTop);
  // the clefs, drawn: a treble clef is a G curling round the second line, the bass clef an F with two dots
  h += `<text x="56" y="${trebleBottom + 9}" style="font: 400 ${gap * 5.4}px 'Segoe UI Symbol', 'Apple Symbols', 'Noto Music', 'Bravura', serif" fill="${p.text}">𝄞</text>`;
  if (two) {
    h += lines(bassTop);
    h += `<text x="56" y="${bassTop + gap * 3.05}" style="font: 400 ${gap * 3.6}px 'Segoe UI Symbol', 'Apple Symbols', 'Noto Music', 'Bravura', serif" fill="${p.text}">𝄢</text>`;
    h += `<line x1="40" x2="40" y1="${trebleTop}" y2="${bassBottom}" stroke="${p.text}" stroke-width="2"/>`;
    h += `<path d="M34 ${trebleTop}q-12 ${(bassBottom - trebleTop) / 4} -2 ${(bassBottom - trebleTop) / 2}q-10 ${(bassBottom - trebleTop) / 4} 2 ${(bassBottom - trebleTop) / 2}" fill="none" stroke="${p.text}" stroke-width="3"/>`;
  }
  h += `<line x1="${right}" x2="${right}" y1="${trebleTop}" y2="${two ? bassBottom : trebleBottom}" stroke="${p.faint}" stroke-width="2"/>`;
  if (o.fingers && notes.some((n) => n.fg)) h += `<text x="40" y="${trebleTop - 34}" class="lbl" fill="${p.muted}">${L('finger', 'Finger')}</text>`;

  /** One head on a staff, with its ledger lines and its sign. */
  const head = (x: number, midi: number, chord: string | undefined, bass: boolean, ink: string, hollow: boolean): { y: number; step: number } => {
    const { step, sign } = spell(midi, chord);
    const y = yOf(step, bass);
    const bottomStep = bass ? BASS_BOTTOM : TREBLE_BOTTOM;
    // ledger lines below and above the staff
    for (let s = bottomStep - 2; s >= step; s -= 2) h += `<line x1="${x - 14}" x2="${x + 14}" y1="${yOf(s, bass)}" y2="${yOf(s, bass)}" stroke="${p.text}" stroke-width="1.5"/>`;
    for (let s = bottomStep + 10; s <= step; s += 2) h += `<line x1="${x - 14}" x2="${x + 14}" y1="${yOf(s, bass)}" y2="${yOf(s, bass)}" stroke="${p.text}" stroke-width="1.5"/>`;
    if (sign) h += `<text x="${x - 24}" y="${y + 7}" style="font: 600 22px var(--font)" text-anchor="middle" fill="${ink}">${sign}</text>`;
    h += `<ellipse cx="${x}" cy="${y}" rx="8.5" ry="6.2" transform="rotate(-20 ${x} ${y})" fill="${hollow ? p.bg : ink}" stroke="${ink}" stroke-width="2.4"/>`;
    return { y, step };
  };

  notes.forEach((n, i) => {
    const x = left + at[i] * scale + 18;
    const l = look(i);
    const ink = l === 'cur' ? p.now : l === 'done' ? p.good : l === 'miss' ? p.bad : l === 'off' || l === 'hide' ? p.line : p.text;
    const len = n.len ?? 1;
    const hollow = len >= 2;
    if (l === 'cur') h += `<rect x="${x - 22}" y="${trebleTop - 26}" width="44" height="${(two ? bassBottom : trebleBottom) - trebleTop + 52}" rx="10" fill="${p.now}" opacity="0.1"/><path d="M${x - 8} ${trebleTop - 30}h16l-8 11z" fill="${p.now}"/>`;
    if (l === 'hide') {
      h += `<text x="${x}" y="${trebleTop + 2 * gap + 8}" class="rn" fill="${p.faint}">?</text>`;
      return;
    }
    const keysOf = stepKeys(n);
    const low = !!n.left;
    const placed = keysOf.map((k) => head(x, k, n.chord ?? n.over, low, ink, hollow));
    // the stem: up from the lowest head when the notes sit low, down from the highest when they sit high
    if (len < 4) {
      const mid = (Math.max(...placed.map((q) => q.step)) + Math.min(...placed.map((q) => q.step))) / 2;
      const up = mid < (low ? BASS_BOTTOM : TREBLE_BOTTOM) + 4;
      const ys = placed.map((q) => q.y);
      const sx = up ? x + 7.6 : x - 7.6;
      const y1 = up ? Math.max(...ys) : Math.min(...ys);
      const y2 = up ? Math.min(...ys) - 46 : Math.max(...ys) + 46;
      h += `<line x1="${sx}" x2="${sx}" y1="${y1}" y2="${y2}" stroke="${ink}" stroke-width="2.2"/>`;
      // an eighth has a flag, a sixteenth two
      const flags = len <= 0.26 ? 2 : len <= 0.51 ? 1 : 0;
      for (let f = 0; f < flags; f++) {
        const fy = y2 + (up ? f * 9 : -f * 9);
        h += `<path d="M${sx} ${fy}q12 ${up ? 8 : -8} 10 ${up ? 26 : -26}" fill="none" stroke="${ink}" stroke-width="2.4"/>`;
      }
    }
    // a dotted length: one and a half of a plain one
    if ([0.75, 1.5, 3].some((d) => Math.abs(len - d) < 1e-6)) h += `<circle cx="${x + 15}" cy="${placed[placed.length - 1].y - 3}" r="2.6" fill="${ink}"/>`;
    if (o.names) {
      const name = n.chord ? pianoChord(n.chord).name : keyName(n.midi, n.over);
      h += `<text x="${x}" y="${low ? bassBottom + 40 : trebleBottom + 50}" class="fn" fill="${l === 'cur' ? p.now : p.muted}">${name}</text>`;
    }
    if (o.fingers && n.fg) h += `<text x="${x}" y="${low ? bassBottom + 58 : trebleTop - 34}" class="fn" fill="${l === 'cur' ? p.now : p.muted}">${n.fg}</text>`;
  });
  h += `<line class="ph" x1="0" x2="0" y1="${trebleTop - 30}" y2="${(two ? bassBottom : trebleBottom) + 14}" stroke="${p.now}" stroke-width="3" stroke-linecap="round" opacity="0"/>`;
  return { svg: h, height, x: (u) => Math.max(8, Math.min(right, left + u * scale + 18)) };
}
