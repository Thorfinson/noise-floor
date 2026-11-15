import { afterEach, describe, expect, it, vi } from 'vitest';

// the screens hang a listener on the window when they are loaded: a stand-in will do here
vi.hoisted(() => {
  const g = globalThis as unknown as { addEventListener?: unknown };
  g.addEventListener ??= () => undefined;
});

import { DAY_MS } from '../src/core/days';
import { Skills } from '../src/core/skills';
import { ASIDE_KEY, Store, store } from '../src/core/store';
import { clearTakes, deleteTakes, downsample, hasTakes, loadTake, saveTake, TAKE_RATE } from '../src/core/takes';
import { allSongs, type PianoPiece } from '../src/music/content';
import { voiceBook } from '../src/music/voicebook';
import { fakeIndexedDB } from './fakeidb';

/** A browser's local storage, in memory. */
function memory(start: Record<string, string> = {}): { mem: Map<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const mem = new Map(Object.entries(start));
  return { mem, getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
}

const backupOf = (fields: Record<string, unknown>): string => JSON.stringify({ app: 'noise-floor/v1', skills: {}, ...fields });

/** Everything the pages ask of what is saved, as they ask it: none of it may throw. */
function useAll(s: Store): void {
  const now = Date.now();
  s.streak(now);
  s.week(now);
  s.playedDays();
  s.isFav('guitar', 'tom-dooley');
  s.toggleFav('guitar', 'tom-dooley');
  s.opened('piano', 'ode-to-joy');
  s.skills.rank();
  for (const k of Object.keys(s.skills.data)) {
    s.skills.next(k);
    s.skills.due(k, now);
    s.skills.weight(k, now);
  }
  s.lastRun('fingers');
  s.logPractice(30, now);
  JSON.parse(s.backup());
}

afterEach(() => {
  store.pieces = [];
  store.takes = {};
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
});

describe('what is read back is checked field by field', () => {
  it('leaves out fields of the wrong type, keeps the others, and nothing throws afterwards', () => {
    const s = new Store(memory());
    const ok = s.restore(
      backupOf({
        songs: {},
        sessions: 'x',
        favs: 5,
        practice: { 20400: 300, 20401: 'lots' },
        skills: { 'chord:G': null, 'chord:C': { level: 2, best: 10, last: 5, tops: 0 }, 'bogus:x': { level: 3, best: 1, last: 1, tops: 0 }, 'pair:Em>Am': { level: 'x' }, toString: { level: 1 } },
        reviews: { 'guitar:tom-dooley': { since: 1, step: 0, due: 2, at: 0 }, 'guitar:x': 'soon' },
        runs: [{ t: 1, type: 'fingers', score: 10, wave: 1, waves: 3, rows: [] }, null, { t: 'x' }],
        plan: { cue: 'dinner', minutes: 10, time: '"><img src=x onerror=alert(1)>' },
        current: { guitar: 'tom-dooley', piano: '"><b>' },
        best: [],
      }),
    );
    expect(ok).toBe(true);
    expect(s.songs).toEqual([]);
    expect(s.sessions).toEqual([]);
    expect(s.favs).toEqual([]);
    expect(s.practice).toEqual({ 20400: 300 });
    expect(Object.keys(s.skills.data)).toEqual(['chord:C']);
    expect(Object.keys(s.reviews)).toEqual(['guitar:tom-dooley']);
    expect(s.runs.map((r) => r.type)).toEqual(['fingers']);
    // a plan whose time is not a time is no plan; an id with markup in it is no id
    expect(s.plan).toBeNull();
    expect(s.current).toEqual({ guitar: 'tom-dooley' });
    expect(s.best).toEqual({});
    expect(() => useAll(s)).not.toThrow();
    expect(() => allSongs()).not.toThrow();
  });

  it('keeps a title with markup as text, and leaves out a song whose id or bars are not what they must be', () => {
    const s = new Store(memory());
    const bars = [{ chord: 'G', notes: [{ s: 0, f: 0, strum: 'G' }] }];
    s.restore(
      backupOf({
        songs: [
          { id: 'my-1', title: '<img src=x onerror=alert(1)>', noteDur: 0.4, beat: 2, bars, custom: true },
          { id: '"><img src=x onerror=alert(1)>', title: 'Bad id', noteDur: 0.4, beat: 2, bars, custom: true },
          { id: 'my-2', title: 'Bad bar', noteDur: 0.4, beat: 2, bars: [{ notes: [{ s: 'x', f: 0 }] }], custom: true },
          { id: 'my-3', title: 'No bars', noteDur: 0.4, beat: 2, bars: [], custom: true },
        ],
        pieces: [{ id: 'my-p', title: 'Mine', noteDur: 0.5, beat: 1, phrases: [[{ midi: 60 }, { midi: 62, len: 2 }]], parts: ['Verse', null], custom: true }, { id: 'my-q', title: 'Broken', noteDur: 0.5, beat: 1, phrases: [[{ midi: '60' }]] }],
      }),
    );
    expect(s.songs.map((x) => [x.id, x.title])).toEqual([['my-1', '<img src=x onerror=alert(1)>']]);
    expect(s.songs[0].bars).toEqual(bars);
    expect(s.pieces.map((p) => p.id)).toEqual(['my-p']);
    // what a piece leaves out gets its default; a phrase without a part keeps its place
    expect(s.pieces[0]).toMatchObject({ hand: 'right hand', parts: ['Verse', undefined] });
    expect(() => useAll(s)).not.toThrow();
  });

  it('takes settings of the right type and range only; what belongs to this computer stays as it is', () => {
    const s = new Store(memory());
    s.settings.latency = 0.12;
    s.settings.deviceId = 'this-mic';
    s.settings.uiScale = 1.3;
    s.takes = { 'guitar:tom-dooley': { last: { t: 1, secs: 30, tempo: 100, bars: [] } } };
    s.restore(
      backupOf({
        settings: { a4: '<b>', pianoA4: 432, instrument: 'drums', lang: 'de', clickSound: 'click', latency: 0.3, deviceId: 'other-mic', uiScale: 1, ringTypical: 0.2, weekGoal: 5, mic: 'yes' },
        takes: { 'guitar:other': { last: { t: 2, secs: 10, tempo: 80, bars: [] } } },
      }),
    );
    expect(s.settings).toMatchObject({ a4: 440, pianoA4: 432, instrument: 'guitar', lang: 'de', clickSound: 'click', ringTypical: 0.2, weekGoal: 5, mic: true });
    expect(s.settings).toMatchObject({ latency: 0.12, deviceId: 'this-mic', uiScale: 1.3 });
    expect(Object.keys(s.takes)).toEqual(['guitar:tom-dooley']);
    // a guitar A outside what the tuner allows (the A of a capo, saved by an older version) is not kept
    s.restore(backupOf({ settings: { a4: 493.9 } }));
    expect(s.settings.a4).toBe(440);
    s.restore(backupOf({ settings: { a4: 432 } }));
    expect(s.settings.a4).toBe(432);
  });

  it('keeps the index of a recording when a field of it is broken: the sound is still there', () => {
    const storage = memory({ 'noise-floor/v1': JSON.stringify({ takes: { 'guitar:a': { last: { t: 5, secs: '<b>', tempo: '<img>', bars: 'x' } }, 'guitar:b': { first: { t: 1, secs: 2, tempo: 90, bars: [{ bar: 0, from: '0', to: 1.5, clean: 1 }, 7] } }, 'guitar:c': 'x' } }) });
    const s = new Store(storage);
    expect(s.takes['guitar:a'].last).toEqual({ t: 5, secs: 0, tempo: 0, bars: [] });
    expect(s.takes['guitar:b'].first!.bars).toEqual([{ bar: 0, from: 0, to: 1.5, clean: false }]);
    expect(s.takes['guitar:c']).toBeUndefined();
  });

  it('refuses a text that is not a backup, and changes nothing then', () => {
    const s = new Store(memory());
    s.skills.record('finger:spider', 85, 5);
    for (const text of ['not json', 'null', '[]', '{"app":"noise-floor/v1"}', '{"app":"noise-floor/v1","skills":[]}', '{"app":"other","skills":{}}']) expect(s.restore(text)).toBe(false);
    expect(s.skills.level('finger:spider')).toBe(2);
  });
});

describe('what this browser kept, when it cannot be read', () => {
  it('starts with nothing kept for "null", and keeps what cannot be read aside instead of saving over it', () => {
    for (const text of ['{"settings":', '[1,2]', '"text"']) {
      const storage = memory({ 'noise-floor/v1': text });
      let s: Store | undefined;
      expect(() => (s = new Store(storage))).not.toThrow();
      expect(s!.settings.instrument).toBe('guitar');
      expect(storage.mem.get(ASIDE_KEY)).toBe(text);
      s!.save();
      // the copy stays when the app saves again
      expect(storage.mem.get(ASIDE_KEY)).toBe(text);
      expect(() => useAll(s!)).not.toThrow();
    }
    const storage = memory({ 'noise-floor/v1': 'null' });
    expect(() => useAll(new Store(storage))).not.toThrow();
  });

  it('keeps a copy aside when a part could not be used, and uses the rest', () => {
    const text = JSON.stringify({ songs: {}, sessions: [1000, 2000], settings: { a4: 436 } });
    const storage = memory({ 'noise-floor/v1': text });
    const s = new Store(storage);
    expect(s.sessions).toEqual([1000, 2000]);
    expect(s.settings.a4).toBe(436);
    expect(storage.mem.get(ASIDE_KEY)).toBe(text);
    // the first copy is the one kept: it holds the most
    const later = memory({ 'noise-floor/v1': '{', [ASIDE_KEY]: text });
    new Store(later);
    expect(later.mem.get(ASIDE_KEY)).toBe(text);
  });

  it('accepts what the browser checks write before a page opens', () => {
    const DAY = DAY_MS;
    const now = Date.now();
    const day = (t: number): number => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY);
    const ago = now - 4 * DAY;
    const skills: Record<string, unknown> = { 'bar:tom-dooley:D': { level: 5, best: 100, last: ago, tops: 3, days: 3, cold: [day(ago), 100], h: [[day(ago) - 6, 85], [day(ago), 100]] }, 'chord:Em': { level: 2, best: 10, last: now - DAY, tops: 0, strings: 6, days: 3, cold: [day(now - DAY), 12], h: [[day(now) - 9, 20]] } };
    const saved = { settings: { a4: 440, mic: false, practiceInstrument: true, strumSelect: false, instrument: 'piano', capo: 2, lang: 'en' }, skills, reviews: { 'guitar:tom-dooley': { since: ago, step: 0, due: ago + 3 * DAY, at: 0 } }, sessions: [now - 2 * DAY], current: { guitar: 'amazing-grace-chords' }, practice: { [day(now - 2 * DAY)]: 900 } };
    const storage = memory({ 'noise-floor/v1': JSON.stringify(saved) });
    const s = new Store(storage);
    expect(s.settings).toMatchObject(saved.settings);
    expect(s.skills.data).toEqual(skills);
    expect(s.reviews).toEqual(saved.reviews);
    expect(s.current).toEqual(saved.current);
    expect(s.practice).toEqual(saved.practice);
    expect(storage.mem.has(ASIDE_KEY)).toBe(false);
  });
});

