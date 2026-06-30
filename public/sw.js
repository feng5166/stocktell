// StockTell 极简 Service Worker。
// 原则:不缓存 /api 和动态数据(行情/简报要实时);静态资源 stale-while-revalidate;
// 页面导航 network-first,离线只回退到一个「首页外壳」,绝不缓存每个动态/登录态页面
// (否则会回放过期、甚至别人登录态的 HTML)。改版务必 bump 版本号。
const CACHE = "stocktell-v2";
const SHELL = "/"; // 首页已是 ISR(无个性化 SSR),可作离线外壳

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

// Web Push:收到推送显示通知(目前产品侧未启用 Web Push,保留处理器无害)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "StockTell", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      for (const c of list) {
        try {
          if (new URL(c.url).pathname === url && "focus" in c) return c.focus();
        } catch {
          /* ignore */
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
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
  // SW 自身永不走缓存,保证能更新
  if (url.pathname === "/sw.js") return;
  // 实时数据接口绝不缓存
  if (url.pathname.startsWith("/api/")) return;

  // 页面导航:网络优先;离线统一回退到首页外壳(不缓存每个动态页)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(SHELL)) || Response.error();
        }
      })()
    );
    return;
  }

  // 静态资源:stale-while-revalidate(_next 带 hash,安全)
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
