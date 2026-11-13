/**
 * Noise Floor: the rules of a run, with no drawing and no audio in here.
 * Pieces of noise come toward the lamp of a lighthouse. Each carries a phrase (notes to play, or two chords
 * to change between). Playing the phrase clean destroys it; what reaches the lamp dims it. The view feeds in
 * what the microphone heard. In here the way to the lamp is a number that grows (y, up to LAND_Y), from the
 * time when the noise fell from the top of the screen; the picture is free to show it as it likes.
 */
import type { StringResult } from '../audio/listener';
import { barKey, CHORD_PAIRS, FINGER_PATTERNS, KEY_PAIRS, noteTimes, patternNotes, phraseKey, PIANO_PATTERNS, PIANO_PIECES, PIANO_POSITIONS, PIANO_SCALES, positionNotes, SONGS, stepMidis, type PianoNote, type PianoPiece, type Song, type TabNote } from '../music/content';
import { chordName, CHORDS, chordsAlike, keysAlike, noteName, OPEN_STRINGS, STRING_FULL, STRING_NAMES } from '../music/theory';
import { L } from '../core/i18n';

/** fingers, changes and song are played on the guitar; keys, kchanges (chord changes) and piece on the piano; sing (sung patterns) and ssong (a song) with the voice */
export type RunType = 'fingers' | 'changes' | 'song' | 'keys' | 'piece' | 'kchanges' | 'sing' | 'ssong';
export const isPianoRun = (type: RunType): boolean => type === 'keys' || type === 'piece' || type === 'kchanges';
export const isVoiceRun = (type: RunType): boolean => type === 'sing' || type === 'ssong';

export interface Phrase {
  /** skill this phrase measures, e.g. "pair:Em>F#m" */
  key: string;
  label: string;
  /** name in the debrief; phrases that measure the same skill share it */
  stat: string;
  /** tab: plucked on the guitar; keys: played on the piano; chg: two chords strummed in turn */
  kind: 'tab' | 'chg' | 'keys';
  /** pitches that count for each step (tab and keys) */
  midis: number[][];
  /** start of each step in note units */
  at: number[];
  notes: TabNote[];
  keys: PianoNote[];
  /** chord to hold while picking (song phrases) */
  chord?: string;
  /** fret of the index finger (finger patterns) */
  position?: number;
  /** hand and its place on the keyboard (piano patterns) */
  hand?: 'right' | 'left';
  place?: string;
  pair?: [string, string];
  /** a change between chords on the piano: the chords are their keys, struck together */
  piano?: boolean;
  /** sung: any octave counts, and the steps carry their names in the scale (do, re, mi) */
  voice?: boolean;
  words?: string[];
  /** seconds per note unit at full speed (song and piece phrases) */
  noteDur: number;
}

/** A change phrase is strummed a, b, a, b, a: four changes. */
const CHANGE_STRUMS = 5;

const tabPhrase = (p: Pick<Phrase, 'key' | 'label' | 'stat' | 'notes' | 'noteDur'> & Partial<Phrase>): Phrase => ({ kind: 'tab', keys: [], midis: p.notes.map(stepMidis), at: noteTimes(p.notes).at, ...p });
const keysPhrase = (p: Pick<Phrase, 'key' | 'label' | 'stat' | 'keys' | 'noteDur'> & Partial<Phrase>): Phrase => ({ kind: 'keys', notes: [], midis: p.keys.map((k) => [k.midi]), at: noteTimes(p.keys).at, ...p });
const changePhrase = (a: string, b: string, piano = false): Phrase => {
  const label = `${chordName(a, piano)} → ${chordName(b, piano)}`;
  return { key: `pair:${piano ? 'p.' : ''}${a}>${b}`, label, stat: label, kind: 'chg', notes: [], keys: [], midis: [], at: [], pair: [a, b], noteDur: 0, ...(piano ? { piano } : {}) };
};

/**
 * Phrases of a piece for the piano: its phrases of single keys (a long one in two halves, so that there is
 * time for it before it lands), and the chord changes of the phrases whose chords are struck as a whole.
 */
