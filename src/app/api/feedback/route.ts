import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { sendFeishu, beijingTime } from "@/lib/feishu";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["问题", "建议", "其他"]);

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
  const content = String(body.content ?? "").trim();
  if (content.length < 2) {
    return NextResponse.json({ ok: false, error: "说点什么呗~" }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ ok: false, error: "内容太长了(≤2000 字)" }, { status: 400 });
  }
  const category = CATEGORIES.has(body.category) ? body.category : "其他";
  const path = typeof body.path === "string" ? body.path.slice(0, 200) : "";
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300);

  // 登录用户带上身份;游客可留联系方式(可选)
  const session = await getServerSession(authOptions).catch(() => null);
  const userId = session?.user?.id ?? null;
  const sessEmail = session?.user?.email ?? null;
  const contact = String(body.contact ?? "").trim().slice(0, 200);
  const email = sessEmail || contact || null;

  // 尽力存库(表未建/无库都不致命,飞书照发)
  const db = getPrisma();
  if (db) {
    try {
      await db.feedback.create({
        data: { userId, email, category, content, path, userAgent },
      });
    } catch {
      /* 表未建或写入失败 → 忽略,靠飞书兜底 */
    }
  }

  // 飞书通知:第一时间看到
  await sendFeishu(
    [
      "💬 StockTell 用户反馈",
      `类型:${category}`,
      `内容:${content}`,
      `联系:${email || "(未留)"}`,
      `用户:${userId ? `登录(${sessEmail ?? userId})` : "游客"}`,
      `页面:${path || "(未知)"}`,
      `时间:${beijingTime()}`,
    ].join("\n")
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
