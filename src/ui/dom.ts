/** Small helpers shared by the screens. */
import { engine } from '../audio/engine';
import type { Listener } from '../audio/listener';
import { L } from '../core/i18n';
import { store } from '../core/store';
import { chordName, noteName } from '../music/theory';
import { typeScale } from './draw';
import { guitarA4 } from '../music/tuning';

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] => [...root.querySelectorAll(sel)] as T[];
export const icon = (name: string): string => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** Given to a screen when it runs as one step of the guided session. */
export interface SessionCtx {
  /** the steps of the session, for the top bar */
  rail: string;
  /** e.g. "Step 2 of 4" */
  label: string;
  /** go on to the next step */
  next: () => void;
  /** what comes after this step, e.g. "the chord check" or "the summary" */
  after: string;
}

/** A screen fills the root element and may return a function that cleans up when it is left. */
export type Screen = (root: HTMLElement, params: string[], ctx?: SessionCtx) => void | (() => void);

/** Everything larger, for reading from further away: the type of the whole app follows the setting. */
export function applyScale(): void {
  if (typeof document === 'undefined') return;
  const s = typeScale();
  // the stylesheet multiplies by --k: the whole page, or on a play screen what is read while playing
  document.documentElement.style.setProperty('--k', String(s));
  document.documentElement.dataset.scale = String(s);
}

export const go = (path: string): void => {
  location.hash = path;
};

export const micMeter = (label = ''): string => `<div class="mic"><span class="m" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="mic-l">${label}</span></div>`;

type Handlers = Partial<Pick<Listener, 'onLevel' | 'onOnset' | 'onNote' | 'onPitch' | 'onChord' | 'onString' | 'onThud' | 'onPartial'>>;

/** Listener setup for the piano: its own pitch, and no such thing as a buzzing string. */
/** How the listener is set for a voice: pitch only, and more patient with a breathy tone than with a string. */
export const voiceEars = (l: Listener): void => {
  l.a4 = 440;
  l.noteDetection = false;
  l.pitchTracking = true;
  l.pitchClarity = 0.7;
  l.buzzThreshold = Infinity;
};

export const pianoEars = (l: Listener): void => {
  l.a4 = store.settings.pianoA4;
  l.buzzThreshold = Infinity;
  l.ringThreshold = 0.05;
  // a chord is compared with its keys on the piano, not with the strings of the guitar's shape
  l.voicing = 'piano';
};

/**
 * The chord check reports how a clean string of this guitar rings. A steel string keeps far more of its
 * sound than a nylon one, so what counts as "muted" follows the guitar that is actually being played.
 */
export function learnRing(ring: number): void {
  const t = store.settings.ringTypical;
  store.settings.ringTypical = t ? 0.9 * t + 0.1 * ring : ring;
}

/**
 * Connects a screen to the listener and drives the level meters on the page.
 * The returned function disconnects everything again and puts the listener back to its defaults.
 */
export function hear(root: HTMLElement, handlers: Handlers, setup?: (l: Listener) => void): () => void {
  const l = engine.listener;
  if (!l) return () => undefined;
  // the guitar as written, wherever the capo sits and however far down it is tuned
  l.a4 = guitarA4();
  l.voicing = 'guitar';
  l.buzzThreshold = store.settings.buzz;
  // at least what the settings ask for; more when this guitar is known to ring long
  l.ringThreshold = Math.max(store.settings.ring, 0.2 * store.settings.ringTypical);
  l.noteDetection = true;
  setup?.(l);
  Object.assign(l, handlers);
  const bars = $$('.mic .m i', root);
  const labels = $$('.mic-l', root);
  const idle = engine.micOn ? L('Hearing you', 'Hört dich') : L('Practice instrument only', 'Nur Übungsinstrument');
  labels.forEach((el) => (el.textContent = idle));
  // what was heard last stays on show beside the meter: a note, a chord, a sung pitch. So a mistake of the
  // app's ears can be told from a mistake of the hands.
  let shown = '';
  const heard = (what: string): void => {
    if (what === shown) return;
    shown = what;
    labels.forEach((el) => {
      el.textContent = L(`Heard: ${what}`, `Gehört: ${what}`);
      el.classList.add('heard');
    });
  };
  if (handlers.onNote) l.onNote = (e) => (heard(noteName(e.midi)), handlers.onNote!(e));
  if (handlers.onChord) l.onChord = (e) => (e.best && e.score > 0.6 && heard(chordName(e.best, l.voicing === 'piano')), handlers.onChord!(e));
  if (handlers.onPitch) l.onPitch = (e) => (heard(noteName(e.midi)), handlers.onPitch!(e));
  l.onLevel = (e) => {
    const lit = Math.max(0, Math.min(5, Math.round((e.db + 60) / 9)));
    bars.forEach((b, i) => b.classList.toggle('lit', i < lit));
    handlers.onLevel?.(e);
  };
  return () => {
    l.onLevel = l.onOnset = l.onNote = l.onPitch = l.onChord = l.onString = l.onThud = l.onPartial = undefined;
    l.partialBand = null;
    l.expected = null;
    l.chordCandidates = null;
    l.pitchTracking = false;
    l.noteDetection = true;
    l.voicing = 'guitar';
    l.pitchClarity = 0.8;
    l.cancelStringCheck();
  };
}

/** Global key handler for one screen; keys typed into form fields and on buttons are left alone. */
/** The pending moves of the screen on show, and what takes their notice away again. */
const laters = new Map<number, () => void>();

/**
 * The app moves on by itself here, after `ms`, unless the player stays. What comes next and when is shown
 * at the bottom of the window, with a way to stay (the button, or Escape): nothing moves on unseen.
 * Returns the timer, to be stopped with stopTimer.
 */
export function later(ms: number, fn: () => void, what: string): number {
  const box = document.createElement('div');
  box.className = 'later';
  box.setAttribute('role', 'status');
  box.innerHTML = `<span>${esc(L(`Coming up: ${what}`, `Gleich weiter: ${what}`))}</span><b class="secs"></b><i aria-hidden="true"><s style="animation-duration:${ms}ms"></s></i><button class="hb" type="button">${L('Stay here', 'Hier bleiben')} <kbd>Esc</kbd></button>`;
  document.body.append(box);
  const until = performance.now() + ms;
  const secs = box.querySelector<HTMLElement>('.secs')!;
  const tick = (): void => void (secs.textContent = `${Math.max(1, Math.ceil((until - performance.now()) / 1000))} s`);
  tick();
  const ticking = window.setInterval(tick, 200);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    stopTimer(id);
  };
  const end = (): void => {
    clearInterval(ticking);
    box.remove();
    removeEventListener('keydown', onKey, true);
    laters.delete(id);
  };
  addEventListener('keydown', onKey, true);
  const id = window.setTimeout(() => {
    end();
    fn();
  }, ms);
  box.querySelector('button')!.onclick = () => stopTimer(id);
  laters.set(id, end);
  return id;
}

/** Stops a timer, and takes away the notice that said the screen would move on. */
export function stopTimer(id: number): void {
  clearTimeout(id);
  laters.get(id)?.();
}

/** Another screen opens: nothing of the one before moves on any more. */
export function stopAllLater(): void {
  for (const id of [...laters.keys()]) stopTimer(id);
}

export function keys(map: Record<string, (e: KeyboardEvent) => void>): () => void {
  const on = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, select, textarea')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ((k === ' ' || k === 'Enter') && t.closest('a, button')) return;
    const fn = map[k];
    if (fn) {
      e.preventDefault();
      fn(e);
    }
  };
  addEventListener('keydown', on);
  return () => removeEventListener('keydown', on);
}
