/**
 * Hammer-on and pull-off: notes that are not plucked. The app follows the pitch (as the tuner does) and waits
 * until the second note of each pair sounds: a hammer-on struck too softly, or a pull-off that does not pluck
 * the string, gives no second note, and that is the commonest fault. Tested before it was built: on real
 * slides of three electric guitars the pitch reached the note slid to 21 times in 21, and on recorded notes
 * joined without a new attack the second note was heard in 143 of 144. Whether the second note was hammered
 * or plucked again the app cannot tell (it hears an onset either way): that is for the ear.
 */
import { engine } from '../audio/engine';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { type TabNote } from '../music/content';
import { noteName, OPEN_STRINGS } from '../music/theory';
import { $, $$, esc, hear, icon, keys, later, stopTimer, type Screen } from '../ui/dom';
import { LEARN, playhead, tabLine } from '../ui/draw';
import { setSimTarget } from '../ui/practice';
import { frame, levelNews } from './frame';

export interface SlurPattern {
  n: number;
  name: string;
  /** string (0 = low E) and frets in order; between two frets an "h" (hammer-on) or "p" (pull-off) */
  s: number;
  frets: number[];
  how: ('h' | 'p')[];
}

export const SLURS = (): SlurPattern[] => [
  { n: 1, name: L('Hammer-on, G string, 5 to 7', 'Hammer-on, G-Saite, 5 auf 7'), s: 3, frets: [5, 7], how: ['h'] },
  { n: 2, name: L('Pull-off, G string, 7 to 5', 'Pull-off, G-Saite, 7 auf 5'), s: 3, frets: [7, 5], how: ['p'] },
  { n: 3, name: L('Hammer-on, B string, 5 to 8', 'Hammer-on, H-Saite, 5 auf 8'), s: 4, frets: [5, 8], how: ['h'] },
  { n: 4, name: L('Pull-off, B string, 8 to 5', 'Pull-off, H-Saite, 8 auf 5'), s: 4, frets: [8, 5], how: ['p'] },
  { n: 5, name: L('Both: 5, 7, 5 on the G string', 'Beides: 5, 7, 5 auf der G-Saite'), s: 3, frets: [5, 7, 5], how: ['h', 'p'] },
  { n: 6, name: L('A trill: 5, 7, 5, 7, 5', 'Ein Triller: 5, 7, 5, 7, 5'), s: 3, frets: [5, 7, 5, 7, 5], how: ['h', 'p', 'h', 'p'] },
];

export const slurKey = (n: number): string => `finger:slur-${n}`;

/** How many rounds of a pattern make a take, and how long each further note may take to sound after the first. */
export const SLUR_ROUNDS = 4;
export const SLUR_WITHIN = 1.2;

/** Where a take of a pattern stands: the note waited for, the round, what was heard so far. */
export interface SlurState {
  /** the note of the pattern waited for */
  at: number;
  round: number;
  /** when the first note of this round sounded, on the listener's clock */
  firstAt: number;
  /** the first note of every round, for the tempo */
  starts: number[];
  /** readings in a row on the same note; below zero once that note has counted, until the pitch changes */
  held: number;
  lastMidi: number;
  /** notes that did not sound in time */
  missed: number;
}

/** What one pitch reading meant. A miss names the note that did not sound, and how it was to be made. */
export type SlurNews = { kind: 'none' } | { kind: 'note' } | { kind: 'round' } | { kind: 'done' } | { kind: 'miss'; fret: number; how: 'h' | 'p' };

export const slurStart = (): SlurState => ({ at: 0, round: 0, firstAt: 0, starts: [], held: 0, lastMidi: -1, missed: 0 });

/**
 * The judging of the trainer, without a screen: one pitch reading (the nearest note, and its time) in, the
 * state after it and what it meant out. A note counts once three readings in a row are on it (some 70 ms).
 * The second note of a round has SLUR_WITHIN seconds from the first, the third twice that, and so on; one
 * that does not come in time is counted as missed and the round starts again. Only differences of the
 * listener's own times are used, so the listener hearing everything a little late changes nothing.
 */
