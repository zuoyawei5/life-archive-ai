const CACHE_NAME = 'life-archive-ai-v1';
const urlsToCache = [
  'index.html',
  'app.js',
  'manifest.json',
  'assets/icon_192.png',
  'assets/icon_512.png',
  'assets/family_beach_400x300.png',
  'assets/travel_landscape_400x300.png',
  'assets/child_growth_400x300.png',
  'assets/food_photo_400x300.png',
  'assets/id_card_400x300.png',
  'assets/course_ppt_400x300.png',
  'assets/work_doc_400x300.png',
  'assets/blurry_photo_400x300.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    ))
  );
});