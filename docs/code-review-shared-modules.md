# 代码 Review:应抽取为公用模块的重复代码

> 目的:消除散落在各文件里的重复逻辑/常量,降低"改一处忘其它处"的漂移风险。
> 背景:此前 header 因每页各写一份导致登录态、导航链接对不齐,已抽 `components/SiteHeader.tsx` 修复。本文档列出**其余同类问题**。
> 范围:`src/` 全量。下表"处数"指**各自独立定义的份数**(不含引用)。

## 速览(按优先级)

| # | 重复项 | 处数 | 建议新模块 | 优先级 |
|---|---|---|---|---|
| 1 | `todayISO()`(Asia/Shanghai 日期) | 8 | `lib/date.ts` | 🔴 高 |
| 2 | `beijingWeekday()` | 3 | `lib/date.ts` | 🔴 高 |
| 3 | Cron 鉴权(`Bearer ${CRON_SECRET}`) | 5 | `lib/api-guard.ts` | 🔴 高 |
| 4 | Admin 鉴权(`ADMIN_TOKEN`) | 3 | `lib/api-guard.ts` | 🔴 高 |
| 5 | `changeClass` + `fmtChange`(红涨绿跌/百分比) | 2 | `lib/format.ts` | 🟡 中 |
| 6 | 影响等级映射(`IMPACT_DOT`/`IMPACT_META`) | 3 | `lib/impact.ts` | 🟡 中 |
| 7 | Resend 发邮件 | 2 | `lib/mailer.ts` | 🟡 中 |
| 8 | 表格 `Th`/`Td` 原子 | 2 | `components/Table.tsx`(或不动) | 🟢 低 |
| 9 | "不构成投资建议…"免责文案 | 10 | `lib/constants.ts` 常量 | 🟢 低 |

## ⚠️ 协作注意
- 第 1/2/3 项的不少重复出现在**维护者正在做的 push 系列文件**(`api/cron/push-web`、`api/cron/push-feishu`、`api/cron/push-weixin`、`lib/push-weixin.ts`、`lib/feishu.ts`、`lib/tushare.ts`)。改这些前请与维护者确认,避免撞车;可先改稳定文件,push 系列等其 WIP 收口或由其本人迁移。
- 全程**只暂存自己改动的文件**(`git add <file>`,勿 `git add -A`)。
- 每改完一项跑 `npx tsc --noEmit` + `npm run build` 双过再提交。

---

## 1. `todayISO()`(Asia/Shanghai 当日 `YYYY-MM-DD`)🔴

**重复定义(8 处):**
`src/app/page.tsx`、`src/app/api/briefing/news/route.ts`、`src/app/api/cron/push-web/route.ts`、`src/app/api/cron/push-feishu/route.ts`、`src/app/stock/[code]/page.tsx`、`src/lib/push-weixin.ts`、`src/lib/digest.ts`、`src/lib/generate.ts`(此处是 `export`,`cron/briefing`、`cron/outcome` 从它 import)。

**新建 `src/lib/date.ts`:**
```ts
// 统一时区/日期工具(此前散在 8+ 处各写一份)
export function todayISO(): string {
  // Asia/Shanghai 当日 YYYY-MM-DD(en-CA 直接给该格式)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function beijingWeekday(): number {
  // 0=周日 .. 6=周六
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[s] ?? -1;
}
```

**迁移:**
- 各文件删除本地 `todayISO`,改 `import { todayISO } from "@/lib/date";`。
- `lib/generate.ts`:删除本地定义,改为 `export { todayISO } from "@/lib/date";`(保持现有 `import { todayISO } from "@/lib/generate"` 的调用方不破)——或把那些调用方一并改成从 `@/lib/date` 引。

**完成标准:** 全仓 `grep -rn "function todayISO" src/` 只剩 0 处(全部 import);构建通过。

---

## 2. `beijingWeekday()` 🔴

**重复定义(3 处):** `src/app/api/cron/outcome/route.ts`、`src/app/api/cron/briefing/route.ts`、`src/lib/feishu.ts`。

**迁移:** 见上,并入 `lib/date.ts`,三处改为 import。
**完成标准:** `grep -rn "function beijingWeekday\|Sun: 0, Mon: 1" src/` 仅剩 `lib/date.ts`。

---

## 3. Cron 鉴权(`Bearer ${CRON_SECRET}`)🔴

**重复(5 处,且写法已不一致):**
- `cron/briefing`、`cron/outcome`:`if (secret) { if (header !== Bearer) 401 }`
- `cron/push-web`、`cron/push-feishu`、`cron/push-weixin`:`if (secret && header !== Bearer) 401`

