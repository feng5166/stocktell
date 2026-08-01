// StockTell 极简 Service Worker。
// 原则:不缓存 /api 和动态数据(行情/简报要实时);静态资源 stale-while-revalidate;
// 页面导航 network-first,离线只回退到内容固定的 /offline.html,绝不缓存任何页面快照
// (v2 曾缓存首页快照当离线壳,快照若是降级渲染会被反复回放——2026-08-01 微信 apex 实况)。
// 改版务必 bump 版本号。
const CACHE = "stocktell-v3";
const OFFLINE = "/offline.html"; // 纯静态离线页,内容固定,无任何动态依赖

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(OFFLINE).catch(() => {}))
  );
  self.skipWaiting();
});

// Web Push:收到推送显示通知。是否启用以服务端 lib/push.ts pushEnabled() 为唯一判定
// (配了 VAPID 即启用,WEB_PUSH_ENABLED=0 可停);broadcast 主路径在 briefing cron。
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

  // 页面导航:网络优先;离线统一回退到固定的 /offline.html(不缓存任何页面快照)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(OFFLINE)) || Response.error();
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
