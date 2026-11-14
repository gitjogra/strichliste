// Service Worker: App offline verfügbar machen.
// Bei Änderungen an der App die Versionsnummer erhöhen.
const CACHE = 'strichliste-v11';
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
// Externe Dateien, die zur Laufzeit zwischengespeichert werden (Schrift, Supabase-Bibliothek)
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  if (!sameOrigin && !RUNTIME_HOSTS.includes(url.hostname)) return; // z. B. Supabase-API nie cachen

  // Stale-while-revalidate: sofort aus dem Cache, im Hintergrund aktualisieren
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: sameOrigin });
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
