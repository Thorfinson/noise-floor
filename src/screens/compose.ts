/**
 * Making music, not only playing it. Two pages:
 * - your own chord progression, made into a song of your own: chords bar by bar, a strumming or picking
 *   pattern, a tempo; heard before it is kept, then learned like any song (on the piano as chords to strike);
 * - playing freely: five notes of a scale over a drone, and whatever is played the app shows, without a score.
 * Lesson plans put making up music and improvising beside playing from the start; a microphone that only
 * shows what it heard, and never judges, is the right ear for it.
 */
import { engine } from '../audio/engine';
import { mixInto, strum } from '../audio/synth';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { KEY_CHORDS, KEY_CHORDS_ON, type Song } from '../music/content';
import { chordKey } from '../music/difficulty';
import { OPEN_CHORDS } from '../music/path';
import { fromChords } from '../music/pianobook';
import { chart, PICKS, picked, strummed, STRUMS } from '../music/songwriting';
import { chordName, chordNotes, CHORDS, midiToTab, noteName, pianoChord } from '../music/theory';
import { $, $$, esc, go, hear, icon, keys, pianoEars, voiceEars, type Screen } from '../ui/dom';
import { fretboard, keyboard, LEARN } from '../ui/draw';
import { frame } from './learn';

/** The patterns a progression can be played in, by name. */
const PATTERNS = (): { id: string; name: string; picked: boolean }[] => [
  { id: 'beat', name: L('Strummed: every beat', 'Angeschlagen: jeder Schlag'), picked: false },
  { id: 'half', name: L('Strummed: on one and three', 'Angeschlagen: auf eins und drei'), picked: false },
  { id: 'folk', name: L('Strummed: down, down-up', 'Angeschlagen: ab, ab-auf'), picked: false },
  { id: 'pop', name: L('Strummed: down, down-up, up-down-up', 'Angeschlagen: ab, ab-auf, auf-ab-auf'), picked: false },
  { id: 'waltz', name: L('Strummed: three to the bar', 'Angeschlagen: drei im Takt'), picked: false },
  { id: 'chug', name: L('Power chords: eight down', 'Powerchords: acht ab'), picked: false },
  { id: 'three', name: L('Picked: bass and two fingers', 'Gezupft: Bass und zwei Finger'), picked: true },
  { id: 'eight', name: L('Picked: eight to the bar', 'Gezupft: acht im Takt'), picked: true },
  { id: 'travis', name: L('Picked: the thumb alternating', 'Gezupft: der Daumen im Wechsel'), picked: true },
];

/** The song a progression makes, or what is wrong with it. */
export function songOf(title: string, text: string, pattern: string, bpm: number, id = 'own-' + Date.now().toString(36)): Song | string {
  const clean = text.replace(/\|/g, ' ').trim();
  if (!clean) return L('Put in some chords first.', 'Gib zuerst ein paar Akkorde ein.');
  try {
    chart(clean, id);
  } catch (e) {
    const m = /no chord called (.+)$/.exec(String((e as Error).message));
    return m ? L(`There is no chord called ${m[1]} here. Pick one from the list.`, `Einen Akkord namens ${m[1]} gibt es hier nicht. Wähl einen aus der Liste.`) : String(e);
  }
  const p = PATTERNS().find((x) => x.id === pattern) ?? PATTERNS()[0];
  const song = p.picked ? picked(id, title, '', bpm, pattern as keyof typeof PICKS, `[All] ${clean}`) : strummed(id, title, '', bpm, pattern as keyof typeof STRUMS, `[All] ${clean}`);
  return { ...song, by: undefined, custom: true };
}

