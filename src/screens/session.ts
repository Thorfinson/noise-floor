/**
 * Today's session: the app leads. On the guitar: tune up, check the chord you are working on, a short
 * run of chord changes, then the song. On the piano: match the app to the piano's pitch, then what the
 * piece of the day needs (a short run for the fingers before a tune; its chords key by key and their
 * changes before a piece of chords), then the piece. With the voice: the range measured the first time,
 * afterwards a held tone to warm up; then tones sung back, a short game of sung patterns, and the song.
 * Each step moves on by itself when its goal is reached, and "Next step" is always there.
 */
import { L } from '../core/i18n';
import { kindOf, type SkillRecord } from '../core/skills';
import { store, type Instrument } from '../core/store';
import { allPieces, KEY_CHORDS, shapeOf } from '../music/content';
import { chordKey, chordWeight, currentPiece, currentSong, currentSongToSing, finished, piecesByDifficulty, songsByDifficulty } from '../music/difficulty';
import { songsToSing, voiceProfile } from '../music/voicebook';
import { holdTone, pitchMatch, rangeMeasured, singLesson, voiceRangeTest } from './sing';
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
  const again = OPEN_CHORDS.filter((c) => !out.includes(c)).sort((a, b) => store.skills.weight('chord:' + b, now) - store.skills.weight('chord:' + a, now));
  return [...out, ...again].slice(0, 3);
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
  const again = [...new Set([...pieceChords(), ...KEY_CHORDS])].filter((c) => !out.includes(c)).sort((a, b) => store.skills.weight(chordKey(b, true), now) - store.skills.weight(chordKey(a, true), now));
  return [...out, ...again].slice(0, 3);
}

