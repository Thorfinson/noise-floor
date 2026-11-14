import { afterEach, describe, expect, it, vi } from 'vitest';

// the session's screens hang a listener on the window when they are loaded: a stand-in will do here
vi.hoisted(() => {
  const g = globalThis as unknown as { addEventListener?: unknown };
  g.addEventListener ??= () => undefined;
});
import { DAY_MS, dayOf, weekOf } from '../src/core/days';
import { Skills } from '../src/core/skills';
import { store } from '../src/core/store';
import { barKey, findSong, songLines } from '../src/music/content';
import { dueReviews, enlist, REVIEW_DAYS, repertoire, reviewed, reviewKey, reviewLines, syncReviews } from '../src/music/review';
import { plan } from '../src/screens/session';

/** Every bar of a song played clean at full speed, on the day given. */
function master(id: string, at: number): void {
  const s = findSong(id);
  for (let i = 0; i < s.bars.length; i++) for (let k = 0; k < 3; k++) store.skills.record(barKey(s, i), 100, at + k * 1000);
}

afterEach(() => {
  store.skills.data = {};
  store.reviews = {};
  store.current = {};
  store.progress = {};
  store.settings.instrument = 'guitar';
});

describe('what a skill keeps of its days', () => {
  it('keeps the first try of the last day apart from the best, and the best of each day as its course', () => {
    const s = new Skills();
    const d0 = Date.UTC(2026, 10, 2, 12);
    s.record('bar:x:G', 70, d0);
    s.record('bar:x:G', 85, d0 + 600000);
    expect(s.get('bar:x:G')!.cold).toEqual([dayOf(d0), 70]);
    expect(s.get('bar:x:G')!.h).toEqual([[dayOf(d0), 85]]);
    s.record('bar:x:G', 60, d0 + 2 * DAY_MS);
    // the next day's first try is cold again; the best stays
    expect(s.get('bar:x:G')!.cold).toEqual([dayOf(d0) + 2, 60]);
    expect(s.get('bar:x:G')!.best).toBe(85);
    expect(s.get('bar:x:G')!.h!.map((x) => x[1])).toEqual([85, 60]);
  });

  it('for a time that should fall, takes the lowest of the day as the day', () => {
    const s = new Skills();
    const d0 = Date.UTC(2026, 10, 2, 12);
    s.record('chord:G', 9, d0);
    s.record('chord:G', 6, d0 + 1000);
    expect(s.get('chord:G')!.h).toEqual([[dayOf(d0), 6]]);
    expect(s.get('chord:G')!.cold![1]).toBe(9);
  });

  it('comes due again after gaps that grow with the days it was measured on', () => {
    const s = new Skills();
    const d0 = Date.UTC(2026, 10, 2, 12);
    s.record('chord:Em', 10, d0);
    expect(s.due('chord:Em', d0 + 1 * DAY_MS)).toBe(false);
    expect(s.due('chord:Em', d0 + 2 * DAY_MS)).toBe(true);
    // measured on four days: the gap is now thirty days
    for (const k of [3, 6, 10]) s.record('chord:Em', 10, d0 + k * DAY_MS);
    expect(s.get('chord:Em')!.days).toBe(4);
    expect(s.due('chord:Em', d0 + 20 * DAY_MS)).toBe(false);
    expect(s.due('chord:Em', d0 + 41 * DAY_MS)).toBe(true);
  });
});

describe('songs that come back', () => {
  const id = 'tom-dooley';

  it('a song played clean all through joins the list once, and is due three days later', () => {
    const t = Date.UTC(2026, 10, 2, 12);
    expect(enlist('guitar', id, t)).toBe(false);
    master(id, t);
    expect(enlist('guitar', id, t)).toBe(true);
    expect(enlist('guitar', id, t)).toBe(false);
    expect(dueReviews('guitar', t + 2 * DAY_MS)).toEqual([]);
    expect(dueReviews('guitar', t + 3 * DAY_MS + 5000).map((x) => x.id)).toEqual([id]);
  });

  it('a clean visit pushes the next one further out; one that falls apart brings it back tomorrow, with the click', () => {
    const t = Date.UTC(2026, 10, 2, 12);
    master(id, t);
    enlist('guitar', id, t);
    const v1 = t + 3 * DAY_MS;
    reviewed('guitar', id, true, v1);
    expect(store.reviews[reviewKey('guitar', id)].due).toBe(v1 + REVIEW_DAYS[1] * DAY_MS);
    const v2 = v1 + REVIEW_DAYS[1] * DAY_MS;
    reviewed('guitar', id, false, v2);
    expect(store.reviews[reviewKey('guitar', id)]).toMatchObject({ relearn: true, step: 0, due: v2 + DAY_MS });
    // passed again after it slipped: back on the first gap, not further
    reviewed('guitar', id, true, v2 + DAY_MS);
    expect(store.reviews[reviewKey('guitar', id)]).toMatchObject({ relearn: false, step: 0, due: v2 + DAY_MS + REVIEW_DAYS[0] * DAY_MS });
  });

  it('the visits go round the song two lines at a time', () => {
    const t = Date.UTC(2026, 10, 2, 12);
    master(id, t);
    enlist('guitar', id, t);
    const n = songLines(findSong(id)).length;
    expect(reviewLines('guitar', id)).toEqual(n > 1 ? [0, 1] : [0]);
    reviewed('guitar', id, true, t + 3 * DAY_MS);
    if (n > 2) expect(reviewLines('guitar', id)).toEqual([2, 3 % n]);
  });

  it("puts a due song into today's session, right after tuning, as a visit from cold", () => {
    const t = Date.now() - 4 * DAY_MS;
    master(id, t);
    syncReviews('guitar', Date.now());
    const steps = plan();
    expect(steps[1].params).toEqual([id, 'review']);
    expect(steps[0].params).toEqual([]);
  });

  it('lists the repertoire with its best, its last cold try and its freshness', () => {
    const t = Date.UTC(2026, 10, 2, 12);
    master(id, t);
    const rep = repertoire('guitar', t + DAY_MS);
    expect(rep.map((x) => x.id)).toEqual([id]);
    expect(rep[0]).toMatchObject({ best: 100, cold: 100, freshness: 'fresh' });
    expect(repertoire('guitar', t + 4 * DAY_MS)[0].freshness).toBe('due');
  });
});

describe('the week', () => {
  it('counts the days played in the week from Monday, sessions and practice time alike', () => {
    const monday = Date.UTC(2026, 10, 9, 12); // a Monday
    expect(weekOf(dayOf(monday))).toBe(dayOf(monday));
    const sessions = store.sessions;
    const practice = store.practice;
    store.sessions = [monday, monday + 2 * DAY_MS];
    store.practice = { [dayOf(monday + 3 * DAY_MS)]: 300, [dayOf(monday + 4 * DAY_MS)]: 20 };
    try {
      const w = store.week(monday + 5 * DAY_MS);
      expect(w.played).toEqual([true, false, true, true, false, false, false]);
      expect(w.count).toBe(3);
    } finally {
      store.sessions = sessions;
      store.practice = practice;
    }
  });
});
