/**
 * The language the app speaks: English or German. Every text is written where it is used, in both
 * languages side by side, `L('English', 'Deutsch')`, so that a sentence and its translation are read and
 * changed together. The choice is kept in the settings; the first time it follows the browser.
 */
export type Lang = 'en' | 'de';

let current: Lang = 'en';

/** The language the app is shown in. */
export const lang = (): Lang => current;

/** Shows the app in this language from now on (the page is drawn again by whoever calls this). */
export function setLang(l: Lang): void {
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

/** The language of the browser, if it is one of the two; otherwise English. */
export const browserLang = (): Lang => (typeof navigator !== 'undefined' && /^de\b/i.test(navigator.language ?? '') ? 'de' : 'en');

/** The text in the language the app is shown in: English first, German second. */
export const L = (en: string, de: string): string => (current === 'de' ? de : en);

/** A number written the way the language writes it: 1,234 or 1.234. */
export const num = (n: number): string => n.toLocaleString(current === 'de' ? 'de-DE' : 'en-US');

/** A day and month written the way the language writes it: 12 November, 12. November. */
export const dayMonth = (t: number): string => new Date(t).toLocaleDateString(current === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long' });
