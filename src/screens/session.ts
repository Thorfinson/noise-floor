/**
 * Today's session: the app leads. On the guitar: tune up, check the chord you are working on, a short
 * run of chord changes, then the song. On the piano: match the app to the piano's pitch, then what the
 * piece of the day needs (a short run for the fingers before a tune; its chords key by key and their
 * changes before a piece of chords), then the piece. With the voice: the range measured the first time,
 * afterwards a held tone to warm up; then tones sung back, a short game of sung patterns, and the song.
 * Each step moves on by itself when its goal is reached, and "Next step" is always there.
 */
import { dayOf } from '../core/days';
import { L } from '../core/i18n';
import { kindOf, type SkillRecord } from '../core/skills';
import { store, type Instrument } from '../core/store';
import { allPieces, allSongs, findSong, KEY_CHORDS, shapeOf, type Song } from '../music/content';
import { chordKey, chordWeight, currentPiece, currentSong, currentSongToSing, finished, LEVELS, pieceProfile, piecesByDifficulty, readiness, songProfile, songsByDifficulty, type Profile } from '../music/difficulty';
import { songsToSing, voiceProfile } from '../music/voicebook';
import { holdTone, pitchMatch, rangeMeasured, singLesson, voiceRangeTest } from './sing';
import { dueReviews, syncReviews } from '../music/review';
import { LYRICS } from '../music/lyrics';
import { OPEN_CHORDS } from '../music/path';
import { chordName, CHORDS } from '../music/theory';
import { $, esc, keys, stopAllLater, type Screen, type SessionCtx } from '../ui/dom';
import { cleanStrings, skillLabel } from '../music/labels';
import { describe, pieceMaterial, songMaterial, type Material } from '../music/material';
import { pianoLesson, songLesson } from './learn';
import { chordCheck } from './chordcheck';
import { hearFirst } from './songpage';
import { withIntro } from './basics';
import { changeDrill } from './changes';
import { keyCheck } from './keys';
import { nfRun, weakestChange } from './nf';
import { tuner } from './tuner';
import { earTraining, motifSource } from './ear';
import { weekLine } from './habit';
import { strumTrainer } from './strum';
import { groove } from './groove';
import { nightRun } from './nightrun';
import { weekSummary } from './today';
import { arcOf, lineParam, nextLabel, weekOf, type Arc } from '../music/week';
import { pairKey } from '../music/difficulty';
import { repertoire } from '../music/review';
import { STRUM_PATTERNS, strumKey, strumPatternOf } from '../music/strums';


/** The chords, in the shapes the app shows, that today's two lines of the song hold. */
export function songChords(): string[] {
  const m = songMaterial(currentSong());
  const line = Math.min(m.lines.length - 1, store.progress[m.id] ?? 0);
  // every chord that is held or strummed there, also the second one of a bar that two chords share
  const ids = [line, line + 1].flatMap((k) => [...(m.lines[k]?.bars ?? []).map((b) => m.chordOf(b)), ...(m.lines[k]?.steps ?? []).map((s) => s.chord)]);
  return [...new Set(ids.filter((c): c is string => !!c && !!CHORDS[c]).map((c) => shapeOf(c).id))];
}

/**
 * The hard chord to work on, if any: a barre chord that today's lines of the song need and that does not
 * ring yet, otherwise the first barre chord that is not solid (its small shape first).
 */
export function barreChord(): string | null {
  const small = store.settings.smallShapes;
  const ladder: [string, number][] = [...(small ? ([['F#m-easy', 2]] as [string, number][]) : []), ['F#m', 3], ['F', 3], ...(small ? ([['Bm-easy', 2]] as [string, number][]) : []), ['Bm', 3]];
  const needed = songChords().find((c) => chordWeight(c) >= 2 && store.skills.level('chord:' + c) < 1);
  return needed ?? ladder.find(([c, level]) => store.skills.level('chord:' + c) < level)?.[0] ?? null;
}

/** The chord to work on, for the chord check outside the session: the barre chord, otherwise the weakest. */
export function focusChord(): string {
  return barreChord() ?? [...new Set([...songChords(), ...OPEN_CHORDS])].reduce((a, b) => (store.skills.level('chord:' + b) < store.skills.level('chord:' + a) ? b : a));
}

/** Piano: the chords that today's two phrases of the piece are made of. */
export function pieceChords(): string[] {
  const m = pieceMaterial(currentPiece());
  const line = Math.min(m.lines.length - 1, store.progress[m.id] ?? 0);
  const ids = [line, line + 1].flatMap((k) => (m.lines[k]?.steps ?? []).map((s) => s.chord ?? s.over));
  return [...new Set(ids.filter((c): c is string => !!c))];
}

/**
 * Piano: the chords of today's chord check, at most three. First the ones today's phrases need and that
 * have not rung clean yet, then the six first chords that are new, then the ones that need it most.
 */
export function todaysKeyChords(now = Date.now()): string[] {
  const fresh = (c: string): boolean => store.skills.level(chordKey(c, true)) < 1;
  const out = pieceChords().filter(fresh);
  for (const c of KEY_CHORDS) if (fresh(c) && !out.includes(c)) out.push(c);
  const known = [...new Set([...pieceChords(), ...KEY_CHORDS])].filter((c) => !out.includes(c));
  const due = known.filter((c) => store.skills.due(chordKey(c, true), now)).sort((a, b) => (store.skills.get(chordKey(a, true))?.last ?? 0) - (store.skills.get(chordKey(b, true))?.last ?? 0));
  const again = known.filter((c) => !due.includes(c)).sort((a, b) => store.skills.weight(chordKey(b, true), now) - store.skills.weight(chordKey(a, true), now));
  return [...out, ...due, ...again].slice(0, 3);
}

