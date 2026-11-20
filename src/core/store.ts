/** Everything that is kept between sessions lives in the browser's local storage, on this machine only. */
import type { Bar, PianoNote, PianoPiece, Song, TabNote } from '../music/content';
import { dayOf, weekOf } from './days';
import { cleanSkills, Skills, type SkillRecord } from './skills';

export type Instrument = 'guitar' | 'piano' | 'voice';

export interface Settings {
  /** tuning reference in Hz for the guitar */
  a4: number;
  /** pitch of the piano's A; an old piano is often lower than 440 */
  pianoA4: number;
  /** how easily a string counts as buzzing, 0.2 (strict) to 1 (lenient) */
  buzz: number;
  /** use the microphone; when off, only the built-in practice instrument is heard */
  mic: boolean;
  /** which microphone; empty = the system's default */
  deviceId: string;
  /** show the practice instrument buttons */
  practiceInstrument: boolean;
  /** choose menu cards by strumming a chord or playing a key */
  strumSelect: boolean;
  /** the instrument today's session is for */
  instrument: Instrument;
  /** loudness of the metronome click, 0 (silent) to 1 */
  click: number;
  /** tick: high, the microphone may hear it; click: lower and easier on the ear, for headphones only */
  clickSound: 'tick' | 'click';
  /** loudness of the sounds of the games, 0 (silent) to 1 */
  chimes: number;
  /** how much of a note must be left after half a second for it to count as ringing, 0.03 to 0.4 */
  ring: number;
  /** how the user's own guitar rings when a string is clean, learned from the chord check; 0 = not yet */
  ringTypical: number;
  /** show small shapes for barre chords in songs and runs until the full shape is clean */
  smallShapes: boolean;
  /** pause a run by muting the strings twice */
  mutePause: boolean;
  /** seconds between a click and a note played on it arriving, learned while playing along; -1 = not yet */
  latency: number;
  /** the language the app speaks; empty until chosen, then the browser's is taken */
  lang: '' | 'en' | 'de';
  /** the lowest and highest note the voice held in the range test; 0 until it has been measured */
  voiceLow: number;
  voiceHigh: number;
  /** how far from a note still counts when singing, cents */
  voiceTol: number;
  /** on how many days of a week the player means to play: the week counts, not an unbroken chain of days */
  weekGoal: number;
  /** a soft bass and chords under playing along with the click, for headphones: the microphone must not hear it */
  backing: boolean;
  /**
   * The band under playing along (src/audio/band.ts): 'phones' the full band, for headphones; 'speakers' a band
   * arranged around what the microphone listens for, safe through speakers; 'click' no band, the click alone.
   */
  band: 'phones' | 'speakers' | 'click';
  /** how loud the band plays, 0..1 */
  bandVolume: number;
  /**
   * How strongly the speakers reach the microphone on this computer, in each frequency band the listener takes the
   * band off in (src/audio/echo.ts, ECHO_BANDS): learned by the speaker test (the hearing check). Empty until then.
   */
  bandCoupling: number[];
  /** everything larger, for reading from further away: 1, 1.15 or 1.3 */
  uiScale: number;
  /** chord pictures and the fretboard mirrored, for a guitar held the other way round */
  leftHanded: boolean;
  /** the fret the capo sits at, 0 without one */
  capo: number;
  /** standard, or the whole guitar a half or a whole step down (src/music/tuning.ts) */
  tuning: string;
  /** in a loop the tempo rises by itself after three clean runs in a row */
  autoTempo: boolean;
  /** the piano's music: the strip of note blocks, or the staff */
  notation: 'strip' | 'staff';
  /** on the staff, the names of the notes under them: until a phrase sits (auto), always, or never */
  noteNames: 'auto' | 'on' | 'off';
  /** how much a song to sing is helped: 0 the model and the line, 1 the line only, 2 neither (only the first note) */
  voiceHelp: number;
  /** takes at full speed are recorded and kept in this browser, to listen back to */
  recordTakes: boolean;
  /**
   * The instruments whose song lessons no longer open with the sheet on how a song is learned ("Don't show this
   * again" was left ticked). Replaced as a whole when it changes, never changed in place: the defaults share it.
   */
  lessonHowOff: Partial<Record<Instrument, boolean>>;
}

