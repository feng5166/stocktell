// 简报生成引擎:
// 1) 拉美股异动 → 2) 映射 A 股 + 取数(预期差)→ 3) Claude 生成三段式草稿。
// 没有 ANTHROPIC_API_KEY 时用模板生成,保证闭环可跑。
import { STOCKS, STOCK_MAP, aSharePeers } from "@/data/stocks";
import { fetchQuotes, type Quote } from "@/lib/quotes";
import { getLLM, LLM_MODEL } from "@/lib/llm";
import type { Impact, NewBriefingItem } from "@/lib/briefings";

const MOVER_THRESHOLD = 2; // 美股 |涨跌| ≥ 2% 视为异动

export function todayISO(): string {
  // Asia/Shanghai 日期
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA 给出 YYYY-MM-DD
}

interface Mover {
  code: string;
  name: string;
  change: number;
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

// 找美股异动 + 映射 A 股(双向取并集)
async function findMovers(): Promise<Mover[]> {
  const { quotes } = await fetchQuotes(STOCKS.map((s) => s.code));
  const q = (code: string): Quote | undefined => quotes[code];

  const movers: Mover[] = [];
  for (const us of STOCKS) {
    if (us.market !== "美股") continue;
    const change = q(us.code)?.change;
    if (change === undefined || Math.abs(change) < MOVER_THRESHOLD) continue;

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
  // 异动幅度大的在前
  return movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/* ---------- 模板生成(无 Claude 时) ---------- */
function templateDrafts(date: string, movers: Mover[]): NewBriefingItem[] {
  return movers.map((m) => {
    const dir = m.change > 0 ? "上涨" : "下跌";
    const lagging = m.peers.filter(
      (p) => p.change !== null && m.change - p.change >= 1.5
    );
    const peerText = m.peers
      .map((p) => `${p.name}(${p.change === null ? "未开盘" : (p.change > 0 ? "+" : "") + p.change.toFixed(2) + "%"})`)
      .join(" · ");
    const take =
      lagging.length > 0
        ? `${m.name}已${dir} ${m.change.toFixed(2)}%,但对应 A 股 ${lagging
            .map((p) => p.name)
            .join("、")} 明显没跟上,存在预期差。注意板块情绪,追高需谨慎。`
        : `${m.name}${dir} ${m.change.toFixed(2)}%,对应 A 股标的已基本同步反应,短期跟随板块情绪波动。`;
    return {
      date,
      impact: impactFromChange(Math.abs(m.change)),
      title: `${m.name}盘后${dir} ${Math.abs(m.change).toFixed(2)}%`,
      triggerCode: m.code,
      triggerName: m.name,
      beneficiaries: m.peers.map((p) => ({ code: p.code, name: p.name })),
      retailTake: `${take} 受益 A 股:${peerText}。(历史规律不代表未来,不构成投资建议)`,
      sourceUrl: null,
    };
  });
}

/* ---------- Claude 生成 ---------- */
const SYSTEM_PROMPT = `你是一名资深 A 股产业链分析师,面向看不懂产业链的散户说人话。
任务:把"今日美股异动 + 对应 A 股标的数据"翻译成简报条目,每条三段式:影响等级 / 标题 / 散户怎么想。

硬性合规要求(必须遵守):
- 禁止使用"买入/卖出/建议买/推荐/抄底/满仓"等任何操作指令性措辞。
- 用"风险提示、历史规律、值得关注、注意"等中性表达。
- 锋利点放在"美股→A股 的传导映射"和"预期差(美股涨了 A 股还没动)"上,而不是给买卖结论。
- 每条结尾隐含或显式提示"不构成投资建议"。

写作要求:
- title 简短,点明触发事件(如"英伟达盘后大涨,数据中心需求超预期")。
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
  const payload = movers.map((m) => ({
    triggerCode: m.code,
    triggerName: m.name,
    usChangePct: m.change,
    peers: m.peers.map((p) => ({
      code: p.code,
      name: p.name,
      aChangePct: p.change,
      position: p.position,
      sector: p.sector,
      observation: p.observation,
    })),
  }));

  const resp = await client.chat.completions.create({
    model: LLM_MODEL,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${JSON_SPEC}` },
      {
        role: "user",
        content: `今日(${date})美股异动与对应 A 股数据如下(JSON)。请为每个异动生成一条简报条目。\n\n${JSON.stringify(
          payload,
          null,
          2
        )}`,
      },
    ],
  });

  const text = resp.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text) as { items: LLMItem[] };

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
      beneficiaries,
      retailTake: it.retailTake,
      sourceUrl: null,
    };
  });
}

export async function generateDrafts(): Promise<{
  date: string;
  drafts: NewBriefingItem[];
  engine: "llm" | "template";
}> {
  const date = todayISO();
  const movers = await findMovers();
  const useLLM = Boolean(getLLM());
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
  return { date, drafts, engine };
}