function piecePool(piece: PianoPiece): Phrase[] {
  const out: Phrase[] = [];
  const seen = new Set<string>();
  const struck: string[] = [];
  piece.phrases.forEach((keys, i) => {
    if (keys.every((k) => k.chord)) {
      for (const k of keys) if (k.chord !== struck[struck.length - 1]) struck.push(k.chord!);
      return;
    }
    const key = phraseKey(piece, i);
    if (seen.has(key)) return;
    seen.add(key);
    const half = Math.ceil(keys.length / 2);
    const parts = keys.length > 10 ? [keys.slice(0, half), keys.slice(half)] : [keys];
    parts.forEach((part, h) => out.push(keysPhrase({ key, label: `PHRASE ${i + 1}${parts.length > 1 ? 'ab'[h] : ''}`, stat: `Phrase ${i + 1}`, keys: part, noteDur: piece.noteDur, hand: 'right' })));
  });
  for (let i = 0; i + 1 < struck.length; i++) {
    const [a, b] = [struck[i], struck[i + 1]];
    // the same two chords the other way round are the same change
    const [x, y] = KEY_PAIRS.find(([p, q]) => (p === a && q === b) || (p === b && q === a)) ?? [a, b];
    if (seen.has(`pair:p.${x}>${y}`) || seen.has(`pair:p.${y}>${x}`)) continue;
    // two chords with nearly the same keys (C and Cmaj7) cannot be told apart by ear alone
    if (keysAlike(a, b) >= 0.8) continue;
    seen.add(`pair:p.${x}>${y}`);
    out.push(changePhrase(x, y, true));
  }
  return out;
}

/** Phrases of a song: its picked bars (short bars joined until there are four notes), and the chord changes of its strummed bars. */
function songPool(song: Song): Phrase[] {
  const out: Phrase[] = [];
  const seen = new Set<string>();
  const add = (p: Phrase): void => {
    if (seen.has(p.key)) return;
    seen.add(p.key);
    out.push(p);
  };
  const strummed: string[] = [];
  for (let i = 0; i < song.bars.length; i++) {
    const bar = song.bars[i];
    if (bar.notes.some((n) => n.strum)) {
      for (const n of bar.notes) if (n.strum && n.strum !== strummed[strummed.length - 1]) strummed.push(n.strum);
      continue;
    }
    let notes = bar.notes;
    let last = i;
    while (!bar.chord && notes.length < 4 && last + 1 < song.bars.length && !song.bars[last + 1].chord && !song.bars[last + 1].notes.some((n) => n.strum)) notes = [...notes, ...song.bars[++last].notes];
    if (notes.length < 2) continue;
    const where = bar.chord ? ` ${i + 1} · ${CHORDS[bar.chord].name}` : last > i ? `s ${i + 1}–${last + 1}` : ` ${i + 1}`;
    // in German the plural is its own word: Takt, Takte
    const wo = bar.chord ? ` ${i + 1} · ${CHORDS[bar.chord].name}` : last > i ? ` ${i + 1}–${last + 1}` : ` ${i + 1}`;
    const many = !bar.chord && last > i;
    add(tabPhrase({ key: barKey(song, i), label: L('BAR' + where, (many ? 'TAKTE' : 'TAKT') + wo), stat: L('Bar' + where, (many ? 'Takte' : 'Takt') + wo), notes, chord: bar.chord, noteDur: song.noteDur }));
    i = last;
  }
  for (let i = 0; i + 1 < strummed.length; i++) {
    const [a, b] = [strummed[i], strummed[i + 1]];
    // the same two chords the other way round are the same change
    const known = CHORD_PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (seen.has(`pair:${b}>${a}`)) continue;
    // two chords made of nearly the same notes (D and Dsus4) cannot be told apart by ear alone: not a change to drill by microphone
    if (chordsAlike(CHORDS[a], CHORDS[b]) >= 0.8) continue;
    add(known ? changePhrase(known[0], known[1]) : changePhrase(a, b));
  }
  return out;
}

/**
 * The patterns of the voice gym, in the order singing is learned: a step and back, a third and back, the
 * chord (do, mi, sol), five notes up, five down, and thirds. Degrees of the major scale, counted from 0.
 */
