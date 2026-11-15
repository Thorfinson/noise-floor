/**
 * The painted world behind the pages that are read: every place of the app is a place on the same coast, with
 * a scene of its own. Today is the lighthouse at the hour it really is, Learn the marsh of stepping stones,
 * the songs the coast at dusk, the progress the night. The pictures stand still (nothing moves on a page that is
 * read), are painted once for the size of the window and kept, and lie behind the sheets of paper the pages are
 * written on.
 */
import { DAWN, Watch } from './watch';
import { LANDS, Trail } from './trail';

/** The hour of the lighthouse that matches the clock: dawn in the morning, amber by day, rose in the evening, then teal and night. */
export function hourNow(d = new Date()): number {
  const h = d.getHours();
  if (h >= 5 && h < 11) return DAWN;
  if (h >= 11 && h < 17) return 1;
  if (h >= 17 && h < 20) return 0;
  if (h >= 20 && h < 22) return 2;
  return 3;
}

interface Kept {
  canvas: HTMLCanvasElement;
  paint: () => void;
  w: number;
  h: number;
}
const kept = new Map<string, Kept>();
let shown: Kept | null = null;

function make(scene: string): Kept {
  const canvas = document.createElement('canvas');
  canvas.className = 'world backdrop';
  canvas.setAttribute('aria-hidden', 'true');
  let paint: () => void;
  if (scene.startsWith('marsh')) {
    const land = Number(scene.split(':')[1] ?? 0);
    const trail = new Trail(canvas, Math.min(LANDS.length - 1, land), 300);
    paint = () => trail.draw({ beat: 0, stones: [], states: [], bars: 1, name: (c) => c, count: () => '' }, 0);
  } else {
    const watch = new Watch(canvas, Number(scene.split(':')[1] ?? 0));
    paint = () => watch.draw(null, 0, false);
  }
  return { canvas, paint, w: 0, h: 0 };
}

/**
 * Puts the scene behind the page in `host`, first of its children, so that the page's sheets lie over it.
 * scene: "watch:<hour>" or "marsh:<land>".
 */
export function backdrop(host: HTMLElement, scene: string): void {
  let k = kept.get(scene);
  if (!k) {
    k = make(scene);
    kept.set(scene, k);
  }
  host.prepend(k.canvas);
  shown = k;
  if (k.w !== innerWidth || k.h !== innerHeight) {
    k.w = innerWidth;
    k.h = innerHeight;
    k.paint();
  }
}

addEventListener('resize', () => {
  const k = shown;
  if (!k || !k.canvas.isConnected) return;
  clearTimeout(resizing);
  resizing = window.setTimeout(() => {
    k.w = innerWidth;
    k.h = innerHeight;
    k.paint();
  }, 150);
});
let resizing = 0;
