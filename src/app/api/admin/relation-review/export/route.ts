import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { allRelations } from "@/data/chain-relations";

export const dynamic = "force-dynamic";

// 关系模型逐条审核导出(负责人要 CSV/JSON 逐条批注)。CSV 带【审核空列】供直接填:
// 新关系档 / 处理动作 / reviewStatus / 改reason备注。UTF-8 BOM 便于 Excel 直接打开中文。
// GET /api/admin/relation-review/export?format=csv|json (Bearer ADMIN_TOKEN 或 admin session)
const HEADERS = [
  "链id", "链名", "代码", "名称", "市场", "环节",
  "关系档", "置信", "证据状态", "来源", "证据缺失?",
  "reason",
  "【审】新关系档", "【审】处理(保留/改档/移出/升级)", "【审】reviewStatus", "【审】改reason或备注",
];

// direct/indirect 但证据状态不足 → 标缺失(拍板③:direct 不能没有证据状态)
const evidenceMissing = (r: { relationType: string; evidenceStatus?: string }) =>
  (r.relationType === "direct" || r.relationType === "indirect") &&
  (!r.evidenceStatus || r.evidenceStatus === "needs_review" || r.evidenceStatus === "manual_only")
    ? "⚠证据待补"
    : "";

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
      r.chainId, r.chainName, r.code, r.name, r.market, r.segmentName,
      r.relationType, r.confidence, r.evidenceStatus ?? "", r.source, evidenceMissing(r),
      r.reason,
      "", "", "", "", // 审核空列
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
