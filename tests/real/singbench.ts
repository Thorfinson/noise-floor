/**
 * Prints how well the chords of the strummed pieces are heard with a singer over them, at each loudness of
 * the voice against the guitar. Run: npx vite-node tests/real/singbench.ts [0,0.5,1,1.5]  (V=1 for each piece)
 */
import { havePieces, pieces } from './pieces';
import { judge, voiceBed } from './singalong';
import { haveVoices } from './voices';
if (!havePieces || !haveVoices()) {
  console.log('needs the pieces (npm run samples) and the voices (npm run samples -- voice)');
} else {
  const levels = (process.argv.slice(2).find((a) => a !== '--') ?? '0,0.5,1,1.5').split(',').map(Number);
  for (const level of levels) {
    let r = 0;
    let k = 0;
    let n = 0;
    let s = 0;
    const rows: string[] = [];
    pieces.forEach((p, i) => {
      const res = judge(p, voiceBed(p.samples.length, i), level);
      r += res.right;
      k += res.known;
      n += res.named;
      s += res.stretches;
      rows.push(`${p.name}: ${res.right}/${res.known} strums, ${res.named}/${res.stretches} chords`);
    });
    console.log(`voice at ${level} x the guitar: ${r}/${k} strums right (${((100 * r) / k).toFixed(1)}%), ${n}/${s} chords named (${((100 * n) / s).toFixed(1)}%)`);
    if (process.env.V) rows.forEach((x) => console.log('   ' + x));
  }
}
