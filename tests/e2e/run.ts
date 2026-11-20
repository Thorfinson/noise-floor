/**
 * Browser check: starts the app, opens it in Edge and plays to it.
 *   1. through the microphone path, with a synthesized guitar fed in as the capture device
 *   2. through the practice instrument, by pressing its keys
 * Each section has a browser of its own, and they run side by side (see the end of the file).
 * Run with: npm run e2e (E2E_JOBS=1 one section after the other, E2E_ONLY=2p,3 only those, E2E_TIMES=1 the seconds)
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';
import { addNoise, mixInto, strum, tone } from '../../src/audio/synth';
import { decodeWav } from '../../src/audio/wav';
import { songLines, SONGS, tabMidi } from '../../src/music/content';
import { EXERCISES } from '../../src/music/exercises';
import { chordNotes, CHORDS, OPEN_STRINGS, pianoChord } from '../../src/music/theory';
import { guitar, haveGuitar, havePiano, haveSteel, mix, piano } from '../real/clips';
import { guitarCheckSet } from '../real/checkset';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'out');
mkdirSync(out, { recursive: true });
const SR = 48000;

function wav(samples: Float32Array, file: string): string {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  const path = resolve(out, file);
  writeFileSync(path, buf);
  return path;
}

/** The song the lessons are tried with: Scarborough Fair, picked over Am, G, C and D. */
const FIRST = SONGS.find((s) => s.id === 'scarborough-fair')!;
/** The notes of its first line, as they are picked. */
const firstNotes = songLines(FIRST)[0].flatMap((i) => FIRST.bars[i].notes);

/** The first line of the song, every note left ringing, after a few seconds of room noise. */
function firstLine(): Float32Array {
  const notes = firstNotes.map(tabMidi);
  const sig = new Float32Array(SR * (4 + notes.length * 0.6 + 6));
  notes.forEach((midi, i) => mixInto(sig, tone({ sr: SR, midi, dur: 2, seed: i + 1 }), (4 + i * 0.6) * SR));
  addNoise(sig, 0.0015);
  return sig;
}

/** The low E string: twice 30 cents flat, then in tune. */
function lowE(): Float32Array {
  const sig = new Float32Array(SR * 16);
  [-30, -30, 0, 0, 0].forEach((cents, i) => mixInto(sig, tone({ sr: SR, midi: 40, dur: 2.4, cents, seed: i + 1 }), (3 + i * 2.5) * SR));
  addNoise(sig, 0.0015);
  return sig;
}

const results: [string, boolean, string][] = [];
const began = Date.now();
/** the section a check belongs to, carried through its awaits */
const section = new AsyncLocalStorage<{ name: string; repeated: number }>();
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push([name, ok, detail]);
  const tag = section.getStore()?.name;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${tag ? `[${tag}] ` : ''}${process.env.E2E_TIMES ? `[${Math.round((Date.now() - began) / 1000)}s] ` : ''}${name}${detail ? '  (' + detail + ')' : ''}`);
};
/** checks that cannot run here (the recordings are not fetched): said, so that a run without them does not read as one with them */
const skipped: string[] = [];
const skip = (name: string, why: string): void => {
  skipped.push(name);
  const tag = section.getStore()?.name;
  console.log(`SKIP  ${tag ? `[${tag}] ` : ''}${name}  (${why})`);
};
/** The stages beside the path, as the skills of the Learn page show them: every skill opened in turn. */
const skillStages = async (page: Page): Promise<string> => {
  const names: string[] = [];
  for (let i = 0; i < (await page.locator('[data-skill]').count()); i++) {
    await page.locator('[data-skill]').nth(i).click();
    names.push(...(await page.locator('.sklevel b').allTextContents()));
  }
  return names.join(' | ');
};
/** The instrument is chosen in a menu beside the name at the top: open it, then pick. */
const pickInstrument = async (page: Page, inst: string): Promise<void> => {
  await page.click('details.inst > summary');
  await page.click(`.instmenu [data-inst="${inst}"]`);
};
const text = (page: Page, sel: string): Promise<string> =>
  page
    .locator(sel)
    .first()
    .innerText({ timeout: 4000 })
    .catch(() => `(no ${sel})`);
const press = async (page: Page, key: string, times: number, gapMs: number): Promise<void> => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(gapMs);
  }
};

/**
 * Presses a key and waits until the page shows that it was heard: at least n elements match the selector
 * (or the other selector appears). A pluck that goes unnoticed is repeated, as a player would, and counted.
 */
/** how often a pluck had to be played again, in the section that runs */
const repeated = (): number => section.getStore()?.repeated ?? 0;
const again = (): void => {
  const run = section.getStore();
  if (run) run.repeated++;
};
const pressUntil = async (page: Page, key: string, selector: string, n: number, or = ''): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) {
      again();
      console.log(`      [${section.getStore()?.name ?? ''}] (played again: "${key}" for ${selector} × ${n} at ${page.url().split('#')[1] ?? ''})`);
    }
    await page.keyboard.press(key);
    const heard = await page
      .waitForFunction((a) => document.querySelectorAll(a.selector).length >= a.n || (!!a.or && !!document.querySelector(a.or)), { selector, n, or }, { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (heard) break;
  }
  await page.waitForTimeout(150);
};

/** The same for a text: press the key until the element says it. */
const pressUntilText = async (page: Page, key: string, selector: string, part: string): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) {
      again();
      console.log(`      [${section.getStore()?.name ?? ''}] (played again: "${key}" for "${part}" in ${selector} at ${page.url().split('#')[1] ?? ''})`);
    }
    await page.keyboard.press(key);
    const said = await page
      .waitForFunction((a) => (document.querySelector(a.selector)?.textContent ?? '').includes(a.part), { selector, part }, { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (said) break;
  }
};

/** A run explains itself first and counts in: start it and wait until the noise falls. */
const startRun = async (page: Page): Promise<void> => {
  await page.waitForSelector('#brief', { timeout: 8000 });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 8000 }).catch(() => undefined);
};

// node_modules may be a link to another folder (a second working copy shares the first one's): its fonts are served too
// another working copy on the same machine may be checking at the same time: E2E_PORT gives this one its own port
const port = Number(process.env.E2E_PORT) || 5199;
const server = await createServer({ root: resolve(here, '../..'), logLevel: 'error', server: { port, strictPort: true, fs: { allow: [resolve(here, '../..'), realpathSync(resolve(here, '../../node_modules'))] } } });
await server.listen();
const base = `http://localhost:${port}/`;

