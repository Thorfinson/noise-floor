import { afterEach, describe, expect, it, vi } from 'vitest';

// the screens hang a listener on the window when they are loaded: a stand-in will do here
vi.hoisted(() => {
  const g = globalThis as unknown as { addEventListener?: unknown };
  g.addEventListener ??= () => undefined;
});

import { setLang } from '../src/core/i18n';
import { store } from '../src/core/store';
import { barKey, type Song } from '../src/music/content';
import { finished, songsByDifficulty } from '../src/music/difficulty';
import { stageConfirmed } from '../src/screens/learn';
import { nextAfter } from '../src/screens/session';

afterEach(() => {
  setLang('en');
  store.skills.data = {};
  store.current = {};
});

/** Every bar of a song at full speed, as a song that is finished has them. */
function finish(song: Song): void {
  song.bars.forEach((_, i) => (store.skills.data[barKey(song, i)] = { level: 4, best: 100, last: Date.now(), tops: 0 }));
}

describe('the check at the end of a stage', () => {
  const OPEN = ['Em', 'Am', 'E', 'A', 'D', 'C', 'G', 'Dm'];

  it('is passed when every chord it asks for has rung clean', () => {
    expect(stageConfirmed(OPEN, new Set(OPEN))).toBe(true);
    expect(stageConfirmed(OPEN, new Set(OPEN.slice(1)))).toBe(false);
  });

  it('counts a chord played again once, not once a pass', () => {
    // seven chords clean and the last one twice (R, or ← during the countdown) are still seven chords
    const passed = new Set<string>();
    for (const c of [...OPEN.slice(0, 7), 'G', 'G']) passed.add(c);
    expect(passed.size).toBe(7);
    expect(stageConfirmed(OPEN, passed)).toBe(false);
  });

  it('confirms nothing when it asks for no chord (the Em shown then is not asked for)', () => {
    expect(stageConfirmed([], new Set(['Em']))).toBe(false);
  });
});

describe('the summary of a session on a finished song', () => {
  it('goes on with a song, never with a riff or a lick, as the session would choose by itself', () => {
    const order = songsByDifficulty();
    const k = order.findIndex((s) => s.exercise);
    expect(k).toBeGreaterThan(0);
    // every song before the first exercise is finished: the first one not finished in the plain order is the exercise
    for (const s of order.slice(0, k)) finish(s);
    expect(finished('guitar', order[k].id)).toBe(false);
    const step = nextAfter('guitar', order[0].id);
    expect(step).not.toBeNull();
    expect(step!.done.id).toBe(order[0].id);
    const next = order.find((s) => s.id === step!.next.id)!;
    expect(next.exercise).toBeFalsy();
    expect(next.id).toBe(order.find((s) => !s.exercise && !finished('guitar', s.id))!.id);
  });

  it('still says which one was finished when that was an exercise the player chose', () => {
    const riff = songsByDifficulty().find((s) => s.exercise)!;
    finish(riff);
    const step = nextAfter('guitar', riff.id);
    expect(step!.done.title).toBe(riff.title);
    expect(songsByDifficulty().find((s) => s.id === step!.next.id)!.exercise).toBeFalsy();
  });

  it('moves nothing while the song is not finished', () => {
    expect(nextAfter('guitar', songsByDifficulty()[0].id)).toBeNull();
  });
});
