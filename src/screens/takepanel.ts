/**
 * The take panel under a lesson's music: the recording of a take at full speed as a row of bars to listen
 * back to, the player's own count of slips asked for before the app's verdict, the first recording of the
 * song, and saving a take as a file.
 */
import { engine } from '../audio/engine';
import { encodeWav, resample } from '../audio/wav';
import { dayMonth, L } from '../core/i18n';
import { store, type Instrument, type TakeMeta } from '../core/store';
import { loadTake, TAKE_RATE, takeMeta } from '../core/takes';
import { $, $$, esc } from '../ui/dom';

/** A take on show: its sound (empty when nothing was recorded) and where its bars lie in it. */
export interface ShownTake {
  samples: Float32Array;
  rate: number;
  meta: TakeMeta;
}

/** The markup of the panel, hidden until there is a take to show. */
export const takeBox = (): string => `<div class="takebox" id="takebox" hidden>
       <div class="selfrate" id="selfrate" hidden role="group" aria-label="${L('How many slips did you hear?', 'Wie viele Patzer hast du gehört?')}"><span>${L('Slips you heard:', 'Gehörte Patzer:')}</span>${['0', '1', '2', '3+'].map((v, i) => `<button class="btn" data-rate="${i}">${v} <kbd>${i}</kbd></button>`).join('')}</div>
       <div class="barmap" id="barmap" role="group" aria-label="${L('The recording, bar by bar: pick one to hear it', 'Die Aufnahme, Takt für Takt: wähl einen, um ihn zu hören')}"></div>
       <div class="row"><button class="btn" id="listen">${L('Listen back', 'Anhören')} <kbd>P</kbd></button><button class="btn quiet" id="firsttake" hidden>${L('Your first recording', 'Deine erste Aufnahme')}</button><button class="btn quiet" id="savetake">${L('Save as a file', 'Als Datei speichern')}</button><span class="note" id="takenote"></span></div>
     </div>`;

export interface TakePanel {
  /** Shows the recording just made under the music, as a row of bars to pick from. */
  show: (t: ShownTake, hideVerdict: boolean) => void;
  /** Takes the panel away while a new take at full speed is played. */
  hide: () => void;
  /** The player's count of slips, asked for before the app's verdict is shown, and kept beside it. */
  selfRate: (app: number, then: () => void) => void;
  /** The answer to the question about slips (0 to 3), when it is being asked; false when it is not. */
  rate: (n: number) => boolean;
  /** Stops asking: the take the question was about is no longer on show. */
  drop: () => void;
  /** P: the recording on show, from the start. */
  listen: () => void;
}

export interface TakeHooks {
  inst: Instrument;
  /** the song or piece */
  id: string;
  /** "bar 3", or the phrase of the piano */
  barsSaid: (r: { from: number; to: number }) => string;
  say: (cls: string, html: string) => void;
  /** a take that is being played stops before a recording is heard */
  pause: () => void;
  /** the recording sounds for so many seconds: what the microphone hears meanwhile is not playing */
  playing: (seconds: number) => void;
}

