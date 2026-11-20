/**
 * Prints what the band through speakers does to the listener (tests/real/band.ts): phantoms with nobody playing,
 * and the chords of the strummed pieces heard with the band, at each setup, with the plain and the informed
 * listener. Run: npx vite-node tests/real/bandbench.ts [silent|played] (V=1 for each piece; OFF=0.03 tells the
 * listener the band 30 ms early, as a latency that is off)
 */
import { CLIPPING, INFORMED, played, SETUPS, silent } from './band';
import { havePieces, pieces } from './pieces';

const what = process.argv.slice(2).filter((a) => a !== '--');
const off = Number(process.env.OFF ?? 0);
const per = (n: number, min: number): string => (n / min).toFixed(2);
if (!what.length || what.includes('silent')) {
  for (const feel of (process.env.FEELS ?? 'beat,folk,waltz').split(',')) {
    for (const s of [...SETUPS, ...(process.env.CLIP ? [CLIPPING] : [])]) {
      for (const how of INFORMED) {
        const ph = silent(s, how, feel, 90, Number(process.env.SECS ?? 120), off);
        console.log(`silent ${feel.padEnd(6)} ${s.name.padEnd(19)} ${how.padEnd(10)} per minute: onsets ${per(ph.onsets, ph.minutes)}, notes ${per(ph.notes, ph.minutes)}, chords ${per(ph.chords, ph.minutes)}, thuds ${per(ph.thuds, ph.minutes)}`);
      }
    }
  }
}
if (!havePieces) console.log('the played part needs the pieces (npm run samples -- pieces)');
else if (!what.length || what.includes('played')) {
  const sum = (rows: ReturnType<typeof played>[]): string => {
    const t = rows.reduce((a, r) => ({ right: a.right + r.right, known: a.known + r.known, named: a.named + r.named, stretches: a.stretches + r.stretches, base: a.base + r.base, kept: a.kept + r.kept, extra: a.extra + r.extra }));
    return `strums right ${t.right}/${t.known} (${((100 * t.right) / t.known).toFixed(1)}%), chords named ${t.named}/${t.stretches} (${((100 * t.named) / t.stretches).toFixed(1)}%), player's strums kept ${t.kept}/${t.base} (${((100 * t.kept) / t.base).toFixed(1)}%), extra ${t.extra}`;
  };
  console.log(`played no band             ${sum(pieces.map((p) => played(p, null, 'plain')))}`);
  for (const s of SETUPS) {
    for (const how of INFORMED) {
      const rows = pieces.map((p) => played(p, s, how, off));
      console.log(`played ${s.name.padEnd(19)} ${how.padEnd(10)} ${sum(rows)}`);
      if (process.env.V) rows.forEach((r, i) => console.log(`     ${pieces[i].name}: ${r.right}/${r.known}, named ${r.named}/${r.stretches}, kept ${r.kept}/${r.base}, extra ${r.extra}`));
    }
  }
}
