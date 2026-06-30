import Link from "next/link";
import { notFound } from "next/navigation";
import { STOCK_MAP, STOCKS, resolvePeer, type Stock } from "@/data/stocks";
import { ChainPosition } from "@/components/ChainPosition";
import { SiteHeader } from "@/components/SiteHeader";
import { chainNeighbors } from "@/data/chainEdges";
import { edgeInfo, STRENGTH_BADGE } from "@/data/relations";
import { listBriefing } from "@/lib/briefings";
import { WatchStar } from "@/components/WatchStar";
import { FeedbackLink } from "@/components/FeedbackLink";
import { LiveQuote } from "@/components/LiveQuote";
import { Fundamentals } from "@/components/Fundamentals";
import { Similarity } from "@/components/Similarity";
import { StockTellTake } from "@/components/StockTellTake";
import { riskEventsFor } from "@/lib/risk-radar";
import { financialCheckup } from "@/lib/financials";
import { fundFlowFor } from "@/lib/fund-flow";
import { ETF_HOLDINGS } from "@/data/etf-holdings.generated";
import { ENRICH } from "@/data/enrichment.generated";
import { CONCEPTS } from "@/data/concepts.generated";
import { TIER } from "@/data/stocks";
import { todayISO } from "@/lib/date";

const TIER_CLASS: Record<string, string> = {
  龙头: "bg-amber-100 text-amber-700 font-medium",
  二线: "bg-sky-50 text-sky-600",
};

// 热度配色:极热=红、活跃=橙,其余中性
const HEAT_CLASS: Record<string, string> = {
  极热: "bg-rose-50 text-rose-600",
  活跃: "bg-amber-50 text-amber-700",
  正常: "bg-gray-100 text-gray-500",
  清淡: "bg-gray-100 text-gray-400",
};

// 页面本体(定位/关联/上下游)全来自内存静态数据,本可秒出;原本 force-dynamic + SSR
// 串行等新浪行情 + DB,整页被慢请求卡住。改 ISR:静态外壳走缓存,实时行情交给 <LiveQuote>
// 客户端按需拉,今日简报标记随每 5 分钟再生成刷新。
export const revalidate = 300;

// 单项取数加超时 + 失败兜底:Tushare 慢/挂时返回 fb,不拖垮整页 SSR。
function cap<T>(p: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([
    p.catch(() => fb),
    new Promise<T>((r) => setTimeout(() => r(fb), ms)),
  ]);
}

