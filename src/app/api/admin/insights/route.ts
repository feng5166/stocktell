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
import { getChain } from "@/data/chains";
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

  await updatePayload(id, clean);
  if (action === "publish") {
    const pub = await publishDoc(id);
    return NextResponse.json({ ok: true, status: "published", publishedAt: pub?.publishedAt });
  }
  return NextResponse.json({ ok: true, status: "saved" });
}

// relation 只读红线(§7.2-3):忽略前端传来的 relation,一律用库中原值
function enforceReadonlyRelations(
  next: DailyInsightPayload,
  prev: DailyInsightPayload
): DailyInsightPayload {
  const prevHeat = new Map(prev.heat.map((h) => [h.segment, h.relation]));
  const prevMap = new Map(prev.mappingsDelta.map((m) => [m.code, m.relation]));
  return {
    ...next,
    heat: next.heat.map((h) => ({ ...h, relation: prevHeat.get(h.segment) ?? h.relation })),
    mappingsDelta: next.mappingsDelta.map((m) => ({
      ...m,
      relation: prevMap.get(m.code) ?? m.relation,
    })),
  };
}
