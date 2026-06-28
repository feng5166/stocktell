import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

// 一次性清理:去掉存量简报正文 retail_take 里逐条的免责声明(底部已有统一声明)。
// 默认 dry-run 预览(?apply=1 才真正写)。管理员限定。
// 清理策略(保守、只动结尾):
//  1) 结尾括号内含"不构成投资建议"的整段括号
//  2) 结尾"历史规律不代表未来(表现)"句
//  3) 结尾含"不构成投资建议"的最后一个小句
const CLEAN = `btrim(
  regexp_replace(
    regexp_replace(
      regexp_replace(retail_take, '[\\s,，。]*[((][^))]*不构成投资建议[^))]*[))]\\s*$', ''),
      '[\\s,，。]*历史规律不代表未来表现?[。]?\\s*$', ''),
    '[\\s,，。;；、]*不构成投资建议[^。！？]*[。！？]?\\s*$', '')
)`;

export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const apply = req.nextUrl.searchParams.get("apply") === "1";
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no database" }, { status: 500 });

  try {
    const affected = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM briefing_items WHERE retail_take ~ '不构成投资建议|历史规律'`
    );
    const total = Number(affected[0]?.n ?? 0);

    // 预览:展示前后结尾对比
    const samples = await db.$queryRawUnsafe<{ before_tail: string; after_tail: string }[]>(
      `SELECT right(retail_take, 45) AS before_tail, right(${CLEAN}, 45) AS after_tail
       FROM briefing_items
       WHERE retail_take ~ '不构成投资建议|历史规律'
       LIMIT 12`
    );

    if (!apply) {
      return NextResponse.json({ ok: true, dryRun: true, willUpdate: total, samples });
    }

    const updated = await db.$executeRawUnsafe(
      `UPDATE briefing_items SET retail_take = ${CLEAN}
       WHERE retail_take ~ '不构成投资建议|历史规律'`
    );
    return NextResponse.json({ ok: true, applied: true, updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