export const VOICE_PATTERNS: { id: string; readonly name: string; steps: number[] }[] = [
  { id: 'step', get name() { return L('Step', 'Schritt'); }, steps: [0, 1, 0] },
  { id: 'third', get name() { return L('Third', 'Terz'); }, steps: [0, 2, 0] },
  { id: 'chord', get name() { return L('Do-mi-sol', 'Do-mi-sol'); }, steps: [0, 2, 4, 2, 0] },
  { id: 'up', get name() { return L('Five up', 'Fünf aufwärts'); }, steps: [0, 1, 2, 3, 4] },
  { id: 'down', get name() { return L('Five down', 'Fünf abwärts'); }, steps: [4, 3, 2, 1, 0] },
  { id: 'thirds', get name() { return L('Thirds', 'Terzen'); }, steps: [0, 2, 1, 3, 2, 4] },
];
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const SOLFA = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti', 'do'];

/**
 * Where the voice gym sits in a voice: three keys a whole tone apart, the middle one with its third (mi) on
 * the middle of the range, where a voice is most at home; the highest note of a pattern is the fifth (sol).
 */
export function voiceKeys(low: number, high: number): number[] {
  const mid = Math.round((low + high) / 2);
  const root = Math.max(low + 2, Math.min(high - 9, mid - 4));
  const keys = [root - 2, root, root + 2].filter((r) => r >= low + 1 && r + 7 <= high - 1);
  // a narrow voice: the one key that fits best
  return keys.length ? keys : [root];
}

/** Sung patterns in this voice: every pattern in every key. */
export function voicePool(low: number, high: number): Phrase[] {
  const roots = voiceKeys(low, high);
  return VOICE_PATTERNS.flatMap((p) =>
    roots.map((r) =>
      keysPhrase({
        key: `sing:${p.id}`,
        label: `${p.name.toUpperCase()} · ${noteName(r).replace(/\d+$/, '')}`,
        stat: p.name,
        keys: p.steps.map((s) => ({ midi: r + MAJOR[s] })),
        noteDur: 0,
        voice: true,
        words: p.steps.map((s) => SOLFA[s]),
      }),
    ),
  );
}

/** The phrases of a song to sing, moved into the voice: the long ones in halves, the same ones once. */
export function sungPool(s: { phrases: { midi: number; len?: number }[][]; noteDur: number }, shift: number, keyOf: (k: number) => string): Phrase[] {
  const out: Phrase[] = [];
  const seen = new Set<string>();
  s.phrases.forEach((ph, i) => {
    const key = keyOf(i);
    if (seen.has(key)) return;
    seen.add(key);
    const half = Math.ceil(ph.length / 2);
    const parts = ph.length > 10 ? [ph.slice(0, half), ph.slice(half)] : [ph];
    parts.forEach((part, h) => out.push(keysPhrase({ key, label: L(`PHRASE ${i + 1}${parts.length > 1 ? 'ab'[h] : ''}`, `PHRASE ${i + 1}${parts.length > 1 ? 'ab'[h] : ''}`), stat: `Phrase ${i + 1}`, keys: part.map((n) => ({ midi: n.midi + shift, ...(n.len ? { len: n.len } : {}) })), noteDur: s.noteDur, voice: true })));
  });
  return out;
}

/** The Mute of the voice: a major scale sung up, an octave in the middle of the range, one seal for each note. */
export function voiceScaleBoss(low: number, high: number): BossSpec {
  const root = Math.max(low + 1, Math.min(high - 13, Math.round((low + high) / 2) - 6));
  return { key: 'scale:v.major', name: L(`Sung scale from ${noteName(root).replace(/\d+$/, '')}`, `Gesungene Tonleiter ab ${noteName(root).replace(/\d+$/, '')}`), steps: MAJOR.map((d, i) => ({ midi: root + d, label: SOLFA[i] })) };
}

