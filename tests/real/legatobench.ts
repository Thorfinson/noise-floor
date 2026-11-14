/** Prints what the listener makes of slides and of notes joined without a new pluck (tests/real/legato.ts). Run: npx vite-node tests/real/legatobench.ts */
import { steel, steelClips } from './clips';
import { haveSlides, hearLegato, joined, slides } from './legato';

{
  if (haveSlides()) {
    const s = slides();
    console.log(`slides: the pitch reached the note slid to in ${s.filter((x) => x.reached).length} of ${s.length}; onsets reported while sliding: ${s.reduce((a, x) => a + x.onsetsAfter, 0)}`);
  } else console.log('no slides: npm run samples -- legato');
  const tally = { hammer: { reached: 0, onset: 0, n: 0 }, pull: { reached: 0, onset: 0, n: 0 }, pluck: { reached: 0, onset: 0, n: 0 } };
  const clips = steelClips.filter((c) => c.kind === 'normal');
  for (const c of clips) {
    for (const [how, step] of [['hammer', 2], ['pull', -2], ['pluck', 2]] as const) {
      const other = clips.find((x) => x.guitar === c.guitar && x.string === c.string && x.midi === c.midi + step);
      if (!other) continue;
      const sig = joined(steel(c), steel(other), how);
      const r = hearLegato(sig);
      const t = tally[how];
      t.n++;
      if (r.pitches.filter((p) => p.t > 0.6 && p.t < 0.9 && p.midi === other.midi).length >= 3) t.reached++;
      if (r.onsets.some((x) => x > 0.55 && x < 0.75)) t.onset++;
    }
  }
  for (const [how, t] of Object.entries(tally)) console.log(`${how.padEnd(6)}: second note reached within 0.3 s in ${t.reached} of ${t.n}; an onset reported at it in ${t.onset} of ${t.n}`);
}
