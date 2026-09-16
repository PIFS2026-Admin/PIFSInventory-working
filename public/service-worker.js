const TITAN_CACHE = "titan-pwa-shell-v6";
const TITAN_RUNTIME_CACHE = "titan-dti-runtime-v1";
const IS_LOCAL_DEVELOPMENT = ["localhost", "127.0.0.1"].includes(self.location.hostname);
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
      .then((keys) => Promise.all(keys.filter((key) => IS_LOCAL_DEVELOPMENT || ![TITAN_CACHE, TITAN_RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (IS_LOCAL_DEVELOPMENT) return;
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;
  if (STATIC_ASSETS.includes(requestUrl.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  if (requestUrl.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.open(TITAN_RUNTIME_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }));
    return;
  }

  const isDtiExecutionPage = event.request.mode === "navigate" && (
    requestUrl.pathname.startsWith("/dti/job-execution/") ||
    requestUrl.pathname === "/dti/inspection-reports" ||
    requestUrl.pathname.startsWith("/dti/inspection-reports/")
  );
  if (isDtiExecutionPage) {
    event.respondWith(caches.open(TITAN_RUNTIME_CACHE).then(async (cache) => {
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return (await cache.match(event.request)) || Response.error();
      }
    }));
  }
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
