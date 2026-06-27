# StockTell 微信推送功能 - 技术实现文档

## 目标
用户在 stocktell.me 登录后，通过 ClawBot 绑定微信，每天早上 8 点收到和自选股相关的个性化简报推送。

---

## 整体流程

```
用户登录网站
  → 点「开启微信推送」按钮
  → 弹窗显示：ClawBot 微信号二维码 + 一次性绑定码
  → 用户扫码加 ClawBot 好友
  → 用户发送绑定码给 ClawBot
  → ClawBot 调后端接口完成绑定
  → 每天早上 8 点按自选股个性化推送
```

---

## 一、数据库变更（prisma/schema.prisma）

### 1. User 表加字段

```prisma
model User {
  id           String   @id @default(cuid())
  email        String?  @unique
  passwordHash String?  @map("password_hash")
  nickname     String?
  avatar       String?
  weixinOpenId String?  @unique @map("weixin_open_id")  // 新增
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("users")
}
```

### 2. 新增 WeixinBindToken 表

```prisma
model WeixinBindToken {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  token     String   @unique  // 6位大写字母数字，如 "ST4X9K"
  expiresAt DateTime @map("expires_at")
  used      Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@map("weixin_bind_tokens")
}
```

执行：`prisma db push`

---

## 二、新增文件清单

```
src/lib/weixin-bind.ts              # 绑定 token 生成/验证逻辑
src/app/api/push/weixin-token/route.ts   # 生成绑定 token 的 API
src/app/api/push/bind-weixin/route.ts    # ClawBot 回调：完成绑定
src/app/api/push/unbind-weixin/route.ts  # 解绑
src/app/api/cron/push-weixin/route.ts   # 定时推送 Cron
src/lib/push-weixin.ts              # 推送逻辑
```

---

## 三、各文件实现细节

### 3.1 `src/lib/weixin-bind.ts`

```typescript
import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";

const TOKEN_EXPIRY_MINUTES = 10;

// 生成6位大写字母数字 token，前缀 ST
function genToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆字符
  let code = "ST";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// 为登录用户生成绑定 token（已有未过期的直接返回）
export async function getOrCreateBindToken(userId: string): Promise<string> {
  const db = getPrisma()!;
  const now = new Date();

  // 查是否有未过期未使用的
  const existing = await db.weixinBindToken.findFirst({
    where: { userId, used: false, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing.token;

  // 生成新 token，避免碰撞
  let token = genToken();
  while (await db.weixinBindToken.findUnique({ where: { token } })) {
    token = genToken();
  }
  const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_MINUTES * 60 * 1000);
  await db.weixinBindToken.create({ data: { userId, token, expiresAt } });
  return token;
}

// ClawBot 收到 token 时调用：验证并完成绑定
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

  // 检查 openId 是否已绑定其他账号
  const conflict = await db.user.findUnique({ where: { weixinOpenId: openId } });
  if (conflict && conflict.id !== rec.userId) {
    return { ok: false, error: "openid_taken" };
  }

  // 完成绑定
  await db.$transaction([
    db.user.update({
      where: { id: rec.userId },
      data: { weixinOpenId: openId },
    }),
    db.weixinBindToken.update({
      where: { token },
      data: { used: true },
    }),
  ]);
  return { ok: true };
}

// 解绑
export async function unbindWeixin(userId: string): Promise<void> {
  const db = getPrisma()!;
  await db.user.update({
    where: { id: userId },
    data: { weixinOpenId: null },
  });
}
```

---

### 3.2 `src/app/api/push/weixin-token/route.ts`

