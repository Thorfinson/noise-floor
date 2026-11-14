/**
 * Prints what the listener makes of both hands at once on the piano (tests/real/twohands.ts).
 * Run: npx vite-node tests/real/handsbench.ts
 */
import { noteName } from '../../src/music/theory';
import { havePiano } from './clips';
import { hearPair, judgeChordBass, judgePair } from './twohands';

if (!havePiano) console.log('needs the piano clips: npm run samples');
else {
  let both = 0;
  let melodyOnly = 0;
  let n = 0;
  const tally = { both: { pair: 0, mel: 0, other: 0, none: 0 }, right: { pair: 0, mel: 0, other: 0, none: 0 } };
  const missed: string[] = [];
  for (const bass of [43, 45, 47, 48, 50, 52, 53, 55])
    for (const melody of [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79]) {
      if ((melody - bass) % 12 === 0) continue;
      n++;
      const notes = hearPair(bass, melody);
      if (notes.includes(melody) && notes.includes(bass)) both++;
      else if (notes.includes(melody)) melodyOnly++;
      const a = (judgePair(bass, melody, true) ?? 'none') as 'pair';
      tally.both[a]++;
      tally.right[(judgePair(bass, melody, false) ?? 'none') as 'pair']++;
      if (a !== 'pair') missed.push(`${noteName(bass)}+${noteName(melody)} (${melody - bass})`);
    }
  console.log(`the note path, ${n} pairs: both keys reported ${both}, the melody only ${melodyOnly}`);
  console.log('two keys as a chord, both hands played:', JSON.stringify(tally.both));
  console.log('two keys as a chord, right hand alone :', JSON.stringify(tally.right));
  console.log('missed:', missed.join(', '));
  const t = { both: { full: 0, chord: 0, other: 0, none: 0 }, right: { full: 0, chord: 0, other: 0, none: 0 } };
  for (const [root, third, fifth] of [[60, 64, 67], [65, 69, 72], [67, 71, 74], [69, 72, 76], [62, 65, 69], [64, 67, 71]])
    for (const down of [12, 24]) {
      const bass = root - down;
      if (bass < 43) continue;
      t.both[(judgeChordBass(bass, [root, third, fifth], true) ?? 'none') as 'full']++;
      t.right[(judgeChordBass(bass, [root, third, fifth], false) ?? 'none') as 'full']++;
    }
  console.log('a root under a chord, together:', JSON.stringify(t.both), ' the chord alone:', JSON.stringify(t.right));
}
