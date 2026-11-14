/**
 * Your progress in a file of your own choosing, so that it can go with you from one computer to another
 * without an account: put the file in a folder your computers share (OneDrive, Dropbox, iCloud Drive, a USB
 * stick) and choose it on each. After every change the app writes the file; when it opens and the file is
 * newer than what this browser holds (saved on another computer), it offers to load it.
 *
 * It uses the browser's File System Access API (Edge and Chrome on a computer). The handle to the file is
 * kept in this browser (IndexedDB); the browser asks once a visit before the app may write to it again.
 * Nothing is sent anywhere: the file is wherever you put it.
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
let timer = 0;
/** a newer save found in the file at start, waiting to be loaded or declined */
let newer: { savedAt: number; text: string } | null = null;

export const fileSupported = (): boolean => typeof window !== 'undefined' && 'showSaveFilePicker' in window;
export const fileState = (): { status: FileStatus; name: string; lastWritten: number; newer: number } => ({ status: fileSupported() ? status : 'unsupported', name: handle?.name ?? '', lastWritten, newer: newer?.savedAt ?? 0 });

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

/** Writes what is saved now into the file, at once. */
export async function writeNow(h: ProgressHandle | null = handle): Promise<boolean> {
  if (!h || status !== 'ok') return false;
  try {
    const w = await h.createWritable();
    await w.write(store.backup());
    await w.close();
    lastWritten = Date.now();
    return true;
  } catch {
    status = 'ask';
    return false;
  }
}

/** After a change: the file is written a moment later, once for a burst of changes. */
function changed(): void {
  if (status !== 'ok') return;
  clearTimeout(timer);
  timer = window.setTimeout(() => void writeNow(), 1500);
}

/** Takes this file from now on: what the app holds is written to it, and every change after. */
export async function useFile(h: ProgressHandle, loadIt: boolean): Promise<'loaded' | 'written' | 'not-ours'> {
  handle = h;
  status = 'ok';
  await idb('readwrite', (s) => s.put(h, 'file'));
  store.onSaved = changed;
  if (loadIt) {
    const text = await (await h.getFile()).text();
    if (text.trim() && store.restore(text)) return 'loaded';
    if (text.trim()) {
      // a file that is not the app's is left alone
      await forgetFile();
      return 'not-ours';
    }
  }
  await writeNow(h);
  return 'written';
}

export async function forgetFile(): Promise<void> {
  handle = null;
  status = 'none';
  newer = null;
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
  store.onSaved = changed;
}

/** With a click (the browser asks first): the app may use the file again, this visit. */
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
    const text = await (await handle.getFile()).text();
    const there = savedAtOf(text);
    if (there > store.savedAt + 1000) newer = { savedAt: there, text };
    else if (there < store.savedAt - 1000 || !there) await writeNow();
  } catch {
    status = 'ask';
  }
}

/** The newer progress of the file replaces this browser's (yes), or the file gets this browser's (no). */
export async function takeNewer(yes: boolean): Promise<void> {
  const n = newer;
  newer = null;
  if (yes && n) store.restore(n.text);
  else await writeNow();
}

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
