/**
 * Over the weeks: what the measurements did, shown as they change. The days played as a calendar (one hue,
 * darker for longer), the week in four numbers, and for the skills measured on most days a small line each:
 * where it began, where it is, the way between. Up is always better: a time that falls (seconds for a chord,
 * cents off a note) is drawn falling upwards, and the chart says so.
 */
import { dayOf, dayStart, weekOf } from '../core/days';
import { dayMonth, L, num } from '../core/i18n';
import { KINDS, kindOf } from '../core/skills';
import { store, type Instrument } from '../core/store';
import { skillLabel } from '../music/labels';
import { repertoire } from '../music/review';
import { $$, esc, type Screen } from '../ui/dom';
import { progressTabs } from './repertoire';
import { instrumentOf } from './session';

/** The week a moment falls in: days played, minutes, new best values, from Monday on. */
export function weekStats(inst: Instrument, now = Date.now()): { days: number; goal: number; minutes: number; bests: number } {
  const w = store.week(now);
  const monday = weekOf(dayOf(now));
  let secs = 0;
  for (let d = monday; d < monday + 7; d++) secs += store.practice[d] ?? 0;
  let bests = 0;
  for (const [key, r] of Object.entries(store.skills.data)) {
    if (instrumentOf(key) !== inst || !r.h?.length) continue;
    const lower = KINDS[kindOf(key)].lowerIsBetter;
    const before = r.h.filter(([d]) => d < monday).map(([, v]) => v);
    const now_ = r.h.filter(([d]) => d >= monday).map(([, v]) => v);
    if (!now_.length) continue;
    const bestNow = lower ? Math.min(...now_) : Math.max(...now_);
    // a first measurement counts too: it is the first best
    if (!before.length || (lower ? bestNow < Math.min(...before) : bestNow > Math.max(...before))) bests++;
  }
  return { days: w.count, goal: w.goal, minutes: Math.round(secs / 60), bests };
}

/** The value of a measurement as its kind is said: "6.2 s", "26 a minute", "85 %". */
function said(key: string, v: number): string {
  const kind = kindOf(key);
  if (kind === 'chord' || kind === 'scale') return `${v.toFixed(1)} s`;
  if (kind === 'pair') return L(`${Math.round(v)} a minute`, `${Math.round(v)} pro Minute`);
  if (kind === 'finger' || kind === 'beat') return `${Math.round(v)} bpm`;
  if (kind === 'pitch' || kind === 'tone') return `${Math.round(v)} ct`;
  if (kind === 'sing') return L(`${Math.round(v)} a minute`, `${Math.round(v)} pro Minute`);
  return `${Math.round(v)} %`;
}

/** The sequential steps of the calendar: none, then four of one blue, light to dark. */
const STEPS = ['var(--panel)', '#c9dbea', '#8db2d4', '#4f87bb', '#1e6aa8'];
const step = (mins: number): number => (mins <= 0 ? 0 : mins < 10 ? 1 : mins < 20 ? 2 : mins < 40 ? 3 : 4);

/** The days played, the last twelve weeks: a column a week, Monday at the top. */
function calendar(now: number): string {
  const today = dayOf(now);
  const first = weekOf(today) - 11 * 7;
  const played = store.playedDays();
  const cell = 18;
  const gap = 2;
  const left = 34;
  const top = 22;
  const names = [L('Mon', 'Mo'), '', L('Wed', 'Mi'), '', L('Fri', 'Fr'), '', L('Sun', 'So')];
  let h = names.map((n, r) => (n ? `<text x="${left - 6}" y="${top + r * (cell + gap) + 13}" class="axis" text-anchor="end">${n}</text>` : '')).join('');
  for (let w = 0; w < 12; w++) {
    const monday = first + w * 7;
    const date = new Date(dayStart(monday));
    if (w === 0 || date.getDate() <= 7) h += `<text x="${left + w * (cell + gap)}" y="${top - 8}" class="axis">${date.toLocaleDateString(L('en-GB', 'de-DE'), { month: 'short' })}</text>`;
    for (let r = 0; r < 7; r++) {
      const d = monday + r;
      if (d > today) continue;
      const mins = Math.round((store.practice[d] ?? 0) / 60);
      const s = played.has(d) ? Math.max(1, step(mins)) : 0;
      const tip = `${new Date(dayStart(d)).toLocaleDateString(L('en-GB', 'de-DE'), { weekday: 'short', day: 'numeric', month: 'long' })}: ${s ? (mins ? L(`${mins} minutes`, `${mins} Minuten`) : L('played', 'gespielt')) : L('not played', 'nicht gespielt')}`;
      h += `<rect class="cell" x="${left + w * (cell + gap)}" y="${top + r * (cell + gap)}" width="${cell}" height="${cell}" rx="4" fill="${STEPS[s]}" tabindex="0" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`;
    }
  }
  const width = left + 12 * (cell + gap) + 4;
  return `<svg class="cal" viewBox="0 0 ${width} ${top + 7 * (cell + gap) + 4}" role="img" aria-label="${L('Days played in the last twelve weeks: the darker, the longer', 'Gespielte Tage der letzten zwölf Wochen: je dunkler, desto länger')}">${h}</svg>
    <p class="calkey" aria-hidden="true"><span>${L('less', 'weniger')}</span>${STEPS.map((c) => `<i style="background:${c}"></i>`).join('')}<span>${L('more', 'mehr')}</span></p>`;
}

