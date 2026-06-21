// Офлайн-кэш оболочки приложения.
// Стратегия: network-first для своих ресурсов (свежий код при наличии сети),
// кэш — офлайн-фоллбэк. Так обновления подхватываются сразу, а не «залипают».
const CACHE = 'gymquest-v7';
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
  './js/lib/theme.js',
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
  const req = e.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return; // сторонние ресурсы не трогаем

  // Network-first: берём свежую версию, обновляем кэш; офлайн — отдаём из кэша.
  e.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return resp;
      })
      .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});
