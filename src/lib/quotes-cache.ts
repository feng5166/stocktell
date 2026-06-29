// 行情缓存(DB 全局):行情接口成功时写最新一份;断连/休市时读它,
// 让用户看到"上一次的真实行情 + 截至几号",而不是空白或编造的假数字。
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { Quote } from "@/lib/quotes";

const CACHE_ID = "latest"; // 个股池;ETF 用独立键 "etf"

export async function writeQuotesCache(
  quotes: Record<string, Quote>,
  id: string = CACHE_ID
): Promise<void> {
  const db = getPrisma();
  if (!db || Object.keys(quotes).length === 0) return;
  try {
    await db.quotesCache.upsert({
      where: { id },
      create: { id, data: quotes as unknown as Prisma.InputJsonValue },
      update: { data: quotes as unknown as Prisma.InputJsonValue },
    });
  } catch {
    /* 写缓存失败不致命 */
  }
}

export async function readQuotesCache(id: string = CACHE_ID): Promise<{
  quotes: Record<string, Quote>;
  asOf: string; // 缓存写入时间 ISO(= 上次行情成功的时刻)
} | null> {
  const db = getPrisma();
  if (!db) return null;
  try {
    const row = await db.quotesCache.findUnique({ where: { id } });
    if (!row) return null;
    return {
      quotes: row.data as unknown as Record<string, Quote>,
      asOf: row.updatedAt.toISOString(),
    };
  } catch {
    return null;
  }
}
