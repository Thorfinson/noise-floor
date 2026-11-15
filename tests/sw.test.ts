/**
 * The service worker (public/sw.js), run against stand-ins for the browser's caches and network: what a new
 * version keeps and drops, what it leaves to other apps on the same address, and how it answers.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stampWorker } from '../vite.config';

const SCOPE = 'https://thorfinson.github.io/noise-floor/';
const OTHER = 'https://thorfinson.github.io/another-app/';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

const html = (js: string, css: string): string => `<!doctype html><script type="module" crossorigin src="./assets/${js}"></script><link rel="stylesheet" crossorigin href="./assets/${css}"><link rel="icon" href="./icon.svg">`;
const OLD_PAGE = html('index-OLD.js', 'index-OLD.css');
const NEW_PAGE = html('index-NEW.js', 'index-NEW.css');

type Req = Request | { url: string; method?: string; mode?: string } | string;
const urlOf = (r: Req): string => (typeof r === 'string' ? new URL(r, SCOPE).href : r.url);
const noSearch = (u: string): string => u.split('?')[0];

/** The network: a file per address; off, every request fails. */
class Net {
  files = new Map<string, string>();
  online = true;
  asked: string[] = [];
  fetch = async (r: Req): Promise<Response> => {
    const url = urlOf(r);
    this.asked.push(url);
    if (!this.online) throw new TypeError('Failed to fetch');
    const body = this.files.get(noSearch(url));
    return body === undefined ? new Response('not found', { status: 404 }) : new Response(body, { status: 200 });
  };
}

/** One cache of the browser's Cache Storage, as far as the worker uses it. */
class FakeCache {
  entries = new Map<string, Response>();
  failPut = false;
  constructor(private net: Net) {}
  async match(r: Req, opts: { ignoreSearch?: boolean } = {}): Promise<Response | undefined> {
    const url = urlOf(r);
    const key = opts.ignoreSearch ? [...this.entries.keys()].find((k) => noSearch(k) === noSearch(url)) : url;
    return key === undefined ? undefined : this.entries.get(key)?.clone();
  }
  async put(r: Req, res: Response): Promise<void> {
    if (this.failPut) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.entries.set(urlOf(r), res);
  }
  async add(r: Req): Promise<void> {
    await this.addAll([r]);
  }
  async addAll(rs: Req[]): Promise<void> {
    const got = await Promise.all(rs.map(async (r) => [urlOf(r), await this.net.fetch(r)] as const));
    if (got.some(([, res]) => !res.ok)) throw new TypeError('Request failed');
    for (const [url, res] of got) this.entries.set(url, res);
  }
  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((u) => new Request(u));
  }
  async delete(r: Req): Promise<boolean> {
    return this.entries.delete(urlOf(r));
  }
  async text(url: string): Promise<string | undefined> {
    return this.entries.get(url)?.clone().text();
  }
}

/** A browser with the worker of one build loaded into it. */
function browser(build: { files: string[]; page: string }) {
  const net = new Net();
  const stores = new Map<string, FakeCache>();
  const open = (name: string): FakeCache => stores.get(name) ?? (stores.set(name, new FakeCache(net)), stores.get(name)!);
  const caches = {
    open: async (name: string) => open(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async () => {
      throw new Error('the worker should look only into its own cache');
    },
  };
  const handlers: Record<string, (event: unknown) => void> = {};
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => void (handlers[type] = fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    registration: { scope: SCOPE },
    location: new URL(SCOPE + 'sw.js'),
  };
  const code = stampWorker(source, build.files, build.page);
  new Function('self', 'caches', 'fetch', code)(self, caches, net.fetch);

  /** dispatches an event and waits for everything it asked to wait for */
  const dispatch = async (type: string, extra: object): Promise<void> => {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ ...extra, waitUntil: (p: Promise<unknown>) => void waits.push(p) });
    for (let i = 0; i < waits.length; i++) await waits[i];
  };
  /** a request of the page; null when the worker leaves it to the browser */
  const get = async (url: string, mode = 'cors', method = 'GET'): Promise<{ status: number; body: string } | null> => {
    let answer: Promise<Response | undefined> | undefined;
    const waits: Promise<unknown>[] = [];
    handlers.fetch({ request: { url, method, mode }, respondWith: (p: Promise<Response | undefined>) => void (answer = p), waitUntil: (p: Promise<unknown>) => void waits.push(p) });
    const res = answer ? await answer.catch(() => undefined) : null;
    for (let i = 0; i < waits.length; i++) await waits[i];
    if (res === null) return null;
    return res ? { status: res.status, body: await res.text() } : { status: 0, body: '' };
  };
  return { net, stores, open, dispatch, get, install: () => dispatch('install', {}), activate: () => dispatch('activate', {}) };
}