export const compose: Screen = (root) => {
  const piano = store.settings.instrument === 'piano';
  const pool = piano ? [...KEY_CHORDS, ...KEY_CHORDS_ON] : [...OPEN_CHORDS, 'E7', 'A7', 'D7', 'G7', 'C7', 'B7', 'Am7', 'Em7', 'Cadd9', 'Dsus4', 'F', 'E5', 'A5', 'D5', 'G5', 'C5'];
  // the ones that already ring first: a song of your own is best made of chords you have
  const known = pool.filter((c) => store.skills.level(chordKey(c, piano)) >= 1);
  const order = [...known, ...pool.filter((c) => !known.includes(c))];
  let ctx: AudioContext | null = null;
  root.innerHTML = `<div class="page">
    <div><a class="btn quiet" href="#/tools">${icon('left')}${L('Tools', 'Werkzeuge')}</a></div>
    <div><p class="kick">${L('Your own song', 'Dein eigener Song')}</p><h1>${L('A chord progression of your own.', 'Eine eigene Akkordfolge.')}</h1>
      <p class="lede">${L('Pick chords bar by bar, or type them: a space between bars, <b>G,D</b> for a bar of two chords, <b>%</b> for the bar before again. Hear it; when it sounds right, keep it and learn it like any song.', 'Wähl Akkorde Takt für Takt oder tipp sie ein: ein Leerzeichen zwischen Takten, <b>G,D</b> für einen Takt mit zwei Akkorden, <b>%</b> für den Takt davor noch einmal. Hör sie dir an; klingt sie richtig, behalte sie und lern sie wie jeden Song.')}</p></div>
    <div class="field"><label for="title">${L('Title', 'Titel')}</label><input id="title" type="text" maxlength="60" placeholder="${L('My song', 'Mein Song')}"></div>
    <div><p class="k">${L('Chords: the ones that ring for you first', 'Akkorde: die, die bei dir klingen, zuerst')}</p><div class="chips">${order.map((c) => `<button class="chip${known.includes(c) ? ' known' : ''}" data-chord="${esc(c)}">${esc(chordName(c, piano))}</button>`).join('')}<button class="chip" data-chord="%">%</button><button class="chip quiet" id="undo">${L('Remove the last', 'Den letzten entfernen')}</button></div></div>
    <textarea id="src" rows="3" spellcheck="false" aria-label="${L('The chords, bar by bar', 'Die Akkorde, Takt für Takt')}" placeholder="G C G D Em C D G"></textarea>
    <div class="field"><label for="pat">${L('How it is played', 'Wie gespielt wird')}</label><select id="pat">${PATTERNS().filter((p) => !piano || !p.picked).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="bpm">${L('Tempo', 'Tempo')}<small>${L('Beats a minute at full speed.', 'Schläge pro Minute im vollen Tempo.')}</small></label><input id="bpm" type="number" min="40" max="180" value="90"></div>
    <p class="note" id="msg" aria-live="polite"></p>
    <div class="row"><button class="btn" id="hear">${L('Hear it', 'Anhören')}</button><button class="btn primary" id="save">${L('Keep it and learn it', 'Behalten und lernen')}</button></div>
  </div>`;
  const src = $<HTMLTextAreaElement>('#src', root);
  const read = (): Song | string => songOf($<HTMLInputElement>('#title', root).value.trim() || L('My song', 'Mein Song'), src.value, $<HTMLSelectElement>('#pat', root).value, Math.max(40, Math.min(180, Number($<HTMLInputElement>('#bpm', root).value) || 90)));
  const say = (t: string): void => void ($('#msg', root).textContent = t);
  $$('[data-chord]', root).forEach((b) => (b.onclick = () => {
    src.value = `${src.value.trim()} ${b.dataset.chord}`.trim();
    const r = read();
    say(typeof r === 'string' ? r : L(`${r.bars.length} bars.`, `${r.bars.length} Takte.`));
  }));
  $('#undo', root).onclick = () => {
    src.value = src.value.trim().split(/\s+/).slice(0, -1).join(' ');
  };
  // heard on its own: this page does not listen, so it needs no microphone
  $('#hear', root).onclick = () => {
    const r = read();
    if (typeof r === 'string') return say(r);
    ctx ??= new AudioContext();
    const sr = ctx.sampleRate;
    const bars = r.bars.slice(0, 16);
    const barSecs = r.bars[0].notes.reduce((s, n) => s + (n.len ?? 1), 0) * r.noteDur;
    const out = new Float32Array(Math.ceil((bars.length * barSecs + 2) * sr));
    let t = 0;
    for (const b of bars) {
      let u = 0;
      for (const n of b.notes) {
        const id = n.strum ?? b.chord!;
        const notes = piano ? pianoChord(id).midis : n.strum ? chordNotes(CHORDS[id]) : [40 + [0, 5, 10, 15, 19, 24][n.s] + n.f];
        mixInto(out, strum(notes, sr, n.strum || piano ? 1.2 : 1.6, { piano }, piano ? 5 : 12), (t + u * r.noteDur) * sr);
        u += n.len ?? 1;
      }
      t += barSecs;
    }
    const buf = ctx.createBuffer(1, out.length, sr);
    buf.getChannelData(0).set(out);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(ctx.destination);
    s.start();
    say(L(`Playing ${bars.length} bars.`, `${bars.length} Takte werden gespielt.`));
  };
  $('#save', root).onclick = () => {
    const r = read();
    if (typeof r === 'string') return say(r);
    if (piano) {
      const p = fromChords(r, false);
      if (!p) return say(L('These chords cannot be made into a piece for the piano.', 'Aus diesen Akkorden lässt sich kein Stück fürs Klavier machen.'));
      const piece = { ...p, id: r.id, title: r.title, custom: true };
      store.pieces.push(piece);
      store.current.piano = piece.id;
      store.save();
      return go(`/piano/${piece.id}`);
    }
    store.songs.push(r);
    store.current.guitar = r.id;
    store.save();
    go(`/song/${r.id}`);
  };
  return () => void ctx?.close();
};

