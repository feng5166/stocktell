// StockTell 极简 Service Worker。
// 原则:不缓存 /api 和动态数据(行情/简报要实时);只对静态资源做 stale-while-revalidate,
// 页面导航走 network-first(离线时回退缓存)。避免"看到过期数据"。
const CACHE = "stocktell-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 实时数据接口绝不缓存
  if (url.pathname.startsWith("/api/")) return;

  // 页面导航:网络优先,离线回退缓存
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(request, net.clone());
          return net;
        } catch {
          const cached = await caches.match(request);
          return cached || caches.match("/");
        }
      })()
    );
    return;
  }

  // 静态资源:stale-while-revalidate
  if (
    url.pathname.startsWith("/_next/") ||
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?|css|js)$/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        const fetching = fetch(request)
          .then((net) => {
            cache.put(request, net.clone());
            return net;
          })
          .catch(() => cached);
        return cached || fetching;
      })()
    );
  }
});
