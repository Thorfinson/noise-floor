/**
 * Fetches recordings of a real guitar and a real piano and cuts them into short clips, one note each,
 * for tests/real.test.ts. Run with: npm run samples
 *
 * Source: University of Iowa Electronic Music Studios, Musical Instrument Samples
 * (https://theremin.music.uiowa.edu/MIS.html), freely available. The guitar is a Raimundo 118 classical
 * guitar recorded in an anechoic chamber, one file per string with the notes one after the other and
 * digital silence between them; the piano is one file per key. Three loudnesses each: pp, mf, ff.
 *
 * The downloads (about 400 MB) go to tests/real/cache and can be deleted afterwards; the clips
 * (48 kHz mono WAV, 2.6 s each, about 40 MB together) go to tests/real/notes. The clips are left as
 * recorded, including the rumble far below the notes that the measuring microphone picked up.
 *
 * Second source, for what the first does not have: steel strings, and notes that are damped.
 * IDMT-SMT-Guitar (Fraunhofer IDMT, C. Kehling et al., https://zenodo.org/records/7544110, licence
 * CC BY-NC-ND 4.0: for your own use, not to be passed on). Three electric guitars, recorded directly;
 * from each the plain notes of the first five frets, the notes played with the hand lying on the strings
 * ("muted") and the dead notes, cut by the onsets in the data set's own annotation. Only these files are
 * read out of the 1.3 GB archive (about 100 MB); the clips add about 25 MB.
 *
 * Third and fourth, further down: whole pieces strummed on an acoustic guitar in a room, and whole chords
 * on real pianos. Their sources are named where they are fetched. `npm run samples -- chords` fetches only
 * the chords.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { openZip } from './zipget.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, 'tests/real/cache');
const notes = resolve(root, 'tests/real/notes');
mkdirSync(cache, { recursive: true });
mkdirSync(notes, { recursive: true });

const BASE = 'https://theremin.music.uiowa.edu/sound%20files/MIS/Piano_Other';
const OUT_SR = 48000;
const CLIP = 2.6;
const LEAD = 0.05;

/** [loudness, file part, string (0 = low E), midi of the first note, number of notes] */
const GUITAR = [
  ['mf', 'sulE.E2B2', 0, 40, 8],
  ['mf', 'sulA.A2B2', 1, 45, 3],
  ['mf', 'sulA.C3B3', 1, 48, 12],
  ['mf', 'sulD.D3B3', 2, 50, 10],
  ['mf', 'sulG.G3B3', 3, 55, 5],
  ['mf', 'sulG.C4B4', 3, 60, 12],
  ['mf', 'sulB.B3', 4, 59, 1],
  ['mf', 'sulB.C4B4', 4, 60, 12],
  ['mf', 'sul_E.E4B4', 5, 64, 8],
  ['pp', 'sulE.E2B2', 0, 40, 8],
  ['pp', 'sulA.A2B2', 1, 45, 3],
  ['pp', 'sulG.G3B3', 3, 55, 5],
  ['pp', 'sulB.B3', 4, 59, 1],
  ['pp', 'sul_E.E4B4', 5, 64, 8],
  ['ff', 'sulA.A2B2', 1, 45, 3],
  ['ff', 'sulG.G3B3', 3, 55, 5],
  ['ff', 'sulB.B3', 4, 59, 1],
  ['ff', 'sul_E.E4B4', 5, 64, 8],
];

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const pianoName = (midi) => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const PIANO = [...range(43, 79).map((m) => ['mf', m]), ...[60, 62, 64, 65, 67, 69].flatMap((m) => [['pp', m], ['ff', m]])];

async function download(url, file, bytes) {
  if (existsSync(file) && statSync(file).size > 1000) return;
  const res = await fetch(url, bytes ? { headers: { Range: `bytes=0-${bytes - 1}` } } : {});
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
}

