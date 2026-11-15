/**
 * Your progress in a file of your own choosing, so that it can go with you from one computer to another
 * without an account: put the file in a folder your computers share (OneDrive, Dropbox, iCloud Drive, a USB
 * stick) and choose it on each. After every change the app writes the file; when it opens and the file is
 * newer than what this browser holds (saved on another computer), it offers to load it.
 *
 * It uses the browser's File System Access API (Edge and Chrome on a computer). The handle to the file is
 * kept in this browser (IndexedDB); the browser asks once a visit before the app may write to it again.
 * Nothing is sent anywhere: the file is wherever you put it.
 *
 * The file is never written over a save this browser has not had: before every write it is read again, and a
 * save in it that is newer than the last one this browser shares with it waits for the player to load it or
 * to keep this browser's instead. Nothing is written while one waits.
 */
import { store } from './store';

/** The part of a file handle the app uses (FileSystemFileHandle), so that tests can stand in for it. */
export interface ProgressHandle {
  name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
}

export type FileStatus = 'unsupported' | 'none' | 'ask' | 'ok';

const DB = 'noise-floor-file';
let handle: ProgressHandle | null = null;
let status: FileStatus = 'none';
let lastWritten = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
/** a newer save found in the file, waiting to be loaded or declined */
let newer: { savedAt: number; text: string } | null = null;
/** the file holds text that is not a save of the app's: perhaps it is still being synced; nothing is written over it */
let unreadable = false;
/**
 * The newest save this browser and the file are known to share: what this browser held when the app was
 * opened (taken here, when the app starts and before any page has saved anything: a page that saves as it
 * opens must not make an older browser look newer than the file), then every save written to the file or
 * loaded from it, and the saves of other tabs of this browser.
 */
let seen = store.savedAt;

export const fileSupported = (): boolean => typeof window !== 'undefined' && 'showSaveFilePicker' in window;
export const fileState = (): { status: FileStatus; name: string; lastWritten: number; newer: number; unreadable: boolean } => ({ status: fileSupported() ? status : 'unsupported', name: handle?.name ?? '', lastWritten, newer: newer?.savedAt ?? 0, unreadable });

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(undefined);
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('h');
    open.onerror = () => resolve(undefined);
    open.onsuccess = () => {
      const tx = open.result.transaction('h', mode);
      const req = fn(tx.objectStore('h'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    };
  });
}

/** The time of the last save written in a text of the app's, 0 when it has none. */
export const savedAtOf = (text: string): number => {
  try {
    const s = JSON.parse(text) as { savedAt?: number; app?: string };
    return s.app === 'noise-floor/v1' && typeof s.savedAt === 'number' ? s.savedAt : 0;
  } catch {
    return 0;
  }
};

/**
 * Reads the file and says whether it may be written: not when it holds a save this browser has not had (it
 * waits as the newer one), and not when it holds text that is not a save at all. That is how a file that is
 * still half synced from another computer looks (cut off, or not yet there but for a few bytes): written over,
 * the other computer's progress would be lost, and the sync would carry the loss back to it. It is left
 * alone until it can be read, or until the player says to write this browser's progress into it. An empty
 * file (one just made) may be written.
 */
async function look(h: ProgressHandle): Promise<{ there: number; free: boolean }> {
  const text = await (await h.getFile()).text();
  const there = savedAtOf(text);
  if (there > seen + 1000) {
    newer = { savedAt: there, text };
    return { there, free: false };
  }
  unreadable = !there && !!text.trim();
  return { there, free: !unreadable };
}

/**
 * Writes what is saved now into the file, at once; first it is read again (see look), unless the player
 * said to write it whatever it holds (force).
 */
export async function writeNow(h: ProgressHandle | null = handle, force = false): Promise<boolean> {
  if (!h || status !== 'ok') return false;
  try {
    if (force) {
      newer = null;
      unreadable = false;
    } else if (newer || !(await look(h)).free) return false;
    const text = store.backup();
    const at = store.savedAt;
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
    seen = Math.max(seen, at);
    lastWritten = Date.now();
    return true;
  } catch {
    status = 'ask';
    return false;
  }
}

