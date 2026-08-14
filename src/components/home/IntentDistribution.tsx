// 资金意图分布(首页视觉优化 2026-08-14,server component)。
// 负责人规范:数字比图重要,明确写「8 个板块」,直接告诉用户几个在进场/几个在撤——
// 不让用户自己数图例。数据=已嵌入的板块今日意图,零额外请求。
import Link from "next/link";
import type { SegIntentPair } from "@/components/home/HomeMyStocks";
import type { IntentType } from "@/lib/market-intent/types";
import { INTENT_CHIP_CLS } from "@/lib/market-intent/ui";

const ORDER: IntentType[] = ["rush", "accumulation", "wash", "distribution", "exit", "divergence", "exhaustion", "neutral"];
const LABEL: Record<IntentType, string> = {
  rush: "抢筹",
  accumulation: "吸筹",
  wash: "洗盘特征", // copylint-allow: Market Intent 意图标签(结构化输出语境豁免)
  distribution: "派发特征",
  exit: "出货特征",
  divergence: "分歧",
  exhaustion: "衰竭",
  neutral: "中性",
};
const IN_SET: IntentType[] = ["rush", "accumulation"];
const OUT_SET: IntentType[] = ["distribution", "exit"];

export function IntentDistribution({ segIntent }: { segIntent: Record<string, SegIntentPair> }) {
  const keys = Object.keys(segIntent);
  if (keys.length === 0) return null;
  const counts = new Map<IntentType, number>();
  for (const k of keys) {
    const t = segIntent[k].t.intent;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const inN = IN_SET.reduce((a, t) => a + (counts.get(t) ?? 0), 0);
  const outN = OUT_SET.reduce((a, t) => a + (counts.get(t) ?? 0), 0);
  return (
    <section className="mt-8">
      <h2 className="text-h2 font-semibold text-gray-900">资金意图分布</h2>
      <p className="mt-1 text-meta text-gray-400">覆盖 {keys.length} 个板块 · 今日盘后</p>
      <div className="mt-3 rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm leading-relaxed text-gray-800">
          今天 <b className="text-emerald-700">{inN}</b> 个板块资金在进场方向,
          <b className="text-red-600">{outN}</b> 个在撤出方向
          {counts.get("divergence") ? (
            <>
              ,<b className="text-indigo-700">{counts.get("divergence")}</b> 个分歧
            </>
          ) : null}
          。
        </p>
        <div className="mt-3 space-y-1.5">
          {ORDER.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => (
            <div key={t} className="flex items-center gap-2 text-sm">
              <span className={`inline-flex w-20 justify-center rounded px-1.5 py-0.5 text-xs font-medium ${INTENT_CHIP_CLS[t]}`}>
                {LABEL[t]}
              </span>
              <span className="flex-1">
                <span
                  className="block h-1.5 rounded bg-gray-200"
                  style={{ width: `${((counts.get(t) ?? 0) / keys.length) * 100}%` }}
                />
              </span>
              <span className="w-8 text-right text-sm font-medium text-gray-700">{counts.get(t)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-right">
          <Link href="/track" className="text-xs font-medium text-brand-600 hover:underline">
            查看各板块意图历史 →
          </Link>
        </div>
      </div>
    </section>
  );
}
