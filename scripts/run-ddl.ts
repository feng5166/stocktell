// CI 前置迁移(review P1:迁移顺序)。push main 后、Vercel 构建完成【之前】,
// 从 GH runner 直连生产库跑幂等 DDL——旧代码 + 新库(加法 DDL)永远安全,
// 消除「新代码上线、库还是旧形态」的窗口。与 /api/admin/init-db 共用 src/lib/db-ddl.ts 单一来源。
// 用法:POSTGRES_URL_NON_POOLING=<直连串> npx tsx scripts/run-ddl.ts
import { PrismaClient } from "@prisma/client";
import { DDL_STATEMENTS } from "../src/lib/db-ddl";

async function main() {
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL;
  if (!url) {
    console.error("[run-ddl] 缺 POSTGRES_URL_NON_POOLING(或 POSTGRES_PRISMA_URL)");
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.$transaction(
      async (tx) => {
        for (const stmt of DDL_STATEMENTS) await tx.$executeRawUnsafe(stmt);
      },
      { timeout: 30000 }
    );
    console.log(`[run-ddl] ${DDL_STATEMENTS.length} 条 DDL 已收敛(幂等)`);
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error("[run-ddl] 失败:", e);
  process.exit(1);
});