/** Reads an AIFF file (possibly cut short) into mono samples between -1 and 1. */
function readAiff(file) {
  const b = readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'FORM') throw new Error('not an AIFF file: ' + file);
  let pos = 12;
  let channels = 1;
  let bits = 16;
  let sr = 44100;
  let data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString('latin1', pos, pos + 4);
    const size = b.readUInt32BE(pos + 4);
    const body = pos + 8;
    if (id === 'COMM') {
      channels = b.readInt16BE(body);
      bits = b.readInt16BE(body + 6);
      // sample rate: 80-bit extended float
      sr = Math.round(b.readUInt32BE(body + 10) * Math.pow(2, (b.readUInt16BE(body + 8) & 0x7fff) - 16383 - 31));
    } else if (id === 'SSND') data = b.subarray(body + 8 + b.readUInt32BE(body), Math.min(b.length, body + size));
    pos = body + size + (size % 2);
  }
  if (!data) throw new Error('no sound data in ' + file);
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let v = 0;
    for (let c = 0; c < channels; c++) {
      const p = (i * channels + c) * bytes;
      v += bytes === 2 ? data.readInt16BE(p) / 32768 : data.readIntBE(p, 3) / 8388608;
    }
    out[i] = v / channels;
  }
  return { sr, samples: out };
}

/** The same sound without what lies below about 60 Hz: the measuring microphone hears the air move. */
function withoutRumble(samples, sr) {
  const out = new Float32Array(samples.length);
  const r = 1 - (2 * Math.PI * 60) / sr;
  let x1 = 0;
  let y1 = 0;
  let x2 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    // two one-pole high-passes in a row
    y1 = samples[i] - x1 + r * y1;
    x1 = samples[i];
    y2 = y1 - x2 + r * y2;
    x2 = y1;
    out[i] = y2;
  }
  return out;
}

/** Stretches of sound between stretches of (near) digital silence, as [start, end] in samples. */
function stretchesWith(samples, sr, seconds, level) {
  const out = [];
  const quiet = Math.max(2, Math.round(seconds * sr));
  let start = -1;
  let zeros = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) <= level) {
      zeros++;
      if (zeros === quiet && start >= 0) {
        out.push([start, i - quiet]);
        start = -1;
      }
    } else {
      zeros = 0;
      if (start < 0) start = i;
    }
  }
  if (start >= 0) out.push([start, samples.length]);
  return out.filter(([a, b]) => b - a > 0.3 * sr);
}

/** The notes of a recording. The files differ in how cleanly the notes are separated, so several ways are tried. */
function stretches(samples, sr, want) {
  let last = [];
  for (const level of [0, 2e-6, 2e-5]) {
    for (const seconds of [0.03, 0.01, 0.002, 0.0005]) {
      last = stretchesWith(samples, sr, seconds, level);
      if (last.length === want) return last;
    }
  }
  return last;
}

/**
 * Where the note begins in a stretch of sound: the first moment it is a quarter as loud as it gets
 * and stays loud for a tenth of a second. (A click before the note does not stay.)
 */
function onset(clean, sr, from, to) {
  const hop = Math.round(sr / 500);
  const env = [];
  for (let i = from; i + hop <= to; i += hop) {
    let sq = 0;
    for (let j = 0; j < hop; j++) sq += clean[i + j] ** 2;
    env.push(Math.sqrt(sq / hop));
  }
  const max = env.reduce((a, b) => Math.max(a, b), 0);
  const stays = (i) => {
    let sum = 0;
    for (let j = i; j < i + 50; j++) sum += env[j] ?? 0;
    return sum / 50 > 0.15 * max;
  };
  const first = env.findIndex((v, i) => v > 0.25 * max && stays(i));
  return from + Math.max(0, first - 1) * hop;
}

/** A stretch of a recording as a clip at 48 kHz, with a short fade at the end. */
function clip(samples, sr, start, end = samples.length) {
  const from = Math.max(0, start - Math.round(LEAD * sr));
  const n = Math.floor(CLIP * OUT_SR);
  const out = new Float32Array(n);
  const step = sr / OUT_SR;
  const at = (i) => (i >= end ? 0 : samples[Math.max(0, Math.min(samples.length - 1, i))]);
  for (let i = 0; i < n; i++) {
    const x = from + i * step;
    const k = Math.floor(x);
    const t = x - k;
    if (k + 2 >= samples.length) break;
    // Catmull-Rom interpolation between the four samples around x
    const [p0, p1, p2, p3] = [at(k - 1), at(k), at(k + 1), at(k + 2)];
    out[i] = p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  }
  const fade = Math.round(0.03 * OUT_SR);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return out;
}

