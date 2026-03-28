const CACHE_NAME = "macrofit-pwa-v1";
const SHELL_URLS = ["/", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        SHELL_URLS.map((path) =>
          cache.add(new Request(path, { cache: "reload" })).catch(() => {})
        )
      );
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function wantsHtml(request) {
  return (
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html")
  );
}

function offlineDocumentResponse() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Offline</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #09090b; color: #fafafa; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; text-align: center; }
    a { color: #a1a1aa; }
  </style>
</head>
<body>
  <div>
    <p style="font-size:1.125rem;margin-bottom:0.5rem;">You are offline.</p>
    <p style="color:#a1a1aa;font-size:0.875rem;">Reconnect, then try again.</p>
    <p style="margin-top:1rem;"><a href="/">Back to Macro Fit</a></p>
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const copy = response.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, copy);
        }
        return response;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        if (wantsHtml(event.request)) {
          const offlinePage = await caches.match("/offline");
          return offlinePage || offlineDocumentResponse();
        }

        return new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable",
        });
      }
    })()
  );
});
