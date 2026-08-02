"use client";

// 首页「和我相关」冷启动:还没自选时,直接在这儿搜票加自选,不用跳去股票池。
// 复用调用方传入的 useWatchlist 实例(同一份状态),加完即时反映到「和我相关」。
import { useMemo, useState } from "react";
import Link from "next/link";
import { STOCKS } from "@/data/stocks";
import type { UseWatchlist } from "@/components/useWatchlist";

// 覆盖口径:对 A股 散户只强调可交易的 A股 只数,美股是用来联动的"锚点"(单列说明,不混入只数)
const A_SHARE_COUNT = STOCKS.filter((s) => s.market === "A股").length;

// 一键加示例票(onboarding P0-2):结构性选票口径——链条核心节点/公认锚点,
// 不按当日行情择时(合规红线:禁"推荐/精选/潜力"等词,只用客观曝光度描述)。
// 按名称从池内解析,避免硬编码代码漂移;名称改动时静默缩短列表,不报错。
const EXAMPLE_NAMES = ["中际旭创", "工业富联", "寒武纪", "海光信息"];
const EXAMPLE_STOCKS = EXAMPLE_NAMES
  .map((n) => STOCKS.find((s) => s.name === n && s.market === "A股"))
  .filter((s): s is NonNullable<typeof s> => Boolean(s));

export function QuickAddWatch({ wl }: { wl: UseWatchlist }) {
  const [q, setQ] = useState("");
  // 免登录口径(新手路径 v2):游客与登录用户同一路径,文案不再按登录态分叉
  const title = "添加自选,查看今天哪些全球事件影响你的股票 👇";
  const desc =
    "StockTell 会告诉你:今天哪些全球事件正在影响它们。搜代码或名称即可加入,随时能删。";

  const matches = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return [];
    return STOCKS.filter(
      (s) =>
        s.code.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw)
    ).slice(0, 8);
  }, [q]);

  return (
    <div className="rounded-xl border border-brand-100 bg-white p-3 sm:p-4">
      <div className="text-sm font-medium text-gray-800">{title}</div>
      <div className="mt-1 text-xs text-gray-500">{desc}</div>

      {EXAMPLE_STOCKS.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-gray-500">不知道加哪只?点一下就行,随时能删 👇</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {EXAMPLE_STOCKS.map((s) => {
              const added = wl.has(s.code);
              return (
                <button
                  key={s.code}
                  onClick={() => wl.toggle(s.code, "example")}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    added
                      ? "border-brand-200 bg-brand-50 text-brand-600"
                      : "border-gray-300 bg-white text-gray-700 hover:border-brand-300 hover:text-brand-700"
                  }`}
                >
                  {added ? "✓ " : "+ "}
                  {s.name}
                </button>
              );
            })}
          </div>
          <div className="mt-1 text-[10px] text-gray-400">
            示例为 AI 链上大家常看的票,仅为方便体验,不构成任何建议
          </div>
        </div>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="如:中际旭创 / 科大讯飞 / 海光信息"
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
      />

      {q.trim() && (
        <div className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100">
          {matches.length === 0 ? (
            /^\d{6}$/.test(q.trim()) ? (
              /* 池外票降级档(2.3 P1-2):6 位代码搜不到也能加——诚实说明暂未纳入,
                 登记为扩池信号,纳入后兑现提醒。不 LLM 现编关系(铁律②:宁缺勿编)。 */
              <div className="px-3 py-3 text-xs leading-relaxed text-gray-500">
                「{q.trim()}」暂未纳入产业链图谱(目前覆盖 A 股约 {A_SHARE_COUNT} 只 + 美股锚点)。
                仍可加入自选:我们已登记你的关注,该股纳入图谱后你会第一时间看到它的链上位置。
                <div className="mt-2">
                  <button
                    onClick={() => wl.toggle(q.trim(), "search")}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      wl.has(q.trim())
                        ? "border-brand-200 bg-brand-50 text-brand-600"
                        : "border-gray-300 bg-white text-gray-700 hover:border-brand-300 hover:text-brand-700"
                    }`}
                  >
                    {wl.has(q.trim()) ? "✓ 已加入(待纳入图谱)" : `+ 仍要加入 ${q.trim()}`}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-3 py-3 text-center text-xs leading-relaxed text-gray-500">
                没找到「{q.trim()}」。 StockTell 目前专盯 AI 产业链(覆盖 A 股约 {A_SHARE_COUNT} 只 +
                美股锚点),其它板块还在路上——换 AI 链上的票,或直接输 6 位代码登记关注。
              </div>
            )
          ) : (
            matches.map((s) => {
              const added = wl.has(s.code);
              return (
                <div
                  key={s.code}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <Link
                    href={`/stock/${s.code}`}
                    className="min-w-0 flex-1 hover:opacity-80"
                  >
                    <span className="text-sm font-medium text-gray-800">
                      {s.name}
                    </span>
                    <span className="ml-2 font-mono text-xs text-gray-400">
                      {s.code}
                    </span>
                    <span
                      className={`ml-2 rounded px-1 py-0.5 text-[11px] ${
                        s.market === "美股"
                          ? "bg-brand-50 text-brand-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {s.market}
                    </span>
                  </Link>
                  <button
                    onClick={() => wl.toggle(s.code, "search")}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                      added
                        ? "border border-gray-300 text-gray-500 hover:bg-gray-100"
                        : "bg-brand-600 text-white hover:bg-brand-700"
                    }`}
                  >
                    {added ? "✓ 已加" : "+ 加自选"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="mt-2 text-xs text-gray-400">
        想浏览全部?去{" "}
        <Link href="/stocks" className="text-brand-600 hover:underline">
          股票池
        </Link>
        。
      </div>
    </div>
  );
}