/** Pitch of a clip as a MIDI number with fraction, from 0.2 s after its start (the YIN method), or NaN. */
function pitchOf(raw) {
  const c = withoutRumble(raw, OUT_SR);
  const from = Math.round(0.2 * OUT_SR);
  const n = 4096;
  const maxLag = Math.floor(OUT_SR / 70);
  const d = new Float32Array(maxLag + 2);
  let sum = 0;
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let v = 0;
    for (let i = 0; i < n; i++) v += (c[from + i] - c[from + i + lag]) ** 2;
    sum += v;
    d[lag] = sum ? (v * lag) / sum : 1;
  }
  // the shortest period among those that fit nearly as well as the best one
  const lo = Math.floor(OUT_SR / 1300);
  let best = 1;
  for (let lag = lo; lag < maxLag; lag++) best = Math.min(best, d[lag]);
  for (let lag = lo; lag < maxLag; lag++) {
    if (d[lag] < best + 0.1 && d[lag] <= d[lag - 1] && d[lag] <= d[lag + 1]) {
      const [x, y, z] = [d[lag - 1], d[lag], d[lag + 1]];
      const fine = lag + (0.5 * (x - z)) / (x - 2 * y + z || 1);
      return 69 + 12 * Math.log2(OUT_SR / fine / 440);
    }
  }
  return NaN;
}

function writeWav(file, samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(OUT_SR, 24);
  buf.writeUInt32LE(OUT_SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  writeFileSync(file, buf);
}

const only = process.argv[2];
let made = 0;
for (const [dyn, part, string, first, count] of GUITAR) {
  if (only && only !== 'guitar') break;
  if (range(first, first + count - 1).every((m) => existsSync(resolve(notes, `guitar.${dyn}.s${string}.${m}.wav`)))) continue;
  const file = resolve(cache, `Guitar.${dyn}.${part}.mono.aif`);
  process.stdout.write(`guitar ${dyn} ${part} ... `);
  await download(`${BASE}/guitar/Guitar.${dyn}.${part}.mono.aif`, file);
  const { sr, samples } = readAiff(file);
  const parts = stretches(samples, sr, count);
  if (parts.length !== count) throw new Error(`found ${parts.length} notes instead of ${count}`);
  const clean = withoutRumble(samples, sr);
  const clips = parts.map(([a, b]) => clip(samples, sr, onset(clean, sr, a, b), b));
  // each must be the note it is meant to be, or the cutting went wrong
  // (the simple pitch finder sometimes lands an octave up on a low string: that is still the right note)
  const off = clips.map((c, i) => pitchOf(c) - (first + i)).map((o) => o - 12 * Math.round(o / 12));
  const bad = off.findIndex((o) => !(Math.abs(o) < 0.6));
  if (bad >= 0) throw new Error(`note ${bad + 1} of ${part} sounds ${off[bad].toFixed(2)} semitones off`);
  clips.forEach((c, i) => writeWav(resolve(notes, `guitar.${dyn}.s${string}.${first + i}.wav`), c));
  made += count;
  console.log(`${count} notes, tuning ${off.map((o) => Math.round(o * 100)).join(' ')} cents`);
}
for (const [dyn, midi] of PIANO) {
  if (only && only !== 'piano') break;
  const target = resolve(notes, `piano.${dyn}.${midi}.wav`);
  if (existsSync(target)) continue;
  const file = resolve(cache, `Piano.${dyn}.${pianoName(midi)}.aiff`);
  // the beginning is enough: a megabyte is nearly six seconds
  await download(`${BASE}/piano/Piano.${dyn}.${pianoName(midi)}.aiff`, file, 1_000_000);
  const { sr, samples } = readAiff(file);
  const c = clip(samples, sr, onset(withoutRumble(samples, sr), sr, 0, samples.length));
  const off = pitchOf(c) - midi;
  if (!(Math.abs(off - 12 * Math.round(off / 12)) < 0.6)) throw new Error(`${pianoName(midi)} ${dyn} sounds ${off.toFixed(2)} semitones off`);
  writeWav(target, c);
  made++;
  process.stdout.write(`piano ${dyn} ${pianoName(midi)}  `);
}

/** Reads a WAV file held in memory into mono samples between -1 and 1. */
function readWav(b) {
  let pos = 12;
  let channels = 1;
  let bits = 16;
  let sr = 44100;
  let data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString('latin1', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      channels = b.readUInt16LE(pos + 10);
      sr = b.readUInt32LE(pos + 12);
      bits = b.readUInt16LE(pos + 22);
    } else if (id === 'data') data = b.subarray(pos + 8, Math.min(b.length, pos + 8 + size));
    pos += 8 + size + (size % 2);
  }
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let v = 0;
    for (let c = 0; c < channels; c++) {
      const q = (i * channels + c) * bytes;
      v += bytes === 2 ? data.readInt16LE(q) / 32768 : data.readIntLE(q, 3) / 8388608;
    }
    out[i] = v / channels;
  }
  return { sr, samples: out };
}

