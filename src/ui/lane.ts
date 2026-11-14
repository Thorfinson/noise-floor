/**
 * The pitch lane: how singing is shown. Time runs from left to right, pitch from bottom to top. Each note
 * to sing is a bar at its height, as long as the note lasts; the voice is a line that is drawn as it sings,
 * and a dot where it is now. A bar the voice lies on turns green. One row for each semitone, the rows of the
 * black keys a little darker, so that a step and a leap look like what they are.
 *
 * Drawn on a canvas, because the voice is redrawn some fifty times a second.
 */
import { noteName } from '../music/theory';
import { LEARN, typeScale } from './draw';

export interface LaneNote {
  midi: number;
  /** start and length, in note units */
  at: number;
  len: number;
  /** the word or syllable sung on it, if any */
  word?: string;
}

/** close: sung near the note but not on it (between the tolerance and twice it), shown amber and not as a failure */
export type LaneLook = 'up' | 'cur' | 'done' | 'close' | 'miss';

const CLOSE = '#c98a1b';

export interface LaneView {
  /** how each note looks */
  look: (i: number) => LaneLook;
  /**
   * Where the playhead is, in note units, when the lane scrolls with the music; null when it stands still
   * and shows the whole phrase (the app waits for the voice).
   */
  at: number | null;
  /** what has been sung: moments in note units and pitches (already moved into the lane's octave) */
  trail: { u: number; midi: number }[];
  /** the voice now, moved into the lane's octave; null when it is silent */
  voice: number | null;
  /** where the voice dot is drawn when the lane stands still: at this note */
  dotAt?: number;
  /** how much of the current note has been held, 0 to 1 */
  hold?: number;
  /** how far from a note still counts, cents: drawn as the height of the bars */
  tol: number;
  /** a stretch of pitch to show as found: the range of the voice, low and high */
  band?: [number, number];
  /** notes not to show: sung without the line, they appear once they are sung */
  hide?: (i: number) => boolean;
  /** the voice is not shown while singing: no line, no dot */
  blind?: boolean;
}

const BLACK = [1, 3, 6, 8, 10];

export class Lane {
  private notes: LaneNote[] = [];
  private units = 1;
  private lo = 55;
  private hi = 72;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** The notes of the phrase, and how long it is. The lane's height fits them with some room around. */
  set(notes: LaneNote[], units: number): void {
    this.notes = notes;
    this.units = Math.max(units, 1);
    const midis = notes.map((n) => n.midi);
    const lo = Math.min(...midis);
    const hi = Math.max(...midis);
    // at least an octave of rows, the phrase in the middle
    const pad = Math.max(2, Math.ceil((12 - (hi - lo)) / 2));
    this.lo = lo - pad;
    this.hi = hi + pad;
  }

  /** No notes, only rows from lo to hi: for singing freely, as in the range test. */
  setRange(lo: number, hi: number): void {
    this.notes = [];
    this.units = 1;
    this.lo = lo;
    this.hi = hi;
  }

  /** A pitch moved into the octave of the lane: the octave a voice sings in does not matter. */
  fold(midi: number): number {
    const mid = (this.lo + this.hi) / 2;
    return midi + 12 * Math.round((mid - midi) / 12);
  }

