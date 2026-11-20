/**
 * Walk-through: today's session around the song of the week, played with the practice instrument, a picture of
 * every step saved with the number of words on it. For looking at guidance and layout, not for checking anything:
 * the pictures have to be looked at.
 *
 *   npx vite-node tests/e2e/walk.ts [width] [height] [new]      pictures go to tests/e2e/out/walk/
 *
 * Without "new" it is a player on the third day of a week (Amazing Grace, Tom Dooley on the shelf); with it, a
 * first visit that takes the song the app proposes.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'out/walk');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const width = Number(process.argv[2]) || 1366;
const height = Number(process.argv[3]) || 768;
const fresh = process.argv.includes('new');
const server = await createServer({ root: resolve(here, '../..'), logLevel: 'error', server: { port: 5189, strictPort: true } });
await server.listen();
const base = 'http://localhost:5189/';
const DAY = 86400000;
let n = 0;
const shot = async (page: Page, name: string): Promise<void> => {
  n++;
  await page.screenshot({ path: resolve(out, `${String(n).padStart(2, '0')}-${name}.png`) });
  const words = await page.evaluate(() => (document.querySelector('#app') as HTMLElement).innerText.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w)).length);
  const over = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  console.log(`${String(n).padStart(2, '0')} ${name}  words ${words}${over > 4 ? `  taller by ${over}` : ''}`);
};
const railAt = (page: Page): Promise<number> => page.evaluate(() => [...document.querySelectorAll('.rail li')].findIndex((li) => li.classList.contains('cur')));

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
try {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const now = Date.now();
  const day = (t: number): number => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY);
  await ctx.addInitScript(
    ([state]) => {
      if (!localStorage.getItem('noise-floor/v1')) localStorage.setItem('noise-floor/v1', JSON.stringify(state));
    },
    [
      fresh
        ? { settings: { mic: false, practiceInstrument: true, lang: 'en', instrument: 'guitar' } }
        : {
            settings: { mic: false, practiceInstrument: true, lang: 'en', instrument: 'guitar', a4: 440 },
            skills: { 'chord:D': { level: 2, best: 12, last: now - DAY, tops: 0 }, 'chord:A7': { level: 1, best: 25, last: now - DAY, tops: 0 }, 'chord:G': { level: 2, best: 12, last: now - DAY, tops: 0 }, 'chord:C': { level: 1, best: 25, last: now - DAY, tops: 0 } },
            sessions: [now - 2 * DAY, now - DAY],
            weeks: { guitar: { id: 'amazing-grace-chords', start: day(now) - 2 } },
            reviews: { 'guitar:tom-dooley': { since: now - 20 * DAY, step: 1, due: now + 5 * DAY, at: 0, last: now - 4 * DAY } },
          },
    ] as const,
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(base + '?autostart#/');
  await page.waitForTimeout(1500);
  await shot(page, 'today');
  if (fresh) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(1200);
    await shot(page, 'today-chosen');
  }
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  await shot(page, 'step1-start');
  // each step: a look at its start, a few right notes, a look again, then on with Next step
  for (let k = 0; k < 8; k++) {
    const at = await railAt(page);
    if (at < 0) break;
    await page.waitForTimeout(1200);
    await shot(page, `step${at + 1}-a`);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('n');
      await page.waitForTimeout(500);
    }
    await shot(page, `step${at + 1}-b`);
    const nx = page.locator('#sp-go, #nextstep, #skip').first();
    if (await nx.count()) await nx.click();
    else await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1500);
    if ((await railAt(page)) === at) {
      // a warm-up's tuning is a step of its own screen: skip on to its music
      await shot(page, `step${at + 1}-c`);
      const nx2 = page.locator('#sp-go, #nextstep').first();
      if (await nx2.count()) await nx2.click();
      else {
        // a step that goes on with Space when it is through (the change drill: stop the minute, then on)
        for (let j = 0; j < 4 && (await railAt(page)) === at; j++) {
          await page.keyboard.press('Space');
          await page.waitForTimeout(1200);
        }
      }
      await page.waitForTimeout(1500);
    }
  }
  await page.waitForTimeout(1200);
  await shot(page, 'end');
} finally {
  await browser.close();
  await server.close();
}