export default async function StockDetail({
  params,
}: {
  params: { code: string };
}) {
  const s = STOCK_MAP[params.code];
  if (!s) notFound();

  // 服务端取数全部并行 + 单项 8s 超时:Tushare 慢时不再串行叠加到 20s+,
  // 超时就按原有优雅降级(该块不渲染),页面最差 ~8s 出框架。
  const isA = s.market === "A股";
  const [riskEvents, checkup, fund, todayBriefs] = await Promise.all([
    isA ? cap(riskEventsFor(s.code), 8000, []) : Promise.resolve([]),
    isA ? cap(financialCheckup(s.code), 8000, null) : Promise.resolve(null),
    isA ? cap(fundFlowFor([s.code]), 8000, null) : Promise.resolve(null),
    cap(listBriefing({ date: todayISO(), status: "published" }), 8000, []),
  ]);
  const fundItem = fund?.items[0];
  // 相关 ETF(重仓本股的主题 ETF,静态生成、零运行时调用),仅 A 股
  const etfs = isA ? ETF_HOLDINGS[s.code] ?? [] : [];

  // 基本面增强标签(Tushare:市值档/换手热度),仅 A 股
  const en = isA ? ENRICH[s.code] : undefined;
  const concepts = CONCEPTS[s.code] ?? []; // 概念多标签(同花顺概念,题材叠加)

  // 今天的简报里是否提到这只(真实"今日有新消息")
  const todayNews = todayBriefs.filter(
    (it) => it.triggerCode === s.code || it.beneficiaries.some((b) => b.code === s.code)
  );

  // 真实「散户怎么想」:优先取今天提到这只票的简报条目(retailTake 真实、可深读);没有则退回静态文案
  const newsItem =
    todayNews.find((it) => it.triggerCode === s.code) ?? todayNews[0] ?? null;

  // 统一关联邻居 = 既有 relations(美股用 code、A股用名称)+ 产业链真实关联边
  // (chainEdges,双向、含 A股↔A股/美股↔美股),按代码去重。
  const peerMap = new Map<string, Stock>();
  const otherTokens: string[] = [];
  for (const t of s.relations) {
    const p = resolvePeer(t);
    if (!p) {
      otherTokens.push(t);
      continue;
    }
    if (p.code !== s.code) peerMap.set(p.code, p);
  }
  for (const n of chainNeighbors(s.code)) {
    const p = STOCK_MAP[n.code];
    if (p && p.code !== s.code) peerMap.set(p.code, p);
  }
  const peers = Array.from(peerMap.values());

  // 按关联强度降序(edgeInfo 现已覆盖产业链边)
  const STR_RANK: Record<string, number> = { 强: 3, 中: 2, 弱: 1 };
  const strengthOf = (code: string) =>
    STR_RANK[edgeInfo(s.code, code)?.strength ?? "弱"] ?? 0;
  const byStrength = (arr: Stock[]) =>
    [...arr].sort((a, b) => strengthOf(b.code) - strengthOf(a.code));

  const usPeers = byStrength(peers.filter((p) => p.market === "美股")).map(
    (p) => ({ token: p.code, peer: p })
  );
  const aPeers = byStrength(peers.filter((p) => p.market === "A股")).map(
    (p) => ({ token: p.code, peer: p })
  );
  const otherPeers = otherTokens.map((t) => ({ token: t, peer: null as Stock | null }));

  // 兜底:既无映射也无产业链边的"孤儿"标的,不让详情页变成"暂无关联"的死胡同。
  // 退回展示同板块的同类标的(诚实标注:这是同类参考,不是确认的供货/对标关系)。
  const hasPeers = usPeers.length > 0 || aPeers.length > 0 || otherPeers.length > 0;
  const sameSectorPeers = hasPeers
    ? []
    : STOCKS.filter((p) => p.sector === s.sector && p.code !== s.code)
        .slice(0, 8)
        .map((p) => ({ token: p.code, peer: p }));

  // 产业链上下游导航:按边的真实方向分(up=供货给本股的上游;down=采购本股的下游),
  // 而非按全局位置——否则同为「上游」的供应商会落进「你在这」被隐藏。已按强度降序。
  const upPeers: { code: string; name: string; market: string }[] = [];
  const downPeers: { code: string; name: string; market: string }[] = [];
  for (const n of chainNeighbors(s.code)) {
    const p = STOCK_MAP[n.code];
    if (!p) continue;
    const item = { code: p.code, name: p.name, market: p.market };
    (n.dir === "up" ? upPeers : downPeers).push(item);
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* 复用全站统一头部(logo + slogan + nav + 移动端底部 TabBar),不再自带专属顶栏 */}
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* 标题区:主行(名称/代码 + 价格)→ 副标题(定位,原「它是干什么的」)→ 元信息行 */}
        <header className="mb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-h1 font-semibold tracking-tight">{s.name}</h1>
              <span className="font-mono text-sm text-gray-400">{s.code}</span>
            </div>
            <LiveQuote code={s.code} />
          </div>

          {/* 一句话定位:从独立卡片上提为副标题,顶部更紧凑、不留空卡 */}
          <p className="mt-2 text-title leading-relaxed text-gray-600">
            {s.positioning}
          </p>

          {/* 元信息行:身份标签靠左(弱化),自选/反馈靠右 */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${
                s.market === "美股"
                  ? "bg-brand-50 text-brand-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {s.market}
            </span>
            {TIER[s.code] && (
              <Link
                href={`/stocks?tier=${encodeURIComponent(TIER[s.code])}`}
                className={`rounded px-1.5 py-0.5 text-xs hover:opacity-80 ${TIER_CLASS[TIER[s.code]]}`}
              >
                {TIER[s.code]}
              </Link>
            )}
            {en?.capTier && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                {en.capTier}
                {en.circMvYi != null && (
                  <span className="ml-1 text-gray-400">
                    {en.circMvYi >= 10000
                      ? `${(en.circMvYi / 10000).toFixed(2)}万亿`
                      : `${Math.round(en.circMvYi)}亿`}
                  </span>
                )}
              </span>
            )}
            {en?.heat && (
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${HEAT_CLASS[en.heat] ?? "bg-gray-100 text-gray-500"}`}
                title={en.turnover != null ? `换手率 ${en.turnover}%` : undefined}
              >
                {en.heat}
              </span>
            )}
            <span className="ml-auto flex items-center gap-3">
              <WatchStar code={s.code} />
              <FeedbackLink />
            </span>
          </div>
        </header>

        {concepts.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400">概念</span>
            {concepts.map((c) => (
              <Link
                key={c}
                href={`/stocks?concept=${encodeURIComponent(c)}`}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-brand-50 hover:text-brand-600"
              >
                {c}
              </Link>
            ))}
          </div>
        )}

        {/* 基本面真实数据并入标题区(紧凑一行)。下方按散户心态重排:先结论/关系,资金面等支撑细节折叠靠后 */}
        <Fundamentals code={s.code} market={s.market} />

        <Section icon="📰" title="最近发生了什么">
          <ul className="space-y-1.5 text-sm text-gray-700">
            {todayNews.map((it) => (
              <li key={it.id} className="text-rose-600">
                • 今日简报:{it.title}
              </li>
            ))}
            <li>• {s.observation}</li>
          </ul>
        </Section>

        <Section icon="💭" title="散户怎么想" highlight>
          <StockTellTake
            itemId={newsItem?.id}
            code={s.code}
            retailTake={newsItem?.retailTake ?? s.retailTake}
          />
          {!newsItem && (
            <p className="mt-1 text-xs text-gray-400">
              今日暂无相关动态,以上为该标的的长期定位;点上方可让 StockTell 现在深读这只票。
            </p>
          )}
        </Section>

        <Section icon="🧭" title="在产业链的位置">
          <ChainPosition
            sector={s.sector}
            up={upPeers}
            down={downPeers}
          />
        </Section>

        <Section icon="🔗" title="对应的股票">
          {!hasPeers ? (
            sameSectorPeers.length > 0 ? (
              <div className="space-y-2 text-sm">
                <PeerGroup label={`同板块标的 · ${s.sector}`} items={sameSectorPeers} />
                <p className="text-meta leading-relaxed text-gray-400">
                  这只暂无明确的供货/对标关系,以上为同属「{s.sector}」的标的,可作同类参考(非确认的产业链关系)。
                </p>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-gray-500">
                这只比较独立,属于「{s.sector}」({s.position}环节),暂无明确的同类或上下游标的。
              </p>
            )
          ) : (
            <div className="space-y-3 text-sm">
              {usPeers.length > 0 && (
                <PeerGroup label="对应美股" anchor={s} items={usPeers} />
              )}
              {aPeers.length > 0 && (
                <PeerGroup label="对应 A 股" anchor={s} items={aPeers} />
              )}
              {otherPeers.length > 0 && (
                <PeerGroup label="相关" items={otherPeers} />
              )}
            </div>
          )}
          {(usPeers.length > 0 || aPeers.length > 0) && (
            <p className="mt-3 text-meta leading-relaxed text-gray-400">
              强 = 有明确供货/直接业务绑定;中 = 对标/国产替代(同类对手,无直接供货);弱
              = 同主题、蹭概念(跟着热度涨跌)。关系为研究框架梳理,非确认的客户/供应商关系。
            </p>
          )}
        </Section>

        {/* 资金面(术语较重,降为支撑细节、默认折叠)*/}
        {fundItem &&
          (fundItem.netMf !== null || fundItem.rzChgYi !== null || fundItem.longhu) && (
            <Section collapsible icon="📊" title="资金面">
              {fundItem.netMf !== null && (
                <p className="mb-1.5 text-xs text-gray-500">
                  简单说:今天大资金整体在
                  <b className={fundItem.netMf >= 0 ? "text-rose-600" : "text-emerald-600"}>
                    {fundItem.netMf >= 0 ? "买" : "卖"}
                  </b>
                  这只票。
                </p>
              )}
              <ul className="space-y-1.5 text-sm">
                {fundItem.netMf !== null && (
                  <li
                    className={fundItem.netMf >= 0 ? "text-rose-600" : "text-emerald-600"}
                    title="主力=大单资金;净流入指今天大单买得比卖得多(净流出反之)"
                  >
                    💰 主力{fundItem.netMf >= 0 ? "净流入" : "净流出"}{" "}
                    {Math.abs(fundItem.netMf).toFixed(1)} 亿
                  </li>
                )}
                {fundItem.rzChgYi !== null && (
                  <li
                    className="text-gray-700"
                    title="融资余额=借钱买这只股的总额;增加说明加杠杆看多的人变多(减少反之)"
                  >
                    🏦 融资余额{fundItem.rzChgYi >= 0 ? "增加" : "减少"}{" "}
                    {Math.abs(fundItem.rzChgYi).toFixed(1)} 亿
                  </li>
                )}
                {fundItem.longhu && (
                  <li
                    className="text-amber-700"
                    title="龙虎榜=当天买卖最猛的营业部公开名单;上榜说明资金博弈激烈"
                  >
                    🐯 上龙虎榜:净额 {fundItem.longhu.net >= 0 ? "+" : ""}
                    {fundItem.longhu.net.toFixed(1)} 亿 · {fundItem.longhu.reason}
                  </li>
                )}
              </ul>
              <p className="mt-2 text-meta leading-relaxed text-gray-400">
                截至 {fund?.date ?? "—"}(Tushare),信息整理,不构成投资建议。
              </p>
            </Section>
          )}

        {checkup && checkup.findings.length > 0 && (
          <Section collapsible icon="📋" title="财报体检 · 一句话看懂">
            <ul className="space-y-1.5 text-sm">
              {checkup.findings.map((f, i) => (
                <li
                  key={i}
                  className={
                    f.severity === "high"
                      ? "text-rose-600"
                      : f.severity === "mid"
                      ? "text-amber-700"
                      : f.severity === "good"
                      ? "text-emerald-600"
                      : "text-gray-500"
                  }
                >
                  {f.text}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-meta leading-relaxed text-gray-400">
              基于 {checkup.reportLabel ?? `${checkup.year} 年报`}(Tushare),信息整理、提示风险,不构成投资建议。
            </p>
          </Section>
        )}

        {riskEvents.length > 0 && (
          <Section icon="⚠️" title="重要事件 / 雷区">
            <ul className="space-y-1.5 text-sm">
              {riskEvents.map((e, i) => (
                <li
                  key={i}
                  className={
                    e.severity === "high"
                      ? "text-rose-600"
                      : e.severity === "info"
                      ? "text-gray-500"
                      : "text-amber-700"
                  }
                >
                  {e.text}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-meta leading-relaxed text-gray-400">
              公开信息整理(Tushare),提示风险,不构成投资建议。
            </p>
          </Section>
        )}

        {etfs.length > 0 && (
          <Section icon="🧺" title="相关 ETF · 一篮子参与">
            <div className="space-y-1 text-sm">
              {etfs.map((e) => (
                <a
                  key={e.code}
                  href={`https://quote.eastmoney.com/${
                    e.code.startsWith("5") ? "sh" : "sz"
                  }${e.code}.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/etf -mx-2 flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-50/60"
                >
                  <span className="font-mono text-xs text-gray-400">{e.code}</span>
                  <span className="font-medium text-gray-800 group-hover/etf:text-brand-600">
                    {e.name}
                    <span className="ml-0.5 text-gray-300 group-hover/etf:text-brand-400">
                      ↗
                    </span>
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {s.name}占{" "}
                    <b className="font-medium text-gray-600">{e.ratio}%</b>
                  </span>
                </a>
              ))}
            </div>
            <p className="mt-2 text-meta leading-relaxed text-gray-400">
              看好这个方向又不想押单只,可考虑重仓它的 ETF 一篮子参与。基金季报持仓(Tushare),不构成投资建议。
            </p>
          </Section>
        )}

        {s.market === "A股" && <Similarity code={s.code} />}

        <p className="mt-8 rounded-lg bg-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-500">
          免责声明:以上内容为公开信息整理,不构成投资建议。产业链关系为研究框架梳理,非确认的客户/供应商/持仓关系。历史规律不代表未来表现。
        </p>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
  highlight,
  collapsible,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
  collapsible?: boolean;
  icon?: string;
}) {
  const cls = `mb-3 rounded-xl border p-4 sm:p-5 ${
    highlight ? "border-amber-200 bg-amber-50" : "border-gray-200/80 bg-white"
  }`;
  // 区块标题:左侧色条 + 图标 + 深色加粗,强化层次、可扫读
  const head = (
    <>
      <span
        className={`h-3.5 w-1 shrink-0 rounded-full ${
          highlight ? "bg-amber-400" : "bg-brand-400"
        }`}
      />
      {icon && <span className="text-sm leading-none">{icon}</span>}
      <span
        className={`text-sm font-semibold tracking-tight ${
          highlight ? "text-amber-800" : "text-gray-800"
        }`}
      >
        {title}
      </span>
    </>
  );
  // 折叠用原生 <details>(无需客户端 JS),默认收起
  if (collapsible) {
    return (
      <details className={`group ${cls}`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 transition-opacity hover:opacity-80">
          <span className="flex items-center gap-2">{head}</span>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-open:rotate-180 group-hover:text-gray-500"
          >
            <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="mt-3">{children}</div>
      </details>
    );
  }
  return (
    <section className={cls}>
      <h2 className="mb-2.5 flex items-center gap-2">{head}</h2>
      {children}
    </section>
  );
}

function PeerGroup({
  label,
  anchor,
  items,
}: {
  label: string;
  anchor?: Stock;
  items: { token: string; peer: Stock | null }[];
}) {
  const CAP = 12; // 龙头(如英伟达)关联众多,封顶展示强关联,其余折叠计数
  const shownItems = items.slice(0, CAP);
  const hidden = items.length - shownItems.length;
  return (
    <div>
      <div className="mb-1.5 text-xs text-gray-400">{label}</div>
      <div className="space-y-1.5">
        {shownItems.map(({ token, peer }) => {
          const info = anchor && peer ? edgeInfo(anchor.code, peer.code) : null;
          return (
            <div
              key={peer?.code ?? token}
              className="flex flex-wrap items-center gap-2"
            >
              {info && (
                <span
                  className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-meta ${STRENGTH_BADGE[info.strength]}`}
                >
                  {info.strength}关联
                </span>
              )}
              {peer ? (
                <Link
                  href={`/stock/${peer.code}`}
                  className="font-medium text-gray-800 hover:text-brand-600"
                >
                  {peer.name}
                </Link>
              ) : (
                <span className="text-gray-600">{token}</span>
              )}
              {info && (
                <span className="text-xs text-gray-400">· {info.basis}</span>
              )}
            </div>
          );
        })}
        {hidden > 0 && (
          <div className="text-xs text-gray-400">…另有 {hidden} 只关联标的</div>
        )}
      </div>
    </div>
  );
}
