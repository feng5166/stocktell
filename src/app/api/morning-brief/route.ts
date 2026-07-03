import { NextRequest, NextResponse } from "next/server";
import { withMetrics } from "@/lib/metrics";
import { STOCK_MAP } from "@/data/stocks";
import { getMorningBrief, resolveMorningItems } from "@/lib/morning-brief";

export const dynamic = "force-dynamic";
// 冷缓存最坏路径 ≈ 解析查询×2 + 熔断计数 + LLM(重试后 ~22s) + 资金面 4s,30s 没有余量
export const maxDuration = 60;

// 网页「和我相关」顶部的个性化早报。
// 入参只收 codes(且必须在股票池内);相关条目由服务端自查(resolveMorningItems)。
// ⚠️ 曾经为省一次 DB 查询让前端把 items 一并传上来——但早报缓存按(日期+自选组合)全局共享,
// 客户端可控的 items = 任何匿名请求都能污染其他用户的早报内容/用垃圾日期刷 key 烧 LLM,
// 所以 items 一律服务端解析,客户端传什么都不看。
// 返回 date/stale 供前端标题与正文绑定同一口径(内容是哪期,标题就说哪期)。
export const POST = withMetrics("morning-brief", _POST);
async function _POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const codes: unknown[] = Array.isArray(body.codes) ? body.codes : [];
  // hasOwnProperty 而非真值判断:STOCK_MAP 是普通对象,"constructor"/"toString" 这类
  // 原型链属性名也是 truthy,会混进 codes 集合改变缓存 key(= 白烧 LLM 的组合入口)。
  const set = new Set(
    codes.filter(
      (c): c is string =>
        typeof c === "string" && Object.prototype.hasOwnProperty.call(STOCK_MAP, c)
    )
  );
  if (set.size === 0) return NextResponse.json({ brief: null, count: 0 });
  // 页面把正在展示那期的日期传来,保证卡片与信息流讲同一期(服务端校验+确有该期才生效)
  const dateHint = typeof body.date === "string" ? body.date : undefined;

  try {
    const { date, stale, items } = await resolveMorningItems(
      Array.from(set),
      dateHint
    );
    if (items.length === 0)
      return NextResponse.json({ brief: null, count: 0, date, stale });
    const brief = await getMorningBrief(Array.from(set), items);
    return NextResponse.json({ brief, count: items.length, date, stale });
  } catch {
    // 查询失败 ≠ 没有相关动态:返回明确的 error 标记,前端保持沉默(不渲染错误口径的卡片)
    return NextResponse.json({ brief: null, count: 0, error: true });
  }
}