/** An old song coming back: when it is due again, and how far apart its visits have got. */
export interface Review {
  /** when it was first played clean at full speed all through */
  since: number;
  /** how many visits it has passed in a row; the gap to the next one grows with it */
  step: number;
  /** when it is to be played again */
  due: number;
  /** the line or phrase the next visit starts at, so that the visits go round the whole song */
  at: number;
  /** the last visit, and how it went */
  last?: number;
  ok?: boolean;
  /** the last visit fell apart: the next one goes back to playing with the click */
  relearn?: boolean;
}

/** When the player means to play: "after dinner, five minutes", made once and shown as a reminder of their own. */
export interface PracticePlan {
  /** what the playing follows: an everyday moment */
  cue: string;
  minutes: number;
  /** a time of day, "19:30", for the calendar entry; may be empty */
  time: string;
}

/** A recording of the player, kept in the browser: what it is of, and where in it each bar lies. */
export interface TakeMeta {
  t: number;
  /** length, seconds */
  secs: number;
  /** % of full speed it was played at */
  tempo: number;
  /** each bar (or phrase): where it lies in the recording, seconds, and whether the app heard it clean */
  bars: { bar: number; from: number; to: number; clean: boolean }[];
}

/** How a take was judged by the player before the app said how it heard it. */
export interface SelfRating {
  t: number;
  /** the slips the player counted */
  self: number;
  /** the bars the app heard go wrong */
  app: number;
}

export interface RunRow {
  key: string;
  label: string;
  sent: number;
  cleared: number;
  /** average seconds per cleared phrase, or per change */
  avg: number;
}

export interface RunSummary {
  t: number;
  type: string;
  score: number;
  wave: number;
  waves: number;
  rows: RunRow[];
}

/** The song of the week: which, and the day it was chosen (days counted as in core/days.ts). */
export interface WeekState {
  id: string;
  start: number;
}

/** The barre chord as a project: which shape, from which day, and the most strings that rang on each day. */
export interface BarreProject {
  chord: string;
  start: number;
  rings: Record<string, number>;
}

interface Saved {
  settings: Settings;
  skills: Record<string, SkillRecord>;
  speeds: Record<string, number>;
  best: Record<string, number>;
  runs: RunSummary[];
  sessions: number[];
  progress: Record<string, number>;
  songs: Song[];
  pieces: PianoPiece[];
  current: Partial<Record<Instrument, string>>;
  reviews: Record<string, Review>;
  favs: string[];
  recent: Partial<Record<Instrument, string[]>>;
  practice: Record<string, number>;
  plan: PracticePlan | null;
  ratings: SelfRating[];
  takes: Record<string, { first?: TakeMeta; last?: TakeMeta }>;
  planOff: Partial<Record<Instrument, string[]>>;
  /** the song of the week on each instrument: everything the session practises serves it (music/week.ts) */
  weeks: Partial<Record<Instrument, WeekState>>;
  /** the barre chord as a project of its own: two minutes a day, and how many strings rang on each day */
  barre: BarreProject | null;
  /** when this was saved, to tell which of two copies (the browser's, a progress file's) is newer */
  savedAt: number;
}

const KEY = 'noise-floor/v1';
/** Where saved data that could not be read is kept aside, so that the next save does not wipe it out. */
export const ASIDE_KEY = 'noise-floor/v1-unreadable';
const DEFAULTS: Settings = { a4: 440, pianoA4: 440, buzz: 0.5, mic: true, deviceId: '', practiceInstrument: false, strumSelect: true, instrument: 'guitar', click: 0.5, clickSound: 'tick', chimes: 0.5, ring: 0.05, ringTypical: 0, smallShapes: true, mutePause: true, latency: -1, lang: '', voiceLow: 0, voiceHigh: 0, voiceTol: 50, weekGoal: 4, backing: false, band: 'speakers', bandVolume: 0.7, bandCoupling: [], uiScale: 1, leftHanded: false, capo: 0, tuning: 'standard', autoTempo: true, notation: 'strip', noteNames: 'auto', voiceHelp: 0, recordTakes: true, lessonHowOff: {} };

