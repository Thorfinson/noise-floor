/*
 * Noise Floor offline: whatever the app has loaded once is kept, so that it opens and plays without a
 * network. The page itself is asked for afresh whenever the network is there (so that a new version
 * arrives), and taken from the cache when it is not. Everything else (scripts, styles, fonts, all named by
 * their content) comes from the cache first. Nothing the player does is sent anywhere: this only keeps the
 * app's own files.
 */
const CACHE = 'noise-floor-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// the page names what it loaded before this worker was there (the first visit): those are kept too
self.addEventListener('message', (event) => {
  const urls = event.data && event.data.keep;
  if (!Array.isArray(urls)) return;
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(urls.filter((u) => new URL(u).origin === self.location.origin).map((u) => c.match(u, { ignoreVary: true }).then((hit) => hit || c.add(u).catch(() => undefined)))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const keep = (res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };
  // the app's own files are named by their content: a kept copy is the file, whatever headers a request
  // sends (a module script asks with others than the page did when it kept it)
  const any = { ignoreVary: true };
  if (req.mode === 'navigate') {
    // one page with its places after the '#': without a network, any address of it opens the kept page
    event.respondWith(fetch(req).then(keep).catch(() => caches.match(req, { ...any, ignoreSearch: true }).then((r) => r || caches.match('./', any))));
    return;
  }
  event.respondWith(caches.match(req, any).then((hit) => hit || fetch(req).then(keep)));
});
