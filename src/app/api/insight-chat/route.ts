import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";
import { INSIGHT_CHAINS } from "@/data/insight-chains";
import {
  chatEnabled,
  classifyIntent,
  redirectedAnswer,
  assembleChatContext,
  runInsightChat,
  CHAT_QUESTION_MAX,
  CHAT_DAILY_LIMIT,
  type ChatAnchor,
  type ChatAnchorType,
  type GroundedAnswer,
} from "@/lib/insight-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 单轮一次 fast LLM 调用(20s 超时)+ DB,60s 足够

// 情境式追问(PRD §5,PR4)。安全边界:
// - 仅登录用户(MVP);功能总开关 INSIGHT_CHAT_ENABLED 可整体关闭入口;
// - 配额走 Postgres 消息计数(事务内 插入→计数→超限回滚),多实例一致——
//   【不用】进程内 rate-limit.ts(PRD 明令:多实例下不成立);
// - 并发 1:最新 user 消息 90s 内未获回复 → 409(前端也禁用输入,双保险);
// - 上下文服务端装配(assembleChatContext),客户端只传 slug/date/anchor/question,
//   伪造 referenceIds/context 无效(白名单在服务端);
// - LLM 基础设施失败 → 退还本轮额度(删 user 消息行)+ 503 可重试,不回退无来源模板;
// - 响应体只含结构化回答与计数,不回显原问题(埋点侧同样不传问题正文)。
const ANCHOR_TYPES = new Set<ChatAnchorType>(["judgment", "risk", "hop", "heat", "mapping"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BUSY_WINDOW_MS = 90_000;

export async function POST(req: NextRequest) {
  if (!chatEnabled()) {
    return NextResponse.json({ ok: false, error: "disabled" }, { status: 503 });
  }
  const session = await getServerSession(authOptions).catch(() => null);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "login-required" }, { status: 401 });
  }
  const db = getPrisma();
  // fail-closed:没库=没法记额度,拒绝而不是放行(缺表同理,由下面事务失败兜住)
  if (!db) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug ?? "");
  const date =
    typeof body.date === "string" && DATE_RE.test(body.date) ? body.date : undefined;
  const question = String(body.question ?? "").trim();
  const anchorRaw = (body.anchor ?? {}) as Partial<ChatAnchor>;
  const anchor: ChatAnchor = {
    type: anchorRaw.type as ChatAnchorType,
    id: String(anchorRaw.id ?? "").slice(0, 80),
  };
  if (!INSIGHT_CHAINS[slug] || !ANCHOR_TYPES.has(anchor.type) || !anchor.id) {
    return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400 });
  }
  if (question.length < 2 || question.length > CHAT_QUESTION_MAX) {
    return NextResponse.json(
      { ok: false, error: `问题需 2~${CHAT_QUESTION_MAX} 字` },
      { status: 400 }
    );
  }

  const threadKey = `${userId}:${slug}:${date ?? "latest"}:${anchor.type}:${anchor.id}`;
  const dayStart = new Date(`${todayISO()}T00:00:00+08:00`); // 配额按北京自然日

  // 事务:并发闸 → 插入本轮 user 消息 → 当日计数,超限抛错整体回滚。
  // review P1:READ COMMITTED 下并发事务互不可见,findFirst/count 各自都能通过 → 竞态。
  // 修法=事务首句取【每用户 advisory 事务锁】(pg_advisory_xact_lock,事务结束自动释放):
  // 同一用户的判定-插入-计数被串行化,busy 闸与额度上限在多实例并发下也严格成立。
  let userMsgId = "";
  let used = 0;
  // 锁键在 JS 侧算 int32(2026-07-17 实踩:pg_advisory_xact_lock 返回 PG void 类型,
  // $queryRaw 反序列化 void 直接抛错 → 所有追问 503 unavailable。改 $executeRawUnsafe +
  // 注入前 |0 强制整数,无注入面;同 userId 恒同键,串行语义不变)。
  let lockKey = 0;
  for (let i = 0; i < userId.length; i++) lockKey = (lockKey * 31 + userId.charCodeAt(i)) | 0;
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey | 0})`);
      const last = await tx.chatMessage.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { role: true, createdAt: true },
      });
      if (
        last?.role === "user" &&
        Date.now() - last.createdAt.getTime() < BUSY_WINDOW_MS
      ) {
        throw new Error("BUSY");
      }
      const created = await tx.chatMessage.create({
        data: {
          userId,
          threadKey,
          insightSlug: slug,
          date: date ?? null,
          anchorType: anchor.type,
          anchorId: anchor.id,
          role: "user",
          content: question,
        },
      });
      userMsgId = created.id;
      used = await tx.chatMessage.count({
        where: { userId, role: "user", createdAt: { gte: dayStart } },
      });
      if (used > CHAT_DAILY_LIMIT) throw new Error("QUOTA");
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "BUSY")
      return NextResponse.json({ ok: false, error: "busy" }, { status: 409 });
    if (msg === "QUOTA")
      return NextResponse.json(
        { ok: false, error: "quota", limit: CHAT_DAILY_LIMIT },
        { status: 429 }
      );
    // 表未建/DB 抖动:fail-closed(schema 哨兵会报缺表)
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

  const finish = async (answer: GroundedAnswer, provider: string, intent: string) => {
    await db.chatMessage
      .create({
        data: {
          userId,
          threadKey,
          insightSlug: slug,
          date: date ?? null,
          anchorType: anchor.type,
          anchorId: anchor.id,
          role: "assistant",
          content: JSON.stringify(answer),
          result: answer.result,
        },
      })
      .catch(() => {});
    return NextResponse.json({
      ok: true,
      answer,
      references: answer.referenceIds
        .map((id) => refsOut.get(id))
        .filter((x): x is NonNullable<typeof x> => Boolean(x)),
      quota: { used, limit: CHAT_DAILY_LIMIT },
      provider,
      intent,
    });
  };

  // 上下文装配(服务端唯一来源);锚点不存在 → 400(客户端伪造 anchorId 无效)
  const ctx = await assembleChatContext(slug, date, anchor, userId);
  if (!ctx) {
    await db.chatMessage.delete({ where: { id: userMsgId } }).catch(() => {}); // 无效锚点不占额度
    return NextResponse.json({ ok: false, error: "bad-anchor" }, { status: 400 });
  }
  const refsOut = ctx.allowedRefs;

  // ① 规则意图闸:买卖/预测/仓位/择时词面 → 直接重定向,不进 LLM(确定性,验收 100%)
  if (classifyIntent(question) === "trading") {
    return finish(redirectedAnswer(ctx.anchorLabel), "rules", "trading");
  }

  // 最近 6 轮历史(同 threadKey;assistant 只回灌 oneLiner 摘要,省 token 且不喂回长文)
  const rows = await db.chatMessage
    .findMany({
      where: { threadKey, id: { not: userMsgId } },
      orderBy: { createdAt: "desc" },
      take: 12,
    })
    .catch(() => []);
  const history = rows.reverse().map((r) => ({
    role: (r.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    text:
      r.role === "assistant"
        ? (() => {
            try {
              return (JSON.parse(r.content) as GroundedAnswer).oneLiner;
            } catch {
              return "";
            }
          })()
        : r.content,
  }));

  const res = await runInsightChat(ctx, question, history);
  if (!res) {
    // LLM 不可用/解析失败:退还额度 + 可重试,不回退无来源模板(PRD §5.6)
    await db.chatMessage.delete({ where: { id: userMsgId } }).catch(() => {});
    return NextResponse.json({ ok: false, error: "llm-unavailable", retryable: true }, { status: 503 });
  }
  return finish(res.answer, res.provider, "pass");
}
