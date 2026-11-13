/**
 * The learning path: where the player is, what they can do, what comes next. Built from what has been
 * measured, never from time spent or screens seen. A few stages, each named by its outcome, each with a
 * count ("5 of 8") instead of a percentage, in three zones: done, here, ahead. Nothing on it is locked:
 * it is a map, not a gate. The barre chords and the finger patterns run beside the main path, because
 * they take months and must never stand in the way of playing songs. The voice's path begins with finding
 * the range and singing in tune, then sung patterns, then songs by level.
 */
import { L } from '../core/i18n';
import { store, type Instrument } from '../core/store';
import { CHORD_PAIRS, FINGER_PATTERNS, KEY_CHORDS, KEY_CHORDS_ON, KEY_PAIRS, PIANO_PATTERNS, PIANO_SCALES } from './content';
import { chordKey, chordWeight, finished, LEVELS, pairKey, pieceProfile, piecesByDifficulty, songProfile, songsByDifficulty } from './difficulty';
import { chordName, CHORDS, noteName } from './theory';
import { songsToSing, voiceProfile } from './voicebook';
import { VOICE_PATTERNS } from '../game/run';

export interface PathItem {
  label: string;
  /** done: the stage's mark is reached; work: measured but not there yet; new: never measured */
  state: 'done' | 'work' | 'new';
  /** done, but not confirmed for a week */
  rusty: boolean;
  /** the measured value in words, or what it is */
  note: string;
  href?: string;
}

export interface Stage {
  id: string;
  title: string;
  /** what reaching it means, and the mark that counts */
  goal: string;
  items: PathItem[];
  done: number;
  /** done: every item; here: the first stage of the main path that is not done; ahead: after it; side: beside the path */
  state: 'done' | 'here' | 'ahead' | 'side';
  /** the next thing to do in this stage */
  next: string;
  /** where that is done, when it can be opened directly */
  nextHref?: string;
  /** the name of the stage in two or three words, for the map */
  short: string;
}

/** Read when the path is made, so that it is in the language shown. */
const SHORT = (): Record<string, string> => ({
  open: L('Open chords', 'Offene Akkorde'),
  changes: L('Changes', 'Wechsel'),
  songs1: L('Easy songs', 'Leichte Songs'),
  songs2: L('Moderate songs', 'Mittlere Songs'),
  songs3: L('Demanding songs', 'Anspruchsvolle Songs'),
  songs4: L('Hard songs', 'Schwere Songs'),
  barre: L('The barre ladder', 'Die Barré-Leiter'),
  fingers: L('Independent fingers', 'Unabhängige Finger'),
  hands: L('Five fingers', 'Fünf Finger'),
  chords: L('First chords', 'Erste Akkorde'),
  kchanges: L('Changes', 'Wechsel'),
  pieces1: L('Easy pieces', 'Leichte Stücke'),
  pieces2: L('Moderate pieces', 'Mittlere Stücke'),
  pieces3: L('Demanding pieces', 'Anspruchsvolle Stücke'),
  pieces4: L('Hard pieces', 'Schwere Stücke'),
  scales: L('Scales', 'Tonleitern'),
  morekeys: L('More chords', 'Mehr Akkorde'),
  vfirst: L('In tune', 'Treffsicher'),
  vpatterns: L('Steps and leaps', 'Schritte und Sprünge'),
  vsongs1: L('Easy songs', 'Leichte Songs'),
  vsongs2: L('Moderate songs', 'Mittlere Songs'),
  vsongs3: L('Demanding songs', 'Anspruchsvolle Songs'),
  vsongs4: L('Hard songs', 'Schwere Songs'),
  vfine: L('Nearer, steadier', 'Genauer, ruhiger'),
  vscale: L('The scale', 'Die Tonleiter'),
});
/** The levels as they stand before a plural noun in German: "der leichten Stücke". */
const LEVEL_ADJ_DE = ['', 'leichten', 'mittleren', 'anspruchsvollen', 'schweren'];

export const OPEN_CHORDS = ['Em', 'Am', 'E', 'A', 'D', 'C', 'G', 'Dm'];
/** how many songs of a level make its stage of the path */
const SONGS_PER_STAGE = 5;
const BARRE_LADDER = ['F', 'F#m-easy', 'Bm-easy', 'F#m', 'Bm'];

