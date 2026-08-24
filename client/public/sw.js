const SHELL_CACHE = "our-orbit-shell-v2";
const shellFiles = ["/", "/manifest.webmanifest", "/orbit-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(shellFiles)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/") || url.pathname.startsWith("/manus-storage/")) return;
  event.respondWith(caches.match(request).then((cached) => fetch(request).then((response) => {
    if (response.ok) caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => cached || (request.mode === "navigate" ? caches.match("/") : undefined))));
});
