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

export default async function StockDetail({
  params,
}: {
  params: { code: string };
}) {
  const s = STOCK_MAP[params.code];
  if (!s) notFound();

  // 基本面增强标签(Tushare:市值档/换手热度),仅 A 股
  const en = s.market === "A股" ? ENRICH[s.code] : undefined;
  const concepts = CONCEPTS[s.code] ?? []; // 概念多标签(同花顺概念,题材叠加)

  // 今天的简报里是否提到这只(真实"今日有新消息")
  const todayNews = (
    await listBriefing({ date: todayISO(), status: "published" }).catch(() => [])
  ).filter(
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
        {/* 标题 */}
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <h1 className="text-h1 font-semibold tracking-tight">{s.name}</h1>
          <span className="font-mono text-sm text-gray-400">{s.code}</span>
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
            <span className={`rounded px-1.5 py-0.5 text-xs ${TIER_CLASS[TIER[s.code]]}`}>
              {TIER[s.code]}
            </span>
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
          <WatchStar code={s.code} />
          <FeedbackLink />
          <LiveQuote code={s.code} />
        </div>

        {concepts.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400">概念</span>
            {concepts.map((c) => (
              <span
                key={c}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
              >
                {c}
              </span>
            ))}
          </div>
        )}

        <Section title="它是干什么的">
          <p className="text-title leading-relaxed text-gray-800">
            {s.positioning}
          </p>
        </Section>

        {/* 先给"发生了什么 + 该怎么想"的人话结论,术语类研究信息往后放 */}
        <Section title="最近发生了什么">
          <ul className="space-y-1.5 text-sm text-gray-700">
            {todayNews.map((it) => (
              <li key={it.id} className="text-rose-600">
                • 今日简报:{it.title}
              </li>
            ))}
            <li>• {s.observation}</li>
          </ul>
        </Section>

        <Section title="散户怎么想" highlight>
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

        <Fundamentals code={s.code} market={s.market} />

        <Section title="对应的股票">
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

        <Section title="在产业链的位置">
          <ChainPosition
            sector={s.sector}
            up={upPeers}
            down={downPeers}
          />
        </Section>

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
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <section
      className={`mb-4 rounded-xl border p-4 ${
        highlight
          ? "border-amber-200 bg-amber-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        {title}
      </h2>
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
