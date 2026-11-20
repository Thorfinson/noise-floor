/**
 * Then and now: two recordings of the same music side by side, the first one ever made and the latest. Day to
 * day, progress cannot be heard; over a week it can, and hearing it is what makes it real. The whole song's
 * takes are used where there are two, otherwise the line that was recorded most recently with the click.
 */
import { dayMonth, L } from '../core/i18n';
import type { Instrument, TakeMeta } from '../core/store';
import { lineTakeId, loadTake, TAKE_RATE, takeMeta } from '../core/takes';
import { esc } from '../ui/dom';
import { materialOf } from '../music/week';
import { unitDe } from '../music/material';

export interface Pair {
  /** the id the takes are kept under */
  id: string;
  /** what is heard: "the whole song", "line 3" */
  what: string;
  first: TakeMeta;
  last: TakeMeta;
}

/** The pair to play for a song, or null when there are not yet two different takes of anything. */
export function thenNowPair(inst: Instrument, id: string): Pair | null {
  const both = (key: string): { first: TakeMeta; last: TakeMeta } | null => {
    const f = takeMeta(inst, key, 'first');
    const l = takeMeta(inst, key, 'last');
    return f && l && l.t > f.t ? { first: f, last: l } : null;
  };
  const whole = both(id);
  if (whole) return { id, what: L('the whole song', 'der ganze Song'), ...whole };
  const m = materialOf(inst, id);
  if (!m) return null;
  const lines = m.lines
    .map((_, k) => ({ k, p: both(lineTakeId(id, k)) }))
    .filter((x): x is { k: number; p: { first: TakeMeta; last: TakeMeta } } => !!x.p)
    .sort((a, b) => b.p.last.t - a.p.last.t);
  const top = lines[0];
  return top ? { id: lineTakeId(id, top.k), what: L(`${m.unit} ${top.k + 1}`, `${unitDe(m)} ${top.k + 1}`), ...top.p } : null;
}

/** "Monday", "yesterday", "today", or the date: when a take was made, as people say it. */
export function whenSaid(t: number, now = Date.now()): string {
  const day = (x: number): number => Math.floor((x - new Date(x).getTimezoneOffset() * 60000) / 86400000);
  const d = day(now) - day(t);
  if (d === 0) return L('Today', 'Heute');
  if (d === 1) return L('Yesterday', 'Gestern');
  if (d < 7) return new Date(t).toLocaleDateString(L('en', 'de'), { weekday: 'long' });
  return dayMonth(t);
}

/** A recording as a strip of bars, louder ones taller: drawn from the sound once it is loaded. */
export function waveSvg(samples: Float32Array, bars = 72, color = '#26262e'): string {
  const n = samples.length;
  if (!n) return '';
  const step = Math.max(1, Math.floor(n / bars));
  const peaks: number[] = [];
  for (let b = 0; b < bars; b++) {
    let sum = 0;
    for (let i = b * step; i < Math.min(n, (b + 1) * step); i += 8) sum += samples[i] * samples[i];
    peaks.push(Math.sqrt(sum / Math.max(1, step / 8)));
  }
  const top = Math.max(1e-4, ...peaks);
  const w = 4;
  return `<svg viewBox="0 0 ${bars * w} 40" preserveAspectRatio="none" aria-hidden="true">${peaks.map((p, i) => {
    const h = Math.max(2, (p / top) * 36);
    return `<rect x="${i * w + 0.6}" y="${(40 - h) / 2}" width="${w - 1.2}" height="${h}" rx="1.2" fill="${color}"/>`;
  }).join('')}</svg>`;
}

/** Plays a kept take through its own little audio context: the start page has no listening running. */
let playing: { ctx: AudioContext; src: AudioBufferSourceNode } | null = null;
export async function playKept(inst: Instrument, id: string, which: 'first' | 'last'): Promise<number> {
  const samples = await loadTake(inst, id, which);
  stopKept();
  if (!samples?.length) return 0;
  const ctx = new AudioContext();
  const buf = ctx.createBuffer(1, samples.length, TAKE_RATE);
  buf.getChannelData(0).set(samples);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  playing = { ctx, src };
  src.onended = () => stopKept();
  return samples.length / TAKE_RATE;
}
export function stopKept(): void {
  if (!playing) return;
  try {
    playing.src.stop();
  } catch {
    // already ended
  }
  void playing.ctx.close();
  playing = null;
}

/**
 * The two takes as rows with a play button each; the waves are drawn once the sound is loaded. Returns the
 * markup; `bindThenNow` makes it work.
 */
export function thenNowRows(inst: Instrument, p: Pair, now = Date.now()): string {
  const row = (which: 'first' | 'last', meta: TakeMeta): string =>
    `<div class="thn-row thn-${which}"><button class="thn-play" data-tn="${which}" aria-label="${which === 'first' ? L('Play the first take', 'Die erste Aufnahme abspielen') : L('Play the latest take', 'Die letzte Aufnahme abspielen')}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.8l10 6.2-10 6.2z" fill="currentColor"/></svg></button><div><div class="thn-meta"><b>${esc(whenSaid(meta.t, now))}</b><span>${esc(p.what)} · ${meta.tempo} %</span></div><div class="thn-wave" data-wave="${which}"></div></div></div>`;
  return `<div class="thn" data-inst="${inst}" data-id="${esc(p.id)}">${row('first', p.first)}${row('last', p.last)}</div>`;
}

export function bindThenNow(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.thn').forEach((box) => {
    const inst = box.dataset.inst as Instrument;
    const id = box.dataset.id!;
    (['first', 'last'] as const).forEach((which) => {
      void loadTake(inst, id, which).then((s) => {
        const el = box.querySelector(`[data-wave="${which}"]`);
        if (el && s) el.innerHTML = waveSvg(s, 72, which === 'first' ? '#a59d96' : '#26262e');
      });
    });
    box.querySelectorAll<HTMLButtonElement>('[data-tn]').forEach((b) => (b.onclick = () => void playKept(inst, id, b.dataset.tn as 'first' | 'last')));
  });
}