/** What a visitor has after using the last version: its files, a page kept with "?autostart", another app's cache. */
function lastVersionUsed(b: ReturnType<typeof browser>): void {
  const own = b.open('noise-floor-v1');
  const put = (url: string, body: string): void => void own.entries.set(url, new Response(body));
  put(SCOPE, OLD_PAGE);
  put(SCOPE + '?autostart', OLD_PAGE);
  put(SCOPE + 'assets/index-OLD.js', 'old script');
  put(SCOPE + 'assets/index-OLD.css', 'old styles');
  put(SCOPE + 'assets/plex-latin-400-SAME.woff2', 'font');
  put(SCOPE + 'icon.svg', 'old icon');
  b.open('noise-floor-v0').entries.set(SCOPE + 'assets/older.js', new Response('older'));
  b.open('another-app').entries.set(OTHER + 'app.js', new Response('theirs'));
  b.open('workbox-precache-v2').entries.set(OTHER + 'x.js', new Response('theirs too'));
}

const NEW_BUILD = { files: ['index.html', 'assets/index-NEW.js', 'assets/index-NEW.css', 'assets/plex-latin-400-SAME.woff2', 'assets/plex-latin-ext-400-NEW.woff2'], page: NEW_PAGE };

function serveNewVersion(b: ReturnType<typeof browser>): void {
  for (const [path, body] of Object.entries({ '': NEW_PAGE, 'assets/index-NEW.js': 'new script', 'assets/index-NEW.css': 'new styles', 'assets/plex-latin-400-SAME.woff2': 'font', 'assets/plex-latin-ext-400-NEW.woff2': 'font ext', 'icon.svg': 'new icon', 'manifest.webmanifest': '{}', 'assets/index-OLD.js': 'old script' }))
    b.net.files.set(SCOPE + path, body);
  b.net.files.set(OTHER + 'page.js', 'not ours');
}

