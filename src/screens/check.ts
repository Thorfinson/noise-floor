/**
 * The hearing check: how the app hears your instrument, your microphone and your room, in about two minutes.
 * First two seconds of quiet (the room's noise), then what the app asks for: the six open strings, four chords
 * and a muted hit on the guitar; five keys and three chords on the piano; five notes in your range with the
 * voice (src/core/checkrun.ts). At the end: how much was heard right, how loud the instrument and the room reach
 * the microphone, how far out of tune it is, and what to change. The check can be saved as a sound file with a
 * report, and a recording made elsewhere (a phone, another microphone) can be checked instead of playing live.
 * Nothing is sent anywhere.
 */
import { engine } from '../audio/engine';
import { encodeWav } from '../audio/wav';
import { checkChords, checkItems, checkRecording, CheckRun, type CheckSummary } from '../core/checkrun';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { chordName, noteName, OPEN_STRINGS } from '../music/theory';
import { guitarA4 } from '../music/tuning';
import { $, esc, hear, icon, keys, pianoEars, voiceEars, type Screen } from '../ui/dom';
import { setSimTarget } from '../ui/practice';
import { frame } from './learn';
import { voiceRange } from './sing';

export const hearingCheck: Screen = (root) => {
  const inst = store.settings.instrument;
  const piano = inst === 'piano';
  const voice = inst === 'voice';
  const [lo, hi] = voice ? voiceRange() : [0, 0];
  const items = checkItems(inst, voice ? Math.round((lo + hi) / 2) : 62);
  const a4 = piano ? store.settings.pianoA4 : guitarA4();
  let run = new CheckRun(items, piano, () => show());
  let live = false;
  let rec: { samples: Float32Array; sampleRate: number } | null = null;
  let report: Record<string, unknown> | null = null;

  root.innerHTML = frame(
    `<b>${L('Hearing check', 'Hörcheck')}</b>`,
    `<div class="head"><div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div></div>
     <ol class="checklist" id="list"></ol>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('Play as you usually do, where you usually sit.', 'Spiel, wie du sonst spielst, dort, wo du sonst sitzt.')}</p></div>`,
    `<div class="grp"><button class="btn primary" id="go"><span>${L('Start the check', 'Check starten')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn quiet" id="skip" hidden>${L('Not this one', 'Diesen nicht')} <kbd>→</kbd></button><button class="btn quiet" id="save" hidden>${L('Save the check as files', 'Check als Dateien speichern')}</button><button class="btn quiet" id="fromfile">${L('Check a recording', 'Eine Aufnahme prüfen')}</button><input type="file" id="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" hidden></div>
     <p class="auto">${L('About two minutes. A recording made elsewhere, of the same things in the same order, can be checked too. Nothing is sent anywhere.', 'Etwa zwei Minuten. Eine anderswo gemachte Aufnahme derselben Dinge in derselben Reihenfolge lässt sich auch prüfen. Nichts wird irgendwohin geschickt.')}</p>`,
    undefined,
    ['#/tools', L('Tools', 'Werkzeuge')],
  );

  const say = (cls: string, html: string): void => {
    const el = $('#fbk', root);
    el.className = `fbk ${cls}`;
    el.innerHTML = html;
  };
  const sim = (): void => {
    const it = live ? run.current : undefined;
    setSimTarget(
      !it || it.kind === 'quiet'
        ? null
        : it.kind === 'thud'
          ? { kind: 'mute' }
          : it.kind === 'chord'
            ? { kind: 'chord', id: String(it.want), piano }
            : it.kind === 'sung'
              ? { kind: 'note', midi: Number(it.want), voice: true }
              : { kind: 'note', midi: Number(it.want), piano, ...(piano ? {} : { string: OPEN_STRINGS.indexOf(Number(it.want)) }) },
    );
  };

  function list(): void {
    $('#list', root).innerHTML = items
      .slice(1)
      .map((it, k) => {
        const o = run.outcomes.find((x) => x.item === it);
        const cls = o ? (o.right ? 'right' : 'wrong') : live && k + 1 === run.at ? 'now' : '';
        return `<li class="${cls}"><span>${esc(it.kind === 'chord' ? chordName(String(it.want), piano) : it.kind === 'thud' ? L('muted hit', 'gedämpft') : noteName(Number(it.want)))}</span>${o ? `<small>${esc(o.heard)}</small>` : ''}</li>`;
      })
      .join('');
    $('#eb', root).textContent = run.at < 0 ? L(`Hearing check · ${items.length - 1} things to play`, `Hörcheck · ${items.length - 1} Dinge zu spielen`) : !run.done ? L(`Hearing check · ${run.at} of ${items.length - 1}`, `Hörcheck · ${run.at} von ${items.length - 1}`) : L('Hearing check · done', 'Hörcheck · fertig');
  }

  /** What is on show: the thing to play, and how the one before went. */
  function show(): void {
    list();
    if (!live) return;
    const last = run.outcomes[run.outcomes.length - 1];
    if (last) say(last.right ? 'good' : 'info', last.right ? `${icon('check')}${L('Heard right.', 'Richtig gehört.')}` : L(`Heard: ${last.heard}.`, `Gehört: ${last.heard}.`));
    if (run.done) return finish(run.summary(inst));
    const it = run.current!;
    $('#h1', root).innerHTML = esc(it.say);
    $('#sub', root).textContent = it.kind === 'quiet' ? '' : L('Then let it ring until the app moves on.', 'Dann lass es klingen, bis die App weitergeht.');
    $('#skip', root).hidden = it.kind === 'quiet';
    sim();
  }

  function finish(s: CheckSummary, from = ''): void {
    live = false;
    setSimTarget(null);
    if (!from) rec = engine.micOn ? engine.recorded() : null;
    store.progress[`check:${inst}`] = Date.now();
    store.progress[`checkscore:${inst}`] = Math.round((100 * s.right) / Math.max(1, s.of));
    store.save();
    $('#h1', root).innerHTML = L(`${s.right} of ${s.of} heard right${from ? ` in ${esc(from)}` : ''}.`, `${s.right} von ${s.of} richtig gehört${from ? ` in ${esc(from)}` : ''}.`);
    $('#sub', root).textContent = L(`The room: ${Math.round(s.roomDb)} dB. Your ${voice ? 'voice' : 'instrument'}: ${Math.round(s.levelDb)} dB at its loudest. Out of tune by ${Math.abs(s.centsOff)} cents on average.`, `Der Raum: ${Math.round(s.roomDb)} dB. ${voice ? 'Deine Stimme' : 'Dein Instrument'}: ${Math.round(s.levelDb)} dB am lautesten. Im Schnitt ${Math.abs(s.centsOff)} Cent daneben.`);
    say(s.right === s.of && !s.advice.length ? 'good' : 'info', s.right === s.of && !s.advice.length ? `${icon('check')}${L('The app hears your setup well.', 'Die App hört dein Instrument in deinem Raum gut.')}` : s.advice.map(esc).join(' '));
    $('#skip', root).hidden = true;
    $('#save', root).hidden = false;
    $('#go span', root).textContent = L('Check again', 'Noch einmal prüfen');
    $<HTMLButtonElement>('#go', root).disabled = false;
    list();
    report = { app: 'noise-floor/v1', check: inst, from: from || 'live', at: new Date().toISOString(), right: s.right, of: s.of, roomDb: Math.round(s.roomDb), levelDb: Math.round(s.levelDb), centsOff: s.centsOff, a4, items: run.outcomes.map((o) => ({ want: o.item.want, kind: o.item.kind, heard: o.heard, right: o.right, cents: o.cents, peakDb: Math.round(o.peak) })), advice: s.advice };
  }

  function start(): void {
    run = new CheckRun(items, piano, () => show());
    live = true;
    say('info', '');
    if (engine.micOn) engine.record(180);
    $<HTMLButtonElement>('#go', root).disabled = true;
    $('#save', root).hidden = true;
    run.start();
  }

  const stopEars = hear(
    root,
    {
      onLevel: (e) => live && run.level(e),
      onNote: (e) => live && run.note(e),
      onChord: (e) => live && run.chord(e),
      onThud: (e) => live && run.thud(e),
      onPitch: (e) => live && run.pitch(e),
    },
    (l) => {
      if (voice) voiceEars(l);
      else if (piano) pianoEars(l);
      else l.a4 = guitarA4();
      l.pitchTracking = true;
      l.chordCandidates = checkChords(inst);
    },
  );

  /** A recording made elsewhere, checked as if it were played now: the same things in the same order. */
  async function fromFile(f: File): Promise<void> {
    const ctx = engine.ctx ?? new AudioContext();
    try {
      const buf = await ctx.decodeAudioData(await f.arrayBuffer());
      const ch = buf.getChannelData(0);
      live = false;
      say('info', L('Listening to the recording…', 'Höre die Aufnahme…'));
      const r = checkRecording(ch, buf.sampleRate, inst, a4, items);
      run = r.run;
      rec = { samples: ch, sampleRate: buf.sampleRate };
      finish(r.summary, f.name);
    } catch {
      say('bad', L('That file could not be read as sound.', 'Diese Datei ließ sich nicht als Klang lesen.'));
    }
  }

  const save = (): void => {
    if (!report) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const down = (blob: Blob, name: string): void => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    down(new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' }), `noise-floor-check-${inst}-${stamp}.json`);
    if (rec && rec.samples.length) down(new Blob([encodeWav(rec.samples, rec.sampleRate)], { type: 'audio/wav' }), `noise-floor-check-${inst}-${stamp}.wav`);
    say('info', L('Saved to your downloads folder: the report, and the recording when there is one.', 'In deinem Download-Ordner gespeichert: der Bericht, und die Aufnahme, wenn es eine gibt.'));
  };
  const go = (): void => (live ? undefined : start());
  const skip = (): void => {
    const it = run.current;
    if (live && it && it.kind !== 'quiet') run.settle(L('left out', 'ausgelassen'), false);
  };
  const file = $<HTMLInputElement>('#file', root);
  $('#go', root).onclick = go;
  $('#skip', root).onclick = skip;
  $('#save', root).onclick = save;
  $('#fromfile', root).onclick = () => file.click();
  file.onchange = () => {
    const f = file.files?.[0];
    if (f) void fromFile(f);
  };
  const stopKeys = keys({ ' ': go, ArrowRight: skip });
  $('#h1', root).textContent = L('How well does the app hear you, here?', 'Wie gut hört dich die App, hier?');
  $('#sub', root).textContent = voice ? L('Two seconds of quiet, then five notes to sing.', 'Zwei Sekunden Stille, dann fünf Töne zum Singen.') : piano ? L('Two seconds of quiet, then five keys and three chords.', 'Zwei Sekunden Stille, dann fünf Tasten und drei Akkorde.') : L('Two seconds of quiet, then the six open strings, four chords and a muted hit.', 'Zwei Sekunden Stille, dann die sechs leeren Saiten, vier Akkorde und ein gedämpfter Anschlag.');
  list();
  return () => {
    live = false;
    stopEars();
    stopKeys();
    setSimTarget(null);
  };
};
