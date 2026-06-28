import { getPrisma } from "@/lib/prisma";

const TOKEN_EXPIRY_MINUTES = 10;

// 生成 6 位大写字母数字 token,前缀 ST
function genToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆字符
  let code = "ST";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// 为登录用户生成绑定 token(已有未过期的直接返回)
export async function getOrCreateBindToken(userId: string): Promise<string> {
  const db = getPrisma()!;
  const now = new Date();

  const existing = await db.weixinBindToken.findFirst({
    where: { userId, used: false, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing.token;

  let token = genToken();
  while (await db.weixinBindToken.findUnique({ where: { token } })) {
    token = genToken();
  }
  const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_MINUTES * 60 * 1000);
  await db.weixinBindToken.create({ data: { userId, token, expiresAt } });
  return token;
}

// ClawBot 收到 token 时调用:验证并完成绑定
export async function bindWeixinByToken(
  token: string,
  openId: string
): Promise<{ ok: boolean; error?: string }> {
  const db = getPrisma()!;
  const now = new Date();

  const rec = await db.weixinBindToken.findUnique({ where: { token } });
  if (!rec) return { ok: false, error: "token_not_found" };
  if (rec.used) return { ok: false, error: "token_used" };
  if (rec.expiresAt < now) return { ok: false, error: "token_expired" };

  const conflict = await db.user.findUnique({ where: { weixinOpenId: openId } });
  if (conflict && conflict.id !== rec.userId) {
    return { ok: false, error: "openid_taken" };
  }

  await db.$transaction([
    db.user.update({
      where: { id: rec.userId },
      data: { weixinOpenId: openId, weixinPendingScanAt: null },
    }),
    db.weixinBindToken.update({
      where: { token },
      data: { used: true },
    }),
  ]);
  return { ok: true };
}

// 扫码绑定:桥扫码激活后直接按账号落库(无需绑定码)。最近扫码者胜:若该 openId 已绑别的账号,先解绑旧账号。
export async function bindWeixinDirect(
  userId: string,
  openId: string
): Promise<{ ok: boolean; error?: string }> {
  const db = getPrisma()!;
  const conflict = await db.user.findUnique({ where: { weixinOpenId: openId } });
  if (conflict && conflict.id !== userId) {
    await db.user.update({ where: { id: conflict.id }, data: { weixinOpenId: null } });
  }
  await db.user.update({
    where: { id: userId },
    data: { weixinOpenId: openId, weixinPendingScanAt: null },
  });
  return { ok: true };
}

// 桥侧检测到扫码但用户还没发消息激活:记一个时间戳(已绑的不动),供站内提醒 + 后台统计。
export async function markWeixinScanned(userId: string): Promise<void> {
  const db = getPrisma()!;
  await db.user.updateMany({
    where: { id: userId, weixinOpenId: null },
    data: { weixinPendingScanAt: new Date() },
  });
}

export async function unbindWeixin(userId: string): Promise<void> {
  const db = getPrisma()!;
  await db.user.update({
    where: { id: userId },
    data: { weixinOpenId: null, weixinPendingScanAt: null },
  });
}
