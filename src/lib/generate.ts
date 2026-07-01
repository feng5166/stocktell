// 简报生成引擎:
// 1) 拉美股异动 → 2) 映射 A 股 + 取数(预期差)→ 3) LLM 生成三段式草稿。
// 没有 LLM_API_KEY 时用模板生成,保证闭环可跑。
import { STOCKS, STOCK_MAP, aSharePeers } from "@/data/stocks";
import { fetchQuotes, type Quote } from "@/lib/quotes";
import { chatTimed } from "@/lib/llm";
import { getLLMFor } from "@/lib/llm-provider";
import type { Impact, NewBriefingItem } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { prevAshareTradingDay } from "@/lib/tushare";
import { usCumulativeChange } from "@/lib/us-history";
import { usLatestTradingDay } from "@/lib/yahoo";
import { sendFeishu } from "@/lib/feishu";

const MOVER_THRESHOLD = 2; // 美股 |涨跌| ≥ 2% 视为异动
const MAX_MOVERS = 8; // 异动条数封顶(控 LLM 时长,让 LLM 在 40s 内更可能跑完;深度解读走按需流式)

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

  // 地板健康检查(影子模式):主源(新浪+腾讯)双挂 → 美股报价全空时,freshestUS=undefined、
  // usMarketClosed=false,但下面 movers 会全空 → 0 条简报的静默失败(2026-06-29 出过)。
  // 用独立 Yahoo 探针区分"真休市/无异动"与"源故障":探针显示应有交易日有数据却取不到 → 源故障告警。
  // 仅告警、不改 movers/usMarketClosed —— 生成行为完全不变,跑稳后再用于驱动重试/缓存回退。
  const usQuoteCount = STOCKS.filter(
    (s) => s.market === "美股" && q(s.code) !== undefined
  ).length;
  if (usQuoteCount === 0) {
    try {
      const probeDay = await usLatestTradingDay();
      if (probeDay && expected && probeDay >= expected) {
        await sendFeishu(
          `[告警] 美股主源(新浪+腾讯)双挂:报价全空,但独立 Yahoo 探针显示 ${probeDay} 有数据` +
            `(应有交易日 ${expected})。简报可能误判为「0 条」静默失败,请检查行情源/IP 封禁。`
        ).catch(() => {});
      } else {
        console.log(
          `[us-health] 主源空,探针最新交易日=${probeDay ?? "null"}(应有 ${expected})→ 判定真休市/无异动,不告警`
        );
      }
    } catch {
      /* 探针失败不影响生成 */
    }
  }

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
    return {
      date,
      impact: impactFromChange(Math.abs(m.change)),
      title: `${m.name}${window}`,
      triggerCode: m.code,
      triggerName: m.name,
      triggerChange: m.change,
      beneficiaries: m.peers.map((p) => ({ code: p.code, name: p.name })),
      retailTake: buildTake(m),
      sourceUrl: null,
    };
  });
}

// 零容忍:文案含任何具体涨跌数字(X% / X个点 / 涨了X / 跌了X)即判违规 → 回退模板。
export function hasSpecificMove(t: string): boolean {
  return (
    /\d+(\.\d+)?\s*%/.test(t) ||
    /\d+\s*个\s*多?\s*点/.test(t) ||
    /(涨|跌)\s*了?\s*\d/.test(t)
  );
}

// 把 LLM 文案里的具体涨跌数字"中性化"(去数字、保留其对这只票的差异化分析),
// 而不是整条丢弃换模板——否则同向普涨日 N 条会全塌成同一句模板,千篇一律。
// 中性化后若仍残留数字,调用方再回退模板。
export function neutralizeNumbers(t: string): string {
  return t
    // 涨/跌 [超|了|约] N [个][多][点|%] → 涨/跌(如 涨了3个多点/涨超5%/微涨0.87% → 涨)
    .replace(/([涨跌])\s*(?:超|了|约)?\s*\d+(?:\.\d+)?\s*个?\s*多?\s*[点%]?/g, "$1")
    // 残留的 +N% / -N% / N% → 去掉
    .replace(/[+\-]?\d+(?:\.\d+)?\s*%/g, "")
    // 残留的 "N 个多点"
    .replace(/\d+\s*个\s*多?\s*点/g, "")
    // 收尾清理:多空格 / 重复标点 / 悬空的"了"
    .replace(/[ \t]{2,}/g, " ")
    .replace(/([,,。;;、])\s*\1+/g, "$1")
    .replace(/([涨跌])了(?=[,,。;;、\s]|$)/g, "$1")
    .trim();
}

