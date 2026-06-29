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
  const known = m.peers
    .filter((p) => p.change !== null)
    .map((p) => ({ name: p.name, change: p.change as number, obs: shortObs(p.observation) }));
  const pick = (arr: { name: string }[]) => arr.slice(0, 2).map((p) => p.name).join("、");
  const others = pick(m.peers); // 没有实时涨跌时退而用名字
  // 用领头标的的 observation 加一句"懂这只票"的个性化,消除多只雷同
  const color = (arr: { name: string; obs: string }[]) =>
    arr[0]?.obs ? `(${arr[0].name}:${arr[0].obs})` : "";

  if (m.change > 0) {
    const lag = known.filter((p) => m.change - p.change >= 1.5);
    if (lag.length)
      return `${lead}海外${m.name}${tag}${up},A股${pick(lag)}却没怎么跟${color(lag)}——要么是还没反应过来的补涨机会,要么是它跟这条线没那么相关(海外营收占比低)。先别一开盘就追,看它能不能放量站上去;站不住,这"预期差"多半是假的。`;
    if (known.length)
      return `${lead}海外${m.name}${tag}${up},A股对应标的基本同步涨上去了,该反应的都写在脸上。这种时候追最容易接在情绪高点,想参与也等回踩、别追高。`;
    return `${lead}海外${m.name}${tag}${up},A股${others}今天还没开盘。开盘看高开后能不能放量走强,高开冲高回落往往是借利好出货,别被一根高开骗进去。`;
  }

  const over = known.filter((p) => p.change - m.change <= -1.5); // A股跌得比美股更狠
  if (over.length)
    return `${lead}海外${m.name}${tag}${down}(跌幅其实有限),A股${pick(over)}却跌得更狠${color(over)}——这通常是A股自己的情绪宣泄叠加大盘,不是单纯跟跌。别一看"美股没跌多少"就当错杀冲进去,先看跌势有没有缩量企稳。`;
  const resil = known.filter((p) => p.change - m.change >= 1.5); // A股相对抗跌
  if (resil.length)
    return `${lead}海外${m.name}${tag}${down},A股${pick(resil)}反而扛住了${color(resil)}——要么有独立逻辑或资金护盘,要么是补跌还没轮到,留意第二天低开补跌的风险。`;
  if (known.length)
    return `${lead}海外${m.name}${tag}${down},A股对应标的也跟着跌、情绪面承压。越是这种时候越别被恐慌带着走,先看板块整体跌势缓没缓再说。`;
  return `${lead}海外${m.name}${tag}${down},A股${others}还没开盘,大概率低开。低开别急着反应,看是低开企稳还是低开杀跌——前者常是错杀、后者是真承压。`;
}

/* ---------- LLM 生成 ---------- */
const SYSTEM_PROMPT = `你是一个天天盯盘、又特别会说人话的"老股民搭子",帮看不懂产业链的散户把一条美股异动翻译成"跟我的票什么关系、我到底该怎么想"。

合规铁律(违反即失败):
- 禁止"买入/卖出/建议买/推荐/抄底/满仓/加仓/清仓"等任何操作指令性措辞。
- 可以点透机会与陷阱、提示风险,但绝不下买卖结论。
- 不要写"不构成投资建议 / 历史规律不代表未来"之类免责声明(页面底部已有,别重复)。

retailTake 怎么写(这是核心,绝不能写成复述行情的废话):
- 【硬性·违反即失败】retailTake 里绝不出现任何具体涨跌数字(A股、美股都不行):不要写"涨了3个多点""跌6个点""涨超5%""微涨0.87%""跌不到2%"这类。
  原因:早报盘前生成,A股数字是上一交易日的,会和页面顶部【实时行情】打架;数字一律换成定性词(大涨/重挫/逆势走强/没怎么跟跌/跌得更狠/基本同步/相对抗跌)。
- 直接给"所以呢",别复述行情。
- 先定性,而且方向必须正确——根据"A股相对美股"的强弱分情况:
  · 美股涨、A股没怎么涨甚至跌 → 可能是补涨"预期差",但要质疑是不是真相关(海外营收占比/业务相关度),并给一个验证信号(如能否放量跟上)。
  · 美股涨、A股已跟涨到位 → 提醒别追在情绪高点。
  · 美股跌、A股跌得更多 → 是A股自身情绪宣泄或有自己的雷,别把"美股才跌一点"当成"A股被错杀"想当然冲进去。
  · 美股跌、A股相对抗跌 → 要么有独立逻辑/资金护盘,要么补跌没轮到,提示补跌风险。
  · A股逆势(美股跌它涨/美股涨它跌)→ 它有独立逻辑,别硬套映射。
- 再点一个"具体该盯什么"或"这里最容易踩的坑"(具体到这只票/这个板块,别给放之四海皆准的"注意情绪")。
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
  client: NonNullable<ReturnType<typeof getLLM>>,
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
  const resp = await client.chat.completions.create(
    {
      model: LLM_MODEL,
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
  );
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
    // 零容忍兜底:LLM 仍写了具体涨跌数字 → 换成确定性、无数字的模板文案
    retailTake: hasSpecificMove(it.retailTake) ? buildTake(m) : it.retailTake,
    sourceUrl: null,
  };
}

// 并行:每条一个 LLM 调用(总耗时≈最慢一条,不是累加);单条失败/超时回退该条模板。
async function llmDrafts(
  date: string,
  movers: Mover[]
): Promise<NewBriefingItem[]> {
  const client = getLLM();
  if (!client) return templateDrafts(date, movers);
  return Promise.all(
    movers.map((m) =>
      llmOneItem(client, date, m).catch(() => templateDrafts(date, [m])[0])
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
