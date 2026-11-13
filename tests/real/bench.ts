/**
 * Scorecard: how well does the listener do with the recordings of a real guitar and a real piano?
 * Run with: npx vite-node tests/real/bench.ts [part ...]   parts: notes check song pattern chords piano
 * Not a test: it prints numbers to tune the listener by.
 */
import { Listener, type NoteEvent, type StringEvent } from '../../src/audio/listener';
import { CHORDS, chordMidis, noteName, OPEN_STRINGS } from '../../src/music/theory';
import { guitar, hasGuitar, hasPiano, mix as dryMix, onStrings as dryOnStrings, piano, room, SR, steel, steelClips, type Loudness, type Played } from './clips';

// ROOM=1 (or ROOM=rt60,wet) puts everything into a living room, heard by a laptop microphone
const ROOM = process.env.ROOM ? process.env.ROOM.split(',').map(Number) : null;
const inRoom = (sig: Float32Array): Float32Array => (ROOM ? room(sig, ROOM[0] > 0.05 ? ROOM[0] : 0.5, ROOM[1] ?? 0.7) : sig);
const mix: typeof dryMix = (...a) => inRoom(dryMix(...a));
const onStrings: typeof dryOnStrings = (...a) => inRoom(dryOnStrings(...a));
if (ROOM) console.log(`in a room: reverberation ${ROOM[0] > 0.05 ? ROOM[0] : 0.5} s, ${ROOM[1] ?? 0.7} times the direct sound, small microphone`);

/** the guitar in the recordings is tuned about 20 cents low; the tuner would have set the reference to match */
export const GUITAR_A4 = 435;
/** the piano is tuned a few cents high */
export const PIANO_A4 = 441;
/** as if the microphone were set so that a normal note is comfortably loud */
export const GUITAR_GAIN = 3;
export const PIANO_GAIN = 4;

const parts = process.argv.slice(2);
const want = (p: string): boolean => !parts.length || parts.includes(p);
const verbose = !!process.env.V;

function run(sig: Float32Array, a4: number, setup?: (l: Listener) => void, during?: (l: Listener, t: number) => void) {
  const l = new Listener(SR);
  l.a4 = a4;
  const notes: NoteEvent[] = [];
  const strings: StringEvent[] = [];
  const onsets: number[] = [];
  const thuds: number[] = [];
  const drops: { time: number; text: string }[] = [];
  l.onDrop = (e) => drops.push({ time: e.time, text: `${e.reason}${e.midi === null ? '' : ' ' + noteName(e.midi)} conf ${e.conf.toFixed(2)}${e.reason === 'choked' ? ' ring ' + e.ring.toFixed(2) : ''}` });
  l.onNote = (e) => notes.push(e);
  l.onString = (e) => strings.push(e);
  l.onOnset = (e) => onsets.push(e.time);
  setup?.(l);
  if (l.onThud) l.onThud = (e) => thuds.push(e.time);
  for (let i = 0; i < sig.length; i += 512) {
    during?.(l, i / SR);
    l.push(sig.subarray(i, i + 512));
  }
  return { notes, strings, onsets, thuds, drops };
}
/** Why nothing was heard around a moment: no onset at all, or an onset that was dropped. */
const why = (r: { onsets: number[]; drops: { time: number; text: string }[] }, t: number, span: number): string => {
  const d = r.drops.filter((x) => Math.abs(x.time - t) < span).map((x) => x.text);
  return d.length ? 'dropped: ' + d.join('; ') : r.onsets.some((o) => Math.abs(o - t) < span) ? 'onset, nothing after' : 'no onset';
};
const names = (m: number[]): string => m.map(noteName).join(' ');
const report = (title: string, right: number, total: number, detail: string[] = []): void => console.log(`${title}: ${right} of ${total}` + (detail.length && (verbose || detail.length <= 6) ? '\n    ' + detail.slice(0, 40).join('\n    ') : detail.length ? `   (${detail.length} details, V=1 shows them)` : ''));

const all: [number, number, Loudness][] = [];
for (const d of ['mf', 'pp', 'ff'] as const) for (let s = 0; s < 6; s++) for (let m = 40; m <= 76; m++) if (hasGuitar(m, s, d)) all.push([m, s, d]);
const fret = (m: number, s: number): number => m - OPEN_STRINGS[s];

