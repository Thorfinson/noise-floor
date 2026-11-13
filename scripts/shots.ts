/**
 * The pictures of the README and the documentation: starts the app, opens it in Edge with the practice
 * instrument, plays a little and saves screenshots to docs/images. Run with: npm run shots
 *
 * It refuses to run while songs are kept in src/music/private: those must never end up in a picture that is
 * published. Move the folder aside for as long as it takes.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';
import { PRIVATE_SONGS } from '../src/music/songbook';

if (PRIVATE_SONGS.length) {
  console.error(`${PRIVATE_SONGS.length} songs are kept in src/music/private: move that folder aside before taking pictures for publishing.`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs/images');
mkdirSync(out, { recursive: true });
const server = await createServer({ root, logLevel: 'error', server: { port: 5194, strictPort: true } });
await server.listen();
const base = 'http://localhost:5194/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });

async function fresh(settings: Record<string, unknown>): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript((s) => {
    if (!localStorage.getItem('noise-floor/v1')) localStorage.setItem('noise-floor/v1', JSON.stringify({ settings: { mic: false, practiceInstrument: false, lang: 'en', ...s } }));
  }, settings);
  return ctx.newPage();
}
const press = async (page: Page, key: string, times: number, gap: number): Promise<void> => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(gap);
  }
};

try {
  // the start page of the guitar
  let page = await fresh({ instrument: 'guitar' });
  await page.goto(base + '#/');
  await page.waitForSelector('.plan');
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(out, 'today.png') });

  // a lesson: a picked song, read left to right, a few notes in
  page = await fresh({ instrument: 'guitar', practiceInstrument: true });
  await page.goto(base + '?autostart#/song/scarborough-fair/1');
  await page.waitForSelector('#rowA');
  await page.waitForTimeout(600);
  await press(page, 'n', 4, 450);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(out, 'lesson.png') });

  // the game at the lighthouse, at dusk, in the middle of a wave
  page = await fresh({ instrument: 'guitar', practiceInstrument: true });
  await page.goto(base + '?autostart&hour=2#/run/fingers/1');
  await page.waitForSelector('#brief');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 10000 });
  await page.waitForTimeout(2500);
  await press(page, 'n', 3, 400);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(out, 'lighthouse.jpg'), type: 'jpeg', quality: 82 });

  // singing on the pitch lane: a song moved into a measured range, a few notes held
  page = await fresh({ instrument: 'voice', practiceInstrument: true, voiceLow: 45, voiceHigh: 66 });
  await page.goto(base + '?autostart#/sing/ode-to-joy~voice/1');
  await page.waitForSelector('#lane');
  await page.waitForTimeout(600);
  await press(page, 'n', 3, 1100);
  await page.keyboard.press('n');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(out, 'voice.png') });

  // the path of the guitar, as a map
  page = await fresh({ instrument: 'guitar' });
  await page.goto(base + '#/progress');
  await page.waitForSelector('#stage h2');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(out, 'path.jpg'), type: 'jpeg', quality: 82 });
  console.log('pictures written to docs/images');
} finally {
  await browser.close();
  await server.close();
}
