/** @type {import('next').NextConfig} */
const nextConfig = {
  // web-push 用了动态 require,交给 Node 运行时直接加载,别让 Next 打包(否则 serverless 里崩)
  experimental: {
    serverComponentsExternalPackages: ["web-push"],
  },
};

export default nextConfig;
