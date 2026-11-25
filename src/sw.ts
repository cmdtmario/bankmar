/// <reference lib="webworker" />
// Service worker: cache do app (PWA, RNF-05) e recebimento de push (RF-82).
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0] };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  const d = event.data?.json() ?? { titulo: 'BanKMar', corpo: '' };
  event.waitUntil(self.registration.showNotification(d.titulo, { body: d.corpo, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url ?? '/' } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? '/'));
});