// 模板兜底的「散户怎么想」:按方向 + A股相对美股的强弱定性,给"所以呢"+一句真提醒(非买卖)。
// 一律不写具体涨跌数字(美股幅度也只用定性"大跌/重挫/微跌"),避免与页面实时行情打架。
function buildTake(m: Mover): string {
  const abs = Math.abs(m.change);
  const strong = abs >= 5 ? "大" : ""; // 幅度定性:≥5% 用"大涨/大跌",否则普通
  const up = `${strong}涨`;
  const down = `${strong}跌`;
  const tag = m.cumulative ? "假期累计" : "隔夜";
  const lead = m.cumulative ? "A股节后首日要一次性消化假期里的变动:" : "";
  const shortObs = (s?: string) => (s ? s.split(/[;;。,,]/)[0].slice(0, 28) : "");
  const names = m.peers.slice(0, 2).map((p) => p.name).join("、");
  // 用领头标的的 observation 加一句"懂这只票"的个性化,消除多只雷同
  const first = m.peers[0];
  const color = first?.observation ? `(${first.name}:${shortObs(first.observation)})` : "";

  // 一律【前瞻】:早报盘前生成、A 股当天还没开盘、方向未知,绝不断言 A 股已经怎么走
  // (否则和页面顶部实时行情打架,如"+3.65%"配文"微跌")。只陈述触发美股(隔夜已收盘)+ A 股该盯什么。
  const pos = first?.position; // 上游/中游/下游 → 分化措辞,避免多条模板雷同
  if (m.change > 0) {
    const watch =
      pos === "上游"
        ? "开盘看订单/产能能不能兑现,别只跟着情绪冲"
        : pos === "下游"
        ? "开盘看需求侧有没有放量,情绪票追高尤其危险"
        : "开盘重点看能不能放量跟上,跟得上才是真共振、别追在情绪高点";
    return `${lead}海外${m.name}${tag}${up},A股${names}${color}${watch};跟不上要么没轮到、要么本就不相关(海外营收占比低),别一开盘就冲。`;
  }
  const watchD =
    pos === "上游"
      ? "开盘看是订单预期变了还是纯情绪杀,别把承压当错杀去抄"
      : pos === "下游"
      ? "开盘看需求端有没有被误伤,恐慌杀多半只是情绪"
      : "开盘关键看低开企稳(常是错杀)还是低开杀跌(真承压)";
  return `${lead}海外${m.name}${tag}${down},A股${names}${color}${watchD},别被恐慌带着走;若有独立逻辑的扛住了,也留意补跌还没轮到的风险。`;
}

/* ---------- LLM 生成 ---------- */
const SYSTEM_PROMPT = `你是一个天天盯盘、又特别会说人话的"老股民搭子",帮看不懂产业链的散户把一条美股异动翻译成"跟我的票什么关系、我到底该怎么想"。

合规铁律(违反即失败):
- 禁止"买入/卖出/建议买/推荐/抄底/满仓/加仓/清仓"等任何操作指令性措辞。
- 可以点透机会与陷阱、提示风险,但绝不下买卖结论。
- 不要写"不构成投资建议 / 历史规律不代表未来"之类免责声明(页面底部已有,别重复)。

retailTake 怎么写(这是核心,绝不能写成复述行情的废话):
- 【硬性·违反即失败 ①】不出现任何具体涨跌数字(A股、美股都不行):不要写"涨了3个多点""跌6个点""涨超5%""微涨0.87%"这类。
- 【硬性·违反即失败 ②】不断言 A 股个股当天"已经/正在"怎么走——不要写"工业富联微跌""浪潮逆势走强""XX扛住了/没跟跌/跌得更狠/相对抗跌"这种把 A 股当天涨跌当既成事实的话。
  原因:早报盘前生成、A 股当天还没开盘,你拿到的 A 股数据是上一交易日的;一旦断言方向,必和页面顶部【实时行情】打架(用户会看到"+3.65%"却配文"微跌",直接击穿信任)。
  → A 股一律用【前瞻 / 条件句】:"开盘重点看 XX 能不能放量站上去""盯 XX 是否缩量企稳""若高开冲高回落、警惕借利好出货""若跟不上,要么补涨没轮到、要么本就不相关"。
- 触发美股是隔夜已收盘、方向已知,可照常陈述(如"超微隔夜重挫""英伟达隔夜大涨")。
- 直接给"所以呢",别复述行情。按"A 股可能的强弱"给【前瞻】判断(用"可能 / 该盯 / 若…则",不要用"已经"):
  · 美股涨 → A 股若跟涨到位,别追在情绪高点;若没跟上,质疑是否真相关(海外营收占比/业务相关度)、看能否放量跟上。
  · 美股跌 → A 股若跟跌更凶,多是自身情绪或有雷,别当"错杀"想当然冲;若看着抗跌,警惕补跌还没轮到。
  · 有独立逻辑的票,别硬套美股映射。
- 再点一个"具体该盯什么"或"最容易踩的坑"(具体到这只票/板块,别给放之四海皆准的废话)。
- 语气像朋友帮你盯盘:具体、敢有观点、说人话;2-4 句,不堆套话。

其他:
- title 简短、点明触发事件(如"英伟达隔夜大涨,数据中心需求超预期")。
- impact 仅限 高/中/低:涨跌幅大、链条核心→高;一般→中;影响有限→低。
- beneficiaryCodes 只从给定 peers 的 code 里选,不编造。`;