  private fit(): { w: number; h: number } {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(200, Math.round(r.width));
    const h = Math.max(120, Math.round(r.height));
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  draw(v: LaneView): void {
    const { w, h } = this.fit();
    const g = this.ctx;
    const P = LEARN;
    const left = 64;
    const right = w - 16;
    const top = 10;
    const bottom = h - 10;
    const rows = this.hi - this.lo + 1;
    const rowH = (bottom - top) / rows;
    const y = (midi: number): number => bottom - (midi - this.lo + 0.5) * rowH;
    // standing still: the whole phrase; scrolling: four units behind the playhead, the rest ahead
    const span = v.at === null ? this.units : Math.min(this.units + 2, 16);
    const x0 = v.at === null ? 0 : v.at - span * 0.28;
    const xs = (u: number): number => left + ((u - x0) / span) * (right - left);
    g.clearRect(0, 0, w, h);

    // the rows: one per semitone, the black keys darker, every C named (and the ends, where there is room)
    const roomy = rowH >= 11;
    for (let m = this.lo; m <= this.hi; m++) {
      const yy = y(m);
      g.fillStyle = BLACK.includes(((m % 12) + 12) % 12) ? 'rgba(38,38,46,0.06)' : 'rgba(255,253,248,0.5)';
      g.fillRect(left, yy - rowH / 2, right - left, rowH);
      const inBand = !!v.band && (m === v.band[0] || m === v.band[1]);
      if (m % 12 === 0 || inBand || (roomy && (m === this.lo || m === this.hi)) || this.notes.some((n) => n.midi === m)) {
        g.fillStyle = this.notes.some((n) => n.midi === m) || inBand ? P.text : P.faint;
        g.font = `600 ${Math.max(11, Math.min(15, rowH * 0.8))}px "IBM Plex Mono", monospace`;
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.fillText(noteName(m), left - 10, yy);
      }
    }
    g.strokeStyle = P.line;
    g.lineWidth = 1;
    g.strokeRect(left + 0.5, top + 0.5, right - left - 1, bottom - top - 1);
    // the range found so far: a soft band from its low end to its high one
    if (v.band) {
      const [a, b] = v.band;
      g.fillStyle = 'rgba(30,106,168,0.12)';
      g.fillRect(left, y(b) - rowH / 2, right - left, (b - a + 1) * rowH);
      g.strokeStyle = 'rgba(30,106,168,0.5)';
      g.beginPath();
      g.moveTo(left, y(b) - rowH / 2);
      g.lineTo(right, y(b) - rowH / 2);
      g.moveTo(left, y(a) + rowH / 2);
      g.lineTo(right, y(a) + rowH / 2);
      g.stroke();
    }

    // the notes: a bar as high as the tolerance, the one to sing now in blue
    const band = Math.max(rowH * 0.7, (v.tol / 100) * 2 * rowH);
    g.save();
    g.beginPath();
    g.rect(left, top, right - left, bottom - top);
    g.clip();
    this.notes.forEach((n, i) => {
      const a = xs(n.at);
      const b = xs(n.at + n.len);
      if (b < left - 4 || a > right + 4) return;
      if (v.hide?.(i)) return;
      const look = v.look(i);
      const yy = y(n.midi);
      g.fillStyle = look === 'cur' ? P.now : look === 'done' ? P.good : look === 'close' ? CLOSE : look === 'miss' ? P.bad : P.panel;
      g.strokeStyle = look === 'up' ? P.line : 'transparent';
      g.lineWidth = 2;
      const r = Math.min(8, band / 2);
      g.beginPath();
      g.roundRect(a + 2, yy - band / 2, Math.max(8, b - a - 4), band, r);
      g.fill();
      if (look === 'up') g.stroke();
      if (n.word) {
        // the syllable in the bar where it fits, otherwise just under it
        // read from a metre away: as large as the bar allows, from 14 to 18 pixels, times the type size
        g.font = `600 ${Math.round(Math.max(14, Math.min(18, band * 0.9)) * typeScale())}px "IBM Plex Sans", sans-serif`;
        const fits = g.measureText(n.word).width + 14 <= b - a;
        g.fillStyle = fits ? (look === 'up' ? P.text : P.nowInk) : look === 'cur' ? P.now : P.text;
        g.textAlign = 'left';
        g.textBaseline = fits ? 'middle' : 'top';
        g.fillText(n.word, a + (fits ? 9 : 3), fits ? yy + 1 : yy + band / 2 + 3);
      }
    });

    // the voice: what was sung, and where it is now
    g.strokeStyle = 'rgba(30,106,168,0.55)';
    g.lineWidth = 3;
    g.lineJoin = 'round';
    g.beginPath();
    let pen = false;
    let last = -1e9;
    for (const p of v.blind ? [] : v.trail) {
      const xx = xs(p.u);
      if (xx < left) continue;
      if (!pen || p.u - last > 0.4) g.moveTo(xx, y(p.midi));
      else g.lineTo(xx, y(p.midi));
      pen = true;
      last = p.u;
    }
    g.stroke();
    if (v.voice !== null && !v.blind) {
      const xx = v.at === null ? (v.dotAt !== undefined && this.notes[v.dotAt] ? xs(this.notes[v.dotAt].at + this.notes[v.dotAt].len / 2) : xs(this.units / 2)) : xs(v.at);
      const yy = Math.max(top + 6, Math.min(bottom - 6, y(v.voice)));
      g.fillStyle = P.now;
      g.strokeStyle = '#fffdf8';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(xx, yy, 9, 0, 2 * Math.PI);
      g.fill();
      g.stroke();
      if (v.hold && v.hold > 0) {
        g.strokeStyle = P.good;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(xx, yy, 15, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, v.hold));
        g.stroke();
      }
    }
    // the playhead
    if (v.at !== null) {
      g.strokeStyle = P.now;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(xs(v.at), top);
      g.lineTo(xs(v.at), bottom);
      g.stroke();
    }
    g.restore();
  }
}
