import { PrismaClient } from "@prisma/client";

// 单例,避免 dev 热重载创建多个连接。无 POSTGRES_PRISMA_URL 时返回 null(数据层回退本地 JSON)。
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPrisma(): PrismaClient | null {
  if (!process.env.POSTGRES_PRISMA_URL) return null;
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}
