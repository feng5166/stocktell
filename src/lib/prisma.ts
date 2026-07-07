import { PrismaClient } from "@prisma/client";

// 单例,避免 dev 热重载创建多个连接。无 POSTGRES_PRISMA_URL 时返回 null(数据层回退本地 JSON)。
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// 连接池参数兜底(2.1 第1周稳定性):Prisma 默认 pool_timeout=10s,07:00 cron 密集窗口下
// pgbouncer 冷启/排队偶发超过它(2026-07-07 canary 实证 P2024)。抬到 30s——cron 函数
// maxDuration 60~300s 吃得下,宁可慢一点拿到连接,也别 10s 就整段失败去烧 07:40 补位。
// connection_limit 不动:默认 5 对"单请求顺序查询"的 cron 足够;全站抬高反而可能把
// Neon 侧连接数顶爆(每个 serverless 实例各持一池)。env 里已显式配置的参数不覆盖。
function withPoolParams(url: string): string {
  if (url.includes("pool_timeout=")) return url;
  return url + (url.includes("?") ? "&" : "?") + "pool_timeout=30";
}

export function getPrisma(): PrismaClient | null {
  if (!process.env.POSTGRES_PRISMA_URL) return null;
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: {
        db: { url: withPoolParams(process.env.POSTGRES_PRISMA_URL) },
      },
    });
  }
  return globalForPrisma.prisma;
}