两者逻辑等价(未配 secret 则不拦),应统一。

**新建 `src/lib/api-guard.ts`:**
```ts
import type { NextRequest } from "next/server";

// cron 鉴权:配了 CRON_SECRET 就校验 Authorization: Bearer;未配则放行(与现状一致)
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// admin 鉴权:?token= 必须等于 ADMIN_TOKEN(未配 ADMIN_TOKEN 一律拒)
export function isAdminAuthorized(req: NextRequest): boolean {
  const token = req.nextUrl.searchParams.get("token");
  return !!process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
}
```

**迁移(每个 cron 路由开头):**
```ts
import { isCronAuthorized } from "@/lib/api-guard";
// ...
if (!isCronAuthorized(req)) {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
```
**完成标准:** cron 路由内不再出现 `CRON_SECRET` 字面量(只在 `api-guard.ts`)。

---

## 4. Admin 鉴权(`ADMIN_TOKEN`)🔴

**重复(3 处,逐字相同):** `api/admin/init-db`、`api/admin/backtest`、`api/admin/backtest-ingest`。

**迁移:**
```ts
import { isAdminAuthorized } from "@/lib/api-guard";
// ...
if (!isAdminAuthorized(req)) {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
```
**完成标准:** admin 路由内不再出现 `ADMIN_TOKEN` 字面量。

---

## 5. `changeClass` + `fmtChange`(A股红涨绿跌 + 百分比)🟡

**重复(2 处,完全相同):** `src/components/Dashboard.tsx`、`src/app/track/page.tsx`。

**新建 `src/lib/format.ts`:**
```ts
// A股惯例:红涨绿跌
export function changeClass(v: number): string {
  if (v > 0) return "text-rose-600";
  if (v < 0) return "text-emerald-600";
  return "text-gray-400";
}
export function fmtChange(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}
```
**迁移:** 两文件删本地定义,改 import。
**注意:** Dashboard 还有 `livePrice/liveChange/liveChangeClass`(行情未连接显示 "—"),它们依赖 `Stock.live`,属于 Dashboard 业务,可留在原处或一并迁入 `format.ts`(可选)。
**完成标准:** `grep -rn "function changeClass" src/` 仅剩 `lib/format.ts`。

---

## 6. 影响等级映射(高/中/低 → 颜色/emoji/文案)🟡

**重复且不一致(3 处):**
- `components/BriefingFeed.tsx`:`IMPACT_META = { 高:{dot:"🔴",label:"高影响",ring:"border-rose-200"}, ... }`
- `app/track/page.tsx`:`IMPACT_DOT = { 高:"🔴", 中:"🟡", 低:"🟢" }`(emoji)
- `app/admin/briefing/page.tsx`:`IMPACT_DOT = { 高:"bg-rose-500", ... }`(**色块 class,语义不同**)

**新建 `src/lib/impact.ts`(一个来源,覆盖三种用法):**
```ts
export type Impact = "高" | "中" | "低";

export const IMPACT_META: Record<
  Impact,
  { emoji: string; label: string; ring: string; dotClass: string }
> = {
  高: { emoji: "🔴", label: "高影响", ring: "border-rose-200", dotClass: "bg-rose-500" },
  中: { emoji: "🟡", label: "中影响", ring: "border-amber-200", dotClass: "bg-amber-500" },
  低: { emoji: "🟢", label: "低影响", ring: "border-emerald-200", dotClass: "bg-emerald-500" },
};
```
**迁移:**
- BriefingFeed:`meta.dot` → `meta.emoji`(其余字段同名)。
- track:`IMPACT_DOT[x]` → `IMPACT_META[x].emoji`。
- admin:`IMPACT_DOT[x]`(色块)→ `IMPACT_META[x].dotClass`。
- `Impact` 类型目前定义在 `lib/briefings.ts`,注意避免重复声明:`impact.ts` 可 `import type { Impact } from "@/lib/briefings"`,或反过来由 `impact.ts` 导出、`briefings.ts` 复用——二选一,别两边都 `export type Impact`。
**完成标准:** `grep -rn "IMPACT_DOT" src/` 为 0;影响色/emoji 只在 `impact.ts`。

---

## 7. Resend 发邮件 🟡

**重复(2 处,各自 `new Resend` + `EMAIL_FROM` 兜底 + 未配降级打印):** `src/lib/password-reset.ts`(`sendResetEmail`)、`src/lib/digest.ts`(内部 `sendDigest`)。