export function judgeSlur(s: SlurState, pat: SlurPattern, midi: number, time: number): { s: SlurState; news: SlurNews } {
  const held = midi === s.lastMidi ? s.held + 1 : 1;
  const next: SlurState = { ...s, held, lastMidi: midi };
  if (s.round >= SLUR_ROUNDS) return { s: next, news: { kind: 'none' } };
  if (held < 3 || midi !== OPEN_STRINGS[pat.s] + pat.frets[s.at]) {
    // the next note of the pattern does not come: counted once, and the round starts again
    if (s.at > 0 && time - s.firstAt > SLUR_WITHIN * s.at)
      return { s: { ...next, at: 0, missed: s.missed + 1 }, news: { kind: 'miss', fret: pat.frets[s.at], how: pat.how[s.at - 1] } };
    return { s: next, news: { kind: 'none' } };
  }
  if (s.at === 0) {
    next.firstAt = time;
    next.starts = [...s.starts, time];
  }
  // the note has counted: it does not count again while it rings on
  next.held = -99;
  next.at = s.at + 1;
  if (next.at < pat.frets.length) return { s: next, news: { kind: 'note' } };
  next.at = 0;
  next.round = s.round + 1;
  return { s: next, news: { kind: next.round >= SLUR_ROUNDS ? 'done' : 'round' } };
}

/** The tempo of a take: patterns a minute from the first notes of its rounds, as beats a minute of its notes. */
export function slurTempo(starts: number[], pat: SlurPattern): number {
  const gaps = starts
    .slice(1)
    .map((t, i) => t - starts[i])
    .filter((g) => g > 0);
  return gaps.length ? Math.round(60 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)) * Math.max(1, pat.frets.length - 1) : 0;
}

/** What to say when a note did not sound: a hammer-on struck too softly, or a pull-off that did not pluck. */
export function slurMissTip(fret: number, how: 'h' | 'p'): string {
  if (how === 'h') return L(`Fret ${fret} did not sound: strike the string harder with the fingertip, close behind the fret.`, `Der ${fret}. Bund klang nicht: Schlag die Saite mit der Fingerkuppe kräftiger an, dicht hinter dem Bund.`);
  const keep = fret > 0 ? L(` Keep the finger on fret ${fret} pressed down.`, ` Der Finger im ${fret}. Bund bleibt fest gedrückt.`) : '';
  return L(
    `${fret ? `Fret ${fret}` : 'The open string'} did not sound: pull the finger off slightly downwards, so that it plucks the string as it leaves.${keep}`,
    `${fret ? `Der ${fret}. Bund` : 'Die leere Saite'} klang nicht: Zieh den Finger leicht nach unten von der Saite, sodass er sie dabei anzupft.${keep}`,
  );
}

