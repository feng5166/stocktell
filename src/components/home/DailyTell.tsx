// 「StockTell 今天怎么看」(首页阅读路径改版 2026-08-14,server component)。
// 负责人:页面缺一个真正的总判断——用户进来不该自己拼。一句总判断 + 三行速览,
// 比三条产业链卡更靠前,因为这才是 Tell。
import { fmtYmd } from "@/lib/market-intent/ui";
import type { DailyTell as TellData } from "@/lib/judgment-diff";

export function DailyTell({ ymd, tell }: { ymd: string; tell: TellData }) {
  return (
    <section className="mt-4 rounded-2xl bg-brand-600 p-5 text-white shadow-sm sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-brand-100">StockTell 今天怎么看</h2>
        <span className="text-meta text-brand-200">{fmtYmd(ymd)} 盘后 · 规则合成</span>
      </div>
      <p className="mt-2 text-base font-semibold leading-relaxed sm:text-lg">{tell.sentence}</p>
      <div className="mt-3 flex flex-col gap-1 text-sm text-brand-50 sm:flex-row sm:gap-6">
        <span>
          <span className="text-brand-200">最值得看:</span>
          {tell.best}
        </span>
        <span>
          <span className="text-brand-200">最大变化:</span>
          {tell.biggestChange ?? "与昨日无方向性变化"}
        </span>
        {tell.biggestRisk && (
          <span>
            <span className="text-brand-200">最大风险:</span>
            {tell.biggestRisk}
          </span>
        )}
      </div>
    </section>
  );
}
