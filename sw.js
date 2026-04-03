const CACHE_NAME = 'water-v2';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const wakeMin = data.wakeMin ?? 420;
  const sleepMin = data.sleepMin ?? 1410;

  const now = new Date();
  const currentMin = now.getHours() * 60 + now.getMinutes();

  const inActiveWindow = sleepMin > wakeMin
    ? currentMin >= wakeMin && currentMin < sleepMin
    : currentMin >= wakeMin || currentMin < sleepMin;

  if (!inActiveWindow) return;

  e.waitUntil(
    self.registration.showNotification('💧 물 마실 시간이에요!', {
      body: '지금 물 한 잔 마셔요. 건강한 하루를 위해!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'water-reminder',
      renotify: true,
      vibrate: [200, 100, 200],
      actions: [{ action: 'drink', title: '마셨어요!' }]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'drink') {
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        const c = clients.find(c => c.url.includes(self.location.origin) && 'focus' in c);
        if (c) { c.focus(); c.postMessage({ type: 'DRINK_LOGGED' }); }
        else self.clients.openWindow('/?drink=1');
      })
    );
  } else {
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        const c = clients.find(c => 'focus' in c);
        if (c) c.focus();
        else self.clients.openWindow('/');
      })
    );
  }
});
