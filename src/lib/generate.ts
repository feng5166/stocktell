// 简报生成引擎:
// 1) 拉美股异动 → 2) 映射 A 股 + 取数(预期差)→ 3) LLM 生成三段式草稿。
// 没有 LLM_API_KEY 时用模板生成,保证闭环可跑。
import { STOCKS, STOCK_MAP, aSharePeers } from "@/data/stocks";
import { fetchQuotes, type Quote } from "@/lib/quotes";
import { chatTimed } from "@/lib/llm";
import { getLLMFor } from "@/lib/llm-provider";
import type { Impact, NewBriefingItem } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { hasSpecificMove, scanBannedWords } from "@/lib/content-guard";
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

// 美东最近一个「应已收盘」的工作日(YYYY-MM-DD)。无需节假日表:美股休市的节日本身是
// 工作日、但当天没有新行情,asOf 会落在前一交易日 → 自然被判为 stale。周末由 cron 跳过。
// ⚠️ 回拨 18 小时再取工作日:美东过了午夜就翻新工作日,但新一天的行情要 9:30 开盘后才有——
// 不回拨的话,北京时间 12:00(=美东午夜)之后跑生成/replace,会把"今天还没开盘"误判成
// "美股休市"而生成 0 条(2026-07-03 中午 replace 实踩:删了 8 条只回填 0 条)。
// 18h 的含义:上一交易日收盘(16:00 ET)后 2 小时内仍指向上一日,不影响 07:00 北京主 cron
// (=19:00 ET,回拨后仍是当日)与真节假日判定。
function mostRecentUSWeekday(now: Date): string {
  const dayMs = 86400000;
  const anchor = new Date(now.getTime() - 18 * 3600000);
  for (let i = 0; i < 7; i++) {
    const t = new Date(anchor.getTime() - i * dayMs);
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

// 回放注入(scripts/pipeline-replay.ts 用):历史行情快照 + 模拟"现在"。
// 不传 = 生产实时路径,行为不变。now 决定"应有美股交易日"的判定锚点(回放日北京 07:00 主 cron 时刻)。
export interface ReplayEnv {
  quotes: Record<string, Quote>;
  now: Date;
}

// 找美股异动 + 映射 A 股(双向取并集)。
// usMarketClosed:美股最近一个工作日没有新行情(节假日休市),此时不硬生成隔夜映射。
async function findMovers(
  date: string,
  replay?: ReplayEnv
): Promise<{ movers: Mover[]; usMarketClosed: boolean }> {
  const quotes = replay
    ? replay.quotes
    : (await fetchQuotes(STOCKS.map((s) => s.code))).quotes;
  const q = (code: string): Quote | undefined => quotes[code];

  // 美股行情新鲜度:取所有美股报价里最新的 asOf 日期,与"美东最近工作日"比对
  const usAsOf = STOCKS.filter((s) => s.market === "美股")
    .map((s) => q(s.code)?.asOf)
    .filter((d): d is string => Boolean(d));
  const freshestUS = usAsOf.length ? usAsOf.sort().at(-1)! : undefined;
  const expected = mostRecentUSWeekday(replay?.now ?? new Date());
  // 能确定新鲜度(拿到 asOf)且最新行情落后于应有交易日 → 美股休市
  const usMarketClosed = Boolean(freshestUS && expected && freshestUS < expected);

  // 地板健康检查(影子模式):主源(新浪+腾讯)双挂 → 美股报价全空时,freshestUS=undefined、
  // usMarketClosed=false,但下面 movers 会全空 → 0 条简报的静默失败(2026-06-29 出过)。
  // 用独立 Yahoo 探针区分"真休市/无异动"与"源故障":探针显示应有交易日有数据却取不到 → 源故障告警。
  // 仅告警、不改 movers/usMarketClosed —— 生成行为完全不变,跑稳后再用于驱动重试/缓存回退。
  const usQuoteCount = STOCKS.filter(
    (s) => s.market === "美股" && q(s.code) !== undefined
  ).length;
  // 回放不打真告警:探针/飞书是生产源故障监控,历史回放里美股报价空是数据问题不是源故障
  if (usQuoteCount === 0 && !replay) {
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

// hasSpecificMove / scanBannedWords 迁到 src/lib/content-guard.ts(共享,防循环依赖);
// 顶部已 import 供本模块使用,这里 re-export 保持既有外部 import 兼容。
export { hasSpecificMove, scanBannedWords };

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

// 模板兜底的「这条逻辑怎么验证」:按方向 + A股相对美股的强弱定性,给"所以呢"+一句真提醒(非买卖)。
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

  // 固定四段(与 LLM 同口径):变了啥→影响链→A股映射→怎么验证。只讲关系与验证,零盘面操作语言。
  // 早报盘前生成、A 股当天还没开盘,一律不断言 A 股已经怎么走(否则和页面实时行情打架)。
  const pos = first?.position; // 上游/中游/下游 → 分化措辞,避免多条模板雷同
  const sector = first?.sector ?? "相关环节";
  if (m.change > 0) {
    const verify =
      pos === "上游"
        ? "看订单/产能有没有真实兑现,以及板块是否共振"
        : pos === "下游"
        ? "看需求侧有没有订单或收入层面的验证"
        : "看后续订单、财报与板块共振是否跟上";
    return `${lead}**这次变了啥**:海外${m.name}${tag}${up},产业链情绪升温。**影响哪条链**:${sector}。**A股怎么映射**:${names}${color}与其业务相关,但若只有隔夜情绪、没有订单或财报证据,映射强度要打折。**后续怎么验证**:${verify}。`;
  }
  const verifyD =
    pos === "上游"
      ? "看是订单预期真的变了,还是只有情绪冲击;以订单/公告为准"
      : pos === "下游"
      ? "看需求端有没有实质变化,情绪冲击需要基本面与板块共振确认"
      : "看后续订单与财报是否受影响,再看板块是否共振";
  return `${lead}**这次变了啥**:海外${m.name}${tag}${down},产业链情绪承压。**影响哪条链**:${sector}。**A股怎么映射**:${names}${color}与其相关,短期价格波动可能只是情绪传导,不等于产业逻辑变化;有独立逻辑的票不必硬套映射。**后续怎么验证**:${verifyD}。`;
}

/* ---------- LLM 生成 ---------- */
const SYSTEM_PROMPT = `你是 StockTell 的产业链解读助手,帮看不懂产业链的散户把一条美股异动翻译成"这件事沿哪条链传导、和我的票是什么关系、后续验证什么"。你做的是产业理解,不是盘面指导。

合规铁律(违反即失败):
- 禁止"买入/卖出/建议买/推荐/抄底/满仓/加仓/清仓"等任何操作指令性措辞。
- 【全面禁止盘面操作语言】以下词及其变体一律不出现:接/冲/追/上车/低吸/出货/站岗/破位/补跌/超跌反弹/低开/高开/企稳/放量/缩量/止跌/杀跌/洗盘/获利盘/兑现盘/错杀/回调关注/等回调/值得多看一眼/开盘盯/盘中盯。
  理由:这些词本质是在教用户怎么看盘、怎么操作,会把产品拉回"短线交易提示"。StockTell 只讲【关系与验证】:这件事和链上的票是业务传导还是情绪映射,接下来用什么公开信息验证(订单/客户/财报/毛利率/公告/板块共振)。
- 可以敢有观点(明确说"XX 只是沾情绪,不是直接受益方"),但绝不下买卖结论、不指导盘面动作。
- 不要写"不构成投资建议 / 历史规律不代表未来"之类免责声明(页面底部已有,别重复)。

retailTake 怎么写(核心)——固定四段,每段 1 句左右,各段用加粗标签开头,总 90~150 字:
**这次变了啥**:一句说清事件的实质变化。触发美股隔夜已收盘、方向已知,可定性陈述(如"迈威尔隔夜大跌,海外 AI 网络与高速互连链情绪承压"),但不写具体涨跌数字。
**影响哪条链**:点名产业链和最相关的环节(如 光模块/高速互连、半导体设备、AI 服务器)。
**A股怎么映射**:说清 peers 里的票和这件事的关系——是直接供货/业务相关,还是隔了几层,还是只是情绪映射;若只有隔夜情绪、没有订单或财报证据,明说"映射强度要打折"。不断言 A 股当天"已经/正在"怎么走(你拿到的 A 股数据是上一交易日的,断言必和页面实时行情打架)。
**后续怎么验证**:给 1~2 个可核实的观察点(订单、海外客户资本开支、毛利率、财报、公告、板块共振),不给任何盘面动作提示。

【硬性·违反即失败】① 不出现任何具体涨跌数字(A股、美股都不行) ② 不断言 A 股个股当天已经怎么走 ③ 四段标签必须齐全、按序输出。

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

const JSON_SPEC = `只输出一个 JSON 对象:{"impact":"高|中|低","title":"标题","beneficiaryCodes":["A股代码",...],"retailTake":"固定四段:**这次变了啥**:…**影响哪条链**:…**A股怎么映射**:…**后续怎么验证**:…"}。不要输出 JSON 以外任何文字。`;

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
    // B2-1:标题只拦盘面禁词(不去数字——「隔夜大涨15.7%」是既定的触发源事实口径);
    // 命中禁词(如「低吸/企稳/接盘」混进标题)才回退到中性事实标题,不让禁词上头条/推送。
    title: scanBannedWords(it.title).length === 0
      ? it.title
      : `${m.name}隔夜${m.change >= 0 ? "领涨" : "领跌"}${Math.abs(m.change).toFixed(1)}%`,
    triggerCode: m.code,
    triggerName: m.name,
    triggerChange: m.change,
    beneficiaries,
    // 先把数字中性化(保留 LLM 对这只票的差异化分析);仍残留数字 / 含盘面禁词 / 被清空
    // 才回退模板(buildTake 构造式合规)。禁词是铁律③的代码级强制:模型某天回「可低吸/
    // 关注企稳」也会在这里被拦回模板,不会 status:published 自动上线。
    retailTake: (() => {
      const n = neutralizeNumbers(it.retailTake);
      const banned = scanBannedWords(n);
      const numHit = hasSpecificMove(n);
      const clean = n.length >= 8 && !numHit && banned.length === 0;
      // P2:回退不静默——记一条日志(便于事后核对模型是否劣化,而非以为"内容一直干净")
      if (!clean)
        console.warn(
          `[briefing] ${m.name} retailTake 回退模板:${banned.length ? "禁词" + banned.join("/") : numHit ? "数字红线" : "过短/空"}`
        );
      return clean ? n : buildTake(m);
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
  replay?: ReplayEnv; // 回放注入(pipeline-replay):历史行情快照,不走实时源
}): Promise<{
  date: string;
  drafts: NewBriefingItem[];
  engine: "llm" | "template";
  usMarketClosed: boolean;
}> {
  const date = opts?.date || todayISO(); // 可指定日期(管理员演示/回测累计口径)
  const { movers, usMarketClosed } = await findMovers(date, opts?.replay);
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
