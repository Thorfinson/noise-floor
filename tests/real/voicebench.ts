/**
 * Real voices measured: prints for each Vocadito excerpt how much of the singing the app heard, how near its
 * readings were to the annotated pitch, and how many annotated notes it judged and held right.
 *
 *   npx vite-node tests/real/voicebench.ts
 */
import { haveVoices, loadTrack, measure, trackIds, type TrackResult } from './voices';
if (!haveVoices()) {
  console.log('No recordings: run `npm run samples -- voice` first.');
  process.exit(0);
}
const all: TrackResult[] = [];
for (const id of trackIds()) {
  const r = measure(loadTrack(id));
  all.push(r);
  console.log(`#${String(id).padStart(2)}  heard ${(r.voicedHeard * 100).toFixed(0).padStart(3)}% of the singing · within 50 ct ${(r.within50 * 100).toFixed(0).padStart(3)}% (same octave ${(r.within50SameOctave * 100).toFixed(0)}%) · ghost ${(r.ghost * 100).toFixed(1)}% · notes ${r.judged}/${r.notes} judged right, ${r.held}/${r.notes} held, a semitone off taken ${r.heldWrong}/${2 * r.notes}`);
}
const sum = (k: keyof TrackResult): number => all.reduce((s, r) => s + (r[k] as number), 0);
console.log(`\nall: heard ${((sum('voicedHeard') / all.length) * 100).toFixed(1)}% · within 50 ct ${((sum('within50') / all.length) * 100).toFixed(1)}% (same octave ${((sum('within50SameOctave') / all.length) * 100).toFixed(1)}%) · ghost ${((sum('ghost') / all.length) * 100).toFixed(1)}% · notes judged right ${sum('judged')}/${sum('notes')}, held ${sum('held')}/${sum('notes')}, a semitone off taken ${sum('heldWrong')}/${2 * sum('notes')}`);
