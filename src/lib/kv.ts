// quotesCache 通用 KV 读写(review F10:此前 brief-status / holiday-bridge / webpush 标记
// 三处手写同样的 upsert/findUnique,收敛到这里)。全部 fail-safe:KV 坏了不连累调用方主流程。
import { getPrisma } from "@/lib/prisma";
import { dbReadRetry } from "@/lib/db-retry";

export async function kvSet(id: string, data: object): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  await db.quotesCache
    .upsert({ where: { id }, create: { id, data }, update: { data } })
    .catch(() => {});
}

export async function kvGet<T>(id: string): Promise<T | null> {
  const db = getPrisma();
  if (!db) return null;
  const row = await db.quotesCache.findUnique({ where: { id } }).catch(() => null);
  return (row?.data as T | undefined) ?? null;
}

// 带「读失败」区分的读(review F5):告警消费方必须能区分「记录不存在」和「读挂了」——
// 前者可能是共模故障信号,后者只是 DB 抖动,判级完全不同。瞬态错误先重试再认输。
export async function kvGetChecked<T>(
  id: string,
  label: string
): Promise<{ value: T | null; readFailed: boolean }> {
  const db = getPrisma();
  if (!db) return { value: null, readFailed: false }; // 无库=本地态,真没有
  try {
    const row = await dbReadRetry(() => db.quotesCache.findUnique({ where: { id } }), label);
    return { value: (row?.data as T | undefined) ?? null, readFailed: false };
  } catch {
    return { value: null, readFailed: true };
  }
}