describe('skills through JSON', () => {
  it('a chord whose first check was not all clean keeps "not clean yet" through a save, and its first clean time counts', () => {
    const storage = memory();
    const a = new Store(storage);
    a.skills.record('chord:F', Infinity, 1000, 4);
    a.skills.record('pitch:match', Infinity, 1000, 3);
    a.save();
    const b = new Store(storage);
    expect(b.skills.get('chord:F')).toMatchObject({ level: 0, best: Infinity, strings: 4 });
    expect(b.skills.record('chord:F', 12, 2000).after).toBe(3);
    expect(b.skills.get('chord:F')!.best).toBe(12);
    expect(b.skills.get('pitch:match')!.best).toBe(Infinity);
    // and through a backup file, onto another computer
    const c = new Store(memory());
    expect(c.restore(a.backup())).toBe(true);
    expect(c.skills.get('chord:F')!.best).toBe(Infinity);
    c.skills.record('chord:F', 20, 3000);
    expect(c.skills.get('chord:F')!.best).toBe(20);
  });

  it('a best that is null where it is held (an older save) is no best: the next value is taken', () => {
    const s = new Skills({ 'chord:G': { level: 0, best: null as unknown as number, last: 0, tops: 0 } });
    s.record('chord:G', 9, 1000);
    expect(s.get('chord:G')!.best).toBe(9);
  });
});