interface LLMItem {
  impact: Impact;
  title: string;
  beneficiaryCodes: string[];
  retailTake: string;
}

const JSON_SPEC = `只输出一个 JSON 对象:{"impact":"高|中|低","title":"标题","beneficiaryCodes":["A股代码",...],"retailTake":"散户怎么想,2-4句"}。不要输出 JSON 以外任何文字。`;

// 单条 LLM 生成(并行调用的单元)。失败/超时/空内容由调用方按条回退模板。
async function llmOneItem(
  llm: NonNullable<Awaited<ReturnType<typeof getLLMFor>>>,
  date: string,
  m: Mover
): Promise<NewBriefingItem> {
  const payload = {
    triggerName: m.name,
    triggerCode: m.code,
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
  };
  const cumNote = m.cumulative
    ? '【特别说明】今天是 A 股节后首个交易日,usChangePct 是该美股在 A 股休市期间的【假期累计涨跌】(跨多日)。title 与 retailTake 要点明"假期累计 / 节后需一次性消化",别用"隔夜"。\n\n'
    : "";
  // 推理模型较慢,故每条单独并行调用;单条 48s 超时 + 禁重试,留在 60s 函数上限内。
  const resp = await chatTimed("briefing", llm.provider, () =>
    llm.client.chat.completions.create(
    {
      model: llm.model,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${JSON_SPEC}` },
        {
          role: "user",
          content: `${cumNote}日期 ${date}。这条美股异动与对应 A 股数据(JSON):\n${JSON.stringify(
            payload
          )}\n请生成一条简报条目。`,
        },
      ],
    },
    { timeout: 48000, maxRetries: 0 }
  ));
  const it = JSON.parse(resp.choices[0]?.message?.content ?? "{}") as LLMItem;
  if (!it.retailTake || !it.title) throw new Error("llm_incomplete"); // 空内容 → 调用方回退模板
  let beneficiaries = (it.beneficiaryCodes ?? [])
    .map((c) => STOCK_MAP[c])
    .filter(Boolean)
    .map((p) => ({ code: p.code, name: p.name }));
  if (beneficiaries.length === 0)
    beneficiaries = m.peers.map((p) => ({ code: p.code, name: p.name }));
  return {
    date,
    impact: it.impact ?? impactFromChange(Math.abs(m.change)),
    title: it.title,
    triggerCode: m.code,
    triggerName: m.name,
    triggerChange: m.change,
    beneficiaries,
    // 先把数字中性化(保留 LLM 对这只票的差异化分析);仍残留数字/被清空才回退模板。
    // 避免"带数字就整条换模板"导致同向普涨日文案雷同。
    retailTake: (() => {
      const n = neutralizeNumbers(it.retailTake);
      return n.length >= 8 && !hasSpecificMove(n) ? n : buildTake(m);
    })(),
    sourceUrl: null,
  };
}

// 并行:每条一个 LLM 调用(总耗时≈最慢一条,不是累加);单条失败/超时回退该条模板。
async function llmDrafts(
  date: string,
  movers: Mover[]
): Promise<NewBriefingItem[]> {
  const llm = await getLLMFor("pro");
  if (!llm) return templateDrafts(date, movers);
  return Promise.all(
    movers.map((m) =>
      llmOneItem(llm, date, m).catch(() => templateDrafts(date, [m])[0])
    )
  );
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
  const useLLM =
    !opts?.forceTemplate &&
    Boolean(process.env.LLM_API_KEY || process.env.LLM_FALLBACK_API_KEY);
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