if (want('notes')) {
  for (const d of ['mf', 'pp', 'ff'] as const) {
    const wrong: string[] = [];
    const extra: string[] = [];
    const set = all.filter((x) => x[2] === d);
    for (const [m, s] of set) {
      const r = run(mix([{ clip: guitar(m, s, d), at: 0.6, gain: GUITAR_GAIN }], 3.4), GUITAR_A4, (l) => (l.onThud = () => undefined));
      if (names(r.notes.map((n) => n.midi)) !== noteName(m)) wrong.push(`${noteName(m)} string ${s} heard as [${names(r.notes.map((n) => n.midi))}]${r.notes.length ? '' : ' ' + why(r, 0.6, 0.2)}`);
      if (r.onsets.length !== 1 || r.thuds.length) extra.push(`${noteName(m)} string ${s}: onsets ${r.onsets.map((t) => t.toFixed(2)).join(' ')}${r.thuds.length ? ' thud' : ''}`);
    }
    report(`guitar ${d}  single notes heard right`, set.length - wrong.length, set.length, wrong);
    report(`guitar ${d}  one onset, no thud`, set.length - extra.length, set.length, extra);
  }
}

if (want('check')) {
  for (const [title, set] of [
    ['frets 0 to 5, mf and ff', all.filter(([m, s, d]) => d !== 'pp' && fret(m, s) <= 5)],
    ['frets 0 to 5, pp', all.filter(([m, s, d]) => d === 'pp' && fret(m, s) <= 5)],
    ['frets 6 and up', all.filter(([m, s]) => fret(m, s) > 5)],
  ] as const) {
    const odd: string[] = [];
    const rings: number[] = [];
    const buzzes: number[] = [];
    for (const [m, s, d] of set) {
      const r = run(mix([{ clip: guitar(m, s, d), at: 0.6, gain: GUITAR_GAIN }], 3.4), GUITAR_A4, (l) => {
        l.noteDetection = false;
        l.startStringCheck(m);
      });
      const v = r.strings[0];
      if (v) {
        rings.push(v.ring);
        buzzes.push(v.buzz);
      }
      if (v?.result !== 'clean') odd.push(`${noteName(m)} string ${s} ${d}: ${v ? `${v.result} ring ${v.ring.toFixed(2)} buzz ${v.buzz.toFixed(2)} heard ${v.heard === null ? '-' : noteName(v.heard)}` : 'no verdict'}`);
    }
    const q = (v: number[], p: number): string => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(p * (v.length - 1))].toFixed(2) : '-');
    report(`string check, clean notes called clean (${title})`, set.length - odd.length, set.length, odd);
    console.log(`    ring: least ${q(rings, 0)}, 10% ${q(rings, 0.1)}, middle ${q(rings, 0.5)}   buzz: middle ${q(buzzes, 0.5)}, 90% ${q(buzzes, 0.9)}, most ${q(buzzes, 1)}`);
  }
}

const bar = (chord: string): { midi: number; string: number }[] => {
  const m = chordMidis(CHORDS[chord]);
  const bass = m.findIndex((x) => x !== null);
  return [bass, 3, 4, 5, 4, 3].map((s) => ({ midi: m[s]!, string: s }));
};

if (want('song')) {
  const song = ['Am', 'C', 'D', 'F', 'Am', 'C', 'E', 'E', 'Am'].flatMap(bar);
  for (const gap of [0.26, 0.38, 0.6]) {
    for (const guided of [false, true]) {
      const r = run(onStrings(song, gap, 'mf', GUITAR_GAIN), GUITAR_A4, undefined, guided ? (l, t) => (l.expected = [song[Math.max(0, Math.min(song.length - 1, Math.floor((t - 0.5 - 0.09 + gap / 2) / gap)))].midi]) : undefined);
      // line the heard notes up with the played ones by time
      let right = 0;
      const detail: string[] = [];
      song.forEach((n, i) => {
        const t = 0.5 + i * gap;
        const heard = r.notes.filter((e) => Math.abs(e.time - t) < gap / 2);
        if (heard.length === 1 && heard[0].midi === n.midi) right++;
        else detail.push(`note ${i + 1} ${noteName(n.midi)}: ${heard.length ? names(heard.map((e) => e.midi)) : why(r, t, gap / 2)}`);
      });
      report(`song, a note every ${gap} s, ${guided ? 'guided' : 'free  '}`, right, song.length, detail);
      if (!guided) {
        const held = r.notes.map((e) => e.held).filter((h) => h >= 0).sort((x, y) => x - y);
        console.log(`    how much of the note before still sounds: least ${held[0]?.toFixed(2)}, 10% ${held[Math.floor(held.length * 0.1)]?.toFixed(2)}, middle ${held[held.length >> 1]?.toFixed(2)}`);
      }
    }
  }
}

