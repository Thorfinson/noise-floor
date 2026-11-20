/**
 * Freestyle asks the listener for single notes and for strummed chords at once. This prints how well the two can be
 * told apart at one onset, on real recordings: single notes of the open box (tests/real/notes, joined as a
 * player plays them) and the strummed pieces (tests/real/pieces). For every onset it pairs the note the listener
 * named with the chord it matched, and counts what a rule would make of them.
 * Run: npx vite-node tests/real/freebench.ts   (V=1 prints every onset)
 */
import { Listener, type ChordEvent, type NoteEvent } from '../../src/audio/listener';
import { strumOf } from '../../src/game/freestyle';
import { hasGuitar, onStrings, SR } from './clips';
import { havePieces, pieces } from './pieces';
import { room } from './clips';

const CANDIDATES = ['Em', 'G', 'D', 'C', 'Am'];
const BOX = [40, 43, 45, 47, 50, 52, 55, 57, 59, 62, 64, 67];
const OPEN = [40, 45, 50, 55, 59, 64];

interface Onset { t: number; note?: NoteEvent; chord?: ChordEvent; onset: number }

function hearAll(sig: Float32Array, sr = SR): Onset[] {
  const l = new Listener(sr);
  l.noteDetection = true;
  l.expected = BOX;
  l.chordCandidates = CANDIDATES;
  const out: Onset[] = [];
  const at = (t: number): Onset => {
    let o = out.find((x) => Math.abs(x.t - t) < 0.03);
    if (!o) out.push((o = { t, onset: 0 }));
    return o;
  };
  l.onOnset = (e) => (at(e.time).onset = e.strength);
  l.onNote = (e) => (at(e.time).note = e);
  l.onChord = (e) => (at(e.time).chord = e);
  for (let i = 0; i < sig.length; i += 512) l.push(sig.subarray(i, i + 512));
  return out.sort((a, b) => a.t - b.t);
}

/** The rule the screen uses (game/freestyle.ts strumOf). */
const isStrum = (o: { note?: NoteEvent; chord?: ChordEvent }): boolean => !!strumOf(o.note, o.chord, CANDIDATES);

const pct = (a: number, b: number): string => `${a} of ${b} (${b ? Math.round((100 * a) / b) : 0} %)`;
const V = !!process.env.V;

// single notes: the box up and down, and a few typical licks, at a beat and at an eighth of 84 bpm
{
  const lines: number[][] = [
    [40, 43, 45, 47, 50, 52, 55, 57, 59, 62, 64, 67],
    [67, 64, 62, 59, 57, 55, 52, 50, 47, 45, 43, 40],
    [45, 50, 55, 59, 52, 64, 59, 55, 50, 40],
    [52, 55, 57, 55, 52, 50, 52, 40],
  ];
  const strOf = (m: number): number => {
    let s = 5;
    while (s > 0 && OPEN[s] > m) s--;
    // the box puts 43 on the low E string and 47 on the A string: the notes up to fret 3
    return m - OPEN[s] > 3 ? s - 1 : s;
  };
  for (const gap of [60 / 84, 30 / 84]) {
    for (const wet of [0, 0.7]) {
      let n = 0;
      let named = 0;
      let strum = 0;
      let chordHigh = 0;
      for (const line of lines) {
        const notes = line.map((m) => ({ midi: m, string: strOf(m) })).filter((x) => hasGuitar(x.midi, x.string));
        if (notes.length < line.length) continue;
        const dry = onStrings(notes, gap);
        const sig = wet ? room(dry, 0.5, wet) : dry;
        const heard = hearAll(sig);
        notes.forEach((x, i) => {
          const t = 0.5 + i * gap;
          const o = heard.find((h) => Math.abs(h.t - t) < 0.08);
          n++;
          if (o?.note && o.note.midi === x.midi) named++;
          if (o && isStrum(o)) strum++;
          if (o?.chord && o.chord.score >= 0.65) chordHigh++;
          if (V) console.log(`  note ${x.midi} s${x.string}: heard ${o?.note?.midi ?? '-'} conf ${o?.note?.conf.toFixed(2) ?? '-'} | chord ${o?.chord?.best ?? '-'} ${o?.chord?.score.toFixed(2) ?? ''} m${o?.chord?.margin.toFixed(2) ?? ''}`);
        });
      }
      console.log(`single notes, ${gap > 0.5 ? 'beats' : 'eighths'}, room ${wet}: named right ${pct(named, n)}; a chord fits well ${pct(chordHigh, n)}; taken for a strum ${pct(strum, n)}`);
    }
  }
}

// strums: the onsets of the strummed pieces, where the annotation says one of the candidate chords sounds
if (havePieces) {
  let n = 0;
  let strum = 0;
  let noteSure = 0;
  for (const p of pieces) {
    const heard = hearAll(p.samples);
    for (const o of heard) {
      if (o.t < 0.5) continue;
      const chord = [...p.chords].reverse().find((c) => c.t <= o.t)?.id;
      if (!chord || !CANDIDATES.includes(chord)) continue;
      n++;
      if (isStrum(o)) strum++;
      if (o.note && o.note.conf >= 0.55) noteSure++;
      if (V) console.log(`  ${p.name} ${o.t.toFixed(2)} ${chord}: chord ${o.chord?.best ?? '-'} ${o.chord?.score.toFixed(2) ?? ''} m${o.chord?.margin.toFixed(2) ?? ''} | note ${o.note?.midi ?? '-'} conf ${o.note?.conf.toFixed(2) ?? '-'}`);
    }
  }
  console.log(`strummed pieces: onsets on a chord of the groove ${n}; taken for a strum ${pct(strum, n)}; a single note named with conf >= 0.55 ${pct(noteSure, n)}`);
} else console.log('no pieces: node scripts/samples.mjs pieces');
