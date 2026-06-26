// 自选/持仓数据层(服务端):仅登录用户落库。游客的本地自选在客户端 localStorage。
// 只存 code,且写入前用 STOCK_MAP 校验,挡掉脏数据。
import { getPrisma } from "@/lib/prisma";
import { STOCK_MAP } from "@/data/stocks";

export async function listWatchlist(userId: string): Promise<string[]> {
  const db = getPrisma();
  if (!db) return [];
  const rows = await db.watchlist.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { code: true },
  });
  return rows.map((r) => r.code).filter((c) => STOCK_MAP[c]);
}

export async function addWatch(userId: string, code: string): Promise<void> {
  if (!STOCK_MAP[code]) return;
  const db = getPrisma();
  if (!db) return;
  await db.watchlist.upsert({
    where: { userId_code: { userId, code } },
    create: { userId, code },
    update: {},
  });
}

export async function removeWatch(userId: string, code: string): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  await db.watchlist.deleteMany({ where: { userId, code } });
}

// 登录迁移:把游客本地自选并入库(跳过重复),返回合并后的全量。
export async function mergeWatchlist(
  userId: string,
  codes: string[]
): Promise<string[]> {
  const valid = Array.from(new Set(codes.filter((c) => STOCK_MAP[c])));
  const db = getPrisma();
  if (!db) return [];
  if (valid.length) {
    await db.watchlist.createMany({
      data: valid.map((code) => ({ userId, code })),
      skipDuplicates: true,
    });
  }
  return listWatchlist(userId);
}
