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
import { allPieces, allSongs, KEY_CHORDS, shapeOf, type Song } from '../music/content';
import { chordKey, chordWeight, currentPiece, currentSong, currentSongToSing, finished, LEVELS, pieceProfile, piecesByDifficulty, readiness, songProfile, songsByDifficulty, type Profile } from '../music/difficulty';
import { songsToSing, voiceProfile } from '../music/voicebook';
import { holdTone, pitchMatch, rangeMeasured, singLesson, voiceRangeTest } from './sing';
import { dueReviews, syncReviews } from '../music/review';
import { LYRICS } from '../music/lyrics';
import { OPEN_CHORDS } from '../music/path';
import { chordName, CHORDS } from '../music/theory';
import { $, esc, keys, type Screen, type SessionCtx } from '../ui/dom';
import { cleanStrings, skillLabel } from './home';
import { chordCheck, describe, pianoLesson, pieceMaterial, songLesson, songMaterial } from './learn';
import { withIntro } from './basics';
import { changeDrill } from './changes';
import { keyCheck } from './keys';
import { nfRun, weakestChange } from './nf';
import { tuner } from './tuner';
import { earTraining, motifSource } from './ear';
import { weekLine } from './habit';
import { strumTrainer } from './strum';
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

/**
 * The chords of today's chord check: at most three, open chords only. First the ones today's lines of
 * the song need and that have not rung clean yet, so that the check prepares what the session then
 * plays; then other open chords that are new, easiest first; then the ones that need it most. The hard
 * chord has its own short step at the end of the session, where it cannot hold anything up.
 */
