// 「StockTell 今天怎么看」(首页视觉优化 2026-08-16:撤掉大面积品牌色块——
// 总判断本身就是重点,不靠颜色抢眼。白卡 + 左侧 3px 紫色竖线 + 浅紫「今日判断」标签,
// 正文深色,下面三个小摘要 chip;整卡只允许品牌紫一个主色)。
// 2026-08-18 字体/色温校准:总判断句提到 16px / 500 / 行高 1.65 —— 它是全页第一句要读的话,
// 上一版 15px semibold 反而"细而挤";chip 统一 12px/500,值走墨色不再上紫字。
import { fmtYmd } from "@/lib/market-intent/ui";
import type { DailyTell as TellData } from "@/lib/judgment-diff";

// 摘要 chip:中性底 + 灰 key + 墨色值;仅「最值得看」用浅紫底强调(一卡一主色)
function Tag({ k, v, accent, title }: { k: string; v: string; accent?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-meta ${
        accent ? "bg-[#fff0f2]" : "bg-gray-50"
      }`}
    >
      <span className={accent ? "text-[#d94758]" : "text-gray-400"}>{k}</span>
      <span className="font-medium text-gray-900">{v}</span>
    </span>
  );
}

export function DailyTell({ ymd, tell }: { ymd: string; tell: TellData }) {
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-white/80 bg-white/95 px-5 py-5 shadow-[0_18px_55px_rgba(31,35,48,0.12)] backdrop-blur-sm sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-[#efedff] px-2 py-0.5 text-meta font-medium text-[#6558dd]">
            今日判断
          </span>
          <h2 className="text-[13px] font-medium text-gray-500">StockTell 今天怎么看</h2>
        </div>
        <span className="text-meta text-gray-400">{fmtYmd(ymd)} 盘后 · 规则合成</span>
      </div>
      <p className="mt-3 line-clamp-3 text-[15px] font-medium leading-[1.7] text-gray-900 sm:text-base">
        {tell.sentence}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Tag k="最值得看" v={tell.best} accent />
        {tell.biggestChange && <Tag k="最大变化" v={tell.biggestChange} />}
        {!tell.biggestChange && <Tag k="最大变化" v="与昨日一致" />}
        {tell.biggestRisk && <Tag k="最大风险" v={tell.biggestRisk} />}
      </div>
    </section>
  );
}