export function poolFor(type: RunType, material?: Song | PianoPiece): Phrase[] {
  if (type === 'song') return songPool((material as Song | undefined) ?? SONGS[0]);
  if (type === 'piece') return piecePool((material as PianoPiece | undefined) ?? PIANO_PIECES[0]);
  if (type === 'kchanges') return KEY_PAIRS.map(([a, b]) => changePhrase(a, b, true));
  if (type === 'keys') {
    return PIANO_PATTERNS.flatMap((p) =>
      PIANO_POSITIONS.map((pos) => {
        const left = pos.hand === 'left';
        return keysPhrase({ key: `finger:${p.id}${left ? '-left' : ''}`, label: L(`${p.name.toUpperCase()} · ${pos.id[0]}${left ? ' LEFT' : ''}`, `${p.name.toUpperCase()} · ${pos.id[0]}${left ? ' LINKS' : ''}`), stat: L(`${p.name}${left ? ', left hand' : ''}`, `${p.name}${left ? ', linke Hand' : ''}`), keys: positionNotes(p, pos), noteDur: 0, hand: pos.hand, place: pos.name });
      }),
    );
  }
  if (type === 'fingers') {
    return FINGER_PATTERNS.flatMap((p) => [0, 1, 2, 3, 4, 5].map((s) => tabPhrase({ key: `finger:${p.id}`, label: `${p.name.toUpperCase()} · ${STRING_FULL[s].toUpperCase()}`, stat: p.name, notes: patternNotes(p, s), position: 5, noteDur: 0 })));
  }
  return CHORD_PAIRS.map(([a, b]) => changePhrase(a, b));
}

export interface Foe {
  id: string;
  shape: number;
  phrase: Phrase;
  need: number;
  hit: number;
  x: number;
  y: number;
  v: number;
  startT: number;
  lastT: number;
  gaps: number[];
  misses: number;
  /** notes played while the one before was still sounding */
  rings: number;
  /** seconds it has rested on the floor line, before it counts as landed */
  down?: number;
}

export type RunEvent =
  | { type: 'hit'; id: string; x: number; y: number }
  | { type: 'clear'; id: string; x: number; y: number; label: string; key: string; value: number | null; bonus: string | null; gain: number }
  | { type: 'miss' }
  | { type: 'floor'; id: string; x: number }
  | { type: 'wave'; wave: number };

export interface Perk {
  id: string;
  tag: string;
  name: string;
  text: string;
  /** offered only in runs where it can do something */
  when?: (pool: Phrase[]) => boolean;
}

// the texts are getters: they are read when the upgrades are shown, in the language of that moment
export const PERKS: Perk[] = [
  { id: 'chain', get tag() { return L('Chains', 'Ketten'); }, get name() { return L('Long chain', 'Lange Kette'); }, get text() { return L('Your multiplier can climb to ×12 instead of ×8.', 'Dein Multiplikator kann bis ×12 steigen statt bis ×8.'); } },
  { id: 'slow', get tag() { return L('Time', 'Zeit'); }, get name() { return L('Heavy air', 'Schwere Luft'); }, get text() { return L('All noise comes in 15% slower for the rest of the run.', 'Alles Rauschen kommt für den Rest der Runde 15 % langsamer.'); } },
  { id: 'shield', get tag() { return L('Lamp', 'Lampe'); }, get name() { return L('Spare wick', 'Ersatzdocht'); }, get text() { return L('One more light in the lamp, now and as your maximum.', 'Ein Licht mehr in der Lampe, jetzt und als dein Höchstwert.'); } },
  { id: 'burst', get tag() { return L('Clean playing', 'Sauberes Spiel'); }, get name() { return L('Clean sweep', 'Reiner Tisch'); }, get text() { return L('Clearing a phrase without a wrong note also takes the first note off the next one.', 'Schaffst du eine Phrase ohne falschen Ton, ist bei der nächsten die erste Note schon erledigt.'); } },
  { id: 'grid', get tag() { return L('Timing', 'Timing'); }, get name() { return L('On the grid', 'Im Raster'); }, get text() { return L('Clear a phrase with every note evenly spaced and it scores double.', 'Schaffst du eine Phrase mit gleich großen Abständen zwischen allen Noten, zählt sie doppelt.'); } },
  { id: 'ring', get tag() { return L('Sustain', 'Nachklang'); }, get name() { return L('Let it ring', 'Klingen lassen'); }, get text() { return L('Clear a phrase with every note still sounding when the next one starts and it scores double.', 'Schaffst du eine Phrase und klingt jede Note noch, wenn die nächste beginnt, zählt sie doppelt.'); }, when: (pool) => pool.some((p) => (p.kind === 'keys' && !p.voice) || !!p.chord) },
  { id: 'change', get tag() { return L('Chord changes', 'Akkordwechsel'); }, get name() { return L('Quick change', 'Schneller Wechsel'); }, get text() { return L('A chord change in under 1.2 seconds scores double.', 'Ein Akkordwechsel in weniger als 1,2 Sekunden zählt doppelt.'); }, when: (pool) => pool.some((p) => p.kind === 'chg') },
];