/*
 * What is read back (from this browser, a backup or a progress file) is checked field by field before the app
 * uses it: a backup is a file anyone can write, and one field of the wrong type (songs as an object, a skill
 * that is null) would otherwise break every page on every start, or put markup into the page. A check gives
 * back the value when it has its type (objects copied, with only the fields the app knows), or undefined.
 */
type Check<T> = (v: unknown) => T | undefined;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num: Check<number> = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const within =
  (lo: number, hi: number): Check<number> =>
  (v) =>
    typeof v === 'number' && v >= lo && v <= hi ? v : undefined;
const positive: Check<number> = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
const count: Check<number> = (v) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined);
const str: Check<string> = (v) => (typeof v === 'string' ? v : undefined);
const bool: Check<boolean> = (v) => (typeof v === 'boolean' ? v : undefined);
/** the id of a song, a piece or a tuning: it goes into links and attributes, so letters, digits and - _ . ~ only */
const id: Check<string> = (v) => (typeof v === 'string' && /^[\w.~-]{1,100}$/.test(v) ? v : undefined);
const oneOf =
  <T extends string>(...xs: T[]): Check<T> =>
  (v) =>
    xs.includes(v as T) ? (v as T) : undefined;
/** A list: items that fail are left out, or with all, one that fails fails the list (the bars of a song). */
const list =
  <T>(item: Check<T>, all = false): Check<T[]> =>
  (v) => {
    if (!Array.isArray(v)) return undefined;
    const out: T[] = [];
    for (const x of v) {
      const c = item(x);
      if (c !== undefined) out.push(c);
      else if (all) return undefined;
    }
    return out;
  };
const some =
  <T>(c: Check<T[]>): Check<T[]> =>
  (v) => {
    const xs = c(v);
    return xs && xs.length ? xs : undefined;
  };
/** A record by name: entries that fail are left out. */
const dict =
  <T>(item: Check<T>): Check<Record<string, T>> =>
  (v) => {
    if (!isObj(v)) return undefined;
    const out: Record<string, T> = {};
    for (const [k, x] of Object.entries(v)) {
      const c = item(x);
      if (c !== undefined) out[k] = c;
    }
    return out;
  };
/**
 * An object of known fields, each with its check (the type asks for one for every field, so a field added
 * later cannot be forgotten here): the fields named in need must pass, the others are left out when they fail.
 */
const shape =
  <T>(fields: { [K in keyof T]-?: Check<T[K]> }, need: (keyof T)[] = []): Check<T> =>
  (v) => {
    if (!isObj(v)) return undefined;
    const out: Partial<T> = {};
    for (const k of Object.keys(fields) as (keyof T)[]) {
      const c = fields[k](v[k as string]);
      if (c !== undefined) out[k] = c;
      else if (need.includes(k)) return undefined;
    }
    return out as T;
  };
const all = <T>(fields: { [K in keyof T]-?: Check<T[K]> }): Check<T> => shape(fields, Object.keys(fields) as (keyof T)[]);

