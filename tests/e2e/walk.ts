/**
 * Walk-through: goes through today's session as a first-time player would, with the practice instrument,
 * and saves a picture of every screen on the way. For looking at guidance and layout, not for checking
 * anything: the pictures have to be looked at.
 *
 *   npx vite-node tests/e2e/walk.ts [width] [height]      pictures go to tests/e2e/out/walk/
 *
 * The default size is what a small laptop leaves a browser window: 1366 by 650.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'out/walk');
// pictures of an earlier run would only be mistaken for new ones
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const width = Number(process.argv[2]) || 1366;
const height = Number(process.argv[3]) || 650;

const server = await createServer({ root: resolve(here, '../..'), logLevel: 'error', server: { port: 5198, strictPort: true } });
await server.listen();
const base = 'http://localhost:5198/';

let n = 0;
const shot = async (page: Page, name: string): Promise<void> => {
  n++;
  await page.screenshot({ path: resolve(out, `${String(n).padStart(2, '0')}-${name}.png`) });
  // anything that does not fit the window is worth knowing about
  const over = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  console.log(`${String(n).padStart(2, '0')} ${name}${over > 4 ? `   (page is ${over} px taller than the window)` : ''}`);
};
const until = async (page: Page, key: string, selector: string, count: number, or = ''): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press(key);
    const ok = await page
      .waitForFunction((a) => document.querySelectorAll(a.selector).length >= a.count || (!!a.or && !!document.querySelector(a.or)), { selector, count, or }, { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }
  await page.waitForTimeout(150);
};

try {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('noise-floor/v1')) localStorage.setItem('noise-floor/v1', JSON.stringify({ settings: { a4: 440, buzz: 0.5, mic: false, practiceInstrument: true, strumSelect: true } }));
  });
  const page = await ctx.newPage();
  await page.goto(base + '?autostart#/');
  await page.waitForSelector('.plan');
  await shot(page, 'home');

  await page.keyboard.press('Space');
  await page.waitForSelector('#strings');
  await page.waitForTimeout(400);
  await shot(page, 'tune-start');
  await page.keyboard.press('w');
  await page.waitForTimeout(1200);
  await shot(page, 'tune-flat');
  for (let i = 1; i <= 6; i++) {
    await until(page, 'n', '#strings button.ok', i, '#tiles');
    if (i === 1) await shot(page, 'tune-one-done');
    if (i < 6) await page.waitForFunction((k) => document.querySelectorAll('#strings button')[k]?.classList.contains('hit'), i, { timeout: 4000 }).catch(() => undefined);
  }
  await shot(page, 'tune-all-done');

  await page.waitForSelector('#tiles', { timeout: 8000 });
  await page.waitForTimeout(500);
  await shot(page, 'chord-1-start');
  const playChord = async (): Promise<void> => {
    const strings = await page.locator('#tiles .tile:not(.skip)').count();
    const have = await page.locator('#tiles .tile.clean').count();
    const gone = await page.locator('#tiles .tile').filter({ hasText: 'next time' }).count();
    for (let i = have + 1; i <= strings - gone; i++) await until(page, 'n', '#tiles .tile.clean', i, '#brief');
    await page.waitForFunction(() => /ring(s)? clean/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => undefined);
  };
  await until(page, 'n', '#tiles .tile.clean', 1);
  await shot(page, 'chord-1-second-string');
  await playChord();
  await shot(page, 'chord-1-done');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('#eb')?.textContent?.includes('Chord 2 of 3'), null, { timeout: 4000 }).catch(() => undefined);
  await shot(page, 'chord-2-start');
  await page.keyboard.press('m');
  await page.waitForTimeout(1300);
  await shot(page, 'chord-2-muted');
  for (let i = 0; i < 4 && !((await page.locator('#tiles').textContent()) ?? '').includes('next time'); i++) {
    await page.keyboard.press('m');
    await page.waitForTimeout(1300);
  }
  await shot(page, 'chord-2-string-left');
  await playChord();
  await shot(page, 'chord-2-done');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('#eb')?.textContent?.includes('Chord 3 of 3'), null, { timeout: 4000 }).catch(() => undefined);
  await playChord();
  await page.keyboard.press('ArrowRight');

  // the change, taught: without a clock, then the minute
  await page.waitForSelector('#boxa', { timeout: 8000 });
  await page.waitForTimeout(300);
  await shot(page, 'change-start');
  await page.keyboard.press('n');
  await page.waitForTimeout(900);
  await shot(page, 'change-how');
  for (let i = 0; i < 8 && !((await page.locator('#eb').textContent()) ?? '').includes('one calm minute'); i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(900);
  }
  await shot(page, 'change-minute-ready');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(900);
  }
  await shot(page, 'change-minute');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await shot(page, 'change-result');
  await page.keyboard.press('Space');
  await page.waitForSelector('#brief', { timeout: 8000 });
  await shot(page, 'run-brief');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('#banner')?.classList.contains('count'), null, { timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  await shot(page, 'run-count');
  await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  await shot(page, 'run-first-strum');
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(1100);
  }
  await shot(page, 'run-playing');
  for (let i = 0; i < 60 && !(await page.locator('[data-perk], #rerun').count()); i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(900);
  }
  await shot(page, 'run-upgrade');
  await page.keyboard.press('1');
  await page.waitForTimeout(600);
  for (let i = 0; i < 80 && !(await page.locator('#rerun').count()); i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(900);
  }
  await shot(page, 'run-debrief');
  await page.keyboard.press('Space');

  await page.waitForSelector('#cbox', { timeout: 8000 });
  await page.waitForTimeout(500);
  await shot(page, 'song-start');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(450);
  }
  await shot(page, 'song-playing');
  await page.keyboard.press('w');
  await page.waitForTimeout(600);
  await shot(page, 'song-wrong-note');
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(450);
  }
  await shot(page, 'song-line-done');
  await page.waitForTimeout(3200);
  await shot(page, 'song-line-2');
  // play on until the song step is through: how many strums that takes depends on the song of the day
  for (let i = 0; i < 60 && !(await page.locator('#tiles').count()); i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(450);
  }
  // the hard chord, last and optional
  const atBarre = await page.waitForSelector('#tiles', { timeout: 10000 }).then(() => true).catch(() => false);
  if (!atBarre) console.log('   !! the barre step was not reached: the next pictures show something else');
  await page.waitForTimeout(500);
  await shot(page, 'barre-start');
  await page.keyboard.press('m');
  await page.waitForTimeout(1300);
  await shot(page, 'barre-muted');
  await page.click('#nextstep').catch(() => undefined);
  const atEnd = await page.waitForFunction(() => document.querySelector('h1')?.textContent?.startsWith('Done.'), null, { timeout: 8000 }).then(() => true).catch(() => false);
  if (!atEnd) console.log('   !! the summary was not reached: the next picture shows something else');
  await shot(page, 'session-summary');

  // the other screens
  await page.goto(base + '?autostart#/');
  await page.waitForSelector('.plan');
  await shot(page, 'home-second-day');
  await page.goto(base + '?autostart#/nf');
  await page.waitForSelector('.cards');
  await shot(page, 'nf-choose');
  // the rhythm game
  await page.goto(base + '?autostart#/stride');
  await page.waitForSelector('#brief');
  await shot(page, 'stride-brief');
  await page.keyboard.press('Space');
  await page.waitForSelector('#play');
  await page.waitForTimeout(1500);
  await shot(page, 'stride-count');
  for (let i = 0; i < 14; i++) {
    await page.waitForFunction((n) => Number((document.querySelector('#app') as HTMLElement).dataset.step ?? -1) >= n, i, { timeout: 15000 }).catch(() => undefined);
    await page.keyboard.press('n');
    if (i === 9) await shot(page, 'stride-walking');
  }
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  await shot(page, 'stride-done');
  await page.goto(base + '?autostart#/run/fingers');
  await page.waitForSelector('#brief');
  await shot(page, 'fingers-brief');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 8000 }).catch(() => undefined);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(400);
  }
  await shot(page, 'fingers-playing');
  await page.goto(base + '?autostart#/run/song/1');
  await page.waitForSelector('#brief');
  await shot(page, 'songrun-brief');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 8000 }).catch(() => undefined);
  // chord changes need a moment each to be heard: a strum a second
  for (let i = 0; i < 90 && !(await page.locator('#boss').count()); i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(1000);
  }
  if (!(await page.locator('#boss').count())) console.log('   !! the Mute was not reached: the next picture shows something else');
  await page.waitForTimeout(2600);
  await shot(page, 'boss');
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(1500);
  }
  await shot(page, 'boss-seals-down');
  // the hours of the evening a full run goes through, looked at one by one
  for (const [hour, name, type] of [
    [1, 'amber', 'changes'],
    [2, 'dusk', 'fingers'],
    [3, 'night', 'changes'],
    [4, 'storm', 'fingers'],
    [5, 'northern-lights', 'changes'],
  ] as const) {
    await page.goto(base + `?autostart&hour=${hour}#/run/${type}`);
    await page.waitForSelector('#brief');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 8000 }).catch(() => undefined);
    await page.keyboard.press('n');
    await page.waitForTimeout(type === 'changes' ? 1100 : 400);
    await page.keyboard.press('n');
    // the new hour is painted in over a few seconds
    await page.waitForTimeout(4200);
    await shot(page, `run-hour-${name}`);
  }
  // the other three lands of the rhythm game
  for (const [pattern, name] of [
    ['half', 'pinewood'],
    ['rest', 'heath'],
    ['push', 'coast'],
  ] as const) {
    await page.goto(base + `?autostart#/stride/${pattern}`);
    await page.waitForSelector('#brief');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 12000 }).catch(() => undefined);
    for (let i = 0; i < 6; i++) {
      await page.waitForFunction((n) => Number((document.querySelector('#app') as HTMLElement).dataset.step ?? -1) >= n, i, { timeout: 15000 }).catch(() => undefined);
      await page.keyboard.press('n');
    }
    await page.waitForTimeout(350);
    await shot(page, `stride-${name}`);
  }
  // a song from the songbook: a strumming pattern, two chords to the bar
  await page.goto(base + '?autostart#/song/loch-lomond/1');
  await page.waitForSelector('#rowA');
  await page.waitForTimeout(500);
  await page.keyboard.press('n');
  await page.waitForTimeout(500);
  await shot(page, 'songbook-loch-lomond');
  await page.goto(base + '?autostart#/song/romanza/1');
  await page.waitForSelector('#rowA');
  await page.waitForTimeout(500);
  await shot(page, 'songbook-romanza');
  await page.goto(base + '?autostart#/song/scarborough-fair/2');
  await page.waitForSelector('#rowA');
  await page.waitForTimeout(700);
  await shot(page, 'song-with-click-count-in');
  await page.goto(base + '?autostart#/song/four-chords/1');
  await page.waitForSelector('#rowA');
  await page.waitForTimeout(500);
  await shot(page, 'song-strummed');
  await page.goto(base + '?autostart#/chord/F%23m');
  await page.waitForSelector('#tiles');
  await page.waitForTimeout(400);
  await shot(page, 'chord-check-alone');
  await page.goto(base + '?autostart#/tuner');
  await page.waitForSelector('#strings');
  await page.waitForTimeout(400);
  await shot(page, 'tuner-alone');
  await page.goto(base + '?autostart#/songs');
  await page.waitForSelector('.lib');
  await shot(page, 'songs');
  await page.goto(base + '?autostart#/progress');
  await page.waitForSelector('#stage h2');
  await page.waitForTimeout(700);
  await shot(page, 'path');
  await page.click('#stop-songs1');
  await page.waitForTimeout(300);
  await shot(page, 'path-stage-picked');
  await page.keyboard.press('End');
  await page.waitForTimeout(400);
  await shot(page, 'path-measured');
  await page.keyboard.press('Home');

  // a session left after its first step: the home page offers to go on
  await page.goto(base + '?autostart#/session/new');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#tiles', { timeout: 6000 }).catch(() => undefined);
  await page.click('header.top a[href="#/"]');
  await page.waitForSelector('.plan');
  await shot(page, 'home-session-left');
  await page.goto(base + '?autostart#/session/new');
  await page.waitForSelector('#skip');
  await page.goto(base + '?autostart#/');
  await page.waitForSelector('.plan');

  // the handbook: opened, a page in the middle, its last page, and one page on its own with something to try
  await page.goto(base + '?autostart#/basics');
  await page.waitForSelector('#leaf h2');
  await shot(page, 'basics-handbook');
  for (const id of ['diagram', 'patterns', 'barre']) {
    await page.goto(base + '?autostart#/basics/' + id);
    await page.waitForSelector('#leaf h2');
    await page.waitForTimeout(300);
    await shot(page, 'basics-page-' + id);
  }
  for (const id of ['hold', 'count', 'chord', 'mute', 'slur', 'p-sit', 'p-keys', 'p-notes', 'tune', 'diagram', 'press', 'strum', 'patterns', 'pluck', 'tab', 'barre']) {
    await page.goto(base + '?autostart#/basics/' + id + '/try');
    await page.waitForSelector('#pts');
    await page.waitForTimeout(200);
    await shot(page, 'basics-' + id);
  }

  // the piano: its own session from start to finish
  await page.goto(base + '?autostart#/');
  await page.waitForSelector('.plan');
  await page.click('[data-inst="piano"]');
  await page.waitForFunction(() => document.querySelectorAll('.plan li').length === 3, null, { timeout: 4000 }).catch(() => undefined);
  await shot(page, 'piano-home');
  await page.goto(base + '?autostart#/basics');
  await page.waitForSelector('#leaf h2');
  await shot(page, 'basics-handbook-piano');
  await page.goto(base + '?autostart#/progress');
  await page.waitForSelector('#stage h2');
  await page.waitForTimeout(600);
  await shot(page, 'path-piano');
  await page.goto(base + '?autostart#/');
  await page.waitForSelector('.plan');
  await page.keyboard.press('Space');
  await page.waitForSelector('#kb');
  await page.waitForTimeout(500);
  await shot(page, 'piano-pitch-start');
  await page.keyboard.press('w');
  await page.waitForTimeout(900);
  await shot(page, 'piano-pitch-wrong-key');
  await page.waitForTimeout(600);
  await page.keyboard.press('n');
  await page.waitForFunction(() => /Your piano's A is at/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => undefined);
  await shot(page, 'piano-pitch-done');
  await page.waitForSelector('#brief', { timeout: 8000 });
  await shot(page, 'piano-run-brief');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 8000 }).catch(() => undefined);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(400);
  }
  await shot(page, 'piano-run-playing');
  await page.click('#skipstep');
  await page.waitForSelector('#rowA');
  await page.waitForTimeout(500);
  await shot(page, 'piano-piece-start');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(450);
  }
  await page.keyboard.press('w');
  await page.waitForTimeout(500);
  await shot(page, 'piano-piece-wrong-key');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(450);
  }
  await shot(page, 'piano-piece-phrase-done');
  await page.goto(base + '?autostart#/piano/twinkle/2');
  await page.waitForSelector('#rowA');
  await page.waitForTimeout(700);
  await shot(page, 'piano-with-click');
  await page.goto(base + '?autostart#/run/keys/1');
  await page.waitForSelector('#brief');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 8000 }).catch(() => undefined);
  for (let i = 0; i < 120 && !(await page.locator('#boss').count()); i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(330);
  }
  if (!(await page.locator('#boss').count())) console.log('   !! the Mute was not reached: the next picture shows something else');
  await page.waitForTimeout(2600);
  await shot(page, 'piano-boss');

  // the piano's chords: the book of pieces, the chord check, a change, pieces of chords, the games
  await page.goto(base + '?autostart#/songs');
  await page.waitForSelector('#list li');
  await shot(page, 'pieces');
  await page.click('[data-level="0"]');
  await page.click('[data-kind="chords"]');
  await shot(page, 'pieces-chords');
  await page.click('[data-kind=""]');
  await page.click('[data-level="4"]');
  await shot(page, 'pieces-hard');
  await page.goto(base + '?autostart#/keys/C');
  await page.waitForSelector('#tiles .tile');
  await shot(page, 'keys-check-start');
  await page.keyboard.press('w');
  await page.waitForTimeout(900);
  await shot(page, 'keys-check-wrong-key');
  for (let i = 1; i <= 3; i++) await until(page, 'n', '#tiles .tile.clean', i);
  await shot(page, 'keys-check-all-together');
  await until(page, 'n', '#tiles .tile.clean', 4);
  await shot(page, 'keys-check-done');
  await page.goto(base + '?autostart#/keys/D7');
  await page.waitForSelector('#tiles .tile');
  await shot(page, 'keys-check-four-keys');
  await page.goto(base + '?autostart#/change/C/G');
  await page.waitForSelector('#boxa rect');
  await shot(page, 'keys-change-start');
  await page.keyboard.press('n');
  await page.waitForTimeout(1200);
  await shot(page, 'keys-change-tip');
  await page.goto(base + '?autostart#/piano/swing-low~keys/1');
  await page.waitForSelector('#rowA rect');
  await page.waitForTimeout(600);
  await shot(page, 'piano-chords-start');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(900);
  }
  await shot(page, 'piano-chords-change');
  await page.goto(base + '?autostart#/piano/swing-low~keys/2');
  await page.waitForSelector('#rowA rect');
  await page.waitForTimeout(3000);
  await shot(page, 'piano-chords-with-click');
  await page.goto(base + '?autostart#/');
  await page.waitForSelector('.plan');
  await shot(page, 'piano-home-chords');
  await page.goto(base + '?autostart#/piano/auld-lang-syne-chords~keys/1');
  await page.waitForSelector('#rowA rect');
  await page.waitForTimeout(600);
  await shot(page, 'piano-broken-start');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(550);
  }
  await shot(page, 'piano-broken-next-chord');
  await page.goto(base + '?autostart#/piano/joy-to-the-world/1');
  await page.waitForSelector('#rowA rect');
  await page.waitForTimeout(600);
  await shot(page, 'piano-tune-scale');
  await page.goto(base + '?autostart#/nf');
  await page.waitForSelector('.cards');
  await shot(page, 'piano-games');
  await page.goto(base + '?autostart#/run/kchanges');
  await page.waitForSelector('#brief');
  await shot(page, 'piano-changes-run-brief');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 8000 }).catch(() => undefined);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(1100);
  }
  await shot(page, 'piano-changes-run');
  await page.goto(base + '?autostart#/stride/four');
  await page.waitForSelector('#brief');
  await shot(page, 'piano-stride-brief');
  await page.keyboard.press('Space');
  await page.waitForSelector('#play');
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction((k) => Number((document.querySelector('#app') as HTMLElement).dataset.step ?? -1) >= k, i, { timeout: 15000 }).catch(() => undefined);
    await page.keyboard.press('n');
  }
  await page.waitForTimeout(300);
  await shot(page, 'piano-stride-walk');
  for (const id of ['p-chord', 'p-figure', 'p-play', 'p-move', 'p-black', 'p-thumb', 'p-broken', 'p-hands']) {
    await page.goto(base + `?autostart#/basics/${id}`);
    await page.waitForSelector('#leaf h2');
    await shot(page, `basics-${id}`);
  }
  await page.goto(base + '?autostart#/progress');
  await page.waitForSelector('#stage h2');
  await page.click('#stop-chords');
  await page.waitForTimeout(400);
  await shot(page, 'path-piano-chords');

  await page.goto(base + '?autostart#/settings');
  await page.waitForSelector('#dev');
  await shot(page, 'settings');
  await browser.close();

  // the very first thing a new player sees, and what comes after "Start today's session"
  const first = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--lang=en-US'] });
  const fresh = await first.newPage({ viewport: { width, height } });
  await fresh.goto(base + '#/');
  await fresh.waitForSelector('.plan');
  await shot(fresh, 'first-visit-home');
  await fresh.keyboard.press('Space');
  await fresh.waitForSelector('.gate');
  await shot(fresh, 'first-visit-gate');
  await first.close();
} finally {
  await server.close();
}
console.log(`pictures in ${out}`);
