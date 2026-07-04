import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { allRelations } from "@/data/chain-relations";

export const dynamic = "force-dynamic";

// 关系模型逐条审核导出(负责人要 CSV/JSON 逐条批注)。CSV 带【审核空列】供直接填:
// 新关系档 / 处理动作 / reviewStatus / 改reason备注。UTF-8 BOM 便于 Excel 直接打开中文。
// GET /api/admin/relation-review/export?format=csv|json (Bearer ADMIN_TOKEN 或 admin session)
// 负责人拍板① schema:只读列 + 审核列分开。action 枚举 keep/retype/edit_reason/remove/
// promote/downgrade/needs_evidence;newType 限 direct/indirect/sentiment/weak/trigger/candidate
// (不含 remove——remove 是 action 不是档位);refs=none/partial/available。
const HEADERS = [
  "chain", "segment", "code", "name", "curType", "reason",
  "evidenceStatus", "refs", "triggerCat", "candStatus",
  "【审】newType", "【审】newReason", "【审】action", "【审】note",
];

// evidenceStatus → refs 状态(none/partial/available)
const refsOf = (e?: string) =>
  e === "verified" ? "available" : e === "partially_verified" ? "partial" : "none";

const csvCell = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: NextRequest) {
  // 浏览器点链接=session;我 curl=Bearer token。两者都放行。
  const ok = isAdminAuthorized(req) || (await isAdminSession());
  if (!ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const R = allRelations();

  if (format === "json") {
    return NextResponse.json({ ok: true, count: R.length, relations: R });
  }

  const rows = R.map((r) =>
    [
      r.chainId, r.segmentName, r.code, r.name, r.relationType, r.reason,
      r.evidenceStatus ?? "", refsOf(r.evidenceStatus), r.triggerGroup ?? "",
      r.relationType === "candidate" ? "needs_evidence" : "",
      "", "", "", "", // 审核列:newType / newReason / action / note
    ].map((c) => csvCell(String(c))).join(",")
  );
  const csv = "﻿" + [HEADERS.map(csvCell).join(","), ...rows].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="chain-relations-review.csv"`,
    },
  });
}