/** One item from a measured skill: done when its level reaches `mark`. */
function skillItem(key: string, label: string, mark: number, unit: (best: number) => string, now: number, href?: string): PathItem {
  const rec = store.skills.get(key);
  const done = (rec?.level ?? 0) >= mark;
  const days = rec?.days ?? 0;
  return { label, state: done ? 'done' : rec ? 'work' : 'new', rusty: done && store.skills.rusty(key, now), note: rec && isFinite(rec.best) && rec.best > 0 ? `${unit(rec.best)}${done ? ` · ${days > 1 ? L(`on ${days} days`, `an ${days} Tagen`) : L('once so far', 'bisher einmal')}` : ''}` : rec ? L('not clean yet', 'noch nicht sauber') : '', href };
}

function stage(id: string, title: string, goal: string, items: PathItem[], side = false): Stage {
  const done = items.filter((i) => i.state === 'done').length;
  const first = items.find((i) => i.state === 'work') ?? items.find((i) => i.state === 'new');
  return { id, title, goal, items, done, state: side ? 'side' : done === items.length && items.length > 0 ? 'done' : 'ahead', next: first ? first.label : '', nextHref: first?.href, short: SHORT()[id] ?? title };
}

export function learningPath(inst: Instrument, now = Date.now()): Stage[] {
  const secs = (b: number): string => L(`${b < 10 ? b.toFixed(1) : Math.round(b)} s`, `${b < 10 ? b.toFixed(1).replace('.', ',') : Math.round(b)} s`);
  const stages: Stage[] = [];
  if (inst === 'voice') {
    const cents = (b: number): string => L(`${Math.round(b)} cents`, `${Math.round(b)} Cent`);
    const s = store.settings;
    const measured = !!(s.voiceLow && s.voiceHigh);
    const range: PathItem = { label: L('Your range, measured', 'Dein Umfang, gemessen'), state: measured ? 'done' : 'new', rusty: false, note: measured ? L(`${noteName(s.voiceLow)} to ${noteName(s.voiceHigh)}`, `${noteName(s.voiceLow)} bis ${noteName(s.voiceHigh)}`) : '', href: '#/range' };
    stages.push(
      stage('vfirst', L('Your voice, found and in tune', 'Deine Stimme, gefunden und treffsicher'), L('Your range measured; tones sung back within 40 cents on average (a semitone is 100); a tone held for five seconds within 28.', 'Dein Umfang gemessen; Töne im Schnitt auf 40 Cent genau nachgesungen (ein Halbton sind 100); ein Ton fünf Sekunden lang auf 28 Cent ruhig gehalten.'), [
        range,
        skillItem('pitch:match', L('Tones sung back', 'Nachgesungene Töne'), 2, cents, now, '#/match'),
        skillItem('tone:steady', L('A tone held steady', 'Ein ruhig gehaltener Ton'), 2, cents, now, '#/hold'),
      ]),
    );
    stages.push(stage('vpatterns', L('Steps and leaps, sung', 'Schritte und Sprünge, gesungen'), L('Each pattern sung on pitch, one note after the other, at 60 notes a minute: a note a second.', 'Jedes Muster sauber gesungen, ein Ton nach dem anderen, mit 60 Tönen pro Minute: ein Ton pro Sekunde.'), VOICE_PATTERNS.map((p) => skillItem(`sing:${p.id}`, p.name, 3, (v) => L(`${Math.round(v)} a minute`, `${Math.round(v)} pro Minute`), now, '#/run/sing'))));
    const songs = songsToSing().map((x) => ({ x, prof: voiceProfile(x) }));
    const begunSong = (id: string): boolean => Object.keys(store.skills.data).some((k) => k.startsWith(`bar:${id}:`));
    const songStage = (level: number, title: string): Stage => {
      const pool = songs.filter((y) => y.prof.level === level);
      const fin = pool.filter((y) => finished('voice', y.x.id));
      const begun = pool.filter((y) => !fin.includes(y) && (y.x.id === store.current.voice || begunSong(y.x.id)));
      const fresh = pool.filter((y) => !fin.includes(y) && !begun.includes(y));
      const want = Math.min(SONGS_PER_STAGE, pool.length);
      return stage(
        `vsongs${level}`,
        title,
        L(`${want === SONGS_PER_STAGE ? 'Five' : 'All'} of the ${pool.length} ${LEVELS[level].toLowerCase()} songs sung on pitch at full speed, whichever you like.`, `${want === SONGS_PER_STAGE ? 'Fünf der' : 'Alle'} ${pool.length} ${LEVEL_ADJ_DE[level]} Songs sauber im vollen Tempo gesungen; welche, suchst du dir aus.`),
        [...fin, ...begun, ...fresh].slice(0, want).map((y): PathItem => ({ label: y.x.title, state: fin.includes(y) ? 'done' : begun.includes(y) ? 'work' : 'new', rusty: false, note: y.prof.reasons[0], href: `#/sing/${encodeURIComponent(y.x.id)}` })),
      );
    };
    stages.push(songStage(1, L('Easy songs: within an octave, in steps', 'Leichte Songs: innerhalb einer Oktave, in Schritten')));
    stages.push(songStage(2, L('Moderate songs: wider, with leaps', 'Mittlere Songs: weiter, mit Sprüngen')));
    stages.push(songStage(3, L('Demanding songs: wide leaps, quicker', 'Anspruchsvolle Songs: weite Sprünge, schneller')));
    stages.push(songStage(4, L('Hard songs: wide, quick, notes outside the key', 'Schwere Songs: weit, schnell, Töne außerhalb der Tonart')));
    stages.push(stage('vfine', L('Nearer and steadier', 'Genauer und ruhiger'), L('Tones sung back within 18 cents, a tone held within 14: where most listeners no longer hear a difference. A matter of months.', 'Töne auf 18 Cent genau nachgesungen, ein Ton auf 14 Cent ruhig gehalten: Dort hören die meisten keinen Unterschied mehr. Eine Sache von Monaten.'), [skillItem('pitch:match', L('Tones sung back', 'Nachgesungene Töne'), 4, cents, now, '#/match'), skillItem('tone:steady', L('A tone held steady', 'Ein ruhig gehaltener Ton'), 4, cents, now, '#/hold')], true));
    stages.push(stage('vscale', L('The sung scale', 'Die gesungene Tonleiter'), L('Eight notes up, each held on pitch: the Mute at the end of a voice run.', 'Acht Töne hinauf, jeder sauber gehalten: die Stille am Ende einer Stimmrunde.'), [skillItem('scale:v.major', L('Major scale, sung', 'Dur-Tonleiter, gesungen'), 1, secs, now, '#/run/sing')], true));
  } else if (inst === 'piano') {
    const bpm = (b: number): string => `${Math.round(b)} bpm`;
    const hand = (left: boolean): PathItem[] => PIANO_PATTERNS.map((p) => skillItem(`finger:${p.id}${left ? '-left' : ''}`, L(`${p.name}${left ? ', left hand' : ', right hand'}`, `${p.name}${left ? ', linke Hand' : ', rechte Hand'}`), 3, bpm, now, '#/run/keys'));
    const chord = (id: string): PathItem => skillItem(chordKey(id, true), chordName(id, true), 1, (b) => L(`${secs(b)} from cold`, `${secs(b)} aus dem Stand`), now, `#/keys/${encodeURIComponent(id)}`);
    const pieces = piecesByDifficulty()
      .filter((p) => !p.of)
      .map((p) => ({ p, prof: pieceProfile(p) }));
    const begun = new Set(Object.keys(store.skills.data).filter((k) => k.startsWith('bar:')).map((k) => k.split(':')[1]));
    const piece = (x: (typeof pieces)[number]): PathItem => {
      const fin = finished('piano', x.p.id);
      const kind = x.prof.kind === 'melody' ? L('a tune', 'eine Melodie') : x.prof.kind === 'chords' ? L('chords', 'Akkorde') : L('broken chords', 'gebrochene Akkorde');
      return { label: x.p.title, state: fin ? 'done' : begun.has(x.p.id) ? 'work' : 'new', rusty: false, note: kind, href: `#/piano/${encodeURIComponent(x.p.id)}` };
    };
    /** A level of the piano book as a stage: five of its pieces played through, whichever the player likes. */
    const pieceStage = (level: number, title: string): Stage => {
      const pool = pieces.filter((x) => x.prof.level === level);
      const fin = pool.filter((x) => finished('piano', x.p.id));
      const work = pool.filter((x) => !fin.includes(x) && (x.p.id === store.current.piano || begun.has(x.p.id)));
      const fresh = pool.filter((x) => !fin.includes(x) && !work.includes(x));
      const want = Math.min(SONGS_PER_STAGE, pool.length);
      return stage(`pieces${level}`, title, L(`${want === SONGS_PER_STAGE ? 'Five' : 'All'} of the ${pool.length} ${LEVELS[level].toLowerCase()} pieces played clean at full speed, whichever you like.`, `${want === SONGS_PER_STAGE ? 'Fünf der' : 'Alle'} ${pool.length} ${LEVEL_ADJ_DE[level]} Stücke sauber in vollem Tempo gespielt; welche, suchst du dir aus.`), [...fin, ...work, ...fresh].slice(0, want).map(piece));
    };
    const first = KEY_PAIRS.filter(([a, b]) => KEY_CHORDS.includes(a) && KEY_CHORDS.includes(b));
    stages.push(stage('hands', L('Five fingers, each hand', 'Fünf Finger, jede Hand'), L('Each pattern even and clean at 100 beats a minute, with the right hand and with the left.', 'Jedes Muster gleichmäßig und sauber bei 100 Schlägen pro Minute, mit der rechten Hand und mit der linken.'), [...hand(false), ...hand(true)]));
    stages.push(stage('chords', L('The first six chords ring', 'Die ersten sechs Akkorde klingen'), L('Three white keys each, found without looking for long: the base of most songs.', 'Je drei weiße Tasten, ohne langes Suchen gefunden: die Grundlage der meisten Songs.'), KEY_CHORDS.map(chord)));
    stages.push(stage('kchanges', L('Changes without stopping', 'Wechsel ohne Anhalten'), L('30 clean changes a minute between two chords is enough to keep a song going; 60 and the change no longer needs practice.', '30 saubere Wechsel pro Minute zwischen zwei Akkorden reichen, damit ein Song weiterläuft; bei 60 muss der Wechsel nicht mehr geübt werden.'), first.map(([a, b]) => skillItem(pairKey(a, b, true), `${chordName(a, true)} → ${chordName(b, true)}`, 3, (v) => L(`${Math.round(v)} a minute`, `${Math.round(v)} pro Minute`), now, '#/run/kchanges'))));
    stages.push(pieceStage(1, L('Easy pieces: one hand position, a few white-key chords', 'Leichte Stücke: eine Handposition, ein paar Akkorde auf weißen Tasten')));
    stages.push(pieceStage(2, L('Moderate pieces: the hand moves, more chords', 'Mittlere Stücke: die Hand wandert, mehr Akkorde')));
    stages.push(pieceStage(3, L('Demanding pieces: black keys, broken chords, quicker', 'Anspruchsvolle Stücke: schwarze Tasten, gebrochene Akkorde, schneller')));
    stages.push(pieceStage(4, L('Hard pieces: many chords, quick and wide', 'Schwere Stücke: viele Akkorde, schnell und weit')));
    stages.push(stage('scales', L('Scales', 'Tonleitern'), L('Every key ringing on, thumb passing under.', 'Jede Taste klingt weiter, mit Daumenuntersatz.'), PIANO_SCALES.map((s) => skillItem(`scale:${s.id}`, s.name, 1, secs, now, '#/run/keys/1')), true));
    stages.push(stage('morekeys', L('Chords with black keys and sevenths', 'Akkorde mit schwarzen Tasten und Septimen'), L('A black key in the middle, a fourth key, a shape that starts on a black key: they come with the songs that need them.', 'Eine schwarze Taste in der Mitte, eine vierte Taste, ein Griff, der auf einer schwarzen Taste beginnt: Sie kommen mit den Songs, die sie brauchen.'), KEY_CHORDS_ON.map(chord), true));
  } else {
    const chord = (id: string): PathItem => skillItem(`chord:${id}`, CHORDS[id].name, 1, (b) => L(`${secs(b)} from cold`, `${secs(b)} aus dem Stand`), now, `#/chord/${encodeURIComponent(id)}`);
    const pairs = CHORD_PAIRS.filter(([a, b]) => chordWeight(a) === 0 && chordWeight(b) === 0);
    const songs = songsByDifficulty().map((s) => ({ s, prof: songProfile(s) }));
    const song = (x: (typeof songs)[number]): PathItem => {
      const fin = finished('guitar', x.s.id);
      const begun = Object.keys(store.skills.data).some((k) => k.startsWith(`bar:${x.s.id}:`));
      return { label: x.s.title, state: fin ? 'done' : begun ? 'work' : 'new', rusty: false, note: LEVELS[x.prof.level].toLowerCase(), href: `#/song/${encodeURIComponent(x.s.id)}` };
    };
    /**
     * A level of the songbook as a stage: five of its songs played through, whichever the player likes.
     * Shown are the ones that are done, then the ones begun, then the easiest that are still new.
     */
    const songStage = (level: number, title: string): Stage => {
      const pool = songs.filter((x) => x.prof.level === level && !x.s.of);
      const fin = pool.filter((x) => finished('guitar', x.s.id));
      const begun = pool.filter((x) => !fin.includes(x) && (x.s.id === store.current.guitar || Object.keys(store.skills.data).some((k) => k.startsWith(`bar:${x.s.id}:`))));
      const fresh = pool.filter((x) => !fin.includes(x) && !begun.includes(x));
      const want = Math.min(SONGS_PER_STAGE, pool.length);
      return stage(`songs${level}`, title, L(`${want === SONGS_PER_STAGE ? 'Five' : 'All'} of the ${pool.length} ${LEVELS[level].toLowerCase()} songs played clean at full speed, whichever you like.`, `${want === SONGS_PER_STAGE ? 'Fünf der' : 'Alle'} ${pool.length} ${LEVEL_ADJ_DE[level]} Songs sauber in vollem Tempo gespielt; welche, suchst du dir aus.`), [...fin, ...begun, ...fresh].slice(0, want).map(song));
    };
    stages.push(stage('open', L('The eight open chords ring clean', 'Die acht offenen Akkorde klingen sauber'), L('Every string of each chord rings: the base of almost every song.', 'Jede Saite jedes Akkords klingt: die Grundlage fast jedes Songs.'), OPEN_CHORDS.map(chord)));
    stages.push(
      stage(
        'changes',
        L('Changes without stopping', 'Wechsel ohne Anhalten'),
        L('30 clean changes a minute between two chords is enough to keep a song going; 60 and the change no longer needs practice.', '30 saubere Wechsel pro Minute zwischen zwei Akkorden reichen, damit ein Song weiterläuft; bei 60 muss der Wechsel nicht mehr geübt werden.'),
        pairs.map(([a, b]) => skillItem(`pair:${a}>${b}`, `${CHORDS[a].name} → ${CHORDS[b].name}`, 3, (v) => L(`${Math.round(v)} a minute`, `${Math.round(v)} pro Minute`), now, '#/run/changes')),
      ),
    );
    stages.push(songStage(1, L('Easy songs: a few open chords, and slow tunes', 'Leichte Songs: ein paar offene Akkorde und langsame Melodien')));
    stages.push(songStage(2, L('Moderate songs: more chords, a strumming pattern', 'Mittlere Songs: mehr Akkorde, ein Schlagmuster')));
    stages.push(songStage(3, L('Demanding songs: the F chord, quick changes, picking', 'Anspruchsvolle Songs: der F-Akkord, schnelle Wechsel, Zupfen')));
    stages.push(songStage(4, L('Hard songs: barre chords one after the other', 'Schwere Songs: Barré-Akkorde, einer nach dem anderen')));
    stages.push(stage('barre', L('The barre ladder', 'Die Barré-Leiter'), L('From the small barre of F over the small shapes to the full F♯m and Bm. A matter of months: a few tries a day.', 'Vom kleinen Barré des F über die kleinen Griffe bis zum vollen F♯m und Bm. Eine Sache von Monaten: ein paar Versuche am Tag.'), BARRE_LADDER.map(chord), true));
    stages.push(stage('fingers', L('Independent fingers', 'Unabhängige Finger'), L('Each pattern clean at 100 beats a minute, one finger per fret.', 'Jedes Muster sauber bei 100 Schlägen pro Minute, ein Finger pro Bund.'), FINGER_PATTERNS.map((p) => skillItem(`finger:${p.id}`, p.name, 3, (b) => `${Math.round(b)} bpm`, now, '#/run/fingers')), true));
  }
  const here = stages.find((s) => s.state === 'ahead');
  if (here) here.state = 'here';
  return stages.filter((s) => s.items.length > 0);
}
