/** Everything that is kept between sessions lives in the browser's local storage, on this machine only. */
import type { PianoPiece, Song } from '../music/content';
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
}

const KEY = 'noise-floor/v1';
const DEFAULTS: Settings = { a4: 440, pianoA4: 440, buzz: 0.5, mic: true, deviceId: '', practiceInstrument: false, strumSelect: true, instrument: 'guitar', click: 0.5, clickSound: 'tick', chimes: 0.5, ring: 0.05, ringTypical: 0, smallShapes: true, mutePause: true, latency: -1, lang: '', voiceLow: 0, voiceHigh: 0, voiceTol: 50 };

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
  }

  /** Days in a row with a finished session, counting today or, if today is still open, up to yesterday. */
  streak(now: number): number {
    const day = (t: number): number => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 86400000);
    const days = new Set(this.sessions.map(day));
    let d = day(now);
    if (!days.has(d)) d--;
    let n = 0;
    while (days.has(d - n)) n++;
    return n;
  }

  private snapshot(): Saved {
    return { settings: this.settings, skills: this.skills.data, speeds: this.speeds, best: this.best, runs: this.runs.slice(-40), sessions: this.sessions.slice(-400), progress: this.progress, songs: this.songs, pieces: this.pieces, current: this.current };
  }

  save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.snapshot()));
    } catch {
      // storage full or blocked: the session still works, it just will not be remembered
    }
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
