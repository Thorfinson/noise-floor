/**
 * Playing as a habit, without pressure. The week counts, not an unbroken chain of days: a chain that breaks
 * makes people give up (Silverman and Barasch 2023), and a habit forms over weeks with days missed on the way
 * (Lally et al. 2010). A plan made once, "after dinner I play for ten minutes", ties playing to a moment of
 * the day; such if-then plans help people do what they mean to more than reminders do (Gollwitzer and
 * Sheeran 2006). And a short session of five minutes counts as fully as a long one.
 */
import { dayOf, dayStart, weekOf } from '../core/days';
import { L } from '../core/i18n';
import { store, type PracticePlan } from '../core/store';
import { $, esc } from '../ui/dom';

const DAYS = (): string[] => [L('Mon', 'Mo'), L('Tue', 'Di'), L('Wed', 'Mi'), L('Thu', 'Do'), L('Fri', 'Fr'), L('Sat', 'Sa'), L('Sun', 'So')];

/** The week so far: seven days, those played on marked, today ringed, and the goal beside it. */
export function weekLine(now = Date.now()): string {
  const w = store.week(now);
  const today = (dayOf(now) - weekOf(dayOf(now))) % 7;
  const said = w.count >= w.goal ? L(`This week: ${w.count} days, the goal of ${w.goal} reached`, `Diese Woche: ${w.count} Tage, das Ziel von ${w.goal} erreicht`) : L(`This week: ${w.count} of ${w.goal} days`, `Diese Woche: ${w.count} von ${w.goal} Tagen`);
  return `<span class="week" role="img" aria-label="${esc(said)}"><span class="wk-said">${esc(said)}</span>${w.played.map((p, i) => `<i class="${p ? 'on' : ''}${i === today ? ' today' : ''}" title="${DAYS()[i]}"></i>`).join('')}</span>`;
}

/** The moments of the day a plan can follow. */
export const CUES = (): { id: string; say: string }[] => [
  { id: 'coffee', say: L('After my morning coffee', 'Nach dem Morgenkaffee') },
  { id: 'work', say: L('When I get home from work', 'Wenn ich von der Arbeit komme') },
  { id: 'dinner', say: L('After dinner', 'Nach dem Abendessen') },
  { id: 'news', say: L('Instead of the evening news', 'Statt der Abendnachrichten') },
  { id: 'bed', say: L('Before I go to bed', 'Bevor ich ins Bett gehe') },
];

/** The plan in words: "After dinner, I play for ten minutes." */
export function planSaid(p: PracticePlan): string {
  const cue = CUES().find((c) => c.id === p.cue)?.say ?? p.cue;
  return L(`${cue}, I play for ${p.minutes} minutes${p.time ? `, at about ${p.time}` : ''}.`, `${cue} spiele ich ${p.minutes} Minuten${p.time ? `, gegen ${p.time} Uhr` : ''}.`);
}

/** The card on the start page: make the plan, or see it, change it, and put it in a calendar. */
export function planCard(): string {
  const p = store.plan;
  if (p)
    return `<div class="plancard" id="plancard"><p class="k">${L('Your plan', 'Dein Plan')}</p><p class="said">${esc(planSaid(p))}</p><div class="row"><button class="btn quiet" id="planedit">${L('Change it', 'Ändern')}</button><button class="btn quiet" id="planics">${L('Put it in my calendar', 'In meinen Kalender')}</button></div></div>`;
  return `<form class="plancard" id="plancard"><p class="k">${L('When will you play?', 'Wann spielst du?')}</p>
    <p class="note">${L('A plan made once ties playing to a moment of your day. It helps more than any reminder.', 'Ein einmal gemachter Plan bindet das Spielen an einen Moment deines Tages. Das hilft mehr als jede Erinnerung.')}</p>
    <div class="row"><select id="plancue" aria-label="${L('When', 'Wann')}">${CUES().map((c) => `<option value="${c.id}">${esc(c.say)}</option>`).join('')}</select>
    <select id="planmin" aria-label="${L('How long', 'Wie lange')}">${[5, 10, 15, 20].map((m) => `<option value="${m}"${m === 10 ? ' selected' : ''}>${L(`${m} minutes`, `${m} Minuten`)}</option>`).join('')}</select>
    <input id="plantime" type="time" value="19:30" aria-label="${L('About what time', 'Ungefähr um wie viel Uhr')}">
    <button class="btn" id="plansave" type="submit">${L('That is my plan', 'Das ist mein Plan')}</button></div></form>`;
}

/** The plan as a calendar entry: every day at its time, with its words; a file any calendar opens. */
export function planIcs(p: PracticePlan, now = Date.now()): string {
  const [h, m] = (p.time || '19:30').split(':').map(Number);
  const start = new Date(dayStart(dayOf(now)) + ((h || 0) * 60 + (m || 0)) * 60000);
  const two = (n: number): string => String(n).padStart(2, '0');
  const local = (d: Date): string => `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}T${two(d.getHours())}${two(d.getMinutes())}00`;
  const end = new Date(start.getTime() + p.minutes * 60000);
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Noise Floor//Practice plan//EN',
    'BEGIN:VEVENT',
    `UID:noise-floor-plan-${now}@noise-floor`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${local(start)}`,
    `DTEND:${local(end)}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${L('Play: Noise Floor', 'Spielen: Noise Floor')}`,
    `DESCRIPTION:${planSaid(p).replace(/[,;]/g, (c) => '\\' + c)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** Makes the plan card work: saves a new plan, opens it for a change, gives the calendar file. */
export function bindPlan(root: HTMLElement, redraw: () => void): void {
  const form = root.querySelector<HTMLFormElement>('form#plancard');
  if (form)
    form.onsubmit = (e) => {
      e.preventDefault();
      store.plan = { cue: $<HTMLSelectElement>('#plancue', root).value, minutes: Number($<HTMLSelectElement>('#planmin', root).value) || 10, time: $<HTMLInputElement>('#plantime', root).value };
      store.save();
      redraw();
    };
  const edit = root.querySelector<HTMLElement>('#planedit');
  if (edit)
    edit.onclick = () => {
      store.plan = null;
      store.save();
      redraw();
    };
  const ics = root.querySelector<HTMLElement>('#planics');
  if (ics && store.plan)
    ics.onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([planIcs(store.plan!)], { type: 'text/calendar' }));
      a.download = 'noise-floor-plan.ics';
      a.click();
      URL.revokeObjectURL(a.href);
    };
}
