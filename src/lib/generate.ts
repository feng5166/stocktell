// 简报生成引擎:
// 1) 拉美股异动 → 2) 映射 A 股 + 取数(预期差)→ 3) LLM 生成三段式草稿。
// 没有 LLM_API_KEY 时用模板生成,保证闭环可跑。
import { STOCKS, STOCK_MAP, aSharePeers } from "@/data/stocks";
import { fetchQuotes, type Quote } from "@/lib/quotes";
import { getLLM, LLM_MODEL } from "@/lib/llm";
import type { Impact, NewBriefingItem } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { prevAshareTradingDay } from "@/lib/tushare";
import { usCumulativeChange } from "@/lib/us-history";

const MOVER_THRESHOLD = 2; // 美股 |涨跌| ≥ 2% 视为异动
const MAX_MOVERS = 12; // 异动条数封顶(控 LLM 时长,避免节后累计一堆破阈值导致超时)

interface Mover {
  code: string;
  name: string;
  change: number;
  cumulative?: boolean; // true=假期累计涨跌(节后首个交易日)
  sinceDate?: string; // 累计起算日(上个 A 股交易日)
  sessions?: number; // 累计跨越的美股交易日数
  peers: {
    code: string;
    name: string;
    change: number | null;
    position: string;
    sector: string;
    observation: string;
  }[];
}

function impactFromChange(abs: number): Impact {
  if (abs >= 4) return "高";
  if (abs >= 2) return "中";
  return "低";
}

// 美东最近一个工作日(YYYY-MM-DD)。无需节假日表:美股休市的节日本身是工作日、
// 但当天没有新行情,asOf 会落在前一交易日 → 自然被判为 stale。周末由 cron 跳过。
function mostRecentUSWeekday(now: Date): string {
  const dayMs = 86400000;
  for (let i = 0; i < 7; i++) {
    const t = new Date(now.getTime() - i * dayMs);
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
    }).format(t);
    if (wd !== "Sat" && wd !== "Sun") {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(t);
    }
  }
  return "";
}

// 找美股异动 + 映射 A 股(双向取并集)。
// usMarketClosed:美股最近一个工作日没有新行情(节假日休市),此时不硬生成隔夜映射。
async function findMovers(
  date: string
): Promise<{ movers: Mover[]; usMarketClosed: boolean }> {
  const { quotes } = await fetchQuotes(STOCKS.map((s) => s.code));
  const q = (code: string): Quote | undefined => quotes[code];

  // 美股行情新鲜度:取所有美股报价里最新的 asOf 日期,与"美东最近工作日"比对
  const usAsOf = STOCKS.filter((s) => s.market === "美股")
    .map((s) => q(s.code)?.asOf)
    .filter((d): d is string => Boolean(d));
  const freshestUS = usAsOf.length ? usAsOf.sort().at(-1)! : undefined;
  const expected = mostRecentUSWeekday(new Date());
  // 能确定新鲜度(拿到 asOf)且最新行情落后于应有交易日 → 美股休市
  const usMarketClosed = Boolean(freshestUS && expected && freshestUS < expected);

  if (usMarketClosed) return { movers: [], usMarketClosed: true };

  // 节后缺口判定:与上个 A 股交易日间隔 ≥4 个自然日 → 用"假期累计"涨跌;否则维持实时单日。
  const prevDay = await prevAshareTradingDay(date);
  const gapDays = prevDay
    ? Math.round(
        (Date.parse(`${date}T00:00:00+08:00`) -
          Date.parse(`${prevDay}T00:00:00+08:00`)) /
          86400000
      )
    : 0;
  const holiday = Boolean(prevDay) && gapDays >= 4;

  const movers: Mover[] = [];

  if (holiday && prevDay) {
    // 假期累计:对所有美股算"自上个 A 股交易日以来"的累计涨跌,按累计幅度选异动
    const usStocks = STOCKS.filter((s) => s.market === "美股");
    const results = await Promise.all(
      usStocks.map(async (s) => ({
        s,
        cum: await usCumulativeChange(s.code, prevDay, date),
      }))
    );
    for (const { s, cum } of results) {
      if (!cum || Math.abs(cum.change) < MOVER_THRESHOLD) continue;
      const peers = aSharePeers(s);
      if (peers.length === 0) continue;
      movers.push({
        code: s.code,
        name: s.name,
        change: cum.change,
        cumulative: true,
        sinceDate: prevDay,
        sessions: cum.sessions,
        peers: peers.map((p) => ({
          code: p.code,
          name: p.name,
          change: q(p.code)?.change ?? null,
          position: p.position,
          sector: p.sector,
          observation: p.observation,
        })),
      });
    }
  } else {
    for (const us of STOCKS) {
      if (us.market !== "美股") continue;
      const quote = q(us.code);
      const change = quote?.change;
      if (change === undefined || Math.abs(change) < MOVER_THRESHOLD) continue;
      // 丢掉个别 asOf 落后于最新交易日的陈旧报价(避免拿旧数据当今日异动)
      if (freshestUS && quote?.asOf && quote.asOf < freshestUS) continue;

      const peers = aSharePeers(us);
      if (peers.length === 0) continue;

      movers.push({
        code: us.code,
        name: us.name,
        change,
        peers: peers.map((p) => ({
          code: p.code,
          name: p.name,
          change: q(p.code)?.change ?? null,
          position: p.position,
          sector: p.sector,
          observation: p.observation,
        })),
      });
    }
  }
  // 异动幅度大的在前,并封顶条数(控时)
  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return { movers: movers.slice(0, MAX_MOVERS), usMarketClosed: false };
}

