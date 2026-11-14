/**
 * What has been learned is kept by playing it again, spaced out: a song played clean all through comes back
 * after 3 days, then 10, 30, 90 and 180, each time cold, two lines at full speed with no run-up. A visit that
 * goes well pushes the next one further out; one that falls apart brings the song back the next day, with
 * the click. Practice skills decay: within half a year half of the accuracy of a skill that is not played
 * is gone (Tatel et al. 2025), and spacing the practice over days is what keeps it.
 *
 * From the same records comes the repertoire: what the player can play, since when, how fast, and how it
 * went the last time it was played cold.
 */
import { DAY_MS, dayOf } from '../core/days';
import { L } from '../core/i18n';
import { store, type Instrument, type Review } from '../core/store';
import { allPieces, allSongs, barKey, findPiece, findSong, phraseKey, songLines } from './content';
import { finished } from './difficulty';
import { findSongToSing, sungPhraseKey, voiceBook } from './voicebook';

/** Days to the next visit after so many visits passed in a row. */
export const REVIEW_DAYS = [3, 10, 30, 90, 180];

export const reviewKey = (inst: Instrument, id: string): string => `${inst}:${id}`;

/** The skills a song is measured with: its bars, phrases or sung phrases. */
export function songSkills(inst: Instrument, id: string): string[] {
  if (inst === 'voice') {
    const s = findSongToSing(id);
    return s.phrases.map((_, i) => sungPhraseKey(s, i));
  }
  if (inst === 'piano') {
    const p = findPiece(id);
    return [...new Set(p.phrases.map((_, i) => phraseKey(p, i)))];
  }
  const s = findSong(id);
  return [...new Set(s.bars.map((_, i) => barKey(s, i)))];
}

/** How many lines (or phrases) a visit can start at. */
export function lineCount(inst: Instrument, id: string): number {
  if (inst === 'voice') return findSongToSing(id).phrases.length;
  if (inst === 'piano') return findPiece(id).phrases.length;
  return songLines(findSong(id)).length;
}

/** Every song, piece or song to sing of an instrument, by id and title. */
export function everything(inst: Instrument): { id: string; title: string }[] {
  if (inst === 'voice') return voiceBook();
  if (inst === 'piano') return allPieces();
  return allSongs();
}

const exists = (inst: Instrument, id: string): boolean => everything(inst).some((x) => x.id === id);

/** The last time any part of a song was measured clean. */
export function lastPlayed(inst: Instrument, id: string): number {
  return Math.max(0, ...songSkills(inst, id).map((k) => store.skills.get(k)?.last ?? 0));
}

/** A song that has been played clean all through goes on the list of songs that come back; once. */
export function enlist(inst: Instrument, id: string, now = Date.now()): boolean {
  const key = reviewKey(inst, id);
  if (store.reviews[key] || !exists(inst, id) || !finished(inst, id)) return false;
  store.reviews[key] = { since: lastPlayed(inst, id) || now, step: 0, due: (lastPlayed(inst, id) || now) + REVIEW_DAYS[0] * DAY_MS, at: 0 };
  return true;
}

/** Every part of it played clean at full speed, read off the song itself (cheaper than looking it up by id). */
function done(inst: Instrument, x: { id: string }): boolean {
  const lv = (k: string): boolean => store.skills.level(k) >= 4;
  if (inst === 'voice') {
    const s = x as ReturnType<typeof voiceBook>[number];
    return s.phrases.every((_, i) => lv(sungPhraseKey(s, i)));
  }
  if (inst === 'piano') {
    const p = x as ReturnType<typeof allPieces>[number];
    return p.phrases.every((_, i) => lv(phraseKey(p, i)));
  }
  const s = x as ReturnType<typeof allSongs>[number];
  return s.bars.every((_, i) => lv(barKey(s, i)));
}

/** Takes every finished song of the instrument onto the list, for songs finished before there was a list. */
export function syncReviews(inst: Instrument, now = Date.now()): void {
  let added = false;
  for (const x of everything(inst)) {
    if (store.reviews[reviewKey(inst, x.id)] || !done(inst, x)) continue;
    const last = lastPlayed(inst, x.id) || now;
    store.reviews[reviewKey(inst, x.id)] = { since: last, step: 0, due: last + REVIEW_DAYS[0] * DAY_MS, at: 0 };
    added = true;
  }
  if (added) store.save();
}

/** The songs due today, the longest waiting first. */
export function dueReviews(inst: Instrument, now = Date.now()): { id: string; title: string; review: Review }[] {
  const prefix = inst + ':';
  const titles = new Map(everything(inst).map((x) => [x.id, x.title]));
  return Object.entries(store.reviews)
    .filter(([k, r]) => k.startsWith(prefix) && r.due <= now && titles.has(k.slice(prefix.length)))
    .map(([k, review]) => ({ id: k.slice(prefix.length), title: titles.get(k.slice(prefix.length))!, review }))
    .sort((a, b) => a.review.due - b.review.due);
}

/** The lines a visit plays: two, starting where the last visit stopped, so that the visits go round the song. */
export function reviewLines(inst: Instrument, id: string): number[] {
  const r = store.reviews[reviewKey(inst, id)];
  const n = lineCount(inst, id);
  const at = Math.min(n - 1, r?.at ?? 0);
  return n > 1 ? [at, (at + 1) % n].filter((v, i, a) => a.indexOf(v) === i) : [0];
}