/** The sections of the checks, each with a browser of its own: they run side by side (see below). */
const sections: [string, () => Promise<void>][] = [
  ['1', async () => {
    // 1. microphone path
    {
      const browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav(firstLine(), 'first-line.wav')}`, '--autoplay-policy=no-user-gesture-required', '--lang=en-US'],
      });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + '?autostart#/song/scarborough-fair');
      await page.waitForSelector('#h1');
      check('mic: lesson shows the first instruction', (await text(page, '#h1')).includes('Hold Am'), await text(page, '#h1'));
      const done = await page
        .waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('of full speed'), null, { timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      check('mic: a synthesized guitar played into the microphone gets through the whole first line', done, await text(page, '#fbk'));
      check('mic: the microphone was opened, and the last note it heard is shown beside the meter', /^(Hearing you|Heard: [A-G])/.test(await text(page, '.mic-l')), await text(page, '.mic-l'));
      await page.screenshot({ path: resolve(out, 'mic-song.png') });
      check('mic: no script errors', errors.length === 0, errors.join(' | '));
      await browser.close();
    }
  }],
  ['1b', async () => {
    // 1b. microphone path: the guitar tuner
    {
      const browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav(lowE(), 'low-e.wav')}`, '--autoplay-policy=no-user-gesture-required', '--lang=en-US'],
      });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(base + '?autostart#/tuner');
      await page.waitForSelector('#strings');
      // "Pluck the low E string", or on a slow machine already "Low E string: tighten it." once the
      // microphone's flat E has been heard: either way the tuner is on the low E string
      check('tuner: asks for the low E string first', /low E string/i.test(await text(page, '#h1')), await text(page, '#h1'));
      const flat = await page
        .waitForFunction(() => /cents too low/.test(document.querySelector('#msg')?.textContent ?? ''), null, { timeout: 12000 })
        .then(() => true)
        .catch(() => false);
      check('tuner: a flat string played into the microphone is called too low', flat, await text(page, '#msg'));
      await page.screenshot({ path: resolve(out, 'tuner-flat.png') });
      const tuned = await page
        .waitForFunction(() => document.querySelector('#strings button')?.classList.contains('ok') && document.querySelector('#h1')?.textContent?.includes('A string'), null, { timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      check('tuner: once in tune the string is ticked and it moves on to the A string', tuned, await text(page, '#h1'));
      // the played-in file starts again with the flat string: the tuner follows the string it hears, and a
      // string that was ticked off loses its tick when it has gone flat
      const again = await page
        .waitForFunction(() => !document.querySelector('#strings button')?.classList.contains('ok') && /Low E string.*tighten/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 22000 })
        .then(() => true)
        .catch(() => false);
      check('tuner: a ticked string that has gone flat is noticed when it is plucked, and tuned again', again, `${await text(page, '#h1')} | ${await text(page, '#msg')}`);

      // what the app heard can be saved to a file, for finding out why something was not heard right
      await page.goto(base + '?autostart#/settings');
      await page.waitForSelector('#rec');
      await page.click('#rec');
      await page.waitForFunction(() => document.querySelector('#rec')?.textContent?.includes('Stop and save'), null, { timeout: 6000 }).catch(() => undefined);
      await page.waitForTimeout(2600);
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 6000 }).catch(() => null), page.click('#rec')]);
      let saved = false;
      let about = '';
      if (download) {
        const path = resolve(out, 'heard.wav');
        await download.saveAs(path);
        const w = decodeWav(readFileSync(path));
        let peak = 0;
        for (const x of w.samples) peak = Math.max(peak, Math.abs(x));
        about = `${(w.samples.length / w.sampleRate).toFixed(1)} s at ${w.sampleRate} Hz, loudest ${peak.toFixed(3)}, ${download.suggestedFilename()}`;
        // not silence: the room noise of the played-in file is in it at least
        saved = w.sampleRate === 48000 && w.samples.length > 2 * w.sampleRate && peak > 0.0005 && /^noise-floor-heard-.*\.wav$/.test(download.suggestedFilename());
      }
      check('settings: what the app heard through the microphone is saved as a sound file', saved, about || (await text(page, '#recmsg')));
      await browser.close();
    }
  }],
  ['1c', async () => {
    // 1c. microphone path with recordings of a real guitar, when they have been fetched (npm run samples)
    if (!haveGuitar) skip('real guitar: a line of a song and the tuner, played into the microphone from recordings', 'no recordings of a guitar here: npm run samples');
    if (haveGuitar) {
      // the first line of the song: every string left ringing, a new note on a string ending the old one
      const line = firstNotes;
      const played = line.map((n, i) => {
        const next = line.findIndex((m, j) => j > i && m.s === n.s);
        return { clip: guitar(tabMidi(n), n.s), at: 4 + i * 0.6, dur: next < 0 ? undefined : (next - i) * 0.6, gain: 3 };
      });
      const launch = (file: string) =>
        chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`, '--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
      {
        const browser = await launch(wav(mix(played, 4 + line.length * 0.6 + 6), 'real-first-line.wav'));
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        // the recorded guitar is tuned about 20 cents low: the reference is set to match, as after tuning to it
        await ctx.addInitScript(() => localStorage.setItem('noise-floor/v1', JSON.stringify({ settings: { a4: 435 } })));
        const page = await ctx.newPage();
        await page.goto(base + '?autostart#/song/scarborough-fair');
        await page.waitForSelector('#h1');
        const done = await page
          .waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('of full speed'), null, { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
        check('real guitar: recorded notes played into the microphone get through the whole first line', done && (await text(page, '#fbk')).includes('no slips'), await text(page, '#fbk'));
        await page.screenshot({ path: resolve(out, 'real-song.png') });
        await browser.close();
      }
      {
        // the open low E string, plucked every three seconds; in the recording it is some 38 cents flat
        const plucks = Array.from({ length: 4 }, (_, i) => ({ clip: guitar(40, 0), at: 3 + i * 3, gain: 3 }));
        const browser = await launch(wav(mix(plucks, 16), 'real-low-e.wav'));
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await page.goto(base + '?autostart#/tuner');
        await page.waitForSelector('#strings');
        const flat = await page
          .waitForFunction(() => /(3\d|4[0-4]) cents too low/.test(document.querySelector('#msg')?.textContent ?? ''), null, { timeout: 15000 })
          .then(() => true)
          .catch(() => false);
        check('real guitar: the tuner reads the recorded low E string as a good third of a semitone flat', flat, await text(page, '#msg'));
        await page.screenshot({ path: resolve(out, 'real-tuner.png') });
        await browser.close();
      }
    }
  }],
  ['1d', async () => {
    // 1d. microphone path with recordings of a real piano, when they have been fetched: chords are its single
    // keys mixed together, a few milliseconds apart as a hand strikes them, each let go before the next
    if (!havePiano) skip('real piano: chords, keys and a change, played into the microphone from recordings', 'no recordings of a piano here: npm run samples');
    if (havePiano) {
      const launch = (file: string) =>
        chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`, '--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
      /** the recorded grand is tuned to 441: the app has been told, as it is at the start of a piano session */
      const atPiano = async (browser: Awaited<ReturnType<typeof launch>>): Promise<Page> => {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.addInitScript(() => localStorage.setItem('noise-floor/v1', JSON.stringify({ settings: { pianoA4: 441, instrument: 'piano' } })));
        return ctx.newPage();
      };
      const struck = (id: string, at: number, held: number) => pianoChord(id).midis.map((m, i) => ({ clip: piano(m), at: at + i * 0.006, dur: held, gain: 2 }));
      const key = (m: number, at: number, held: number) => ({ clip: piano(m), at, dur: held, gain: 4 });
      {
        // the first phrase of a song of whole chords: C four times, F twice, C twice
        const chords = ['C', 'C', 'C', 'C', 'F', 'F', 'C', 'C'];
        const browser = await launch(wav(mix(chords.flatMap((c, i) => struck(c, 4 + i * 1.2, 1.0)), 4 + chords.length * 1.2 + 6), 'real-piano-chords.wav'));
        const page = await atPiano(browser);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(base + '?autostart#/piano/swing-low~keys/1');
        await page.waitForSelector('#h1');
        check('real piano: a piece of chords asks for its first chord, in the key that lies under the hand', (await text(page, '#h1')) === 'Play C: all its keys at once.', await text(page, '#h1'));
        const done = await page
          .waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('of full speed'), null, { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
        check('real piano: recorded chords played into the microphone get through the whole first phrase', done && (await text(page, '#fbk')).includes('no slips') && errors.length === 0, `${await text(page, '#fbk')} ${errors.join(' | ')}`);
        await page.screenshot({ path: resolve(out, 'real-piano-chords.png') });
        await browser.close();
      }
      {
        // the first phrase of a song of broken chords: C, then G, four keys each
        const keys = [60, 64, 67, 64, 67, 71, 74, 71];
        const browser = await launch(wav(mix(keys.map((m, i) => key(m, 4 + i * 0.6, 0.56)), 4 + keys.length * 0.6 + 6), 'real-piano-broken.wav'));
        const page = await atPiano(browser);
        await page.goto(base + '?autostart#/piano/auld-lang-syne-chords~keys/1');
        await page.waitForSelector('#h1');
        const done = await page
          .waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('of full speed'), null, { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
        check('real piano: recorded keys played into the microphone get through a phrase of broken chords', done && (await text(page, '#fbk')).includes('no slips'), await text(page, '#fbk'));
        await page.screenshot({ path: resolve(out, 'real-piano-broken.png') });
        await browser.close();
      }
      {
        // the chord check: C, E and G one at a time, each held, and then all three at once
        const browser = await launch(wav(mix([key(60, 4, 1.6), key(64, 6.2, 1.6), key(67, 8.4, 1.6), ...struck('C', 10.6, 1.6)], 18), 'real-piano-check.wav'));
        const page = await atPiano(browser);
        await page.goto(base + '?autostart#/keys/C');
        await page.waitForSelector('#tiles .tile');
        const done = await page
          .waitForFunction(() => document.querySelectorAll('#tiles .tile.clean').length === 4, null, { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
        check('real piano: the chord check hears the recorded keys ring one by one, and then the chord as a whole', done && (await text(page, '#h1')).includes('Every key rings'), `${await text(page, '#h1')} | ${(await text(page, '#tiles')).replace(/\s+/g, ' ')}`);
        await page.screenshot({ path: resolve(out, 'real-piano-check.png') });
        await browser.close();
      }
      {
        // a change: C and G in turn, a second and a half apart
        const turns = ['C', 'G', 'C', 'G', 'C', 'G', 'C', 'G'];
        const browser = await launch(wav(mix(turns.flatMap((c, i) => struck(c, 4 + i * 1.5, 1.2)), 4 + turns.length * 1.5 + 8), 'real-piano-change.wav'));
        const page = await atPiano(browser);
        await page.goto(base + '?autostart#/change/C/G');
        await page.waitForSelector('#boxa rect');
        const counted = await page
          .waitForFunction(() => /1 changes/.test(document.querySelector('#big')?.textContent ?? ''), null, { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
        check('real piano: the change between two recorded chords is followed through the part without a clock and counted in the minute', counted, `${await text(page, '#h1')} | ${await text(page, '#big')}`);
        await browser.close();
      }
    }
  }],
  ['1e', async () => {
    // 1e. the band: chosen in the settings, and the speaker test of the hearing check. The test needs a microphone
    // that hears the speakers; the fake one of the browser hears only a quiet room, as under headphones, and the
    // test must say so. With the practice instrument alone it says that it needs the microphone.
    const quiet = new Float32Array(SR * 6);
    addNoise(quiet, 0.0015);
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav(quiet, 'quiet-room.wav')}`, '--autoplay-policy=no-user-gesture-required', '--lang=en-US'],
    });
    const errors: string[] = [];
    const open = async (route: string, settings: Record<string, unknown>) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript((st) => {
        // only on the first load: a reload must find what the page saved
        if (!sessionStorage.getItem('seeded')) {
          localStorage.setItem('noise-floor/v1', JSON.stringify({ settings: { lang: 'en', ...st } }));
          sessionStorage.setItem('seeded', '1');
        }
      }, settings);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + '?autostart#/' + route);
      return { page, ctx };
    };
    const saved = (page: Page): Promise<{ band?: string; bandVolume?: number }> => page.evaluate(() => JSON.parse(localStorage.getItem('noise-floor/v1') ?? '{}').settings ?? {});

    // the settings: the three bands, the loudness, and the way to the speaker test
    {
      const { page, ctx } = await open('settings', {});
      await page.waitForSelector('#band');
      const options = await page.locator('#band option').allTextContents();
      const chosen = await page.locator('#band').inputValue();
      await page.selectOption('#band', 'phones');
      await page.locator('#bandvol').evaluate((el: HTMLInputElement) => {
        el.value = '0.35';
        el.dispatchEvent(new Event('change'));
      });
      await page.reload();
      await page.waitForSelector('#band');
      const after = { band: await page.locator('#band').inputValue(), vol: await page.locator('#bandvol').inputValue(), stored: await saved(page) };
      const link = await page.locator('#bandtest').getAttribute('href');
      check('band: the settings offer the full band, the band for speakers and the click alone, its loudness, and the speaker test', options.join(' | ') === 'Full band (headphones) | Band for speakers | Click only' && chosen === 'speakers' && after.band === 'phones' && after.vol === '0.35' && after.stored.band === 'phones' && link === '#/check/band', `${options.join(' | ')} · ${chosen} → ${after.band}, ${after.vol}, stored ${after.stored.band} ${after.stored.bandVolume} · ${link}`);
      await page.click('#bandtest');
      await page.waitForSelector('#go', { timeout: 6000 }).catch(() => undefined);
      check('band: the speaker test opens from the settings', (await text(page, '#h1')) === 'Can the band play through your speakers?' && (await text(page, '#where')).includes('Speaker test'), `${await text(page, '#h1')} | ${await text(page, '#where')}`);
      await ctx.close();
    }

    // the hearing check leads to it
    {
      const { page, ctx } = await open('check', { instrument: 'guitar' });
      await page.waitForSelector('#bandtest');
      await page.click('#bandtest');
      await page.waitForFunction(() => location.hash === '#/check/band', null, { timeout: 4000 }).catch(() => undefined);
      check('band: the hearing check has the step "Band through speakers"', page.url().endsWith('#/check/band'), page.url());
      await ctx.close();
    }

    // a microphone that hears only the room: the band was not heard, the full band for headphones is offered
    {
      const { page, ctx } = await open('check/band', { instrument: 'guitar', practiceInstrument: true });
      await page.waitForSelector('#go');
      await page.waitForTimeout(800);
      await page.keyboard.press(' ');
      await page.waitForFunction(() => /Keep still/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 6000 }).catch(() => undefined);
      const during = { h1: await text(page, '#h1'), eb: await text(page, '#eb'), now: await page.locator('.checklist li.now').count() };
      const ended = await page
        .waitForFunction(() => /did not hear the band/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 32000 })
        .then(() => true)
        .catch(() => false);
      const shown = { h1: await text(page, '#h1'), phones: await page.locator('#tophones').isVisible(), click: await page.locator('#toclick').isVisible(), steps: await page.locator('.checklist li').allTextContents() };
      await page.screenshot({ path: resolve(out, 'band-test.png') });
      await page.click('#tophones');
      const stored = await saved(page);
      check('band: the speaker test plays the band while the player keeps still, counting down', /^Keep still/.test(during.h1) && /Speaker test · \d+ s/.test(during.eb) && during.now === 1, JSON.stringify(during));
      check('band: with a microphone that hears only the room it says in one sentence that the band was not heard, and offers the full band for headphones', ended && shown.h1 === 'The microphone did not hear the band: with headphones on, the full band is for you.' && shown.phones && !shown.click && stored.band === 'phones', `${JSON.stringify(shown)} · stored ${stored.band}`);
      await ctx.close();
    }

    // the practice instrument alone: the test needs the microphone
    {
      const { page, ctx } = await open('check/band', { instrument: 'guitar', mic: false, practiceInstrument: true });
      await page.waitForSelector('#go');
      await page.waitForTimeout(500);
      await page.keyboard.press(' ');
      await page.waitForFunction(() => /needs the microphone/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => undefined);
      check('band: with the practice instrument alone the speaker test says it needs the microphone', (await text(page, '#h1')) === 'The speaker test needs the microphone: switch it on in the settings.', await text(page, '#h1'));
      // in German
      await ctx.close();
    }
    {
      const { page, ctx } = await open('check/band', { instrument: 'guitar', lang: 'de' });
      await page.waitForSelector('#go');
      check('band: the speaker test speaks German', (await text(page, '#h1')) === 'Kann die Band über deine Lautsprecher spielen?' && (await text(page, '#go')).includes('Test starten'), await text(page, '#h1'));
      await ctx.close();
    }
    check('band: no script errors', errors.length === 0, errors.join(' | '));
    await browser.close();
  }],
  ['2', async () => {
    // 2. practice instrument path
    {
      const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(() => {
        // the groove at its quickest tempo, so that a wave of the changes run is over in half a minute
        if (!localStorage.getItem('noise-floor/v1')) localStorage.setItem('noise-floor/v1', JSON.stringify({ settings: { a4: 440, buzz: 0.5, mic: false, practiceInstrument: true, strumSelect: true }, current: { guitar: 'scarborough-fair' }, speeds: { groove: 120 } }));
      });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto(base + '?autostart#/');
      // without a song of the week the start page asks for one: three that suit, and one's own
      await page.waitForSelector('[data-week]');
      check('home: without a song of the week it asks for one, three that suit and a way to bring your own', (await page.locator('[data-week]').count()) === 3 && (await page.locator('a[href="#/import"]').count()) >= 1 && (await text(page, 'h1')).includes('by Sunday'), await text(page, 'h1'));
      await page.screenshot({ path: resolve(out, 'home-choose.png') });
      // the first of the three is the app's proposal: take it
      const weekTitle = await text(page, '.wsong-pick.first h3');
      const weekId = (await page.getAttribute('.wsong-pick.first [data-week]', 'data-week')) ?? '';
      await page.locator('.wsong-pick.first [data-week]').click();
      await page.waitForSelector('.plan');
      check('home: the song of the week is the title, with its parts, one button to play and the band as a switch', (await text(page, 'h1')).includes(weekTitle) && (await page.locator('.wsong-form li').count()) >= 2 && (await text(page, '#go')).includes('Play') && (await page.locator('[data-band]').count()) === 3, `${await text(page, 'h1')} · ${await page.locator('.wsong-form li').count()} parts`);
      check('home: today is four steps around the song: warm up, focus, new, encore', (await page.locator('.plan li').count()) === 4 && (await text(page, '.plan')).includes('Warm up') && /New chord: [A-G]/.test(await text(page, '.plan')) && (await text(page, '.plan')).includes(weekTitle) && (await text(page, '.plan')).includes('Encore'), (await text(page, '.plan')).replace(/\s+/g, ' '));
      await page.screenshot({ path: resolve(out, 'home.png') });

      // the guided session from start to finish
      await page.keyboard.press('Space');
      await page.waitForSelector('#strings');
      check('session: warms up by tuning first', (await text(page, '#eb')).includes('Step 1 of 4'), await text(page, '#eb'));
      await pressUntilText(page, 'w', '#msg', 'too low');
      check('session: an out-of-tune string is called too low', (await text(page, '#msg')).includes('too low'), await text(page, '#msg'));
      await page.screenshot({ path: resolve(out, 'session-tune.png') });
      // two strings tuned, then back one: it loses its tick and is tuned again
      for (let i = 1; i <= 2; i++) {
        await pressUntil(page, 'n', '#strings button.ok', i, '#gplay');
        await page.waitForFunction((k) => document.querySelectorAll('#strings button')[k]?.classList.contains('hit'), i, { timeout: 4000 }).catch(() => undefined);
      }
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);
      check('session: the left arrow goes back a string, which is then tuned again', (await page.locator('#strings button.ok').count()) === 1 && (await text(page, '#h1')).includes('A string'), `${await page.locator('#strings button.ok').count()} ticked, ${await text(page, '#h1')}`);
      for (let i = 2; i <= 6; i++) {
        await pressUntil(page, 'n', '#strings button.ok', i, '#gplay');
        if (i < 6) await page.waitForFunction((k) => document.querySelectorAll('#strings button')[k]?.classList.contains('hit'), i, { timeout: 4000 }).catch(() => undefined);
      }
      // then music: the groove of the song of the week with the band, nothing measured, started by a strum
      await page.waitForSelector('#gplay', { timeout: 8000 });
      check('session: six tuned strings lead into the groove, with nothing measured', (await text(page, '#gkick')).includes('Warm-up') && (await text(page, '#gsub')).includes('nothing is measured') && (await page.locator('#gl0 line, #gl0 path').count()) > 4, `${await text(page, '#gkick')} | ${await text(page, '#gsub')}`);
      await page.keyboard.press('n');
      const grooving = await page.waitForFunction(() => /Round|Count in/.test(document.querySelector('#gsub')?.textContent ?? ''), null, { timeout: 5000 }).then(() => true).catch(() => false);
      check('session: a strum starts the groove, counted in', grooving, await text(page, '#gsub'));
      await page.screenshot({ path: resolve(out, 'session-groove.png') });
      await page.click('#nextstep');
      // the focus: a chord of the coming part that does not ring yet, string by string, with where the fingers go
      await page.waitForSelector('#tiles', { timeout: 8000 });
      check('session: the focus takes a chord the song needs that does not ring yet, and says where the fingers go', (await text(page, '#eb')).includes('Step 2 of 4') && /How to hold [A-G]/.test(await text(page, '#tip')) && /finger: [A-Za-z ]+ string, fret \d/.test(await text(page, '#tip')), `${await text(page, '#eb')} | ${(await text(page, '#tip')).replace(/\s+/g, ' ')}`);
      await page.screenshot({ path: resolve(out, 'session-chord.png') });
      await page.waitForTimeout(600);
      /** Plays every string of the chord on show that is still to come. */
      const playChord = async (): Promise<void> => {
        const strings = await page.locator('#tiles .tile:not(.skip)').count();
        const have = await page.locator('#tiles .tile.clean').count();
        const gone = await page.locator('#tiles .tile').filter({ hasText: 'next time' }).count();
        for (let i = have + 1; i <= strings - gone; i++) await pressUntil(page, 'n', '#tiles .tile.clean', i, '#brief');
        await page.waitForFunction(() => /ring(s)? clean/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => undefined);
      };
      // a string that will not ring: after three tries it is left for next time, and the check goes on
      for (let i = 0; i < 5 && !(await text(page, '#tiles')).includes('next time'); i++) {
        await page.keyboard.press('m');
        await page.waitForTimeout(1300);
      }
      check('session: a string that will not ring is left for next time after three tries', (await text(page, '#tiles')).includes('next time'), (await text(page, '#tiles')).replace(/\s+/g, ' '));
      await playChord();
      check('session: the chord ends with what rang, without getting stuck', /\d of \d strings ring clean/.test(await text(page, '#h1')), await text(page, '#h1'));
      await page.keyboard.press('ArrowRight');
      // a song not begun yet is heard first: its words and chords on show, the lesson one press away
      const heardFirst = await page.waitForSelector('.sp-pre', { timeout: 6000 }).then(() => true).catch(() => false);
      check('session: a song not begun yet is heard first, then started on the player\'s word', heardFirst && (await page.locator('#sp-play').count()) === 1 && (await page.locator('.sp-sheet .sp-line').count()) >= 2 && (await page.locator('#sp-go').count()) === 1, await text(page, '.sp-pre h1'));
      if (heardFirst) await page.click('#sp-go');
      await page.waitForSelector('#cbox');
      check('session: the new part of the song is step 3, with a chord diagram for the fingers', (await text(page, '#eb')).includes('Step 3 of 4') && (await page.locator('#cbox circle').count()) >= 3, `${await page.locator('#cbox circle').count()} dots, ${await text(page, '#eb')}`);
      await page.waitForTimeout(600);
      await press(page, 'n', 12, 380);
      await page.screenshot({ path: resolve(out, 'session-song.png') });
      await page.click('#nextstep');
      // the encore: tonight's night, with this week's chords, said in one line, played on the groove
      await page.waitForSelector('#brief', { timeout: 8000 });
      check('session: the encore is tonight\'s game: one line on what to do, its chords, and nothing moves yet', (await text(page, '#brief h1')) === 'Play the chord on a piece to strike it.' && (await page.locator('#brief .night-chords figure').count()) >= 2 && (await page.locator('.night-strip').count()) === 1 && (await page.locator('#con').count()) === 0, `${await text(page, '#brief h1')} · ${await page.locator('#brief .night-chords figure').count()} shapes`);
      await page.screenshot({ path: resolve(out, 'session-brief.png') });
      await page.keyboard.press('Space');
      const counted = await page
        .waitForFunction(() => document.querySelector('#banner')?.classList.contains('count') && /^[1-4]$/.test(document.querySelector('#banner')?.textContent ?? '') && Number((document.querySelector('#scene') as HTMLElement | null)?.dataset.pieces ?? 0) >= 1, null, { timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      // how far the first piece of noise has come toward the lamp: it must not move while the count goes on
      const near = (): Promise<string> => page.evaluate(() => (document.querySelector('#scene') as HTMLElement | null)?.dataset.near ?? '');
      const y0 = await near();
      await page.waitForTimeout(300);
      const y1 = await near();
      await page.screenshot({ path: resolve(out, 'session-count.png') });
      const wears = await page.evaluate(() => (document.querySelector('#scene') as HTMLElement | null)?.dataset.next ?? '');
      check('session: the run counts in, with the first piece already on show, wearing its chord, and nothing coming nearer yet', counted && wears !== '' && y0 !== '' && y0 === y1, `${await text(page, '#banner')} | ${wears} | ${y0} then ${y1}`);
      // the picture of the run: a canvas over the whole window, painted, with the lighthouse scene in it
      const painted = await page.evaluate(() => {
        const c = document.querySelector('#scene') as HTMLCanvasElement | null;
        if (!c) return 'no canvas';
        const box = c.getBoundingClientRect();
        const ctx = c.getContext('2d')!;
        const tones = new Set<string>();
        for (let i = 1; i < 12; i++) {
          for (let j = 1; j < 6; j++) {
            const d = ctx.getImageData(Math.floor((c.width * i) / 12), Math.floor((c.height * j) / 12), 1, 1).data;
            tones.add(`${d[0] >> 4},${d[1] >> 4},${d[2] >> 4}`);
          }
        }
        return `${Math.round(box.width)}x${Math.round(box.height)} of ${innerWidth}x${innerHeight}, ${tones.size} tones`;
      });
      const [, pw, ph, ww, wh, tones] = /^(\d+)x(\d+) of (\d+)x(\d+), (\d+) tones$/.exec(painted) ?? [];
      check('games: the run is played in a painted picture that fills the window', pw === ww && ph === wh && Number(tones) >= 12, painted);
      await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 8000 }).catch(() => undefined);
      check('session: the encore is the last step', (await text(page, '.hud .k, .night-hud')).toUpperCase().includes('STEP 4 OF 4'), await text(page, '.hud .k, .night-hud'));
      await press(page, 'n', 6, 1100);
      await page.screenshot({ path: resolve(out, 'session-run.png') });
      await page.click('#skipstep, #nextstep').catch(() => page.keyboard.press('ArrowRight'));
      const ended = await page
        .waitForSelector('#endh1', { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      check('session: it ends with a sentence on the song, what is next tomorrow, and playing on with the band', ended && (await text(page, '.wsong-tomorrow')).includes('Tomorrow') && ((await page.locator('#free').getAttribute('href')) ?? '').startsWith(`#/groove/${weekId}`), `${await text(page, 'h1')} · ${(await text(page, '.wsong-tomorrow')).replace(/\s+/g, ' ')}`);
      await page.screenshot({ path: resolve(out, 'session-done.png') });

      // once today's session is through, the start page says so and offers to play on with the band
      await page.goto(base + '?autostart#/');
      await page.waitForSelector('.plan', { timeout: 8000 }).catch(() => undefined);
      check("home: once today's session is done, the start page says so, and offers to play on and another round", /done for today/i.test(await text(page, '.wsong-hero .kick')) && (await text(page, '#go')).includes('Keep playing') && (await text(page, '.heroacts')).includes('Another round'), `${await text(page, '.wsong-hero .kick')} · ${await text(page, '#go')}`);
      await page.screenshot({ path: resolve(out, 'home-done.png') });
      // another round starts from step 1; a session left half-way goes on where it stopped, and can be begun again
      await page.click('a[href="#/session/new"]');
      await page.waitForSelector('#skip');
      await page.click('#skip');
      await page.waitForSelector('#gplay', { timeout: 6000 }).catch(() => undefined);
      await page.click('#nextstep');
      await page.waitForSelector('#tiles', { timeout: 6000 }).catch(() => undefined);
      await page.click('header.top a[href="#/"]');
      await page.waitForSelector('.plan');
      check(
        'home: a session left at step 2 is offered to go on there, with what is done ticked',
        (await text(page, '#go')).includes('Go on at step 2') && (await page.locator('.plan li.done').count()) === 1 && (await page.locator('.plan li.cur').count()) === 1 && (await page.locator('#anew').count()) === 1,
        `${(await text(page, '#go')).replace(/\s+/g, ' ')} · ${await page.locator('.plan li.done').count()} done · ${await text(page, 'h1')}`,
      );
      check('pages: each has its own title', (await page.title()) === 'Today · Noise Floor', await page.title());
      await page.keyboard.press('Space');
      await page.waitForSelector('#tiles', { timeout: 6000 }).catch(() => undefined);
      check('session: going on starts at the step it was left at', (await text(page, '#eb')).includes('Step 2 of 4'), await text(page, '#eb'));
      await page.click('header.top a[href="#/"]');
      await page.waitForSelector('#anew');
      await page.click('#anew');
      await page.waitForSelector('#strings', { timeout: 6000 }).catch(() => undefined);
      check('session: it can also be begun again from step 1', (await text(page, '#eb')).includes('Step 1 of 4'), await text(page, '#eb'));
      await page.goto(base + '?autostart#/');
      await page.waitForSelector('#go');
      // today's session was taken to its end before: begun again and left at step 1, the day still counts as done
      check('home: begun again and left at step 1, the day still counts as done, with playing on offered', (await text(page, '#go')).includes('Keep playing') && (await page.locator('.plan li.done').count()) >= 1, (await text(page, '#go')).replace(/\s+/g, ' '));

      // the change, taught before it is drilled: first without a clock, then one calm minute (the focus of a day, or on its own)
      await page.goto(base + '?autostart#/change/Em/Am');
      await page.waitForSelector('#boxa', { timeout: 8000 });
      check('change: first made without a clock, with both shapes on show', (await text(page, '#eb')).includes('first without a clock') && (await text(page, '#h1')).startsWith('Strum ') && (await page.locator('#boxa circle').count()) >= 2 && (await page.locator('#boxb circle').count()) >= 2, `${await text(page, '#eb')} | ${await text(page, '#h1')}`);
      await page.keyboard.press('n');
      await page.waitForFunction(() => document.querySelector('#h1')?.textContent?.startsWith('Change to'), null, { timeout: 4000 }).catch(() => undefined);
      check('change: at the change it says how it is made', /(stay|keep their shape|No finger stays)/.test(await text(page, '#tip')), (await text(page, '#tip')).replace(/\s+/g, ' '));
      await page.screenshot({ path: resolve(out, 'session-change.png') });
      for (let i = 0; i < 8 && !(await text(page, '#eb')).includes('one calm minute'); i++) {
        await page.keyboard.press('n');
        await page.waitForTimeout(900);
      }
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('n');
        await page.waitForTimeout(900);
      }
      check('change: then one calm minute counts the clean changes', (await text(page, '#eb')).includes('one calm minute') && /^[2-9] changes/.test(await text(page, '#big')), `${await text(page, '#eb')} | ${await text(page, '#big')}`);
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      check('change: a minute cut short is not taken for a measurement', (await text(page, '#tip')).includes('Too short to measure'), (await text(page, '#tip')).replace(/\s+/g, ' '));

      await page.goto(base + '?autostart#/chord/F%23m');
      await page.waitForSelector('#tiles');
      await page.waitForTimeout(600);
      for (let i = 1; i <= 3; i++) await pressUntil(page, 'n', '#tiles .tile.clean', i);
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);
      check('chord check: the left arrow goes back a string', (await page.locator('#tiles .tile.clean').count()) === 2 && (await text(page, '#eb')).includes('string 3 of 6'), await text(page, '#eb'));
      await pressUntil(page, 'n', '#tiles .tile.clean', 3);
      await pressUntil(page, 'm', '#tiles .tile.muted', 1);
      check('chord check: a muted G string is called muted', (await text(page, '#h1')).includes('G is muted'), await text(page, '#h1'));
      await page.screenshot({ path: resolve(out, 'chord-muted.png') });
      await pressUntil(page, 'b', '#tiles .tile.buzz', 1);
      check('chord check: a buzzing G string is called buzzing', (await text(page, '#h1')).includes('G buzzes'), await text(page, '#h1'));
      for (let i = 4; i <= 6; i++) await pressUntil(page, 'n', '#tiles .tile.clean', i);
      // the result of the last string may still be on its way: wait for it instead of guessing a delay
      await page.waitForFunction(() => document.querySelector('#h1')?.textContent?.includes('Every string rings clean'), null, { timeout: 4000 }).catch(() => undefined);
      check('chord check: six clean strings finish the chord', (await text(page, '#h1')).includes('Every string rings clean'), `${await text(page, '#h1')} | ${(await text(page, '#tiles')).replace(/\s+/g, ' ')}`);
      await page.screenshot({ path: resolve(out, 'chord-done.png') });

      // a chord that already rings is asked for from memory: no picture until it is asked for
      // Am played clean and quickly once (a level of two or more) ...
      await page.goto(base + '?autostart#/chord/Am');
      await page.waitForSelector('#tiles');
      await page.waitForTimeout(400);
      for (let i = 1; i <= 5; i++) await pressUntil(page, 'n', '#tiles .tile.clean', i);
      await page.waitForFunction(() => /rings clean/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => undefined);
      // ... is asked for from memory the next time (the same address again would not open the page anew)
      await page.goto(base + '?autostart#/songs');
      await page.waitForTimeout(300);
      await page.goto(base + '?autostart#/chord/Am');
      await page.waitForSelector('#tiles');
      const hidden = (await text(page, '#tip')).startsWith('From memory') && (await page.locator('#box circle[fill]:not([fill="none"])').count()) === 0;
      await page.keyboard.press('s');
      await page.waitForTimeout(200);
      check('chord check: a chord that already rings is asked for from memory, and S shows its shape', hidden && (await text(page, '#tip')).startsWith('How to hold Am') && (await page.locator('#box circle[fill]:not([fill="none"])').count()) >= 3, (await text(page, '#tip')).slice(0, 60));

      // playing along with the click: one line, then two lines in a row at full speed
      const playAlong = async (count: number, sign = true): Promise<void> => {
        // a lesson with the click starts nothing before the sign: Space gives it, once the lesson opened waits for it
        if (sign && (await page.waitForSelector('#app[data-armed]', { timeout: 4000 }).then(() => true).catch(() => false))) await page.keyboard.press('Space');
        for (let i = 0; i < count; i++) {
          await page.waitForFunction((n) => Number((document.querySelector('#app') as HTMLElement).dataset.step ?? -1) >= n, i, { timeout: 15000 });
          await page.keyboard.press('n');
        }
      };
      const hits = async (): Promise<number> => Number(/(\d+) of \d+ on the click/.exec(await text(page, '#fbk'))?.[1] ?? -1);
      await page.goto(base + '?autostart#/song/scarborough-fair/2');
      await page.waitForSelector('#rowA');
      await page.waitForTimeout(1500);
      const waiting = { h1: await text(page, '#h1'), armed: await page.locator('#app[data-armed]').count(), step: await page.evaluate(() => (document.querySelector('#app') as HTMLElement).dataset.step ?? 'none') };
      check('play along: the second rung starts nothing by itself: it waits for the first note of the line', /^Play \S+ to start\.$/.test(waiting.h1) && waiting.armed === 1 && waiting.step === 'none' && (await page.getAttribute('#st1', 'aria-pressed')) === 'true', JSON.stringify(waiting));
      // the first note, played, is the sign: the click counts in
      await pressUntilText(page, 'n', '#h1', 'Get ready');
      check('play along: the first note played starts the count-in', (await text(page, '#h1')).includes('Get ready') && !(await page.locator('#app[data-armed]').count()), `${await text(page, '#h1')} | ${await text(page, '#eb')}`);
      await playAlong(12, false);
      await page.waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('on the click'), null, { timeout: 8000 }).catch(() => undefined);
      check('play along: twelve notes played with the marker are on the click', (await hits()) >= 11, await text(page, '#fbk'));
      await page.screenshot({ path: resolve(out, 'click-line.png') });

      // with the click, a take that fell apart is followed by the bar where it did, alone
      // (opened anew: the line before may sit and wait, and the same address again would leave it so)
      await page.goto(base + '?autostart#/songs');
      await page.waitForSelector('#list li');
      await page.goto(base + '?autostart#/song/scarborough-fair/2');
      await page.waitForSelector('#app[data-armed]', { timeout: 4000 }).catch(() => undefined);
      await page.keyboard.press('Space');
      const oneBar = await page
        .waitForFunction(() => /^Only bar \d+ this time/.test(document.querySelector('#fbk')?.textContent ?? ''), null, { timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      check('play along: after a take that fell apart, the bar where it did is played alone', oneBar, await text(page, '#fbk'));

      // the check at the end of a stage takes its chords in a row, from memory
      await page.goto(base + '?autostart#/chord/check/Em/Am');
      await page.waitForSelector('#tiles');
      check('stage check: several chords in a row, without their pictures', (await text(page, '#eb')).includes('Chord 1 of 2') && (await text(page, '#tip')).startsWith('From memory'), `${await text(page, '#eb')} | ${(await text(page, '#tip')).slice(0, 40)}`);

      await page.goto(base + '?autostart#/song/scarborough-fair/3');
      await page.waitForSelector('#rowA');
      // from the last line but one, so that the take is two lines long
      for (let i = 0; i < 8 && !(await text(page, '#where')).includes('Line 3 of 4'); i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(150);
      }
      await page.waitForFunction(() => (document.querySelector('#app') as HTMLElement).dataset.step === '-1', null, { timeout: 5000 }).catch(() => undefined);
      check('full speed: shows the line being played and the next one, without the fretboard', (await page.locator('#rowB text').count()) > 6 && (await page.locator('#hands').isHidden()), `${await page.locator('#rowB text').count()} marks in the second row`);
      await playAlong(6);
      await page.screenshot({ path: resolve(out, 'click-full.png') });
      for (let i = 6; i < 24; i++) {
        await page.waitForFunction((n) => Number((document.querySelector('#app') as HTMLElement).dataset.step ?? -1) >= n, i, { timeout: 15000 });
        await page.keyboard.press('n');
      }
      await page.waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('on the click'), null, { timeout: 8000 }).catch(() => undefined);
      check('full speed: two lines in a row at 100%', (await hits()) >= 21 && (await text(page, '#fbk')).includes('at 100%'), await text(page, '#fbk'));

      // a strummed song, in wait mode
      await page.goto(base + '?autostart#/song/four-chords/1');
      await page.waitForSelector('#rowA');
      // hearing the line first: the app plays it, and does not take its own playing for the player's
      await page.keyboard.press('h');
      await page.waitForTimeout(700);
      check('lesson: the line can be heard before it is played, and the model does not count as playing', (await text(page, '#fbk')).startsWith('Listen') && (await text(page, '#h1')).includes('Strum A'), `${await text(page, '#fbk')} | ${await text(page, '#h1')}`);
      await page.keyboard.press('r');
      check('strummed song: asks for a strum and shows the chord', (await text(page, '#h1')).includes('Strum A') && (await page.locator('#cbox circle').count()) >= 3, await text(page, '#h1'));
      await page.waitForTimeout(600);
      // a hit on dead strings is not a strum, and the lesson says what it was
      // (once the notes of the check before have died away: a hit that only stops them is not a dead strum)
      await page.waitForTimeout(2400);
      await page.keyboard.press('x');
      const dead = await page
        .waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('dead'), null, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      check('strummed song: a hit on dead strings is called dead, not taken for the chord', dead && (await text(page, '#h1')).includes('Strum A'), await text(page, '#fbk'));
      await press(page, 'n', 4, 900);
      check('strummed song: after four strums of A it asks for the change to F♯m', /Change to F♯m/.test(await text(page, '#h1')), await text(page, '#h1'));
      await page.screenshot({ path: resolve(out, 'strum-song.png') });
      await press(page, 'n', 4, 900);
      await page.waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('of full speed'), null, { timeout: 5000 }).catch(() => undefined);
      check('strummed song: the line is finished and measured', (await text(page, '#fbk')).includes('of full speed'), await text(page, '#fbk'));

      // your own song from a tab
      await page.goto(base + '?autostart#/import');
      await page.waitForSelector('#src');
      await page.click('#example');
      check('import: the example tab is read', /Found 14 notes in 2 bars/.test(await text(page, '#found')) && (await page.locator('#preview text').count()) > 6, await text(page, '#found'));
      await page.fill('#title', 'Check song');
      await page.screenshot({ path: resolve(out, 'import.png') });
      await page.click('#save');
      await page.waitForSelector('#rowA');
      check('import: the new song opens as a lesson, its title the way out to its page', (await text(page, 'header.top a')).includes('Check song') && /^#\/songs\/.+/.test((await page.getAttribute('header.top a', 'href')) ?? '') && (await text(page, '#h1')).includes('together'), `${await text(page, 'header.top a')} | ${await text(page, '#h1')}`);
      await page.keyboard.press('n');
      await page.waitForTimeout(500);
      check('import: its first step is heard', (await text(page, '#fbk')).includes('right'), await text(page, '#fbk'));
      await page.goto(base + '?autostart#/songs');
      await page.waitForSelector('.lib');
      const rows = (): Promise<number> => page.locator('.lib li:not(.sep)').count();
      // the list opens on the level of the song that is being learned; "All" shows every song
      const levels = (await page.locator('[data-level] small').allInnerTexts()).map(Number);
      // the riffs, power chords and picking patterns are in the list too, none of them hard: the share is the book's
      const book = SONGS.length - EXERCISES().length;
      check('songs: the songbook has some seventy songs free of copyright, every level with a fair share of them', levels[0] === SONGS.length + 1 && book >= 65 && Math.min(...levels.slice(1)) >= (book + 1) / 7 && (await rows()) < levels[0], `all ${levels[0]} (${book} of the book), levels ${levels.slice(1).join(' / ')}, ${await rows()} shown at first`);
      await page.click('[data-level="0"]');
      check('songs: the list has the built-in songs and the new one', (await rows()) === SONGS.length + 1 && (await text(page, '.lib')).includes('Check song'), `${await rows()} songs`);
      check('songs: every song says how hard it is and why, and which of its chords already ring', (await page.locator('.lib .grade').count()) === SONGS.length + 1 && (await text(page, '.lib')).includes('Basic version') && (await text(page, '.lib')).includes('Open chords only') && /You know (all )?\d of its/.test(await text(page, '.lib')) && /hard/i.test(await text(page, '.lib li:last-child .grade')), (await text(page, '.lib li:last-child')).replace(/\s+/g, ' ').slice(0, 160));
      await page.screenshot({ path: resolve(out, 'songs.png') });
      await page.fill('#q', 'scarborough');
      check('songs: a search finds a song by its name, whatever its level', (await rows()) >= 1 && (await text(page, '.lib')).includes('Scarborough Fair'), (await page.locator('.lib li:not(.sep) b:first-child').allInnerTexts()).join(' | '));
      // a song in the list opens its page first: hear it, what it asks, the way through it
      await page.fill('#q', 'amazing grace');
      await page.locator('.lib li:not(.sep)', { hasText: 'Amazing Grace (chords)' }).first().click();
      await page.waitForSelector('.songp', { timeout: 5000 }).catch(() => undefined);
      const songPageAt = await page.evaluate(() => location.hash);
      check('song page: a song in the list opens its page, with hearing it, what it asks and the way through it', songPageAt === '#/songs/amazing-grace-chords' && (await page.locator('.songp .paper').count()) === 4 && (await page.locator('.sp-chord').count()) === 4 && (await page.locator('.sp-l').count()) === 4, `${songPageAt}, ${await page.locator('.songp .paper').count()} sheets`);
      // hearing it: the tune over the chords, the words of each bar lighting up as it is played (the second bar after
      // the upbeat and the first bar, some 3.2 to 5.4 s in), and the first verse of the five lit in the form
      await page.click('#sp-play');
      await page.waitForTimeout(4300);
      const lit = await page.evaluate(() => ({ now: document.querySelectorAll('.sp-w s.now').length, sung: document.querySelectorAll('.sp-w s.sung').length, bar: (document.querySelector('.sp-c.on') as HTMLElement | null)?.dataset.bar ?? '', part: document.querySelector('.sp-fp.on')?.textContent ?? '', parts: document.querySelectorAll('.sp-fp').length }));
      check('song page: playing the song lights up its words and chords as they come, and the verse in the whole form', lit.now === 1 && lit.sung >= 1 && lit.bar === '1' && lit.part === 'Verse 1' && lit.parts === 5, JSON.stringify(lit));
      await page.click('#sp-play');
      await page.screenshot({ path: resolve(out, 'song-page.png'), fullPage: true });
      // a song without words has its tune written for it (Tom Dooley); one with no tune at all (the four-chord
      // exercise) says so, and offers a recording to search for
      await page.goto(base + '?autostart#/songs/tom-dooley');
      await page.waitForSelector('.songp');
      check('song page: a song without words is heard with its tune too', (await page.locator('#sp-tune').count()) === 1 && (await text(page, '.sp-listen .note')).includes('tune and the chords'), await text(page, '.sp-listen .note'));
      await page.goto(base + '?autostart#/songs/four-chords');
      await page.waitForSelector('.songp');
      check('song page: without a tune it says so, plays the chords, and offers a recording to search for', (await text(page, '.sp-note')).includes('no tune for this song yet') && (await page.locator('.sp-note a[target="_blank"][rel~="noopener"]').count()) === 1 && (await page.locator('#sp-tune').count()) === 0, await text(page, '.sp-note'));
      await page.click('#sp-start');
      await page.waitForFunction(() => location.hash.startsWith('#/song/four-chords'), null, { timeout: 4000 }).catch(() => undefined);
      check('song page: its button opens the lesson', (await page.evaluate(() => location.hash)).startsWith('#/song/four-chords'), await page.evaluate(() => location.hash));
      // a whole song: its form as chips, the parts named over their lines, its real length, and the words of any time round
      await page.goto(base + '?autostart#/songs/whiskey-in-the-jar');
      await page.waitForSelector('.sp-fp');
      const form = await page.evaluate(() => ({ chips: [...document.querySelectorAll('.sp-fp')].map((b) => b.textContent), heads: [...document.querySelectorAll('.sp-pt')].map((h) => h.textContent), time: document.querySelector('#sp-time')?.textContent ?? '', first: document.querySelector('.sp-w[data-b="0"]')?.textContent ?? '' }));
      check('song page: a whole song shows its form, its parts and its length with every verse', form.chips.join() === 'Verse 1,Chorus,Verse 2,Chorus,Verse 3,Chorus,Verse 4,Chorus' && form.heads.join() === 'Verse,Chorus' && /\/ 3:\d\d$/.test(form.time) && form.first === 'As I was a walking', JSON.stringify(form));
      await page.click('.sp-fp[data-k="2"]');
      check('song page: a chip of the form shows that verse\'s words under the chords', (await text(page, '.sp-w[data-b="0"]')) === "It's when I got the" && (await page.getAttribute('.sp-fp[data-k="2"]', 'aria-pressed')) === 'true', await text(page, '.sp-w[data-b="0"]'));
      // any song from its chord sheet: pasted, read as parts and the whole song, saved, its page opened
      await page.goto(base + '?autostart#/import/sheet');
      await page.waitForSelector('#sheet');
      await page.click('#example');
      const sheet = await page.evaluate(() => ({ found: document.querySelector('#found')?.textContent ?? '', parts: [...document.querySelectorAll('.cs-part h3')].map((h) => h.textContent), chords: document.querySelector('.cs-line .cs-bar b')?.textContent ?? '', local: document.querySelector('.cs-head')?.textContent?.includes('stays on this computer') }));
      check('chord sheet: the example is read as verses and choruses, chords over words, and it says it stays here', sheet.found.includes('2 parts, sung 4 times round') && sheet.parts.join() === 'Verse 1,Chorus,Verse 2,Chorus' && sheet.chords === 'G' && !!sheet.local, JSON.stringify(sheet));
      await page.fill('#sheet', '[Verse]\nEb        Bb\nOh blow ye winds\n[Chorus]\nCmaj9 G/B\nBring back');
      check('chord sheet: chords the app has no shape for are named, with a transposition that plays them all; others are simplified', /no shape for Eb/.test(await text(page, '#found')) && (await page.locator('#moveit').count()) === 1 && /Cmaj9 → Cmaj7/.test(await text(page, '#found')), await text(page, '#found'));
      await page.click('#example');
      await page.fill('#title', 'Sheet check');
      await page.click('#save');
      await page.waitForSelector('.songp', { timeout: 5000 }).catch(() => undefined);
      check('chord sheet: saved, it is one of your own songs and its page opens with its form', /^#\/songs\/my-/.test(await page.evaluate(() => location.hash)) && (await text(page, '.sp-head h1')) === 'Sheet check' && (await page.locator('.sp-fp').count()) === 4, `${await page.evaluate(() => location.hash)} ${await text(page, '.sp-head h1')}`);
      // taken out again, so that the list below counts the book and the song from the tab
      await page.goto(base + '?autostart#/songs');
      await page.waitForSelector('.lib');
      await page.fill('#q', 'sheet check');
      await page.click('[data-del]');
      await page.click('[data-del]');
      await page.waitForFunction(() => !document.querySelector('[data-del]'), null, { timeout: 4000 }).catch(() => undefined);
      await page.fill('#q', '');
      await page.goto(base + '?autostart#/songs');
      await page.waitForSelector('.lib');
      await page.fill('#q', 'scarborough');
      await page.fill('#q', 'spiritual');
      const spirituals = await rows();
      await page.fill('#q', 'd7');
      const withChord = await rows();
      check('songs: a search also finds songs by who made them and by a chord', spirituals >= 8 && withChord >= 8 && withChord < 60, `${spirituals} spirituals, ${withChord} with D7`);
      await page.fill('#q', '');
      await page.selectOption('#kindsel', 'melody');
      check('songs: the list can be narrowed to tunes on single strings, the riffs and the pentatonic among them', (await rows()) >= 28 && (await rows()) <= 40 && (await text(page, '.lib')).includes('Greensleeves') && (await text(page, '.lib')).includes('Riff 1') && !(await text(page, '.lib')).includes('Skip to My Lou'), `${await rows()} tunes`);
      await page.selectOption('#kindsel', '');
      await page.fill('#q', 'check song');
      await page.click('[data-del]');
      await page.click('[data-del]');
      await page.waitForFunction(() => !document.querySelector('[data-del]'), null, { timeout: 4000 }).catch(() => undefined);
      await page.fill('#q', '');
      await page.click('[data-level="0"]');
      check('songs: a song of your own can be removed again', (await rows()) === SONGS.length, `${await rows()} songs`);

      // a song from the songbook: two chords to the bar, then a strumming pattern with upstrokes
      await page.goto(base + '?autostart#/song/swing-low/1');
      await page.waitForSelector('#rowA');
      const names = await page.locator('#rowA .chn').allTextContents();
      check('songbook: a strummed song names every chord where it begins, and who the song is by', names.join(' ').startsWith('D G D') && (await text(page, '#where')).includes('Spiritual') && /chorus/i.test(await text(page, '#where')) && (await text(page, '#h1')).includes('Strum D'), `${names.join(' ')} | ${await text(page, '#where')} | ${await text(page, '#h1')}`);
      // the first bar is D four times; the second is G twice, then D twice
      await press(page, 'n', 3, 500);
      await pressUntilText(page, 'n', '#h1', 'Change to G');
      await pressUntilText(page, 'n', '#h1', 'Strum G');
      await pressUntilText(page, 'n', '#h1', 'Change to D');
      check('songbook: the second chord of a bar is asked for when its turn comes', (await text(page, '#h1')).includes('Change to D'), await text(page, '#h1'));
      await page.goto(base + '?autostart#/song/loch-lomond/1');
      await page.waitForSelector('#rowA');
      await page.waitForTimeout(400);
      // down, down, then the first upstroke
      await press(page, 'n', 1, 500);
      await pressUntilText(page, 'n', '#h1', 'on the way back up');
      check('songbook: an upstroke is said to be one', (await text(page, '#h1')).includes('on the way back up') && (await text(page, '#sub')).includes('upstroke'), `${await text(page, '#h1')} | ${await text(page, '#sub')}`);
      await page.screenshot({ path: resolve(out, 'song-pattern.png') });
      // a barre chord up the neck is drawn from its own fret, with the fret named
      await page.goto(base + '?autostart#/chord/C%23m');
      await page.waitForSelector('#eb');
      await page.waitForTimeout(400);
      check('songbook: a chord shape above the fifth fret is shown from its lowest fret', (await text(page, '#app')).includes('4fr'), (await text(page, 'h1')).slice(0, 80));

      await page.goto(base + '?autostart#/tuner/any');
      await page.waitForSelector('#note');
      await page.screenshot({ path: resolve(out, 'tuner-any.png') });

      // introductions: before a step is asked for the first time, the app says what it is and shows how
      await page.goto(base + '?autostart&intros#/chord/Em');
      await page.waitForSelector('#pts');
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('#h1')?.textContent === 'How to read a chord picture', null, { timeout: 3000 }).catch(() => undefined);
      check('basics: before the first chord check come what a chord is and how to read a chord picture', (await text(page, '#h1')) === 'How to read a chord picture' && (await page.locator('#pts li').count()) === 4 && (await page.locator('#art circle').count()) >= 3, await text(page, '#h1'));
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('#h1')?.textContent === 'How to press a string', null, { timeout: 3000 }).catch(() => undefined);
      await page.keyboard.press('Space');
      await page.waitForSelector('#tiles', { timeout: 4000 }).catch(() => undefined);
      check('basics: after the introductions the step itself begins, and they are not shown again', (await text(page, '#h1')).includes('Hold Em'), await text(page, '#h1'));
      await page.goto(base + '?autostart&intros#/change/Em/Am');
      await page.waitForSelector('#try');
      await page.waitForTimeout(500);
      await pressUntilText(page, 'n', '#try', 'heard 1 of 4');
      check('basics: how to strum comes with something to try, and the app hears it', (await text(page, '#h1')) === 'How to strum' && (await text(page, '#try')).includes('heard 1 of 4'), (await text(page, '#try')).replace(/\s+/g, ' '));
      await page.goto(base + '?autostart#/basics');
      await page.waitForSelector('#leaf h2');
      const toc = (): Promise<string[]> => page.locator('#toc [data-page] b').allInnerTexts();
      check(
        'basics: the handbook has every introduction of the guitar, in chapters and in the order to read them',
        (await toc()).length === 18 && (await toc())[0] === 'The guitar, and how to hold it' && (await toc()).includes('Hammer-on and pull-off') && (await toc()).includes('Sore fingertips, and practice in the head') && (await toc()).includes('Strumming patterns') && (await toc()).includes('Power chords') && (await toc()).includes('Playing by ear') && !(await toc()).includes('Finding the keys') && (await page.locator('#toc .chap').count()) === 8 && (await text(page, '#toc .chap >> nth=1')).includes('Chords'),
        `${(await toc()).length} pages in ${await page.locator('#toc .chap').count()} chapters`,
      );
      // it opens on a page, not on a list: the first one that has not been read, with its picture
      const opened = await text(page, '#ttl');
      const readBefore = await page.locator('#toc a.read').count();
      check('basics: the handbook opens on the first page that has not been read, with its picture and the way on', (await toc()).includes(opened) && (await page.locator('#leaf .pic svg *').count()) > 5 && (await page.locator('#leaf .points li').count()) >= 3 && /^next/i.test(await text(page, '#next')) && /\d+ of 18 read/.test(await text(page, '#meter')) && /comes up/i.test(await text(page, '#leaf .used')), `${opened} | ${await text(page, '#meter')} | ${await text(page, '#next')}`);
      const nextBox = await page.locator('#next').boundingBox();
      check('basics: the way on to the next page is in view without scrolling', !!nextBox && nextBox.y + nextBox.height <= 900, `Next ends at ${Math.round((nextBox?.y ?? 0) + (nextBox?.height ?? 0))} of 900`);
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction((was) => document.querySelector('#ttl')?.textContent !== was, opened, { timeout: 3000 }).catch(() => undefined);
      check('basics: turning the page marks the one before as read and opens the next, in the same place', (await text(page, '#ttl')) === (await toc())[(await toc()).indexOf(opened) + 1] && (await page.locator('#toc a.read').count()) === readBefore + 1 && page.url().includes('#/basics/') && (await page.locator('#toc a[aria-current]').count()) === 1, `${opened} → ${await text(page, '#ttl')}, ${await page.locator('#toc a.read').count()} read`);
      await page.click('#toc [data-page="chord"]');
      await page.waitForFunction(() => document.querySelector('#ttl')?.textContent === 'What a chord is', null, { timeout: 3000 }).catch(() => undefined);
      await page.click('#leaf .tryit a');
      await page.waitForSelector('#try');
      check('basics: a page with something to try leads to it, and from there back to the same page', (await text(page, '#h1')) === 'What a chord is' && (await page.locator('header.top a[href="#/basics/chord"]').count()) === 1, `${await text(page, '#eb')} | ${await text(page, '#h1')}`);
      await page.goto(base + '?autostart#/basics');
      await page.waitForSelector('#leaf h2');
      await pickInstrument(page, 'piano');
      await page.waitForFunction(() => document.querySelectorAll('#toc [data-page]').length === 14, null, { timeout: 3000 }).catch(() => undefined);
      check('basics: the piano has a handbook of its own, with chapters on chords and on what lies beyond five fingers', (await toc()).length === 16 && (await toc()).includes('Finding the keys') && (await toc()).includes('Both hands together: a bass under the melody') && (await toc()).includes('What a chord is, on the piano') && (await toc()).includes('Passing the thumb under') && (await toc()).includes('Broken chords') && !(await toc()).includes('How to strum') && (await page.locator('#toc .chap').count()) === 7 && (await page.locator('#toc .thumb').count()) === 16, `${(await toc()).length} pages in ${await page.locator('#toc .chap').count()} chapters`);
      await page.click('#toc [data-page="p-move"]');
      await page.waitForFunction(() => document.querySelector('#ttl')?.textContent === 'From chord to chord', null, { timeout: 3000 }).catch(() => undefined);
      check('basics: a page of the piano has its picture and says where it comes up', (await page.locator('#leaf .pic svg rect').count()) >= 15 && /chord changes on the piano/.test(await text(page, '#leaf .used')), await text(page, '#leaf .used'));
      await page.screenshot({ path: resolve(out, 'basics-piano.png') });
      await pickInstrument(page, 'guitar');
      await page.waitForFunction(() => document.querySelectorAll('#toc [data-page]').length === 13, null, { timeout: 3000 }).catch(() => undefined);

      // the rhythm game: stones in time with the click, the chord changing at every bar line
      await page.goto(base + '?autostart#/nf');
      await page.waitForSelector('.cards');
      const cardTops = await page.locator('.cards .card:not(.night-card):not(.free-card)').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      const bannerTops = await page.locator('.cards .night-card, .cards .free-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      const cardBottom = await page.locator('.cards .card').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
      const firstCard = (await page.locator('.cards .card').first().getAttribute('class')) ?? '';
      check(
        "games: tonight's night comes first, Freestyle beside it; the four games side by side below them, none of them below the fold",
        firstCard.includes('night-card') && /^The night of [A-Z][a-z]+ \d+$/.test(await text(page, '.night-card h2')) && bannerTops.length === 2 && new Set(bannerTops).size === 1 && cardTops.length === 4 && new Set(cardTops).size === 1 && cardTops[0] > bannerTops[0] && cardBottom <= 900 && (await text(page, '.cards')).includes('Stepping stones') && (await page.title()) === 'Games · Noise Floor',
        `${firstCard} · ${await text(page, '.night-card h2')} · ${cardTops.length} cards at y ${[...new Set(cardTops)].join(', ')}, bottom ${Math.round(cardBottom)} · ${await page.title()}`,
      );
      await page.goto(base + '?autostart#/stride/four');
      await page.waitForSelector('#brief');
      check('stepping stones: introduced with its two chords and how the bar is counted', (await text(page, '#brief h1')).startsWith('Keep the pulse') && (await page.locator('#brief .count b').count()) === 4 && (await page.locator('#brief .shapes figure').count()) === 2, await text(page, '#brief h1'));
      await page.keyboard.press('Space');
      await page.waitForSelector('#play');
      for (let i = 0; i < 10; i++) {
        await page.waitForFunction((n) => Number((document.querySelector('#app') as HTMLElement).dataset.step ?? -1) >= n, i, { timeout: 15000 }).catch(() => undefined);
        await page.keyboard.press('n');
      }
      await page.waitForTimeout(500);
      const inTime = Number(await text(page, '#hits'));
      check('stepping stones: strums that land with the wanderer count as in time, across a change of chord', inTime >= 8, `${inTime} of 10`);
      const land = await page.evaluate(() => {
        const c = document.querySelector('#play') as HTMLCanvasElement | null;
        if (!c) return 'no canvas';
        const ctx = c.getContext('2d')!;
        const tones = new Set<string>();
        for (let i = 1; i < 12; i++) {
          for (let j = 1; j < 6; j++) {
            const d = ctx.getImageData(Math.floor((c.width * i) / 12), Math.floor((c.height * j) / 12), 1, 1).data;
            tones.add(`${d[0] >> 4},${d[1] >> 4},${d[2] >> 4}`);
          }
        }
        return `${Math.round(c.getBoundingClientRect().width)} of ${innerWidth} wide, ${tones.size} tones`;
      });
      check('stepping stones: is walked through a painted land that fills the window', /^(\d+) of \1 wide, (\d+) tones$/.test(land) && Number(land.split(', ')[1].split(' ')[0]) >= 12 && (await text(page, '#run')).includes('in a row'), `${land} | ${await text(page, '#run')}`);
      await page.screenshot({ path: resolve(out, 'stride.png') });
      await page.keyboard.press('Space');
      const walked = await page
        .waitForFunction(() => /stones in time/.test(document.querySelector('#mid h1')?.textContent ?? ''), null, { timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      check('stepping stones: ends with how many were in time and how early or late', walked && /(early|late|on the beat)/.test(await text(page, '#mid .lede')), `${await text(page, '#mid h1')} | ${await text(page, '#mid .lede')}`);

      await page.goto(base + '?autostart#/nf');
      await page.waitForSelector('.cards');
      await page.screenshot({ path: resolve(out, 'nf-start.png') });

      for (const [type, gap, n] of [
        ['song', 1100, 14],
        ['fingers', 380, 22],
        ['changes', 1100, 14],
      ] as const) {
        await page.goto(base + `?autostart#/run/${type}`);
        await startRun(page);
        if (type === 'fingers') await page.screenshot({ path: resolve(out, 'run-fingers-start.png') });
        await press(page, 'n', n, gap);
        const score = Number((await text(page, '#score')).replace(/,/g, ''));
        check(`run ${type}: playing the locked phrase scores and clears noise`, score >= 300, `score ${score}, mult ${await text(page, '#mult')}`);
        await page.screenshot({ path: resolve(out, `run-${type}.png`) });
      }

      // pausing by hitting the muted strings twice (still in the changes run)
      await page.keyboard.press('x');
      await page.waitForTimeout(350);
      await page.keyboard.press('x');
      const paused = await page
        .waitForFunction(() => document.querySelector('#pause')?.getAttribute('aria-pressed') === 'true', null, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      check('run: two hits on muted strings pause it', paused, await text(page, '#pause'));
      await page.screenshot({ path: resolve(out, 'run-paused.png') });
      await page.keyboard.press('x');
      await page.waitForTimeout(350);
      await page.keyboard.press('x');
      const resumed = await page
        .waitForFunction(() => document.querySelector('#pause')?.getAttribute('aria-pressed') === 'false', null, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      check('run: two more start it again', resumed, await text(page, '#pause'));

      /** Plays until the run shows something else than the arena, e.g. the upgrade cards or the boss. */
      const playUntil = async (selector: string, gap: number, limit = 70): Promise<boolean> => {
        for (let i = 0; i < limit; i++) {
          if (await page.locator(selector).count()) return true;
          await page.keyboard.press('n');
          await page.waitForTimeout(gap);
        }
        return (await page.locator(selector).count()) > 0;
      };
      const points = async (): Promise<number> => Number((await text(page, '#score')).replace(/,/g, ''));
      const scene = async (key: string): Promise<string> => page.evaluate((k) => (document.querySelector('#scene') as HTMLElement | null)?.dataset[k] ?? '', key);

      // tonight's night: opened with Space from the Games page, explained in one line, played on the groove
      await page.goto(base + '?autostart#/nf');
      await page.waitForSelector('.night-card');
      await page.keyboard.press('Space');
      await page.waitForSelector('#brief', { timeout: 8000 });
      const nightKick = await text(page, '#brief .kick');
      check("night: Space on the Games page opens tonight's night, which says in one line what to do and names its rule", page.url().endsWith('#/night') && (await text(page, '#brief h1')) === 'Play the chord on a piece to strike it.' && /^THE NIGHT OF [A-Z]+ \d+ · \S/.test(nightKick) && (await page.locator('#brief .lede').count()) === 1, `${page.url().split('#')[1]} · ${nightKick} · ${await text(page, '#brief .lede')}`);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => Number((document.querySelector('#scene') as HTMLElement | null)?.dataset.pieces ?? 0) >= 1, null, { timeout: 4000 }).catch(() => undefined);
      const firstPiece = await scene('next');
      await page.waitForFunction(() => (document.querySelector('#mid') as HTMLElement | null)?.dataset.gate === 'go', null, { timeout: 8000 }).catch(() => undefined);
      await press(page, 'n', 12, 800);
      // what is read while playing: the words outside the picture, the drawings and the practice keys left out
      const words = await page.evaluate(() => {
        const copy = document.querySelector('#app')!.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('canvas, svg, .practice, [hidden]').forEach((e) => e.remove());
        document.body.append(copy);
        const said = copy.innerText;
        copy.remove();
        return said.split(/\s+/).filter((w) => /[A-Za-zÄÖÜäöü]/.test(w));
      });
      await page.screenshot({ path: resolve(out, 'night.png') });
      check('night: struck pieces score, and a chain of clean hits brings in the band layer by layer', (await points()) >= 300 && Number(await scene('level')) >= 1 && (await page.locator('.night-row.on').count()) >= 2, `score ${await points()}, band level ${await scene('level')}, ${await page.locator('.night-row.on').count()} layers on`);
      check('night: while it is played, the screen has only a few words on it', words.length <= 20, `${words.length}: ${words.join(' ')}`);
      // the same night again, later the same day: its rule and its first piece (from another page, or the
      // address would not change and nothing would open again)
      await page.goto(base + '?autostart#/nf');
      await page.waitForSelector('.night-card');
      await page.goto(base + '?autostart#/night');
      await page.waitForSelector('#brief', { timeout: 8000 });
      const kickAgain = await text(page, '#brief .kick');
      await page.keyboard.press('Space');
      await page.waitForFunction(() => Number((document.querySelector('#scene') as HTMLElement | null)?.dataset.pieces ?? 0) >= 1, null, { timeout: 4000 }).catch(() => undefined);
      const firstAgain = await scene('next');
      check('night: the same all day: a second visit has the same rule and the same first piece', kickAgain === nightKick && firstPiece !== '' && firstAgain === firstPiece, `${nightKick} / ${kickAgain} · ${firstPiece} / ${firstAgain}`);

      // a changes run of one wave on the groove, played to its end: the Mute, then one sentence and three gains
      await page.goto(base + '?autostart#/run/changes/1');
      await startRun(page);
      check('changes run: the Mute comes after its one wave on the groove', await playUntil('#btiles', 700, 80), `${await text(page, '#ttl')}`);
      await page.waitForTimeout(700);
      const seals = await page.locator('#btiles .tile').count();
      for (let i = 1; i <= seals; i++) await pressUntil(page, 'n', '#btiles .tile.clean', i, '#rerun');
      await page.waitForSelector('#rerun', { timeout: 8000 }).catch(() => undefined);
      await page.screenshot({ path: resolve(out, 'changes-end.png') });
      check('changes run: ends in one sentence, three gains as sentences, Again and Go on, and the table behind Details', /^The light held: [\d,]+ points\.$/.test(await text(page, '.night-end h1')) && (await page.locator('.night-gains li').count()) === 3 && (await page.locator('#rerun').count()) === 1 && (await page.locator('#onward').count()) === 1 && (await page.locator('.night-more[open]').count()) === 0 && ((await page.locator('.night-more tbody').textContent()) ?? '').includes(`${seals} of ${seals} strings`), `${await text(page, '.night-end h1')} | ${(await page.locator('.night-gains').innerText().catch(() => '')).replace(/\s+/g, ' ')}`);

      // a one-wave run, so that the boss is reached: the small F♯m, four strings
      await page.goto(base + '?autostart#/run/fingers/1');
      await page.waitForSelector('#brief');
      await page.screenshot({ path: resolve(out, 'brief-fingers.png') });
      await startRun(page);
      check('guitar boss: appears after the last wave', await playUntil('#boss', 330), await text(page, '.hud .k'));
      await page.waitForTimeout(700);
      const segments = await page.locator('#btiles .tile').count();
      check('guitar boss: is a barre chord, string by string', /^Hold (F♯m|Bm)( \(small\))?\. Pluck the/.test(await text(page, '#bh1')) && (segments === 4 || segments === 5 || segments === 6), `${await text(page, '#bh1')} · ${segments} segments`);
      await page.screenshot({ path: resolve(out, 'boss-guitar.png') });
      for (let i = 1; i <= segments; i++) await pressUntil(page, 'n', '#btiles .tile.clean', i, '#rerun');
      await page.waitForSelector('#rerun', { timeout: 6000 }).catch(() => undefined);
      check('guitar boss: every string clean wins the run', ((await page.locator('tbody').first().textContent()) ?? '').includes(`${segments} of ${segments} strings`) && /^The light held/.test(await text(page, '#mid h1')), (await text(page, '#mid h1')).slice(0, 60));
      await page.screenshot({ path: resolve(out, 'debrief.png') });

      // upgrades: the run must still hear you after one was chosen
      await page.goto(base + '?autostart#/run/fingers');
      await startRun(page);
      // two dead notes and then playing on: that is not the pause gesture
      await page.keyboard.press('m');
      await page.waitForTimeout(300);
      await page.keyboard.press('m');
      await page.waitForTimeout(250);
      await page.keyboard.press('n');
      await page.waitForTimeout(900);
      check('run: two muffed notes in the middle of playing do not pause it', (await page.getAttribute('#pause', 'aria-pressed')) === 'false', await text(page, '#pause'));
      check('upgrades: three are offered after the first wave', (await playUntil('[data-perk]', 330)) && (await page.locator('[data-perk]').count()) === 3, `${await page.locator('[data-perk]').count()} cards`);
      await page.screenshot({ path: resolve(out, 'upgrades.png') });
      const before = await points();
      await page.keyboard.press('1');
      await page.waitForSelector('#con');
      await page.waitForTimeout(600);
      await press(page, 'n', 10, 380);
      check('upgrades: wave 2 goes on and still scores', (await points()) > before && (await text(page, '#wave')) === '2', `score ${before} → ${await points()}, wave ${await text(page, '#wave')}`);

      await page.goto(base + '?autostart#/');
      await page.waitForSelector('#go');
      await pickInstrument(page, 'guitar');
      await page.waitForFunction(() => document.querySelector('[data-inst="guitar"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 4000 }).catch(() => undefined);
      // a returning player strums the chords they know: what rings twice is taken as known
      await page.goto(base + '?autostart#/placement');
      await page.waitForSelector('.place-grid');
      for (let i = 0; i < 10 && (await page.locator('.place-chord.known').count()) < 3; i++) {
        await page.keyboard.press('n');
        await page.waitForTimeout(900);
      }
      check('placement: chords strummed and heard ringing are marked as known', (await page.locator('.place-chord.known').count()) >= 3, `${await page.locator('.place-chord.known').count()} known · ${await text(page, '#sub')}`);
      await page.screenshot({ path: resolve(out, 'placement.png') });
      await page.goto(base + '?autostart#/learn');
      await page.waitForSelector('#stage h2');
      const stops = await page.locator('.stop').count();
      check('learning path, guitar: a map with a stone for each stage, the sheet of the stage you are at open under it, the barre ladder beside it', stops === 6 && (await page.locator('.stop[aria-selected="true"]').count()) === 1 && /you are here/i.test(await text(page, '#stage .k')) && /\d+ of \d+/.test(await text(page, '#stage .prog')) && (await text(page, 'h1')) === 'The eight open chords ring clean' && (await skillStages(page)).includes('The barre ladder'), `${stops} stones · ${await text(page, 'h1')} · ${await text(page, '#stage .k')} · ${await text(page, '#stage .prog')}`);
      await page.click('#stop-open');
      await page.waitForFunction(() => document.querySelector('#stage h2')?.textContent?.includes('open chords'), null, { timeout: 3000 }).catch(() => undefined);
      check('learning path, guitar: chords that rang clean are marked done, with the measured value', (await page.locator('#stage .items li.done').count()) >= 2 && /s from cold/.test(await text(page, '#stage .items')), (await text(page, '#stage .items')).replace(/\s+/g, ' ').slice(0, 160));
      const wayPainted = await page.evaluate(() => {
        const c = document.querySelector('#waymap') as HTMLCanvasElement | null;
        if (!c) return 0;
        const ctx = c.getContext('2d')!;
        const tones = new Set<string>();
        for (let i = 1; i < 12; i++) for (let j = 1; j < 6; j++) tones.add(Array.from(ctx.getImageData(Math.floor((c.width * i) / 12), Math.floor((c.height * j) / 6), 1, 1).data.slice(0, 3), (v) => v >> 4).join());
        return tones.size;
      });
      await page.click('#stop-songs2');
      await page.waitForFunction(() => document.querySelector('#stage h2')?.textContent?.includes('Moderate'), null, { timeout: 3000 }).catch(() => undefined);
      check('learning path, guitar: the map is painted, and any stone on it opens its stage', wayPainted >= 12 && (await text(page, '#stage h2')).includes('Moderate songs') && (await page.locator('#stage .items li').count()) === 5 && (await text(page, '#stage .go')).includes('Go on with'), `${wayPainted} tones · ${await text(page, '#stage h2')} · ${await page.locator('#stage .items li').count()} songs`);
      await page.goto(base + '?autostart#/learn/7');
      await page.waitForSelector('.sklevel[data-stage="barre"]');
      await page.click('.sklevel[data-stage="barre"]');
      check('learning path, guitar: what runs beside the path opens the same way, from the skill it belongs to', /beside the path/i.test(await text(page, '#stage .k')) && (await text(page, '#stage h2')).includes('barre ladder'), await text(page, '#stage h2'));
      await page.screenshot({ path: resolve(out, 'learn.png'), fullPage: true });
      await page.goto(base + '?autostart#/progress');
      await page.waitForSelector('.measured');
      await page.screenshot({ path: resolve(out, 'progress.png'), fullPage: true });
      check('progress: the played skills were measured, each kind folded away under its name', (await page.locator('tbody tr').count()) >= 8 && (await page.locator('details.kind').count()) >= 3,`${await page.locator('tbody tr').count()} rows in ${await page.locator('details.kind').count()} kinds`);
      check('practice instrument: hardly any string had to be played twice to be heard', repeated() <= 2, `${repeated()} repeated`);
      check('practice instrument: no script errors', errors.length === 0, errors.join(' | '));
      await browser.close();
    }
  }],
  ['2p', async () => {
    // 2p. practice instrument path, piano: a browser of its own, so that it runs beside the guitar's
    {
      const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(() => {
        if (!localStorage.getItem('noise-floor/v1')) localStorage.setItem('noise-floor/v1', JSON.stringify({ settings: { a4: 440, buzz: 0.5, mic: false, practiceInstrument: true, strumSelect: true }, current: { guitar: 'scarborough-fair' } }));
      });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      const playAlong = async (count: number, sign = true): Promise<void> => {
        // a lesson with the click starts nothing before the sign: Space gives it, once the lesson opened waits for it
        if (sign && (await page.waitForSelector('#app[data-armed]', { timeout: 4000 }).then(() => true).catch(() => false))) await page.keyboard.press('Space');
        for (let i = 0; i < count; i++) {
          await page.waitForFunction((n) => Number((document.querySelector('#app') as HTMLElement).dataset.step ?? -1) >= n, i, { timeout: 15000 });
          await page.keyboard.press('n');
        }
      };
      const hits = async (): Promise<number> => Number(/(\d+) of \d+ on the click/.exec(await text(page, '#fbk'))?.[1] ?? -1);
      /** As on another day: what was done today no longer counts as done (the page is then opened anew to read it). */
      const newDay = (): Promise<void> =>
        page.evaluate(() => {
          const s = JSON.parse(localStorage.getItem('noise-floor/v1') ?? '{}');
          for (const k of Object.keys(s.progress ?? {})) if (k.startsWith('session:')) delete s.progress[k];
          localStorage.setItem('noise-floor/v1', JSON.stringify(s));
        });
      const playUntil = async (selector: string, gap: number, limit = 70): Promise<boolean> => {
        for (let i = 0; i < limit; i++) {
          if (await page.locator(selector).count()) return true;
          await page.keyboard.press('n');
          await page.waitForTimeout(gap);
        }
        return (await page.locator(selector).count()) > 0;
      };
      const points = async (): Promise<number> => Number((await text(page, '#score')).replace(/,/g, ''));

      // piano
      await page.goto(base + '?autostart#/piano/ode-to-joy');
      await page.waitForSelector('#rowA');
      await page.waitForTimeout(600);
      await press(page, 'n', 2, 500);
      await page.keyboard.press('w');
      await page.waitForTimeout(500);
      check('piano: a wrong key is named', (await text(page, '#fbk')).startsWith('Heard'), await text(page, '#fbk'));
      await page.screenshot({ path: resolve(out, 'piano.png') });
      await press(page, 'n', 6, 500);
      check('piano: the phrase is finished', (await text(page, '#fbk')).includes('of full speed'), await text(page, '#fbk'));

      await page.goto(base + '?autostart#/piano/twinkle/2');
      await page.waitForSelector('#rowA');
      await playAlong(7);
      await page.waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('on the click'), null, { timeout: 8000 }).catch(() => undefined);
      check('piano: a phrase played with the click is on the click', (await hits()) >= 6, await text(page, '#fbk'));
      await page.screenshot({ path: resolve(out, 'piano-click.png') });

      // the piano session from start to finish (the guitar's start page asks for a song of the week first)
      await page.goto(base + '?autostart#/');
      await page.waitForSelector('.nav details.inst');
      await pickInstrument(page, 'piano');
      await page.waitForFunction(() => document.querySelectorAll('.plan li').length === 4, null, { timeout: 4000 }).catch(() => undefined);
      check('piano home: its own steps, with playing by ear before the piece', (await page.locator('.plan li').count()) === 4 && (await text(page, '.plan')).includes('Match the app to your piano') && (await text(page, '.plan')).includes('By ear'), (await text(page, '.plan')).replace(/\s+/g, ' '));
      await page.screenshot({ path: resolve(out, 'home-piano.png') });
      await page.keyboard.press('Space');
      await page.waitForSelector('#kb');
      await page.waitForTimeout(500);
      await pressUntilText(page, 'w', '#msg', 'That was A♯4');
      // the practice instrument does not let go of a key: give the wrong one time to fade before the A is played
      await page.waitForTimeout(600);
      check('piano session: another key than the A is pointed out', (await text(page, '#msg')).includes('That was A♯4'), await text(page, '#msg'));
      await page.keyboard.press('n');
      const pitched = await page
        .waitForFunction(() => /Your piano's A is at (439\.[5-9]|440\.[0-5]) Hz/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 2200 })
        .then(() => true)
        .catch(() => false);
      check('piano session: the A is measured and adopted', pitched, await text(page, '#h1'));
      await page.screenshot({ path: resolve(out, 'piano-pitch.png') });
      await page.waitForSelector('#brief', { timeout: 8000 });
      check('piano session: then the finger run, introduced first', (await text(page, '.hud .k')).includes('STEP 2 OF 4') && (await text(page, '#brief h1')).includes('Finger gym'), `${await text(page, '.hud .k')} | ${await text(page, '#brief h1')}`);
      await page.screenshot({ path: resolve(out, 'brief-keys.png') });
      await startRun(page);
      await press(page, 'n', 12, 380);
      check('piano session: keys played in the run score', (await points()) >= 100 && (await page.locator('#con rect').count()) > 10, `score ${await points()}`);
      await page.screenshot({ path: resolve(out, 'run-keys.png') });
      await page.click('#skipstep');
      await page.waitForFunction(() => /Step 3 of 4/.test(document.querySelector('#eb')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
      check('piano session: by ear before the piece: motifs from it to play back', /Step 3 of 4 · Play it back/.test(await text(page, '#eb')), await text(page, '#eb'));
      await page.click('#nextstep');
      await page.waitForSelector('#rowA');
      check('piano session: then the piece', (await text(page, '#eb')).includes('Step 4 of 4'), await text(page, '#eb'));
      await page.waitForTimeout(600);
      await press(page, 'n', 8, 450);
      await page.waitForTimeout(3200);
      await press(page, 'n', 8, 450);
      const pianoDone = await page
        .waitForFunction(() => document.querySelector('h1')?.textContent?.startsWith('Done.'), null, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      check('piano session: ends with a summary', pianoDone && (await page.locator('.res li').count()) >= 1, `${await text(page, 'h1')} · ${await page.locator('.res li').count()} results`);

      await page.goto(base + '?autostart#/run/keys/1');
      await startRun(page);
      check('piano boss: appears after the last wave', await playUntil('#boss', 330), await text(page, '.hud .k'));
      await page.waitForTimeout(700);
      check('piano boss: is the C major scale, key by key', (await text(page, '#bh1')).includes('Play C4 with finger 1') && (await page.locator('#btiles .tile').count()) === 8, await text(page, '#bh1'));
      for (let i = 1; i <= 3; i++) await pressUntil(page, 'n', '#btiles .tile.clean', i, '#rerun');
      check('piano boss: tells you to pass the thumb under', (await text(page, '#btip')).includes('thumb under'), await text(page, '#btip'));
      await page.screenshot({ path: resolve(out, 'boss-piano.png') });
      for (let i = 4; i <= 8; i++) await pressUntil(page, 'n', '#btiles .tile.clean', i, '#rerun');
      await page.waitForSelector('#rerun', { timeout: 6000 }).catch(() => undefined);
      check('piano boss: eight ringing keys win the run', /8 of 8 keys/.test((await page.locator('tbody').first().textContent()) ?? ''), (await text(page, 'h1')).slice(0, 60));


      // ── the piano's chords: the book of pieces, the chord check, changes, pieces of chords, the games.
      // The instrument is the piano from here to the learning path.
      await page.goto(base + '?autostart#/songs');
      await page.waitForSelector('#list li');
      const pieceCount = Number(/(\d+) pieces/i.exec(await text(page, '.kick'))?.[1] ?? 0);
      const levelCounts = (await page.locator('[data-level] small').allTextContents()).map(Number);
      const kindNames = (await page.locator('#kindsel option').allTextContents()).map((s) => s.trim().toLowerCase()).join('|');
      check('pieces: the piano has a book of its own, over a hundred pieces over four levels, in three kinds', pieceCount >= 100 && levelCounts.length === 5 && levelCounts.slice(1).every((n) => n >= pieceCount / 7) && levelCounts.slice(1).reduce((a, b) => a + b, 0) === pieceCount && kindNames === 'all kinds|tunes|chords|broken chords', `${pieceCount} pieces · levels ${levelCounts.join('/')} · ${kindNames}`);
      await page.click('[data-level="0"]');
      await page.selectOption('#kindsel', 'chords');
      const chordRows = await page.locator('#list li:not(.sep)').count();
      check('pieces: a kind filters the list, and a piece of chords names its chords and who made the song', chordRows >= 20 && (await page.locator('#list li:not(.sep) .chs2 .chipn').count()) >= chordRows && (await page.locator('#list li:not(.sep) .by').count()) === chordRows, `${chordRows} pieces of chords`);
      await page.selectOption('#kindsel', '');
      await page.fill('#q', 'spiritual');
      await page.waitForTimeout(250);
      const pianoSpirituals = await page.locator('#list li:not(.sep)').count();
      check('pieces: the search finds songs by who made them, with a basic version where the chords are broken', pianoSpirituals >= 5 && /found for/.test(await text(page, '#shown')) && (await page.locator('#list a[href*="keys-basic"]').count()) >= 1, `${pianoSpirituals} · ${await text(page, '#shown')}`);
      await page.screenshot({ path: resolve(out, 'pieces.png') });
      await page.fill('#q', '');

      await page.goto(base + '?autostart#/keys/C');
      await page.waitForSelector('#tiles .tile');
      check('piano chord check: the chord as keys with a finger for each, one key at a time and then all at once', (await text(page, '#h1')).includes('Play C with finger 1') && (await page.locator('#tiles .tile').count()) === 4 && (await text(page, '#tip')).includes('Thumb (1) on C') && (await page.locator('#box rect').count()) >= 15, `${await text(page, '#h1')} · ${await page.locator('#tiles .tile').count()} tiles`);
      await page.screenshot({ path: resolve(out, 'keys-check.png') });
      await page.keyboard.press('w');
      await page.waitForFunction(() => /was not it|cut short/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 3000 }).catch(() => undefined);
      check('piano chord check: a wrong key is named, and the right one asked for again', (await text(page, '#h1')).includes('Play C again') && (await text(page, '#tip')).includes('That was C♯4'), `${await text(page, '#h1')} | ${await text(page, '#tip')}`);
      // the practice piano does not let go of a key: give the wrong one time to fade
      await page.waitForTimeout(900);
      for (let i = 1; i <= 3; i++) await pressUntil(page, 'n', '#tiles .tile.clean', i);
      check('piano chord check: after its keys the chord is asked for as a whole', (await text(page, '#h1')).includes('all of C at once'), await text(page, '#h1'));
      await pressUntil(page, 'n', '#tiles .tile.clean', 4);
      const cLevel = await page.evaluate(() => JSON.parse(localStorage.getItem('noise-floor/v1') ?? '{}').skills?.['chord:p.C']?.level ?? 0);
      check('piano chord check: a chord that rang key by key and as a whole is measured as a skill of the piano', (await text(page, '#h1')).includes('Every key rings') && /seconds after the chord came up/.test(await text(page, '#tip')) && cLevel >= 1, `${await text(page, '#h1')} · level ${cLevel}`);

      await page.goto(base + '?autostart#/change/C/G');
      await page.waitForSelector('#boxa rect');
      check('piano chord change: the two chords as keys, and the first one asked for', (await text(page, '#h1')) === 'Play C.' && (await page.locator('#boxa rect').count()) >= 15 && (await page.locator('#boxb rect').count()) >= 15 && (await text(page, '.auto')).includes('1 thumb'), await text(page, '#h1'));
      await pressUntilText(page, 'n', '#h1', 'Change to G');
      check('piano chord change: it says how the hand gets there', /moves 4 keys up, to the right: the thumb lands on G/.test(await text(page, '#tip')), await text(page, '#tip'));
      await page.screenshot({ path: resolve(out, 'keys-change.png') });
      for (const next of ['Change to C', 'Change to G', 'Change to C', 'Change to G']) await pressUntilText(page, 'n', '#h1', next);
      await pressUntilText(page, 'n', '#h1', 'one minute');
      await pressUntilText(page, 'n', '#big', '0 changes');
      await pressUntilText(page, 'n', '#big', '1 changes');
      check('piano chord change: after three times there and back comes the minute, and every change in it is counted', (await text(page, '#big')).includes('1 changes') && (await text(page, '#h1')).includes('Change to C'), `${await text(page, '#big')} | ${await text(page, '#h1')}`);

      await page.goto(base + '?autostart#/piano/swing-low~keys/1');
      await page.waitForSelector('#rowA rect');
      await page.waitForTimeout(600);
      check('piano, a piece of chords: a block in the strip for each chord, all its keys marked with their fingers, in the key that lies under the hand', (await text(page, '#h1')) === 'Play C: all its keys at once.' && (await page.locator('#rowA rect').count()) >= 8 && (await page.locator('#hands circle').count()) === 3 && (await text(page, '#where')).includes('Spiritual') && (await text(page, '#sub')).includes('C, E and G with fingers 1, 3 and 5'), `${await text(page, '#h1')} · ${await page.locator('#hands circle').count()} fingers · ${await text(page, '#where')}`);
      await pressUntilText(page, 'n', '#fbk', 'C: right');
      check('piano, a piece of chords: the chord is heard as a whole, and asked for again where the song repeats it', (await text(page, '#fbk')).includes('C: right') && (await text(page, '#h1')).includes('once more'), `${await text(page, '#fbk')} | ${await text(page, '#h1')}`);
      await page.screenshot({ path: resolve(out, 'piano-chords.png') });
      await page.waitForTimeout(700);
      await page.keyboard.press('w');
      await page.waitForFunction(() => (document.querySelector('#fbk')?.textContent ?? '').startsWith('Heard'), null, { timeout: 3000 }).catch(() => undefined);
      check('piano, a piece of chords: another chord of the piece is named when it is struck instead', (await text(page, '#fbk')) === 'Heard F. This one is C.', await text(page, '#fbk'));
      await page.waitForTimeout(900);
      for (let i = 0; i < 7; i++) {
        await page.keyboard.press('n');
        await page.waitForTimeout(750);
      }
      check('piano, a piece of chords: the phrase is finished and measured', (await text(page, '#fbk')).includes('of full speed'), await text(page, '#fbk'));

      await page.goto(base + '?autostart#/piano/swing-low~keys/2');
      await page.waitForSelector('#rowA rect');
      await playAlong(8);
      await page.waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('on the click'), null, { timeout: 8000 }).catch(() => undefined);
      check('piano, a piece of chords: played with the click, the chords are on the click', (await hits()) >= 7, await text(page, '#fbk'));

      // the session of a piece of chords leads over its chords and their changes
      await newDay();
      await page.goto(base + '?autostart&day=2#/');
      await page.waitForSelector('.plan');
      const chordPlan = (await text(page, '.plan')).replace(/\s+/g, ' ');
      check('piano home: a piece of chords gets its own steps: pitch, its chords key by key, their changes, by ear, the piece', (await page.locator('.plan li').count()) === 5 && /Chord check: F/.test(chordPlan) && chordPlan.includes('Chord changes') && chordPlan.includes('Swing Low'), chordPlan.slice(0, 200));
      await page.goto(base + '?autostart#/session/new');
      await page.waitForSelector('#kb');
      await page.waitForTimeout(500);
      await page.keyboard.press('n');
      await page.waitForSelector('#tiles .tile', { timeout: 9000 }).catch(() => undefined);
      check('piano session of chords: after the pitch comes the chord check, with the chords the piece needs next', (await text(page, '#eb')).includes('Step 2 of 5') && /Chord 1 of 3 · F/.test(await text(page, '#eb')) && (await text(page, '#h1')).includes('Play F with finger 1'), `${await text(page, '#eb')} | ${await text(page, '#h1')}`);
      await page.click('#nextstep');
      await page.waitForSelector('#boxa rect', { timeout: 6000 }).catch(() => undefined);
      check('piano session of chords: then one change without a clock, shown as keys', (await text(page, '#eb')).includes('Step 3 of 5') && (await text(page, '#eb')).includes('The change C → G') && (await page.locator('#boxa rect').count()) >= 15, await text(page, '#eb'));
      await page.keyboard.press('Space');
      await page.keyboard.press('Space');
      await page.waitForSelector('#brief', { timeout: 6000 }).catch(() => undefined);
      // on a slow machine the briefing is drawn a moment after its frame
      await page.waitForFunction(() => (document.querySelector('#brief h1')?.textContent ?? '').startsWith('Chord changes'), null, { timeout: 8000 }).catch(() => undefined);
      check('piano session of chords: then the game with those changes', (await text(page, '#brief h1')).startsWith('Chord changes: C and G') && (await text(page, '.hud .k')).includes('STEP 3 OF 5'), `${await text(page, '.hud .k')} | ${await text(page, '#brief h1')}`);
      await page.click('#skipstep');
      await page.waitForFunction(() => /Step 4 of 5/.test(document.querySelector('#eb')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
      await page.click('#nextstep');
      await page.waitForSelector('#rowA rect', { timeout: 6000 }).catch(() => undefined);
      check('piano session of chords: and last the piece', (await text(page, '#eb')).includes('Step 5 of 5') && (await text(page, '#eb')).includes('Swing Low'), await text(page, '#eb'));

      await page.goto(base + '?autostart#/piano/auld-lang-syne-chords~keys/1');
      await page.waitForSelector('#rowA rect');
      await page.waitForTimeout(600);
      const namedChords = (await page.locator('#rowA text.chn').allTextContents()).join(' ');
      check('piano, broken chords: each chord is named above the key it begins with, and the first key asked for with its finger', namedChords.startsWith('C G') && (await text(page, '#h1')) === 'Play C4 with finger 1.' && (await text(page, '#sub')).includes('the keys of C'), `${namedChords} | ${await text(page, '#h1')} | ${await text(page, '#sub')}`);
      await press(page, 'n', 4, 550);
      check('piano, broken chords: its keys are heard one after the other, and the next chord is led up to', (await text(page, '#fbk')).includes('right key') && (await text(page, '#h1')).includes('Play G4') && (await text(page, '#sub')).includes('the keys of G'), `${await text(page, '#fbk')} | ${await text(page, '#h1')} | ${await text(page, '#sub')}`);
      await page.screenshot({ path: resolve(out, 'piano-broken.png') });

      await page.goto(base + '?autostart#/piano/happy-birthday~keys/2');
      await page.waitForSelector('#rowA rect');
      await playAlong(8);
      await page.waitForFunction(() => document.querySelector('#fbk')?.textContent?.includes('on the click'), null, { timeout: 8000 }).catch(() => undefined);
      check('piano, a tune with an upbeat: played with the click it is on the click, and every note has its finger', (await hits()) >= 6 && (await page.locator('#rowA text.fn').count()) === 8, await text(page, '#fbk'));

      await page.goto(base + '?autostart#/nf');
      await page.waitForSelector('.cards');
      const pianoCards = await text(page, '.cards');
      check('games, piano: the finger gym, chord changes, the run of the piece and Stepping stones', (await page.locator('.cards .card').count()) === 4 && ['Finger gym', 'Chord changes', 'Piece run', 'Stepping stones'].every((n) => pianoCards.includes(n)), pianoCards.replace(/\s+/g, ' ').slice(0, 120));
      await page.goto(base + '?autostart#/run/kchanges');
      await page.waitForSelector('#brief');
      check('changes run, piano: introduced with its chords as keys', (await text(page, '#brief h1')) === 'Chord changes: C and G' && (await page.locator('#brief .shapes figure').count()) === 2 && (await page.locator('#brief .shapes rect').count()) >= 30, await text(page, '#brief h1'));
      await startRun(page);
      await press(page, 'n', 12, 1100);
      check('changes run, piano: clean changes between chords struck on the keys score, and the two chords are shown as keys', (await points()) >= 300 && (await page.locator('#con rect').count()) >= 30, `score ${await points()}`);
      await page.screenshot({ path: resolve(out, 'run-kchanges.png') });

      await page.goto(base + '?autostart#/stride/four');
      await page.waitForSelector('#brief');
      check('stepping stones, piano: introduced with its two chords as keys', (await text(page, '#brief h1')) === 'Keep the pulse: C and G' && (await page.locator('#brief .shapes rect').count()) >= 30 && (await text(page, '#brief .how')).includes('all its keys together'), await text(page, '#brief h1'));
      await page.keyboard.press('Space');
      await page.waitForSelector('#play');
      for (let i = 0; i < 10; i++) {
        await page.waitForFunction((n) => Number((document.querySelector('#app') as HTMLElement).dataset.step ?? -1) >= n, i, { timeout: 15000 }).catch(() => undefined);
        await page.keyboard.press('n');
      }
      await page.waitForTimeout(500);
      const inTimeKeys = Number(await text(page, '#hits'));
      check('stepping stones, piano: chords that land with the wanderer count as in time, across a change of chord', inTimeKeys >= 8, `${inTimeKeys} of 10`);
      await page.screenshot({ path: resolve(out, 'stride-piano.png') });
      await page.keyboard.press('Space');

      await page.goto(base + '?autostart#/basics/p-chord/try');
      await page.waitForSelector('#try');
      await pressUntilText(page, 'n', '#try', 'heard 1 of 1');
      check('basics, piano: what a chord is comes with a chord to try, and the app hears it', (await text(page, '#h1')) === 'What a chord is, on the piano' && (await text(page, '#try')).includes('heard 1 of 1'), (await text(page, '#try')).replace(/\s+/g, ' '));

      await page.goto(base + '?autostart#/settings');
      await page.waitForSelector('#dev');
      await page.click('#test');
      await page.waitForTimeout(400);
      await page.click('#latmeasure');
      await page.waitForTimeout(300);
      await page.click('#rec');
      await page.waitForTimeout(200);
      check('settings: without a microphone there is nothing to record, and it says so', (await text(page, '#recmsg')).includes('nothing to record') && (await text(page, '#rec')) === 'Record', await text(page, '#recmsg'));
      check('settings: click sound, ring length and the timing measurement are there', (await page.locator('#csound option').count()) === 2 && (await page.locator('#ring').count()) === 1 && (await text(page, '#latmsg')).includes('needs the microphone'), await text(page, '#latmsg'));
      check('settings: microphone choice, test and backup are there', (await page.locator('#dev option').count()) >= 1 && (await text(page, '#testmsg')).includes('switched off') && (await page.locator('#export').count()) === 1, await text(page, '#testmsg'));
      await page.screenshot({ path: resolve(out, 'settings.png'), fullPage: true });

      // the learning path: stages with a count, one of them marked as the place the player is at
      await page.goto(base + '?autostart#/learn');
      await page.waitForSelector('#stage h2');
      check('learning path, piano: a map of its own, from five fingers over the first chords and their changes to the pieces of each level', /stage \d of \d/i.test(await text(page, '.kick')) && (await page.locator('.stop').count()) === 7 && (await page.locator('.stops').textContent())!.includes('Five fingers, each hand') && (await page.locator('.stops').textContent())!.includes('The first six chords ring') && (await skillStages(page)).includes('Scales') && (await skillStages(page)).includes('More chords') && /\d+ of \d+/.test(await text(page, '#stage .prog')), `${await page.locator('.stop').count()} stones · ${await text(page, 'h1')} · ${await text(page, '#stage .prog')}`);
      await page.click('#stop-chords');
      await page.waitForFunction(() => document.querySelector('#stage h2')?.textContent?.includes('six chords'), null, { timeout: 3000 }).catch(() => undefined);
      check('learning path, piano: a chord that rang on the keys is marked done, with the measured value', (await page.locator('#stage .items li').count()) === 6 && (await page.locator('#stage .items li.done').count()) >= 1 && /s from cold/.test(await text(page, '#stage .items')), (await text(page, '#stage .items')).replace(/\s+/g, ' ').slice(0, 120));
      await page.click('#stop-pieces2');
      await page.waitForFunction(() => document.querySelector('#stage h2')?.textContent?.includes('Moderate'), null, { timeout: 3000 }).catch(() => undefined);
      check('learning path, piano: a level of the book is a stage of five pieces, each named with its kind', (await page.locator('#stage .items li').count()) === 5 && /(a tune|chords)/.test(await text(page, '#stage .items')) && (await text(page, '#stage .go')).includes('Go on with'), (await text(page, '#stage .items')).replace(/\s+/g, ' ').slice(0, 120));
      await page.screenshot({ path: resolve(out, 'learn-piano.png'), fullPage: true });
      await page.goto(base + '?autostart#/progress');
      await page.waitForSelector('.measured');
      check('progress, piano: the scale played on the keys was measured', (await page.locator('.measured').innerHTML()).includes('C major scale'), `${await page.locator('tbody tr').count()} rows`);
      check('practice instrument, piano: hardly any key had to be played twice to be heard', repeated() <= 2, `${repeated()} repeated`);
      check('practice instrument, piano: no script errors', errors.length === 0, errors.join(' | '));
      await browser.close();
    }
  }],
  ['2b', async () => {
    // 2b. what came with the research round: the repertoire and its visits, the song player's switches, the
    // strumming trainer, the ear, the tools, your own song, playing freely, the weeks, both hands and the staff,
    // the week and the plan
    {
      const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(() => {
        if (localStorage.getItem('noise-floor/v1')) return;
        // a player some weeks in: Tom Dooley played clean all through four days ago, chords that ring, a few days played
        const DAY = 86400000;
        const now = Date.now();
        const day = (t: number): number => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY);
        const ago = now - 4 * DAY;
        const skills: Record<string, unknown> = {};
        for (const k of ['bar:tom-dooley:D', 'bar:tom-dooley:A7']) skills[k] = { level: 5, best: 100, last: ago, tops: 3, days: 3, cold: [day(ago), 100], h: [[day(ago) - 6, 85], [day(ago) - 3, 100], [day(ago), 100]] };
        for (const c of ['Em', 'Am', 'C', 'G', 'D', 'A']) skills['chord:' + c] = { level: 2, best: 10, last: now - DAY, tops: 0, strings: 6, days: 3, cold: [day(now - DAY), 12], h: [[day(now) - 9, 20], [day(now) - 5, 14], [day(now) - 1, 10]] };
        const reviews = { 'guitar:tom-dooley': { since: ago, step: 0, due: ago + 3 * DAY, at: 0 } };
        localStorage.setItem('noise-floor/v1', JSON.stringify({ settings: { a4: 440, mic: false, practiceInstrument: true, strumSelect: false }, skills, reviews, sessions: [now - 2 * DAY, now - 3 * DAY], current: { guitar: 'amazing-grace-chords' }, weeks: { guitar: { id: 'amazing-grace-chords', start: day(now) - 1 } }, practice: { [day(now - 2 * DAY)]: 900 } }));
      });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const playAlong = async (count: number, sign = true): Promise<void> => {
        // a lesson with the click starts nothing before the sign: Space gives it, once the lesson opened waits for it
        if (sign && (await page.waitForSelector('#app[data-armed]', { timeout: 4000 }).then(() => true).catch(() => false))) await page.keyboard.press('Space');
        for (let i = 0; i < count; i++) {
          await page.waitForFunction((n) => Number((document.querySelector('#app') as HTMLElement).dataset.step ?? -1) >= n, i, { timeout: 15000 });
          await page.keyboard.press('n');
        }
      };

      // the repertoire: what can be played, and a song due to come back
      await page.goto(base + '?autostart#/repertoire');
      await page.waitForSelector('.rep');
      check('repertoire: a song played clean all through is in it, with its best, its last cold try and that it is due', (await text(page, 'h1')) === 'You can play 1 song.' && (await text(page, '.rep')).includes('Tom Dooley') && (await text(page, '.rep .fresh')).includes('DUE') && (await text(page, '.duebox')).includes('Due today: Tom Dooley'), `${await text(page, 'h1')} | ${(await text(page, '.rep')).replace(/\s+/g, ' ').slice(0, 120)}`);
      await page.screenshot({ path: resolve(out, 'repertoire.png') });
      // the session takes it, right after tuning
      await page.goto(base + '?autostart#/');
      await page.waitForSelector('.plan');
      check('repertoire: today\'s session warms up on the old song from cold, after tuning', (await text(page, '.plan li >> nth=0')).includes('Tom Dooley, from cold'), (await text(page, '.plan')).replace(/\s+/g, ' ').slice(0, 200));
      check('home: the week counts, with the days played and a goal, and a line on the week', /This week: \d of 4 days/i.test(await text(page, '.week .wk-said')) && (await page.locator('.week i').count()) === 7, `${await text(page, '.week')}`);
      // a visit from cold: two lines at full speed, no run-up
      await page.goto(base + '?autostart#/song/tom-dooley/review');
      await page.waitForSelector('#rowA');
      await page.waitForFunction(() => /Played again from cold/.test(document.querySelector('#eb')?.textContent ?? ''), null, { timeout: 6000 }).catch(() => undefined);
      check('visit: an old song is played from cold, two lines at full speed', /Played again from cold · Lines 1 and 2 · 100%/.test(await text(page, '#eb')), await text(page, '#eb'));
      await playAlong(16);
      await page.waitForFunction(() => /Still there, from cold|slipped a little/.test(document.querySelector('#fbk')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => undefined);
      const visited = await page.evaluate(() => JSON.parse(localStorage.getItem('noise-floor/v1')!).reviews['guitar:tom-dooley']);
      check('visit: a clean visit pushes the next one out to ten days', (await text(page, '#fbk')).includes('Still there, from cold. It comes back in 10 days.') && visited.step === 1, `${await text(page, '#fbk')} | step ${visited.step}`);

      // the loop: the bars on show go round, one bar counted in; [ and ] take in more
      await page.goto(base + '?autostart#/song/amazing-grace-chords/2');
      await page.waitForSelector('#rowA');
      await page.keyboard.press('l');
      await page.keyboard.press(']');
      await page.waitForFunction(() => /Loop · bars 1–5/.test(document.querySelector('#eb')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => undefined);
      check('loop: L loops the line on show, ] takes in the bar after it, and the rest is drawn faint', /Loop · bars 1–5 · \d+%/.test(await text(page, '#eb')) && (await page.getAttribute('#loopbtn', 'aria-pressed')) === 'true' && (await text(page, '#slsay')).includes('goes round until L ends it'), `${await text(page, '#eb')} | ${await text(page, '#slsay')}`);
      await page.keyboard.press('+');
      await page.waitForTimeout(200);
      check('loop: the tempo moves in steps of five', /Loop · bars 1–5 · (5[05]|6[05]|7[05])%/.test(await text(page, '#eb')) && /^\d+%$/.test(await text(page, '#tempo')), `${await text(page, '#eb')} | ${await text(page, '#tempo')}`);
      await page.keyboard.press('h');
      await page.waitForTimeout(300);
      check('loop: H plays the model between takes, at the tempo practised at', /Listen: bars 1–5 at \d+%/.test(await text(page, '#fbk')), await text(page, '#fbk'));
      await page.screenshot({ path: resolve(out, 'loop.png') });

      // a performance: no marks while playing, the player's own count of slips first, then the bars
      await page.goto(base + '?autostart#/song/ode-guitar/1');
      await page.waitForSelector('#rowA');
      await page.keyboard.press('v');
      await page.waitForFunction(() => /Performance/.test(document.querySelector('#eb')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => undefined);
      check('performance: V plays the whole song from the top, with no marks while it is played', /Performance · no marks/.test(await text(page, '#eb')) && (await page.getAttribute('#st2', 'aria-pressed')) === 'true', await text(page, '#eb'));
      await playAlong(30);
      await page.waitForFunction(() => /How did it go/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => undefined);
      check('performance: afterwards the player is asked first how many slips they heard', (await text(page, '#h1')) === 'How did it go?' && (await page.locator('#selfrate').isVisible()) && (await page.locator('#barmap .bm.ok, #barmap .bm.bad').count()) === 0, `${await text(page, '#h1')} | ${await text(page, '#fbk')}`);
      await page.keyboard.press('1');
      await page.waitForTimeout(300);
      check('performance: then the app says how it heard it, bar by bar, beside the player\'s count', /of \d+ on the click/.test(await text(page, '#fbk')) && (await page.locator('#barmap .bm.ok, #barmap .bm.bad').count()) >= 4 && /(You counted 1|You heard it as the app did)/.test(await text(page, '#takenote')), `${await text(page, '#takenote')} | ${await page.locator('#barmap .bm').count()} bars`);
      await page.screenshot({ path: resolve(out, 'performance.png') });

      // the strumming trainer: a pattern read left to right with its count, in three steps
      await page.goto(base + '?autostart#/strum/folk');
      await page.waitForSelector('#pat');
      check('strumming: a pattern of strokes down and up, read left to right, counted under, in three steps', (await page.locator('#pat path').count()) >= 10 && (await page.locator('#pat text').count()) >= 16 && (await page.locator('.ladder .rung').count()) === 3 && (await text(page, '#h1')).includes('Down, down-up'), `${await page.locator('#pat path').count()} strokes | ${await text(page, '#h1')}`);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => /Get ready/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 3000 }).catch(() => undefined);
      check('strumming: Space counts in a bar', (await text(page, '#h1')).includes('Get ready'), await text(page, '#h1'));
      await page.keyboard.press('Space');

      // by ear: the chords that ring, told apart by their sound
      await page.goto(base + '?autostart#/ear/chords');
      await page.waitForFunction(() => /Which chord was it/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
      check('by ear: a chord is played, and nothing says which it was', (await text(page, '#h1')) === 'Which chord was it? Play it.' && (await text(page, '#tiles .tile >> nth=0')).startsWith('?'), `${await text(page, '#h1')} | ${await text(page, '#tiles')}`);
      await pressUntilText(page, 'n', '#fbk', 'first try');
      check('by ear: the chord played back is found at the first try', (await text(page, '#fbk')).includes('By ear, at the first try.'), await text(page, '#fbk'));

      // the library: favourites, played lately, playable now, one chord short
      await page.goto(base + '?autostart#/songs');
      await page.waitForSelector('.lib li');
      await page.selectOption('#picksel', 'ready');
      await page.waitForTimeout(200);
      const ready = await page.locator('.lib li:not(.sep)').count();
      check('songs: playable now: songs whose chords all ring already', ready >= 3 && (await text(page, '.lib')).includes('Tom Dooley') === false && /The chord that opens most songs: .+/.test(await text(page, '.keychord')), `${ready} playable | ${await text(page, '.keychord')}`);
      await page.selectOption('#picksel', '');
      await page.locator('[data-fav]').first().click();
      await page.selectOption('#picksel', 'favs');
      await page.waitForTimeout(200);
      check('songs: a star makes a favourite, and favourites can be shown alone', (await page.locator('.lib li:not(.sep)').count()) === 1, `${await page.locator('.lib li:not(.sep)').count()} favourites`);
      await page.selectOption('#picksel', 'recent');
      await page.waitForTimeout(200);
      check('songs: the ones opened lately, the latest first', (await text(page, '.lib li:not(.sep) >> nth=0')).includes('Ode to Joy') || (await text(page, '.lib li:not(.sep) >> nth=0')).includes('Amazing Grace'), (await text(page, '.lib li:not(.sep) >> nth=0')).slice(0, 60));

      // the toolbox: Q over any page opens the tuner in a sheet, the page waiting underneath; Esc goes back to it
      await page.goto(base + '?autostart#/songs');
      await page.waitForSelector('#list li');
      await page.keyboard.press('q');
      await page.waitForSelector('.toolbox #tbody .top', { timeout: 4000 }).catch(() => undefined);
      const boxOpen = { tabs: await page.locator('.toolbox .tbtabs a').count(), behind: await page.locator('.behind #list li').count(), at: await page.evaluate(() => location.hash) };
      await page.click('.toolbox .tbtabs a[href="#/metronome"]');
      await page.waitForSelector('.toolbox #beats', { timeout: 4000 }).catch(() => undefined);
      const boxTab = await page.locator('.toolbox #beats').count();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => location.hash === '#/songs' && !document.querySelector('.toolbox'), null, { timeout: 4000 }).catch(() => undefined);
      check('toolbox: Q opens the tools over the page, its tabs switch tool, Esc goes back to the page', boxOpen.tabs === 5 && boxOpen.behind >= 1 && boxOpen.at.startsWith('#/tuner') && boxTab === 1 && (await page.evaluate(() => location.hash)) === '#/songs' && (await page.locator('.toolbox').count()) === 0, JSON.stringify({ ...boxOpen, boxTab }));
      await page.goto(base + '?autostart#/metronome');
      await page.waitForSelector('#beats');
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('t');
        await page.waitForTimeout(500);
      }
      check('metronome: tapping four times sets the tempo', /^(11[5-9]|12[0-5]) bpm$/.test(await text(page, '#bpm')), await text(page, '#bpm'));
      await page.keyboard.press('Space');
      const lit = await page
        .waitForFunction(() => !!document.querySelector('#beats i.lit'), null, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      check('metronome: it beats, the beat shown', lit, '');
      await page.keyboard.press('Space');
      await page.goto(base + '?autostart#/chords');
      await page.waitForSelector('.chordgrid');
      check('chord library: every shape in groups, power chords among them, each with your level', (await page.locator('.chordgrid').count()) === 6 && (await page.locator('.chordcard').count()) >= 50 && (await text(page, '.page')).includes('E5'), `${await page.locator('.chordcard').count()} shapes`);

      // your own song: chords picked, kept, learned
      await page.goto(base + '?autostart#/compose');
      await page.waitForSelector('.chips');
      for (const c of ['G', 'C', 'D', 'G']) await page.click(`[data-chord="${c}"]`);
      check('your own song: chords picked bar by bar', (await page.inputValue('#src')) === 'G C D G' && (await text(page, '#msg')) === '4 bars.', `${await page.inputValue('#src')} | ${await text(page, '#msg')}`);
      await page.fill('#title', 'My first song');
      await page.click('#save');
      await page.waitForSelector('#rowA');
      check('your own song: kept and opened as a lesson like any song', /My first song/.test(await text(page, 'header.top a')) && /^(Strum|Change to)/.test(await text(page, '#h1')), `${await text(page, 'header.top a')} | ${await text(page, '#h1')}`);

      // playing freely: no score, the app shows what it heard
      await page.goto(base + '?autostart#/jam');
      await page.waitForSelector('#map');
      check('playing freely: five notes on the fretboard, and no score', (await page.locator('#map circle').count()) >= 10 && (await text(page, '#fbk')) === 'Waiting for the first note.', await text(page, '#fbk'));

      // over the weeks
      await page.goto(base + '?autostart#/trends');
      await page.waitForSelector('.tiles4');
      check('weeks: the week in four numbers, the days played as a calendar, a line for each skill measured on three days', (await page.locator('.tiles4 .stat').count()) === 4 && (await page.locator('.cal .cell').count()) >= 70 && (await page.locator('.spark').count()) >= 3, `${await page.locator('.cal .cell').count()} days, ${await page.locator('.spark').count()} lines`);
      await page.screenshot({ path: resolve(out, 'trends.png'), fullPage: true });

      // the piano: both hands, the root then the chord, and the staff
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('noise-floor/v1')!);
        s.settings.instrument = 'piano';
        localStorage.setItem('noise-floor/v1', JSON.stringify(s));
      });
      await page.goto(base + '?autostart#/piano/swing-low~keys~hands/1');
      await page.waitForSelector('#rowA');
      check('both hands: the left hand strikes the root first, with the little finger', (await text(page, '#h1')).startsWith('Left hand: ') && (await text(page, '#h1')).includes('little finger'), await text(page, '#h1'));
      await pressUntilText(page, 'n', '#h1', 'right hand');
      check('both hands: then the right hand strikes the chord', (await text(page, '#h1')).startsWith('Now the right hand: '), await text(page, '#h1'));
      await page.keyboard.press('s');
      await page.waitForTimeout(300);
      const staffText = await page.evaluate(() => document.querySelector('#rowA')?.textContent ?? '');
      check('the staff: S shows the piece on two staffs, the names under the notes while it is learned', staffText.includes('𝄞') && staffText.includes('𝄢') && /C3/.test(staffText), staffText.slice(0, 40));
      await page.screenshot({ path: resolve(out, 'both-hands.png') });
      await page.keyboard.press('s');

      // the plan of when to play, made once, and five minutes that count
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('noise-floor/v1')!);
        s.settings.instrument = 'guitar';
        localStorage.setItem('noise-floor/v1', JSON.stringify(s));
      });
      await page.goto(base + '?autostart#/progress');
      await page.waitForSelector('#plancard');
      await page.selectOption('#plancue', 'dinner');
      await page.click('#plansave');
      await page.waitForSelector('#plancard .said');
      check('plan: made once, said as a plan, with a way into the calendar', (await text(page, '#plancard .said')) === 'After dinner, I play for 10 minutes, at about 19:30.' && (await page.locator('#planics').count()) === 1, await text(page, '#plancard .said'));
      await page.goto(base + '?autostart#/session/short');
      await page.waitForFunction(() => /Step 1 of 2/.test(document.querySelector('#eb')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
      check('short session: five minutes are the first step and the song', /Step 1 of 2/.test(await text(page, '#eb')), await text(page, '#eb'));

      check('new pages: no script errors', errors.length === 0, errors.join(' | '));
      await browser.close();
    }
  }],
  ['2c', async () => {
    // 2c. read from the instrument: the size of what is read while playing, the type size setting, a
    // left-handed guitar, tablets, and the built app without a network
    {
      const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
      const errors: string[] = [];
      /** opens a page as someone plays with the microphone (no practice instrument), looks, and closes it again */
      const look = async <T>(route: string, settings: Record<string, unknown>, wait: string, fn: (page: Page) => Promise<T>, size = { width: 1440, height: 900 }): Promise<T> => {
        const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
        await ctx.addInitScript((s) => localStorage.setItem('noise-floor/v1', JSON.stringify(s)), { settings: { mic: false, practiceInstrument: false, lang: 'en', ...settings } });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(base + '?autostart#/' + route);
        await page.waitForSelector(wait, { timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(400);
        try {
          return await fn(page);
        } finally {
          await ctx.close();
        }
      };
      /** the size a text is drawn at, in pixels on the screen (a drawing's text times the drawing's scale): the smallest of them */
      const drawn = (page: Page, sel: string): Promise<number> =>
        page.evaluate((s) => {
          const px = [...document.querySelectorAll(s)].map((el) => parseFloat(getComputedStyle(el).fontSize) * (el instanceof SVGGraphicsElement ? Math.abs(el.getScreenCTM()?.a ?? 1) : 1));
          return px.length ? Math.min(...px) : 0;
        }, sel);
      const open = (page: Page, sel: string): Promise<number[]> => page.evaluate((s) => [...document.querySelectorAll(s)].map((el) => Number(el.getAttribute('cx'))), sel);

      // at 1440 by 900 what changes while playing (fret numbers, chord names) is drawn about 30 pixels high: the
      // 20 minutes of arc of display guidelines at a metre; the names of the keys at 20, read from the bench
      const tune = await look('song/ode-guitar/1', { instrument: 'guitar' }, '#rowA text.tn', async (p) => ({ fret: await drawn(p, '#rowA text.tn'), h1: await drawn(p, 'h1'), btn: await drawn(p, '.bar .btn') }));
      const strummed = await look('song/amazing-grace-chords/2', { instrument: 'guitar' }, '#rowA text.chn', async (p) => ({ chord: await drawn(p, '#rowA text.chn'), open: await open(p, '#cbox circle[fill="none"]') }));
      const keysPx = await look('piano/ode-to-joy/1', { instrument: 'piano' }, '#rowA text.rn', (p) => drawn(p, '#rowA text.rn'));
      check('reading from a metre: fret numbers and chord names are drawn 30 pixels high or near it, the instruction over 40, the names of the keys 19 or more', tune.fret >= 30 && strummed.chord >= 29 && tune.h1 >= 40 && keysPx >= 19, `frets ${tune.fret.toFixed(1)}, chords ${strummed.chord.toFixed(1)}, instruction ${tune.h1.toFixed(1)}, keys ${keysPx.toFixed(1)}`);
      // the largest type: a page to read grows as a whole; on a play screen what is read grows and the buttons stay
      const big = await look('song/ode-guitar/1', { instrument: 'guitar', uiScale: 1.3 }, '#rowA text.tn', async (p) => ({ fret: await drawn(p, '#rowA text.tn'), h1: await drawn(p, 'h1'), btn: await drawn(p, '.bar .btn'), root: await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)) }));
      const readRoot = await look('songs', { instrument: 'guitar', uiScale: 1.3 }, '#list li', (p) => p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)));
      check('reading from a metre: the largest type makes the numbers and the instruction of a play screen larger and leaves its buttons; a page to read grows as a whole', big.fret >= tune.fret * 1.2 && big.h1 >= tune.h1 * 1.2 && Math.abs(big.btn - tune.btn) < 0.5 && Math.abs(big.root - 16) < 0.1 && Math.abs(readRoot - 20.8) < 0.1, `frets ${big.fret.toFixed(1)}, instruction ${big.h1.toFixed(1)}, buttons ${big.btn} (was ${tune.btn}), type of a page to read ${readRoot}px`);
      const rows = await look('song/amazing-grace-chords/2', { instrument: 'guitar', lang: 'de' }, '#rowA', (p) => p.evaluate(() => new Set([...document.querySelectorAll('.bar > *')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => Math.round((el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2) / 12))).size));
      check('reading from a metre: the bar under a lesson stays one row at 1440 wide, in German too, and leaves its room to the music', rows === 1, `${rows} rows`);

      // a left-handed guitar: the fretboard's nut on the right, the chord picture's high e string on the left
      const lefty = await look('song/amazing-grace-chords/2', { instrument: 'guitar', leftHanded: true }, '#hands rect', async (p) => ({ nut: await p.evaluate(() => Number(document.querySelector('#hands rect[width="10"]')?.getAttribute('x') ?? -1)), open: await open(p, '#cbox circle[fill="none"]') }));
      const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      check('left-handed: the fretboard has its nut on the right and the chord picture is mirrored (the open strings of G on the left)', lefty.nut > 590 && lefty.open.length === 3 && mean(lefty.open) < mean(strummed.open), `nut at ${lefty.nut}, open strings at ${lefty.open.join(', ')} (right-handed: ${strummed.open.join(', ')})`);

      // tablets, lying and standing: every play screen fits, nothing to scroll sideways, the music not squeezed
      const misfits: string[] = [];
      for (const [w, h] of [[1024, 768], [1180, 820], [768, 1024]])
        for (const [route, instrument, wait] of [['', 'guitar', '.plan'], ['song/amazing-grace-chords/2', 'guitar', '#rowA text'], ['piano/ode-to-joy/1', 'piano', '#rowA text'], ['sing/ode-to-joy~voice', 'voice', '#lane']]) {
          const f = await look(route, { instrument }, wait, (p) =>
            p.evaluate(() => {
              const bar = document.querySelector('.bar');
              const music = Math.max(0, ...[...document.querySelectorAll('.stage svg.fit, .stage canvas')].map((el) => el.getBoundingClientRect().height));
              return { sideways: document.documentElement.scrollWidth > innerWidth + 1, barOut: !!bar && bar.getBoundingClientRect().bottom > innerHeight + 1, music: document.body.hasAttribute('data-fit') ? Math.round(music) : 999 };
            }), { width: w, height: h });
          if (f.sideways || f.barOut || f.music < 80) misfits.push(`${route || 'today'} at ${w}x${h}: ${JSON.stringify(f)}`);
        }
      check('tablets: at 1024 by 768, 1180 by 820 and 768 by 1024 the start page and the lessons fit, nothing scrolls sideways, the bar in the window, the music 80 pixels high or more', misfits.length === 0, misfits.join('; '));

      // the songs to sing have favourites and the ones sung lately, as the songs to play have
      const voiceList = await look('songs', { instrument: 'voice' }, '#list li', async (p) => {
        await p.locator('#list [data-fav]').first().click();
        await p.locator('[data-pick="favs"]').click();
        const favs = await p.locator('#list li:not(.sep)').count();
        await p.locator('[data-pick="recent"]').click();
        return { favs, recent: await p.locator('#shown').innerText() };
      });
      check('voice songs: a star makes a favourite, and favourites and the songs sung lately can be shown alone', voiceList.favs === 1 && voiceList.recent.includes('Nothing sung yet'), JSON.stringify(voiceList));

      // offline: the built app, opened once, opens again and plays a lesson with its server gone
      {
        const { build, preview } = await import('vite');
        const dist = resolve(out, 'dist');
        // the dev server of these checks set NODE_ENV to development: the build must be the one that is published
        const nodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        await build({ root: resolve(here, '../..'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } }).finally(() => (process.env.NODE_ENV = nodeEnv));
        const srv = await preview({ root: resolve(here, '../..'), logLevel: 'error', build: { outDir: dist }, preview: { port: 5189, strictPort: true } });
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctx.newPage();
        p.on('pageerror', (e) => errors.push('offline: ' + e.message));
        await p.goto('http://localhost:5189/');
        // the worker keeps what the first visit loaded: the page, its script, its styles
        let kept = 0;
        for (let i = 0; i < 30 && !kept; i++) {
          await p.waitForTimeout(500);
          kept = await p.evaluate(async () => {
            const keys = (await (await caches.open('noise-floor-v1')).keys()).map((r) => r.url);
            return keys.some((u) => u.endsWith('.js')) && keys.some((u) => u.endsWith('.css')) && keys.some((u) => u.endsWith('/')) && keys.some((u) => u.endsWith('.woff2')) ? keys.length : 0;
          });
        }
        await srv.close();
        await p.reload().catch(() => undefined);
        const gate = await p.locator('#gmsg, h1').count();
        await p.goto('http://localhost:5189/?autostart#/song/amazing-grace-chords/1').catch(() => undefined);
        const lesson = await p.waitForSelector('#rowA text', { timeout: 8000 }).then(() => true).catch(() => false);
        check('offline: once opened, the built app opens again and a lesson plays with its server gone', kept >= 3 && gate > 0 && lesson, `${kept} files kept, the start ${gate ? 'shown' : 'missing'}, the lesson ${lesson ? 'shown' : 'missing'}`);
        await ctx.close();
      }
      check('reading, tablets and offline: no script errors', errors.length === 0, errors.join(' | '));
      await browser.close();
    }
  }],
  ['2d', async () => {
    // 2d. what was still missing after the research round: the tempo from 25 to 125 %, the settings as a gear,
    // resting the hands, the player's own plan and the choice of the next song, words under the notes and over
    // the chords, a capo and other tunings, reading rhythm, hammer-on and pull-off, both hands together, what
    // stays, a progress file, phones
    {
      const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
      const errors: string[] = [];
      /** opens a page with the practice instrument (and these settings), looks, and closes it again */
      const visit = async <T>(route: string, settings: Record<string, unknown>, wait: string, fn: (page: Page) => Promise<T>, size: { width: number; height: number; mobile?: boolean } = { width: 1440, height: 900 }, saved: Record<string, unknown> = {}): Promise<T> => {
        const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.mobile ? 2 : 1, isMobile: !!size.mobile, hasTouch: !!size.mobile });
        await ctx.addInitScript((s) => localStorage.setItem('noise-floor/v1', JSON.stringify(s)), { ...saved, settings: { mic: false, practiceInstrument: true, lang: 'en', ...settings } });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(base + '?autostart#/' + route);
        await page.waitForSelector(wait, { timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(300);
        try {
          return await fn(page);
        } finally {
          await ctx.close();
        }
      };
      const txt = (p: Page, sel: string): Promise<string> => p.locator(sel).first().innerText({ timeout: 3000 }).catch(() => '');

      // five places in the row; the toolbox and the gear on the right; the instrument a menu beside the name
      const nav = await visit('', {}, '.plan', async (p) => ({ links: await p.locator('.nav .places a').count(), gear: await p.locator('.nav .gear').getAttribute('title'), tools: await p.locator('.nav .tbx').count(), inst: await p.locator('.nav details.inst [data-inst]').count() }));
      check('navigation: five places in the row, the toolbox and the settings on the right, the instrument a menu beside the name', nav.links === 5 && nav.gear === 'Settings' && nav.tools === 1 && nav.inst === 3, JSON.stringify(nav));

      // the tempo by hand, from 25 % to 125 %
      const tempo = await visit('song/amazing-grace-chords/2', { instrument: 'guitar' }, '#tempo', async (p) => {
        for (let i = 0; i < 16; i++) await p.keyboard.press('-');
        const low = await txt(p, '#tempo');
        for (let i = 0; i < 24; i++) await p.keyboard.press('+');
        return { low, high: await txt(p, '#tempo') };
      });
      check('tempo: in steps of five from 25 % up to 125 %', tempo.low === '25%' && tempo.high === '125%', JSON.stringify(tempo));

      // resting the hands: the app plays the line and shows each step, nothing is measured
      const rest = await visit('song/ode-guitar/1', { instrument: 'guitar' }, '#rowA text', async (p) => {
        await p.keyboard.press('i');
        await p.waitForTimeout(500);
        const during = { h1: await txt(p, '#h1'), pressed: await p.locator('#imagbtn').getAttribute('aria-pressed'), cur: await p.locator('#rowA circle').count() };
        await p.keyboard.press('i');
        await p.waitForTimeout(300);
        return { ...during, after: await p.locator('#imagbtn').getAttribute('aria-pressed') };
      });
      check('resting the hands: I plays the line and follows it on the tab, nothing listened to; I again ends it', rest.h1 === 'Listen, and play it in your head.' && rest.pressed === 'true' && rest.cur >= 1 && rest.after === 'false', JSON.stringify(rest));

      // the song lesson: the way through the song in a band over it, the strums with their arrows, counts and
      // words, the rungs named, the click started by the player, a line that sits, how it works the first time
      /** a strum, until the lesson has heard it; then a moment for it to ring, as a strum on the beat would (the same chord at once again is not a new strum) */
      const strumUntil = async (p: Page, said: string): Promise<boolean> => {
        for (let t = 0; t < 3; t++) {
          await p.keyboard.press('n');
          const ok = await p.waitForFunction((x) => (document.querySelector('#eb')?.textContent ?? '').includes(x) || /sits/.test(document.querySelector('#h1')?.textContent ?? ''), said, { timeout: 1500 }).then(() => true).catch(() => false);
          if (ok) {
            await p.waitForTimeout(450);
            return true;
          }
        }
        return false;
      };
      const way = await visit('song/amazing-grace-chords/1', { instrument: 'guitar' }, '#rowA text', async (p) => ({
        lines: await p.locator('#slpath .slln').count(),
        cur: await txt(p, '#slpath .slln.cur'),
        say: await txt(p, '#slsay'),
        rungs: (await p.locator('.slrungs .rung').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()),
        arrows: await p.locator('#rowA path[d*="V"]').count(),
        counts: await p.locator('#rowA .cnt').count(),
        words: await p.locator('#rowA .bw').allTextContents(),
        exit: await p.getAttribute('header.top a', 'href'),
        title: await txt(p, 'header.top a'),
      }));
      check(
        'song lesson: a band over it shows each line and its two steps, and says the step on show; every strum has its arrow and count, the bars their words; the steps are named; the title leads back to the song',
        way.lines === 4 && way.cur.startsWith('Line 1') && way.say.startsWith('Step 1 of 3 · Learn') && /Learn/.test(way.rungs[0]) && /Click/i.test(way.rungs[1]) && /Whole/.test(way.rungs[2]) && way.arrows >= 12 && way.counts === 12 && /^A-?ma-?zing$/.test(way.words[0] ?? '') && way.exit === '#/songs/amazing-grace-chords' && way.title.includes('Amazing Grace'),
        JSON.stringify(way),
      );
      const heardLine = await visit('song/amazing-grace-chords/1', { instrument: 'guitar' }, '#rowA text', async (p) => {
        await p.keyboard.press('h');
        await p.waitForTimeout(400);
        return txt(p, '#fbk');
      });
      check('song lesson: H plays the line with its tune', heardLine.startsWith('Listen: this is how the line with its tune goes'), heardLine);
      const picked = await visit('song/amazing-grace-chords/2', { instrument: 'guitar' }, '#rowA text', async (p) => {
        await p.locator('#slpath .slln').nth(2).click();
        await p.waitForTimeout(1500);
        const before = { where: await txt(p, '#where'), h1: await txt(p, '#h1'), armed: await p.locator('#app[data-armed]').count(), step: await p.evaluate(() => (document.querySelector('#app') as HTMLElement).dataset.step ?? 'none') };
        // the first strum of the line, played, is the sign
        await p.keyboard.press('n');
        await p.waitForFunction(() => /Get ready/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => undefined);
        return { ...before, after: await txt(p, '#h1') };
      });
      const atLine = await visit('song/amazing-grace-chords/2/3', { instrument: 'guitar' }, '#rowA text', async (p) => ({ where: await txt(p, '#where'), rung: await p.getAttribute('#st1', 'aria-pressed') }));
      check('song lesson: an address can open it at a line (#/song/<id>/<rung>/<line>)', atLine.where.startsWith('Line 3 of 4') && atLine.rung === 'true', JSON.stringify(atLine));
      check('song lesson: a line picked in the band waits for its first strum, which starts the count-in', picked.where.startsWith('Line 3 of 4') && picked.h1 === 'Strum G to start.' && picked.armed === 1 && picked.step === 'none' && picked.after.startsWith('Get ready'), JSON.stringify(picked));
      const sat = await visit('song/amazing-grace-chords/1', { instrument: 'guitar' }, '#rowA text', async (p) => {
        await p.waitForTimeout(400);
        for (let i = 2; i <= 13; i++) await strumUntil(p, i <= 12 ? `strum ${i} of 12` : 'sits');
        await p.waitForFunction(() => /sits/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 3000 }).catch(() => undefined);
        const view = { h1: await txt(p, '#h1'), main: await txt(p, '#slacts .btn.primary'), acts: await p.locator('#slacts .btn').count(), say: await txt(p, '#slsay'), mark: await txt(p, '#slpath .slln.cur') };
        // nothing moves on by itself
        await p.waitForTimeout(3500);
        const stays = { h1: await txt(p, '#h1'), where: await txt(p, '#where'), later: await p.locator('.later').count() };
        await p.keyboard.press('2');
        await p.waitForTimeout(400);
        return { ...view, ...stays, up: await txt(p, '#h1'), rung: await p.getAttribute('#st1', 'aria-pressed') };
      });
      check(
        'song lesson: a line gone clean without a clock sits: the app says so, offers the click first, and moves on only when asked',
        sat.h1 === 'Line 1 sits.' && sat.main.startsWith('With the click') && sat.acts === 3 && sat.say.includes('Learn done for line 1') && sat.where.startsWith('Line 1 of 4') && sat.later === 0 && sat.up === 'Strum G to start.' && sat.rung === 'true',
        JSON.stringify(sat),
      );
      const full = await visit('song/amazing-grace-chords/2', { instrument: 'guitar' }, '#rowA text', async (p) => {
        for (let i = 0; i < 10; i++) await p.keyboard.press('+');
        await p.waitForTimeout(200);
        const tempo = await txt(p, '#tempo');
        await p.keyboard.press('Space');
        for (let i = 0; i < 12; i++) {
          await p.waitForFunction((n) => Number((document.querySelector('#app') as HTMLElement).dataset.step ?? -1) >= n, i, { timeout: 15000 });
          await p.keyboard.press('n');
        }
        await p.waitForFunction(() => /sits|of 12/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
        await p.waitForTimeout(3200);
        return { tempo, h1: await txt(p, '#h1'), main: await txt(p, '#slacts .btn.primary'), other: await txt(p, '#sitwhole'), where: await txt(p, '#where'), eb: await txt(p, '#eb') };
      });
      check('song lesson: a line clean with the click at full speed sits too, and the next line or the whole song is offered', full.tempo === '100%' && full.h1 === 'Line 1 sits at full speed.' && full.main.startsWith('Line 2 with the click') && full.other.startsWith('The whole song') && full.where.startsWith('Line 1 of 4'), JSON.stringify(full));
      const how = await visit('songs', { instrument: 'guitar' }, '#list li', async (p) => {
        await p.goto(base + '?autostart&how#/song/amazing-grace-chords/1');
        await p.waitForSelector('.slhow', { timeout: 6000 }).catch(() => undefined);
        const first = { cards: await p.locator('.slhow .slcards > div').count(), go: await txt(p, '#howgo'), off: await p.locator('#howoff').isChecked().catch(() => false) };
        // nothing listens under the sheet: a strum does not move the marker on
        await p.keyboard.press('n');
        await p.waitForTimeout(800);
        const under = await txt(p, '#eb');
        await p.keyboard.press('Space');
        await p.waitForTimeout(400);
        const open = await p.locator('.slhow').count();
        const h1 = await txt(p, '#h1');
        const eb = await txt(p, '#eb');
        // not again next time (kept in the settings); under More whenever it is asked for
        const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('noise-floor/v1') ?? '{}').settings?.lessonHowOff?.guitar === true);
        await p.evaluate(() => (location.hash = '#/songs'));
        await p.waitForSelector('#list li');
        await p.evaluate(() => (location.hash = '#/song/amazing-grace-chords/1'));
        await p.waitForSelector('#rowA text');
        await p.waitForTimeout(500);
        const again = await p.locator('.slhow').count();
        await p.locator('#more summary').click();
        await p.locator('#howbtn').click();
        return { ...first, under, open, h1, eb, kept, again, fromMore: await p.locator('.slhow').count() };
      });
      check('song lesson: the first time, a sheet says how a song is learned here; nothing listens under it, Space starts the line, and it is not shown again but stays under More', how.cards === 3 && how.go.startsWith('Got it: start line 1') && how.off && !how.under.includes('strum 2') && how.eb.includes('strum 1 of 12') && how.open === 0 && how.h1.startsWith('Strum G') && how.kept && how.again === 0 && how.fromMore === 1, JSON.stringify(how));
      const page = await visit('basics/rest', { instrument: 'guitar' }, '.leaf', (p) => txt(p, '.leaf h1, .leaf h2'));
      check('handbook: a page on sore fingertips and practice in the head', /Sore fingertips/.test(page), page);

      // the player's own plan: a step left out stays out; the next song chosen among three
      const weekState = { weeks: { guitar: { id: 'scarborough-fair', start: Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000) } } };
      const own = await visit('', { instrument: 'guitar' }, '.plan', async (p) => {
        await p.locator('#editplan').click();
        await p.waitForSelector('.plan.editing');
        const boxes = await p.locator('.plan.editing input[data-kind]').count();
        await p.locator('.plan.editing input[data-kind="encore"]').uncheck();
        await p.waitForTimeout(300);
        await p.locator('#plandone').click();
        await p.waitForSelector('.plan:not(.editing)');
        const left = await txt(p, '.plan');
        return { boxes, out: !left.includes('Encore'), note: await txt(p, '.planrow') };
      }, undefined, weekState);
      check('own plan: a step can be left out, and it stays out', own.boxes >= 4 && own.out && /1 left out by you/.test(own.note), JSON.stringify({ boxes: own.boxes, out: own.out, note: own.note }));
      const chosen = await visit('week', { instrument: 'guitar' }, '[data-week]', async (p) => {
        const picks = await p.locator('[data-week]').count();
        const second = await p.locator('.wsong-pick h3').nth(1).innerText();
        await p.locator('[data-week]').nth(1).click();
        await p.waitForSelector('.wsong-hero h1');
        return { picks, second, title: await txt(p, '.wsong-hero h1') };
      }, undefined, weekState);
      check('song of the week: another is chosen among three, and the start page takes it', chosen.picks === 3 && chosen.title === chosen.second, `${chosen.picks} picks, chose ${chosen.second}, title ${chosen.title}`);

      // words: under the notes of a tune (K), and over the chords on the sing-along page
      const words = await visit('song/oh-susanna/1', { instrument: 'guitar' }, '#rowA text', async (p) => {
        await p.keyboard.press('k');
        await p.waitForTimeout(400);
        return (await p.locator('#rowA text.wd').allTextContents()).join(' ');
      });
      check('words: K puts the words of a tune under its notes', words.startsWith('I come from A-'), words);
      const sing = await visit('singalong/oh-susanna-chords', { instrument: 'guitar' }, '.sbar', async (p) => {
        const bars = await p.locator('.sbar').count();
        const first = await txt(p, '.sbar');
        await p.keyboard.press(' ');
        // one bar is counted in at 112 a minute; then the first chord, played by the practice instrument
        await p.waitForTimeout(2600);
        await p.keyboard.press('n');
        await p.waitForTimeout(1200);
        return { bars, first, heard: await p.locator('.sbar.heard').count() };
      });
      check('sing and play: the chords over the words, bar by bar; a bar whose chord is heard turns green', sing.bars === 8 && /C\s*I come from A-la-ba-/.test(sing.first) && sing.heard >= 1, JSON.stringify(sing));

      // a capo, and the tunings of the tuner
      const capo = await visit('song/amazing-grace-chords/1', { instrument: 'guitar', capo: 2 }, '#where', (p) => txt(p, '#where'));
      const tunings = await visit('tuner', { instrument: 'guitar' }, '#tuning', async (p) => {
        const n = await p.locator('#tuning option').count();
        await p.locator('#tuning').selectOption('dropd');
        await p.waitForTimeout(300);
        return { n, low: await txt(p, '#strings button'), note: await txt(p, '#tunnote') };
      });
      check('capo and tunings: the lesson says where the capo is; the tuner tunes seven tunings, warning where the lessons expect another', capo.includes('capo 2') && tunings.n === 7 && tunings.low.startsWith('D') && /tune back/.test(tunings.note), `${capo} | ${JSON.stringify(tunings)}`);

      // reading rhythm, and hammer-on and pull-off
      const rhythm = await visit('rhythm/1', { instrument: 'guitar' }, '#rhy ellipse', async (p) => ({ heads: await p.locator('#rhy ellipse').count(), levels: await p.locator('[data-lv]').count() }));
      check('reading rhythm: two bars of note values in six levels', rhythm.heads === 6 && rhythm.levels === 6, JSON.stringify(rhythm));
      const slur = await visit('slur/1', { instrument: 'guitar' }, '#tab path', async (p) => {
        const arc = (await p.locator('#tab text').allTextContents()).includes('h');
        await p.keyboard.press('n');
        await p.waitForTimeout(900);
        const second = await txt(p, '#h1');
        await p.keyboard.press('n');
        await p.waitForTimeout(900);
        return { arc, second, fbk: await txt(p, '#fbk') };
      });
      check('hammer-on and pull-off: an arc with h in the tab; the app waits for each note to sound', slur.arc && /Hammer on: fret 7/.test(slur.second) && /Round 1/.test(slur.fbk), JSON.stringify(slur));

      // both hands together on the piano
      const together = await visit('piano/mary-lamb~together/1', { instrument: 'piano' }, '#rowA text', async (p) => {
        const h1 = await txt(p, '#h1');
        await p.keyboard.press('n');
        await p.waitForTimeout(1200);
        return { h1, eb: await txt(p, '#eb') };
      });
      check('both hands together: a bass of the left with the melody of the right, struck at once and heard as one', /Both hands: C3 left, E4 right, together/.test(together.h1) && /key 2 of/.test(together.eb), JSON.stringify(together));

      // what stays, the progress file, the path
      const stay = await visit('repertoire', { instrument: 'guitar' }, '.stay', async (p) => (await p.locator('.stay').textContent()) ?? '');
      check('repertoire: whether coming back keeps the songs, or why it is too early to say', /Does coming back keep them\?/.test(stay) && /Too early to say/.test(stay), stay.slice(0, 120));
      const file = await visit('settings', { instrument: 'guitar' }, '#filemsg', async (p) => ({ msg: await txt(p, '#filemsg'), btn: await p.locator('#filenew').count() }));
      check('progress file: offered in the settings, to keep the progress in a file of your own', /in a file you choose/.test(file.msg) && file.btn === 1, file.msg.slice(0, 80));
      // what runs beside the path belongs to a skill on the Learn page: every skill opened in turn, its stages read
      const beside = async (p: Page): Promise<string[]> => {
        const names: string[] = [];
        for (let i = 0; i < (await p.locator('[data-skill]').count()); i++) {
          await p.locator('[data-skill]').nth(i).click();
          names.push(...(await p.locator('.sklevel b').allTextContents()));
        }
        return names;
      };
      const path = await visit('learn', { instrument: 'guitar' }, '[data-skill]', beside);
      const pathPiano = await visit('learn', { instrument: 'piano' }, '[data-skill]', beside);
      check('path: reading rhythm and slurs among the skills of the guitar, both hands together and rhythm among those of the piano', path.includes('Rhythm') && path.includes('Slurs') && pathPiano.includes('Together') && pathPiano.includes('Rhythm'), `${path.join(', ')} | ${pathPiano.join(', ')}`);

      // phones, standing and lying: nothing to scroll sideways, the bar in the window, lying the music with room
      const misfits: string[] = [];
      for (const size of [{ width: 390, height: 844, mobile: true }, { width: 844, height: 390, mobile: true }])
        for (const [route, instrument, wait] of [['', 'guitar', '.plan'], ['songs', 'guitar', '#list li'], ['song/amazing-grace-chords/2', 'guitar', '#rowA text'], ['piano/twinkle/1', 'piano', '#rowA text'], ['singalong/oh-susanna-chords', 'guitar', '.sbar'], ['tuner', 'guitar', '#strings']]) {
          const f = await visit(route, { instrument }, wait, (p) =>
            p.evaluate(() => {
              const bar = document.querySelector('.bar');
              const music = Math.max(0, ...[...document.querySelectorAll('.stage svg.fit, .stage canvas, .leadsheet')].map((el) => el.getBoundingClientRect().height));
              return { sideways: document.documentElement.scrollWidth > innerWidth + 1, barOut: !!bar && bar.getBoundingClientRect().bottom > innerHeight + 1, music: document.body.hasAttribute('data-fit') && !location.hash.includes('tuner') ? Math.round(music) : 999 };
            }), size);
          if (f.sideways || f.barOut || (size.width > size.height && f.music < 100)) misfits.push(`${route || 'today'} at ${size.width}x${size.height}: ${JSON.stringify(f)}`);
        }
      check('phones: standing and lying, nothing scrolls sideways, the bar stays in the window, lying the music 100 pixels high or more', misfits.length === 0, misfits.join('; '));

      // the hearing check: strings, chords and a muted hit asked for and judged, then what to change, and a file to save
      const hearing = async (instrument: string, n: number): Promise<{ h1: string; right: number; save: boolean }> =>
        visit('check', { instrument }, '#go', async (p) => {
          await p.keyboard.press(' ');
          await p.waitForTimeout(2600);
          for (let i = 0; i < n; i++) {
            await p.keyboard.press('n');
            await p.waitForTimeout(1300);
          }
          await p.waitForTimeout(600);
          return { h1: await txt(p, '#h1'), right: await p.locator('.checklist li.right').count(), save: await p.locator('#save').isVisible() };
        });
      const gCheck = await hearing('guitar', 11);
      const pCheck = await hearing('piano', 8);
      check('hearing check: what is asked for is heard and judged, with the room, the level, what to change, and a file to save', /^11 of 11 heard right\./.test(gCheck.h1) && gCheck.right === 11 && gCheck.save && /^8 of 8 heard right\./.test(pCheck.h1), `${JSON.stringify(gCheck)} | ${JSON.stringify(pCheck)}`);

      // a recording checked instead of playing live: real guitar recordings where they are here, otherwise synthesized
      const realCheck = haveGuitar && haveSteel;
      const checkSig = (() => {
        if (realCheck) return guitarCheckSet();
        const sr = 48000;
        const sig = new Float32Array(34 * sr);
        addNoise(sig, 0.001);
        let t = 2.6;
        for (const m of OPEN_STRINGS) {
          mixInto(sig, tone({ sr, midi: m, dur: 2 }), t * sr);
          t += 2.6;
        }
        for (const c of ['Em', 'Am', 'C', 'G']) {
          mixInto(sig, strum(chordNotes(CHORDS[c]), sr, 2), t * sr);
          t += 2.6;
        }
        mixInto(sig, strum(OPEN_STRINGS, sr, 0.3, { art: 'muted', amp: 0.2 }, 4), t * sr);
        return sig;
      })();
      const checkFile = wav(checkSig, 'check-guitar.wav');
      const fromFile = await visit('check', { instrument: 'guitar', a4: realCheck ? 435 : 440 }, '#fromfile', async (p) => {
        await p.locator('#file').setInputFiles(checkFile);
        await p.waitForFunction(() => /heard right in/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => undefined);
        return { h1: await txt(p, '#h1'), items: await p.locator('.checklist li.right').count(), save: await p.locator('#save').isVisible() };
      });
      check(`hearing check: a recording of ${realCheck ? 'a real guitar (strings, chords strummed from its notes, dead strings)' : 'a synthesized guitar'} loaded from a file is checked in the browser`, (realCheck ? /^11 of 11 heard right in check-guitar\.wav/ : /^1[01] of 11 heard right in check-guitar\.wav/).test(fromFile.h1) && fromFile.save, JSON.stringify(fromFile));

      // a phone lying on its side, with touch only: a lesson played by tapping, and the More panel opened by a tap
      const tapped = await visit('song/ode-guitar/1', { instrument: 'guitar' }, '#rowA text', async (p) => {
        for (let i = 0; i < 3; i++) {
          await p.locator('.practice button').first().tap();
          await p.waitForTimeout(700);
        }
        const eb = await txt(p, '#eb');
        await p.locator('#more summary').tap();
        await p.waitForTimeout(300);
        return { eb, more: await p.locator('.morepanel').isVisible() };
      }, { width: 844, height: 390, mobile: true });
      check('touch: on a phone a lesson is played by tapping, and the panel of More opens with a tap', /note 4 of/.test(tapped.eb) && tapped.more, JSON.stringify(tapped));

      check('what was still missing: no script errors', errors.length === 0, errors.join(' | '));
      await browser.close();
    }
  }],
  ['2f', async () => {
    // 2f. Freestyle: a solo over the band, played on the practice instrument's keys, which go into the same
    // listener as a guitar. Three notes are enough for a line: even off the beat they cannot shake it apart.
    {
      const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      await ctx.addInitScript(() => {
        if (!localStorage.getItem('noise-floor/v1')) localStorage.setItem('noise-floor/v1', JSON.stringify({ settings: { mic: false, practiceInstrument: true, lang: 'en', band: 'phones' } }));
      });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const arena = (): Promise<Record<string, string>> => page.evaluate(() => ({ ...(document.querySelector('#arena') as HTMLElement | null)?.dataset }) as Record<string, string>);

      await page.goto(base + '?autostart#/nf');
      await page.waitForSelector('#freecard', { timeout: 8000 }).catch(() => undefined);
      check('freestyle: the Games page of the guitar offers it', (await page.locator('#freecard').count()) === 1);

      await page.goto(base + '?autostart&intros#/free/night/12');
      await page.waitForSelector('.intro, .leaf, #brief', { timeout: 8000 }).catch(() => undefined);
      const introText = (await page.locator('body').textContent()) ?? '';
      check('freestyle: the first time, it is introduced before it is played', /Freestyle: a solo of your own|Plucking/i.test(introText), introText.replace(/\s+/g, ' ').slice(0, 160));

      await page.goto(base + '?autostart#/free/night/12');
      await page.waitForSelector('#brief', { timeout: 8000 });
      check('freestyle: before a run, the rules, the box and the spots', (await text(page, '#brief')).includes('Land it, or lose it') && (await page.locator('#brief [data-spot]').count()) === 2);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => (document.querySelector('#arena') as HTMLElement).dataset.view === 'play', null, { timeout: 10000 });
      // the low E, the open D (a string skipped), the E on the D string (Shift: fretted): a line that ends on E
      const beat = 60000 / 84;
      for (const k of ['a', 'd', 'Shift+D']) {
        await page.keyboard.press(k);
        await page.waitForTimeout(beat);
      }
      await page.waitForFunction(() => Number((document.querySelector('#arena') as HTMLElement).dataset.lines) >= 1, null, { timeout: 6000 }).catch(() => undefined);
      const landed = await arena();
      check('freestyle: three notes ending on E are a line, and two beats of rest land it', Number(landed.lines) >= 1 && Number(landed.score) >= 70, JSON.stringify(landed));
      await page.waitForFunction(() => (document.querySelector('#arena') as HTMLElement).dataset.view === 'end', null, { timeout: 20000 }).catch(() => undefined);
      const end = await arena();
      const best = await page.evaluate(() => JSON.parse(localStorage.getItem('noise-floor/v1') ?? '{}').best?.['free:night'] ?? 0);
      check('freestyle: the run ends after its time, with the score kept as the best', end.view === 'end' && (await page.locator('#result').count()) === 1 && best === Number(end.score), `${JSON.stringify(end)} best ${best}`);
      await page.keyboard.press('k');
      await page.waitForTimeout(300);
      const licks = await page.evaluate(() => JSON.parse(localStorage.getItem('noise-floor/v1') ?? '{}').licks ?? []);
      check('freestyle: the best line can be kept as a lick, as tab', licks.length === 1 && licks[0].notes.length >= 3 && licks[0].tricks.includes('skip'), JSON.stringify(licks).slice(0, 200));
      await page.keyboard.press('Space');
      await page.waitForFunction(() => ['count', 'play'].includes((document.querySelector('#arena') as HTMLElement).dataset.view ?? ''), null, { timeout: 4000 }).catch(() => undefined);
      check('freestyle: Space after a run starts the next one', ['count', 'play'].includes((await arena()).view));
      check('freestyle: no script errors', errors.length === 0, errors.join(' | '));
      await browser.close();
    }
  }],
  ['3', async () => {
    // 3. the voice, sung by the practice instrument, and the whole app in German
    {
      const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--lang=en-US'] });
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      await ctx.addInitScript(() => {
        if (!localStorage.getItem('noise-floor/v1')) localStorage.setItem('noise-floor/v1', JSON.stringify({ settings: { mic: false, practiceInstrument: true, instrument: 'voice', lang: 'en' } }));
      });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const h1 = (): Promise<string> => text(page, '#h1');
      /** the text as written, before the style sets it in capitals (and inside pictures too) */
      const raw = async (sel: string): Promise<string> => ((await page.locator(sel).first().textContent({ timeout: 4000 }).catch(() => '')) ?? '').replace(/\s+/g, ' ');

      await page.goto(base + '?autostart#/');
      await page.waitForSelector('.plan');
      check('voice: the first session finds the range, then tones sung back, a game of sung patterns and a song', (await page.locator('.plan li').count()) === 5 && (await text(page, '.plan')).includes('Find your range') && (await text(page, '.plan')).includes('Match the tone') && (await text(page, '.plan')).includes('Intervals by ear') && (await text(page, '.plan')).includes('Voice gym') && !!(await page.locator('.instmenu [data-inst="voice"]').textContent())?.includes('Voice'), (await text(page, '.plan')).replace(/\s+/g, ' '));
      await page.screenshot({ path: resolve(out, 'voice-home.png') });

      // step 1: the range, a low note held and a high one
      await page.keyboard.press('Space');
      await page.waitForSelector('#lane');
      check('voice: the session starts with the range, asking for a low note', (await text(page, '#eb')).includes('Step 1 of 5') && (await h1()).includes('low'), await h1());
      await pressUntilText(page, 'n', '#h1', 'high');
      await pressUntilText(page, 'n', '#h1', 'From');
      check('voice: a low and a high note sung are kept as the range, and songs follow it', /^From A2 to F♯4\.$/.test(await h1()) && (await text(page, '#fbk')).includes('Saved'), `${await h1()} | ${await text(page, '#fbk')}`);
      check('voice: when the range is measured, the step has one way on', (await page.locator('#fwd').isHidden()) && (await page.locator('#nextstep').count()) === 1, '');
      await page.screenshot({ path: resolve(out, 'voice-range.png') });
      await page.click('#nextstep');

      // step 2: five tones sung back
      await page.waitForSelector('#tiles');
      for (let r = 0; r < 5; r++) {
        await page.waitForFunction(() => /Now you/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
        if (r === 0) await page.screenshot({ path: resolve(out, 'voice-match.png') });
        await pressUntilText(page, 'n', '#fbk', r < 4 ? 'right on it' : 'level');
      }
      await page.waitForFunction(() => /of 5 notes found/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 6000 }).catch(() => undefined);
      check('voice: five tones sung back are measured in cents, and give a level', (await h1()) === '5 of 5 notes found.' && /On average \d+ cents? off/.test(await text(page, '#sub')) && (await text(page, '#fbk')).includes('Tones sung back: level'), `${await h1()} | ${await text(page, '#sub')} | ${await text(page, '#fbk')}`);
      await page.click('#nextstep');

      // step 3: intervals by ear, each named with a song that begins with it
      await page.waitForFunction(() => /Now sing/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
      check('voice: then intervals: a note is sung by the app, the distance named with a song that begins with it', /Now sing (a|an) /.test(await h1()) && /As at the start of /.test(await text(page, '#sub')) && (await page.locator('#tiles .tile').count()) === 4, `${await h1()} | ${await text(page, '#sub')}`);
      await pressUntilText(page, 'n', '#fbk', 'right on it');
      check('voice: an interval sung on pitch is taken, at the first try', (await text(page, '#tiles')).includes('first try'), await text(page, '#tiles'));
      await page.click('#nextstep');

      // step 4: the voice gym, sung patterns at the lighthouse
      await startRun(page);
      await page.waitForSelector('#con');
      check('voice: the voice gym shows the tune to sing, its notes named in the scale', /SING/.test(await raw('#con')) && /(do|re|mi)/.test(await raw('#con')) && /Sing [A-G]/.test(await raw('#con')), (await raw('#con')).slice(0, 120));
      const sungScore = async (): Promise<number> => Number((await text(page, '#score')).replace(/\D/g, '')) || 0;
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('n');
        await page.waitForTimeout(650);
      }
      check('voice: sung notes held on pitch are hits that score', (await sungScore()) > 0, `score ${await text(page, '#score')}`);
      await page.screenshot({ path: resolve(out, 'voice-gym.png') });
      await page.click('#skipstep');

      // step 5: the song, the app waiting for each note, its words under the notes
      await page.waitForSelector('#lane');
      check('voice: the song is moved into the measured range and waits for each note, with its syllable', /Ode to Joy/.test(await text(page, '#eb')) && (await h1()) === 'Sing E3: “Freu-”.', `${await text(page, '#eb')} | ${await h1()}`);
      for (let i = 0; i < 8 && !(await h1()).includes('Phrase done'); i++) {
        await page.keyboard.press('n');
        await page.waitForTimeout(1000);
      }
      check('voice: a phrase sung note by note is done, its speed measured, with no slip for staying on a note a moment', (await h1()).includes('Phrase done') && /% of full speed, no slips/.test(await text(page, '#fbk')), `${await h1()} | ${await text(page, '#fbk')}`);
      await page.screenshot({ path: resolve(out, 'voice-song.png') });

      // the same song with the click: each note judged by where the voice lay in it
      await page.goto(base + '?autostart#/sing/ode-to-joy~voice/2');
      await page.waitForSelector('#lane');
      await page.waitForTimeout(800);
      const until = Date.now() + 16000;
      while (Date.now() < until && !(await text(page, '#fbk')).includes('notes on pitch')) {
        if (/^[A-G]/.test(await h1())) {
          await page.keyboard.press('n');
          await page.waitForTimeout(450);
        } else await page.waitForTimeout(100);
      }
      check('voice: a phrase sung with the click is judged note by note', /\d+ of \d+ notes on pitch at \d+%/.test(await text(page, '#fbk')), await text(page, '#fbk'));

      // a tone held for five seconds
      await page.goto(base + '?autostart#/hold');
      await page.waitForFunction(() => /hold it for 5 seconds/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('n');
        await page.waitForTimeout(1500);
      }
      await page.waitForFunction(() => /Steady within|Too short/.test(document.querySelector('#h1')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
      check('voice: a held tone is measured by how steady it was, in cents', /Steady within \d+ cents\./.test(await h1()), `${await h1()} | ${await text(page, '#sub')}`);

      // the songs, the games, the handbook, the path of the voice
      await page.goto(base + '?autostart#/songs');
      await page.waitForSelector('#list li');
      check('voice: the songs to sing, easiest first, each saying where it lies in this voice', (await raw('.kick')).startsWith('Voice ·') && /In your voice: [A-G]/.test(await raw('#list')) && (await page.locator('#list a[href^="#/sing/"]').count()) >= 5, (await text(page, '.kick')));
      await page.goto(base + '?autostart#/nf');
      await page.waitForSelector('.cards');
      check('voice: the games of the voice: the voice gym, a song run and Stepping stones', (await page.locator('.cards .card').count()) === 3 && (await text(page, '.cards')).includes('Voice gym') && (await text(page, '.cards')).includes('Stepping stones'), (await text(page, '.cards')).replace(/\s+/g, ' ').slice(0, 120));
      await page.goto(base + '?autostart#/basics');
      await page.waitForSelector('#toc');
      check('voice: the voice has a handbook of its own', (await page.locator('#toc .chap').count()) === 5 && (await raw('#toc')).includes('Standing and breathing') && (await raw('#toc')).includes('A second voice') &&(await raw('.bookhead .kick')).includes('voice'), (await raw('#toc')).slice(0, 160));
      await page.goto(base + '?autostart#/learn');
      await page.waitForSelector('#stage h2');
      check('voice: the path of the voice goes from finding it over sung patterns to songs', (await page.locator('.stop').count()) === 6 && (await raw('.stops')).includes('Your voice, found and in tune') && (await raw('.stops')).includes('Steps and leaps, sung') && /scale/i.test(await skillStages(page)), `${await page.locator('.stop').count()} stones · ${await raw('.stops')} · ${await skillStages(page)}`);
      await page.goto(base + '?autostart#/stride');
      await page.waitForSelector('#brief');
      check('voice: Stepping stones with the voice: a sung “ta” on a note that changes every bar', (await text(page, '#brief')).includes('sung “ta”') && (await text(page, '#brief')).includes('The note changes at every bar line'), (await text(page, '#brief .how')).replace(/\s+/g, ' ').slice(0, 140));

      // the whole app in German: the language is chosen in the settings, and kept
      await page.goto(base + '?autostart#/settings');
      await page.waitForSelector('#lang');
      await page.selectOption('#lang', 'de');
      await page.waitForFunction(() => document.documentElement.lang === 'de', null, { timeout: 4000 }).catch(() => undefined);
      await page.goto(base + '?autostart#/');
      await page.waitForSelector('.plan');
      check('german: the language chosen in the settings turns the app German', (await page.locator('.nav .places a').allTextContents()).map((t) => t.replace(/\d/g, '').trim()).join(' ') === 'Heute Lernen Songs Spiele Fortschritt' && (await page.locator('.nav .gear').getAttribute('title')) === 'Einstellungen' && (await raw('[data-inst="voice"]')) === 'Stimme' && (await raw('.herosheet .kick')).startsWith('Heute') && /(Heutige Session|Weiter mit Schritt)/.test(await raw('#go')), `${await raw('.nav nav')} · ${await raw('[data-inst="voice"]')} · ${await raw('#go')}`);
      await page.reload();
      await page.waitForSelector('.plan');
      check('german: the language is kept', /^heute/i.test(await text(page, '.herosheet .kick')), await text(page, '.herosheet .kick'));
      await page.screenshot({ path: resolve(out, 'german-home.png') });
      await pickInstrument(page, 'guitar');
      await page.waitForFunction(() => document.querySelector('[data-inst="guitar"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 4000 }).catch(() => undefined);
      await page.waitForSelector('.wsong-choose h1', { timeout: 6000 }).catch(() => undefined);
      check('german: the guitar asks for the song of the week in German', (await text(page, '.wsong-choose h1')).includes('Welchen Song') && (await text(page, '[data-week] >> nth=0')).includes('Diesen'), (await text(page, '.wsong-choose h1')).slice(0, 160));
      await page.goto(base + '?autostart#/song/scarborough-fair');
      await page.waitForSelector('#h1');
      check('german: a lesson speaks German', /^(Greif|Halte|Zupf|Schlag)/.test(await h1()) && (await text(page, '.ladder')).includes('Lernen'), await h1());
      await page.goto(base + '?autostart#/nf');
      await page.waitForSelector('.cards');
      check('german: the games speak German', (await text(page, 'h1')) === 'Wähl ein Spiel.' && (await text(page, '.cards')).includes('Trittsteine'), await text(page, 'h1'));
      await page.goto(base + '?autostart#/settings');
      await page.waitForSelector('#lang');
      check('german: the settings speak German, and offer the language', (await text(page, 'h1')).length > 0 && (await page.locator('#lang option').count()) === 2 && (await page.locator('#lang').inputValue()) === 'de' && (await text(page, '.page')).includes('Mikrofon'), await text(page, 'h1'));
      await page.selectOption('#lang', 'en');
      await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 4000 }).catch(() => undefined);
      await page.goto(base + '?autostart#/');
      await page.waitForSelector('[data-week]');
      check('german: and back to English', (await text(page, '.wsong-choose h1')).includes('Which song'), await text(page, '.wsong-choose h1'));
      check('voice and german: no script errors', errors.length === 0, errors.join(' | '));
      await browser.close();
    }
  }],
];

// Side by side: one section at a time for every four cores of the processor (E2E_JOBS sets it; 1 runs them one
// after the other). More at once makes the browsers late on the click, which the timing checks then catch. The two
// long sections of the practice instrument start first, the short ones fill in beside them. Each check says which
// section it belongs to; a section that throws counts as failed. E2E_ONLY=2b,2c runs only those sections.
const only = process.env.E2E_ONLY?.split(',').map((x) => x.trim());
const chosen = sections.filter(([name]) => !only || only.includes(name));
// a name in E2E_ONLY that no section has (a typo) is a failure, not a run that quietly checks less
for (const name of only?.filter((n) => !sections.some(([s]) => s === n)) ?? []) check(`E2E_ONLY names a section there is: "${name}"`, false, `the sections are ${sections.map(([s]) => s).join(', ')}`);
const width = Math.max(1, Math.min(chosen.length, Number(process.env.E2E_JOBS) || Math.floor(cpus().length / 4)));
const LONG = ['2', '2p'];
try {
  const queue = [...chosen.filter(([name]) => LONG.includes(name)), ...chosen.filter(([name]) => !LONG.includes(name))];
  await Promise.all(
    Array.from({ length: width }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const [name, run] = job;
        await section.run({ name, repeated: 0 }, async () => {
          try {
            await run();
          } catch (e) {
            check(`section ${name} ran to its end`, false, String(e).slice(0, 300));
          }
        });
      }
    }),
  );
} finally {
  await server.close();
}

const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed} of ${results.length} browser checks passed in ${Math.round((Date.now() - began) / 1000)} s, ${width} sections at a time${skipped.length ? `; ${skipped.length} skipped (SKIP above)` : ''}`);
// a run in which nothing was checked has shown nothing: it fails
if (!results.length) console.log('No browser check ran.');
process.exit(failed || !results.length ? 1 : 0);
