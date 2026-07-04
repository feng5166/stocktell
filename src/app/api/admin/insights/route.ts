import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import {
  listDocs,
  getDoc,
  updatePayload,
  publishDoc,
  rejectDoc,
} from "@/lib/insight-pipeline/docs";
import { validateDailyPayload } from "@/lib/insight-pipeline/schema";
import { complianceBlockers } from "@/lib/insight-pipeline/guard";
import { getChain } from "@/data/chains";
import { relationForCodeInChain } from "@/lib/relation";
import type { DailyInsightPayload } from "@/lib/insight-pipeline/schema";

export const dynamic = "force-dynamic";

async function guard(req: NextRequest): Promise<boolean> {
  return isAdminAuthorized(req) || (await isAdminSession());
}

// 列表(?id= 取单篇);状态过滤 ?status=draft
export async function GET(req: NextRequest) {
  if (!(await guard(req)))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const doc = await getDoc(id);
    return NextResponse.json({ ok: !!doc, doc });
  }
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const items = await listDocs({ status });
  return NextResponse.json({ ok: true, items });
}

// 保存编辑 / 发布 / 打回。body: { id, action: "save"|"publish"|"reject", payload?, note? }
// 保存与发布前都重新校验(编辑后仍须合规);relation 字段前端只读,这里也不接受改动。
export async function POST(req: NextRequest) {
  if (!(await guard(req)))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id, action, payload, note } = body as {
    id?: string;
    action?: string;
    payload?: DailyInsightPayload;
    note?: string;
  };
  if (!id || !action)
    return NextResponse.json({ ok: false, error: "missing id/action" }, { status: 400 });

  const doc = await getDoc(id);
  if (!doc) return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });

  if (action === "reject") {
    if (!note?.trim())
      return NextResponse.json({ ok: false, error: "打回需填原因" }, { status: 400 });
    await rejectDoc(id, note.trim());
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // save / publish 都要 payload;人审可给 confidence=高(不走生成侧封顶)
  if (!payload)
    return NextResponse.json({ ok: false, error: "缺 payload" }, { status: 400 });
  const chain = getChain(payload.chainId);
  if (!chain?.segments)
    return NextResponse.json({ ok: false, error: "chain-not-configured" }, { status: 400 });
  // relation 只读红线:人审提交的 relation 必须与库中一致,不允许经由此接口改
  const clean = enforceReadonlyRelations(payload, doc.payload);
  const errs = validateDailyPayload(clean, chain.segments); // 不带 fromGenerator,人审可给「高」
  if (errs.length)
    return NextResponse.json({ ok: false, error: "校验失败", errs }, { status: 400 });
  // 代码级合规纵深(人审是主闸,这里兜底):持 ADMIN_TOKEN 提交违规 judgment/数字也拦回,
  // 生成侧有 runGuards 硬闸、发布侧不能缺(禁词 + 具体涨跌数字红线)。
  const blockers = complianceBlockers(clean);
  if (blockers.length)
    return NextResponse.json({ ok: false, error: "合规红线", blockers }, { status: 400 });

  await updatePayload(id, clean);
  if (action === "publish") {
    const pub = await publishDoc(id);
    // publishDoc 对 rejected/superseded 稿返 null:不能谎报「已发布」(payload 已被 updatePayload
    // 覆盖,但状态仍 rejected/superseded),明确回错让人审知道要先恢复到 draft。
    if (!pub)
      return NextResponse.json(
        { ok: false, error: "该稿状态不可发布(rejected/superseded),请先恢复为 draft" },
        { status: 409 }
      );
    return NextResponse.json({ ok: true, status: "published", publishedAt: pub.publishedAt });
  }
  return NextResponse.json({ ok: true, status: "saved" });
}

// relation 只读红线(§7.2-3 + B2-6):忽略前端传来的 relation,一律从【核定源】重算。
// 旧实现对「不在库中原值里的新 code/段」`?? 客户端值` fail-open——持 ADMIN_TOKEN 可塞
// 新 code + relation=直接映射 落库。改:heat 用本链 segment.defaultRelation、mapping 用
// relationForCodeInChain(本链核定);解析不到一律回落库中原值,最后兜最弱档「情绪映射」,
// 【绝不用客户端值】——未核定的新 code 拿不到直接/间接,只能是情绪映射(不可越级注入)。
function enforceReadonlyRelations(
  next: DailyInsightPayload,
  prev: DailyInsightPayload
): DailyInsightPayload {
  const chain = getChain(prev.chainId);
  const segDefault = new Map(
    (chain?.segments ?? []).map((s) => [s.name, s.defaultRelation])
  );
  const prevHeat = new Map(prev.heat.map((h) => [h.segment, h.relation]));
  const prevMap = new Map(prev.mappingsDelta.map((m) => [m.code, m.relation]));
  return {
    ...next,
    heat: next.heat.map((h) => ({
      ...h,
      relation: segDefault.get(h.segment) ?? prevHeat.get(h.segment) ?? "情绪映射",
    })),
    mappingsDelta: next.mappingsDelta.map((m) => ({
      ...m,
      relation:
        relationForCodeInChain(m.code, chain?.insightSlug) ??
        prevMap.get(m.code) ??
        "情绪映射",
    })),
  };
}