describe('the service worker', () => {
  it('is told by the build which files it has, and which the page starts with', () => {
    const code = stampWorker(source, NEW_BUILD.files, NEW_PAGE);
    const line = /^const BUILD = (.*);$/m.exec(code)![1];
    const build = JSON.parse(line) as { id: string; assets: string[]; start: string[] };
    expect(build.assets).toEqual(['assets/index-NEW.css', 'assets/index-NEW.js', 'assets/plex-latin-400-SAME.woff2', 'assets/plex-latin-ext-400-NEW.woff2']);
    expect(build.start).toEqual(['assets/index-NEW.css', 'assets/index-NEW.js']);
    expect(build.id).toMatch(/^[0-9a-f]{12}$/);
    // another build is another worker
    expect(stampWorker(source, ['index.html', 'assets/index-X.js'], html('index-X.js', 'index-X.css'))).not.toBe(code);
    expect(() => stampWorker('self.addEventListener("fetch", () => {});', [], '')).toThrow(/BUILD/);
  });

  it('on a new version keeps the new page and its files, drops the old ones, and leaves other apps their caches', async () => {
    const b = browser(NEW_BUILD);
    lastVersionUsed(b);
    serveNewVersion(b);
    await b.install();
    const own = b.open('noise-floor-v1');
    expect(await own.text(SCOPE)).toBe(NEW_PAGE);
    expect(await own.text(SCOPE + 'assets/index-NEW.js')).toBe('new script');
    expect(await own.text(SCOPE + 'assets/index-NEW.css')).toBe('new styles');
    await b.activate();
    expect([...own.entries.keys()].sort()).toEqual([SCOPE, SCOPE + 'assets/index-NEW.css', SCOPE + 'assets/index-NEW.js', SCOPE + 'assets/plex-latin-400-SAME.woff2', SCOPE + 'icon.svg'].sort());
    // its own older caches go; those of other apps on the same address stay as they were
    expect([...b.stores.keys()].sort()).toEqual(['another-app', 'noise-floor-v1', 'workbox-precache-v2']);
    expect(await b.open('another-app').text(OTHER + 'app.js')).toBe('theirs');
  });

  it('changes nothing when the new version cannot be fetched whole', async () => {
    const b = browser(NEW_BUILD);
    lastVersionUsed(b);
    serveNewVersion(b);
    b.net.files.delete(SCOPE + 'assets/index-NEW.css');
    await expect(b.install()).rejects.toThrow();
    const own = b.open('noise-floor-v1');
    expect(await own.text(SCOPE)).toBe(OLD_PAGE);
    expect(own.entries.has(SCOPE + 'assets/index-NEW.js')).toBe(false);
  });

  it('answers from the cache without a network, and keeps no file of another version', async () => {
    const b = browser(NEW_BUILD);
    lastVersionUsed(b);
    serveNewVersion(b);
    await b.install();
    await b.activate();
    const own = b.open('noise-floor-v1');

    // a visit keeps the page under its address without "?…"
    expect(await b.get(SCOPE + '?autostart', 'navigate')).toEqual({ status: 200, body: NEW_PAGE });
    expect([...own.entries.keys()].some((u) => u.includes('?'))).toBe(false);
    // a font the page asks for later is kept; a file an old page still asks for is fetched, not kept
    expect(await b.get(SCOPE + 'assets/plex-latin-ext-400-NEW.woff2')).toEqual({ status: 200, body: 'font ext' });
    expect(await own.text(SCOPE + 'assets/plex-latin-ext-400-NEW.woff2')).toBe('font ext');
    expect(await b.get(SCOPE + 'assets/index-OLD.js')).toEqual({ status: 200, body: 'old script' });
    expect(own.entries.has(SCOPE + 'assets/index-OLD.js')).toBe(false);

    // the icon: the kept one at once, the new one fetched behind it and there the next time
    expect((await b.get(SCOPE + 'icon.svg'))?.body).toBe('old icon');
    expect((await b.get(SCOPE + 'icon.svg'))?.body).toBe('new icon');
    // a script named by its content comes from the cache without asking the network
    const asked = b.net.asked.length;
    expect((await b.get(SCOPE + 'assets/index-NEW.js'))?.body).toBe('new script');
    expect(b.net.asked.length).toBe(asked);

    // without a network: any address of the page opens the kept page, its files come from the cache
    b.net.online = false;
    expect(await b.get(SCOPE + '?autostart', 'navigate')).toEqual({ status: 200, body: NEW_PAGE });
    expect(await b.get(SCOPE + 'index.html', 'navigate')).toEqual({ status: 200, body: NEW_PAGE });
    expect((await b.get(SCOPE + 'assets/index-NEW.css'))?.body).toBe('new styles');
    expect((await b.get(SCOPE + 'icon.svg'))?.body).toBe('new icon');

    // what is not the app's own is left to the browser
    expect(await b.get(OTHER + 'page.js')).toBeNull();
    expect(await b.get(SCOPE + 'assets/index-NEW.js', 'cors', 'POST')).toBeNull();
  });

  it('answers even when a copy cannot be written', async () => {
    const b = browser(NEW_BUILD);
    serveNewVersion(b);
    b.open('noise-floor-v1').failPut = true;
    expect(await b.get(SCOPE + 'assets/plex-latin-ext-400-NEW.woff2')).toEqual({ status: 200, body: 'font ext' });
    expect(await b.get(SCOPE, 'navigate')).toEqual({ status: 200, body: NEW_PAGE });
    expect(b.open('noise-floor-v1').entries.size).toBe(0);
  });

  it('keeps what the first visit loaded before it was there, the page without "?…", nothing of another version', async () => {
    const b = browser(NEW_BUILD);
    serveNewVersion(b);
    await b.dispatch('message', { data: { keep: [SCOPE + '?autostart', SCOPE + 'assets/plex-latin-400-SAME.woff2', SCOPE + 'assets/index-OLD.js', OTHER + 'page.js'] } });
    expect([...b.open('noise-floor-v1').entries.keys()].sort()).toEqual([SCOPE, SCOPE + 'assets/plex-latin-400-SAME.woff2']);
  });
});
