import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeIndexedDB } from './fakeidb';

/*
 * The progress file at the start of the app and after: each test starts the app anew (fresh modules), with
 * what this browser kept, a file chosen before, and a stand-in for the browser's file handle.
 */

const g = globalThis as unknown as { window?: unknown; localStorage?: unknown; indexedDB?: unknown };
const HOUR = 3600000;
let listeners: ((e: { key: string | null; newValue: string | null }) => void)[] = [];

interface FakeFile {
  name: string;
  text: string;
  writes: number;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
  queryPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
}

function fakeFile(text: string): FakeFile {
  const f: FakeFile = {
    name: 'noise-floor-progress.json',
    text,
    writes: 0,
    getFile: async () => ({ text: async () => f.text }),
    createWritable: async () => ({ write: async (d: string) => void ((f.text = d), f.writes++), close: async () => undefined }),
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  };
  return f;
}

/** A save of the app's, as another computer would have written it. */
const saveOf = (savedAt: number, extra: Record<string, unknown> = {}): string => JSON.stringify({ app: 'noise-floor/v1', skills: {}, settings: {}, savedAt, ...extra });

/** The app opened anew: this browser holds a save of then, the file chosen before is the one given. */
async function start(browserSavedAt: number, file: FakeFile) {
  vi.resetModules();
  const mem = new Map<string, string>([['noise-floor/v1', JSON.stringify({ savedAt: browserSavedAt, sessions: [browserSavedAt] })]]);
  g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  listeners = [];
  g.window = { showSaveFilePicker: () => undefined, addEventListener: (type: string, fn: (typeof listeners)[number]) => void (type === 'storage' && listeners.push(fn)) };
  const idb = fakeIndexedDB();
  g.indexedDB = idb.api;
  idb.data.set('noise-floor-file', new Map([['h', new Map<unknown, unknown>([['file', file]])]]));
  const { store } = await import('../src/core/store');
  const pf = await import('../src/core/progressfile');
  return { store, pf, mem };
}

/** The moment after a burst of changes, when the file is written (and the writing, which waits on the file, is through). */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(2000);
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  delete g.window;
  delete g.localStorage;
  delete g.indexedDB;
});

