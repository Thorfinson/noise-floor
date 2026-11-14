import { afterEach, describe, expect, it, vi } from 'vitest';

// the screens hang a listener on the window when they are loaded: a stand-in will do here
vi.hoisted(() => {
  const g = globalThis as unknown as { addEventListener?: unknown };
  g.addEventListener ??= () => undefined;
});

import { DAY_MS, dayOf } from '../src/core/days';
import { setLang } from '../src/core/i18n';
import { store } from '../src/core/store';
import { planIcs, planSaid } from '../src/screens/habit';
import { currentId, plan, shortPlan } from '../src/screens/session';

afterEach(() => {
  setLang('en');
  store.plan = null;
  store.practice = {};
  store.settings.instrument = 'guitar';
});

describe('a habit without pressure', () => {
  it('says the plan as a plan: a moment of the day and how long', () => {
    const p = { cue: 'dinner', minutes: 10, time: '19:30' };
    expect(planSaid(p)).toBe('After dinner, I play for 10 minutes, at about 19:30.');
    setLang('de');
    expect(planSaid(p)).toBe('Nach dem Abendessen spiele ich 10 Minuten, gegen 19:30 Uhr.');
  });

  it('makes a calendar entry every day at that time, as long as the plan says', () => {
    const ics = planIcs({ cue: 'dinner', minutes: 15, time: '19:30' }, Date.UTC(2026, 10, 14, 9));
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toMatch(/RRULE:FREQ=DAILY/);
    expect(ics).toMatch(/DTSTART:\d{8}T193000/);
    expect(ics).toMatch(/DTEND:\d{8}T194500/);
    // commas in the text are escaped, as the calendar format asks
    expect(ics).toMatch(/DESCRIPTION:After dinner\\, I play for 15 minutes\\, at about 19:30\./);
  });

  it('has a short session of the first step and the song, on every instrument', () => {
    for (const inst of ['guitar', 'piano', 'voice'] as const) {
      store.settings.instrument = inst;
      const s = shortPlan();
      expect(s).toHaveLength(2);
      expect(s[0].title).toBe(plan()[0].title);
      expect(s[1].params[0]).toBe(currentId(inst));
      expect(s.reduce((n, x) => n + x.minutes, 0)).toBeLessThanOrEqual(6);
    }
  });

  it('counts a day as played from a minute of playing, kept for a year', () => {
    const now = Date.UTC(2026, 10, 14, 12);
    store.logPractice(30, now);
    expect(store.playedDays().has(dayOf(now))).toBe(false);
    store.logPractice(45, now);
    expect(store.playedDays().has(dayOf(now))).toBe(true);
    store.practice[dayOf(now) - 500] = 600;
    store.logPractice(10, now + DAY_MS);
    expect(store.practice[dayOf(now) - 500]).toBeUndefined();
  });
});