/* ---------- 模板生成(无 LLM 时) ---------- */
function templateDrafts(date: string, movers: Mover[]): NewBriefingItem[] {
  return movers.map((m) => {
    const dir = m.change > 0 ? "上涨" : "下跌";
    // 假期累计 vs 隔夜单日,措辞不同
    const window = m.cumulative
      ? `假期累计${dir} ${Math.abs(m.change).toFixed(2)}%(${m.sessions ?? "多"}个交易日)`
      : `隔夜${dir} ${Math.abs(m.change).toFixed(2)}%`;
    const lagging = m.peers.filter(
      (p) => p.change !== null && m.change - p.change >= 1.5
    );
    const peerText = m.peers
      .map((p) => `${p.name}(${p.change === null ? "未开盘" : (p.change > 0 ? "+" : "") + p.change.toFixed(2) + "%"})`)
      .join(" · ");
    const prefix = m.cumulative
      ? `A 股节后首个交易日,需一次性消化假期内美股的累计变动。${m.name}假期累计${dir} ${Math.abs(m.change).toFixed(2)}%`
      : `${m.name}${dir} ${m.change.toFixed(2)}%`;
    const take =
      lagging.length > 0
        ? `${prefix},对应 A 股 ${lagging
            .map((p) => p.name)
            .join("、")} 还没跟上,存在预期差。注意板块情绪,追高需谨慎。`
        : `${prefix},对应 A 股标的或同步反应,短期跟随板块情绪波动。`;
    return {
      date,
      impact: impactFromChange(Math.abs(m.change)),
      title: `${m.name}${window}`,
      triggerCode: m.code,
      triggerName: m.name,
      triggerChange: m.change,
      beneficiaries: m.peers.map((p) => ({ code: p.code, name: p.name })),
      retailTake: `${take} 受益 A 股:${peerText}。(历史规律不代表未来,不构成投资建议)`,
      sourceUrl: null,
    };
  });
}

/* ---------- LLM 生成 ---------- */
const SYSTEM_PROMPT = `你是一名资深 A 股产业链分析师,面向看不懂产业链的散户说人话。
任务:把"今日美股异动 + 对应 A 股标的数据"翻译成简报条目,每条三段式:影响等级 / 标题 / 散户怎么想。

硬性合规要求(必须遵守):
- 禁止使用"买入/卖出/建议买/推荐/抄底/满仓"等任何操作指令性措辞。
- 用"风险提示、历史规律、值得关注、注意"等中性表达。
- 锋利点放在"美股→A股 的传导映射"和"预期差(美股涨了 A 股还没动)"上,而不是给买卖结论。
- 每条结尾隐含或显式提示"不构成投资建议"。

写作要求:
- title 简短,点明触发事件(如"英伟达隔夜大涨,数据中心需求超预期")。
- impact 取值仅限 高/中/低:涨跌幅大、链条核心→高;一般→中;影响有限→低。
- retailTake 用大白话,2-4 句,先讲传导逻辑,再点出预期差或风险。
- beneficiaryCodes 从给定 peers 的 code 里选,不要编造。`;