describe('a progress file at the start', () => {
  it('a newer file waits to be loaded, though a page saved as it opened; nothing is written over it meanwhile', async () => {
    const then = Date.now() - 2 * HOUR;
    const file = fakeFile(saveOf(then + HOUR, { sessions: [then + HOUR] }));
    const { store, pf } = await start(then, file);
    // the page that opens first saves at once, before the file has been read: this browser now looks newer
    store.save();
    await pf.fileAtStart();
    expect(pf.fileState().newer).toBe(then + HOUR);
    expect(file.writes).toBe(0);
    // changes made while it waits are not written into the file
    store.save();
    await settle();
    expect(file.writes).toBe(0);
    // loaded: this browser has the other computer's progress, and the file is then written with it
    await pf.takeNewer(true);
    expect(store.sessions).toEqual([then + HOUR]);
    expect(pf.fileState().newer).toBe(0);
    await settle();
    expect(file.writes).toBe(1);
    expect(JSON.parse(file.text).sessions).toEqual([then + HOUR]);
  });

  it('declined, the file gets this browser’s progress', async () => {
    const then = Date.now() - 2 * HOUR;
    const file = fakeFile(saveOf(then + HOUR));
    const { store, pf } = await start(then, file);
    await pf.fileAtStart();
    await pf.takeNewer(false);
    expect(file.writes).toBe(1);
    expect(JSON.parse(file.text).savedAt).toBe(store.savedAt);
    expect(store.sessions).toEqual([then]);
  });

  it('a file of the same save as this browser is brought up to date with what changed since', async () => {
    const then = Date.now() - 2 * HOUR;
    const file = fakeFile(saveOf(then));
    const { store, pf } = await start(then, file);
    store.sessions.push(then + 1);
    store.save();
    await pf.fileAtStart();
    expect(pf.fileState().newer).toBe(0);
    expect(file.writes).toBe(1);
    expect(JSON.parse(file.text).savedAt).toBe(store.savedAt);
    // and every change after, a moment later
    store.save();
    await settle();
    expect(file.writes).toBe(2);
  });

  it('a half-synced file (no save in it the app can read) is not written over, until it can be read or the player says so', async () => {
    // a sync still running: the file is cut off; savedAtOf finds no save in it (0). Written over, the other
    // computer's progress would be lost for good, so the app leaves it alone and says so.
    const then = Date.now() - 2 * HOUR;
    const whole = saveOf(then - HOUR, { sessions: [then - HOUR] });
    const file = fakeFile(whole.slice(0, 40));
    const { store, pf } = await start(then, file);
    expect(pf.savedAtOf(file.text)).toBe(0);
    await pf.fileAtStart();
    expect(pf.fileState().unreadable).toBe(true);
    store.save();
    await settle();
    expect(file.writes).toBe(0);
    expect(file.text).toBe(whole.slice(0, 40));
    // the sync is done: read again, it is an older save, and the file is brought up to date
    file.text = whole;
    expect(await pf.askAgain()).toBe(true);
    expect(pf.fileState().unreadable).toBe(false);
    expect(file.writes).toBe(1);
    expect(JSON.parse(file.text).savedAt).toBe(store.savedAt);
  });

  it('a file that stays unreadable is written only when the player says to', async () => {
    const then = Date.now() - 2 * HOUR;
    const file = fakeFile('{"app":"noise-floor/v1","sav');
    const { pf } = await start(then, file);
    await pf.fileAtStart();
    expect(pf.fileState().unreadable).toBe(true);
    await pf.takeNewer(false);
    expect(pf.fileState().unreadable).toBe(false);
    expect(file.writes).toBe(1);
    expect(pf.savedAtOf(file.text)).toBeGreaterThan(0);
  });

  it('an empty file (one just made) is written', async () => {
    const file = fakeFile('');
    const { pf } = await start(Date.now() - HOUR, file);
    await pf.fileAtStart();
    expect(pf.fileState().unreadable).toBe(false);
    expect(file.writes).toBe(1);
  });
});

describe('a progress file while the app is open', () => {
  it('is read again before every write: a save from another computer that arrived meanwhile waits, and is not written over', async () => {
    const then = Date.now() - 2 * HOUR;
    const file = fakeFile(saveOf(then));
    const { store, pf } = await start(then, file);
    await pf.fileAtStart();
    store.save();
    await settle();
    const writes = file.writes;
    // the other computer saves into the shared folder
    file.text = saveOf(Date.now() + HOUR, { sessions: [1, 2, 3] });
    store.save();
    await settle();
    expect(file.writes).toBe(writes);
    expect(pf.fileState().newer).toBe(pf.savedAtOf(file.text));
    expect(JSON.parse(file.text).sessions).toEqual([1, 2, 3]);
  });

  it('a save of another tab of this browser is this browser’s: it is no reason to wait', async () => {
    const then = Date.now() - 2 * HOUR;
    const file = fakeFile(saveOf(then));
    const { store, pf, mem } = await start(then, file);
    await pf.fileAtStart();
    // the other tab saves, and writes the file
    const other = Date.now() + 5000;
    const text = JSON.stringify({ savedAt: other, sessions: [other] });
    mem.set('noise-floor/v1', text);
    file.text = saveOf(other, { sessions: [other] });
    for (const fn of listeners) fn({ key: 'noise-floor/v1', newValue: text });
    expect(store.sessions).toEqual([other]);
    // this tab's next save goes into the file as usual
    store.sessions.push(other + 1);
    store.save();
    await settle();
    expect(pf.fileState().newer).toBe(0);
    expect(JSON.parse(file.text).sessions).toEqual([other, other + 1]);
  });

  it('a file chosen that is not the app’s is left alone', async () => {
    const then = Date.now() - HOUR;
    const { pf } = await start(then, fakeFile(saveOf(then)));
    const notOurs = fakeFile('{"hello":"world"}');
    expect(await pf.useFile(notOurs, true)).toBe('not-ours');
    expect(notOurs.writes).toBe(0);
    expect(pf.fileState().status).toBe('none');
  });
});