export const slurTrainer: Screen = (root, [which], ctx) => {
  const all = SLURS();
  let pat = all.find((p) => p.n === Number(which)) ?? all[0];
  let st = slurStart();
  let timer = 0;
  let done = false;

  const midiOf = (f: number): number => OPEN_STRINGS[pat.s] + f;
  root.innerHTML = frame(
    `<b>${L('Hammer-on and pull-off', 'Hammer-on und Pull-off')}</b>`,
    `<div class="head"><div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div></div>
     <svg class="fit" id="tab" viewBox="0 0 1180 220" role="img" aria-label="${L('The pattern as tablature, the slurs as arcs over the notes', 'Das Muster als Tabulatur, die Bindungen als Bögen über den Tönen')}"></svg>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('h hammer-on · p pull-off', 'h Hammer-on · p Pull-off')}</p></div>`,
    `<div class="grp do"><button class="btn" id="again">${L('Start over', 'Von vorn')} <kbd>R</kbd></button></div>
     <div class="ladder" role="group" aria-label="${L('Pattern', 'Muster')}">${all.map((p) => `<button class="rung" data-n="${p.n}" aria-pressed="${p.n === pat.n}" title="${esc(p.name)}"><b>${p.n}</b><span>${esc(p.name)}</span></button>`).join('')}</div>
     <p class="auto">${L('The app hears whether the second note sounds, not how it was made: a hammer-on keeps one sound going, a new pluck starts another. Listen for it.', 'Die App hört, ob der zweite Ton klingt, nicht wie er entstand: Ein Hammer-on lässt einen Klang weiterlaufen, ein neues Zupfen beginnt einen anderen. Hör darauf.')}</p>`,
    ctx,
    ['#/learn', L('Learn', 'Lernen')],
  );

  const say = (cls: string, html: string): void => {
    const el = $('#fbk', root);
    el.className = `fbk ${cls}`;
    el.innerHTML = html;
  };
  function draw(): void {
    const notes: TabNote[] = pat.frets.map((f) => ({ s: pat.s, f }));
    const d = tabLine({ bars: [{ notes }], look: (i) => (done ? 'done' : i < st.at ? 'done' : i === st.at ? 'cur' : 'up'), slurs: [undefined, ...pat.how] }, LEARN, true);
    const svg = $('#tab', root);
    svg.innerHTML = d.svg;
    svg.setAttribute('viewBox', `0 0 1180 ${d.height}`);
    playhead(svg, null);
    $('#eb', root).textContent = L(`Pattern ${pat.n} of ${all.length} · round ${Math.min(st.round + 1, SLUR_ROUNDS)} of ${SLUR_ROUNDS}`, `Muster ${pat.n} von ${all.length} · Runde ${Math.min(st.round + 1, SLUR_ROUNDS)} von ${SLUR_ROUNDS}`);
    const f = pat.frets[st.at];
    const how = st.at > 0 ? pat.how[st.at - 1] : null;
    $('#h1', root).innerHTML = done
      ? L('Pattern done.', 'Muster geschafft.')
      : how === 'h'
        ? L(`Hammer on: fret <em>${f}</em>, no pluck.`, `Hammer-on: <em>${f}.</em> Bund, ohne Zupfen.`)
        : how === 'p'
          ? L(`Pull off to fret <em>${f}</em>.`, `Pull-off auf den <em>${f}.</em> Bund.`)
          : L(`Pluck fret <em>${f}</em>.`, `Zupf den <em>${f}.</em> Bund.`);
    $('#sub', root).textContent = done ? '' : L(`It sounds like ${noteName(midiOf(f))}.`, `Das klingt wie ${noteName(midiOf(f))}.`);
    setSimTarget(done ? null : { kind: 'note', midi: midiOf(f), string: pat.s });
    $$('[data-n]', root).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === pat.n)));
  }

  function restart(): void {
    stopTimer(timer);
    st = slurStart();
    done = false;
    say('info', L('Pluck the first note, then let the finger make the next one sound.', 'Zupf den ersten Ton, dann lass den Finger den nächsten zum Klingen bringen.'));
    draw();
  }

  function finish(): void {
    done = true;
    const { missed } = st;
    const bpm = slurTempo(st.starts, pat);
    let news = '';
    if (!missed && bpm > 0) news = levelNews([store.skills.record(slurKey(pat.n), bpm, Date.now())]);
    say(missed ? 'info' : 'good', `${missed ? '' : icon('check')}${L(`${SLUR_ROUNDS} rounds${missed ? `, ${missed} ${missed === 1 ? 'note' : 'notes'} that did not sound in time` : ', every note sounding'}.`, `${SLUR_ROUNDS} Runden${missed ? `, ${missed} ${missed === 1 ? 'Ton, der' : 'Töne, die'} nicht rechtzeitig klangen` : ', jeder Ton klang'}.`)}${news}`);
    draw();
    const next = all.find((p) => p.n === pat.n + 1);
    if (!missed && next) timer = later(3000, () => ((pat = next), restart()), L(`the next pattern: ${next.name}`, `das nächste Muster: ${next.name}`));
    else timer = later(3000, restart, L('the pattern again', 'das Muster noch einmal'));
  }

  const stopHear = hear(
    root,
    {
      onPitch: (e) => {
        if (done) return;
        const r = judgeSlur(st, pat, Math.round(e.midi + e.cents / 100), e.time);
        st = r.s;
        const news = r.news;
        if (news.kind === 'none') return;
        if (news.kind === 'done') return finish();
        if (news.kind === 'miss') say('bad', slurMissTip(news.fret, news.how));
        if (news.kind === 'round') say('good', L(`Round ${st.round}: every note sounded. Again.`, `Runde ${st.round}: jeder Ton klang. Noch einmal.`));
        draw();
      },
    },
    (l) => {
      l.pitchTracking = true;
      l.noteDetection = false;
    },
  );
  const pick = (n: number): void => {
    pat = all.find((p) => p.n === n) ?? pat;
    restart();
  };
  const stopKeys = keys({ r: restart });
  $$('[data-n]', root).forEach((b) => (b.onclick = () => pick(Number(b.dataset.n))));
  $('#again', root).onclick = restart;
  restart();
  void engine;
  return () => {
    stopTimer(timer);
    stopHear();
    stopKeys();
    setSimTarget(null);
  };
};