登录用户调用，获取绑定 token。

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrCreateBindToken } from "@/lib/weixin-bind";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const token = await getOrCreateBindToken(session.user.id);
  return NextResponse.json({ ok: true, token });
}
```

---

### 3.3 `src/app/api/push/bind-weixin/route.ts`

ClawBot 收到用户发的 token 后，调此接口完成绑定。
用 `CLAWBOT_SECRET` 做鉴权，防止伪造。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { bindWeixinByToken } from "@/lib/weixin-bind";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // ClawBot 请求鉴权
  const secret = process.env.CLAWBOT_SECRET;
  if (secret && req.headers.get("x-clawbot-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { token, openId } = await req.json();
  if (!token || !openId) {
    return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
  }

  const result = await bindWeixinByToken(token, openId);

  // 返回给 ClawBot 的回复文案
  let replyText = "";
  if (result.ok) {
    replyText = "✓ 绑定成功！\n\n每天早上 8 点，只在你的自选股有动静时提醒你。\n没动静那天不打扰。\n\n发「解绑」可取消推送。";
  } else if (result.error === "token_expired") {
    replyText = "绑定码已过期（有效期 10 分钟），请回 stocktell.me 重新获取。";
  } else if (result.error === "token_used") {
    replyText = "这个绑定码已经用过了，请回 stocktell.me 重新获取。";
  } else if (result.error === "openid_taken") {
    replyText = "这个微信已绑定了另一个账号，如需换绑请先解绑原账号。";
  } else {
    replyText = "绑定失败，请重试或联系支持。";
  }

  return NextResponse.json({ ok: result.ok, error: result.error, replyText });
}
```

---

### 3.4 `src/app/api/push/unbind-weixin/route.ts`

用户在网站主动解绑，或 ClawBot 收到「解绑」关键词后调用。

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { unbindWeixin } from "@/lib/weixin-bind";

export const dynamic = "force-dynamic";

// 网站端：登录用户解绑自己
export async function DELETE(req: NextRequest) {
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/auth");
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await unbindWeixin(session.user.id);
  return NextResponse.json({ ok: true });
}

// ClawBot 端：通过 openId 解绑
export async function POST(req: NextRequest) {
  const secret = process.env.CLAWBOT_SECRET;
  if (secret && req.headers.get("x-clawbot-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { openId } = await req.json();
  if (!openId) return NextResponse.json({ ok: false, error: "missing openId" }, { status: 400 });

  const db = getPrisma()!;
  await db.user.updateMany({
    where: { weixinOpenId: openId },
    data: { weixinOpenId: null },
  });
  return NextResponse.json({
    ok: true,
    replyText: "已取消每日推送。随时回来发绑定码可以重新开启。",
  });
}
```

---

### 3.5 `src/lib/push-weixin.ts`

个性化推送逻辑，复用 digest.ts 的自选过滤模式。

```typescript
import { getPrisma } from "@/lib/prisma";
import { listBriefing, type BriefingItem } from "@/lib/briefings";

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const DOT: Record<string, string> = { 高: "🔴", 中: "🟡", 低: "🟢" };

function formatMessage(date: string, items: BriefingItem[]): string {
  const lines = [`📊 StockTell · ${date} 盘前提醒`, ""];
  lines.push(`你的自选今天有 ${items.length} 条相关动态：`, "");
  for (const it of items) {
    lines.push(`${DOT[it.impact] ?? ""} ${it.title}`);
    if (it.beneficiaries.length) {
      lines.push(`   → ${it.beneficiaries.map((b) => b.name).join(" · ")}`);
    }
    lines.push("");
  }
  lines.push("stocktell.me 看完整简报");
  lines.push("以上不构成投资建议");
  return lines.join("\n");
}

// 调 ClawBot 发消息给指定 openId
async function sendToClawBot(openId: string, text: string): Promise<boolean> {
  const apiUrl = process.env.CLAWBOT_API_URL;
  const secret = process.env.CLAWBOT_SECRET;
  if (!apiUrl) {
    console.log(`[push-weixin 降级] → ${openId}: ${text.slice(0, 50)}...`);
    return false;
  }
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-clawbot-secret": secret } : {}),
      },
      body: JSON.stringify({ openId, text }),
    });
    return res.ok;
  } catch (e) {
    console.error("[push-weixin] error:", e);
    return false;
  }
}

