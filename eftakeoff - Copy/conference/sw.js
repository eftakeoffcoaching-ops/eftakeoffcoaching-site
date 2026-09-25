// Service worker: makes the app installable and usable offline.
// After publishing changes, bump VERSION so returning parents get the new files.
const VERSION = 'v2.2';
const CACHE = `ptcc-${VERSION}`;

const FILES = [
  './',
  './manifest.webmanifest',
  './css/styles.css',
  './js/config.js',
  './js/assets.js',
  './js/content.js',
  './js/content-zh.js',
  './js/storage.js',
  './js/app.js',
  './vendor/html2pdf.bundle.min.js',
  './assets/logo.png',
  './assets/logo-mark.png',
  './assets/qr-official-account.png',
  './assets/qr-wechat.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './fonts/dm-sans-latin-400-normal.woff2',
  './fonts/dm-sans-latin-500-normal.woff2',
  './fonts/dm-sans-latin-700-normal.woff2',
  './fonts/dm-sans-latin-400-italic.woff2',
  './fonts/dm-serif-display-latin-400-normal.woff2',
];

// Hosts such as Cloudflare Pages redirect /index.html to /. Browsers refuse to
// show a redirected response for a page load, so store a clean copy instead.
function clean(res) {
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(FILES.map((url) => fetch(url).then((res) => {
        if (!res.ok) throw new Error(`Could not cache ${url}`);
        return cache.put(url, res.redirected ? clean(res) : res);
      }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ptcc-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Serve from the cache straight away (fast, works offline), and refresh the
// cached copy in the background so the next visit gets any updates.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.redirected ? clean(res.clone()) : res.clone());
        return res.redirected ? clean(res) : res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
