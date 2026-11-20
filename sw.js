// Service Worker — الشيخ أحمد النفيس (إشعارات)
const VAPID_PUBLIC_KEY = 'BGI71snLHooY6idgH4NEJyx2WXNIpQjLnhCKIwuOYl7IcPhIecNNjHVTE3z-jsKuhdjHu1t1JUMwbV-neTn11es';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data && event.data.text() }; }
  const title = d.title || 'الشيخ أحمد النفيس';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: d.tag || 'nufais',
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        try { await c.navigate(url); } catch (e) {}
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

function b64ToU8(s) {
  const p = '='.repeat((4 - s.length % 4) % 4);
  const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC_KEY) });
    await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  })());
});