/** A stretch of a recording at 48 kHz, from a little before start to end (seconds), faded at both ends. */
function cut(samples, sr, start, end) {
  const from = Math.max(0, Math.round((start - LEAD) * sr));
  const n = Math.floor((end - start + LEAD) * OUT_SR);
  const out = new Float32Array(n);
  const step = sr / OUT_SR;
  for (let i = 0; i < n; i++) {
    const x = from + i * step;
    const k = Math.floor(x);
    if (k + 1 >= samples.length) break;
    out[i] = samples[k] + (x - k) * (samples[k + 1] - samples[k]);
  }
  const fade = Math.round(0.01 * OUT_SR);
  for (let i = 0; i < fade; i++) {
    out[i] *= i / fade;
    out[n - 1 - i] *= i / fade;
  }
  return out;
}

if (!only || only === 'steel') {
  const want = [];
  for (const g of ['FS', 'LP', 'AR']) {
    for (const s of ['E', 'A', 'D', 'G', 'B', 'E1']) want.push([g, `${g}_${s}_fret_0-20`], [g, `${g}_${s}_muted5`]);
    want.push([g, `${g}_DN_III_VIII_XIV`]);
  }
  const missing = want.filter(([g, f]) => !existsSync(resolve(notes, `steel.${g}.${f.split('_').slice(1).join('_')}.done`)));
  if (missing.length) {
    const zip = await openZip('https://zenodo.org/api/records/7544110/files/IDMT-SMT-GUITAR_V2.zip/content');
    const dir = 'IDMT-SMT-GUITAR_V2/dataset2/';
    for (const [g, f] of missing) {
      process.stdout.write(`steel ${f} ... `);
      const xml = (await zip.read(`${dir}annotation/${f}.xml`)).toString('utf8');
      const { sr, samples } = readWav(await zip.read(`${dir}audio/${f}.wav`));
      const events = [...xml.matchAll(/<event>([\s\S]*?)<\/event>/g)].map((m) => {
        const field = (name) => m[1].match(new RegExp(`<${name}>([^<]*)<`))?.[1] ?? '';
        return { on: Number(field('onsetSec')), off: Number(field('offsetSec')), midi: Number(field('pitch')), fret: Number(field('fretNumber')), string: Number(field('stringNumber')) - 1, muted: field('excitationStyle') === 'MU', dead: field('expressionStyle') === 'DN' };
      });
      const seen = new Map();
      let count = 0;
      events.forEach((e, i) => {
        const kind = e.dead ? 'dead' : e.muted ? 'muted' : 'normal';
        // plain notes only where chords are played; of the many dead notes two of each
        if (kind === 'normal' && e.fret > 5) return;
        const key = `${kind}.s${e.string}.${e.midi}`;
        const nth = (seen.get(key) ?? 0) + 1;
        seen.set(key, nth);
        if (kind === 'dead' && nth > 2) return;
        // up to the next note, or a little past where the annotation says this one ends
        const end = Math.min(events[i + 1] ? events[i + 1].on - 0.03 : Infinity, Math.max(e.off + 0.25, e.on + 0.6), e.on + 1.6);
        writeWav(resolve(notes, `steel.${g}.${key}.${nth}.wav`), cut(samples, sr, e.on, end));
        count++;
      });
      writeFileSync(resolve(notes, `steel.${g}.${f.split('_').slice(1).join('_')}.done`), '');
      made += count;
      console.log(`${count} clips`);
    }
  }
}

