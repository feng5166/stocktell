"use client";

// 今日简报信息流:把简报按"是否命中我的自选"分成「和我相关」+「其他市场动态」。
// 和我相关一律不锁(先认我,别拿用户自己的票去设墙);免费墙只作用于其他动态。
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { BriefingItem } from "@/lib/briefings";
import { AuthButton } from "@/components/auth/AuthButton";
import { useAuthModal } from "@/components/Providers";
import { useWatchlist } from "@/components/useWatchlist";
import { QuickAddWatch } from "@/components/QuickAddWatch";
import { InstantTake, QuietWatchCard } from "@/components/QuietWatchCard";
import { RiskSummary } from "@/components/RiskSummary";
import { WatchOverview } from "@/components/WatchOverview";
import { DeepRead } from "@/components/DeepRead";
import { IMPACT_META } from "@/lib/impact";
import { todayISO } from "@/lib/date";
import { track } from "@/lib/analytics";
import { SECTOR_ALIASES } from "@/lib/sector-alias";
import { STOCK_MAP } from "@/data/stocks";
import { TakeBody } from "@/components/RetailTake";
import { routeInsightForItem } from "@/data/trigger-sources";
import { REL_CHIP_CLS } from "@/lib/relation-rank";
import type { WatchChainInfo } from "@/lib/watch-relation";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

const FREE_LIMIT = 3;

