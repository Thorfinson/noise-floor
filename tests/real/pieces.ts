/**
 * Whole pieces: an acoustic guitar played into a microphone in a real room (IDMT-SMT-Guitar, data set 4),
 * with the chords as written down by the people who recorded them. Fetched by `npm run samples`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), 'pieces');

export interface Piece {
  name: string;
  samples: Float32Array;
  /** chord changes: from this time on this chord (an id of the app's chord list), or null where it is one the app does not have */
  chords: { t: number; id: string | null }[];
  /** every beat the annotation marks, seconds */
  beats: number[];
}

/** "Emin" and "E:min" are Em, "C/G" is C over a G bass, "Gbmin" is F♯m; sevenths count as the plain chord. */
function chordId(label: string): string | null {
  const m = /^([A-G])([#b]?)(min|m)?(7)?(\/.*)?$/.exec(label.trim());
  if (!m) return null;
  const flat: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
  const root = flat[m[1] + m[2]] ?? m[1] + m[2];
  return root + (m[3] ? 'm' : '');
}

export const pieces: Piece[] = (existsSync(dir) ? readdirSync(dir) : [])
  .filter((f) => f.endsWith('.wav'))
  .sort()
  .map((f) => {
    const b = readFileSync(resolve(dir, f));
    const n = (b.length - 44) / 2;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(44 + i * 2) / 32768;
    const chords: Piece['chords'] = [];
    const beats: number[] = [];
    for (const line of readFileSync(resolve(dir, f.replace('.wav', '.csv')), 'utf8').split(/\r?\n/)) {
      const [time, rest] = line.split(',');
      if (!rest) continue;
      beats.push(Number(time));
      const label = rest.split(':')[1];
      if (label) chords.push({ t: Number(time), id: chordId(label) });
    }
    return { name: f.replace('.wav', ''), samples, chords, beats };
  });
export const havePieces = pieces.length > 0;