const tabNote: Check<TabNote> = shape<TabNote>({ s: within(0, 5), f: within(0, 30), fg: num, len: positive, more: (v) => list(tabNote, true)(v), strum: str, up: bool }, ['s', 'f']);
const bar = shape<Bar>({ chord: str, notes: list(tabNote, true), part: str, words: str }, ['notes']);
const wordRows: Check<string[][]> = (v) => (Array.isArray(v) && v.every((r) => Array.isArray(r) && r.every((x) => typeof x === 'string')) ? (v as string[][]) : undefined);
const song = shape<Song>({ id, title: str, by: str, noteDur: positive, beat: positive, bars: some(list(bar, true)), custom: bool, of: id, exercise: bool, guitarOnly: bool, form: list(str, true), verses: dict(wordRows) }, ['id', 'title', 'noteDur', 'beat', 'bars']);
const pianoNote = shape<PianoNote>({ midi: within(0, 127), fg: num, len: positive, chord: str, over: str, left: bool, bass: within(0, 127) }, ['midi']);
/** the parts of a piece line up with its phrases, so a phrase without one stays in the list (JSON makes it null) */
const parts: Check<(string | undefined)[]> = (v) => (Array.isArray(v) && v.every((x) => x === null || typeof x === 'string') ? v.map((x: string | null) => x ?? undefined) : undefined);
const pieceShape = shape<PianoPiece>(
  { id, title: str, by: str, kind: oneOf('melody', 'chords', 'broken'), of: id, hands: bool, parts, guitar: list(str, true), hand: str, noteDur: positive, beat: positive, phrases: some(list(some(list(pianoNote, true)), true)), count: positive, bar: positive, leads: list(num, true), custom: bool },
  ['id', 'title', 'noteDur', 'beat', 'phrases'],
);
const piece: Check<PianoPiece> = (v) => {
  const p = pieceShape(v);
  return p && { ...p, hand: p.hand ?? 'right hand' };
};
const SETTINGS: { [K in keyof Settings]-?: Check<Settings[K]> } = {
  // the range the tuner and the settings allow: a value outside it (an older version could save the A of a
  // capo or a lowered tuning, 493.9) is not kept, or the tuner would ask for every string sharp
  a4: within(415, 466),
  pianoA4: within(400, 470),
  buzz: within(0, 2),
  mic: bool,
  deviceId: str,
  practiceInstrument: bool,
  strumSelect: bool,
  instrument: oneOf('guitar', 'piano', 'voice'),
  click: within(0, 1),
  clickSound: oneOf('tick', 'click'),
  chimes: within(0, 1),
  ring: within(0, 1),
  ringTypical: within(0, 10),
  smallShapes: bool,
  mutePause: bool,
  latency: within(-1, 1),
  lang: oneOf('', 'en', 'de'),
  voiceLow: within(0, 127),
  voiceHigh: within(0, 127),
  voiceTol: within(1, 200),
  weekGoal: within(1, 7),
  backing: bool,
  band: oneOf('phones', 'speakers', 'click'),
  bandVolume: within(0, 1),
  bandCoupling: (v) => (Array.isArray(v) && v.length <= 32 && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e4) ? (v as number[]) : undefined),
  uiScale: within(1, 1.3),
  leftHanded: bool,
  capo: within(0, 12),
  tuning: id,
  autoTempo: bool,
  notation: oneOf('strip', 'staff'),
  noteNames: oneOf('auto', 'on', 'off'),
  voiceHelp: within(0, 2),
  recordTakes: bool,
  lessonHowOff: shape<Partial<Record<Instrument, boolean>>>({ guitar: bool, piano: bool, voice: bool }),
};
/** a number, or 0: the index of a recording is kept even when a field of it is broken, for the sound is still there */
const num0 = (v: unknown): number => num(v) ?? 0;
const takeMeta: Check<TakeMeta> = (v) =>
  isObj(v)
    ? {
        t: num0(v.t),
        secs: num0(v.secs),
        tempo: num0(v.tempo),
        bars: Array.isArray(v.bars) ? v.bars.filter(isObj).map((b) => ({ bar: num0(b.bar), from: num0(b.from), to: num0(b.to), clean: b.clean === true })) : [],
      }
    : undefined;
