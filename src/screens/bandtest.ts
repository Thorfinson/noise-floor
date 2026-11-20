/**
 * The speaker test, a step of the hearing check (#/check/band): can the band play through these speakers while
 * the app listens? The band plays for about 20 seconds while the player keeps still, then, if he likes, for 20
 * seconds while he strums along (src/core/bandcheck.ts). It ends with one sentence, and with the band setting that
 * goes with it: the band for speakers when it is safe; otherwise headphones for the band, or the click alone.
 * What it learned of the speakers (how strongly and how late they reach the microphone) is kept for every band
 * that plays through them afterwards.
 */
import type { BandHandle } from '../audio/band';
import { engine } from '../audio/engine';
import { BandCheck, HEARD_FIT, PLAY_END, QUIET_END, TEST_CHORDS, testBand, testChordAt, type Verdict } from '../core/bandcheck';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { chordName } from '../music/theory';
import { guitarA4 } from '../music/tuning';
import { $, esc, hear, icon, keys, pianoEars, type Screen } from '../ui/dom';
import { setSimTarget } from '../ui/practice';
import { frame } from './frame';

/** The sentence a verdict ends with. */
export const verdictSays = (v: Verdict): string =>
  v === 'safe'
    ? L('The band can play through these speakers: the app still hears only you.', 'Die Band kann über diese Lautsprecher spielen: Die App hört weiterhin nur dich.')
    : v === 'unsafe'
      ? L('Through these speakers the app takes the band for your playing: for the band, use headphones.', 'Über diese Lautsprecher hält die App die Band für dein Spiel: Für die Band brauchst du Kopfhörer.')
      : L('The microphone did not hear the band: with headphones on, the full band is for you.', 'Das Mikrofon hat die Band nicht gehört: Mit Kopfhörern ist die volle Band für dich da.');