// Third: whole pieces, an acoustic guitar played into a microphone in a real room, with the chords written
// down beat by beat (data set 4 of IDMT-SMT-Guitar). The first 32 seconds of six pieces whose chords the app knows.
if (!only || only === 'pieces') {
  const pieces = resolve(root, 'tests/real/pieces');
  mkdirSync(pieces, { recursive: true });
  const wanted = ['slow/pop/pop_1_', 'slow/pop/pop_6_', 'slow/country_folk/country_1_', 'slow/latin/latin_3_', 'slow/reggae_ska/reggae_3_', 'fast/pop/pop_1_'];
  const fileOf = (w) => resolve(pieces, w.split('/').join('.').replace(/_$/, '.'));
  if (wanted.some((w) => !existsSync(fileOf(w) + 'wav'))) {
    const zip = await openZip('https://zenodo.org/api/records/7544110/files/IDMT-SMT-GUITAR_V2.zip/content');
    for (const w of wanted) {
      if (existsSync(fileOf(w) + 'wav')) continue;
      const [tempo, style, piece] = w.split('/');
      const inDir = (kind) => zip.names.find((n) => n.includes(`dataset4/acoustic_mic/${tempo}/${style}/${kind}/${piece}`));
      const audio = inDir('audio');
      const chords = inDir('annotation/chords');
      if (!audio || !chords) throw new Error('not in the archive: ' + w);
      process.stdout.write(`piece ${audio.split('acoustic_mic/')[1]} ... `);
      writeFileSync(fileOf(w) + 'csv', await zip.read(chords));
      const { sr, samples } = readWav(await zip.read(audio));
      writeWav(fileOf(w) + 'wav', cut(samples, sr, LEAD, Math.min(32, samples.length / sr - 0.1)));
      made++;
      console.log('done');
    }
  }
}