export async function runWeixinPush(): Promise<{
  ok: boolean;
  skipped?: string;
  date?: string;
  candidates: number;
  sent: number;
}> {
  const db = getPrisma();
  if (!db) return { ok: true, skipped: "no-db", candidates: 0, sent: 0 };

  const date = todayISO();
  const briefings = await listBriefing({ date, status: "published" });
  if (briefings.length === 0)
    return { ok: true, skipped: "no-briefing", candidates: 0, sent: 0 };

  // 查所有绑了微信的用户
  const users = await db.user.findMany({
    where: { weixinOpenId: { not: null } },
    select: { id: true, weixinOpenId: true },
  });
  if (users.length === 0)
    return { ok: true, skipped: "no-weixin-users", candidates: 0, sent: 0 };

  // 查所有自选
  const watches = await db.watchlist.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { userId: true, code: true },
  });
  const codesByUser = new Map<string, Set<string>>();
  for (const w of watches) {
    let set = codesByUser.get(w.userId);
    if (!set) { set = new Set(); codesByUser.set(w.userId, set); }
    set.add(w.code);
  }

  let candidates = 0;
  let sent = 0;
  for (const u of users) {
    if (!u.weixinOpenId) continue;
    const codes = codesByUser.get(u.id);
    if (!codes || codes.size === 0) continue;

    // 过滤相关简报：触发股或受益股在自选里
    const relevant = briefings.filter(
      (b) =>
        (b.triggerCode != null && codes.has(b.triggerCode)) ||
        b.beneficiaries.some((x) => codes.has(x.code))
    );
    if (relevant.length === 0) continue; // 没相关动态，不打扰

    candidates++;
    const text = formatMessage(date, relevant);
    if (await sendToClawBot(u.weixinOpenId, text)) sent++;
  }

  return { ok: true, date, candidates, sent };
}
```

---

### 3.6 `src/app/api/cron/push-weixin/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { runWeixinPush } from "@/lib/push-weixin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await runWeixinPush();
  return NextResponse.json(result);
}
```

---

## 四、vercel.json 更新

在 crons 数组里加一条：

```json
{
  "path": "/api/cron/push-weixin",
  "schedule": "0 0 * * *"
}
```

（UTC 0:00 = 北京时间 8:00）

---

## 五、前端：PwaActions.tsx 改造

在现有「开启每日推送」按钮旁边，增加微信推送入口。

**逻辑：**
- 用户未登录：不显示微信推送入口
- 用户已登录且未绑定：显示「💬 开启微信推送」按钮
- 用户已登录且已绑定：显示「✓ 微信推送已开启」（可点击解绑）

**点击「开启微信推送」后弹出小卡片：**

```
开启微信每日推送

1. 扫码添加 StockTell 助手
   [ClawBot 微信号二维码图片]

2. 将以下绑定码发给助手：
   ┌─────────┐
   │  ST4X9K │  [复制]
   └─────────┘
   （10 分钟内有效）

绑定后每天只在你的自选有动静时提醒
```

**调用接口：** `GET /api/push/weixin-token` 获取 token，展示在卡片里。

---

## 六、环境变量（.env.local.example 新增）

```
# ClawBot 微信推送
CLAWBOT_API_URL=         # ClawBot 发消息的 HTTP 接口地址
CLAWBOT_SECRET=          # 接口鉴权 secret
```

---

## 七、执行顺序

1. `prisma/schema.prisma` 加字段和新表
2. `prisma db push` 同步数据库
3. 新增 `src/lib/weixin-bind.ts`
4. 新增 `src/app/api/push/weixin-token/route.ts`
5. 新增 `src/app/api/push/bind-weixin/route.ts`
6. 新增 `src/app/api/push/unbind-weixin/route.ts`
7. 新增 `src/lib/push-weixin.ts`
8. 新增 `src/app/api/cron/push-weixin/route.ts`
9. 改造 `src/components/pwa/PwaActions.tsx`（加微信推送入口 + 弹窗）
10. 更新 `vercel.json` 加 cron
11. `.env.local.example` 补充新变量

---

## 八、验收标准

- [ ] 登录用户调 `/api/push/weixin-token` 返回 6 位 token
- [ ] 相同用户 10 分钟内重复调用返回同一 token
- [ ] `POST /api/push/bind-weixin` 绑定成功后 User.weixinOpenId 有值
- [ ] token 过期/已用/不存在时返回正确 error 和 replyText
- [ ] `POST /api/push/unbind-weixin` 解绑后 weixinOpenId 置 null
- [ ] cron 推送只给有自选且有相关简报的用户发消息
- [ ] 无相关动态的用户当天不收到推送
- [ ] 前端弹窗正确展示 token 和复制功能