describe('two tabs', () => {
  it('a tab takes what another saved, so that its own next save does not undo it', () => {
    const storage = memory();
    const a = new Store(storage);
    const b = new Store(storage);
    const settings = b.settings;
    a.skills.record('finger:spider', 85, 5);
    a.sessions.push(1000);
    a.save();
    b.fromOtherTab(storage.getItem('noise-floor/v1'));
    expect(b.skills.level('finger:spider')).toBe(2);
    // a page that holds the settings goes on with the same ones, filled anew
    expect(b.settings).toBe(settings);
    b.best.fingers = 10;
    b.save();
    const c = new Store(storage);
    expect(c.sessions).toEqual([1000]);
    expect(c.skills.level('finger:spider')).toBe(2);
    expect(c.best.fingers).toBe(10);
    // what cannot be read changes nothing
    b.fromOtherTab('{');
    b.fromOtherTab(null);
    expect(b.skills.level('finger:spider')).toBe(2);
  });

  it('saving the time played writes only that, but it is a save: its time moves on and the progress file hears of it', () => {
    const storage = memory();
    const a = new Store(storage);
    const b = new Store(storage);
    a.sessions.push(1000);
    a.save();
    let told = 0;
    b.onSaved = () => told++;
    b.logPractice(120, Date.now());
    const before = b.savedAt;
    b.savePractice();
    const kept = JSON.parse(storage.getItem('noise-floor/v1')!);
    expect(kept.sessions).toEqual([1000]);
    expect(Object.values(kept.practice)).toEqual([120]);
    expect(kept.savedAt).toBe(b.savedAt);
    expect(b.savedAt).toBeGreaterThanOrEqual(before);
    expect(told).toBe(1);
  });
});

