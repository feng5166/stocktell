import { NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

// 今天已发布简报里涉及的标的(触发美股 + 受益A股)→ 真实"今日有新消息"信号
export async function GET() {
  try {
    const items = await listBriefing({ date: todayISO(), status: "published" });
    const byCode: Record<string, string[]> = {};
    for (const it of items) {
      const codes = new Set<string>();
      if (it.triggerCode) codes.add(it.triggerCode);
      it.beneficiaries.forEach((b) => codes.add(b.code));
      codes.forEach((c) => {
        (byCode[c] ??= []).push(it.title);
      });
    }
    return NextResponse.json({ ok: true, codes: Object.keys(byCode), byCode });
  } catch {
    return NextResponse.json({ ok: true, codes: [], byCode: {} });
  }
}