export function takePanel(root: HTMLElement, h: TakeHooks): TakePanel {
  const { inst, barsSaid, say } = h;
  /** The recording on show: the one just made, or one that was kept. */
  let heardTake: ShownTake | null = null;
  /** the bars of the last take at full speed, recorded or not */
  let shownTake: ShownTake | null = null;
  /** the player is asked for their count of slips: what to do with the answer */
  let rating: ((n: number) => void) | null = null;

  function paintBars(hidden: boolean): void {
    const t = shownTake;
    if (!t) return;
    $('#barmap', root).innerHTML = t.meta.bars.map((b, k) => `<button class="bm${hidden ? '' : b.clean ? ' ok' : ' bad'}" data-k="${k}" aria-label="${esc(barsSaid({ from: b.bar, to: b.bar }))}${hidden ? '' : b.clean ? L(': clean', ': sauber') : L(': not clean', ': nicht sauber')}">${b.bar + 1}</button>`).join('');
    $$<HTMLButtonElement>('#barmap [data-k]', root).forEach((el) => (el.onclick = () => {
      const b = t.meta.bars[Number(el.dataset.k)];
      if (t.samples.length) playBack(t.samples, t.rate, Math.max(0, b.from - 0.15), b.to + 0.4, barsSaid({ from: b.bar, to: b.bar }));
    }));
  }

  function showTake(t: ShownTake, hideVerdict: boolean): void {
    // without a recording (no microphone, or recording switched off) the bars are there to look at, not to hear
    const audible = t.samples.length > 0;
    heardTake = audible ? t : null;
    shownTake = t;
    $('#takebox', root).hidden = false;
    paintBars(hideVerdict);
    const first = takeMeta(inst, h.id, 'first');
    $('#firsttake', root).hidden = !first;
    $('#listen', root).hidden = !audible;
    $('#savetake', root).hidden = !audible;
    $('#takenote', root).textContent = !audible ? (store.settings.recordTakes ? L('Nothing was recorded: the microphone is off.', 'Nichts wurde aufgenommen: Das Mikrofon ist aus.') : L('Recording is switched off in the settings.', 'Das Aufnehmen ist in den Einstellungen ausgeschaltet.')) : first ? L(`Your first recording of it is from ${dayMonth(first.t)}, at ${first.tempo}%.`, `Deine erste Aufnahme davon ist vom ${dayMonth(first.t)}, bei ${first.tempo}%.`) : L('Kept in this browser as your first recording of it.', 'In diesem Browser als deine erste Aufnahme davon gespeichert.');
  }

  function selfRate(app: number, then: () => void): void {
    $('#selfrate', root).hidden = false;
    rating = (n) => {
      rating = null;
      $('#selfrate', root).hidden = true;
      store.ratings.push({ t: Date.now(), self: n, app });
      store.save();
      paintBars(false);
      then();
      const same = Math.min(n, 3) === Math.min(app, 3);
      $('#takenote', root).textContent = same ? L(`You heard it as the app did: ${app === 0 ? 'no slips' : `slips in ${app} ${app === 1 ? 'bar' : 'bars'}`}.`, `Du hast es gehört wie die App: ${app === 0 ? 'keine Patzer' : `Patzer in ${app} ${app === 1 ? 'Takt' : 'Takten'}`}.`) : L(`You counted ${n === 3 ? '3 or more' : n}; the app heard slips in ${app} ${app === 1 ? 'bar' : 'bars'}. Listen back to the red ones to hear what it heard.`, `Du hast ${n === 3 ? '3 oder mehr' : n} gezählt; die App hörte Patzer in ${app} ${app === 1 ? 'Takt' : 'Takten'}. Hör dir die roten an, um zu hören, was sie gehört hat.`);
    };
    $$<HTMLButtonElement>('#selfrate [data-rate]', root).forEach((b) => (b.onclick = () => rating?.(Number(b.dataset.rate))));
  }

  /** Plays part of a recording through the speakers; what the microphone hears of it meanwhile is not playing. */
  function playBack(samples: Float32Array, rate: number, from = 0, to = Infinity, what = ''): void {
    const ctx = engine.ctx;
    if (!ctx) return;
    h.pause();
    let part = samples.subarray(Math.floor(from * rate), Math.min(samples.length, Math.floor(to * rate)));
    if (rate !== ctx.sampleRate) part = resample(part, rate, ctx.sampleRate);
    const seconds = engine.demo(part);
    h.playing(seconds);
    say('info', what ? L(`Listening back: ${what}.`, `Zum Anhören: ${what}.`) : L('Listening back to your take.', 'Dein Durchgang zum Anhören.'));
  }

  const listen = (): void => void (heardTake && playBack(heardTake.samples, heardTake.rate));
  $('#listen', root).onclick = listen;
  $('#firsttake', root).onclick = async () => {
    const first = await loadTake(inst, h.id, 'first');
    if (first) playBack(first, TAKE_RATE, 0, Infinity, L(`your first recording, from ${dayMonth(takeMeta(inst, h.id, 'first')!.t)}`, `deine erste Aufnahme, vom ${dayMonth(takeMeta(inst, h.id, 'first')!.t)}`));
  };
  $('#savetake', root).onclick = () => {
    const t = heardTake;
    if (!t) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([encodeWav(t.samples, t.rate)], { type: 'audio/wav' }));
    a.download = `${h.id}-${new Date(t.meta.t).toISOString().slice(0, 10)}.wav`;
    a.click();
    URL.revokeObjectURL(a.href);
    $('#takenote', root).textContent = L('Saved to your downloads folder, to keep or to send.', 'In deinem Download-Ordner gespeichert, zum Behalten oder Verschicken.');
  };

  return {
    show: showTake,
    hide: () => void ($('#takebox', root).hidden = true),
    selfRate,
    rate: (n) => {
      if (!rating) return false;
      rating(n);
      return true;
    },
    drop: () => {
      if (!rating) return;
      rating = null;
      $('#selfrate', root).hidden = true;
      // nothing is held back any more: the bars of that take say how the app heard them
      paintBars(false);
    },
    listen,
  };
}