describe('the songbook of the voice', () => {
  const piece = (id: string, midi: number): PianoPiece => ({ id, title: id, hand: 'right hand', noteDur: 0.5, beat: 1, phrases: [[{ midi }, { midi: midi + 2 }, { midi: midi + 4 }]], custom: true });

  it('is made anew when the own melodies change, also when as many come in as went out', () => {
    store.pieces = [piece('my-a', 60)];
    expect(voiceBook().some((s) => s.id === 'my-a~voice')).toBe(true);
    store.pieces = [piece('my-b', 62)];
    const ids = voiceBook().map((s) => s.id);
    expect(ids).toContain('my-b~voice');
    expect(ids).not.toContain('my-a~voice');
    store.pieces.push(piece('my-c', 64));
    expect(voiceBook().some((s) => s.id === 'my-c~voice')).toBe(true);
  });
});

describe('recordings', () => {
  it('brings any rate down to 16 kHz, each sample the mean of those it covers', () => {
    const s = Float32Array.from({ length: 48000 }, (_, i) => (i % 3 === 0 ? 0.3 : 0));
    const d = downsample(s, 48000);
    expect(d.length).toBe(16000);
    expect(d[0]).toBe(Math.round(0.1 * 32767));
    expect(d[15999]).toBe(Math.round(0.1 * 32767));
    // a rate that does not divide evenly: still a second (give or take the last sample)
    expect(Math.abs(downsample(new Float32Array(44100), 44100).length - 16000)).toBeLessThanOrEqual(1);
    // the same rate: the samples as they are; and what is too loud is clipped, not wrapped round
    expect(Array.from(downsample(Float32Array.from([0.25, -0.25, 2, -2]), TAKE_RATE))).toEqual([8192, -8192, 32767, -32767]);
    expect(downsample(new Float32Array(0), 48000).length).toBe(0);
  });

  it('keeps the first and the latest of a song together, forgets a song and forgets them all', async () => {
    const idb = fakeIndexedDB();
    (globalThis as { indexedDB?: unknown }).indexedDB = idb.api;
    const meta = (t: number) => ({ t, secs: 1, tempo: 100, bars: [] });
    const one = new Float32Array(48000).fill(0.25);
    expect(await saveTake('guitar', 'tom-dooley', one, 48000, meta(1))).toBe(true);
    expect(await saveTake('guitar', 'tom-dooley', one.map(() => 0.5), 48000, meta(2))).toBe(true);
    expect(store.takes['guitar:tom-dooley']).toEqual({ first: meta(1), last: meta(2) });
    expect((await loadTake('guitar', 'tom-dooley', 'first'))![0]).toBeCloseTo(0.25, 3);
    expect((await loadTake('guitar', 'tom-dooley', 'last'))![0]).toBeCloseTo(0.5, 3);

    // a write that fails keeps nothing of it: neither recording, nor an entry in the index
    idb.fail(true);
    expect(await saveTake('piano', 'ode-to-joy', one, 48000, meta(3))).toBe(false);
    idb.fail(false);
    expect(hasTakes('piano', 'ode-to-joy')).toBe(false);
    expect([...idb.data.get('noise-floor-takes')!.get('audio')!.keys()].some((k) => String(k).startsWith('piano:'))).toBe(false);

    await saveTake('piano', 'ode-to-joy', one, 48000, meta(4));
    expect(await deleteTakes('guitar', 'tom-dooley')).toBe(true);
    expect(store.takes['guitar:tom-dooley']).toBeUndefined();
    expect(await loadTake('guitar', 'tom-dooley', 'first')).toBeNull();
    expect(await loadTake('piano', 'ode-to-joy', 'last')).not.toBeNull();

    expect(await clearTakes()).toBe(true);
    expect(idb.data.get('noise-floor-takes')!.get('audio')!.size).toBe(0);
  });
});
