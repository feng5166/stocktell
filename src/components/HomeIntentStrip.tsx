// 首页「今日资金意图」摘要条(2.2.3):只放 3 条链的链级意图,一行一链,不塞大表。
// 完整数据(证据/反证/失效条件/分板块)在 Chain 页主阵地,这里只是入口。
import Link from "next/link";
import type { IntentConfidence, IntentType } from "@/lib/market-intent/types";
import { CONFIDENCE_LABEL, INTENT_CHIP_CLS, fmtYmd } from "@/lib/market-intent/ui";

export interface HomeIntentRow {
  chainName: string;
  href: string; // /chain/xx#market-intent
  intent: IntentType;
  label: string;
  confidence: IntentConfidence;
  segmentName: string | null; // 驱动该判定的板块(链下多板块时标注)
}

export function HomeIntentStrip({ rows, ymd }: { rows: HomeIntentRow[]; ymd: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-5 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-brand-600">今日资金意图</span>
        <span className="text-meta text-gray-400">{fmtYmd(ymd)} 盘后 · 规则判定</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <Link
            key={r.chainName}
            href={r.href}
            className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50"
          >
            <span className="min-w-0 truncate text-sm text-gray-800">{r.chainName}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {r.segmentName && (
                <span className="hidden text-meta text-gray-400 sm:inline">{r.segmentName}</span>
              )}
              <span
                className={`inline-flex rounded px-1.5 py-0.5 text-meta font-medium ${INTENT_CHIP_CLS[r.intent]}`}
              >
                {r.label}
              </span>
              <span className="text-meta text-gray-400">{CONFIDENCE_LABEL[r.confidence].replace("置信度", "")}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-2 text-meta text-gray-400">
        资金行为不等于基本面验证 · 点进链页看证据与反证
      </p>
    </section>
  );
}
