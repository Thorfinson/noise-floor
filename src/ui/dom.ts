/** Small helpers shared by the screens. */
import { engine } from '../audio/engine';
import type { Listener } from '../audio/listener';
import { L } from '../core/i18n';
import { store } from '../core/store';

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
  l.a4 = store.settings.a4;
  l.voicing = 'guitar';
  l.buzzThreshold = store.settings.buzz;
  // at least what the settings ask for; more when this guitar is known to ring long
  l.ringThreshold = Math.max(store.settings.ring, 0.2 * store.settings.ringTypical);
  l.noteDetection = true;
  setup?.(l);
  Object.assign(l, handlers);
  const bars = $$('.mic .m i', root);
  const labels = $$('.mic-l', root);
  labels.forEach((el) => (el.textContent = engine.micOn ? L('Hearing you', 'Hört dich') : L('Practice instrument only', 'Nur Übungsinstrument')));
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