// Fourth: whole chords on real pianos, as others recorded them, for tests/piano.test.ts.
//
// - "hand": the piano part of the chord collection of the University of Liège (J. Osmalskyj et al., "Neural
//   networks for musical chords recognition", JIM 2012): A, Am, Bm, C, D, Dm, E, Em, F and G, ten times each,
//   played by hand anywhere on the keyboard. The collection was published as "publicly available" without a
//   licence; its own address is gone, the files come from a copy on GitHub. For your own use.
// - "upright": the "usual chords" of MAPS (V. Emiya, N. Bertin, B. David, R. Badeau, Télécom Paris,
//   https://zenodo.org/records/18160555, licence CC BY-NC-SA 2.0), sub-base ENSTDkAm: an upright Yamaha
//   Disklavier in a room, recorded with microphones at a distance. Its keys are moved by the instrument
//   itself, so every key of a chord goes down at the same moment. Major and minor triads and three kinds of
//   sevenths in root position, with roots anywhere on the keyboard. Only these files are read out of the
//   2.7 GB archive (about 60 MB).
// - "grand", "home" and a sequence: recordings from Wikimedia Commons. Six chords on a grand piano with a
//   microphone under the lid (ZappaMidiPF, CC BY-SA 4.0), C major on an out-of-tune piano recorded at home
//   (DoMpiano.wav, CC0), and the six chords of C major one after the other on an acoustic piano (Opus33,
//   public domain). The Ogg files are decoded by the browser the browser checks use.
if (!only || only === 'chords') {
  const chords = resolve(root, 'tests/real/chords');
  const kept = resolve(cache, 'chords');
  mkdirSync(chords, { recursive: true });
  mkdirSync(kept, { recursive: true });
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  /** A file from the web, kept in the cache; asked for politely and not twice. */
  const fetched = async (url, name) => {
    const file = resolve(kept, name);
    if (existsSync(file) && statSync(file).size > 8000) return readFileSync(file);
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, { headers: { 'User-Agent': 'sample-fetcher/1.0' } });
      if (r.ok) {
        const data = Buffer.from(await r.arrayBuffer());
        writeFileSync(file, data);
        await sleep(1500);
        return data;
      }
      if (r.status !== 429 || attempt >= 4) throw new Error(`${r.status} for ${url}`);
      await sleep(30000 * (attempt + 1));
    }
  };
  /** A whole recording as a clip at 48 kHz. */
  const whole = (samples, sr) => cut(samples, sr, LEAD, samples.length / sr);

  const LIEGE = 'https://raw.githubusercontent.com/bycym/chordRecognition/master/audio/jim2012Chords/Other_Instruments/Piano';
  let count = 0;
  for (const [dir, label] of [['a', 'A'], ['am', 'Am'], ['bm', 'Bm'], ['c', 'C'], ['d', 'D'], ['dm', 'Dm'], ['e', 'E'], ['em', 'Em'], ['f', 'F'], ['g', 'G']]) {
    for (let n = 1; n <= 10; n++) {
      const target = resolve(chords, `hand.${label}.${n}.wav`);
      if (existsSync(target)) continue;
      const { sr, samples } = readWav(await fetched(`${LIEGE}/${dir}/${dir}${n}.wav`, `liege.${dir}${n}.wav`));
      writeWav(target, whole(samples, sr));
      count++;
    }
  }
  if (count) console.log(`chords by hand: ${count} clips`);
  made += count;

  // the chords of MAPS: which notes each file holds is in a text file beside it
  if (!existsSync(resolve(chords, 'upright.done'))) {
    const KINDS = { '0-4-7': '', '0-3-7': 'm', '0-4-7-10': '7', '0-4-7-11': 'maj7', '0-3-7-10': 'm7' };
    const MAJOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const MINOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    let zip = null;
    /** the list of the archive's files, and each file, from the cache where it is there */
    const listing = resolve(kept, 'maps-names.txt');
    const member = async (name) => {
      const file = resolve(kept, name.split('/').pop());
      if (existsSync(file) && statSync(file).size > 0) return readFileSync(file);
      zip ??= await openZip('https://zenodo.org/api/records/18160555/files/ENSTDkAm.zip/content');
      const data = await zip.read(name);
      writeFileSync(file, data);
      // slowly: this server answers more than a request a second or so with "too many"
      await sleep(2500);
      return data;
    };
    if (!existsSync(listing)) {
      zip = await openZip('https://zenodo.org/api/records/18160555/files/ENSTDkAm.zip/content');
      writeFileSync(listing, zip.names.join('\n'));
    }
    const names = readFileSync(listing, 'utf8')
      .split(/\r?\n/)
      .filter((n) => /ENSTDkAm\/UCHO\/[^/]+\/C(0-4-7|0-3-7|0-4-7-10|0-4-7-11|0-3-7-10)\/.*\.wav$/.test(n));
    count = 0;
    for (const name of names) {
      const [, kind, how] = /MAPS_UCHO_C([\d-]+)_(I[\d-]+_S\d_n\d+)_/.exec(name);
      const midis = (await member(name.replace(/\.wav$/, '.txt')))
        .toString('utf8')
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => Number(line.split('\t')[2]))
        .sort((a, b) => a - b);
      const minor = KINDS[kind].startsWith('m') && !KINDS[kind].startsWith('maj');
      const label = (minor ? MINOR : MAJOR)[midis[0] % 12] + KINDS[kind];
      const target = resolve(chords, `upright.${label}.${midis[0]}.${how}.wav`);
      if (existsSync(target)) continue;
      const { sr, samples } = readWav(await member(name));
      writeWav(target, whole(samples, sr));
      count++;
    }
    writeFileSync(resolve(chords, 'upright.done'), '');
    console.log(`chords of an upright in a room: ${count} clips`);
    made += count;
  }

  // Wikimedia Commons: a WAV file as it is, the Ogg files through the browser
  const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/';
  const HAND = [
    ['grand.Am.1', 'c/cf/Piano_ac%C3%BAstico%2C_acorde_Am.ogg'],
    ['grand.C.1', '9/9d/Piano_ac%C3%BAstico%2C_acorde_C.ogg'],
    ['grand.Dm.1', '2/28/Piano_ac%C3%BAstico%2C_acorde_Dm.ogg'],
    ['grand.Em.1', '9/9c/Piano_ac%C3%BAstico%2C_acorde_Em.ogg'],
    ['grand.F.1', 'c/c0/Piano_ac%C3%BAstico%2C_acorde_F.ogg'],
    ['grand.G.1', '9/95/Piano_ac%C3%BAstico%2C_acorde_G.ogg'],
    ['sequence.C-Dm-Em-F-G-Am', '7/74/SixBasicChordsInCMajor.ogg'],
    ['home.C.1', '9/9e/DoMpiano.wav'],
  ].filter(([name]) => !existsSync(resolve(chords, name + '.wav')));
  if (HAND.length) {
    let page = null;
    let browser = null;
    for (const [name, path] of HAND) {
      const data = await fetched(COMMONS + path, `commons.${name}.${path.split('.').pop()}`);
      if (path.endsWith('.wav')) {
        const { sr, samples } = readWav(data);
        writeWav(resolve(chords, name + '.wav'), whole(samples, sr));
      } else {
        if (!page) {
          const { chromium } = await import('playwright-core');
          browser = await chromium.launch({ channel: 'msedge', headless: true });
          page = await browser.newPage();
          await page.goto('about:blank');
        }
        // decoded to one channel at 48 kHz, handed back as 16-bit samples
        const pcm = await page.evaluate(async (b64) => {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const buf = await new OfflineAudioContext(1, 48000, 48000).decodeAudioData(bytes.buffer);
          const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 48000), 48000);
          const node = off.createBufferSource();
          node.buffer = buf;
          node.connect(off.destination);
          node.start();
          const mono = (await off.startRendering()).getChannelData(0);
          const out = new Int16Array(mono.length);
          for (let i = 0; i < mono.length; i++) out[i] = Math.round(Math.max(-1, Math.min(1, mono[i])) * 32767);
          const u8 = new Uint8Array(out.buffer);
          let s = '';
          for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode(...u8.subarray(i, i + 32768));
          return btoa(s);
        }, data.toString('base64'));
        const raw = Buffer.from(pcm, 'base64');
        const samples = new Float32Array(raw.length / 2);
        for (let i = 0; i < samples.length; i++) samples[i] = raw.readInt16LE(i * 2) / 32768;
        writeWav(resolve(chords, name + '.wav'), samples);
      }
      made++;
      process.stdout.write(`${name}  `);
    }
    await browser?.close();
    console.log('');
  }
}
// Fifth: real voices, for tests/real.test.ts and tests/real/voicebench.ts. Vocadito (R. M. Bittner, K. Pasalo,
// J. J. Bosch, G. Meseguer-Brocal, D. Rubinstein: "vocadito: A dataset of solo vocals with f0, note, and lyric
// annotations", 2021; zenodo.org/records/5578807, CC BY 4.0): 40 excerpts of solo singing by 29 singers in
// seven languages, amateurs and trained, with the pitch written down every 5.8 ms and the notes by two
// annotators. Only the audio, the pitch and the notes are kept; `npm run samples -- voice` fetches only these.
if (!only || only === 'voice') {
  const dir = resolve(root, 'tests/real/vocadito');
  if (!existsSync(resolve(dir, 'Audio', 'vocadito_40.wav'))) {
    const zip = await openZip('https://zenodo.org/api/records/5578807/files/vocadito.zip/content');
    const keep = zip.names.filter((n) => !n.startsWith('__MACOSX') && /^(Audio\/.*\.wav|Annotations\/(F0|Notes)\/.*\.csv|Annotations\/README\.txt|vocadito_metadata\.csv)$/.test(n));
    for (const n of keep) {
      const target = resolve(dir, ...n.split('/'));
      if (existsSync(target)) continue;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, await zip.read(n));
      if (n.endsWith('.wav')) {
        made++;
        process.stdout.write('.');
      }
    }
    console.log(' voices');
  }
}
console.log(`\n${made} clips written to tests/real`);