/** After a change: the file is written a moment later, once for a burst of changes; never while a newer save waits. */
function changed(): void {
  if (status !== 'ok' || newer) return;
  clearTimeout(timer);
  timer = setTimeout(() => void writeNow(), 1500);
}

/** Takes this file from now on: what the app holds is written to it, and every change after. */
export async function useFile(h: ProgressHandle, loadIt: boolean): Promise<'loaded' | 'written' | 'not-ours'> {
  handle = h;
  status = 'ok';
  newer = null;
  unreadable = false;
  await idb('readwrite', (s) => s.put(h, 'file'));
  store.onSaved = changed;
  if (loadIt) {
    const text = await (await h.getFile()).text();
    if (text.trim() && store.restore(text)) {
      seen = Math.max(seen, savedAtOf(text));
      return 'loaded';
    }
    if (text.trim()) {
      // a file that is not the app's is left alone
      await forgetFile();
      return 'not-ours';
    }
  }
  // the player chose this file to keep their progress in: it gets this browser's
  await writeNow(h, true);
  return 'written';
}

export async function forgetFile(): Promise<void> {
  handle = null;
  status = 'none';
  newer = null;
  unreadable = false;
  clearTimeout(timer);
  store.onSaved = undefined;
  await idb('readwrite', (s) => s.delete('file'));
}

/** At the start: the file chosen before, if the browser still lets the app use it, and whether it is newer. */
export async function fileAtStart(): Promise<void> {
  if (!fileSupported()) return;
  const h = (await idb<ProgressHandle>('readonly', (s) => s.get('file') as IDBRequest<ProgressHandle>)) ?? null;
  if (!h) return;
  handle = h;
  const p = (await h.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  status = p === 'granted' ? 'ok' : 'ask';
  if (status === 'ok') await compare();
  // only now: a change made while the file was read must not be written before it was compared
  store.onSaved = changed;
}

/** With a click (the browser asks first): the app may use the file again, this visit; it is read again too. */
export async function askAgain(): Promise<boolean> {
  if (!handle) return false;
  const p = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted';
  status = p === 'granted' ? 'ok' : 'ask';
  if (status === 'ok') await compare();
  return status === 'ok';
}

/** A file saved later than this browser's progress (on another computer) waits to be loaded; otherwise it is brought up to date. */
async function compare(): Promise<void> {
  if (!handle) return;
  try {
    const { there, free } = await look(handle);
    if (free && (there < store.savedAt - 1000 || !there)) await writeNow(handle, true);
  } catch {
    status = 'ask';
  }
}

/**
 * The newer progress of the file replaces this browser's (yes), or the file gets this browser's (no; also
 * the answer to a file that could not be read). A file that turns out not to be a backup when it is loaded is
 * left alone, as one that cannot be read.
 */
export async function takeNewer(yes: boolean): Promise<void> {
  const n = newer;
  newer = null;
  if (yes && n) {
    if (store.restore(n.text)) seen = Math.max(seen, n.savedAt);
    else unreadable = true;
    return;
  }
  await writeNow(handle, true);
}

// another tab of this browser saved: this browser has that save too, and its tabs write it to the file
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key !== 'noise-floor/v1' || !e.newValue) return;
    try {
      const t = (JSON.parse(e.newValue) as { savedAt?: unknown }).savedAt;
      if (typeof t === 'number' && Number.isFinite(t)) seen = Math.max(seen, t);
    } catch {
      // not readable: nothing learned from it
    }
  });

/** Asks where to keep the file (a new one), or which file to take (one made on another computer). */
export async function chooseFile(existing: boolean): Promise<'loaded' | 'written' | 'not-ours' | 'cancelled'> {
  const w = window as unknown as {
    showSaveFilePicker(o: unknown): Promise<ProgressHandle>;
    showOpenFilePicker(o: unknown): Promise<ProgressHandle[]>;
  };
  const types = [{ description: 'Noise Floor progress', accept: { 'application/json': ['.json'] } }];
  try {
    const h = existing ? (await w.showOpenFilePicker({ types, multiple: false }))[0] : await w.showSaveFilePicker({ suggestedName: 'noise-floor-progress.json', types });
    return await useFile(h, existing);
  } catch {
    return 'cancelled';
  }
}