/**
 * A visit is over. Clean: the gap to the next one grows. Not clean: back again tomorrow, with the click.
 * Returns what to tell the player.
 */
export function reviewed(inst: Instrument, id: string, clean: boolean, now = Date.now()): string {
  const key = reviewKey(inst, id);
  const r = store.reviews[key] ?? { since: now, step: 0, due: now, at: 0 };
  const n = lineCount(inst, id);
  r.last = now;
  r.ok = clean;
  r.at = (r.at + 2) % Math.max(1, n);
  if (clean) {
    r.step = Math.min(REVIEW_DAYS.length - 1, r.step + (r.relearn ? 0 : 1));
    r.relearn = false;
    r.due = now + REVIEW_DAYS[r.step] * DAY_MS;
  } else {
    r.step = 0;
    r.relearn = true;
    r.due = now + DAY_MS;
  }
  store.reviews[key] = r;
  store.save();
  const days = Math.round((r.due - now) / DAY_MS);
  return clean
    ? L(`Still there, from cold. It comes back in ${days} days.`, `Sitzt noch, aus dem Stand. Es kommt in ${days} Tagen wieder.`)
    : L('It has slipped a little: that is what the visits are for. Tomorrow it comes back with the click.', 'Es ist ein wenig verrutscht: Genau dafür sind die Besuche da. Morgen kommt es mit Klick wieder.');
}

export type Freshness = 'fresh' | 'due' | 'slipped';

export interface RepertoireItem {
  id: string;
  title: string;
  since: number;
  last: number;
  /** the slowest part at its best, in % of full speed */
  best: number;
  /** the first try of the last day it was played, the slowest part, in % of full speed; 0 if not known */
  cold: number;
  due: number;
  freshness: Freshness;
  /** how many visits it has passed in a row */
  step: number;
}

/** What the player can play on an instrument: every song that has been played clean all through. */
export function repertoire(inst: Instrument, now = Date.now()): RepertoireItem[] {
  syncReviews(inst, now);
  const prefix = inst + ':';
  const titles = new Map(everything(inst).map((x) => [x.id, x.title]));
  return Object.entries(store.reviews)
    .filter(([k]) => k.startsWith(prefix) && titles.has(k.slice(prefix.length)))
    .map(([k, r]): RepertoireItem => {
      const id = k.slice(prefix.length);
      const recs = songSkills(inst, id).map((key) => store.skills.get(key));
      const best = Math.min(...recs.map((x) => (x && isFinite(x.best) ? x.best : 0)));
      const coldDay = Math.max(0, ...recs.map((x) => x?.cold?.[0] ?? 0));
      const colds = recs.map((x) => (x?.cold && x.cold[0] === coldDay ? x.cold[1] : null)).filter((v): v is number => v !== null);
      return {
        id,
        title: titles.get(id)!,
        since: r.since,
        last: Math.max(r.last ?? 0, lastPlayed(inst, id)),
        best: Math.round(best),
        cold: colds.length ? Math.round(Math.min(...colds)) : 0,
        due: r.due,
        freshness: r.relearn ? 'slipped' : r.due <= now ? 'due' : 'fresh',
        step: r.step,
      };
    })
    .sort((a, b) => a.since - b.since);
}

/** "today", "tomorrow", "in 3 days", "3 days ago": a day relative to today. */
export function relDay(t: number, now = Date.now()): string {
  const d = dayOf(t) - dayOf(now);
  if (d === 0) return L('today', 'heute');
  if (d === 1) return L('tomorrow', 'morgen');
  if (d === -1) return L('yesterday', 'gestern');
  return d > 0 ? L(`in ${d} days`, `in ${d} Tagen`) : L(`${-d} days ago`, `vor ${-d} Tagen`);
}

/**
 * Does coming back keep the songs? The one measurement the app can make on its own player: of the songs in the
 * repertoire for a month or longer, those that came back twice or more against the others, by how much of
 * their best is left at the first try of a later day (the last cold try against the best). The research it
 * rests on found that skills lose half their accuracy in about six months without practice, and that spacing
 * helps; whether it does for this player, only their own songs can say. Below five songs a side, or before a
 * month, it says that it is too early.
 */
export interface StayResult {
  /** songs that came back at least twice, and the others: how many, and the share of their best that was left (0 to 1) */
  often: { n: number; kept: number };
  seldom: { n: number; kept: number };
  /** enough to say something: five songs a side, each a month in the repertoire, each with a cold try */
  enough: boolean;
}

export function whatStays(inst: Instrument, now = Date.now(), min = 5): StayResult {
  const month = 30 * 86400000;
  const items = repertoire(inst, now).filter((x) => now - x.since >= month && x.cold > 0 && x.best > 0);
  const side = (xs: RepertoireItem[]): { n: number; kept: number } => ({ n: xs.length, kept: xs.length ? xs.reduce((s, x) => s + Math.min(1, x.cold / x.best), 0) / xs.length : 0 });
  const often = side(items.filter((x) => x.step >= 2));
  const seldom = side(items.filter((x) => x.step < 2));
  return { often, seldom, enough: often.n >= min && seldom.n >= min };
}
