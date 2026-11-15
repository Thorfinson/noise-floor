import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runnerImport, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Writes into the service worker (public/sw.js) which files a build has: every file under assets/, the ones
 * the page loads first, and an id for the build. A new build is thereby a new worker, which drops the files of
 * the builds before it.
 */
export function stampWorker(source: string, files: string[], html: string): string {
  const assets = files.filter((f) => f.startsWith('assets/')).sort();
  const named = [...html.matchAll(/["'(](?:\.?\/)?(assets\/[^"'()\s?#]+)/g)].map((m) => m[1]);
  const start = [...new Set(named)].filter((f) => assets.includes(f)).sort();
  const id = createHash('sha256').update(JSON.stringify([assets, html])).digest('hex').slice(0, 12);
  const line = /^const BUILD = .*;$/m;
  if (!line.test(source)) throw new Error('public/sw.js: the line "const BUILD = …;" that the build fills in is missing');
  return source.replace(line, () => `const BUILD = ${JSON.stringify({ id, assets, start })};`);
}

/** The service worker of the built app, told which files this build has. */
function offline(): Plugin {
  let publicDir = '';
  return {
    name: 'noise-floor:offline',
    apply: 'build',
    configResolved: (config) => void (publicDir = config.publicDir),
    writeBundle(options, bundle) {
      const page = bundle['index.html'];
      const html = page && page.type === 'asset' ? String(page.source) : '';
      writeFileSync(resolve(options.dir!, 'sw.js'), stampWorker(readFileSync(resolve(publicDir, 'sw.js'), 'utf8'), Object.keys(bundle), html));
    },
  };
}

/**
 * Songs kept in src/music/private (see src/music/songbook.ts) are built into the app like all the others, so
 * that they can be played on this computer. Such a build must not be published: this says so, loudly, and how
 * many of them it holds.
 */
function privateSongs(): Plugin {
  let root = '';
  let found: string[] = [];
  return {
    name: 'noise-floor:private-songs',
    apply: 'build',
    configResolved: (config) => void (root = config.root),
    generateBundle() {
      found = [...this.getModuleIds()].filter((id) => /[\\/]src[\\/]music[\\/]private[\\/]/.test(id));
    },
    async closeBundle() {
      if (!found.length) return;
      let songs = 0;
      for (const id of found) {
        const { module } = await runnerImport<{ SONGS?: unknown[] }>(id, { root, configFile: false, logLevel: 'silent' }).catch(() => ({ module: {} as { SONGS?: unknown[] } }));
        songs += module.SONGS?.length ?? 0;
      }
      const what = songs ? `${songs} song${songs === 1 ? '' : 's'} from src/music/private` : `${found.length} file${found.length === 1 ? '' : 's'} of src/music/private`;
      const bar = '!'.repeat(78);
      console.warn(`\n\x1b[33m${bar}\n  This build holds ${what}.\n  It is for this computer only: do not publish it, nor put dist/ on a server others can reach.\n  For a build to publish, move src/music/private aside and build again.\n${bar}\x1b[0m\n`);
    },
  };
}

export default defineConfig({
  // relative paths: the built app runs from any folder, also from GitHub Pages under /noise-floor/
  base: './',
  plugins: [offline(), privateSongs()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  // the listener tests push minutes of synthesized audio through real signal processing: on a slow
  // machine (a shared CI runner) one of them can take a few minutes
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 240000 },
});
