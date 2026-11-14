/** What every lesson-like screen shares: the page around it, the session's step button, news of levels. */
import { L } from '../core/i18n';
import { store } from '../core/store';
import { skillLabel } from '../music/labels';
import { guitarSetup } from '../music/tuning';
import { icon, micMeter, type SessionCtx } from '../ui/dom';
import { practiceBar } from '../ui/practice';

export const frame = (where: string, stage: string, bar: string, ctx?: SessionCtx, up: [string, string] = ['#/', L('Home', 'Start')]): string => `<header class="top"><div><a class="btn quiet" href="${ctx ? '#/' : up[0]}">${icon(ctx ? 'x' : 'left')}${ctx ? L('End session', 'Session beenden') : up[1]}</a></div>${ctx ? `<div class="c">${ctx.rail}</div><span id="where" hidden></span>` : `<div class="c" id="where">${where}${store.settings.instrument === 'guitar' && guitarSetup() ? ` · ${guitarSetup()}` : ''}</div>`}<div class="r">${micMeter()}</div></header><p class="sideways">${L('Turn the phone on its side: a line of music needs the width.', 'Dreh das Telefon quer: Eine Zeile Musik braucht die Breite.')}</p>
  <div class="stage">${stage}</div>${practiceBar()}<footer class="bar">${bar}</footer>`;

export const nextStep = (ctx?: SessionCtx): string => (ctx ? `<button class="btn" id="nextstep">${ctx.after === L('the summary', 'die Zusammenfassung') ? L('Finish', 'Abschließen') : L('Next step', 'Nächster Schritt')}${icon('right')}</button>` : '');

/** " Am bar and C bar: level 2." for the levels that went up. */
export function levelNews(changes: { key: string; before: number; after: number }[]): string {
  const levels = new Map<number, Set<string>>();
  for (const c of changes) {
    if (c.after <= c.before) continue;
    // inside a lesson the name of the song goes without saying
    const name = skillLabel(c.key).split(', ').pop()!;
    levels.set(c.after, (levels.get(c.after) ?? new Set()).add(name));
  }
  return [...levels].map(([level, names]) => L(` ${[...names].join(' and ')}: level ${level}.`, ` ${[...names].join(' und ')}: Stufe ${level}.`)).join('');
}