export const bandTest: Screen = (root) => {
  const s = store.settings;
  const piano = s.instrument === 'piano';
  let check: BandCheck | null = null;
  let band: BandHandle | null = null;
  /** when the countdown was last shown, on the listener's clock */
  let shown = 0;

  root.innerHTML = frame(
    `<b>${L('Speaker test', 'Lautsprechertest')}</b>`,
    `<div class="head"><div class="say"><p class="eyebrow" id="eb"></p><h1 id="h1" aria-live="polite"></h1><p class="sub" id="sub"></p></div></div>
     <ol class="checklist" id="list"></ol>
     <div class="foot"><p class="fbk info" id="fbk"></p><p class="legend">${L('Set your speakers as loud as you like to play with the band.', 'Stell die Lautsprecher so laut, wie du mit der Band spielen willst.')}</p></div>`,
    `<div class="grp"><button class="btn primary" id="go"><span>${L('Start the test', 'Test starten')}</span> <kbd>${L('Space', 'Leertaste')}</kbd></button><button class="btn quiet" id="skip" hidden>${L('Done, no strumming', 'Fertig, ohne Mitspielen')} <kbd>→</kbd></button><span class="band-choose" id="choose" hidden><button class="btn" id="tophones">${L('Full band (headphones)', 'Volle Band (Kopfhörer)')}</button><button class="btn" id="toclick">${L('Click only', 'Nur Klick')}</button></span></div>
     <p class="auto">${L('About 40 seconds. Through speakers only: with headphones the full band plays anyway.', 'Etwa 40 Sekunden. Nur für Lautsprecher: Mit Kopfhörern spielt sowieso die volle Band.')}</p>`,
    undefined,
    ['#/check', L('Hearing check', 'Hörcheck')],
  );

  const say = (cls: string, html: string): void => {
    const el = $('#fbk', root);
    el.className = `fbk ${cls}`;
    el.innerHTML = html;
  };
  const title = (h1: string, sub = ''): void => {
    $('#h1', root).textContent = h1;
    $('#sub', root).textContent = sub;
  };

  /** the three steps, each with what came of it */
  function list(): void {
    // once the soundcheck has found that the microphone does not hear the band, keeping still tells nothing
    const c = check && (check.phase === 'learn' || check.heard) ? check : null;
    const p = c?.phantoms;
    const steps: [string, string, string][] = [
      [L('Soundcheck', 'Soundcheck'), !check ? '' : check.phase === 'learn' ? 'now' : check.heard ? 'right' : 'wrong', !check || check.phase === 'learn' ? '' : check.heard ? L('band heard', 'Band gehört') : L('not heard', 'nicht gehört')],
      [L('Keeping still', 'Still bleiben'), !c || c.phase === 'learn' ? '' : c.phase === 'quiet' ? 'now' : p!.notes + p!.chords > 0 || p!.onsets > 1 ? 'wrong' : 'right', !c || c.phase === 'learn' ? '' : p!.notes + p!.chords + p!.onsets === 0 ? L('nothing taken for you', 'nichts für dich gehalten') : L(`${p!.notes + p!.chords + p!.onsets} taken for you`, `${p!.notes + p!.chords + p!.onsets} für dich gehalten`)],
      [L('Strumming along', 'Mitspielen'), !c || (c.phase !== 'play' && !c.strums) ? '' : c.phase === 'play' ? 'now' : c.right / Math.max(1, c.strums) >= 0.6 ? 'right' : 'wrong', !c || !c.strums ? '' : L(`${c.right} of ${c.strums} right`, `${c.right} von ${c.strums} richtig`)],
    ];
    $('#list', root).innerHTML = steps.map(([name, cls, small]) => `<li class="${cls}"><span>${esc(name)}</span>${small ? `<small>${esc(small)}</small>` : ''}</li>`).join('');
  }

  /** What is on show, as the test goes on. */
  function show(): void {
    list();
    const c = check;
    if (!c) return;
    const t = engine.now() - c.start;
    const left = (end: number): string => L(`Speaker test · ${Math.max(0, Math.ceil(end - t))} s`, `Lautsprechertest · ${Math.max(0, Math.ceil(end - t))} s`);
    if (c.phase === 'learn') {
      $('#eb', root).textContent = left(QUIET_END);
      title(L('Keep still: the band plays, the app listens.', 'Bitte still: Die Band spielt, die App hört zu.'), L('First it learns how your speakers reach the microphone.', 'Zuerst lernt sie, wie deine Lautsprecher beim Mikrofon ankommen.'));
    } else if (c.phase === 'quiet') {
      $('#eb', root).textContent = left(QUIET_END);
      title(L('Keep still a little longer.', 'Noch ein wenig still bleiben.'), L('Whatever the app hears now is the band.', 'Was die App jetzt hört, ist die Band.'));
    } else if (c.phase === 'play') {
      $('#eb', root).textContent = left(PLAY_END);
      const now = testChordAt(Math.max(0, t));
      title(L(`Now strum along: ${chordName(now, piano)}`, `Jetzt spiel mit: ${chordName(now, piano)}`), TEST_CHORDS.map((id) => chordName(id, piano)).join(', ') + L(', one bar each.', ', je ein Takt.'));
      $('#skip', root).hidden = false;
      setSimTarget({ kind: 'chord', id: now, piano });
    } else finish();
  }

  function finish(): void {
    const c = check;
    if (!c) return;
    band?.stop(0.6);
    band = null;
    setSimTarget(null);
    $('#skip', root).hidden = true;
    $('#eb', root).textContent = L('Speaker test · done', 'Lautsprechertest · fertig');
    const v = c.verdict();
    // what was learned of the speakers is kept: every band through them afterwards is taken off with it
    if (c.learned && c.learned.fit >= HEARD_FIT) {
      s.bandCoupling = c.learned.coupling;
      // how late the speakers' sound comes back, measured as the timing in the settings measures it (the band
      // instead of six clicks); only when the microphone followed the band closely
      if (c.learned.fit >= 0.5 && Math.abs(c.learned.late) < 0.25) s.latency = Math.max(0, Math.min(0.35, engine.speakerLatency() + c.learned.late));
    }
    if (v === 'safe') s.band = 'speakers';
    store.progress['bandtest'] = Date.now();
    store.progress['bandtest:verdict'] = v === 'safe' ? 0 : v === 'unsafe' ? 1 : 2;
    store.save();
    title(verdictSays(v));
    say(v === 'safe' ? 'good' : 'info', v === 'safe' ? `${icon('check')}${L('The band for speakers is chosen.', 'Die Band für Lautsprecher ist gewählt.')}` : '');
    $('#choose', root).hidden = v === 'safe';
    $('#toclick', root).hidden = v === 'unheard';
    $('#go span', root).textContent = L('Test again', 'Noch einmal testen');
    $<HTMLButtonElement>('#go', root).disabled = false;
    list();
    check = null;
  }

  const stopEars = hear(
    root,
    {
      onLevel: (e) => {
        if (!check) return;
        check.tick(e.time);
        // the countdown, twice a second (a new phase is shown at once, by the check itself)
        if (check && e.time - shown >= 0.5) {
          shown = e.time;
          show();
        }
      },
      onOnset: (e) => check?.onset(e),
      onNote: (e) => check?.note(e),
      onChord: (e) => check?.chord(e),
    },
    (l) => {
      if (piano) pianoEars(l);
      else l.a4 = guitarA4();
      l.chordCandidates = [...new Set([...TEST_CHORDS, 'Am', 'A', 'E', 'Dm', 'F'])];
    },
  );

  function start(): void {
    if (check) return;
    $('#choose', root).hidden = true;
    say('info', '');
    if (!engine.micOn || !engine.listener || !engine.ctx) {
      title(L('The speaker test needs the microphone: switch it on in the settings.', 'Der Lautsprechertest braucht das Mikrofon: Schalte es in den Einstellungen ein.'));
      $('#choose', root).hidden = true;
      return;
    }
    const parts = testBand(engine.ctx.sampleRate, piano ? s.pianoA4 : guitarA4());
    const at = engine.now() + 0.3;
    band = engine.playBand(at, parts, { drums: 1, bass: 1, keys: 1, lead: 1 }, { loop: true, volume: Math.max(0.2, s.bandVolume) });
    check = new BandCheck(engine.listener, at + engine.speakerLatency(), () => show());
    $<HTMLButtonElement>('#go', root).disabled = true;
    show();
  }

  const go = (): void => start();
  const skip = (): void => {
    if (check?.phase === 'play') check.skip();
  };
  $('#go', root).onclick = go;
  $('#skip', root).onclick = skip;
  $('#tophones', root).onclick = () => {
    s.band = 'phones';
    store.save();
    say('good', `${icon('check')}${L('The full band is chosen: put your headphones on.', 'Die volle Band ist gewählt: Setz deine Kopfhörer auf.')}`);
  };
  $('#toclick', root).onclick = () => {
    s.band = 'click';
    store.save();
    say('good', `${icon('check')}${L('The click plays alone from now on.', 'Ab jetzt spielt der Klick allein.')}`);
  };
  const stopKeys = keys({ ' ': go, ArrowRight: skip });
  title(L('Can the band play through your speakers?', 'Kann die Band über deine Lautsprecher spielen?'), L('About 20 seconds of band while you keep still, then 20 seconds of strumming along, if you like.', 'Etwa 20 Sekunden Band, während du still bist, dann 20 Sekunden Mitspielen, wenn du magst.'));
  $('#eb', root).textContent = L('Speaker test', 'Lautsprechertest');
  list();
  return () => {
    band?.stop(0.2);
    band = null;
    check = null;
    stopEars();
    stopKeys();
    setSimTarget(null);
  };
};