const perInstrument = <T>(c: Check<T>): Check<Partial<Record<Instrument, T>>> => shape<Partial<Record<Instrument, T>>>({ guitar: c, piano: c, voice: c });
const time: Check<string> = (v) => (typeof v === 'string' && /^(\d{1,2}:\d{2}(:\d{2})?)?$/.test(v) ? v : undefined);
const FIELDS: { [K in keyof Saved]-?: Check<Saved[K]> } = {
  settings: (v) => {
    const s = shape<Settings>(SETTINGS)(v);
    return s && { ...DEFAULTS, ...s };
  },
  skills: (v) => (isObj(v) ? cleanSkills(v) : undefined),
  speeds: dict(num),
  best: dict(num),
  runs: list(all<RunSummary>({ t: num, type: str, score: num, wave: num, waves: num, rows: list(all<RunRow>({ key: str, label: str, sent: num, cleared: num, avg: num })) })),
  sessions: list(num),
  progress: dict(num),
  songs: list(song),
  pieces: list(piece),
  current: perInstrument(id),
  reviews: dict(shape<Review>({ since: num, step: count, due: num, at: count, last: num, ok: bool, relearn: bool }, ['since', 'step', 'due', 'at'])),
  favs: list(str),
  recent: perInstrument(list(id)),
  practice: dict(num),
  plan: (v) => (v === null ? null : all<PracticePlan>({ cue: str, minutes: within(1, 600), time })(v)),
  ratings: list(all<SelfRating>({ t: num, self: num, app: num })),
  takes: dict(shape<{ first?: TakeMeta; last?: TakeMeta }>({ first: takeMeta, last: takeMeta })),
  planOff: perInstrument(list(str)),
  weeks: perInstrument(all<WeekState>({ id, start: num })),
  barre: (v) => (v === null ? null : all<BarreProject>({ chord: str, start: num, rings: dict(within(0, 6)) })(v)),
  savedAt: num,
};
/** What is kept when nothing was saved yet. */
const EMPTY = (): Saved => ({ settings: { ...DEFAULTS }, skills: {}, speeds: {}, best: {}, runs: [], sessions: [], progress: {}, songs: [], pieces: [], current: {}, reviews: {}, favs: [], recent: {}, practice: {}, plan: null, ratings: [], takes: {}, planOff: {}, weeks: {}, barre: null, savedAt: 0 });

/** Saved data checked field by field: every field that passes, defaults for the others, and the names of those that failed. */
function checkSaved(raw: unknown): { saved: Saved; failed: string[] } {
  const saved = EMPTY() as unknown as Record<string, unknown>;
  const failed: string[] = [];
  if (!isObj(raw)) return { saved: saved as unknown as Saved, failed: raw === undefined ? [] : ['all'] };
  for (const [k, check] of Object.entries(FIELDS) as [string, Check<unknown>][]) {
    if (raw[k] === undefined) continue;
    const v = check(raw[k]);
    if (v === undefined) failed.push(k);
    else saved[k] = v;
  }
  return { saved: saved as unknown as Saved, failed };
}