export const dayOf = (t: number): number => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 86400000);

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
export const describeSung = (id: string): string => {
  const s = songsToSing().find((x) => x.id === id) ?? currentSongToSing();
  const p = voiceProfile(s);
  return L(`${p.reasons.slice(0, 2).join(', ')}; sung on “la”`, `${p.reasons.slice(0, 2).join(', ')}; auf „la“ gesungen`);
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

export function plan(): Step[] {
  if (store.settings.instrument === 'voice') {
    const song = currentSongToSing();
    // the first time the range is found, so that everything after it lies in the voice; later a held tone warms it up
    const first: Step = rangeMeasured()
      ? { short: L('Warm up', 'Einsingen'), as: L('a held tone to warm up', 'ein gehaltener Ton zum Einsingen'), title: L('Hold a tone', 'Einen Ton halten'), detail: L('Five seconds on one note, as steady as you can', 'Fünf Sekunden auf einem Ton, so ruhig wie möglich'), minutes: 1, mode: 'learn', screen: withIntro('hold', holdTone), params: [] }
      : { short: L('Range', 'Umfang'), as: L('finding your range', 'das Finden deines Umfangs'), title: L('Find your range', 'Deinen Umfang finden'), detail: L('A low note and a high one, both comfortable', 'Ein tiefer und ein hoher Ton, beide bequem'), minutes: 2, mode: 'learn', screen: withIntro('range', voiceRangeTest), params: [] };
    const match: Step = { short: L('Tones', 'Töne'), as: L('matching tones', 'das Töne-Treffen'), title: L('Match the tone', 'Töne treffen'), detail: L('Five notes: listen, then sing each back', 'Fünf Töne: zuhören, dann jeden nachsingen'), minutes: 2, mode: 'learn', screen: withIntro('match', pitchMatch), params: [] };
    const gym: Step = { short: L('Patterns', 'Muster'), as: L('a short game of sung patterns', 'ein kurzes Spiel mit gesungenen Mustern'), title: L('Voice gym', 'Stimmtraining'), detail: L('Steps, thirds and do-mi-sol, in keys that suit your voice', 'Schritte, Terzen und Do-mi-sol, in Tonarten, die zu deiner Stimme passen'), minutes: 3, mode: 'nf', screen: withIntro('run', nfRun), params: ['sing'] };
    const lesson: Step = { short: L('Song', 'Song'), as: song.title, title: song.title, detail: describeSung(song.id), minutes: 4, mode: 'learn', screen: withIntro('sing', singLesson), params: [song.id] };
    return [first, match, gym, lesson];
  }
  if (store.settings.instrument === 'piano') {
    const piece = currentPiece();
    const pitch: Step = { short: L('Pitch', 'Tonhöhe'), as: L('the pitch of the piano', 'die Tonhöhe des Klaviers'), title: L('Match the app to your piano', 'Die App auf dein Klavier einstellen'), detail: L('Play one A and hold it', 'Spiel ein A und halte es'), minutes: 1, mode: 'learn', screen: withIntro('tuner', tuner), params: ['piano'] };
    const gym: Step = { short: L('Fingers', 'Finger'), as: L('a short game for the fingers', 'ein kurzes Spiel für die Finger'), title: L('Finger gym', 'Fingertraining'), detail: L('A short game for even fingers, counted in', 'Ein kurzes Spiel für gleichmäßige Finger, mit Einzählen'), minutes: 3, mode: 'nf', screen: withIntro('run', nfRun), params: ['keys'] };
    const lesson: Step = { short: L('Piece', 'Stück'), as: piece.title, title: piece.title, detail: describe(pieceMaterial(piece)), minutes: 5, mode: 'learn', screen: withIntro('piano', pianoLesson), params: [piece.id] };
    // a tune needs the fingers warm; chords need to be found first, and then the way from one to the next
    if ((piece.kind ?? 'melody') === 'melody') return [pitch, gym, lesson];
    const chords = todaysKeyChords();
    const check: Step = { short: L('Chords', 'Akkorde'), as: L('the chord check', 'der Akkord-Check'), title: L(`Chord check: ${chords.map((c) => chordName(c, true)).join(', ')}`, `Akkord-Check: ${chords.map((c) => chordName(c, true)).join(', ')}`), detail: L('Key by key, then all at once; no clock', 'Taste für Taste, dann alle zugleich; ohne Uhr'), minutes: 3, mode: 'learn', screen: withIntro('keys', keyCheck), params: chords };
    const changes: Step = { short: L('Changes', 'Wechsel'), as: L('the chord changes', 'die Akkordwechsel'), title: L('Chord changes', 'Akkordwechsel'), detail: L('One change without a clock, one calm minute, then a short game', 'Ein Wechsel ohne Uhr, eine ruhige Minute, dann ein kurzes Spiel'), minutes: 4, mode: 'nf', screen: withIntro('change', changesStep), params: ['kchanges'] };
    return piece.kind === 'chords' ? [pitch, check, changes, lesson] : [pitch, check, gym, lesson];
  }
  const chords = todaysChords();
  const song = currentSong();
  const hard = barreChord();
  return [
    { short: L('Tune', 'Stimmen'), as: L('tuning', 'das Stimmen'), title: L('Tune up', 'Stimmen'), detail: L('Pluck a string, the app says which way to turn', 'Zupf eine Saite, die App sagt, in welche Richtung du drehst'), minutes: 1, mode: 'learn', screen: withIntro('tuner', tuner), params: [] },
    { short: L('Chords', 'Akkorde'), as: L('the chord check', 'der Akkord-Check'), title: L(`Chord check: ${chords.map((c) => CHORDS[c].name).join(', ')}`, `Akkord-Check: ${chords.map((c) => CHORDS[c].name).join(', ')}`), detail: L('String by string, no clock', 'Saite für Saite, ohne Uhr'), minutes: 3, mode: 'learn', screen: withIntro('chord', chordCheck), params: chords },
    { short: L('Changes', 'Wechsel'), as: L('the chord changes', 'die Akkordwechsel'), title: L('Chord changes', 'Akkordwechsel'), detail: L('One change without a clock, one calm minute, then a short game', 'Ein Wechsel ohne Uhr, eine ruhige Minute, dann ein kurzes Spiel'), minutes: 4, mode: 'nf', screen: withIntro('change', changesStep), params: ['changes'] },
    { short: L('Song', 'Song'), as: song.title, title: song.title, detail: describe(songMaterial(song)), minutes: 5, mode: 'learn', screen: withIntro('song', songLesson), params: [song.id] },
    // the hard chord comes last and is optional: it is the long-term goal, never a gate
    ...(hard ? [{ short: L('Barre', 'Barré'), as: L('the barre chord, if you like', 'der Barré-Akkord, wenn du magst'), title: L(`Barre practice: ${CHORDS[hard].name}`, `Barré-Übung: ${CHORDS[hard].name}`), detail: L('Two minutes on the hard one, if you like', 'Zwei Minuten für den schweren, wenn du magst'), minutes: 2, mode: 'learn' as const, screen: withIntro('chord', chordCheck), params: [hard, 'stay'] }] : []),
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

export const session: Screen = (root, [how]) => {
  const inst = store.settings.instrument;
  const steps = plan();
  const before: Record<string, SkillRecord> = JSON.parse(JSON.stringify(store.skills.data));
  const began = Date.now();
  /** remembers the step reached, so that leaving by mistake costs nothing */
  const mark = (step: number): void => {
    store.progress[`session:${inst}:day`] = dayOf(Date.now());
    store.progress[`session:${inst}:step`] = step;
    store.save();
  };
  if (how === 'new') {
    mark(0);
    history.replaceState(null, '', '#/session');
  }
  let i = Math.min(resumeAt(inst), steps.length - 1);
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
    if (finished(inst, id)) {
      // on to the next one, easiest first
      const all: { id: string; title: string }[] = inst === 'voice' ? songsToSing() : inst === 'piano' ? piecesByDifficulty().filter((p) => !p.of || p.id === id) : songsByDifficulty();
      const next = all.find((x) => !finished(inst, x.id));
      if (next) {
        store.current[inst] = next.id;
        moved = L(`${all.find((x) => x.id === id)!.title} is at full speed. Next: ${next.title}.`, `${all.find((x) => x.id === id)!.title} läuft im vollen Tempo. Als Nächstes: ${next.title}.`);
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
    const days = store.streak(now);
    const mins = Math.max(1, Math.round((now - began) / 60000));
    root.innerHTML = `<div class="page mid">
      <div><p class="kick">${days > 1 ? L(`Day ${days} in a row`, `Tag ${days} in Folge`) : L('First day of a new streak', 'Erster Tag einer neuen Serie')}</p>
        <h1>${L(`Done. ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`, `Fertig. ${mins} ${mins === 1 ? 'Minute' : 'Minuten'}.`)}</h1></div>
      ${rows ? `<ul class="res">${rows}</ul>` : `<p class="note">${L('Nothing was measured this time. That is fine: the steps are still there tomorrow.', 'Diesmal wurde nichts gemessen. Das ist in Ordnung: Die Schritte sind morgen noch da.')}</p>`}
      ${moved ? `<p class="note"><b>${esc(moved)}</b></p>` : weakest ? `<p class="note">${L(`<b>Tomorrow</b> comes back to ${esc(skillLabel(weakest))}.`, `<b>Morgen</b> geht es wieder um ${esc(skillLabel(weakest))}.`)}</p>` : ''}
      <div class="row"><a class="btn primary big" href="#/">${L('Finish', 'Abschließen')} <kbd>${L('Space', 'Leertaste')}</kbd></a><a class="btn big" href="#/nf">${L('Keep playing: a game', 'Weiterspielen: ein Spiel')}</a></div>
    </div>`;
    stopKeys = keys({ ' ': () => (location.hash = '/') });
    $('.btn.primary', root).focus();
  }

  show();
  return () => {
    cleanup?.();
    stopKeys();
  };
};
