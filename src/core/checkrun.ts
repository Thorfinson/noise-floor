/**
 * The hearing check without a screen: what is asked for, how each thing is judged, and what the result says.
 * It is driven by the listener's events and their times (not by the clock of the page), so the same check
 * runs live on the microphone, over a recording loaded from a file, and in the tests over real recordings.
 */
import type { ChordEvent, LevelEvent, NoteEvent, PitchEvent, ThudEvent } from '../audio/listener';
import { Listener } from '../audio/listener';
import { L } from './i18n';
import type { Instrument } from './store';
import { chordName, CHORDS, noteName, OPEN_STRINGS, STRING_FULL, stringName } from '../music/theory';

export type CheckKind = 'quiet' | 'note' | 'chord' | 'thud' | 'sung';
export interface CheckItem {
  kind: CheckKind;
  /** a note (midi) or a chord id */
  want: number | string;
  say: string;
}
export interface CheckOutcome {
  item: CheckItem;
  heard: string;
  right: boolean;
  /** cents off, for notes that were right */
  cents?: number;
  /** the loudest level while it was played, dB */
  peak: number;
}
export interface CheckSummary {
  right: number;
  of: number;
  /** the room on its own, and the instrument at its loudest (medians, dB) */
  roomDb: number;
  levelDb: number;
  /** how far out of tune on average, cents (negative: low) */
  centsOff: number;
  advice: string[];
}

/** How long the check waits for each thing before it counts it as not heard, and how long the quiet lasts. */
export const CHECK_WAIT = 10;
export const QUIET = 2.2;

/** What the check asks for on an instrument; for the voice five notes round the middle of its range. */
export function checkItems(inst: Instrument, voiceMiddle = 62): CheckItem[] {
  const items: CheckItem[] = [{ kind: 'quiet', want: 0, say: L('Quiet, please: two seconds of the room on its own.', 'Bitte still: zwei Sekunden nur der Raum.') }];
  if (inst === 'voice') {
    for (const m of [voiceMiddle - 4, voiceMiddle - 2, voiceMiddle, voiceMiddle + 2, voiceMiddle + 4]) items.push({ kind: 'sung', want: m, say: L(`Sing ${noteName(m)} and hold it.`, `Sing ${noteName(m)} und halte den Ton.`) });
  } else if (inst === 'piano') {
    for (const m of [60, 64, 67, 72, 57]) items.push({ kind: 'note', want: m, say: L(`Play ${noteName(m)}.`, `Spiel ${noteName(m)}.`) });
    for (const c of ['C', 'F', 'G']) items.push({ kind: 'chord', want: c, say: L(`Play the chord ${chordName(c, true)}: all its keys at once.`, `Spiel den Akkord ${chordName(c, true)}: alle Tasten zugleich.`) });
  } else {
    OPEN_STRINGS.forEach((m, s) => items.push({ kind: 'note', want: m, say: L(`Pluck the open ${STRING_FULL[s]} string.`, `Zupf die leere ${stringName(s)}.`) }));
    for (const c of ['Em', 'Am', 'C', 'G']) items.push({ kind: 'chord', want: c, say: L(`Strum ${CHORDS[c].name}.`, `Schlag ${CHORDS[c].name} an.`) });
    items.push({ kind: 'thud', want: 0, say: L('The hand flat on the strings, and strike them: a muted hit.', 'Die Hand flach auf die Saiten, und schlag sie an: ein gedämpfter Anschlag.') });
  }
  return items;
}

/** The candidates the listener compares chords with during the check. */
export const checkChords = (inst: Instrument): string[] | null => (inst === 'piano' ? ['C', 'F', 'G', 'Am', 'Dm', 'Em'] : inst === 'voice' ? null : ['Em', 'Am', 'C', 'G', 'D', 'E', 'A', 'Dm']);

export class CheckRun {
  /** the thing on show; -1 before the start, items.length when done */
  at = -1;
  readonly outcomes: CheckOutcome[] = [];
  private since = 0;
  private now = 0;
  private peak = -100;
  private quiet: number[] = [];
  private held = 0;
  private lastMidi = -1;
  private lastCents = 0;

  constructor(
    readonly items: CheckItem[],
    private readonly piano: boolean,
    /** called whenever the thing on show changes or is judged */
    private readonly changed: () => void = () => undefined,
  ) {}

  get done(): boolean {
    return this.at >= this.items.length;
  }
  get current(): CheckItem | undefined {
    return this.items[this.at];
  }

  start(): void {
    this.outcomes.length = 0;
    this.quiet = [];
    this.at = -1;
    this.next();
  }

