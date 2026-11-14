/**
 * How hard a song or piece is, read off what is in it. Three to four coarse steps with the reasons spelled
 * out: nobody who rates songs publishes a formula, and automatic ratings are only reliable when they are
 * coarse. The criteria follow the published rubric for strummed songs (Vélez Vásquez et al., ISMIR 2023:
 * how hard the chords are to finger, how many there are, what the picking hand does, how fast the changes
 * come) and, for the piano, the ladder of the graded sight-reading tests (one hand position, then moving,
 * black keys, pace, length).
 *
 * For a strummed song the points are: the hardest chord shape (0 open, 1 an awkward open shape, 2 a small
 * barre, 3 a full barre), one more when two or more different chords need a full barre, one for more than
 * three chords and two for more than five, one for a strumming pattern with upstrokes, and one when the
 * chord changes come faster than every two seconds. Picking a pattern over the chords counts two, a tune
 * on single strings one, and their pace up to two more. Up to 1 point is easy, 2 moderate, up to 4
 * demanding, more is hard.
 *
 * Also here: what a song asks of this player (which of its chords already ring), and the song the session
 * works on when the player has not chosen one: the easiest that is not finished.
 */
import { L, lang } from '../core/i18n';
import { store, type Instrument } from '../core/store';
import { allPieces, allSongs, barKey, easiestShape, findPiece, findSong, noteTimes, phraseKey, shapeOf, type PianoPiece, type Song } from './content';
import { barreStrings, CHORDS, isBlackKey, keyWeight, pianoChord } from './theory';
import { findSongToSing, songsToSing, sungPhraseKey, voiceBook, type SongToSing } from './voicebook';

const LEVELS_DE = ['', 'Leicht', 'Mittel', 'Anspruchsvoll', 'Schwer'];
/** The names of the levels, in the language shown when they are read. */
export const LEVELS: string[] = new Proxy(['', 'Easy', 'Moderate', 'Demanding', 'Hard'], { get: (en, k) => Reflect.get(lang() === 'de' ? LEVELS_DE : en, k) });

export interface Profile {
  /** 1 easy .. 4 hard */
  level: number;
  label: string;
  kind: 'strummed' | 'picked' | 'melody' | 'chords' | 'broken';
  /** the chords it needs, in order of appearance: on the guitar the shapes as the app shows them */
  chords: string[];
  /** why it has this level, most important first */
  reasons: string[];
  /** what the level was worked out from: more points, harder */
  points: number;
}

/** Songs: up to 1 point is easy, 2 moderate, up to 4 demanding, more is hard. */
const songStep = (points: number): number => (points <= 1 ? 1 : points <= 2 ? 2 : points <= 4 ? 3 : 4);

/** 0 for an open chord, 1 for an open shape that is awkward, 2 for a small barre over a few strings, 3 for a full one. */
export function chordWeight(id: string): number {
  const c = CHORDS[id];
  if (c.weight !== undefined) return c.weight;
  const b = barreStrings(c);
  return b.length === 0 ? 0 : b[b.length - 1] - b[0] >= 3 ? 3 : 2;
}