interface LLMItem {
  impact: Impact;
  title: string;
  triggerCode: string;
  beneficiaryCodes: string[];
  retailTake: string;
}

const JSON_SPEC = `只输出一个 JSON 对象,形如:
{"items":[{"impact":"高|中|低","title":"...","triggerCode":"触发的美股代码","beneficiaryCodes":["A股代码",...],"retailTake":"散户怎么想,2-4句"}]}
不要输出 JSON 以外的任何文字。每个输入异动对应一条 item。`;

async function llmDrafts(
  date: string,
  movers: Mover[]
): Promise<NewBriefingItem[]> {
  const client = getLLM();
  if (!client) return templateDrafts(date, movers);
  const cumulative = movers.some((m) => m.cumulative);
  const payload = movers.map((m) => ({
    triggerCode: m.code,
    triggerName: m.name,
    usChangePct: m.change,
    cumulative: !!m.cumulative,
    sessions: m.sessions,
    peers: m.peers.map((p) => ({
      code: p.code,
      name: p.name,
      aChangePct: p.change,
      position: p.position,
      sector: p.sector,
      observation: p.observation,
    })),
  }));

  const resp = await client.chat.completions.create(
    {
    model: LLM_MODEL,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${JSON_SPEC}` },
      {
        role: "user",
        content: `${
          cumulative
            ? "【特别说明】今天是 A 股节后首个交易日,下方 usChangePct 是该美股在 A 股休市期间的【假期累计涨跌】(跨多个交易日,非单日)。title 和 retailTake 必须点明\"假期累计 / A股节后需一次性消化\",不要用\"隔夜\"字样。\n\n"
            : ""
        }今日(${date})美股异动与对应 A 股数据如下(JSON)。请为每个异动生成一条简报条目。\n\n${JSON.stringify(
          payload,
          null,
          2
        )}`,
      },
    ],
    },
    // 40s 超时 + 禁用 SDK 自动重试(默认重试2次会叠加到 >60s 撞 Hobby 上限);
    // 超时抛错 → generateDrafts catch 回退模板,函数总能在限内返回。
    { timeout: 40000, maxRetries: 0 }
  );

  const text = resp.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text) as { items: LLMItem[] };

  // 触发美股的真实涨跌(用于记账判方向),按 mover 代码回查
  const changeByCode = new Map(movers.map((m) => [m.code, m.change]));

  return (parsed.items ?? []).map((it) => {
    const beneficiaries = (it.beneficiaryCodes ?? [])
      .map((c) => STOCK_MAP[c])
      .filter(Boolean)
      .map((p) => ({ code: p.code, name: p.name }));
    const trigger = STOCK_MAP[it.triggerCode];
    return {
      date,
      impact: it.impact,
      title: it.title,
      triggerCode: trigger?.code ?? it.triggerCode ?? null,
      triggerName: trigger?.name ?? null,
      triggerChange: changeByCode.get(it.triggerCode) ?? null,
      beneficiaries,
      retailTake: it.retailTake,
      sourceUrl: null,
    };
  });
}

export async function generateDrafts(opts?: {
  date?: string;
  forceTemplate?: boolean;
}): Promise<{
  date: string;
  drafts: NewBriefingItem[];
  engine: "llm" | "template";
  usMarketClosed: boolean;
}> {
  const date = opts?.date || todayISO(); // 可指定日期(管理员演示/回测累计口径)
  const { movers, usMarketClosed } = await findMovers(date);
  const useLLM = !opts?.forceTemplate && Boolean(getLLM());
  let drafts: NewBriefingItem[];
  let engine: "llm" | "template" = "template";
  if (useLLM && movers.length > 0) {
    try {
      drafts = await llmDrafts(date, movers);
      engine = "llm";
    } catch {
      drafts = templateDrafts(date, movers);
    }
  } else {
    drafts = templateDrafts(date, movers);
  }
  return { date, drafts, engine, usMarketClosed };
}