  private next(): void {
    this.at++;
    this.since = this.now;
    this.peak = -100;
    this.held = 0;
    this.lastMidi = -1;
    this.changed();
  }

  /** The thing on show is judged: heard right, heard as something else, or not heard. */
  settle(heard: string, right: boolean, cents?: number): void {
    const it = this.current;
    if (!it) return;
    this.outcomes.push({ item: it, heard, right, cents, peak: this.peak });
    this.next();
  }

  /** The listener's time moved on: the quiet ends, or a thing not heard in time is counted so. */
  tick(time: number): void {
    this.now = Math.max(this.now, time);
    const it = this.current;
    if (!it) return;
    if (it.kind === 'quiet' && this.now - this.since >= QUIET) this.next();
    else if (it.kind !== 'quiet' && this.now - this.since >= CHECK_WAIT) this.settle(L('nothing heard', 'nichts gehört'), false);
  }

  level(e: LevelEvent): void {
    this.tick(e.time);
    const it = this.current;
    if (!it) return;
    if (it.kind === 'quiet') this.quiet.push(e.db);
    else this.peak = Math.max(this.peak, e.db);
  }

  /**
   * Something heard that one of the next things asked for is (a recording goes on while the check waits, and a
   * player may skip one): the check moves on to it, the ones in between counted as not heard. True when it did.
   */
  private ahead(match: (it: CheckItem) => boolean): boolean {
    for (let j = this.at + 1; j <= this.at + 3 && j < this.items.length; j++)
      if (match(this.items[j])) {
        while (this.at < j) this.settle(L('nothing heard', 'nichts gehört'), false);
        return true;
      }
    return false;
  }

  note(e: NoteEvent): void {
    const it = this.current;
    if (!it || it.kind !== 'note' || e.time < this.since) return;
    if (e.midi !== Number(it.want) && this.ahead((x) => x.kind === 'note' && x.want === e.midi)) return this.settle(noteName(e.midi), true, this.lastCents);
    const want = Number(it.want);
    if (e.midi === want) this.settle(noteName(e.midi), true, this.lastCents);
    else if ((e.midi - want) % 12 === 0) this.settle(L(`${noteName(e.midi)}, an octave off`, `${noteName(e.midi)}, eine Oktave daneben`), false);
    else this.settle(noteName(e.midi), false);
  }

  chord(e: ChordEvent): void {
    const it = this.current;
    if (!it || it.kind !== 'chord' || e.time < this.since || !e.best || e.score < 0.6) return;
    if (e.best !== it.want && this.ahead((x) => x.kind === 'chord' && x.want === e.best)) return this.settle(chordName(e.best, this.piano), true);
    this.settle(chordName(e.best, this.piano), e.best === it.want);
  }

  thud(e: ThudEvent): void {
    const it = this.current;
    if (it?.kind === 'thud' && e.time >= this.since) this.settle(L('a muted hit', 'ein gedämpfter Anschlag'), true);
  }

  pitch(e: PitchEvent): void {
    this.lastCents = Math.round(e.cents);
    const it = this.current;
    if (!it || e.time < this.since) return;
    const m = Math.round(e.midi + e.cents / 100);
    this.held = m === this.lastMidi ? this.held + 1 : 1;
    this.lastMidi = m;
    if (it.kind === 'sung' && this.held >= 12) {
      const want = Number(it.want);
      if (m === want) this.settle(noteName(m), true, Math.round((e.midi - want) * 100 + e.cents));
      else this.settle((m - want) % 12 === 0 ? L(`${noteName(m)}, an octave off`, `${noteName(m)}, eine Oktave daneben`) : noteName(m), (m - want) % 12 === 0);
    }
  }

