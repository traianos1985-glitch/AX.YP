// Bump this name whenever the app shell or bundled source content changes.
const CACHE_NAME = "axyp-dev";
const NETWORK_TIMEOUT_MS = 3000;
const APP_SHELL = [
  "./",
  "./index.html",
  "./storage.js",
  "./service-profile.js",
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
  "./case-workflow.js",
  "./hypotheses.js",
  "./case-register.js",
  "./dossier-completeness.js",
  "./dossier-categories.js",
  "./security.js",
  "./template-library.js",
  "./template-data/narcotics.js",
  "./template-data/counterfeit.js",
  "./template-data/environment.js",
  "./template-data/health.js",
  "./noise-templates-data.js",
  "./camping-templates-data.js",
  "./paremporio-templates.js",
  "./templates.js",
  "./manifest.json",
  "./dossier-packages/manifest.json",
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
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  // Published DOCX packages may be substantially larger than ordinary app-shell assets.
  const timeoutMs = /\/dossier-packages\/[^/]+\.axyp\.zip$/u.test(requestUrl.pathname) ? 60000 : NETWORK_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  event.respondWith(
    fetch(request, { signal: controller.signal })
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
      .finally(() => clearTimeout(timeoutId))
  );
});
