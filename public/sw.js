const cacheName = 'kolorlab-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    const shellUrl = self.registration.scope;
    const shellResponse = await fetch(shellUrl);
    if (!shellResponse.ok) throw new Error(`Не удалось кэшировать оболочку KolorLab (${shellResponse.status}).`);
    await cache.put(shellUrl, shellResponse);
    const manifestResponse = await fetch(new URL('precache-manifest.json', shellUrl));
    if (!manifestResponse.ok) return;
    const manifest = await manifestResponse.json();
    const files = new Set(Object.values(manifest).flatMap((entry) => [
      entry.file,
      ...(entry.css ?? []),
      ...(entry.assets ?? []),
    ]).filter((file) => typeof file === 'string'));
    await Promise.all([...files].map(async (file) => {
      const assetUrl = new URL(file, shellUrl);
      try {
        const response = await fetch(assetUrl);
        if (response.ok) await cache.put(assetUrl, response);
      } catch {
        return;
      }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith('kolorlab-shell-') && key !== cacheName)
      .map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await (await caches.open(cacheName)).put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) ?? caches.match(self.registration.scope);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await (await caches.open(cacheName)).put(request, response.clone());
    return response;
  })());
});