  /** What the check found, and what to change. */
  summary(inst: Instrument): CheckSummary {
    const right = this.outcomes.filter((o) => o.right).length;
    const of = this.outcomes.length;
    const median = (xs: number[]): number => (xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : -100);
    const roomDb = median(this.quiet);
    const levelDb = median(this.outcomes.filter((o) => o.peak > -100).map((o) => o.peak));
    const cents = this.outcomes.filter((o) => o.cents !== undefined).map((o) => o.cents!);
    const off = cents.length ? Math.round(cents.reduce((a, b) => a + b, 0) / cents.length) : 0;
    const octave = this.outcomes.some((o) => !o.right && /octave|Oktave/.test(o.heard));
    const advice: string[] = [];
    if (roomDb > -45) advice.push(L('The room is loud for the microphone: a quieter room, or the microphone nearer the instrument and away from fans and the computer.', 'Der Raum ist laut für das Mikrofon: ein ruhigerer Raum, oder das Mikrofon näher am Instrument und weg von Lüftern und vom Computer.'));
    if (levelDb < -32) advice.push(L('The instrument reaches the microphone quietly: move it nearer (about a metre or less), or raise the microphone level in the system settings.', 'Das Instrument kommt leise beim Mikrofon an: Rück näher heran (etwa einen Meter oder weniger), oder heb den Mikrofonpegel in den Systemeinstellungen an.'));
    if (levelDb > -4) advice.push(L('The instrument comes in close to the top: move back a little, or lower the microphone level.', 'Das Instrument kommt fast am Anschlag an: Rück etwas weg, oder senk den Mikrofonpegel.'));
    if (Math.abs(off) >= 15)
      advice.push(
        inst === 'piano'
          ? L(`Your piano is about ${Math.abs(off)} cents ${off < 0 ? 'low' : 'high'}: let the app measure its A (Tools → Piano pitch).`, `Dein Klavier liegt etwa ${Math.abs(off)} Cent zu ${off < 0 ? 'tief' : 'hoch'}: Lass die App sein A messen (Werkzeuge → Tonhöhe des Klaviers).`)
          : inst === 'voice'
            ? L(`You sang about ${Math.abs(off)} cents ${off < 0 ? 'low' : 'high'} on average: Match the tone helps.`, `Du hast im Schnitt etwa ${Math.abs(off)} Cent zu ${off < 0 ? 'tief' : 'hoch'} gesungen: Töne treffen hilft.`)
            : L(`The guitar is about ${Math.abs(off)} cents ${off < 0 ? 'low' : 'high'}: tune it first (the tuner), or set the app to it there (A = 440 Hz is only one of many).`, `Die Gitarre liegt etwa ${Math.abs(off)} Cent zu ${off < 0 ? 'tief' : 'hoch'}: Stimm sie zuerst (Stimmgerät), oder stell die App dort auf sie ein.`),
      );
    if (octave) advice.push(L('Some notes were heard an octave off: the microphone hears more of an overtone than of the note; nearer, or another place for the microphone, helps.', 'Manche Töne wurden eine Oktave daneben gehört: Das Mikrofon hört dann mehr von einem Oberton als vom Ton; näher, oder eine andere Stelle für das Mikrofon, hilft.'));
    if (!advice.length && right < of) advice.push(L('What was not heard right: play it once more, a little firmer, and let it ring. If one thing keeps failing, save the check and send it to whoever helps you.', 'Was nicht richtig gehört wurde: Spiel es noch einmal, etwas kräftiger, und lass es klingen. Wenn eine Sache immer wieder scheitert, speichere den Check und schick ihn an jemanden, der dir hilft.'));
    return { right, of, roomDb, levelDb, centsOff: off, advice };
  }
}

/** The listener set up as the check sets it up live: the instrument's ears, pitch followed, the chords to tell apart. */
export function checkListener(sr: number, inst: Instrument, a4: number): Listener {
  const l = new Listener(sr);
  l.a4 = inst === 'voice' ? 440 : a4;
  if (inst === 'voice') {
    l.noteDetection = false;
    l.pitchClarity = 0.7;
    l.buzzThreshold = Infinity;
  } else if (inst === 'piano') {
    l.buzzThreshold = Infinity;
    l.ringThreshold = 0.05;
    l.voicing = 'piano';
  }
  l.pitchTracking = true;
  l.chordCandidates = checkChords(inst);
  return l;
}

/** The check over a recording: the same things asked for, in order, judged as the sound goes by. */
export function checkRecording(samples: Float32Array, sr: number, inst: Instrument, a4: number, items = checkItems(inst)): { run: CheckRun; summary: CheckSummary } {
  const run = new CheckRun(items, inst === 'piano');
  const l = checkListener(sr, inst, a4);
  l.onLevel = (e) => run.level(e);
  l.onNote = (e) => run.note(e);
  l.onChord = (e) => run.chord(e);
  l.onThud = (e) => run.thud(e);
  l.onPitch = (e) => run.pitch(e);
  run.start();
  for (let i = 0; i < samples.length && !run.done; i += 512) {
    l.push(samples.subarray(i, i + 512));
    run.tick((i + 512) / sr);
  }
  // what the recording did not reach counts as not heard
  while (!run.done) run.settle(L('nothing heard', 'nichts gehört'), false);
  return { run, summary: run.summary(inst) };
}
