// Bump this name whenever the app shell or bundled source content changes.
const CACHE_NAME = "axyp-v24";
const APP_SHELL = [
  "./",
  "./index.html",
  "./storage.js",
  "./case-folder-storage.js",
  "./data.js",
  "./incident-search.js",
  "./forms.js",
  "./docx-export.js",
  "./forms-view.js",
  "./docs-view.js",
  "./app.js",
  "./case-bundles.js",
  "./case-enhancements.js",
  "./hypotheses.js",
  "./security.js",
  "./template-library.js",
  "./dossier-templates-data.js",
  "./templates.js",
  "./manifest.json",
  "./vendor/fflate.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192.svg",
  "./icon-512.svg",
  "./icon-maskable.svg",
  "./CHANGELOG.md",
  "./PENDING.md",
  "./ΟΔΗΓΙΕΣ-ΧΡΗΣΗΣ.md",
  "./sources/kodikas-odikis-kykloforias.md",
  "./sources/kodikas-poinikis-dikonomias.md",
  "./sources/poinikos-kodikas.md"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        return request.mode === "navigate" ? caches.match("./index.html") : Response.error();
      }))
  );
});
