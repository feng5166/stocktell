import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { sendFeishu, beijingTime } from "@/lib/feishu";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  PRO_INTENT_CATEGORY,
  parseProIntent,
  serializeProIntent,
  proIntentSummary,
  type ProIntentPayload,
} from "@/lib/pro-intent";

export const dynamic = "force-dynamic";

// 2.2-C:+两类商业化意向(轻转化入口,不收费只收信号;admin/metrics 按类计数)。
// PR5:pro_intent_v2【不在】此白名单——它只能走下面的结构化路径(服务端校验+序列化),
// 客户端直接以该 category 提交自由文本会被归为「其他」,防伪造污染聚合口径(PRD §6.3)。
const CATEGORIES = new Set(["问题", "建议", "其他", "专业版意向", "订阅意向"]);

export async function POST(req: NextRequest) {
  // 限流:同一 IP 10 分钟最多 5 条,防刷
  const ip = clientIp(req.headers);
  if (!rateLimit(`feedback:${ip}`, 5, 10 * 60 * 1000).ok) {
    return NextResponse.json(
      { ok: false, error: "提交太频繁了,歇一会儿再来 🙏" },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  let content = String(body.content ?? "").trim();
  let category = CATEGORIES.has(body.category) ? body.category : "其他";
  // PR5(prd-trust-chat-pro-intent §6):Pro 意向 v2 结构化路径——choices/useCase 服务端
  // 白名单校验后序列化为稳定 content(固定枚举 JSON),聚合端按枚举拆,不吃自由文本。
  let proIntent: ProIntentPayload | null = null;
  if (body.category === PRO_INTENT_CATEGORY) {
    proIntent = parseProIntent(body.intent);
    if (!proIntent) {
      return NextResponse.json({ ok: false, error: "请选择 1~2 项能力和一个使用场景" }, { status: 400 });
    }
    category = PRO_INTENT_CATEGORY;
    content = serializeProIntent(proIntent);
  } else {
    if (content.length < 2) {
      return NextResponse.json({ ok: false, error: "说点什么呗~" }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ ok: false, error: "内容太长了(≤2000 字)" }, { status: 400 });
    }
  }
  const path = typeof body.path === "string" ? body.path.slice(0, 200) : "";
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300);

  // 登录用户带上身份;游客可留联系方式(可选)
  const session = await getServerSession(authOptions).catch(() => null);
  const userId = session?.user?.id ?? null;
  const sessEmail = session?.user?.email ?? null;
  const contact = String(body.contact ?? "").trim().slice(0, 200);
  const email = sessEmail || contact || null;

  // 尽力存库(表未建/无库不单独致命,飞书兜底;review P2:但双通道都失败不能再回「已记录」)
  const db = getPrisma();
  let dbOk = false;
  if (db) {
    try {
      await db.feedback.create({
        data: { userId, email, category, content, path, userAgent },
      });
      dbOk = true;
    } catch {
      /* 表未建或写入失败 → 靠飞书兜底,由下方双失败判定收口 */
    }
  }

  // 飞书通知:第一时间看到
  // 注意:飞书文本消息里别用 BMP 外的 emoji(如 💬 U+1F4AC 会显示成 💬 乱码);
  // 用 BMP 内的 Dingbats(如 ✉ U+2709 / ✅ U+2705)才正常。
  const feishu = await sendFeishu(
    [
      "✉ StockTell 用户反馈",
      `类型:${category}`,
      `内容:${proIntent ? proIntentSummary(proIntent) : content}`,
      `联系:${email || "(未留)"}`,
      `用户:${userId ? `登录(${sessEmail ?? userId})` : "游客"}`,
      `页面:${path || "(未知)"}`,
      `时间:${beijingTime()}`,
    ].join("\n")
  ).catch(() => ({ ok: false }));

  // review P2:DB 和飞书都失败=反馈真的丢了,回「已记录」是骗用户 → 如实 500 让前端提示重试
  if (!dbOk && !feishu.ok) {
    return NextResponse.json(
      { ok: false, error: "暂时没能记录,请稍后重试" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
