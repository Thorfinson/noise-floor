/** Everything that is kept between sessions lives in the browser's local storage, on this machine only. */
import type { PianoPiece, Song } from '../music/content';
import { dayOf, weekOf } from './days';
import { Skills, type SkillRecord } from './skills';

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
  /** when this was saved, to tell which of two copies (the browser's, a progress file's) is newer */
  savedAt: number;
}

const KEY = 'noise-floor/v1';
const DEFAULTS: Settings = { a4: 440, pianoA4: 440, buzz: 0.5, mic: true, deviceId: '', practiceInstrument: false, strumSelect: true, instrument: 'guitar', click: 0.5, clickSound: 'tick', chimes: 0.5, ring: 0.05, ringTypical: 0, smallShapes: true, mutePause: true, latency: -1, lang: '', voiceLow: 0, voiceHigh: 0, voiceTol: 50, weekGoal: 4, backing: false, uiScale: 1, leftHanded: false, capo: 0, tuning: 'standard', autoTempo: true, notation: 'strip', noteNames: 'auto', voiceHelp: 0, recordTakes: true };

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
  /** when what is held was last saved (ms) */
  savedAt!: number;
  /** called after every save: a progress file of the player's is written then (src/core/progressfile.ts) */
  onSaved?: () => void;
  /** the player's own count of slips against the app's, last ones */
  ratings!: SelfRating[];
  /** the recordings kept of each song: the first one made, and the latest (the sound itself is in IndexedDB) */
  takes!: Record<string, { first?: TakeMeta; last?: TakeMeta }>;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    let saved: Partial<Saved> = {};
    try {
      saved = JSON.parse(storage?.getItem(KEY) ?? '{}') as Partial<Saved>;
    } catch {
      saved = {};
    }
    this.load(saved);
  }

  private load(saved: Partial<Saved>): void {
    this.settings = { ...DEFAULTS, ...saved.settings };
    this.skills = new Skills(saved.skills ?? {});
    this.speeds = saved.speeds ?? {};
    this.best = saved.best ?? {};
    this.runs = saved.runs ?? [];
    this.sessions = saved.sessions ?? [];
    this.progress = saved.progress ?? {};
    this.songs = saved.songs ?? [];
    this.pieces = saved.pieces ?? [];
    this.current = saved.current ?? {};
    this.reviews = saved.reviews ?? {};
    this.favs = saved.favs ?? [];
    this.recent = saved.recent ?? {};
    this.practice = saved.practice ?? {};
    this.plan = saved.plan ?? null;
    this.ratings = saved.ratings ?? [];
    this.takes = saved.takes ?? {};
    this.planOff = saved.planOff ?? {};
    this.savedAt = saved.savedAt ?? 0;
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
   * it holds in memory may overwrite what another tab, or a backup loaded meanwhile, has saved.
   */
  savePractice(): void {
    try {
      const saved = JSON.parse(this.storage?.getItem(KEY) ?? '{}') as Partial<Saved>;
      saved.practice = this.practice;
      this.storage?.setItem(KEY, JSON.stringify(saved));
    } catch {
      // storage blocked: nothing is kept
    }
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
    return { settings: this.settings, skills: this.skills.data, speeds: this.speeds, best: this.best, runs: this.runs.slice(-40), sessions: this.sessions.slice(-400), progress: this.progress, songs: this.songs, pieces: this.pieces, current: this.current, reviews: this.reviews, favs: this.favs, recent: this.recent, practice: this.practice, plan: this.plan, ratings: this.ratings.slice(-30), takes: this.takes, planOff: this.planOff, savedAt: this.savedAt };
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

  /** Replaces everything with the contents of a backup. Returns false when the text is not one. */
  restore(text: string): boolean {
    try {
      const saved = JSON.parse(text) as Partial<Saved> & { app?: string };
      if (saved.app !== KEY || typeof saved.skills !== 'object' || saved.skills === null) return false;
      this.load(saved);
      this.save();
      return true;
    } catch {
      return false;
    }
  }

  lastRun(type: string): RunSummary | undefined {
    for (let i = this.runs.length - 1; i >= 0; i--) if (this.runs[i].type === type) return this.runs[i];
    return undefined;
  }
}

export const store = new Store(typeof localStorage === 'undefined' ? null : localStorage);