export { dayOf };

/** Has today's session on this instrument been taken to its end? */
export const doneToday = (inst: Instrument, now = Date.now()): boolean => store.progress[`session:${inst}:done`] === dayOf(now);

/** Which instrument a skill belongs to, from its key: the piano's have "p." or are pieces of the piano book, the voice's are sung. */
export function instrumentOf(key: string): Instrument {
  const [kind, a = ''] = key.split(':');
  if (kind === 'pitch' || kind === 'tone' || kind === 'sing' || a.startsWith('v.') || a.endsWith('~voice')) return 'voice';
  if (a.startsWith('p.') || a.startsWith('piano') || (kind === 'scale' && !a.startsWith('v.')) || a.includes('~keys') || PIANO_IDS().has(a)) return 'piano';
  return 'guitar';
}
const PIANO_IDS = (): Set<string> => new Set(allPieces().map((p) => p.id));

/** The step today's session was left at, counted from 0; 0 when it has not been begun today or is through. */
export function resumeAt(inst: Instrument, now = Date.now()): number {
  return store.progress[`session:${inst}:day`] === dayOf(now) ? (store.progress[`session:${inst}:step`] ?? 0) : 0;
}

/** The song or piece today's session works on. */
export const currentId = (inst: Instrument): string => (inst === 'voice' ? currentSongToSing().id : inst === 'piano' ? currentPiece().id : currentSong().id);

/** What a song to sing asks for, in a few words: as the guitar's songs and the piano's pieces are described. */
/** The next songs as buttons, the one chosen pressed: the player picks, or leaves the app's proposal. */
export function chooseRow(choices: { id: string; title: string; why: string }[], chosen: string): string {
  if (choices.length < 2) return '';
  return `<div class="choose" role="group" aria-label="${L('Choose the next song', 'Den nächsten Song wählen')}"><p class="k">${L('Or choose it yourself', 'Oder wähl ihn selbst')}</p><div class="cards3">${choices
    .map((c) => `<button class="pick" data-choose="${esc(c.id)}" aria-pressed="${c.id === chosen}"><b>${esc(c.title)}</b><small>${esc(c.why)}</small></button>`)
    .join('')}</div></div>`;
}

