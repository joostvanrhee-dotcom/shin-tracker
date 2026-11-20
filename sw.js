// Offline support. Bump VERSION whenever app files change.
const VERSION = 'v1';
const CACHE = `shin-tracker-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/stats.js',
  './js/store.js',
  './js/confetti.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shin-tracker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('.png')) event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(req));
});

async function fromCache(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === 'navigate') return caches.match(new URL('./index.html', self.registration.scope).href);
  return undefined;
}

// Network first (revalidating the HTTP cache) so updates appear on the next launch;
// fall back to the cache when offline or when the network is very slow.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(req.url, res.clone());
    return res;
  });
  network.catch(() => {}); // avoid unhandled rejection when the cache answers first
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, 'timeout'));
  try {
    const first = await Promise.race([network, timeout]);
    if (first !== 'timeout') return first;
    const cached = await fromCache(req);
    return cached || (await network);
  } catch {
    const cached = await fromCache(req);
    if (cached) return cached;
    return new Response('Offline and not cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: true });
  if (cached) return cached;
  return networkFirst(req);
}