if (want('pattern')) {
  for (const [gap, guided] of [[0.3, false], [0.3, true], [0.2, false], [0.2, true]] as const) {
    let right = 0;
    let total = 0;
    const detail: string[] = [];
    for (let s = 0; s < 6; s++) {
      const first = OPEN_STRINGS[s] + (s === 0 || s === 5 ? 4 : 5);
      const midis = [0, 1, 2, 3, 3, 2, 1, 0, 0, 2, 1, 3].map((d) => first + d);
      const r = run(onStrings(midis.map((midi) => ({ midi, string: s })), gap, 'mf', GUITAR_GAIN), GUITAR_A4, undefined, guided ? (l, t) => (l.expected = [midis[Math.max(0, Math.min(midis.length - 1, Math.floor((t - 0.5 - 0.12 + gap / 2) / gap)))]]) : undefined);
      midis.forEach((m, i) => {
        const heard = r.notes.filter((e) => Math.abs(e.time - (0.5 + i * gap)) < gap / 2);
        total++;
        if (heard.length === 1 && heard[0].midi === m) right++;
        else detail.push(`string ${s} note ${i + 1} ${noteName(m)}: ${heard.length ? names(heard.map((e) => e.midi)) : why(r, 0.5 + i * gap, gap / 2)}`);
      });
    }
    report(`finger patterns on one string, a note every ${gap} s, ${guided ? 'guided' : 'free  '}`, right, total, detail);
  }
}

if (want('chords')) {
  const strum = (id: string, at: number, dur?: number): Played[] =>
    chordMidis(CHORDS[id])
      .map((m, s) => ({ m, s }))
      .filter((x) => x.m !== null && hasGuitar(x.m, x.s))
      .map((x, i) => ({ clip: guitar(x.m!, x.s), at: at + i * 0.014, dur: dur === undefined ? undefined : dur - i * 0.014, gain: GUITAR_GAIN * 0.6 }));
  const ids = ['Em', 'E', 'Am', 'A', 'C', 'G', 'D', 'Dm', 'F', 'F#m', 'Bm'];
  let right = 0;
  let total = 0;
  const detail: string[] = [];
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      // a, b, a: the hand lets go a moment before each change
      const sig = mix([...strum(a, 0.6, 0.85), ...strum(b, 1.6, 0.85), ...strum(a, 2.6)], 4.8);
      const got: string[] = [];
      const l = new Listener(SR);
      l.a4 = GUITAR_A4;
      l.noteDetection = false;
      l.chordCandidates = [a, b];
      l.onChord = (e) => {
        if (e.best && e.score > 0.6 && e.margin > 0.08) got.push(e.best);
      };
      for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
      total++;
      if (got.join() === `${a},${b},${a}`) right++;
      else detail.push(`${a} ${b} ${a}: ${got.join(' ') || 'nothing'}`);
    }
  }
  report('chord changes a b a, told apart', right, total, detail);
}