/* ───────────────────────── playing freely ───────────────────────── */

/** The five notes of the minor pentatonic over a root: the scale nothing over its chord clashes with. */
export const pentatonic = (root: number): number[] => [0, 3, 5, 7, 10].map((d) => (root + d) % 12);

export const jam: Screen = (root) => {
  const inst = store.settings.instrument;
  const piano = inst === 'piano';
  const voice = inst === 'voice';
  // A minor for the guitar (the box at the fifth fret), C major's own notes (A minor's) for the piano and the voice
  const tonic = 9;
  const scale = pentatonic(tonic);
  let drone = false;
  let heard: { midi: number; inScale: boolean }[] = [];
  let stopEars: () => void = () => undefined;
  root.innerHTML = frame(
    `<b>${L('Play freely', 'Frei spielen')}</b> · ${L('A minor pentatonic', 'A-Moll-Pentatonik')}`,
    `<div class="head"><div class="say"><p class="eyebrow">${L('No score, no clock: the app only shows what it heard', 'Keine Wertung, keine Uhr: Die App zeigt nur, was sie gehört hat')}</p><h1 id="h1">${L('Play anything, with these five notes.', 'Spiel irgendetwas, mit diesen fünf Tönen.')}</h1>
       <p class="sub">${voice ? L('Sing a phrase of three to five notes, stop, and answer it with another. A, C, D, E and G: none of them clashes.', 'Sing eine Phrase aus drei bis fünf Tönen, hör auf, und antworte mit einer anderen. A, C, D, E und G: Keiner davon reibt.') : L('A phrase of three to five notes, a breath, and an answer to it. Start on A and end on A: that is home.', 'Eine Phrase aus drei bis fünf Tönen, ein Atemzug, und eine Antwort darauf. Fang auf A an und hör auf A auf: Das ist zu Hause.')}</p></div></div>
     <svg class="fit" id="map" viewBox="0 0 1180 ${piano || voice ? 226 : 224}" role="img" aria-label="${L('Where the five notes are; what was played lights up', 'Wo die fünf Töne liegen; was gespielt wurde, leuchtet auf')}"></svg>
     <div class="trail" id="trail" aria-live="polite"></div>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('blue: in the scale · amber: outside it, a colour to use on purpose', 'blau: in der Tonleiter · gelb: außerhalb, eine Farbe für bewussten Gebrauch')}</p></div>`,
    `<div class="grp"><button class="btn tog" id="drone" aria-pressed="false">${L('A drone on A (headphones)', 'Bordun auf A (Kopfhörer)')} <kbd>D</kbd></button><button class="btn quiet" id="clear">${L('Clear', 'Leeren')} <kbd>R</kbd></button></div>
     <p class="auto">${L('The drone is for headphones: through speakers the microphone would hear it as notes.', 'Der Bordun ist für Kopfhörer: Über Lautsprecher würde das Mikrofon ihn als Töne hören.')}</p>`,
    undefined,
    ['#/tools', L('Tools', 'Werkzeuge')],
  );
  const draw = (): void => {
    const last = heard[heard.length - 1];
    if (piano || voice) {
      const marks = [];
      for (let m = 57; m <= 81; m++) if (scale.includes(m % 12)) marks.push({ midi: m, hot: last?.midi === m, done: m % 12 === tonic, fg: undefined });
      if (last && !last.inScale) marks.push({ midi: last.midi, hot: true });
      $('#map', root).innerHTML = keyboard(marks, LEARN, 57 - 9, 3, { x: 16, y: 6, w: 1148, h: 212, names: true });
    } else {
      // the box at the fifth fret: every note of the scale there, the roots marked
      const dots: { s: number; f: number; fg: number }[] = [];
      for (let s = 0; s < 6; s++) for (let f = 5; f <= 8; f++) if (scale.includes((([40, 45, 50, 55, 59, 64][s] + f) % 12))) dots.push({ s, f, fg: f - 4 });
      // the note just played, where it lies in the box (or wherever it can be played, outside it)
      const inBox = last ? [0, 1, 2, 3, 4, 5].map((s) => ({ s, f: last.midi - [40, 45, 50, 55, 59, 64][s] })).find((p) => p.f >= 5 && p.f <= 9) : undefined;
      const pluck = last ? (inBox ?? { ...midiToTab(last.midi) }) : null;
      $('#map', root).innerHTML = fretboard(dots, pluck, LEARN, 4);
    }
    $('#trail', root).innerHTML = heard.slice(-16).map((h) => `<span class="${h.inScale ? 'in' : 'out'}">${noteName(h.midi).replace(/\d+$/, '')}</span>`).join('');
    const n = heard.length;
    const inside = heard.filter((h) => h.inScale).length;
    $('#fbk', root).textContent = n ? L(`${n} ${n === 1 ? 'note' : 'notes'}, ${inside} in the scale.`, `${n} ${n === 1 ? 'Ton' : 'Töne'}, ${inside} in der Tonleiter.`) : L('Waiting for the first note.', 'Wartet auf den ersten Ton.');
  };
  const note = (midi: number): void => {
    heard.push({ midi, inScale: scale.includes(((midi % 12) + 12) % 12) });
    if (heard.length > 200) heard = heard.slice(-100);
    draw();
  };
  let lastPitch = -1;
  let lastAt = 0;
  stopEars = voice
    ? hear(
        root,
        {
          // a sung note counts once it has been held for a moment: not every reading of a sliding voice
          onPitch: (e) => {
            const m = Math.round(e.midi + e.cents / 100);
            if (m !== lastPitch) {
              lastPitch = m;
              lastAt = e.time;
            } else if (lastAt >= 0 && e.time - lastAt > 0.25) {
              lastAt = -1;
              note(m);
            }
          },
        },
        voiceEars,
      )
    : hear(root, { onNote: (e) => e.conf > 0.6 && note(e.midi) }, piano ? pianoEars : undefined);
  const toggleDrone = (): void => {
    drone = !drone;
    engine.drone(drone ? [voice ? 57 : 45, voice ? 64 : 52] : [], 0.35);
    $('#drone', root).setAttribute('aria-pressed', String(drone));
  };
  $('#drone', root).onclick = toggleDrone;
  $('#clear', root).onclick = () => {
    heard = [];
    draw();
  };
  const stopKeys = keys({
    d: toggleDrone,
    r: () => {
      heard = [];
      draw();
    },
  });
  draw();
  return () => {
    engine.drone([]);
    stopEars();
    stopKeys();
  };
};
