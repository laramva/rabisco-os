/* Offline-first service worker: precache the app shell, cache everything else on first use. */
const VERSION = "rabisco-os-v1.2.0";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png",
  "icon-maskable-512.png", "apple-touch-icon.png",
  "data/courses.js", "data/ex-fundamentos.js", "data/ex-semirrealista.js", "data/ex-cartoon.js", "data/ex-fad.js",
  "data/ex-tradicional.js", "data/ex-extras.js", "data/challenges.js", "data/lab.js", "data/tips.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "rabisco-runtime").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "api.github.com") return; // sync must always hit the network

  if (url.origin === location.origin) {
    // app files: network first, skipping the browser's HTTP cache so every file updates together; cache as fallback
    e.respondWith(
      fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" })).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
    );
    return;
  }
  // fonts and reference images: cache first, keep a copy for offline
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open("rabisco-runtime").then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => hit))
  );
});
