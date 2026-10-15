/* Yeti rich club : service worker de l'appli (installation + notifications push). Pas de cache : le site reste toujours à jour. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Yeti rich club', {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: 'icon-192.png',
    data: {url: d.url || self.registration.scope},
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        try { await c.focus(); } catch (_) {}
        c.postMessage({type: 'yeti-open', url});
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
