// 分享短链(2.3 P0-3,viral-growth-plan §6):自建短链 + 归因。
// 设计红线(方案 §4/§8):
// - target 只允许站内路径(/ 开头)——绝不做开放跳转;
// - 每 (cardType, date) 一条,全量同款卡共用一链——短链不与 userId joinable(隐私红线 §8.7);
// - 短链域走 SHARE_BASE_URL(独立承接子域/独立域名,主站被封不连累;未配置时回落 SITE_URL,
//   仅供上线前本地/预览验证,正式发卡前必须配置隔离域——方案 §8.2 域名存亡风险)。
import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";

export type ShareCardType = "sentiment" | "stock";

export const shareBaseUrl = () => process.env.SHARE_BASE_URL || SITE_URL;

const genCode = () => crypto.randomBytes(4).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || crypto.randomBytes(3).toString("hex");

// 取/建当日某卡型的短链(幂等:唯一键 (cardType,date);并发建碰唯一约束则重读)。
export async function getOrCreateShareLink(
  cardType: ShareCardType,
  date: string,
  target: string
): Promise<{ code: string; url: string } | null> {
  if (!target.startsWith("/")) return null; // 站内路径红线
  const db = getPrisma();
  if (!db) return null;
  const existing = await db.shortLink
    .findUnique({ where: { cardType_date: { cardType, date } } })
    .catch(() => null);
  if (existing) return { code: existing.code, url: `${shareBaseUrl()}/s/${existing.code}` };
  try {
    const row = await db.shortLink.create({
      data: { code: genCode(), target, cardType, date },
    });
    return { code: row.code, url: `${shareBaseUrl()}/s/${row.code}` };
  } catch {
    // 并发创建撞唯一键(cardType,date 或 code)→ 重读一次
    const row = await db.shortLink
      .findUnique({ where: { cardType_date: { cardType, date } } })
      .catch(() => null);
    return row ? { code: row.code, url: `${shareBaseUrl()}/s/${row.code}` } : null;
  }
}

export async function resolveShareLink(
  code: string
): Promise<{ target: string; cardType: string } | null> {
  const db = getPrisma();
  if (!db) return null;
  const row = await db.shortLink.findUnique({ where: { code } }).catch(() => null);
  if (!row || !row.target.startsWith("/")) return null;
  // hits 粗归因,fire-and-forget(失败不影响跳转)
  db.shortLink.update({ where: { code }, data: { hits: { increment: 1 } } }).catch(() => {});
  return { target: row.target, cardType: row.cardType };
}