/** One skill over the days it was measured: a line, the first and the last value at its ends, up is better. */
function line(key: string, h: [number, number][]): string {
  const W = 340;
  const H = 150;
  const pad = { l: 12, r: 96, t: 24, b: 26 };
  const lower = KINDS[kindOf(key)].lowerIsBetter;
  const vs = h.map(([, v]) => v);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const d0 = h[0][0];
  const d1 = Math.max(d0 + 1, h[h.length - 1][0]);
  const x = (d: number): number => pad.l + ((d - d0) / (d1 - d0)) * (W - pad.l - pad.r);
  // better is up: for a time or a deviation, the smallest value is at the top
  const y = (v: number): number => (lower ? pad.t + ((v - lo) / (hi - lo)) * (H - pad.t - pad.b) : H - pad.b - ((v - lo) / (hi - lo)) * (H - pad.t - pad.b));
  const pts = h.map(([d, v]) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`);
  const first = h[0];
  const last = h[h.length - 1];
  const area = `M${x(first[0]).toFixed(1)},${H - pad.b} L${pts.join(' L')} L${x(last[0]).toFixed(1)},${H - pad.b} Z`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${skillLabel(key)}: ${said(key, first[1])} on ${dayMonth(dayStart(first[0]))}, ${said(key, last[1])} on ${dayMonth(dayStart(last[0]))}`)}" data-key="${esc(key)}">
      <line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" class="grid"/>
      <path d="${area}" class="wash"/>
      <polyline points="${pts.join(' ')}" class="ln"/>
      <circle cx="${x(first[0]).toFixed(1)}" cy="${y(first[1]).toFixed(1)}" r="4" class="dot"/>
      <circle cx="${x(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="5" class="dot"/>
      <text x="${(x(last[0]) + 9).toFixed(1)}" y="${(y(last[1]) + 5).toFixed(1)}" class="val">${esc(said(key, last[1]))}</text>
      <text x="${pad.l}" y="${H - 6}" class="axis">${esc(dayMonth(dayStart(first[0])))}</text>
      <text x="${W - pad.r}" y="${H - 6}" class="axis" text-anchor="end">${esc(dayMonth(dayStart(last[0])))}</text>
      <line class="xh" x1="0" x2="0" y1="${pad.t - 8}" y2="${H - pad.b}" visibility="hidden"/>
      <rect class="hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}" fill="transparent"/>
    </svg>`;
}

export const trendsPage: Screen = (root) => {
  const inst = store.settings.instrument;
  const now = Date.now();
  const w = weekStats(inst, now);
  const rep = repertoire(inst, now).length;
  // the skills of this instrument measured on most days, at least three
  const tracked = Object.entries(store.skills.data)
    .filter(([key, r]) => instrumentOf(key) === inst && (r.h?.length ?? 0) >= 3)
    .sort((a, b) => (b[1].h!.length - a[1].h!.length) || (b[1].last - a[1].last))
    .slice(0, 6);
  const tiles: [string, string, string][] = [
    [L('This week', 'Diese Woche'), L(`${w.days} of ${w.goal} days`, `${w.days} von ${w.goal} Tagen`), w.days >= w.goal ? L('the goal is reached', 'das Ziel ist erreicht') : L(`${w.goal - w.days} more to the goal`, `noch ${w.goal - w.days} bis zum Ziel`)],
    [L('Played this week', 'Gespielt diese Woche'), L(`${num(w.minutes)} min`, `${num(w.minutes)} Min.`), L('while a lesson, a game or a tool was open', 'während eine Lektion, ein Spiel oder ein Werkzeug offen war')],
    [L('New best values', 'Neue Bestwerte'), String(w.bests), L('this week, on this instrument', 'diese Woche, auf diesem Instrument')],
    [L('In your repertoire', 'Im Repertoire'), String(rep), L('played clean all through', 'ganz sauber gespielt')],
  ];
  root.innerHTML = `<div class="page">
    ${progressTabs('trends')}
    <div><p class="kick">${L('Over the weeks', 'Über die Wochen')}</p><h1>${L('What your practice did.', 'Was dein Üben bewirkt hat.')}</h1>
      <p class="lede">${L('Measured, not counted: each line is the best value of a day. Progress comes in steps and plateaus; what counts is where the line goes over weeks.', 'Gemessen, nicht gezählt: Jede Linie ist der beste Wert eines Tages. Fortschritt kommt in Stufen und Plateaus; was zählt, ist, wohin die Linie über Wochen geht.')}</p></div>
    <div class="tiles4">${tiles.map(([k, v, s]) => `<div class="stat"><p class="k">${esc(k)}</p><p class="v">${esc(v)}</p><p class="note">${esc(s)}</p></div>`).join('')}</div>
    <section><h2 class="h2">${L('The days you played', 'Die Tage, an denen du gespielt hast')}</h2>${calendar(now)}</section>
    <section><h2 class="h2">${L('Your skills over time', 'Deine Fähigkeiten über die Zeit')}</h2>
    ${
      tracked.length
        ? `<div class="sparks">${tracked
            .map(([key, r]) => `<figure><figcaption><b>${esc(skillLabel(key))}</b><small>${esc(KINDS[kindOf(key)].unit)}${KINDS[kindOf(key)].lowerIsBetter ? L(' · less is better, drawn upward', ' · weniger ist besser, nach oben gezeichnet') : ''}</small></figcaption>${line(key, r.h!)}<p class="ctip" aria-live="polite"></p></figure>`)
            .join('')}</div>
      <details class="astable"><summary>${L('As a table', 'Als Tabelle')}</summary><div class="scroll"><table><thead><tr><th>${L('Skill', 'Fähigkeit')}</th><th>${L('Day', 'Tag')}</th><th class="n">${L('Best that day', 'Bester Wert des Tages')}</th></tr></thead><tbody>${tracked
            .flatMap(([key, r]) => r.h!.map(([d, v]) => `<tr><td>${esc(skillLabel(key))}</td><td>${esc(dayMonth(dayStart(d)))}</td><td class="n">${esc(said(key, v))}</td></tr>`))
            .join('')}</tbody></table></div></details>`
        : `<p class="note">${L('A line appears for a skill once it has been measured on three different days. Today\'s session measures several.', 'Eine Linie erscheint für eine Fähigkeit, sobald sie an drei verschiedenen Tagen gemessen wurde. Die heutige Session misst mehrere.')}</p>`
    }</section>
  </div>`;
  // the crosshair: it finds the day nearest the pointer and says its value
  $$<SVGSVGElement>('.spark', root).forEach((svg) => {
    const key = svg.dataset.key!;
    const h = store.skills.data[key].h!;
    const tip = svg.parentElement!.querySelector<HTMLElement>('.ctip')!;
    const xh = svg.querySelector<SVGLineElement>('.xh')!;
    const W = 340;
    const l = 12;
    const r = 96;
    const d0 = h[0][0];
    const d1 = Math.max(d0 + 1, h[h.length - 1][0]);
    const show = (clientX: number): void => {
      const box = svg.getBoundingClientRect();
      const ux = ((clientX - box.left) / box.width) * W;
      const day = d0 + ((ux - l) / (W - l - r)) * (d1 - d0);
      const near = h.reduce((a, b) => (Math.abs(b[0] - day) < Math.abs(a[0] - day) ? b : a));
      const x = l + ((near[0] - d0) / (d1 - d0)) * (W - l - r);
      xh.setAttribute('x1', x.toFixed(1));
      xh.setAttribute('x2', x.toFixed(1));
      xh.setAttribute('visibility', 'visible');
      tip.textContent = `${dayMonth(dayStart(near[0]))}: ${said(key, near[1])}`;
    };
    svg.addEventListener('pointermove', (e) => show(e.clientX));
    svg.addEventListener('pointerleave', () => {
      xh.setAttribute('visibility', 'hidden');
      tip.textContent = '';
    });
  });
  // the calendar's cells: their day and minutes, on hover and on focus
  const calTip = document.createElement('p');
  calTip.className = 'ctip';
  calTip.setAttribute('aria-live', 'polite');
  root.querySelector('.calkey')?.after(calTip);
  $$<SVGRectElement>('.cal .cell', root).forEach((c) => {
    const say = (): void => void (calTip.textContent = c.dataset.tip ?? '');
    c.addEventListener('pointerenter', say);
    c.addEventListener('focus', say);
  });
};
