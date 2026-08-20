/** @type {import('next').NextConfig} */
const nextConfig = {
  // web-push 用了动态 require,交给 Node 运行时直接加载,别让 Next 打包(否则 serverless 里崩)
  experimental: {
    serverComponentsExternalPackages: ["web-push"],
    // schema 启动哨兵(五轮 review W1 结构化建议):实例启动时核对关键索引形态,
    // 改库后忘跑 init-db 的窗口期从"静默吞错"变成"启动即飞书告警"。见 src/instrumentation.ts
    instrumentationHook: true,
  },
};

export default nextConfig;