/** What the boss asks for: notes that each have to ring clean, one after the other. */
export interface BossSpec {
  /** skill it measures: "chord:F#m" or "scale:C" */
  key: string;
  name: string;
  /** guitar bosses: the chord to hold */
  chord?: string;
  steps: { midi: number; label: string; string?: number; fg?: number }[];
}

/** A chord on the guitar, plucked string by string. */
export function chordBoss(id: string): BossSpec {
  const c = CHORDS[id];
  const steps = c.frets.map((f, s) => ({ midi: OPEN_STRINGS[s] + f, label: STRING_NAMES[s], string: s, f })).filter((x) => x.f >= 0);
  return { key: `chord:${id}`, name: c.name, chord: id, steps: steps.map(({ midi, label, string }) => ({ midi, label, string })) };
}

/** A scale on the piano, key by key. */
export function scaleBoss(id: string): BossSpec {
  const sc = PIANO_SCALES.find((x) => x.id === id) ?? PIANO_SCALES[0];
  return { key: `scale:${sc.id}`, name: sc.name, steps: sc.notes.map((n) => ({ midi: n.midi, label: noteName(n.midi).replace(/\d+$/, ''), fg: n.fg })) };
}

export interface Boss extends BossSpec {
  results: (StringResult | null)[];
  /** position in steps of the one to play now */
  at: number;
  tries: number;
  startT: number;
  endT: number;
}

export interface Stat {
  label: string;
  sent: number;
  cleared: number;
  /** seconds per cleared phrase (notes) or per change (chords) */
  times: number[];
  /** clean measurements in the unit of the skill */
  values: number[];
}

export interface Measurement {
  key: string;
  value: number;
  strings?: number;
}

export interface RunOptions {
  /** percent */
  speed: number;
  waves?: number;
  boss?: BossSpec | null;
  rng?: () => number;
}

export const FLOOR_Y = 392;
export const LAND_Y = 340;
/**
 * A piece that touches the floor line rests there this long before it counts as landed. The listener
 * names a note or strum a moment after it was played (a strum about a fifth of a second), so what was
 * played just before the piece touched down is still on its way.
 */
export const REST_ON_FLOOR = 0.3;
const SLOTS = [430, 770, 210, 1000, 590, 880, 330];
/** fall speed in units per second at 100%: about 20 seconds from the top to the floor */
const BASE_V = 18;
const MAX_ACTIVE = 4;