export function songProfile(song: Song): Profile {
  const notes = song.bars.flatMap((b) => b.notes);
  // every chord that is held or strummed, in the order they come up
  const named = song.bars.flatMap((b) => [b.chord, ...b.notes.map((n) => n.strum)]);
  const ids = [...new Set(named.filter((c): c is string => !!c && !!CHORDS[c]))];
  const chords = ids.map((c) => shapeOf(c).id);
  // rated by the easiest shapes there are, not by the ones this player has got to: a level that stays put
  const rated = ids.map((c) => easiestShape(c).id);
  const strummed = notes.length > 0 && notes.every((n) => n.strum);
  const kind: Profile['kind'] = strummed ? 'strummed' : chords.length ? 'picked' : 'melody';
  const seconds = song.bars.reduce((sum, b) => sum + noteTimes(b.notes).total, 0) * song.noteDur;
  const perSecond = notes.length / Math.max(1, seconds);
  let points = 0;
  const reasons: string[] = [];

  // the chords: the hardest shape, then how many
  const hardest = rated.reduce((m, c) => Math.max(m, chordWeight(c)), 0);
  const hard = rated.filter((c) => chordWeight(c) > 0).map((c) => CHORDS[c].name);
  const full = rated.filter((c) => chordWeight(c) >= 3).map((c) => CHORDS[c].name);
  points += hardest + (full.length > 1 ? 1 : 0);
  if (full.length > 1) reasons.push(L(`needs ${full.length} full barre chords (${full.join(', ')})`, `braucht ${full.length} Akkorde mit großem Barré (${full.join(', ')})`));
  else if (hardest >= 3) reasons.push(L(`needs a full barre chord (${full.join(', ')})`, `braucht einen Akkord mit großem Barré (${full.join(', ')})`));
  else if (hardest === 2) reasons.push(L(`needs a small barre (${rated.filter((c) => chordWeight(c) === 2).map((c) => CHORDS[c].name).join(', ')})`, `braucht ein kleines Barré (${rated.filter((c) => chordWeight(c) === 2).map((c) => CHORDS[c].name).join(', ')})`));
  else if (hardest === 1) reasons.push(L(`open chords, one of them awkward (${hard.join(', ')})`, `offene Akkorde, einer davon unbequem (${hard.join(', ')})`));
  else if (chords.length) reasons.push(L('open chords only', 'nur offene Akkorde'));
  if (chords.length > 5) points += 2;
  else if (chords.length > 3) points += 1;
  if (chords.length) reasons.push(L(`${chords.length} ${chords.length === 1 ? 'chord' : 'chords'}`, `${chords.length} ${chords.length === 1 ? 'Akkord' : 'Akkorde'}`));

  // the picking hand
  if (kind === 'picked') {
    points += 2;
    reasons.push(L('a picking pattern while the chord is held', 'ein Zupfmuster, während der Akkord gehalten wird'));
  } else if (kind === 'melody') {
    points += 1;
    reasons.push(L('single notes, no chords', 'einzelne Töne, keine Akkorde'));
    const frets = notes.flatMap((n) => [n, ...(n.more ?? [])]).map((n) => n.f);
    if (Math.max(0, ...frets) > 4) {
      points += 1;
      reasons.push(L('leaves the first four frets', 'verlässt die ersten vier Bünde'));
    }
  } else if (notes.some((n) => n.up)) {
    points += 1;
    reasons.push(L('a strumming pattern with upstrokes', 'ein Schlagmuster mit Aufschlägen'));
  } else reasons.push(L('strums on the beat', 'Anschläge auf dem Schlag'));

  // the pace at full speed
  if (kind === 'strummed') {
    const changes = notes.filter((n, i) => i > 0 && n.strum !== notes[i - 1].strum).length;
    const each = seconds / Math.max(1, changes);
    if (each < 2) points += 1;
    reasons.push(L(`a change about every ${each < 10 ? each.toFixed(1) : Math.round(each)} s at full speed`, `etwa alle ${each < 10 ? each.toFixed(1).replace('.', ',') : Math.round(each)} s ein Wechsel bei vollem Tempo`));
  } else {
    if (perSecond >= 3) points += 2;
    else if (perSecond >= 1.5) points += 1;
    reasons.push(perSecond >= 3 ? L('quick: three notes a second or more', 'schnell: drei Töne pro Sekunde oder mehr') : perSecond >= 1.5 ? L('moderate pace', 'mittleres Tempo') : L('slow', 'langsam'));
  }
  const level = songStep(points);
  return { level, label: LEVELS[level], kind, chords, reasons, points };
}

/** Pieces are counted like songs: up to 1 point is easy, 2 moderate, up to 4 demanding, more is hard. */
const pieceStep = songStep;