if (want('piano')) {
  const set: [number, Loudness][] = [];
  for (let m = 43; m <= 79; m++) if (hasPiano(m)) set.push([m, 'mf']);
  for (const m of [60, 62, 64, 65, 67, 69]) for (const d of ['pp', 'ff'] as const) if (hasPiano(m, d)) set.push([m, d]);
  const wrong: string[] = [];
  for (const [m, d] of set) {
    const r = run(mix([{ clip: piano(m, d), at: 0.6, gain: PIANO_GAIN }], 3.4), PIANO_A4);
    if (names(r.notes.map((n) => n.midi)) !== noteName(m)) wrong.push(`${noteName(m)} ${d} heard as [${names(r.notes.map((n) => n.midi))}]`);
  }
  report('piano  single notes heard right', set.length - wrong.length, set.length, wrong);

  const tunes: Record<string, number[]> = {
    ode: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62],
    elise: [76, 75, 76, 75, 76, 71, 74, 72, 69],
    left: [48, 50, 52, 53, 55, 53, 52, 50, 48],
    leftG: [43, 45, 47, 48, 50, 48, 47, 45, 43],
    thirds: [60, 64, 62, 65, 64, 67],
    twinkle: [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60],
  };
  let right = 0;
  let total = 0;
  const detail: string[] = [];
  for (const [name, tune] of Object.entries(tunes)) {
    for (const gap of [0.5, 0.3, 0.22]) {
      for (const hold of [1.0, 0.5]) {
        // the same key twice is always let go in between
        const played: Played[] = tune.map((m, i) => ({ clip: piano(m), at: 0.6 + i * gap, dur: tune[i + 1] === m ? gap * Math.min(hold, 0.7) : gap * hold + (hold >= 1 ? 0.03 : 0), gain: PIANO_GAIN }));
        const r = run(mix(played, 0.6 + tune.length * gap + 1.5), PIANO_A4);
        const got = r.notes.map((n) => n.midi);
        total++;
        if (got.length === tune.length && got.every((m, i) => m === tune[i])) right++;
        else detail.push(`${name}, a note every ${gap} s, ${hold >= 1 ? 'legato' : 'detached'}: ${names(got)}`);
      }
    }
  }
  report('piano  melodies heard right', right, total, detail);

  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  for (const hold of [0.9, 0.25]) {
    const l = new Listener(SR);
    l.a4 = PIANO_A4;
    l.noteDetection = false;
    l.buzzThreshold = Infinity;
    const res: string[] = [];
    let next = 0;
    l.onString = (e) => {
      res.push(`${e.result}(${e.ring.toFixed(2)})`);
      if (e.result === 'clean') next++;
      if (next < scale.length) l.startStringCheck(scale[next]);
    };
    l.startStringCheck(scale[0]);
    const sig = mix(scale.map((m, i) => ({ clip: piano(m), at: 0.6 + i, dur: hold, gain: PIANO_GAIN })), 10);
    for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
    console.log(`piano  scale check, keys held ${hold} s: ${res.join(' ')}`);
  }
}

if (want('steel')) {
  const GAIN = Number(process.env.STEEL_GAIN ?? 1);
  for (const kind of ['normal', 'muted', 'dead'] as const) {
    const set = steelClips.filter((c) => c.kind === kind);
    const peaks = set.map((c) => steel(c).reduce((a, v) => Math.max(a, Math.abs(v)), 0)).sort((a, b) => a - b);
    console.log(`steel ${kind}: ${set.length} clips, peak level ${peaks[0].toFixed(2)} .. ${peaks[peaks.length - 1].toFixed(2)}, middle ${peaks[peaks.length >> 1].toFixed(2)}`);
    const heard = new Map<string, number>();
    const verdicts = new Map<string, number>();
    const detail: string[] = [];
    let thuds = 0;
    for (const c of set) {
      const sig = mix([{ clip: steel(c), at: 0.6, gain: GAIN }], 2.6);
      const r = run(sig, 440, (l) => (l.onThud = () => undefined));
      const got = r.notes.length ? (r.notes.length === 1 && r.notes[0].midi === c.midi ? 'right' : `other (${names(r.notes.map((n) => n.midi))})`) : 'nothing';
      heard.set(got.split(' ')[0], (heard.get(got.split(' ')[0]) ?? 0) + 1);
      if (r.thuds.length) thuds++;
      const v = run(sig, 440, (l) => {
        l.noteDetection = false;
        l.startStringCheck(c.midi);
      }).strings[0];
      const word = v ? v.result : 'no verdict';
      verdicts.set(word, (verdicts.get(word) ?? 0) + 1);
      detail.push(`${c.guitar} string ${c.string} ${noteName(c.midi)}: heard ${got}${r.thuds.length ? ' +thud' : ''}; check ${v ? `${v.result} ring ${v.ring.toFixed(2)} buzz ${v.buzz.toFixed(2)}` : 'no verdict'}`);
    }
    console.log(`    as a note: ${[...heard].map(([k, n]) => `${n} ${k}`).join(', ')}; called a thud: ${thuds}`);
    console.log(`    string check: ${[...verdicts].map(([k, n]) => `${n} ${k}`).join(', ')}`);
    if (verbose) for (const d of detail) console.log('    ' + d);
  }
}
