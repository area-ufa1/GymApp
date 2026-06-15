// Офлайн-кэш оболочки приложения. Стратегия: cache-first для своих ассетов.
const CACHE = 'gymquest-v3';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/store.js',
  './js/models.js',
  './js/lib/calc.js',
  './js/lib/dom.js',
  './js/lib/chart.js',
  './js/lib/analytics.js',
  './js/lib/effects.js',
  './js/lib/reminders.js',
  './js/lib/nutrition.js',
  './js/game/gamification.js',
  './js/data/seedPlan.js',
  './js/data/strengthLevels.js',
  './js/data/achievements.js',
  './js/screens/home.js',
  './js/screens/workout.js',
  './js/screens/nutrition.js',
  './js/screens/strength.js',
  './js/screens/progress.js',
  './js/screens/profile.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      // Кэшируем успешно загруженные собственные ресурсы.
      if (resp.ok && e.request.url.startsWith(self.location.origin)) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
