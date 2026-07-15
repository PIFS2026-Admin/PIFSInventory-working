const TITAN_CACHE = "titan-pwa-shell-v3";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/maskable-icon-512.png",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/icons/titan-icon-192.png",
  "/icons/titan-icon-512.png",
  "/icons/titan-maskable-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(TITAN_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== TITAN_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;
  if (!STATIC_ASSETS.includes(requestUrl.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "TITAN",
      body: event.data ? event.data.text() : "New TITAN notification",
    };
  }

  const title = payload.title || "TITAN";
  const options = {
    body: payload.body || "New TITAN notification",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "titan-notification",
    renotify: true,
    timestamp: Date.now(),
    data: {
      url: payload.url || payload.actionUrl || "/home",
      conversationId: payload.conversationId || null,
      messageId: payload.messageId || null,
    },
    actions: [{ action: "open", title: "Open TITAN" }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/home", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url === targetUrl) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