/**
 * How hard a piece for the piano is. A tune is rated by what the hand has to do (stay in one five-finger
 * position, move between phrases, move inside them), by its black keys, its pace and its length. Chords
 * are rated like the songs of the guitar: by the hardest shape (0 three white keys, 1 one black key in the
 * middle or a fourth key, 2 a shape that starts on a black key or has two, 3 four keys of that kind), by
 * how many there are, and by how fast they follow each other; broken into single keys they count one more,
 * and their pace is that of the keys.
 */
export function pieceProfile(piece: PianoPiece): Profile {
  const notes = piece.phrases.flat();
  const kind: Profile['kind'] = piece.kind === 'chords' ? 'chords' : piece.kind === 'broken' ? 'broken' : 'melody';
  const seconds = piece.phrases.reduce((sum, p) => sum + noteTimes(p).total, 0) * piece.noteDur;
  const perSecond = notes.length / Math.max(1, seconds);
  const chords = [...new Set(notes.map((n) => n.chord ?? n.over).filter((c): c is string => !!c))];
  let points = 0;
  const reasons: string[] = [];
  if (kind === 'melody') {
    const midis = notes.map((n) => n.midi);
    const span = Math.max(...midis) - Math.min(...midis);
    // how often a phrase does not fit under five fingers
    const moves = piece.phrases.filter((p) => Math.max(...p.map((n) => n.midi)) - Math.min(...p.map((n) => n.midi)) > 7).length;
    const black = midis.filter(isBlackKey).length;
    if (span <= 7) reasons.push(L('stays in one five-finger position', 'bleibt in einer Fünffinger-Position'));
    else if (moves === 0) {
      points += 1;
      reasons.push(L('the hand moves between phrases', 'die Hand wandert zwischen den Phrasen'));
    } else {
      points += moves > piece.phrases.length / 2 ? 3 : 2;
      reasons.push(moves > piece.phrases.length / 2 ? L('the hand moves inside most phrases', 'die Hand wandert innerhalb der meisten Phrasen') : L('the hand moves inside phrases', 'die Hand wandert innerhalb der Phrasen'));
    }
    if (black) {
      points += black > notes.length / 5 ? 2 : 1;
      reasons.push(black > notes.length / 5 ? L('many black keys', 'viele schwarze Tasten') : L('black keys', 'schwarze Tasten'));
    } else reasons.push(L('white keys only', 'nur weiße Tasten'));
    if (perSecond >= 4) points += 2;
    else if (perSecond >= 2) points += 1;
    reasons.push(perSecond >= 4 ? L('quick: four notes a second or more', 'schnell: vier Töne pro Sekunde oder mehr') : perSecond >= 2 ? L('moderate pace', 'mittleres Tempo') : L('slow', 'langsam'));
  } else {
    const hardest = chords.reduce((m, c) => Math.max(m, keyWeight(c)), 0);
    const awkward = chords.filter((c) => keyWeight(c) >= 2).map((c) => pianoChord(c).name);
    points += hardest + (awkward.length > 2 ? 1 : 0);
    if (hardest === 0) reasons.push(L('white keys only', 'nur weiße Tasten'));
    else if (hardest === 1) reasons.push(L(`a black key or a fourth key in ${chords.filter((c) => keyWeight(c) === 1).map((c) => pianoChord(c).name).join(', ')}`, `eine schwarze Taste oder eine vierte Taste in ${chords.filter((c) => keyWeight(c) === 1).map((c) => pianoChord(c).name).join(', ')}`));
    else reasons.push(L(`${awkward.length > 1 ? 'shapes' : 'a shape'} to get used to (${awkward.join(', ')})`, `${awkward.length > 1 ? 'ungewohnte Griffe' : 'ein ungewohnter Griff'} (${awkward.join(', ')})`));
    if (chords.length > 5) points += 2;
    else if (chords.length > 3) points += 1;
    reasons.push(L(`${chords.length} ${chords.length === 1 ? 'chord' : 'chords'}`, `${chords.length} ${chords.length === 1 ? 'Akkord' : 'Akkorde'}`));
    // how often the hand moves to another chord
    const seq = notes.map((n) => n.chord ?? n.over).filter((c): c is string => !!c);
    const changes = seq.filter((c, i) => i > 0 && c !== seq[i - 1]).length;
    const each = seconds / Math.max(1, changes);
    // how far the hand has to travel: a change that moves it a sixth or more has to be aimed
    const wide = seq.filter((c, i) => i > 0 && Math.abs(pianoChord(c).midis[0] - pianoChord(seq[i - 1]).midis[0]) >= 8).length;
    if (changes > 0 && wide >= changes / 3) {
      points += 1;
      reasons.push(L('wide jumps of the hand', 'weite Sprünge der Hand'));
    }
    if (kind === 'broken') {
      reasons.push(L('the chords broken into single keys', 'die Akkorde gebrochen, Taste für Taste'));
      // what the pattern asks of the hand beyond lying on the chord
      let root = notes[0].midi;
      let octave = false;
      let rocks = false;
      notes.forEach((n, i) => {
        if (n.over) root = n.midi;
        else {
          if (n.midi - root >= 12) octave = true;
          if (Math.abs(n.midi - notes[i - 1].midi) >= 5) rocks = true;
        }
      });
      if (octave || rocks) {
        points += 1;
        reasons.push(octave ? L('the hand opens to an octave', 'die Hand öffnet sich zur Oktave') : L('the hand rocks between the bottom and the top of the chord', 'die Hand schaukelt zwischen dem tiefsten und dem höchsten Ton des Akkords'));
      }
      if (perSecond >= 3) points += 2;
      else if (perSecond >= 1.8) points += 1;
      reasons.push(perSecond >= 3 ? L('quick: three keys a second or more', 'schnell: drei Tasten pro Sekunde oder mehr') : perSecond >= 1.8 ? L('moderate pace', 'mittleres Tempo') : L('slow', 'langsam'));
    } else {
      if (each < 2) points += 1;
      if (perSecond >= 1.6) points += 1;
      reasons.push(L(`a change about every ${each < 10 ? each.toFixed(1) : Math.round(each)} s at full speed`, `etwa alle ${each < 10 ? each.toFixed(1).replace('.', ',') : Math.round(each)} s ein Wechsel bei vollem Tempo`));
    }
  }
  // both hands: the left strikes the root under every chord
  if (piece.hands) {
    points += 1;
    const together = piece.phrases.some((ph) => ph.some((n) => n.bass));
    reasons.unshift(together ? L('both hands together: a bass in the left on the bar, with the melody', 'beide Hände zusammen: ein Bass links auf dem Takt, mit der Melodie') : L('both hands: the root in the left, then the chord in the right', 'beide Hände: der Grundton links, dann der Akkord rechts'));
  }
  // how much there is to learn: phrases that differ from each other
  const different = new Set(piece.phrases.map((_, i) => phraseKey(piece, i))).size;
  if (different > 6) {
    points += 1;
    reasons.push(L(`${different} different phrases`, `${different} verschiedene Phrasen`));
  }
  const level = pieceStep(points);
  return { level, label: LEVELS[level], kind, chords, reasons, points };
}