export function todaysChords(now = Date.now()): string[] {
  const fresh = (c: string): boolean => store.skills.level('chord:' + c) < 1;
  // a song's own colours count too: A7, Dsus4, Cadd9 are open chords like the eight basic ones
  const out = songChords().filter((c) => chordWeight(c) < 2 && fresh(c));
  for (const c of OPEN_CHORDS) if (fresh(c) && !out.includes(c)) out.push(c);
  // then the ones whose time has come to be confirmed again, the longest waiting first; then the weakest
  const due = OPEN_CHORDS.filter((c) => !out.includes(c) && store.skills.due('chord:' + c, now)).sort((a, b) => (store.skills.get('chord:' + a)?.last ?? 0) - (store.skills.get('chord:' + b)?.last ?? 0));
  const again = OPEN_CHORDS.filter((c) => !out.includes(c) && !due.includes(c)).sort((a, b) => store.skills.weight('chord:' + b, now) - store.skills.weight('chord:' + a, now));
  return [...out, ...due, ...again].slice(0, 3);
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
  let stop: void | (() => void) = changeDrill(root, pair, {
    ...ctx,
    after: L('the game with your changes', 'das Spiel mit deinen Wechseln'),
    next: () => {
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

function basePlan(): Step[] {
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
    const lesson: Step = { kind: 'song', short: L('Piece', 'Stück'), as: piece.title, title: piece.title, detail: describe(pieceMaterial(piece)), minutes: 5, mode: 'learn', screen: withIntro('piano', pianoLesson), params: [piece.id] };
    // a tune needs the fingers warm; chords need to be found first, and then the way from one to the next
    if ((piece.kind ?? 'melody') === 'melody') return [pitch, gym, earStep(true), lesson];
    const chords = todaysKeyChords();
    const check: Step = { kind: 'chords', short: L('Chords', 'Akkorde'), as: L('the chord check', 'der Akkord-Check'), title: L(`Chord check: ${chords.map((c) => chordName(c, true)).join(', ')}`, `Akkord-Check: ${chords.map((c) => chordName(c, true)).join(', ')}`), detail: L('Key by key, then all at once; no clock', 'Taste für Taste, dann alle zugleich; ohne Uhr'), minutes: 3, mode: 'learn', screen: withIntro('keys', keyCheck), params: chords };
    const changes: Step = { kind: 'changes', short: L('Changes', 'Wechsel'), as: L('the chord changes', 'die Akkordwechsel'), title: L('Chord changes', 'Akkordwechsel'), detail: L('One change without a clock, one calm minute, then a short game', 'Ein Wechsel ohne Uhr, eine ruhige Minute, dann ein kurzes Spiel'), minutes: 4, mode: 'nf', screen: withIntro('change', changesStep), params: ['kchanges'] };
    return piece.kind === 'chords' ? [pitch, check, changes, earStep(true), lesson] : [pitch, check, gym, earStep(true), lesson];
  }
  const chords = todaysChords();
  const song = currentSong();
  const hard = barreChord();
  return [
    { kind: 'tune', short: L('Tune', 'Stimmen'), as: L('tuning', 'das Stimmen'), title: L('Tune up', 'Stimmen'), detail: L('Pluck a string, the app says which way to turn', 'Zupf eine Saite, die App sagt, in welche Richtung du drehst'), minutes: 1, mode: 'learn', screen: withIntro('tuner', tuner), params: [] },
    { kind: 'chords', short: L('Chords', 'Akkorde'), as: L('the chord check', 'der Akkord-Check'), title: L(`Chord check: ${chords.map((c) => CHORDS[c].name).join(', ')}`, `Akkord-Check: ${chords.map((c) => CHORDS[c].name).join(', ')}`), detail: L('String by string, no clock', 'Saite für Saite, ohne Uhr'), minutes: 3, mode: 'learn', screen: withIntro('chord', chordCheck), params: chords },
    { kind: 'changes', short: L('Changes', 'Wechsel'), as: L('the chord changes', 'die Akkordwechsel'), title: L('Chord changes', 'Akkordwechsel'), detail: L('One change without a clock, one calm minute, then a short game', 'Ein Wechsel ohne Uhr, eine ruhige Minute, dann ein kurzes Spiel'), minutes: 4, mode: 'nf', screen: withIntro('change', changesStep), params: ['changes'] },
    // a new strumming pattern takes the place of the ear on that day: one new thing at a time
    strumStep(song) ?? earStep(false),
    { kind: 'song', short: L('Song', 'Song'), as: song.title, title: song.title, detail: describe(songMaterial(song)), minutes: 5, mode: 'learn', screen: withIntro('song', songLesson), params: [song.id] },
    // the hard chord comes last and is optional: it is the long-term goal, never a gate
    ...(hard ? [{ kind: 'barre', short: L('Barre', 'Barré'), as: L('the barre chord, if you like', 'der Barré-Akkord, wenn du magst'), title: L(`Barre practice: ${CHORDS[hard].name}`, `Barré-Übung: ${CHORDS[hard].name}`), detail: L('Two minutes on the hard one, if you like', 'Zwei Minuten für den schweren, wenn du magst'), minutes: 2, mode: 'learn' as const, screen: withIntro('chord', chordCheck), params: [hard, 'stay'] }] : []),
  ];
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
 * Five minutes: the first step (tuning, the piano's pitch, a held tone) and the song. Counts as fully as the
 * whole session: on a busy day, a little is what keeps the habit.
 */
export function shortPlan(): Step[] {
  const all = plan();
  const id = currentId(store.settings.instrument);
  const song = all.find((s) => s.params.length === 1 && s.params[0] === id) ?? all[all.length - 1];
  return [all[0], song].map((s) => (s === song ? { ...s, minutes: Math.min(s.minutes, 4) } : s));
}

export const session: Screen = (root, [how]) => {
  const inst = store.settings.instrument;
  const short = how === 'short';
  const steps = short ? shortPlan() : plan();
  const before: Record<string, SkillRecord> = JSON.parse(JSON.stringify(store.skills.data));
  const began = Date.now();
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
    cleanup?.();
    cleanup = undefined;
    scrollTo(0, 0);
    if (i >= steps.length) {
      summary();
      return;
    }
    const step = steps[i];
    document.body.dataset.mode = step.mode;
    const ctx: SessionCtx = {
      rail: rail(i),
      label: L(`Step ${i + 1} of ${steps.length}`, `Schritt ${i + 1} von ${steps.length}`),
      next: () => {
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
    if (finished(inst, id)) {
      // on to the next one, easiest first
      const all: { id: string; title: string }[] = inst === 'voice' ? songsToSing() : inst === 'piano' ? piecesByDifficulty().filter((p) => !p.of || p.id === id) : songsByDifficulty();
      const next = all.find((x) => !finished(inst, x.id));
      if (next) {
        store.current[inst] = next.id;
        moved = L(`${all.find((x) => x.id === id)!.title} is at full speed. Next: ${next.title}.`, `${all.find((x) => x.id === id)!.title} läuft im vollen Tempo. Als Nächstes: ${next.title}.`);
        choices = songChoices(inst);
      }
    }
    store.save();
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