export class Store {
  settings!: Settings;
  skills!: Skills;
  /** speed in percent each kind of run starts at */
  speeds!: Record<string, number>;
  best!: Record<string, number>;
  runs!: RunSummary[];
  /** when each guided session was finished, ms */
  sessions!: number[];
  /** line or phrase to continue with, per song or piece */
  progress!: Record<string, number>;
  /** songs the user added */
  songs!: Song[];
  /** piano pieces the user added */
  pieces!: PianoPiece[];
  /** the song and the piece being learned */
  current!: Partial<Record<Instrument, string>>;
  /** songs played clean all through, and when each comes back; keyed "guitar:id", "piano:id", "voice:id" */
  reviews!: Record<string, Review>;
  /** songs marked as favourites, keyed like the reviews */
  favs!: string[];
  /** the songs opened last, newest first, per instrument */
  recent!: Partial<Record<Instrument, string[]>>;
  /** seconds spent playing, per local day (the day's number as the key) */
  practice!: Record<string, number>;
  /** when the player means to play */
  plan!: PracticePlan | null;
  /** the steps of the session the player has left out of their plan, per instrument (Step.kind) */
  planOff!: Partial<Record<Instrument, string[]>>;
  weeks!: Partial<Record<Instrument, WeekState>>;
  barre!: BarreProject | null;
  /** when what is held was last saved (ms) */
  savedAt!: number;
  /** called after every save: a progress file of the player's is written then (src/core/progressfile.ts) */
  onSaved?: () => void;
  /** the player's own count of slips against the app's, last ones */
  ratings!: SelfRating[];
  /** the recordings kept of each song: the first one made, and the latest (the sound itself is in IndexedDB) */
  takes!: Record<string, { first?: TakeMeta; last?: TakeMeta }>;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    let text: string | null = null;
    try {
      text = storage?.getItem(KEY) ?? null;
    } catch {
      // storage blocked: the app starts with nothing kept
    }
    let raw: unknown;
    try {
      raw = text === null ? undefined : JSON.parse(text);
    } catch {
      raw = null;
    }
    // what cannot be read, as a whole or in a part, is kept aside before the first save replaces it
    if (this.load(raw).length && text && text !== 'null') this.keepAside(text);
  }

  /** Takes what was saved, checked field by field; returns the fields that could not be used. */
  private load(raw: unknown): string[] {
    const { saved, failed } = checkSaved(raw);
    // the same settings and skills, refilled: a page that holds them goes on with what is read now
    if (this.settings) Object.assign(this.settings, saved.settings);
    else this.settings = saved.settings;
    if (this.skills) this.skills.data = saved.skills;
    else this.skills = new Skills(saved.skills);
    this.speeds = saved.speeds;
    this.best = saved.best;
    this.runs = saved.runs;
    this.sessions = saved.sessions;
    this.progress = saved.progress;
    this.songs = saved.songs;
    this.pieces = saved.pieces;
    this.current = saved.current;
    this.reviews = saved.reviews;
    this.favs = saved.favs;
    this.recent = saved.recent;
    this.practice = saved.practice;
    this.plan = saved.plan;
    this.ratings = saved.ratings;
    this.takes = saved.takes;
    this.planOff = saved.planOff;
    this.weeks = saved.weeks;
    this.barre = saved.barre;
    this.savedAt = saved.savedAt;
    return failed;
  }

  /** A copy of saved data the app could not read, under a key of its own: the first such copy is kept. */
  private keepAside(text: string): void {
    try {
      if (!this.storage?.getItem(ASIDE_KEY)) this.storage?.setItem(ASIDE_KEY, text);
    } catch {
      // storage full or blocked: nothing to keep it in
    }
  }

  /**
   * Another tab of the app has saved: this one takes what it saved, so that its own next save does not undo
   * the other's (last save wins otherwise, and a tab left open would overwrite a whole evening of another).
   * What this tab changed and has not saved yet is given up for it.
   */
  fromOtherTab(text: string | null): void {
    if (!text) return;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    if (isObj(raw)) this.load(raw);
  }

  /** Days in a row with a finished session, counting today or, if today is still open, up to yesterday. */
  streak(now: number): number {
    const days = this.playedDays();
    let d = dayOf(now);
    if (!days.has(d)) d--;
    let n = 0;
    while (days.has(d - n)) n++;
    return n;
  }

  /** Every local day on which something was played: a finished session, or time spent playing. */
  playedDays(): Set<number> {
    const days = new Set(this.sessions.map(dayOf));
    for (const [d, secs] of Object.entries(this.practice)) if (secs >= 60) days.add(Number(d));
    return days;
  }

  /** The days of the week a moment falls in (Monday to Sunday) on which something was played. */
  week(now: number): { played: boolean[]; count: number; goal: number } {
    const days = this.playedDays();
    const monday = weekOf(dayOf(now));
    const played = [0, 1, 2, 3, 4, 5, 6].map((k) => days.has(monday + k));
    return { played, count: played.filter(Boolean).length, goal: this.settings.weekGoal };
  }

  /**
   * Writes back only the time spent playing, into what is saved now: when a page is left, nothing else of what
   * it holds in memory may overwrite what another tab, or a backup loaded meanwhile, has saved. It is a save
   * all the same: the time of it moves on, and a progress file is written, so the last minutes before the app
   * is closed reach the file too.
   */
  savePractice(): void {
    this.savedAt = Date.now();
    try {
      const text = this.storage?.getItem(KEY) ?? null;
      let saved: unknown = null;
      try {
        saved = text === null ? null : JSON.parse(text);
      } catch {
        saved = null;
      }
      // nothing readable there to add to: what this tab holds is saved whole, and what was there kept aside
      if (!isObj(saved) && text) this.keepAside(text);
      const into: Record<string, unknown> = isObj(saved) ? saved : { ...this.snapshot() };
      into.practice = this.practice;
      into.savedAt = this.savedAt;
      this.storage?.setItem(KEY, JSON.stringify(into));
    } catch {
      // storage blocked: nothing is kept
    }
    this.onSaved?.();
  }

  /** Time spent playing is added to its day; kept for a year. */
  logPractice(seconds: number, now: number): void {
    if (!(seconds > 0)) return;
    const d = dayOf(now);
    this.practice[d] = Math.round((this.practice[d] ?? 0) + Math.min(seconds, 4 * 3600));
    for (const k of Object.keys(this.practice)) if (Number(k) < d - 400) delete this.practice[k];
  }

  /** A song was opened: it heads the list of the last ones. */
  opened(inst: Instrument, id: string): void {
    const list = (this.recent[inst] ?? []).filter((x) => x !== id);
    list.unshift(id);
    this.recent[inst] = list.slice(0, 12);
  }

  isFav(inst: Instrument, id: string): boolean {
    return this.favs.includes(`${inst}:${id}`);
  }

  toggleFav(inst: Instrument, id: string): boolean {
    const key = `${inst}:${id}`;
    const on = !this.favs.includes(key);
    this.favs = on ? [...this.favs, key] : this.favs.filter((x) => x !== key);
    return on;
  }

  private snapshot(): Saved {
    return { settings: this.settings, skills: this.skills.data, speeds: this.speeds, best: this.best, runs: this.runs.slice(-40), sessions: this.sessions.slice(-400), progress: this.progress, songs: this.songs, pieces: this.pieces, current: this.current, reviews: this.reviews, favs: this.favs, recent: this.recent, practice: this.practice, plan: this.plan, ratings: this.ratings.slice(-30), takes: this.takes, planOff: this.planOff, weeks: this.weeks, barre: this.barre, savedAt: this.savedAt };
  }

  save(): void {
    this.savedAt = Date.now();
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.snapshot()));
    } catch {
      // storage full or blocked: the session still works, it just will not be remembered
    }
    this.onSaved?.();
  }

  /** Everything that is saved, as text, for a backup file. */
  backup(): string {
    return JSON.stringify({ app: KEY, ...this.snapshot() }, null, 1);
  }

  /**
   * Replaces everything with the contents of a backup (or a progress file). Returns false when the text is not
   * one. A field of the wrong type is left out, not taken. What belongs to this computer stays as it is: its
   * microphone, how late its speakers' sound arrives and how strongly they reach the microphone, the size of its
   * type, and the index of its recordings (the sound of those is in this browser, and another computer's index
   * would not fit it).
   */
  restore(text: string): boolean {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return false;
    }
    if (!isObj(raw) || raw.app !== KEY || !isObj(raw.skills)) return false;
    const { latency, deviceId, uiScale, bandCoupling } = this.settings;
    const takes = this.takes;
    this.load(raw);
    Object.assign(this.settings, { latency, deviceId, uiScale, bandCoupling });
    this.takes = takes;
    this.save();
    return true;
  }

  lastRun(type: string): RunSummary | undefined {
    for (let i = this.runs.length - 1; i >= 0; i--) if (this.runs[i].type === type) return this.runs[i];
    return undefined;
  }
}

/** The browser's local storage; null where there is none, or where it is blocked (reading it can throw then). */
function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const store = new Store(local());

// another tab of the app saved: this one holds the same from now on
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) store.fromOtherTab(e.newValue);
  });