/**
 * Easiest first: by level, within a level songs with chords before melodies, because chords are what the
 * session trains, and among those the ones that ask for less.
 */
export function songsByDifficulty(): Song[] {
  const rank = (s: Song): number => {
    const p = songProfile(s);
    return p.level * 100 + (p.kind === 'melody' ? 50 : 0) + p.points;
  };
  return allSongs()
    .map((s, i) => ({ s, i, r: rank(s) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.s);
}

/**
 * Easiest first, by level. Within a level the three kinds take turns, each with its easiest first: a tune,
 * a piece of chords struck as a whole, one of broken chords, and round again. So whoever follows the
 * order meets chords early and keeps playing tunes, as piano courses lead through both side by side.
 */
export function piecesByDifficulty(): PianoPiece[] {
  const all = allPieces();
  const rated = all.filter((p) => !p.of).map((p, i) => ({ p, i, prof: pieceProfile(p) }));
  const out: PianoPiece[] = [];
  for (const level of [1, 2, 3, 4]) {
    const kinds = (['melody', 'chords', 'broken'] as const).map((k) => rated.filter((x) => x.prof.level === level && x.prof.kind === k).sort((a, b) => a.prof.points - b.prof.points || a.i - b.i));
    for (let n = 0; kinds.some((k) => n < k.length); n++) for (const k of kinds) if (n < k.length) out.push(k[n].p);
  }
  // a basic version comes right after the piece it is the basic version of
  return out.flatMap((p) => [p, ...all.filter((b) => b.of === p.id)]);
}

/** A song or piece is finished when every part of it has been played clean at full speed. */
export function finished(inst: Instrument, id: string): boolean {
  if (inst === 'voice') {
    const s = findSongToSing(id);
    return s.phrases.every((_, i) => store.skills.level(sungPhraseKey(s, i)) >= 4);
  }
  if (inst === 'piano') {
    const piece = findPiece(id);
    return piece.phrases.every((_, i) => store.skills.level(phraseKey(piece, i)) >= 4);
  }
  const song = findSong(id);
  return song.bars.every((_, i) => store.skills.level(barKey(song, i)) >= 4);
}

/** The song the session works on: the one the player opened, otherwise the easiest that is not finished. */
export function currentSong(): Song {
  const chosen = store.current.guitar;
  if (chosen && allSongs().some((s) => s.id === chosen)) return findSong(chosen);
  // the session's song is a song: exercises are chosen by the player, or come with their own stages
  const order = songsByDifficulty().filter((s) => !s.exercise);
  return order.find((s) => !finished('guitar', s.id)) ?? order[0];
}

/** The song the voice works on: the one the singer opened, otherwise the easiest that is not finished. */
export function currentSongToSing(): SongToSing {
  const chosen = store.current.voice;
  if (chosen && voiceBook().some((s) => s.id === chosen)) return findSongToSing(chosen);
  const order = songsToSing();
  return order.find((s) => !finished('voice', s.id)) ?? order[0];
}

export function currentPiece(): PianoPiece {
  const chosen = store.current.piano;
  if (chosen && allPieces().some((p) => p.id === chosen)) return findPiece(chosen);
  const order = piecesByDifficulty().filter((p) => !p.of);
  return order.find((p) => !finished('piano', p.id)) ?? order[0];
}

/** The skill of a chord: the guitar's shape, or (with "p." before its name) the keys of the piano. */
export const chordKey = (id: string, piano: boolean): string => `chord:${piano ? 'p.' : ''}${id}`;
/** The skill of a change between two chords, on the guitar or the piano. */
export const pairKey = (a: string, b: string, piano: boolean): string => `pair:${piano ? 'p.' : ''}${a}>${b}`;

/** What a song asks of this player: which of its chords already ring clean, and which are new. */
export function readiness(p: Profile): { known: string[]; fresh: string[]; text: string } {
  const piano = p.kind === 'chords' || p.kind === 'broken';
  const known = p.chords.filter((c) => store.skills.level(chordKey(c, piano)) >= 1);
  const fresh = p.chords.filter((c) => !known.includes(c));
  const names = (ids: string[]): string => ids.map((c) => (piano ? pianoChord(c).name : CHORDS[c].name)).join(', ');
  const text = !p.chords.length
    ? L('No chords needed.', 'Keine Akkorde nötig.')
    : !fresh.length
      ? L(`You know all ${p.chords.length} of its chords.`, p.chords.length === 1 ? 'Du kennst den Akkord darin.' : `Du kennst alle ${p.chords.length} Akkorde darin.`)
      : !known.length
        ? L(`New for you: ${names(fresh)}.`, `Neu für dich: ${names(fresh)}.`)
        : L(`You know ${known.length} of its ${p.chords.length} chords. New for you: ${names(fresh)}.`, `Du kennst ${known.length} von ${p.chords.length} Akkorden darin. Neu für dich: ${names(fresh)}.`);
  return { known, fresh, text };
}