/** Makes the choice buttons choose: the song becomes the one the session works on. */
export function bindChoose(root: HTMLElement, inst: Instrument, then: (c: { id: string; title: string }) => void): void {
  root.querySelectorAll<HTMLButtonElement>('[data-choose]').forEach(
    (b) =>
      (b.onclick = () => {
        store.current[inst] = b.dataset.choose!;
        store.save();
        root.querySelectorAll('[data-choose]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        then({ id: b.dataset.choose!, title: b.querySelector('b')?.textContent ?? '' });
      }),
  );
}

/** Has work on this song begun: has any of its bars or phrases been measured? */
export const begun = (id: string): boolean => Object.keys(store.skills.data).some((k) => k.startsWith(`bar:${id}:`));

/**
 * The next songs to choose from: the easiest that is not finished (the one the app would take), and up to two
 * others near it, of another kind or ringing already, each with what it asks. Choosing between a few next
 * steps is part of what keeps a learner going; the app still proposes one.
 */
export function songChoices(inst: Instrument, count = 3): { id: string; title: string; why: string }[] {
  if (inst === 'voice') {
    const order = songsToSing().filter((s) => !finished('voice', s.id));
    const words = order.filter((s) => LYRICS[s.id]);
    const picks = [order[0], words.find((s) => s !== order[0]), ...order.slice(1)].filter((s, i, a): s is (typeof order)[number] => !!s && a.indexOf(s) === i).slice(0, count);
    return picks.map((s) => ({ id: s.id, title: s.title, why: [LEVELS[voiceProfile(s).level], LYRICS[s.id] ? L('with words', 'mit Text') : L('in solfège', 'in Solmisation')].join(' · ') }));
  }
  const piano = inst === 'piano';
  const items = (piano ? piecesByDifficulty().filter((p) => !p.of) : songsByDifficulty().filter((s) => !s.exercise))
    .filter((x) => !finished(inst, x.id))
    .slice(0, 14)
    .map((x) => ({ x, p: piano ? pieceProfile(x as never) : songProfile(x as never) }));
  if (!items.length) return [];
  const fresh = (p: Profile): string[] => (p.chords.length ? readiness(p).fresh : []);
  const first = items[0];
  const other = items.slice(1).find((it) => it.p.kind !== first.p.kind && fresh(it.p).length <= 1);
  const rings = items.slice(1).find((it) => it !== other && it.p.chords.length > 0 && fresh(it.p).length === 0);
  const picks = [first, other, rings, ...items.slice(1)].filter((it, i, a): it is (typeof items)[number] => !!it && a.indexOf(it) === i).slice(0, count);
  const kindSaid = (k: string): string => ({ strummed: L('chords to strum', 'Akkorde zum Anschlagen'), picked: L('picking', 'Zupfen'), melody: L('a tune', 'eine Melodie'), chords: L('chords', 'Akkorde'), broken: L('broken chords', 'gebrochene Akkorde') })[k] ?? k;
  const name = (c: string): string => (piano ? chordName(c, true) : shapeOf(c).name);
  return picks.map(({ x, p }) => {
    const f = fresh(p);
    const ring = !p.chords.length ? '' : !f.length ? L('all its chords ring', 'alle Akkorde klingen schon') : f.length === 1 ? L(`one new chord: ${name(f[0])}`, `ein neuer Akkord: ${name(f[0])}`) : L(`${f.length} new chords`, `${f.length} neue Akkorde`);
    return { id: x.id, title: x.title, why: [LEVELS[p.level], kindSaid(p.kind), ring].filter(Boolean).join(' · ') };
  });
}

export const describeSung = (id: string): string => {
  const s = songsToSing().find((x) => x.id === id) ?? currentSongToSing();
  const p = voiceProfile(s);
  return LYRICS[s.id] ? L(`${p.reasons.slice(0, 2).join(', ')}; with its words`, `${p.reasons.slice(0, 2).join(', ')}; mit Text`) : L(`${p.reasons.slice(0, 2).join(', ')}; sung in solfège`, `${p.reasons.slice(0, 2).join(', ')}; in Solmisation gesungen`);
};

/**
 * The step of chord changes: the change that is furthest from 30 a minute is first made without a clock
 * and measured over one calm minute; then comes the game. When every known change is at 30, the game alone.
 */
const changesStep: Screen = (root, params, ctx) => {
  const pair = weakestChange(params[0] === 'kchanges');
  if (!pair || !ctx) return nfRun(root, params, ctx);
  // the game starts once, however often the drill says it is done
  let inGame = false;
  let stop: void | (() => void) = changeDrill(root, pair, {
    ...ctx,
    after: L('the game with your changes', 'das Spiel mit deinen Wechseln'),
    next: () => {
      if (inGame) return;
      inGame = true;
      stop?.();
      document.body.dataset.mode = 'nf';
      stop = nfRun(root, params, ctx);
    },
  });
  document.body.dataset.mode = 'learn';
  return () => stop?.();
};

export interface Step {
  /** what the step is, the same every day (tune, chords, changes, ear, strum, song, ...): the player's plan leaves steps out by it */
  kind: string;
  short: string;
  /** as the step before announces it: "the chord check" */
  as: string;
  title: string;
  detail: string;
  minutes: number;
  mode: 'learn' | 'nf';
  screen: Screen;
  params: string[];
}

/**
 * A visit to an old song, when one is due: two lines from cold. It comes early in the session, before the
 * hands have warmed up on today's song, because what counts is what has stayed.
 */
export function visitStep(inst: Instrument, now = Date.now()): Step | null {
  syncReviews(inst, now);
  // a visit made earlier today stays in today's plan, so that the steps keep their numbers when the session goes on
  const today = (): ReturnType<typeof dueReviews>[number] | undefined => {
    if (doneToday(inst, now)) return undefined;
    const hit = Object.entries(store.reviews).find(([k, r]) => k.startsWith(inst + ':') && r.last && dayOf(r.last) === dayOf(now));
    if (!hit) return undefined;
    const id = hit[0].slice(inst.length + 1);
    const title = (inst === 'voice' ? songsToSing() : inst === 'piano' ? allPieces() : allSongs()).find((x) => x.id === id)?.title;
    return title ? { id, title, review: hit[1] } : undefined;
  };
  const due = dueReviews(inst, now)[0] ?? today();
  if (!due) return null;
  const screen = inst === 'voice' ? withIntro('sing', singLesson) : inst === 'piano' ? withIntro('piano', pianoLesson) : withIntro('song', songLesson);
  const unit = inst === 'guitar' ? L('lines', 'Zeilen') : L('phrases', 'Phrasen');
  return {
    kind: 'visit', short: L('Again', 'Wiederholen'),
    as: L(`${due.title}, from cold`, `${due.title}, aus dem Stand`),
    title: L(`Again from cold: ${due.title}`, `Wiederholen aus dem Stand: ${due.title}`),
    detail: due.review.relearn ? L(`Two ${unit} with the click at 85%: last time they slipped`, `Zwei ${unit} mit Klick bei 85 %: Letztes Mal sind sie verrutscht`) : L(`Two ${unit} at full speed, no run-up: what has stayed`, `Zwei ${unit} im vollen Tempo, ohne Anlauf: was geblieben ist`),
    minutes: 2,
    mode: 'learn',
    screen,
    params: [due.id, 'review'],
  };
}

/**
 * The plan as the player has made it theirs: the steps they left out are left out, every day until they
 * bring them back (and never all of them). Self-regulation grows from the app planning to the player planning.
 */
export function plan(now = Date.now()): Step[] {
  const all = fullPlan(now);
  const off = store.planOff[store.settings.instrument] ?? [];
  const kept = all.filter((st) => !off.includes(st.kind));
  return kept.length ? kept : all;
}

/** Leaves a kind of step out of the plan, or brings it back. */
export function setPlanned(kind: string, on: boolean): void {
  const inst = store.settings.instrument;
  const off = new Set(store.planOff[inst] ?? []);
  if (on) off.delete(kind);
  else off.add(kind);
  store.planOff[inst] = [...off];
  store.save();
}

/** The plan with a visit to an old song after the first step, when one is due: every step the app would choose. */
export function fullPlan(now = Date.now()): Step[] {
  const steps = basePlan();
  // the guitar's warm-up takes a due visit in already
  if (store.settings.instrument === 'guitar') return steps;
  const visit = visitStep(store.settings.instrument, now);
  if (!visit) return steps;
  // on a day with a visit to an old song, the ear has the day off: one thing more at a time, not two
  const rest = steps.slice(1).filter((s) => s.screen !== earStepScreen || store.settings.instrument === 'voice');
  return [steps[0], visit, ...rest];
}

/**
 * By ear, before the song: three motifs from it to play back (or, for a song of strummed chords, three of the
 * chords the player knows to tell apart), so that its sound comes before its signs.
 */
function earStep(piano: boolean): Step {
  const src = motifSource(piano);
  const own = src.title === (piano ? currentPiece().title : currentSong().title);
  const kind = own ? 'motif' : 'chords';
  return {
    kind: 'ear', short: L('By ear', 'Gehör'),
    as: L('playing back by ear', 'das Nachspielen nach Gehör'),
    title: kind === 'motif' ? L(`By ear: three motifs from ${src.title}`, `Nach Gehör: drei Motive aus ${src.title}`) : L('By ear: which chord?', 'Nach Gehör: welcher Akkord?'),
    detail: kind === 'motif' ? L('Hear, play back; the notes only when you ask', 'Hören, nachspielen; die Töne erst auf Wunsch') : L('Three chords you know, told apart by their sound', 'Drei Akkorde, die du kennst, an ihrem Klang unterschieden'),
    minutes: 2,
    mode: 'learn',
    screen: earStepScreen,
    params: [kind],
  };
}
/** The ear's step, one screen for every session, so that a plan can tell it from the others. */
const earStepScreen = withIntro('ear', earTraining);

/**
 * The strumming hand on its own, before a song whose pattern is new: on muted strings, on one chord, with the
 * change. Only once the song's chords ring: a new chord never comes together with a new pattern.
 */
export function strumStep(song: Song): Step | null {
  const id = strumPatternOf(song);
  if (!id || store.skills.level(strumKey(id)) >= 2) return null;
  const chords = [...new Set(song.bars.map((b) => b.chord).filter((c): c is string => !!c).map((c) => shapeOf(c).id))];
  if (!chords.length || chords.some((c) => store.skills.level('chord:' + c) < 1)) return null;
  const pattern = STRUM_PATTERNS().find((p) => p.id === id)!;
  const stageNo = store.skills.level(strumKey(id)) >= 1 ? '2' : '0';
  return {
    kind: 'strum', short: L('Strumming', 'Anschlag'),
    as: L(`the strumming pattern of ${song.title}`, `das Schlagmuster von ${song.title}`),
    title: L(`Strumming: ${pattern.name.toLowerCase()}`, `Schlagmuster: ${pattern.name}`),
    detail: L(`The pattern of ${song.title}, first on muted strings, then with its chords`, `Das Muster von ${song.title}, erst abgedämpft, dann mit seinen Akkorden`),
    minutes: 3,
    mode: 'learn',
    screen: withIntro('strumming', strumTrainer),
    params: [id, stageNo, chords[0], chords[1] ?? chords[0]],
  };
}

/**
 * Warming up: the guitar tuned in passing (pluck each string once; only a string that is off asks for more),
 * then music straight away: a visit to an old song when one is due, otherwise a song from the shelf, or the
 * groove of the song of the week, with the band. Nothing in it is a test of the day's new material.
 */
const warmUp: Screen = (root, [kind, id, part], ctx) => {
  if (!ctx) return groove(root, [id, 'free', part ?? '0']);
  let stop: void | (() => void);
  let tuned = false;
  const then = (): void => {
    if (tuned) return;
    tuned = true;
    stop?.();
    document.body.dataset.mode = 'learn';
    // a visit is measured (what has stayed is the point of it); a song from the shelf or this week's song is
    // played in the groove, unscored: the warm-up is music, not a test
    stop = kind === 'visit' ? withIntro('song', songLesson)(root, [id, 'review'], ctx) : groove(root, [id, 'warm', part ?? '0'], ctx);
  };
  stop = tuner(root, ['quick'], { ...ctx, after: kind === 'groove' ? L('the warm-up with the band', 'das Einspielen mit Band') : L('a song you know', 'ein Song, den du kannst'), next: then });
  return () => stop?.();
};

/** The change of the week's song that needs it most, measured with one calm minute: no game after it here. */
const focusChange: Screen = (root, params, ctx) => changeDrill(root, params, ctx);

/** The chords of some lines of the material in the order they come, each change once: [from, to]. */
function changesIn(m: Material, lines: number[]): [string, string][] {
  const seq: string[] = [];
  for (const k of lines) for (const st of m.lines[k]?.steps ?? []) if (st.chord && seq[seq.length - 1] !== shapeOf(st.chord).id) seq.push(shapeOf(st.chord).id);
  const out: [string, string][] = [];
  for (let i = 1; i < seq.length; i++) if (!out.some(([a, b]) => a === seq[i - 1] && b === seq[i])) out.push([seq[i - 1], seq[i]]);
  return out;
}

/**
 * The one thing to work on today, chosen from the song of the week: a chord of the coming part that does not
 * ring yet, else its strumming pattern when that is new, else the change in it that is slowest. Each with
 * its reason, said in the step's title. Null when nothing stands out.
 */
export function focusStep(song: Song, a: Arc): Step | null {
  const m = songMaterial(song);
  const part = a.next.kind === 'learn' || a.next.kind === 'click' ? a.parts[a.next.part] : null;
  const lines = part ? part.lines : m.lines.map((_, k) => k);
  const where = part ? part.label : song.title;
  const chordsHere = [...new Set(lines.flatMap((k) => m.lines[k].steps.map((st) => st.chord).filter((c): c is string => !!c)).map((c) => shapeOf(c).id))];
  const fresh = chordsHere.find((c) => CHORDS[c] && store.skills.level('chord:' + c) < 1);
  if (fresh)
    return {
      kind: 'focus', short: L('Focus', 'Fokus'),
      as: L(`the new chord ${CHORDS[fresh].name}`, `der neue Griff ${CHORDS[fresh].name}`),
      title: L(`New chord: ${CHORDS[fresh].name}`, `Neuer Griff: ${CHORDS[fresh].name}`),
      detail: L(`${where} needs it. String by string, no clock`, `${where} braucht ihn. Saite für Saite, ohne Uhr`),
      minutes: 3, mode: 'learn', screen: withIntro('chord', chordCheck), params: [fresh],
    };
  const strum = strumStep(song);
  if (strum) return { ...strum, kind: 'focus', short: L('Focus', 'Fokus') };
  const pairs = changesIn(m, lines);
  const rate = (p: [string, string]): number => store.skills.get(pairKey(p[0], p[1], false))?.best ?? 0;
  const worst = pairs.length ? pairs.reduce((x, y) => (rate(y) < rate(x) ? y : x)) : null;
  // when the hands have what the song asks (every change at 30 a minute), the ear has its turn: motifs of
  // the song played back, its sound before its signs
  if (!worst || rate(worst) >= 30) return { ...earStep(false), kind: 'focus', short: L('Focus', 'Fokus') };
  const [p, q] = worst.map((c) => CHORDS[c].name);
  const was = rate(worst);
  return {
    kind: 'focus', short: L('Focus', 'Fokus'),
    as: L(`the change ${p} → ${q}`, `der Wechsel ${p} → ${q}`),
    title: L(`Focus: ${p} → ${q}`, `Fokus: ${p} → ${q}`),
    detail: was ? L(`From the ${where.toLowerCase()}. Last time ${(60 / was).toFixed(1)} s a change`, `Aus: ${where}. Zuletzt ${(60 / was).toFixed(1).replace('.', ',')} s pro Wechsel`) : L(`From the ${where.toLowerCase()}. Once without a clock, then one calm minute`, `Aus: ${where}. Einmal ohne Uhr, dann eine ruhige Minute`),
    minutes: 3, mode: 'learn', screen: withIntro('change', focusChange), params: worst,
  };
}

/** The game the encore plays: tonight's night, the same all day, with this week's chords. */
const encoreRun: Screen = (root, _params, ctx) => nightRun(root, [], ctx);

/** The guitar's day around the song of the week: warm up, one focus, the next part of the song, an encore. */
export function weekPlan(now = Date.now()): Step[] {
  const id = weekOf('guitar')?.id ?? currentSong().id;
  const a = arcOf('guitar', id, now)!;
  const song = findSong(id);
  const steps: Step[] = [];
  // 1. warm up: a visit when one is due, else a song from the shelf, else the groove of this week's song
  const due = dueReviews('guitar', now).find((r) => r.id !== id);
  const shelf = repertoire('guitar', now).filter((r) => r.id !== id).sort((x, y) => x.last - y.last)[0];
  const warmKind = due ? 'visit' : shelf ? 'shelf' : 'groove';
  const warmTitle = due ? due.title : shelf ? shelf.title : song.title;
  steps.push({
    kind: 'warm', short: L('Warm up', 'Einspielen'),
    as: L('the warm-up', 'das Einspielen'),
    title: warmKind === 'visit' ? L(`Warm up: ${warmTitle}, from cold`, `Einspielen: ${warmTitle}, aus dem Stand`) : L(`Warm up: ${warmTitle} in the groove`, `Einspielen: ${warmTitle} im Groove`),
    detail: warmKind === 'visit' ? L('Tune, then two lines you know, from cold, with the band', 'Stimmen, dann zwei Zeilen, die du kannst, aus dem Stand, mit Band') : warmKind === 'shelf' ? L('Tune, then a song you know, with the band, nothing measured', 'Stimmen, dann ein Song, den du kannst, mit Band, nichts gemessen') : L('Tune, then three rounds with the band, nothing measured', 'Stimmen, dann drei Runden mit Band, nichts gemessen'),
    minutes: warmKind === 'groove' ? 2 : 3, mode: 'learn', screen: warmUp,
    params: [warmKind, due ? due.id : shelf ? shelf.id : id, '0'],
  });
  // 2. the focus of the day, from the part that comes next
  const focus = focusStep(song, a);
  if (focus) steps.push(focus);
  // 3. the next part of the song of the week, on its rung
  const n = a.next;
  if (n.kind !== 'done') {
    const said = n.kind === 'whole' ? L('the whole song', 'der ganze Song') : a.parts[n.part].label;
    steps.push({
      kind: 'new', short: L('New', 'Neu'),
      as: `${song.title}: ${said}`,
      title: `${song.title}: ${said}`,
      detail: nextLabel(a),
      minutes: 4, mode: 'learn', screen: hearFirst(withIntro('song', songLesson)),
      params: n.kind === 'whole' ? [id, '3'] : [id, n.kind === 'learn' ? '1' : '2', lineParam(n.line)],
    });
  }
  // 4. the encore: the game of tonight with this week's chords (the whole song is the encore once it is ready)
  steps.push(
    n.kind === 'done'
      ? { kind: 'encore', short: L('Encore', 'Zugabe'), as: L('the encore', 'die Zugabe'), title: L(`Encore: ${song.title} with the band`, `Zugabe: ${song.title} mit Band`), detail: L('Start to end, recorded', 'Von vorn bis hinten, aufgenommen'), minutes: 3, mode: 'learn', screen: songLesson, params: [id, '3'] }
      : { kind: 'encore', short: L('Encore', 'Zugabe'), as: L('the encore', 'die Zugabe'), title: L("Encore: tonight's game", 'Zugabe: die Nacht von heute'), detail: L("The game, in time, with this week's chords", 'Das Spiel, im Takt, mit den Akkorden der Woche'), minutes: 4, mode: 'nf', screen: withIntro('run', encoreRun), params: ['changes'] },
  );
  // 5. the barre chord, when it is a project of the player's: last and optional
  const b = store.barre;
  if (b && CHORDS[b.chord]) {
    const day = Math.max(1, dayOf(now) - b.start + 1);
    if (day <= 30)
      steps.push({ kind: 'barre', short: L('Barre', 'Barré'), as: L('the barre project, if you like', 'das Barré-Projekt, wenn du magst'), title: L(`Barre project: ${CHORDS[b.chord].name}, day ${day} of 30`, `Barré-Projekt: ${CHORDS[b.chord].name}, Tag ${day} von 30`), detail: L('Two minutes, if you like', 'Zwei Minuten, wenn du magst'), minutes: 2, mode: 'learn', screen: withIntro('chord', chordCheck), params: [b.chord, 'stay'] });
  }
  return steps;
}

function basePlan(): Step[] {
  if (store.settings.instrument === 'guitar') return weekPlan();
  if (store.settings.instrument === 'voice') {
    const song = currentSongToSing();
    // the first time the range is found, so that everything after it lies in the voice; later a held tone warms it up
    const first: Step = rangeMeasured()
      ? { kind: 'warm', short: L('Warm up', 'Einsingen'), as: L('a held tone to warm up', 'ein gehaltener Ton zum Einsingen'), title: L('Hold a tone', 'Einen Ton halten'), detail: L('Five seconds on one note, as steady as you can', 'Fünf Sekunden auf einem Ton, so ruhig wie möglich'), minutes: 1, mode: 'learn', screen: withIntro('hold', holdTone), params: [] }
      : { kind: 'range', short: L('Range', 'Umfang'), as: L('finding your range', 'das Finden deines Umfangs'), title: L('Find your range', 'Deinen Umfang finden'), detail: L('A low note and a high one, both comfortable', 'Ein tiefer und ein hoher Ton, beide bequem'), minutes: 2, mode: 'learn', screen: withIntro('range', voiceRangeTest), params: [] };
    const match: Step = { kind: 'match', short: L('Tones', 'Töne'), as: L('matching tones', 'das Töne-Treffen'), title: L('Match the tone', 'Töne treffen'), detail: L('Five notes: listen, then sing each back', 'Fünf Töne: zuhören, dann jeden nachsingen'), minutes: 2, mode: 'learn', screen: withIntro('match', pitchMatch), params: [] };
    const intervals: Step = { kind: 'intervals', short: L('Intervals', 'Intervalle'), as: L('intervals', 'die Intervalle'), title: L('Intervals by ear', 'Intervalle nach Gehör'), detail: L('Four distances: hear the first note, sing the second', 'Vier Abstände: den ersten Ton hören, den zweiten singen'), minutes: 2, mode: 'learn', screen: withIntro('ear', earTraining), params: ['interval'] };
    const gym: Step = { kind: 'gym', short: L('Patterns', 'Muster'), as: L('a short game of sung patterns', 'ein kurzes Spiel mit gesungenen Mustern'), title: L('Voice gym', 'Stimmtraining'), detail: L('Steps, thirds and do-mi-sol, in keys that suit your voice', 'Schritte, Terzen und Do-mi-sol, in Tonarten, die zu deiner Stimme passen'), minutes: 3, mode: 'nf', screen: withIntro('run', nfRun), params: ['sing'] };
    const lesson: Step = { kind: 'song', short: L('Song', 'Song'), as: song.title, title: song.title, detail: describeSung(song.id), minutes: 4, mode: 'learn', screen: withIntro('sing', singLesson), params: [song.id] };
    return [first, match, intervals, gym, lesson];
  }
  if (store.settings.instrument === 'piano') {
    const piece = currentPiece();
    const pitch: Step = { kind: 'pitch', short: L('Pitch', 'Tonhöhe'), as: L('the pitch of the piano', 'die Tonhöhe des Klaviers'), title: L('Match the app to your piano', 'Die App auf dein Klavier einstellen'), detail: L('Play one A and hold it', 'Spiel ein A und halte es'), minutes: 1, mode: 'learn', screen: withIntro('tuner', tuner), params: ['piano'] };
    const gym: Step = { kind: 'fingers', short: L('Fingers', 'Finger'), as: L('a short game for the fingers', 'ein kurzes Spiel für die Finger'), title: L('Finger gym', 'Fingertraining'), detail: L('A short game for even fingers, counted in', 'Ein kurzes Spiel für gleichmäßige Finger, mit Einzählen'), minutes: 3, mode: 'nf', screen: withIntro('run', nfRun), params: ['keys'] };
    const lesson: Step = { kind: 'song', short: L('Piece', 'Stück'), as: piece.title, title: piece.title, detail: describe(pieceMaterial(piece)), minutes: 5, mode: 'learn', screen: hearFirst(withIntro('piano', pianoLesson)), params: [piece.id] };
    // a tune needs the fingers warm; chords need to be found first, and then the way from one to the next
    if ((piece.kind ?? 'melody') === 'melody') return [pitch, gym, earStep(true), lesson];
    const chords = todaysKeyChords();
    const check: Step = { kind: 'chords', short: L('Chords', 'Akkorde'), as: L('the chord check', 'der Akkord-Check'), title: L(`Chord check: ${chords.map((c) => chordName(c, true)).join(', ')}`, `Akkord-Check: ${chords.map((c) => chordName(c, true)).join(', ')}`), detail: L('Key by key, then all at once; no clock', 'Taste für Taste, dann alle zugleich; ohne Uhr'), minutes: 3, mode: 'learn', screen: withIntro('keys', keyCheck), params: chords };
    const changes: Step = { kind: 'changes', short: L('Changes', 'Wechsel'), as: L('the chord changes', 'die Akkordwechsel'), title: L('Chord changes', 'Akkordwechsel'), detail: L('One change without a clock, one calm minute, then a short game', 'Ein Wechsel ohne Uhr, eine ruhige Minute, dann ein kurzes Spiel'), minutes: 4, mode: 'nf', screen: withIntro('change', changesStep), params: ['kchanges'] };
    return piece.kind === 'chords' ? [pitch, check, changes, earStep(true), lesson] : [pitch, check, gym, earStep(true), lesson];
  }
  // the guitar's day is the week's (weekPlan, above)
  return weekPlan();
}

const fmt = (key: string, v: number): string => {
  const kind = kindOf(key);
  if (!isFinite(v) || !v) return '';
  if (kind === 'chord') return L(`${v.toFixed(1)} s for ${key.startsWith('chord:p.') ? 'the whole chord' : 'all strings'}`, `${v.toFixed(1)} s für ${key.startsWith('chord:p.') ? 'den ganzen Akkord' : 'alle Saiten'}`);
  if (kind === 'scale') return L(`${v.toFixed(1)} s for the scale`, `${v.toFixed(1)} s für die Tonleiter`);
  if (kind === 'pair') return L(`${Math.round(v)} changes a minute`, `${Math.round(v)} Wechsel pro Minute`);
  if (kind === 'finger') return `${Math.round(v)} bpm`;
  if (kind === 'pitch') return L(`${Math.round(v)} cents off on average`, `im Schnitt ${Math.round(v)} Cent daneben`);
  if (kind === 'tone') return L(`steady within ${Math.round(v)} cents`, `ruhig innerhalb von ${Math.round(v)} Cent`);
  if (kind === 'sing') return L(`${Math.round(v)} notes a minute on pitch`, `${Math.round(v)} Töne pro Minute getroffen`);
  return L(`${Math.round(v)}% of full speed`, `${Math.round(v)} % des vollen Tempos`);
};

/**
 * After a session on a song that is now finished: the one to go on with, easiest first, as the session would
 * choose it by itself (a song, not a riff or a lick; a piece, not the basic version of one). Null while the
 * song is not finished, or when nothing is left.
 */
export function nextAfter(inst: Instrument, id: string): { done: { id: string; title: string }; next: { id: string; title: string } } | null {
  if (!finished(inst, id)) return null;
  // the finished one itself is kept in the list for its title, whatever it is
  const all: { id: string; title: string }[] = inst === 'voice' ? songsToSing() : inst === 'piano' ? piecesByDifficulty().filter((p) => !p.of || p.id === id) : songsByDifficulty().filter((s) => !s.exercise || s.id === id);
  const done = all.find((x) => x.id === id);
  const next = all.find((x) => !finished(inst, x.id));
  return done && next ? { done, next } : null;
}

/**
 * Five minutes: the first step (tuning, the piano's pitch, a held tone) and the song. Counts as fully as the
 * whole session: on a busy day, a little is what keeps the habit.
 */
export function shortPlan(): Step[] {
  const all = plan();
  const id = currentId(store.settings.instrument);
  const song = all.find((s) => s.kind === 'new') ?? all.find((s) => s.params.length === 1 && s.params[0] === id) ?? all[all.length - 1];
  return [all[0], song].map((s) => (s === song ? { ...s, minutes: Math.min(s.minutes, 4) } : s));
}

export const session: Screen = (root, [how]) => {
  const inst = store.settings.instrument;
  const short = how === 'short';
  const steps = short ? shortPlan() : plan();
  const before: Record<string, SkillRecord> = JSON.parse(JSON.stringify(store.skills.data));
  const began = Date.now();
  /** where the song of the week stood when the session began, for what the end says changed */
  const arcBefore = inst === 'guitar' ? arcOf(inst, weekOf(inst)?.id ?? currentSong().id) : null;
  /** remembers the step reached, so that leaving by mistake costs nothing */
  const mark = (step: number): void => {
    // a short session is not resumed as the long one: its steps are others
    if (short) return;
    store.progress[`session:${inst}:day`] = dayOf(Date.now());
    store.progress[`session:${inst}:step`] = step;
    store.save();
  };
  if (how === 'new') {
    mark(0);
    history.replaceState(null, '', '#/session');
  }
  let i = short ? 0 : Math.min(resumeAt(inst), steps.length - 1);
  let cleanup: void | (() => void);
  let stopKeys: () => void = () => undefined;

  const rail = (at: number): string =>
    `<ol class="rail" aria-label="${L("Today's steps", 'Heutige Schritte')}">${steps.map((s, k) => `<li data-n="${k + 1}" class="${k < at ? 'done' : k === at ? 'cur' : ''}"${k === at ? ' aria-current="step"' : ''}><span>${esc(s.short)}</span></li>`).join('')}</ol>`;

  function show(): void {
    // nothing the step before had planned moves on any more, as when the router opens another screen
    stopAllLater();
    cleanup?.();
    cleanup = undefined;
    scrollTo(0, 0);
    if (i >= steps.length) {
      summary();
      return;
    }
    const step = steps[i];
    document.body.dataset.mode = step.mode;
    // a step goes on once: "Next step" pressed while its own move was pending, or a late callback of it,
    // must not skip the step after it
    let gone = false;
    const ctx: SessionCtx = {
      rail: rail(i),
      label: L(`Step ${i + 1} of ${steps.length}`, `Schritt ${i + 1} von ${steps.length}`),
      next: () => {
        if (gone) return;
        gone = true;
        i++;
        mark(i < steps.length ? i : 0);
        show();
      },
      after: steps[i + 1]?.as ?? L('the summary', 'die Zusammenfassung'),
    };
    cleanup = step.screen(root, step.params, ctx);
  }

  function summary(): void {
    document.body.dataset.mode = 'learn';
    const now = Date.now();
    store.sessions.push(now);
    // the start page says so until tomorrow: done for today, and what was measured
    store.progress[`session:${inst}:done`] = dayOf(now);
    // a finished song makes room for the next one
    const id = currentId(inst);
    let moved = '';
    let choices: ReturnType<typeof songChoices> = [];
    const step = nextAfter(inst, id);
    if (step) {
      store.current[inst] = step.next.id;
      moved = L(`${step.done.title} is at full speed. Next: ${step.next.title}.`, `${step.done.title} läuft im vollen Tempo. Als Nächstes: ${step.next.title}.`);
      choices = songChoices(inst);
    }
    store.save();
    // the guitar's day ends on the song of the week: what changed, then and now, and tomorrow
    if (inst === 'guitar') {
      stopKeys();
      const mins = Math.max(1, Math.round((now - began) / 60000));
      stopKeys = weekSummary(root, { inst, before: arcBefore, skillsBefore: before, minutes: mins, now });
      return;
    }
    const rows = Object.keys(store.skills.data)
      .map((key) => {
        const was = before[key];
        const is = store.skills.data[key];
        const levelUp = is.level > (was?.level ?? 0);
        const better = !was || is.best !== was.best || (is.strings ?? 0) > (was.strings ?? 0);
        if (!levelUp && !better) return '';
        const checked = kindOf(key) === 'chord' || kindOf(key) === 'scale' || kindOf(key) === 'pitch';
        const value = checked && is.level === 0 ? (kindOf(key) === 'chord' ? L(`${cleanStrings(key, is.strings ?? 0)} clean`, `${cleanStrings(key, is.strings ?? 0)} sauber`) : kindOf(key) === 'pitch' ? L('not every note found yet', 'noch nicht jeder Ton getroffen') : key.startsWith('scale:v.') ? L('not every note held yet', 'noch nicht jeder Ton gehalten') : L('not every key rang yet', 'noch nicht jede Taste hat geklungen')) : fmt(key, is.best);
        return `<li><span class="k2">${esc(skillLabel(key))}</span><span>${value}</span><span class="tag ${levelUp ? 'up' : ''}">${levelUp ? L(`level ${was?.level ?? 0} → ${is.level}`, `Stufe ${was?.level ?? 0} → ${is.level}`) : was ? L('best yet', 'neuer Bestwert') : L('first time', 'zum ersten Mal')}</span></li>`;
      })
      .filter(Boolean)
      .join('');
    const weakest = Object.keys(store.skills.data).sort((a, b) => store.skills.weight(b, now) - store.skills.weight(a, now))[0];
    const mins = Math.max(1, Math.round((now - began) / 60000));
    root.innerHTML = `<div class="page mid">
      <div><p class="kick">${weekLine(now)}</p>
        <h1>${L(`Done. ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`, `Fertig. ${mins} ${mins === 1 ? 'Minute' : 'Minuten'}.`)}</h1></div>
      ${rows ? `<ul class="res">${rows}</ul>` : `<p class="note">${L('Nothing was measured this time. That is fine: the steps are still there tomorrow.', 'Diesmal wurde nichts gemessen. Das ist in Ordnung: Die Schritte sind morgen noch da.')}</p>`}
      ${moved ? `<p class="note"><b id="moved">${esc(moved)}</b></p>${chooseRow(choices, store.current[inst] ?? '')}` : weakest ? `<p class="note">${L(`<b>Tomorrow</b> comes back to ${esc(skillLabel(weakest))}.`, `<b>Morgen</b> geht es wieder um ${esc(skillLabel(weakest))}.`)}</p>` : ''}
      <div class="row"><a class="btn primary big" href="#/">${L('Finish', 'Abschließen')} <kbd>${L('Space', 'Leertaste')}</kbd></a><a class="btn big" href="#/nf">${L('Keep playing: a game', 'Weiterspielen: ein Spiel')}</a></div>
    </div>`;
    stopKeys();
    stopKeys = keys({ ' ': () => (location.hash = '/') });
    bindChoose(root, inst, (c) => ($('#moved', root).textContent = L(`Next: ${c.title}.`, `Als Nächstes: ${c.title}.`)));
    $('.btn.primary', root).focus();
  }

  show();
  return () => {
    cleanup?.();
    stopKeys();
  };
};
