// Service Worker: App offline verfügbar machen, Updates aber sofort ausliefern.
// Bei Änderungen an der App die Versionsnummer erhöhen.
const CACHE = 'strichliste-v13';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/config.js',
  'js/storage.js',
  'js/strokes.js',
  'js/gestures.js',
  'js/stats.js',
  'js/sync.js',
  'js/exercises.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
];
// Externe Dateien, die sich nie ändern (feste Versionen) → aus dem Cache
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];
const NETWORK_TIMEOUT = 3000; // danach Cache nehmen (schlechtes Netz)

self.addEventListener('install', (e) => {
  // cache: 'reload' umgeht den Browser-Cache → garantiert alle Dateien aus derselben Version
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // App-Dateien: Netz zuerst (immer aktuell), offline/langsam → Cache
    e.respondWith(networkFirst(req));
  } else if (RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(cacheFirst(req));
  }
  // alles andere (z. B. Supabase-API) geht ungecacht durchs Netz
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req, { cache: 'no-cache' }), // beim Server nachfragen (meist nur kurzes „304 unverändert“)
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') return cache.match('index.html');
    throw new Error('offline und nicht im Cache');
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
