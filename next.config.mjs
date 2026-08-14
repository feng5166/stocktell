/** @type {import('next').NextConfig} */
const nextConfig = {
  // web-push 用了动态 require,交给 Node 运行时直接加载,别让 Next 打包(否则 serverless 里崩)
  experimental: {
    serverComponentsExternalPackages: ["web-push"],
    // schema 启动哨兵(五轮 review W1 结构化建议):实例启动时核对关键索引形态,
    // 改库后忘跑 init-db 的窗口期从"静默吞错"变成"启动即飞书告警"。见 src/instrumentation.ts
    instrumentationHook: true,
  },
  // 旧平台域 308 到主域(SEO 旧索引污染修复,2026-08-14):stocktell.vercel.app 此前
  // 与 www.stocktell.me 双主机同内容各自 200,搜索引擎按旧 sitemap 把 vercel.app 当正主,
  // 索引长期停在 7 月快照。永久重定向 + sitemap/robots/canonical 切回主域,双管齐下。
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "stocktell.vercel.app" }],
        destination: "https://www.stocktell.me/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