export function BriefingFeed({
  items,
  loggedIn,
  initialCodes,
  insightHref,
  chainName,
  chainHref,
  relations,
  watchChainMap,
  evtMap,
}: {
  items: BriefingItem[];
  loggedIn: boolean;
  initialCodes?: string[]; // 服务端预取的登录用户自选,首屏即按它切分,省 /api/watchlist 一跳
  insightHref?: string | null; // 事件卡「看这条链怎么传导」的链级因果链入口(P0 全部事件属 AI 链)
  chainName?: string; // 事件卡「影响链」chip 文案(评审:字段顺序 变了啥→影响链→A股映射→怎么验证)
  chainHref?: string; // 影响链 chip 跳转 /chain/[id]
  relations?: Record<string, string>; // 条目id → 关系标签(直接相关/间接相关/情绪映射/产业链相关),替代「高影响」
  watchChainMap?: Record<string, WatchChainInfo>; // 全A股→链身份(服务端算,P1 和我相关结构化)
  evtMap?: Record<string, string>; // 条目id → 事件专篇 href(M2:命中已发布专篇时主入口升级)
}) {
  const wl = useWatchlist(initialCodes);
  const isMine = (it: BriefingItem) =>
    (it.triggerCode != null && wl.has(it.triggerCode)) ||
    it.beneficiaries.some((b) => wl.has(b.code));

  const mine = items.filter(isMine);

  // 从推送(微信/邮件/Web 通知,链接带 #mine)点进来时,自动滚到「和我相关」,直达"你的票今天"。
  // 内容是客户端水合的,等 wl.ready 后再滚才滚得准。
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#mine") return;
    if (!wl.ready) return;
    const el = document.getElementById("mine");
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [wl.ready]);

  // aha 命中/落空埋点(onboarding v2 漏斗唯一真盲区):有自选的会话记一次——
  // relation_hit(mode=briefing 命中简报 / quiet 安静卡兜底)或 relation_miss(理论上不再出现,
  // 留作 QuietWatchCard 覆盖不到时的告警信号)。每会话一次,sessionStorage 防重。
  const relTracked = useRef(false);
  useEffect(() => {
    if (relTracked.current || !wl.ready || wl.codes.size === 0) return;
    relTracked.current = true;
    try {
      if (sessionStorage.getItem("stocktell_rel_tracked")) return;
      sessionStorage.setItem("stocktell_rel_tracked", "1");
    } catch {
      /* 隐私模式:退化为每页一次 */
    }
    const quietCovered = Array.from(wl.codes).some((c) => STOCK_MAP[c]);
    const outOfPoolCount = Array.from(wl.codes).filter((c) => !STOCK_MAP[c]).length;
    if (mine.length > 0) {
      track("relation_hit", { mode: "briefing", watch_count: wl.codes.size, has_morning_brief: true });
    } else if (quietCovered) {
      track("relation_hit", { mode: "quiet", watch_count: wl.codes.size, has_morning_brief: false });
    } else {
      // miss 语义拆分(2.3 P1-2):走到这里=自选全部池外(池内票必被 QuietWatchCard 兜住),
      // reason 固定 out_of_pool + 池外数——miss 从告警变成扩池选题信号(配合 /api/pool-request)
      track("relation_miss", {
        reason: "out_of_pool",
        watch_count: wl.codes.size,
        out_of_pool_count: outOfPoolCount,
        has_morning_brief: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wl.ready, wl.codes.size, mine.length]);

  // 批量"为什么动":一次取回所有命中自选触发标的的解读(替代每卡各发一次)
  const mineTriggers = mine
    .filter((it) => it.triggerCode)
    .map((it) => ({ code: it.triggerCode as string, date: it.date, title: it.title }));

  return (
    <WhyProvider triggers={mineTriggers}>
    <div className="space-y-7">
      <section id="mine" className="scroll-mt-20 rounded-2xl bg-brand-50/40 p-3 sm:p-4">
        <SectionHead
          title="和我相关"
          hint={wl.codes.size ? `按你的 ${wl.codes.size} 只自选筛选` : undefined}
        />
        {!wl.ready ? (
          <MineEmpty guest={false} onAdd={() => {}} />
        ) : wl.codes.size === 0 ? (
          /* 免登录口径(新手路径 v2):游客与登录用户一样直接内联加自选,不再弹登录框 */
          <QuickAddWatch wl={wl} />
        ) : (
          <div className="space-y-3">
            <RiskSummary codes={wl.codes} />
            {/* 三轮走查:黄色早报卡折叠——首页收口,内容保留点开即看 */}
            {mine.length > 0 && (
              <details className="rounded-xl bg-amber-50/60 px-3 py-2">
                <summary className="cursor-pointer list-none text-xs font-medium text-amber-800">
                  ☀️ 你的今日早报 ▾
                </summary>
                <MorningBrief codes={wl.codes} items={mine} />
              </details>
            )}
            {/* 即时关系卡:本会话刚加的票当场自动解读(aha 不等第二天,命中/安静日都渲染) */}
            <InstantTake codes={wl.codes} chainMap={watchChainMap} />
            {/* P1 自选闭环:你的每只自选股 × 今日事件(所属链/环节/关系/验证点) */}
            {watchChainMap && (
              <MyWatchRelations
                codes={wl.codes}
                items={items}
                chainMap={watchChainMap}
              />
            )}
            {mine.length === 0 ? (
              <>
                <QuietMorningBrief issueDate={items[0]?.date} />
                <QuietWatchCard codes={wl.codes} chainMap={watchChainMap} />
                <WatchOverview codes={wl.codes} />
              </>
            ) : (
              /* 三轮走查:首页只保留 3 条,完整列表进 /daily 归档——首页是分发台不是内容站 */
              <CardFeed
                items={mine.slice(0, 3)}
                loggedIn={loggedIn}
                watchedCodes={wl.codes}
                insightHref={insightHref}
                chainName={chainName}
                chainHref={chainHref}
                relations={relations}
                evtMap={evtMap}
                mine
              />
            )}
            <div className="flex flex-wrap gap-4 pt-1">
              <Link href="/watchlist" className="text-xs font-medium text-brand-600 hover:underline">
                查看全部与我相关 →
              </Link>
              {items[0]?.date && (
                <Link href={`/daily/${items[0].date}`} className="text-xs font-medium text-brand-600 hover:underline">
                  查看全部深度分析 →
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
      {/* 「今天这些事件」完整事件流撤出首页(三轮走查:下半页必须收口,首页长度 -30%+)。
          事件索引由上方 EventTop3 承担,完整深读在 /daily/[date] 归档与事件专篇。 */}
    </div>
    </WhyProvider>
  );
}

// ===== 「为什么动」批量取数:一次请求拿回所有触发标的解读,卡片从 context 读 =====
interface WhyData {
  reason: string | null;
  asOf?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceSummary?: string | null;
  sourceSite?: string | null;
}
const WhyCtx = createContext<Map<string, WhyData>>(new Map());

function WhyProvider({
  triggers,
  children,
}: {
  triggers: { code: string; date: string; title?: string }[];
  children: React.ReactNode;
}) {
  const [map, setMap] = useState<Map<string, WhyData>>(new Map());
  const key = triggers.map((t) => t.code).join(",");
  useEffect(() => {
    if (triggers.length === 0) return;
    let active = true;
    fetch("/api/briefing/why", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: triggers }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!active || !d?.results) return;
        const m = new Map<string, WhyData>();
        for (const [c, v] of Object.entries(d.results)) m.set(c, v as WhyData);
        setMap(m);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // triggers 由父组件按 mine 推导,引用每次渲染会变,用 code 串作稳定依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <WhyCtx.Provider value={map}>{children}</WhyCtx.Provider>;
}

// 把早报正文里出现的股票名(来自相关条目的触发股/受益股)替换成可点链接 → /stock/[code]。
function linkifyBrief(text: string, items: BriefingItem[]): React.ReactNode[] {
  const map = new Map<string, string>(); // 词 → 跳转链接
  // 股票名 → 个股详情
  for (const it of items) {
    if (it.triggerName && it.triggerCode)
      map.set(it.triggerName, `/stock/${it.triggerCode}`);
    for (const b of it.beneficiaries) map.set(b.name, `/stock/${b.code}`);
  }
  // 板块简称 → 股票池按板块筛选(股票名优先,不覆盖)
  for (const [alias, sector] of Object.entries(SECTOR_ALIASES)) {
    if (!map.has(alias))
      map.set(alias, `/stocks?sector=${encodeURIComponent(sector)}`);
  }
  const words = Array.from(map.keys())
    .filter((w) => w && w.length >= 2)
    .sort((a, b) => b.length - a.length); // 长词优先,避免子串误匹配
  if (words.length === 0) return [text];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${words.map(esc).join("|")})`, "g");
  return text.split(re).map((seg, i) => {
    const href = map.get(seg);
    return href ? (
      <Link
        key={i}
        href={href}
        className="font-medium text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-900"
      >
        {seg}
      </Link>
    ) : (
      <span key={i}>{seg}</span>
    );
  });
}

// 「和我相关」顶部的个性化早报:LLM 综合你今天相关动态写一段人话。
// 接口只收 codes,相关条目由服务端自查(客户端传 items 曾是缓存投毒入口,已废除);
// 标题的"今日/最近一期"跟随接口返回的 date/stale——标题和正文永远描述同一期内容,
// 不用本地时钟判断(设备日期偏差不会错标),也不会出现"标题换了正文没换"。
function MorningBrief({ codes, items }: { codes: Set<string>; items: BriefingItem[] }) {
  const [brief, setBrief] = useState<{
    text: string;
    date?: string;
    stale?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const codeKey = Array.from(codes).sort().join(",");
  // 条目日期变化(如页面跨 07:00 重渲染换到今天这期)时重新拉取,正文跟上新一期
  const itemsDate = items[0]?.date;
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/morning-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // date=页面正在展示那期的日期:服务端按同一期解析,卡片与信息流不打架
      body: JSON.stringify({
        codes: codeKey ? codeKey.split(",") : [],
        date: itemsDate,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (active) {
          setBrief(d.brief ? { text: d.brief, date: d.date, stale: d.stale } : null);
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // mine 数组引用每次渲染都变,用 codeKey+itemsDate 作稳定依赖(避免重复请求)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeKey, itemsDate]);

  if (loading)
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3 text-sm text-gray-400">
        ☀️ 正在为你生成早报…
      </div>
    );
  if (!brief) return null;
  return (
    <div className="rounded-xl bg-amber-50 px-4 py-3">
      <div className="mb-1 text-xs font-medium text-amber-700">
        {brief.stale && brief.date
          ? `☀️ 你的早报(最近一期 · ${brief.date.slice(5)})`
          : "☀️ 你的今日早报"}
      </div>
      <p className="text-sm leading-relaxed text-gray-800">
        {linkifyBrief(brief.text, items)}
      </p>
      <DeepRead payload={{ kind: "morning", date: itemsDate }} />
    </div>
  );
}

// 其他市场动态:瀑布流无限滚动。数据已全在客户端,这里只是渐进渲染,滚到底自动加载更多。
// 卡片瀑布流:数据已全在客户端,渐进渲染,滚到底自动加载更多。
// gated=true 时套免费墙(其他动态);mine=true 时按自选高亮(和我相关,不锁)。
function CardFeed({
  items,
  loggedIn,
  watchedCodes,
  gated = false,
  mine = false,
  insightHref,
  chainName,
  chainHref,
  relations,
  evtMap,
  collapsed = false,
}: {
  items: BriefingItem[];
  loggedIn: boolean;
  watchedCodes: Set<string>;
  gated?: boolean;
  mine?: boolean;
  insightHref?: string | null;
  chainName?: string;
  chainHref?: string;
  relations?: Record<string, string>;
  evtMap?: Record<string, string>;
  collapsed?: boolean; // 首页事件区:默认只放 5 条,其余手动「查看更多」——首页是分发台不是事件库(评审)
}) {
  const STEP = 6;
  const INITIAL = collapsed ? 4 : STEP; // 首页事件降噪(视觉优化 2026-08-14):5→4,首页是分发台不是事件库
  const [visible, setVisible] = useState(INITIAL);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 非折叠模式(和我相关等)保留滚动渐进加载;折叠模式只走手动按钮,不自动铺开
  useEffect(() => {
    if (collapsed) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting)
          setVisible((v) => Math.min(v + STEP, items.length));
      },
      { rootMargin: "300px" } // 提前 300px 预加载,滚动不卡顿
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [items.length, collapsed]);

  // 免费墙(仅 gated):游客高影响全可见 + 累计前 3 条,其余锁定
  let shown = 0;
  const slice = items.slice(0, visible);
  return (
    <div className="space-y-3">
      {slice.map((it) => {
        const free = !gated || loggedIn || it.impact === "高" || shown < FREE_LIMIT;
        if (gated && free) shown++;
        return free ? (
          <BriefingCard
            key={it.id}
            item={it}
            mine={mine}
            watchedCodes={watchedCodes}
            insightHref={insightHref}
            chainName={chainName}
            chainHref={chainHref}
            relation={relations?.[it.id]}
            evtHref={evtMap?.[it.id]}
          />
        ) : (
          <LockedCard key={it.id} item={it} />
        );
      })}
      {visible < items.length ? (
        collapsed ? (
          <div className="pt-1 text-center">
            <button
              onClick={() => setVisible((v) => Math.min(v + STEP, items.length))}
              className="inline-flex min-h-[36px] items-center rounded-lg bg-white px-4 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50"
            >
              查看更多事件(还有 {items.length - visible} 条)
            </button>
          </div>
        ) : (
          <div
            ref={sentinelRef}
            className="flex flex-col items-center gap-1 py-5 text-gray-400"
          >
            <span className="animate-bounce text-base leading-none">↓</span>
            <span className="text-xs">
              继续向下滚动,加载更多 · {visible}/{items.length}
            </span>
          </div>
        )
      ) : (
        items.length > INITIAL && (
          <div className="py-4 text-center text-meta text-gray-300">
            — 已全部加载({items.length}条)—
          </div>
        )
      )}
    </div>
  );
}

// 「和我相关」空态壳:仅 wl.ready 之前的占位(永不裸 loading);
// ready 后无论登录与否都走 QuickAddWatch 内联加自选(免登录口径,新手路径 v2)。
function MineEmpty({ guest, onAdd }: { guest: boolean; onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-white p-4 text-center sm:p-5">
      <div className="text-sm font-medium text-gray-800">
        {guest ? "登录后添加自选股" : "添加你的自选股"}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        {guest
          ? "查看今天哪些全球事件影响你的股票。"
          : "StockTell 会告诉你:今天哪些全球事件正在影响它们。"}
      </p>
      <button
        onClick={onAdd}
        className="mt-3 inline-flex min-h-[40px] items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        {guest ? "登录并添加" : "⭐ 添加自选"}
      </button>
    </div>
  );
}

// P1 自选闭环:你的每只自选股 × 今日事件(所属链/环节/关系三档/今日触发/验证点)。
// 静态映射(chainMap)+ 今日事件叠加(items),不逐股打 LLM(拍板⑨)。
// 解释文案优先用 info.reason(chain-relations 一票一审的逐票说明,静态数据、非 LLM,不违拍板⑨);
// 下面三句通用模板只做 reason 缺失时的兜底——同档同环节的票用模板会一字不差(负责人 07-13 截图反馈)。
const REL_EXPLAIN: Record<string, string> = {
  直接映射: "「{seg}」是这条链传导最直接的环节之一,和海外事件关系紧,但仍要看订单落地。",
  间接映射: "「{seg}」受链条带动,但中间隔了几环,幅度看具体订单/客户/收入占比。",
  情绪映射: "「{seg}」更多是情绪/主题带动,不等于这次事件的直接受益方,真金白银看订单兑现。",
};
// 「今日触发」颜色(定稿②):去掉"影响"字样,只用深浅传递触发强度,供排序/视觉;不暗示股价
const TRIGGER_CLS: Record<string, string> = {
  高: "bg-rose-100 text-rose-700",
  中: "bg-amber-100 text-amber-700",
  低: "bg-slate-100 text-slate-500",
};
const TRIGGER_ORDER = { 高: 3, 中: 2, 低: 1 } as const;
const REL_ORDER: Record<string, number> = { 直接映射: 0, 间接映射: 1, 情绪映射: 2 };

interface CoveredRow {
  code: string;
  name: string;
  info: WatchChainInfo;
  impact: "高" | "中" | "低" | null;
  event: string | null;
  hit: boolean;
}

function MyWatchRelations({
  codes,
  items,
  chainMap,
}: {
  codes: Set<string>;
  items: BriefingItem[];
  chainMap: Record<string, WatchChainInfo>;
}) {
  const viewed = useRef(false);
  const covered: CoveredRow[] = [];
  // 非 A 股映射(定稿③:必须展示不消失)。区分两类:美股锚点(是产业链触发源、非 A 股持仓映射)
  // 与 真·暂未覆盖 A 股——避免把「今天正是 AI 事件 triggerCode 的美股」误标成"暂未纳入覆盖"(#5)。
  const anchors: { code: string; name: string; isTrigger: boolean }[] = [];
  const uncovered: { code: string; name: string }[] = [];
  for (const code of Array.from(codes)) {
    const info = chainMap[code];
    const name = STOCK_MAP[code]?.name ?? code;
    if (!info) {
      if (STOCK_MAP[code]?.market === "美股") {
        anchors.push({ code, name, isTrigger: items.some((it) => it.triggerCode === code) });
      } else {
        uncovered.push({ code, name });
      }
      continue;
    }
    const hits = items.filter(
      (it) => it.triggerCode === code || it.beneficiaries.some((b) => b.code === code)
    );
    const impact = hits.reduce<"高" | "中" | "低" | null>((acc, it) => {
      if (!acc || TRIGGER_ORDER[it.impact] > TRIGGER_ORDER[acc]) return it.impact;
      return acc;
    }, null);
    covered.push({ code, name, info, impact, event: hits[0]?.title ?? null, hit: hits.length > 0 });
  }

  const total = covered.length + uncovered.length + anchors.length;
  useEffect(() => {
    if (viewed.current || total === 0) return;
    viewed.current = true;
    track("home_related_to_me_view", {
      watched: total,
      affected: covered.filter((r) => r.hit).length,
      uncovered: uncovered.length,
      anchors: anchors.length,
    });
  }, [total, covered, uncovered.length, anchors.length]);

  if (total === 0) return null;
  // 排序(定稿 §6.1):点名在前 → 触发强度降序 → 关系类型(直接>间接>情绪)
  const affected = covered
    .filter((r) => r.hit)
    .sort(
      (a, b) =>
        TRIGGER_ORDER[b.impact ?? "低"] - TRIGGER_ORDER[a.impact ?? "低"] ||
        (REL_ORDER[a.info.relation] ?? 3) - (REL_ORDER[b.info.relation] ?? 3)
    );
  const quiet = covered
    .filter((r) => !r.hit)
    .sort((a, b) => (REL_ORDER[a.info.relation] ?? 3) - (REL_ORDER[b.info.relation] ?? 3));

  return (
    <div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-2 text-sm font-semibold text-gray-900">
        {affected.length > 0
          ? `你的自选里,今天有 ${affected.length} 只被产业链事件点名`
          : "你的自选今天没被产业链事件点名"}
      </div>
      <div className="space-y-2">
        {affected.map((r) => (
          <WatchRelationCard key={r.code} row={r} />
        ))}
      </div>
      {quiet.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-gray-400">
            其余自选 {quiet.length} 只(今日无直接事件,仍显示链身份)
          </summary>
          <div className="mt-2 space-y-2">
            {quiet.map((r) => (
              <WatchRelationCard key={r.code} row={r} quiet />
            ))}
          </div>
        </details>
      )}
      {/* 美股锚点:是产业链的触发源(非 A 股持仓映射),单列不误标"暂未覆盖"(#5) */}
      {anchors.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-gray-400">
            {/* P2:标题按 isTrigger 区分——不把全部锚点泛称"触发源",只有今日真触发的才叫触发源 */}
            美股锚点 {anchors.length} 只
            {anchors.filter((a) => a.isTrigger).length > 0
              ? `(今日 ${anchors.filter((a) => a.isTrigger).length} 只触发)`
              : ""}
          </summary>
          <div className="mt-2 space-y-1.5">
            {anchors.map((a) => (
              <div key={a.code} className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50/60 px-3 py-2">
                <Link href={`/stock/${a.code}`} className="text-sm font-medium text-gray-700 hover:underline">
                  {a.name}
                </Link>
                <span className="text-[11px] text-gray-400">
                  美股 · 产业链锚点{a.isTrigger ? "(今日 AI 事件触发源)" : ""}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
      {uncovered.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-gray-400">
            暂未覆盖 {uncovered.length} 只
          </summary>
          <div className="mt-2 space-y-1.5">
            {uncovered.map((u) => (
              <div key={u.code} className="flex items-center gap-2 rounded-lg bg-gray-50/60 px-3 py-2">
                <Link href={`/stock/${u.code}`} className="text-sm font-medium text-gray-700 hover:underline">
                  {u.name}
                </Link>
                <span className="text-[11px] text-gray-400">暂未纳入当前产业链覆盖</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {affected.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
          「今日触发」= 你的票今天被产业链事件点名,强弱仅表示事件相关度,不代表股价影响或收益预期。
        </p>
      )}
    </div>
  );
}

function WatchRelationCard({ row, quiet }: { row: CoveredRow; quiet?: boolean }) {
  const { code, name, info, impact, event } = row;
  return (
    <div className={`rounded-lg px-3 py-2.5 ${quiet ? "bg-gray-50/60" : "bg-gray-50"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={`/stock/${code}`}
          onClick={() =>
            track("home_related_stock_click", { code, relation: info.relation, chain_id: info.chainId })
          }
          className="text-sm font-medium text-gray-900 hover:text-brand-700 hover:underline"
        >
          {name}
        </Link>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            REL_CHIP_CLS[info.relation] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {info.relation}
        </span>
        {impact && (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TRIGGER_CLS[impact]}`}
            title="今日触发强弱=事件相关度,不代表股价影响或收益"
          >
            今日触发
          </span>
        )}
        <span className="text-[11px] text-gray-400">{info.segment}</span>
      </div>
      {event && (
        <p className="mt-1 text-xs text-gray-500">
          <span className="font-medium text-gray-600">今日触发</span>:{event}
        </p>
      )}
      {/* 一句话解释:优先逐票核定 reason(与 /stocks、个股页同源),缺失才退通用模板(定稿④:去股票名) */}
      <p className="mt-1 text-xs leading-relaxed text-gray-600">
        {info.reason ?? REL_EXPLAIN[info.relation].replace("{seg}", info.segment)}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        <span className="font-medium text-gray-600">需要验证</span>:{info.verify.join(" · ")}
      </p>
    </div>
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h2 className="text-base font-semibold tracking-tight text-gray-900">
        {title}
      </h2>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </div>
  );
}

// 无产业链动态时的守望文案:按北京时间所处的交易时段说人话(盯盘搭子口径)。
type MarketPhase = "pre" | "open" | "lunch" | "post" | "weekend";
function marketPhase(now: Date): MarketPhase {
  // 统一用北京时间(A 股),避免海外用户本地时区算错盘口状态
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return "weekend";
  const hm = Number(parts.hour) * 60 + Number(parts.minute);
  if (hm < 9 * 60 + 30) return "pre"; // 开盘前
  if (hm < 11 * 60 + 30) return "open"; // 上午盘
  if (hm < 13 * 60) return "lunch"; // 午间休市
  if (hm < 15 * 60) return "open"; // 下午盘
  return "post"; // 收盘后
}
const QUIET_COPY: Record<MarketPhase, string> = {
  pre: "开盘前 —— 你的票暂无产业链消息,开盘后有动静我提醒你 👀",
  open: "你的票今天没有 AI 产业链异动 —— 我盯着呢,有风吹草动第一时间告诉你 👀",
  lunch: "午间休市 —— 上午你的票没踩产业链的雷,下午我接着盯 👀",
  post: "今天收工 —— 你的票没踩 AI 产业链的雷,也没错过风口,明天我接着盯 👀",
  weekend: "周末休市 —— 你的票本周没有产业链异动,周一开盘我继续盯 👀",
};
// 没异动时的「今日早报」:沿用早报卡片样式(始终在场,不因没动态整块消失),
// 正文用时段感知的守望文案。默认通用文案(SSR/水合前),挂载后按北京时段切换。
// issueDate=页面当前展示那期简报的日期:回退展示最近一期时(如 00:00~07:00 今日未生成),
// 标题不自称"今日"、断言也只对"最近一期"负责——今天这期出来后结论可能不同,别把话说死。
function QuietMorningBrief({ issueDate }: { issueDate?: string }) {
  const [copy, setCopy] = useState<string | null>(null);
  const [staleView, setStaleView] = useState(false);
  useEffect(() => {
    const phase = marketPhase(new Date());
    // 周末回退展示上周五那期属正常节奏,守望文案本身就是"本周"口径,不当作陈旧
    const stale =
      !!issueDate && issueDate !== todayISO() && phase !== "weekend";
    setStaleView(stale);
    // 措辞不许诺"今天会有新一期":工作日节假日(如国庆)不是交易日,phase 却非 weekend,
    // 说"约 07:00 生成"会落空;改成有新一期再对的中性口径,平日/节假日都成立。
    setCopy(
      stale
        ? `今日暂无新简报,最近一期(${issueDate!.slice(5)})里你的票没有相关动态;有新一期我第一时间帮你对一遍 👀`
        : QUIET_COPY[phase]
    );
  }, [issueDate]);
  return (
    <div className="rounded-xl bg-amber-50 px-4 py-3">
      <div className="mb-1 text-xs font-medium text-amber-700">
        {staleView && issueDate
          ? `☀️ 你的早报(最近一期 · ${issueDate.slice(5)})`
          : "☀️ 你的今日早报"}
      </div>
      <p className="text-sm leading-relaxed text-gray-800">{copy ?? QUIET_COPY.open}</p>
    </div>
  );
}

// 行内加粗:把 **xxx** 渲染成 <strong>(快读/解读里都用)
function inlineBold(s: string, kp: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    /^\*\*[^*]+\*\*$/.test(seg) ? (
      <strong key={kp + i} className="font-semibold text-gray-900">
        {seg.slice(2, -2)}
      </strong>
    ) : (
      <span key={kp + i}>{seg}</span>
    )
  );
}

// 轻量 Markdown 渲染(给 StockTell 解读的流式文本):加粗、小标题、列表;忽略 --- 分隔线
function renderRich(text: string): JSX.Element[] {
  const blocks: JSX.Element[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) return; // 忽略分隔线
    const heading = /^#{1,6}\s/.test(line) || /^\*\*[^*]+\*\*[::]?$/.test(line);
    let content = line.replace(/^#{1,6}\s*/, "");
    const isList = /^[-*]\s+/.test(content);
    if (isList) content = content.replace(/^[-*]\s+/, "");
    if (heading) {
      const t = content.replace(/^\*\*/, "").replace(/\*\*[::]?$/, "");
      blocks.push(
        <p key={i} className="mt-3 text-sm font-semibold text-gray-900 first:mt-0">
          {t}
        </p>
      );
    } else if (isList) {
      blocks.push(
        <p key={i} className="ml-1 mt-1 text-sm leading-relaxed text-gray-700">
          • {inlineBold(content, i + "-")}
        </p>
      );
    } else {
      blocks.push(
        <p key={i} className="mt-1.5 text-sm leading-relaxed text-gray-700">
          {inlineBold(content, i + "-")}
        </p>
      );
    }
  });
  return blocks;
}

// 关系标签配色(评审:事件卡用关系分级替代「高影响」,与 insight 页同色系)
// TakeBody 迁到 components/RetailTake.tsx(共享,链页等消费点复用);顶部已 import。

function BriefingCard({
  item,
  mine,
  watchedCodes,
  insightHref,
  chainName,
  chainHref,
  relation,
  evtHref,
}: {
  item: BriefingItem;
  mine?: boolean;
  watchedCodes?: Set<string>;
  insightHref?: string | null;
  chainName?: string;
  chainHref?: string;
  relation?: string; // 关系标签(评审:替代「高影响」,不用影响强弱暗示结果)
  evtHref?: string; // 事件专篇入口(M2):命中已发布专篇时主按钮从链级升级为事件级
}) {
  const meta = IMPACT_META[item.impact];
  // P1.1:海外 AI 应用事件(Palantir/ServiceNow 等 + AI 商业化内容)→ 引到「为什么不等于国内受益」
  const appRoute = routeInsightForItem(item);
  const [deep, setDeep] = useState("");
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepStarted, setDeepStarted] = useState(false);
  const { status } = useSession();
  const { open: openAuth } = useAuthModal();

  async function loadDeep() {
    // 未登录:弹登录框 + 友好提示,不打接口
    if (status !== "authenticated") {
      openAuth("登录后,StockTell 用大白话帮你拆这条对你手里的票意味着什么 —— 免费,不喊单。");
      return;
    }
    setDeepStarted(true);
    setDeepLoading(true);
    setDeep("");
    try {
      const res = await fetch("/api/briefing/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok || !res.body) {
        if (res.status === 401) {
          // 会话过期:弹登录框,收起解读区
          openAuth("登录后,StockTell 用大白话帮你拆这条对你手里的票意味着什么 —— 免费,不喊单。");
          setDeepStarted(false);
          return;
        }
        setDeep("解读暂时不可用,稍后再试。");
        setDeepLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setDeep((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch {
      setDeep("解读出错了,稍后再点一次试试。");
    } finally {
      setDeepLoading(false);
    }
  }

  return (
    <article
      className={`rounded-xl bg-white p-4 shadow-sm`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex rounded px-1.5 py-0.5 text-meta font-medium ${
              relation ? REL_CHIP_CLS[relation] ?? "bg-gray-100 text-gray-600" : meta.tagClass
            }`}
          >
            {relation ?? meta.label}
          </span>
          {/* 影响链 chip(评审字段:变了啥→影响链→A股映射→怎么验证) */}
          {chainName &&
            (chainHref ? (
              <Link
                href={chainHref}
                className="inline-flex rounded bg-brand-50 px-1.5 py-0.5 text-meta font-medium text-brand-700 hover:bg-brand-100"
              >
                {chainName}
              </Link>
            ) : (
              <span className="inline-flex rounded bg-brand-50 px-1.5 py-0.5 text-meta font-medium text-brand-700">
                {chainName}
              </span>
            ))}
        </span>
        <span className="shrink-0 text-meta text-gray-400">
          {item.date.slice(5)}
        </span>
      </div>
      <h2 className="text-title font-semibold leading-snug text-gray-900">
        {item.title}
      </h2>
      {mine && item.triggerCode && <WhyLine code={item.triggerCode} />}
      {item.beneficiaries.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400">A 股映射</span>
          {item.beneficiaries.map((b) => {
            const watched = watchedCodes?.has(b.code);
            return (
              <Link
                key={b.code}
                href={`/stock/${b.code}`}
                title={watched ? "你的自选" : undefined}
                className={`rounded px-2 py-0.5 text-xs ${
                  watched
                    ? "bg-amber-100 font-medium text-amber-800 hover:bg-amber-200"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {watched && <span className="mr-0.5">★</span>}
                {b.name}
              </Link>
            );
          })}
        </div>
      )}
      <div className="mt-3 rounded-lg bg-gray-50/70 px-3 py-2">
        {!item.retailTake.includes("**这次变了啥**") && (
          <div className="mb-1 text-xs font-medium text-gray-500">这条逻辑怎么验证</div>
        )}
        <TakeBody text={item.retailTake} />

        {/* P1.1:海外 AI 应用事件的"反误判"入口——点破"同题材≠国内受益"(与链级 insight 不同语义) */}
        {appRoute && (
          <Link
            href={`/insight/${appRoute.slug}`}
            onClick={() => track("home_event_app_route_click", { event_id: item.id })}
            className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 hover:bg-amber-100"
          >
            <span className="text-xs font-medium text-amber-800">🔍 {appRoute.label}</span>
            <span className="shrink-0 text-xs text-amber-500">→</span>
          </Link>
        )}

        {/* 底部双入口(拍板⑤):主=链级因果框架(insight),次=实时拆解(原深读,能力保留换文案) */}
        {!deepStarted && (
          <div className="mt-2 flex items-center justify-between gap-2">
            {/* M2:命中已发布事件专篇 → 主入口升级为事件级完整传导;否则维持链级口径(拍板④) */}
            {evtHref ? (
              <Link
                href={evtHref}
                onClick={() =>
                  track("home_event_card_click", {
                    event_id: item.id,
                    insight_id: evtHref.split("/").pop() ?? "",
                    kind: "event",
                  })
                }
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                看这件事的完整传导 →
              </Link>
            ) : insightHref ? (
              <Link
                href={insightHref}
                onClick={() =>
                  track("home_event_card_click", {
                    event_id: item.id,
                    insight_id: insightHref.split("/").pop() ?? "",
                  })
                }
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                看这条链怎么传导 →
              </Link>
            ) : (
              <span className="text-xs text-gray-300">该链因果链生成中</span>
            )}
            <button
              onClick={loadDeep}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
            >
              🔍 拆开这条事件
            </button>
          </div>
        )}

        {deepStarted && (
          <div className="mt-2.5 border-t border-gray-200 pt-2.5">
            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
              <span>🤖</span> StockTell 解读
            </div>
            {deepLoading && !deep && (
              <p className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-gray-400" />
                StockTell 助手正在为你解读这条信息,请稍候…
              </p>
            )}
            {deep && (
              <div>
                {renderRich(deep)}
                {deepLoading && <span className="animate-pulse text-gray-400">▍</span>}
                {!deepLoading && (
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    以上为 AI 对公开信息的整理与解读,不构成投资建议。
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// 把文本里的涨跌百分比染色:涨/+ 红,跌/- 绿(A股习惯);方向不明的裸百分比不染色。
function colorizePct(text: string): React.ReactNode[] {
  const re =
    /(暴涨|暴跌|大涨|大跌|急跌|重挫|跳水|拉升|上涨|下跌|下挫|反弹|回升|回落|涨幅|跌幅|收涨|收跌|涨|跌)?\s*([+-]?\d+(?:\.\d+)?%)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const word = m[1] ?? "";
    const num = m[2];
    const down = num.startsWith("-") || (!num.startsWith("+") && /跌|挫|跳水|回落/.test(word));
    const up = num.startsWith("+") || (!num.startsWith("-") && /涨|升|反弹|拉升/.test(word));
    const cls = down ? "text-emerald-600 font-medium" : up ? "text-rose-600 font-medium" : undefined;
    out.push(
      <span key={i++} className={cls}>
        {word}
        {num}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// 为什么动:仅「和我相关」卡片按需拉;后端没开联网检索就返回空,这里啥也不显示(不编因果)。
function WhyLine({ code }: { code: string }) {
  const map = useContext(WhyCtx);
  const [showSrc, setShowSrc] = useState(false);
  useLockBodyScroll(showSrc); // 来源弹层打开时锁背景滚动(在早返回前调用,守住 hooks 顺序)
  const data = map.get(code);
  if (!data || !data.reason) return null;
  const reason = data.reason;
  const asOf = data.asOf ?? null;
  const sourceUrl = data.sourceUrl ?? null;
  const sourceTitle = data.sourceTitle ?? null;
  const sourceSummary = data.sourceSummary ?? null;
  const sourceSite = data.sourceSite ?? null;
  // 有来源摘要 → 站内弹窗展示(不跳外站);只有链接没摘要 → 退化为外链
  const hasInSite = !!(sourceTitle || sourceSummary);
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
      <span className="font-medium text-gray-600">为什么动</span>:{colorizePct(reason)}
      {asOf && <span className="text-gray-400"> ·{asOf}</span>}
      {hasInSite ? (
        <button
          type="button"
          onClick={() => setShowSrc(true)}
          className="text-brand-500 hover:underline"
        >
          {" "}
          ·来源
        </button>
      ) : sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-brand-500 hover:underline"
        >
          {" "}
          ·来源
        </a>
      ) : (
        <span className="text-gray-400"> ·以官方公告为准</span>
      )}

      {showSrc && hasInSite && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-4 sm:items-center"
          onClick={() => setShowSrc(false)}
        >
          <div
            className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold leading-snug text-gray-900">
                {sourceTitle ?? "来源"}
              </h3>
              <button
                type="button"
                onClick={() => setShowSrc(false)}
                className="-m-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {sourceSite && <span>{sourceSite}</span>}
              {asOf && <span> ·{asOf}</span>}
            </div>
            {sourceSummary && (
              <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-gray-700">
                {colorizePct(sourceSummary)}
              </p>
            )}
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-xs text-brand-500 hover:underline"
              >
                查看原文 ↗
              </a>
            )}
            <p className="mt-3 border-t border-gray-100 pt-2 text-meta text-gray-500">
              内容来自公开检索,仅供参考,以官方公告为准。
            </p>
          </div>
        </div>
      )}
    </p>
  );
}

function LockedCard({ item }: { item: BriefingItem }) {
  const meta = IMPACT_META[item.impact];
  return (
    <article className="relative overflow-hidden rounded-xl bg-white shadow-sm p-4">
      <div className="pointer-events-none select-none blur-[5px]">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium">
          <span>{meta.emoji}</span>
          <span className="text-gray-500">{meta.label}</span>
        </div>
        <h2 className="text-title font-semibold text-gray-900">{item.title}</h2>
        <p className="mt-3 text-sm text-gray-500">
          登录后查看完整分析与关联标的……
        </p>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <AuthButton className="rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white shadow hover:bg-gray-700">
          🔓 登录解锁全部简报
        </AuthButton>
      </div>
    </article>
  );
}
