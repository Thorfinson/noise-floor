/**
 * The player's own recordings: what the microphone heard while they played a song through. Two are kept
 * of each song, the first ever made and the latest, so that the progress of weeks can be heard side by side.
 * The sound stays in this browser (IndexedDB), at 16 kHz and 16 bits; the index of what there is lives with
 * the rest of what is saved. Nothing is sent anywhere. A recording can be saved as a WAV file to pass on.
 */
import { encodeWav } from '../audio/wav';
import { store, type Instrument, type TakeMeta } from './store';

export type Which = 'first' | 'last';

/** The rate recordings are kept at: enough for a voice or an instrument heard on a phone, a third of the size. */
export const TAKE_RATE = 16000;

/** Longest recording kept, seconds. */
export const TAKE_MAX = 300;

const DB = 'noise-floor-takes';
const STORE = 'audio';

const keyOf = (inst: Instrument, id: string): string => `${inst}:${id}`;

export const hasTakes = (inst: Instrument, id: string): boolean => !!store.takes[keyOf(inst, id)]?.last;

export const takeMeta = (inst: Instrument, id: string, which: Which): TakeMeta | undefined => store.takes[keyOf(inst, id)]?.[which];

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function put(key: string, value: Int16Array): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function get(key: string): Promise<Int16Array | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Int16Array | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

/** Samples at any rate brought down to the rate kept, each new sample the mean of the old ones it covers. */
export function downsample(samples: Float32Array, rate: number, to = TAKE_RATE): Int16Array {
  const ratio = rate / to;
  const n = Math.floor(samples.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let k = a; k < b && k < samples.length; k++) sum += samples[k];
    out[i] = Math.round(Math.max(-1, Math.min(1, sum / (b - a))) * 32767);
  }
  return out;
}

export const toFloat = (s: Int16Array): Float32Array => Float32Array.from(s, (v) => v / 32768);

/**
 * Keeps a recording of a song as its latest one, and as its first if there is none yet. Resolves to true
 * when it was kept (a browser that refuses storage keeps nothing, and the app goes on without it).
 */
export async function saveTake(inst: Instrument, id: string, samples: Float32Array, rate: number, meta: TakeMeta): Promise<boolean> {
  const key = keyOf(inst, id);
  const data = downsample(samples.subarray(0, Math.min(samples.length, Math.round(TAKE_MAX * rate))), rate);
  const entry = (store.takes[key] ??= {});
  const first = !entry.first;
  if (!(await put(`${key}:last`, data))) return false;
  if (first && !(await put(`${key}:first`, data))) return false;
  entry.last = meta;
  if (first) entry.first = meta;
  store.save();
  return true;
}

/** A kept recording, as samples at TAKE_RATE. */
export async function loadTake(inst: Instrument, id: string, which: Which): Promise<Float32Array | null> {
  const data = await get(`${keyOf(inst, id)}:${which}`);
  return data ? toFloat(data) : null;
}

/** A kept recording as a WAV file, to save and pass on. */
export async function takeFile(inst: Instrument, id: string, which: Which): Promise<Blob | null> {
  const s = await loadTake(inst, id, which);
  return s ? new Blob([encodeWav(s, TAKE_RATE)], { type: 'audio/wav' }) : null;
}