**新建 `src/lib/mailer.ts`:**
```ts
import { Resend } from "resend";

// 统一发信:未配 RESEND_API_KEY 时降级打印、返回 false,绝不抛错中断主流程
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[mail 降级] → ${opts.to}: ${opts.subject}`);
    return false;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || "StockTell <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: [opts.to],
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
  if (error) {
    console.error("[mail] resend error:", error);
    return false;
  }
  return true;
}
```
**迁移:** `sendResetEmail` 与 `digest` 改为拼好 `{to,subject,text,html}` 后调 `sendMail`。
**注意:** `sendResetEmail` 原本邮件发送失败会 `throw`,迁移后改为看 `sendMail` 返回值决定是否抛(忘记密码流程对失败的处理保持不变)。
**完成标准:** `grep -rn "new Resend" src/` 仅剩 `lib/mailer.ts`。

---

## 8. 表格 `Th` / `Td` 原子 🟢

**重复(2 处,几乎相同):** `Dashboard.tsx`、`track/page.tsx` 各有一套 `Th`/`Td`。
**建议:** 抽 `components/Table.tsx` 导出 `Th`/`Td`;或体量小、维持现状亦可。优先级低。

---

## 9. 免责声明文案 🟢

**重复(10 处)：** `page.tsx`、`track/page.tsx`、`terms/page.tsx`、`stock/[code]/page.tsx`、`Dashboard.tsx`、`api/cron/push-feishu`、`lib/push-weixin.ts`、`lib/generate.ts`、`lib/digest.ts`、`data/stocks.ts`。
**风险点:** 合规文案散在 10 处,口径要改时极易漏。
**建议:** `src/lib/constants.ts` 导出常量,统一引用:
```ts
export const DISCLAIMER =
  "以上内容为信息整理,不构成投资建议。历史规律不代表未来表现。";
```
(各处措辞略有差异,迁移时顺手统一为同一句。)

---

## 建议执行顺序(低碰撞优先)
1. 先建 5 个新文件:`lib/date.ts`、`lib/format.ts`、`lib/impact.ts`、`lib/api-guard.ts`、`lib/mailer.ts`(纯新增,零碰撞)。
2. 迁移**稳定文件**的调用点:#1/#2(非 push 部分)、#4(admin)、#5、#6、#7。
3. push 系列(#1/#2/#3 的 push 文件)与维护者确认后再迁。
4. 收尾:#8、#9。

每步:`npx tsc --noEmit` + `npm run build` 双过 → 按文件 `git add` → 提交。

---

## ✅ 执行记录(已全部完成)

9 项全部落地,分两次提交:
- `511a64e` — 新建 5 模块(`date`/`format`/`impact`/`api-guard`/`mailer`)+ 稳定文件迁移(#1 非 push、#3 非 push、#4、#5、#6、#7 password-reset)。
- `a9c1361` — push 系列收尾(#1/#3 的 push 文件)+ #7 digest + #8 抽 `components/Table.tsx` + #9 新建 `lib/constants.ts`。

**验证**:每批 `tsc --noEmit` 0 错 + `build` Compiled successfully;`process.env.CRON_SECRET`/`ADMIN_TOKEN` 现仅存于 `lib/api-guard.ts`。

### 与本文档的实际偏差(留痕)
- **#2 `feishu.ts`**:文档列其有 `beijingWeekday`,实际核查只有无关的 `beijingTime`,无 `beijingWeekday`,**未动**。`beijingWeekday` 的真实重复仅 `cron/briefing`、`cron/outcome` 两处,已迁移。
- **#9 免责文案**:保守处理,仅统一 `page.tsx`、`Dashboard.tsx` 两处**与 `DISCLAIMER` 一字不差**的短免责。以下**刻意保留原样**(替换会改变可见文案):`stock/[code]/page.tsx`、`terms/page.tsx`、`privacy/page.tsx` 的长免责;`track/page.tsx`("历史表现复盘…"page 专属前缀);`digest.ts:30/44`(差"内容"二字、且 line30 少"历史规律"句);`push-feishu`/`push-weixin`/`generate.ts`/`data/stocks.ts` 里的免责**片段**(非完整句)。若日后接受统一措辞,可再收。
- **#7 `sendResetEmail` 语义**:dev 环境未配 `RESEND_API_KEY` 时,由原"打印重置链接"改为"抛错"(经 `sendMail` 返回 `false`)。唯一调用方 `forgot-password` 已 try/catch 吞错,**API 契约与生产行为不变**,仅本地无 key 调试时不再打印 link。
- **#8**:两处 `Th`/`Td` 逐字一致,已抽 `components/Table.tsx` 合并。