// Sixth: slides on the G string of the three electric guitars of IDMT-SMT-Guitar (data set 2, the same licence
// as above: for your own use only), with their annotation: the pitch moves from note to note without a new
// pluck, as it does in a hammer-on or a pull-off. For tests/real/legato.ts. `npm run samples -- legato`.
if (!only || only === 'legato') {
  const dir = resolve(root, 'tests/real/legato');
  mkdirSync(dir, { recursive: true });
  const want = ['FS', 'LP', 'AR'].filter((g) => !existsSync(resolve(dir, `${g}_G_V_slide.wav`)));
  if (want.length) {
    const zip = await openZip('https://zenodo.org/api/records/7544110/files/IDMT-SMT-GUITAR_V2.zip/content');
    for (const g of want) {
      const f = `${g}_G_V_slide`;
      writeFileSync(resolve(dir, `${f}.xml`), await zip.read(`IDMT-SMT-GUITAR_V2/dataset2/annotation/${f}.xml`));
      const { sr, samples } = readWav(await zip.read(`IDMT-SMT-GUITAR_V2/dataset2/audio/${f}.wav`));
      writeWav(resolve(dir, `${f}.wav`), cut(samples, sr, 0, samples.length / sr));
      console.log(`legato ${f}`);
    }
  }
}
