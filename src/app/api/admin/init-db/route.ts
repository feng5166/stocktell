import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/api-guard";
import { DDL_STATEMENTS } from "@/lib/db-ddl";

export const dynamic = "force-dynamic";

// 幂等改库端点。DDL 全部收敛在 src/lib/db-ddl.ts(单一来源,review P1:迁移顺序)——
// CI 前置迁移(scripts/run-ddl.ts)与本端点跑同一份语句。加 DDL 的三处相邻改约定见 db-ddl.ts 头注释。
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no database" }, { status: 500 });
  try {
    // 全部 DDL 包进单个事务:中途任一条失败则整体回滚,不会留半套表结构(B5)
    await db.$transaction(
      async (tx) => {
        for (const stmt of DDL_STATEMENTS) await tx.$executeRawUnsafe(stmt);
      },
      { timeout: 30000 }
    );
    const count = await db.passwordResetToken.count();
    return NextResponse.json({
      ok: true,
      message: `ready: ${DDL_STATEMENTS.length} 条 DDL 已收敛(单一来源 lib/db-ddl.ts)`,
      count,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