const median = (v: number[]): number => {
  const s = v.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export class Run {
  readonly type: RunType;
  readonly waves: number;
  readonly pool: Phrase[];
  state: 'playing' | 'perk' | 'boss' | 'over' | 'won' = 'playing';
  wave = 1;
  score = 0;
  mult = 1;
  chain = 0;
  bestChain = 0;
  integrity = 3;
  maxIntegrity = 3;
  speed: number;
  time = 0;
  foes: Foe[] = [];
  offered: Perk[] = [];
  perks = new Set<string>();
  boss: Boss | null = null;
  stats = new Map<string, Stat>();
  events: RunEvent[] = [];

  private readonly weight: (key: string) => number;
  private readonly rng: () => number;
  private readonly bossSpec: BossSpec | null;
  private quota: number;
  private spawned = 0;
  private nextSpawn = 0;
  private uid = 1;
  private slot = 0;
  private lockId: string | null = null;

  constructor(type: RunType, pool: Phrase[], weight: (key: string) => number, opts: RunOptions) {
    this.type = type;
    this.pool = pool;
    this.weight = weight;
    this.rng = opts.rng ?? Math.random;
    this.speed = opts.speed;
    this.waves = opts.waves ?? 6;
    this.bossSpec = opts.boss ?? null;
    this.quota = this.quotaFor(1);
  }

  private quotaFor(wave: number): number {
    return 4 + wave;
  }

  /** Advance time. Noise falls, new noise appears, the wave ends when all of it is gone. */
  update(dt: number): void {
    if (this.state !== 'playing') return;
    this.time += dt;
    for (const f of this.foes) {
      if (f.y + f.v * dt < LAND_Y) f.y += f.v * dt;
      else {
        f.y = LAND_Y;
        f.down = (f.down ?? 0) + dt;
      }
    }
    for (const f of this.foes.filter((g) => (g.down ?? 0) >= REST_ON_FLOOR)) this.land(f);
    if (this.state !== 'playing') return;
    if (this.spawned < this.quota && this.foes.length < this.crowd() && this.time >= this.nextSpawn) this.spawn();
    if (this.spawned >= this.quota && this.foes.length === 0) this.endWave();
  }

  /**
   * How many pieces of noise are in the air at once. The first wave is a warm-up, one piece at a time, with
   * the whole fall for each phrase; then two, and four in the last waves.
   */
  private crowd(): number {
    return this.wave === 1 ? 1 : Math.min(MAX_ACTIVE, 1 + Math.ceil(this.wave / 2));
  }

  private spawn(): void {
    const active = new Set(this.foes.map((f) => f.phrase.label));
    const options = this.pool.filter((p) => !active.has(p.label));
    const from = options.length ? options : this.pool;
    let total = 0;
    for (const p of from) total += this.weight(p.key);
    let pick = this.rng() * total;
    let phrase = from[from.length - 1];
    for (const p of from) {
      pick -= this.weight(p.key);
      if (pick <= 0) {
        phrase = p;
        break;
      }
    }
    const n = this.uid++;
    const names = [L('HISS', 'ZISCHEN'), L('HUM', 'BRUMMEN'), L('CRACKLE', 'KNISTERN'), L('STATIC', 'STÖRUNG')];
    const slow = this.perks.has('slow') ? 0.85 : 1;
    // a long phrase needs more time than a short one: it falls a little slower
    const long = phrase.kind === 'chg' ? 1 : Math.min(1, 7 / Math.max(4, phrase.midis.length));
    this.foes.push({
      id: `${names[n % 4]}-${String(n).padStart(2, '0')}`,
      shape: n % 4,
      phrase,
      need: phrase.kind === 'chg' ? CHANGE_STRUMS : phrase.midis.length,
      hit: 0,
      x: SLOTS[this.slot++ % SLOTS.length],
      y: this.spawned === 0 && this.wave === 1 ? 120 : -40,
      v: BASE_V * (this.speed / 100) * (1 + 0.05 * (this.wave - 1)) * slow * long,
      startT: 0,
      lastT: 0,
      gaps: [],
      misses: 0,
      rings: 0,
    });
    this.spawned++;
    const stat = this.stat(phrase);
    stat.sent++;
    // there is always something to play: a cleared piece is replaced as soon as this pause is over
    this.nextSpawn = this.time + 1.5;
  }

  private stat(p: Phrase): Stat {
    let s = this.stats.get(p.key);
    if (!s) this.stats.set(p.key, (s = { label: p.stat, sent: 0, cleared: 0, times: [], values: [] }));
    return s;
  }

  /** The piece of noise you are playing: the one you chose, otherwise the lowest. */
  locked(): Foe | null {
    if (!this.foes.length) return null;
    const chosen = this.lockId ? this.foes.find((f) => f.id === this.lockId) : undefined;
    return chosen ?? this.foes.reduce((a, b) => (b.y > a.y ? b : a));
  }

  /** The one that locks after the current one. */
  nextUp(): Foe | null {
    const l = this.locked();
    const rest = this.foes.filter((f) => f !== l);
    return rest.length ? rest.reduce((a, b) => (b.y > a.y ? b : a)) : null;
  }

  /** Chord a change phrase wants next. */
  static target(f: Foe): string {
    const [a, b] = f.phrase.pair!;
    return f.hit % 2 === 0 ? a : b;
  }

  /** Notes that would be a hit right now, for the listener's benefit of the doubt. */
  expectedMidis(): number[] {
    return this.foes.filter((f) => f.phrase.kind !== 'chg').flatMap((f) => f.phrase.midis[f.hit]);
  }

  /** The chords that would be a hit right now, the one of the piece being played first. */
  wanted(): string[] {
    return [...new Set(this.inLockOrder().filter((f) => f.phrase.kind === 'chg').map((f) => Run.target(f)))];
  }

  /** Chords the listener has to tell apart right now. */
  chordIds(): string[] {
    const ids = new Set<string>();
    for (const f of this.foes) if (f.phrase.kind === 'chg') f.phrase.pair!.forEach((c) => ids.add(c));
    return [...ids];
  }

  private inLockOrder(): Foe[] {
    const l = this.locked();
    return l ? [l, ...this.foes.filter((f) => f !== l).sort((a, b) => b.y - a.y)] : [];
  }

  /**
   * A note was heard. held says how much of the note before it was still sounding (see the listener).
   * Returns true when it was a hit.
   */
  note(midi: number, t: number, held = -1): boolean {
    if (this.state !== 'playing') return false;
    const foe = this.inLockOrder().find((f) => f.phrase.kind !== 'chg' && f.phrase.midis[f.hit].includes(midi));
    if (!foe) {
      if (this.foes.some((f) => f.phrase.kind !== 'chg')) this.miss();
      return false;
    }
    // on recordings of a real guitar a ringing string still has 6% to 90% of its strength when the next
    // note comes, a damped one nothing
    if (foe.hit > 0 && held >= 0.05) foe.rings++;
    this.hit(foe, t);
    return true;
  }

  /** A strummed chord was heard. Returns true when it was a hit. */
  chord(id: string, t: number): boolean {
    if (this.state !== 'playing') return false;
    const foe = this.inLockOrder().find((f) => f.phrase.kind === 'chg' && Run.target(f) === id);
    if (!foe) {
      if (this.foes.some((f) => f.phrase.kind === 'chg')) this.miss();
      return false;
    }
    this.hit(foe, t);
    return true;
  }

  private hit(f: Foe, t: number): void {
    this.lockId = f.id;
    if (f.hit === 0) f.startT = t;
    else f.gaps.push(t - f.lastT);
    f.lastT = t;
    f.hit++;
    this.chain++;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.mult = Math.min(this.perks.has('chain') ? 12 : 8, 1 + Math.floor(this.chain / 6));
    const quick = f.phrase.kind === 'chg' && this.perks.has('change') && f.gaps.length > 0 && f.gaps[f.gaps.length - 1] < 1.2;
    this.score += 10 * this.mult * (quick ? 2 : 1);
    this.events.push({ type: 'hit', id: f.id, x: f.x, y: f.y });
    if (f.hit >= f.need) this.clear(f, t);
  }

  /** Were the notes evenly spaced, allowing for their written lengths? Every gap within a quarter of the middle one. */
  private static even(f: Foe): boolean {
    const at = f.phrase.at;
    const rel = f.gaps.map((g, i) => (f.phrase.kind === 'chg' ? g : g / Math.max(0.25, at[i + 1] - at[i])));
    if (rel.length < 2) return false;
    const mid = median(rel);
    return mid > 0 && rel.every((g) => Math.abs(g - mid) <= 0.25 * mid);
  }

  private clear(f: Foe, t: number): void {
    this.foes = this.foes.filter((g) => g !== f);
    this.lockId = null;
    const p = f.phrase;
    const stat = this.stat(p);
    stat.cleared++;
    const dur = t - f.startT;
    const steps = f.need - 1;
    let value: number | null = null;
    if (p.kind === 'chg') {
      const avg = f.gaps.reduce((a, b) => a + b, 0) / f.gaps.length;
      stat.times.push(avg);
      if (!f.misses) value = 60 / avg;
    } else if (dur > 0) {
      stat.times.push(dur);
      // song bars and piece phrases: share of full speed; finger patterns: tempo with two notes to the beat
      const units = p.at[p.at.length - 1] - p.at[0];
      if (!f.misses) value = p.noteDur > 0 ? ((units * p.noteDur) / dur) * 100 : p.voice ? (steps / dur) * 60 : (steps / dur) * 30;
    }
    if (value !== null) stat.values.push(value);
    let bonus: string | null = null;
    if (this.perks.has('ring') && !p.voice && (p.kind === 'keys' || p.chord) && f.rings >= steps && steps > 0) bonus = L('RINGING', 'NACHKLANG');
    if (this.perks.has('grid') && Run.even(f)) bonus = bonus ? bonus + L(' · ON THE GRID', ' · IM RASTER') : L('ON THE GRID', 'IM RASTER');
    const gain = 60 * this.mult * (bonus ? (bonus.includes('·') ? 3 : 2) : 1);
    this.score += gain;
    // The speed follows the player. A clean piece that was gone in the upper half of its fall says there
    // is room for more; one that got within a fifth of the line says it is too fast, clean or not. In
    // between it stays: a run is meant to be played at the edge of what goes well, not lost.
    if (f.y > 0.8 * LAND_Y) this.speed = Math.max(40, this.speed - 3);
    else if (!f.misses && f.y < 0.55 * LAND_Y) this.speed = Math.min(140, this.speed + 2);
    this.events.push({ type: 'clear', id: f.id, x: f.x, y: f.y, label: p.label, key: p.key, value, bonus, gain });
    if (!f.misses && this.perks.has('burst')) {
      const next = this.locked();
      if (next && next.hit === 0 && next.need > 2) next.hit = 1;
    }
  }

  private miss(): void {
    this.chain = 0;
    this.mult = 1;
    const l = this.locked();
    if (l) l.misses++;
    this.events.push({ type: 'miss' });
  }

  private land(f: Foe): void {
    this.foes = this.foes.filter((g) => g !== f);
    if (this.lockId === f.id) this.lockId = null;
    this.integrity--;
    this.chain = 0;
    this.mult = 1;
    this.speed = Math.max(40, this.speed - 6);
    this.events.push({ type: 'floor', id: f.id, x: f.x });
    if (this.integrity <= 0) this.state = 'over';
  }

  private endWave(): void {
    if (this.wave >= this.waves) {
      if (this.bossSpec) this.startBoss();
      else this.state = 'won';
      return;
    }
    const options = PERKS.filter((p) => !this.perks.has(p.id) && (!p.when || p.when(this.pool)) && !(p.id === 'shield' && this.maxIntegrity >= 4));
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    this.offered = options.slice(0, 3);
    this.state = this.offered.length ? 'perk' : 'playing';
    if (!this.offered.length) this.nextWave();
  }

  /** Take one of the offered upgrades and start the next wave. */
  choosePerk(id: string): void {
    if (this.state !== 'perk' || !this.offered.some((p) => p.id === id)) return;
    this.perks.add(id);
    if (id === 'shield') {
      this.maxIntegrity = 4;
      this.integrity = Math.min(4, this.integrity + 1);
    }
    this.state = 'playing';
    this.nextWave();
  }

  private nextWave(): void {
    this.wave++;
    this.quota = this.quotaFor(this.wave);
    this.spawned = 0;
    this.nextSpawn = this.time;
    this.events.push({ type: 'wave', wave: this.wave });
  }

  private startBoss(): void {
    const spec = this.bossSpec!;
    this.boss = { ...spec, results: spec.steps.map(() => null), at: 0, tries: 0, startT: -1, endT: -1 };
    this.state = 'boss';
  }

  /** Result of the string or key the boss is waiting for. */
  bossString(result: StringResult, t: number): void {
    const b = this.boss;
    if (this.state !== 'boss' || !b) return;
    if (b.startT < 0) b.startT = t;
    b.results[b.at] = result;
    if (result === 'clean') {
      this.score += 150 * this.mult;
      b.at++;
      if (b.at >= b.steps.length) {
        b.endT = t;
        this.state = 'won';
      }
    } else b.tries++;
  }

  /** Leave the boss with what has been achieved. */
  bossGiveUp(): void {
    if (this.state === 'boss') this.state = 'won';
  }

  /** What this run proved, for the skill levels. One value per skill: the middle of its clean attempts. */
  measurements(): Measurement[] {
    const out: Measurement[] = [];
    for (const [key, s] of this.stats) if (s.values.length) out.push({ key, value: median(s.values) });
    const b = this.boss;
    if (b && b.startT >= 0) {
      const clean = b.results.filter((r) => r === 'clean').length;
      const all = clean === b.steps.length;
      out.push({ key: b.key, value: all ? b.endT - b.startT : Infinity, strings: all ? 6 : Math.min(5, Math.round((clean / b.steps.length) * 6)) });
    }
    return out;
  }
}
