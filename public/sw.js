/*
 * Noise Floor offline: whatever the app has loaded once is kept, so that it opens and plays without a
 * network. The page itself is asked for afresh whenever the network is there (so that a new version
 * arrives), and taken from the cache when it is not. The files under assets/ (scripts, styles, fonts, all
 * named by their content) come from the cache first; the few files without such a name (the icon, the web
 * manifest) too, but each is asked for again in the background, so that a changed one is there next time.
 * Nothing the player does is sent anywhere: this only keeps the app's own files.
 *
 * Each build writes into this file which files under assets/ it is made of (see vite.config.ts), so a new
 * version of the app is a new worker. It keeps the new page and the files the page starts with before it
 * takes over, and when it takes over it drops the files of earlier versions that this one no longer has. Of
 * the caches on this address (other apps can live under the same address) it removes only its own.
 */

// filled in by the build: an id for this version, every file under assets/ it has, and those the page loads first
const BUILD = { id: 'dev', assets: [], start: [] };

const CACHE = 'noise-floor-v1';
const OWN = 'noise-floor-';
const scope = () => self.registration.scope;
/** the path of a file of the app below its folder ("assets/index-1a2b.js", "icon.svg", "" for the page), or null */
const inApp = (url) => (url.startsWith(scope()) ? url.slice(scope().length).split(/[?#]/)[0] : null);
const isAsset = (path) => path.startsWith('assets/');
const known = new Set(BUILD.assets);
/** a file of another version (a page of it still open asks for its own): fetched, but not kept */
const foreign = (path) => isAsset(path) && known.size > 0 && !known.has(path);
// the app's own files are named by their content: a kept copy is the file, whatever headers a request
// sends (a module script asks with others than the page did when it kept it)
const any = { ignoreVary: true };

self.addEventListener('install', (event) => {
  // the page and what it starts with, fetched together: if one of them cannot be had, nothing is kept and
  // the worker before this one stays
  const first = [new Request(scope(), { cache: 'no-cache' }), ...BUILD.start.map((p) => scope() + p)];
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(first))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // only caches of this app: other apps on the same address keep theirs
      .then((names) => Promise.all(names.filter((n) => n.startsWith(OWN) && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => caches.open(CACHE))
      .then((c) =>
        c.keys().then((reqs) =>
          Promise.all(
            reqs
              .filter((r) => {
                // files of earlier versions, and what earlier workers kept that this one would not
                const path = inApp(r.url);
                return path === null || foreign(path) || r.url.includes('?');
              })
              .map((r) => c.delete(r)),
          ),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// the page names what it loaded before this worker was there (the first visit): those are kept too
self.addEventListener('message', (event) => {
  const urls = event.data && event.data.keep;
  if (!Array.isArray(urls)) return;
  const wanted = urls
    .map((u) => {
      const path = inApp(String(u));
      // the page is kept under its address without "?...", as a visit keeps it
      return path === null || foreign(path) ? null : path === '' || path === 'index.html' ? scope() + path : String(u);
    })
    .filter((u) => u !== null);
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(wanted.map((u) => c.match(u, any).then((hit) => hit || c.add(u).catch(() => undefined))))));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const path = req.method === 'GET' ? inApp(req.url) : null;
  if (path === null) return;
  const cache = caches.open(CACHE);
  // a good answer from the network is copied into the cache before the page gets it; the event lasts until
  // the copy is written, and a copy that cannot be written changes nothing
  const saving = [];
  const copy = (key) => (res) => {
    if (res && res.ok && !foreign(path)) {
      const clone = res.clone();
      saving.push(cache.then((c) => c.put(key, clone)).catch(() => undefined));
    }
    return res;
  };
  const saved = (p) => event.waitUntil(p.then(() => Promise.all(saving)).catch(() => undefined));

  if (req.mode === 'navigate') {
    // one page with its places after the '#': without a network, any address of it opens the kept page
    const page = scope() + path;
    const net = fetch(req).then(copy(page));
    event.respondWith(net.catch(() => cache.then((c) => c.match(page, any)).then((r) => r || cache.then((c) => c.match(scope(), any)))));
    saved(net);
    return;
  }
  const kept = cache.then((c) => c.match(req, any));
  if (isAsset(path)) {
    // named by its content: a kept copy is never out of date
    const answer = kept.then((hit) => hit || fetch(req).then(copy(req)));
    event.respondWith(answer);
    saved(answer);
    return;
  }
  // the icon, the manifest: the kept copy at once, and a fresh one kept for the next time
  const net = fetch(req).then(copy(req));
  event.respondWith(kept.then((hit) => hit || net));
  saved(net);
});
