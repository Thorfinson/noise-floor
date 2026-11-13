/**
 * The songbook of the voice: the tunes of the app that a voice can sing. Of the melodies the piano has
 * (folk songs, carols, hymns, themes), those without leaps wider than a sixth, within an octave and a half,
 * and not faster than a voice can follow; instrumental pieces with runs (an invention, a caprice) are not
 * for singing. A song is moved into the singer's voice when it is sung (see `fitTo`), so here it stands in
 * its written key.
 *
 * How hard a song is to sing, in points: how wide it is (a fifth 0, an octave 1, beyond 2, beyond an octave
 * and a half 3), its widest leap (a third 0, a fifth 1, a sixth 2), notes outside its key (1, many 2), its
 * pace (2 notes a second 1, 3 or more 2) and more than six different phrases (1). Up to 1 point is easy,
 * 2 moderate, up to 4 demanding, more is hard: as for the guitar's songs.
 */
import { L } from '../core/i18n';
import { allPieces, noteTimes, type PianoNote, type PianoPiece } from './content';

export interface SongToSing {
  id: string;
  title: string;
  by?: string;
  /** the piece of the piano book it is taken from */
  from: string;
  noteDur: number;
  beat: number;
  count?: number;
  bar?: number;
  leads?: number[];
  phrases: { midi: number; len?: number }[][];
}

export interface VoiceProfile {
  level: number;
  points: number;
  reasons: string[];
  /** semitones from the lowest note to the highest */
  span: number;
}

const leaps = (p: PianoNote[][]): number[] => p.flatMap((ph) => ph.slice(1).map((n, i) => Math.abs(n.midi - ph[i].midi)));

/** Notes outside the major or minor scale that fits the tune best, counted. */
function outside(midis: number[]): number {
  const major = [0, 2, 4, 5, 7, 9, 11];
  let best = Infinity;
  for (let root = 0; root < 12; root++) {
    const n = midis.filter((m) => !major.includes((((m - root) % 12) + 12) % 12)).length;
    best = Math.min(best, n);
  }
  return best;
}

/** Can a voice sing it? A melody of the piano book, not too wide, without big leaps, not too fast. */
export function singable(p: PianoPiece): boolean {
  if ((p.kind ?? 'melody') !== 'melody' || p.of) return false;
  const notes = p.phrases.flat();
  const midis = notes.map((n) => n.midi);
  const seconds = p.phrases.reduce((s, ph) => s + noteTimes(ph).total, 0) * p.noteDur;
  return Math.max(...midis) - Math.min(...midis) <= 17 && Math.max(0, ...leaps(p.phrases)) <= 9 && notes.length / seconds <= 3.4;
}

let book: SongToSing[] | null = null;
let madeFrom = -1;

/** Every song to sing: the singable tunes of the piano book, and every melody typed in by the player. */
export function voiceBook(): SongToSing[] {
  const pieces = allPieces();
  if (book && madeFrom === pieces.length) return book;
  madeFrom = pieces.length;
  book = pieces
    .filter((p) => (p.custom ? (p.kind ?? 'melody') === 'melody' && !p.of : singable(p)))
    .map((p) => ({
      id: `${p.id.replace(/~keys$/, '')}~voice`,
      title: p.title,
      by: p.by,
      from: p.id,
      noteDur: p.noteDur,
      beat: p.beat,
      count: p.count,
      bar: p.bar,
      leads: p.leads,
      phrases: p.phrases.map((ph) => ph.map((n) => ({ midi: n.midi, ...(n.len && n.len !== 1 ? { len: n.len } : {}) }))),
    }));
  return book;
}

export const findSongToSing = (id: string | undefined): SongToSing => voiceBook().find((s) => s.id === id) ?? voiceBook()[0];

export function voiceProfile(s: SongToSing): VoiceProfile {
  const notes = s.phrases.flat();
  const midis = notes.map((n) => n.midi);
  const span = Math.max(...midis) - Math.min(...midis);
  const leap = Math.max(0, ...leaps(s.phrases as PianoNote[][]));
  const off = outside(midis);
  const seconds = s.phrases.reduce((sum, ph) => sum + noteTimes(ph).total, 0) * s.noteDur;
  const pace = notes.length / Math.max(1, seconds);
  const different = new Set(s.phrases.map((ph) => JSON.stringify(ph))).size;
  let points = 0;
  const reasons: string[] = [];
  const range = span <= 7 ? 0 : span <= 12 ? 1 : span <= 16 ? 2 : 3;
  points += range;
  reasons.push([L('within a fifth', 'innerhalb einer Quinte'), L('within an octave', 'innerhalb einer Oktave'), L('wider than an octave', 'weiter als eine Oktave'), L('an octave and a half wide', 'anderthalb Oktaven weit')][range]);
  const jump = leap <= 4 ? 0 : leap <= 7 ? 1 : 2;
  points += jump;
  reasons.push([L('steps and small leaps', 'Schritte und kleine Sprünge'), L('leaps up to a fifth', 'Sprünge bis zur Quinte'), L('leaps of a sixth', 'Sprünge bis zur Sexte')][jump]);
  if (off) {
    points += off > notes.length / 10 ? 2 : 1;
    reasons.push(off > notes.length / 10 ? L('many notes outside the key', 'viele Töne außerhalb der Tonart') : L('notes outside the key', 'Töne außerhalb der Tonart'));
  }
  if (pace >= 3) points += 2;
  else if (pace >= 2) points += 1;
  reasons.push(pace >= 3 ? L('quick: three notes a second or more', 'schnell: drei Töne pro Sekunde oder mehr') : pace >= 2 ? L('moderate pace', 'mittleres Tempo') : L('slow', 'langsam'));
  if (different > 6) {
    points += 1;
    reasons.push(L(`${different} different phrases`, `${different} verschiedene Phrasen`));
  }
  const level = points <= 1 ? 1 : points <= 2 ? 2 : points <= 4 ? 3 : 4;
  return { level, points, reasons, span };
}

/** Easiest first: by level, then by points. */
export function songsToSing(): SongToSing[] {
  return voiceBook()
    .map((s, i) => ({ s, i, p: voiceProfile(s) }))
    .sort((a, b) => a.p.level - b.p.level || a.p.points - b.p.points || a.i - b.i)
    .map((x) => x.s);
}

/** Skill a phrase of a sung song measures; phrases that are the same share one. */
export function sungPhraseKey(s: SongToSing, phrase: number): string {
  const text = s.phrases.map((ph) => JSON.stringify(ph));
  return `bar:${s.id}:p${text.indexOf(text[phrase]) + 1}`;
}
