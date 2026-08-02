// insight 管线 · 链级每日推理生成(PRD §4.4 五段)。
// 设计原则(北极星=每天必产出):能用规则的不用 LLM,LLM 段全部有规则兜底——
// S1 判断=LLM(兜底 fallbackChainTake);S2 热力=LLM 方向+规则兜底,relation 永远来自
// 链配置(不许 LLM 给);S3 映射=纯规则(relation 来自核定数据/环节默认档,零幻觉);
// S4 风险=纯规则;S5 references=博查检索+URL 实测,绝不自产链接。
import { chatTimed } from "@/lib/llm";
import { getLLMFor } from "@/lib/llm-provider";
import { bochaSearch, bochaEnabled } from "@/lib/bocha";
import { listBriefing, type BriefingItem } from "@/lib/briefings";
import { getChain, type ChainSegment } from "@/data/chains";
import { STOCK_MAP } from "@/data/stocks";
import { resolveInChainMappingLabel } from "@/lib/relation-resolver";
import { chainIdFromSlug } from "@/lib/relation-rank";
import { resolvePrimary, resolveInChain } from "@/lib/relation-resolver";
import { fallbackChainTake } from "@/lib/chain-take";
import { runGuards, type GuardResult } from "./guard";
import { heatSignature, getRecentHeatSignatures } from "./docs";
import type { DailyInsightPayload, DailyHop, HeatDirection } from "./schema";
import { INSIGHT_CHAINS } from "@/data/insight-chains";

export interface GenerateResult {
  ok: boolean; // false = 无可生成(非交易/无条目/链未配置)
  blocked?: boolean; // true = 护栏阻断,未产出可审草稿
  payload?: DailyInsightPayload;
  guard?: GuardResult;
  reason?: string;
  // 同图谱检测(§7.2-6):与今日热力方向相同的连续历史天数(含今日算 1)。
  // ≥2 → 警告;≥3 → cron 触发暂停。真实连续行情也会命中,故是启发式,人工确认。
  heatStreak?: number;
}

import { FALLBACK_SEGMENT } from "@/data/chains";

/* ---------- 工具 ---------- */

function parseJson<T>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    const m = s.match(/[[{][\s\S]*[\]}]/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

function sectorToSegment(segments: ChainSegment[]): (sector: string | undefined) => string {
  const map = new Map<string, string>();
  for (const seg of segments) for (const sec of seg.sectors) map.set(sec, seg.name);
  return (sector) => (sector && map.get(sector)) || FALLBACK_SEGMENT;
}

/* ---------- S0:触发(纯规则) ---------- */
// 按链分账(2026-07-09 负责人反馈「三条链说的都一样」):trigger 概述与一句话风险此前吃
// 全天全量条目,三链同文。归属规则=触发源归本链,或任一受益股在本链有关系档。
function chainOwnItems(items: BriefingItem[], chainId: string): BriefingItem[] {
  return items.filter(
    (it) =>
      (it.triggerCode && resolvePrimary(it.triggerCode)?.chainId === chainId) ||
      it.beneficiaries.some((b) => !!resolveInChain(b.code, chainId))
  );
}

// 链专属一句话风险:验证点用本链直接环节的模板词(不再全链一句「订单、毛利率、资本开支」);
// 本链今日无直接触发=如实说「情绪外溢」,不硬套海外涨跌方向。
function chainRisk(
  segments: { defaultRelation: string; verifyTemplate: string[] }[] | undefined,
  own: BriefingItem[],
  all: BriefingItem[]
): string {
  const verify =
    segments?.find((sg) => sg.defaultRelation === "直接映射")?.verifyTemplate?.slice(0, 3).join("、") ??
    "订单、毛利率、资本开支";
  if (own.length === 0)
    return `本链今日无直接触发事件,更多是链外事件的情绪外溢;是否有真实传导,以${verify}的变化为准,不以海外涨跌为准。`;
  const ups = own.filter((it) => (it.triggerChange ?? 0) > 0).length;
  const downs = own.filter((it) => (it.triggerChange ?? 0) < 0).length;
  void all;
  if (downs > 0 && ups === 0) return `海外下跌不等于国内订单恶化,需要${verify}验证。`;
  if (ups > 0 && downs === 0) return `海外上涨不等于国内订单改善,映射能否兑现要看${verify}验证。`;
  return `海外涨跌分化,不直接等于国内基本面变化;每条映射都要用${verify}验证。`;
}

function buildTrigger(items: BriefingItem[]): DailyInsightPayload["trigger"] {
  const seen = new Set<string>();
  const events: DailyInsightPayload["trigger"]["events"] = [];
  let up = 0;
  let down = 0;
  for (const it of items) {
    const chg = it.triggerChange ?? 0;
    if (chg > 0) up++;
    else if (chg < 0) down++;
    if (!it.triggerCode || !it.triggerName || seen.has(it.triggerCode)) continue;
    seen.add(it.triggerCode);
    events.push({
      code: it.triggerCode,
      name: it.triggerName,
      direction: chg >= 0 ? "up" : "down",
      magnitude: Math.abs(chg) >= 4 ? "大" : "中",
    });
  }
  const names = events.slice(0, 3).map((e) => e.name);
  const dir = down > 0 && up === 0 ? "隔夜集体走弱" : up > 0 && down === 0 ? "隔夜集体走强" : "隔夜涨跌分化";
  return {
    summary: `${names.join("、")}${events.length > 3 ? " 等" : ""} ${dir}`,
    events,
  };
}

/* ---------- S1:链级判断(LLM,兜底规则) ---------- */
const JUDGMENT_PROMPT = `你是 StockTell 的产业链解读助手,面向看不懂产业链的 A 股散户。
「{CHAIN}」的定位:{FRAMING}
本链【只关注这些环节】:{SEGMENTS}。
给你今天相关的简报条目(盘前生成,触发=隔夜美股,A 股尚未开盘),写一段 60~140 字的链级今日判断:
① 整体偏强/偏弱/分化及来源(点名触发事件,不带具体涨跌数字);
② 判断【必须落在本链自己的环节({SEGMENTS})】,说清事件是怎么传导 / 外溢到这些环节的——不要只描述事件对别的链(比如 AI 主链的算力/光模块/半导体)的直接影响,那不是本链的判断;若本链是外溢链、今天没有直接命中本链的事件,就如实说"今天更多是外溢观察、无本链直接事件";
③ 哪些方向更多是情绪映射、不代表订单变化。
禁止任何操作暗示与盘口词(买卖/加减仓/抄底/接/冲/追/低开/高开/企稳/放量/缩量/破位/补跌/错杀等);用"传导/映射/承压/观察/验证/共振"。
A 股一律前瞻口吻,不断言已经怎么走;不用吓人词;不写免责。只输出正文,一段话。`;

async function genJudgment(
  chainName: string,
  segments: ChainSegment[],
  framing: string,
  items: BriefingItem[],
  meta: { llmCalls: number; retries: number },
  eventFocus?: { code: string; name: string } // 事件专篇(M2):判断段围绕单一触发事件写
): Promise<{ text: string; degraded: boolean }> {
  const segNames = segments
    .map((s) => s.name)
    .filter((n) => n !== FALLBACK_SEGMENT)
    .join("、");
  const sys = JUDGMENT_PROMPT.replace(/\{CHAIN\}/g, chainName)
    .replace("{FRAMING}", framing)
    .replace(/\{SEGMENTS\}/g, segNames);
  const llm = await getLLMFor("fast");
  if (llm) {
    const payload = items.map((it) => ({
      impact: it.impact,
      title: it.title,
      trigger: it.triggerName,
      direction: (it.triggerChange ?? 0) >= 0 ? "隔夜涨" : "隔夜跌",
      beneficiaries: it.beneficiaries.map((b) => b.name).slice(0, 5),
    }));
    // 合规预检(2026-07-17 断产复盘):判断段此前只查长度——大跌日 LLM 更容易吐
    // "补跌/杀跌"类盘口禁词,过闸后被 runGuards 整篇 blocked 弃稿,07:05+07:40 连败即断产。
    // 与 genRisk 同款纵深:这稿不合规 → 换一稿;两稿都脏 → 规则模板兜底(必干净),
    // 把「整篇弃稿」降级为「换稿/降置信」,守住北极星=每天必产出。
    const { scanBannedWords, hasSpecificMove } = await import("@/lib/content-guard");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        meta.llmCalls++;
        if (attempt > 0) meta.retries++;
        const resp = await chatTimed("insight-daily-judgment", llm.provider, () =>
          llm.client.chat.completions.create(
            {
              model: llm.model,
              max_tokens: 400,
              messages: [
                { role: "system", content: sys },
                {
                  role: "user",
                  content:
                    `今天的简报条目(JSON):\n${JSON.stringify(payload)}\n\n` +
                    (eventFocus
                      ? `请围绕触发事件「${eventFocus.name}」写事件级判断:这件事本身为什么重要、会沿本链哪些环节传导、哪些方向更多是情绪映射(仍落在本链环节)。`
                      : `请写链级今日判断(落在本链环节)。`),
                },
              ],
            },
            { maxRetries: 1, timeout: 12000 }
          )
        );
        const txt = resp.choices[0]?.message?.content?.trim();
        if (!txt || txt.length < 30 || txt.length > 200) continue;
        if (scanBannedWords(txt).length > 0 || hasSpecificMove(txt)) continue;
        return { text: txt, degraded: false };
      } catch {
        /* 重试/降级 */
      }
    }
  }
  return { text: fallbackChainTake(items) ?? "", degraded: true };
}

/* ---------- S1b:一句话风险(2026-07-09 负责人反馈「太模板化」:三链骨架句相同)。
   LLM 针对本链今日事件写「这个判断最可能错在哪/什么信号能证伪」;合规预检(禁词/长度)
   不过或 LLM 失败 → 回退 chainRisk 规则模板。与判断同模型 fast,+1 短调用/链。 ---------- */
const RISK_PROMPT = `你是 StockTell 的产业链风险提示助手。为「{CHAIN}」写今天的一句话风险提示。
要求:
- 只写一句(35~90字),指出【今天这个链级判断最可能错在哪、什么信号能证伪】——要落到今天的具体事件与本链验证点,不写放之四海皆准的套话。
- 禁止"海外上涨不等于国内订单改善"这类模板句式(换成对今天情况的具体提醒);禁止预测涨跌、禁止操作建议、禁止盘口词(低吸/追/抄底/放量/缩量/企稳/破位/补跌等),不带具体涨跌数字。
- 可参考的验证点:{VERIFY}(择相关者,不必全列)。
只输出这一句,不要引号、不要任何其他内容。`;

async function genRisk(
  chainName: string,
  verify: string,
  own: BriefingItem[],
  all: BriefingItem[],
  meta: { llmCalls: number; retries: number }
): Promise<string | null> {
  const llm = await getLLMFor("fast");
  if (!llm) return null;
  const src = own.length ? own : all;
  const payload = src.slice(0, 6).map((it) => ({
    trigger: it.triggerName,
    direction: (it.triggerChange ?? 0) >= 0 ? "隔夜涨" : "隔夜跌",
    title: it.title,
  }));
  const spillNote = own.length === 0 ? "\n注意:本链今日无直接触发事件,属链外情绪外溢——风险提示要点破这一点。" : "";
  const sys = RISK_PROMPT.replace("{CHAIN}", chainName).replace("{VERIFY}", verify);
  const { scanBannedWords, hasSpecificMove } = await import("@/lib/content-guard");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      meta.llmCalls++;
      if (attempt > 0) meta.retries++;
      const resp = await chatTimed("insight-daily-risk", llm.provider, () =>
        llm.client.chat.completions.create(
          {
            model: llm.model,
            max_tokens: 300, // 思维链型 fast 模型可能吃掉配额致输出截断(本地实测第三次 18 字残句)
            messages: [
              { role: "system", content: sys },
              { role: "user", content: `今天与本链相关的事件(JSON):\n${JSON.stringify(payload)}${spillNote}` },
            ],
          },
          { maxRetries: 1, timeout: 12000 }
        )
      );
      const txt = resp.choices[0]?.message?.content?.trim().replace(/^["「『]|["」』]$/g, "");
      // 合规预检:禁词/盘面数字/模板腔复读 → 本次弃用重试(别让风险行把整篇拖进 blocked)
      if (!txt || txt.length < 25 || txt.length > 145) continue;
      if (scanBannedWords(txt).length > 0 || hasSpecificMove(txt)) continue;
      if (txt.includes("不等于国内订单")) continue;
      return txt;
    } catch {
      /* 重试一次后走规则兜底 */
    }
  }
  return null;
}

/* ---------- S2:环节热力(LLM 给方向+原因;relation 只来自链配置;规则兜底) ---------- */
const HEAT_PROMPT = `你是 StockTell 的产业链解读助手。根据今天的触发事件,为下列产业链环节逐一标注今日方向与一句话原因。
方向只能取:升温 | 降温 | 分化 | 观察(没被今天事件波及=观察)。
原因 ≤50 字,人话,禁止操作暗示与盘口词(接/冲/追/低开/高开/企稳/放量/缩量/破位/补跌/错杀等),不带具体涨跌数字。
只输出 JSON 数组:[{"segment":"环节名(必须原样取自给定清单)","direction":"...","reason":"..."}],覆盖清单里每一个环节,不要输出别的。`;

function ruleHeat(
  segments: ChainSegment[],
  items: BriefingItem[],
  toSegment: (sector: string | undefined) => string
): { segment: string; direction: HeatDirection; reason: string }[] {
  // 规则兜底:环节今日方向 = 命中它的触发/受益股方向占比;没命中 = 观察
  const bySeg = new Map<string, { up: number; down: number; names: Set<string> }>();
  for (const it of items) {
    const chg = it.triggerChange ?? 0;
    const segs = new Set<string>();
    if (it.triggerCode) segs.add(toSegment(STOCK_MAP[it.triggerCode]?.sector));
    for (const b of it.beneficiaries) segs.add(toSegment(STOCK_MAP[b.code]?.sector));
    for (const seg of Array.from(segs)) {
      const cur = bySeg.get(seg) ?? { up: 0, down: 0, names: new Set<string>() };
      if (chg > 0) cur.up++;
      else if (chg < 0) cur.down++;
      if (it.triggerName) cur.names.add(it.triggerName);
      bySeg.set(seg, cur);
    }
  }
  return segments
    .filter((s) => s.sectors.length > 0)
    .map((s) => {
      const hit = bySeg.get(s.name);
      if (!hit || (hit.up === 0 && hit.down === 0))
        return { segment: s.name, direction: "观察" as HeatDirection, reason: "今日无直接触发,维持观察" };
      const names = Array.from(hit.names).slice(0, 2).join("、");
      if (hit.down > 0 && hit.up === 0)
        return { segment: s.name, direction: "降温" as HeatDirection, reason: `${names} 隔夜走弱,情绪传导至该环节` };
      if (hit.up > 0 && hit.down === 0)
        return { segment: s.name, direction: "升温" as HeatDirection, reason: `${names} 隔夜走强,关注传导与订单验证` };
      return { segment: s.name, direction: "分化" as HeatDirection, reason: `${names} 隔夜方向不一,环节内部分化` };
    });
}

async function genHeat(
  segments: ChainSegment[],
  items: BriefingItem[],
  toSegment: (sector: string | undefined) => string,
  yesterdayHeat: { segment: string; direction: string }[] | null,
  meta: { llmCalls: number; retries: number }
): Promise<DailyInsightPayload["heat"]> {
  const enumSegs = segments.filter((s) => s.sectors.length > 0);
  const relOf = (name: string) =>
    (enumSegs.find((s) => s.name === name)?.defaultRelation ?? "情绪映射");
  const fallback = () =>
    ruleHeat(segments, items, toSegment).map((h) => ({ ...h, relation: relOf(h.segment) }));

  const llm = await getLLMFor("fast");
  if (!llm) return fallback();

  const eventsBrief = items
    .map((it) => `${it.triggerName}(${(it.triggerChange ?? 0) >= 0 ? "涨" : "跌"}):${it.title}`)
    .join("\n");
  const segList = enumSegs.map((s) => `${s.name} —— ${s.plain}`).join("\n");
  const yBrief = yesterdayHeat
    ? `\n昨日各环节方向(供对比,今天该变就变):${yesterdayHeat.map((h) => `${h.segment}=${h.direction}`).join(",")}`
    : "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      meta.llmCalls++;
      if (attempt > 0) meta.retries++;
      const resp = await chatTimed("insight-daily-heat", llm.provider, () =>
        llm.client.chat.completions.create(
          {
            model: llm.model,
            max_tokens: 1200,
            messages: [
              { role: "system", content: HEAT_PROMPT },
              { role: "user", content: `今天的触发事件:\n${eventsBrief}\n\n环节清单:\n${segList}${yBrief}` },
            ],
          },
          { maxRetries: 1, timeout: 15000 }
        )
      );
      const arr = parseJson<{ segment: string; direction: HeatDirection; reason: string }[]>(
        resp.choices[0]?.message?.content
      );
      if (!Array.isArray(arr)) continue;
      const valid0 = arr.filter(
        (h) =>
          enumSegs.some((s) => s.name === h.segment) &&
          ["升温", "降温", "分化", "观察"].includes(h.direction) &&
          typeof h.reason === "string" &&
          h.reason.trim().length > 0 &&
          h.reason.length <= 80
      );
      // L-4:按 segment 去重——LLM 可能同一环节返回多行,只留第一条,否则 heat 出现
      // 重复环节,污染 heatSignature(同图谱检测)与页面渲染
      const seenSeg = new Set<string>();
      const valid = valid0.filter((h) => {
        if (seenSeg.has(h.segment)) return false;
        seenSeg.add(h.segment);
        return true;
      });
      // 覆盖不全的环节用规则行补齐(保证 schema 全覆盖)
      const covered = new Set(valid.map((h) => h.segment));
      const filled = [
        ...valid,
        ...ruleHeat(segments, items, toSegment).filter((h) => !covered.has(h.segment)),
      ];
      if (filled.length >= enumSegs.length)
        return filled.map((h) => ({ ...h, relation: relOf(h.segment) }));
    } catch {
      /* 重试/降级 */
    }
  }
  return fallback();
}

/* ---------- S3:映射变化(纯规则,零幻觉) ---------- */
function buildMappingsDelta(
  items: BriefingItem[],
  segments: ChainSegment[],
  toSegment: (sector: string | undefined) => string,
  insightSlug: string | undefined // 关系按【本链】核定取(B2-2 生成侧):AI 链管线不能把英维克标成电力链的「直接」
): DailyInsightPayload["mappingsDelta"] {
  const segByName = new Map(segments.map((s) => [s.name, s]));
  const seen = new Set<string>();
  const out: DailyInsightPayload["mappingsDelta"] = [];
  for (const it of items) {
    // 触发概述:用触发标的名 + 方向(不回显原标题——标题可能含具体涨跌数字,会触发数字红线)
    const dir = (it.triggerChange ?? 0) >= 0 ? "隔夜走强" : "隔夜走弱";
    const why = it.triggerName ? `受海外${it.triggerName}${dir}带动` : "受隔夜链上事件带动";
    for (const b of it.beneficiaries) {
      if (seen.has(b.code) || out.length >= 12) continue;
      seen.add(b.code);
      const segName = toSegment(STOCK_MAP[b.code]?.sector);
      // P1-1(切 resolver·harness 验证零意外,仅 P1-3 电力4只从 ai-infra 移出):走统一模型本链档
      const chainRel = resolveInChainMappingLabel(b.code, chainIdFromSlug(insightSlug));
      // 链边界(7.2 回放发现):受益股落「其他链上环节」兜底 且 非本链核定成员 → 跳过,
      // 别把不属本链的股堆成兜底映射(如纯 AI 事件日,电力链会把 12 只 AI 股全堆成情绪映射噪音)。
      // 保留:落兜底但确是本链核定成员的(chainRel 非空)。
      if (segName === FALLBACK_SEGMENT && !chainRel) continue;
      const seg = segByName.get(segName);
      out.push({
        code: b.code,
        name: b.name,
        segment: segName,
        relation: chainRel ?? seg?.defaultRelation ?? "情绪映射",
        todayWhy: why,
        verify: (seg?.verifyTemplate ?? ["订单与客户验证", "板块共振"]).slice(0, 3),
      });
    }
  }
  return out;
}

/* ---------- S5:references(检索+实测,绝不自产;PR3 起产 Reference v2) ---------- */
// v2 结构(schema.ts ReferenceV2):id 用 r1..rn 确定性编号(replay 可比、埋点/追问引用用);
// targets 机器绑定——当日检索来源支撑的是「今日判断/今日风险」(judgment/risk 固定 id);
// 常设入口 standing_entry 不带 publishedAt(不伪造发布日期,schema 校验强制)。
const STANDING_REFS = [
  {
    name: "英伟达投资者关系",
    url: "https://investor.nvidia.com",
    sourceType: "official" as const,
    supportsText: "海外算力链事件与指引核验",
  },
  {
    name: "巨潮资讯网",
    url: "http://www.cninfo.com.cn",
    sourceType: "filing" as const,
    supportsText: "A 股映射公司公告/财报核验",
  },
];

// SSRF 防护(#11):references URL 来自博查检索的外部页面,cron 无人值守自动 HEAD 探测。
// ①只允许 http(s) ②拦私网 / 环回 / 元数据地址(hostname 直判 + 常见内网域) ③redirect:manual
// (不跟随——否则外站 302 到内网即绕过 host 检查);302/301 视为可达(该 URL 存在)。
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, ""); // 去 IPv6 括号
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "metadata.google.internal") return true;
  // IPv4-mapped IPv6 一律拦:合法外部 URL 从不用 ::ffff: 字面量,而 WHATWG URL 会把
  // [::ffff:169.254.169.254] 归一化成十六进制 [::ffff:a9fe:a9fe]——"剥前缀+点分正则"在生产走不到。
  // 直接按前缀拦,同时覆盖点分与十六进制两种形态(元数据/内网地址不放行)。
  if (h.startsWith("::ffff:")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // 含 169.254.169.254 元数据
    if (a >= 224) return true; // 组播 / 保留
  }
  // IPv6 环回(::1)/ 未指定(::)/ 唯一本地(fc,fd)/ 链路本地(fe80)
  if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

async function verifyUrl(url: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (isBlockedHost(u.hostname)) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    // redirect:manual —— 不跟随跳转,防外站 302 到内网绕过 host 检查
    const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: ctrl.signal });
    clearTimeout(timer);
    // 2xx 可达;3xx(opaqueredirect/手动)= 该 URL 存在,视为可达但不跟进内网
    return res.ok || res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

async function buildReferences(
  trigger: DailyInsightPayload["trigger"],
  meta: { searchCalls: number }
): Promise<import("./schema").ReferenceV2[]> {
  const refs: import("./schema").ReferenceV2[] = [];
  // 绑定口径(review P1 修订:不把来源绑到它并不支撑的判断上):
  // - 检索命中的新闻材料:核实的是【触发事件】=今日判断的事实前提 → 只绑 judgment;
  //   「今日风险」是证伪点(推理),没有来源直接支撑 → 不绑,风险行如实显示「推理假设」。
  // - 常设入口(IR/巨潮):是「去哪核实」的长期入口,不支撑任何当日具体判断 → targets 留空,
  //   展示层归入判断旁的入口列表但靠「常设核实入口」徽章与卡底说明表达其角色。
  const NEWS_TARGETS: import("./schema").ReferenceV2["targets"] = [
    { type: "judgment", id: "judgment" },
  ];
  if (bochaEnabled()) {
    const tops = trigger.events.filter((e) => e.magnitude === "大").slice(0, 2);
    for (const ev of tops.length ? tops : trigger.events.slice(0, 2)) {
      try {
        meta.searchCalls++;
        // 检索词带中文名 + 英文 ticker,提高召回精度(纯中文名易召回同名无关公司)
        const hits = await bochaSearch(
          `${ev.name} ${ev.code} 股价 ${ev.direction === "down" ? "大跌" : "大涨"} 原因`,
          { count: 5, freshness: "oneWeek" }
        );
        // 相关性过滤(§12 修):标题/摘要必须真提到该触发标的(中文名或 ticker),
        // 否则丢弃——宁可没有这条来源,也不塞无关新闻(今天出过"百威亚太"误召回)。
        const rel = (hits ?? []).find((h) => {
          const text = `${h.name ?? ""} ${h.summary ?? h.snippet ?? ""}`;
          return text.includes(ev.name) || new RegExp(`\\b${ev.code}\\b`, "i").test(text);
        });
        if (rel?.url) {
          refs.push({
            id: "", // 统一在 cap 后按序补 r1..rn(确定性,replay 可比)
            name: rel.name?.slice(0, 60) || `${ev.name} 相关报道`,
            url: rel.url,
            sourceType: "news",
            kind: "specific",
            publishedAt: rel.datePublished ?? undefined,
            verified: false,
            role: "fact",
            supportsText: `触发事件:${ev.name}`,
            targets: NEWS_TARGETS,
          });
        }
      } catch {
        /* 检索失败不致命 */
      }
    }
  }
  for (const s of STANDING_REFS)
    refs.push({
      id: "",
      name: s.name,
      url: s.url,
      sourceType: s.sourceType,
      kind: "standing_entry",
      verified: false,
      role: "fact",
      supportsText: s.supportsText,
      targets: [], // 常设入口不声称支撑具体判断(见上绑定口径)
    });
  const capped = refs.slice(0, 5);
  capped.forEach((r, i) => (r.id = `r${i + 1}`));
  // 回放/CI 免网:INSIGHT_SKIP_URL_VERIFY=1 时跳过 HEAD 可达探测(refs 保持 verified=false,不出伪验证)。
  // pipeline-replay 兜底路径置此开关 → compliance-block 作 PR 门禁零网络、回放结果确定性。
  // review F7:该开关【严禁】配置到 Vercel——误设会让每日 insight 全部 refs 永久 verified=false,
  // admin 显示"0/N 可达"与源站全挂不可区分。跳过时留日志,让排查者能从函数日志一眼看到开关在生效。
  // 2026-07-30 加硬闸:生产环境(VERCEL_ENV=production)直接忽略该开关——"严禁配置"从注释纪律
  // 升级为代码强制;回放/CI/本地(无 VERCEL_ENV 或 preview)不受影响。
  const skipVerify =
    process.env.INSIGHT_SKIP_URL_VERIFY === "1" && process.env.VERCEL_ENV !== "production";
  if (process.env.INSIGHT_SKIP_URL_VERIFY === "1" && !skipVerify) {
    console.warn("[insight] INSIGHT_SKIP_URL_VERIFY=1 在生产环境被忽略(误配保护,review F7 硬闸)");
  }
  if (skipVerify) {
    console.warn("[insight] INSIGHT_SKIP_URL_VERIFY=1:已跳过 references 可达性验证(回放/CI 专用,生产不应配置)");
  }
  if (!skipVerify) {
    await Promise.all(
      capped.map(async (r) => {
        if (!r.url) return; // v2 url 可选(人工录入无链接来源);无链接不探测、verified 保持 false
        r.verified = await verifyUrl(r.url);
        // checkedAt 只在真跑了探测时落(v2):跳过探测的回放/CI 不出伪时间戳
        r.checkedAt = new Date().toISOString();
      })
    );
  }
  return capped;
}

/* ---------- S3.5 当日传导路径(纯规则,零 LLM 零幻觉)---------- */
// 多跳推理的每日结构化落地(schema.ts DailyHop 头注释有完整设计说明)。
// 骨架逐字取静态 InsightChain 的 mainHops/branchHops(人工核定);当日状态 join 规则:
// 静态 heatmap 行带 hopOrder(「怎么传到这的」与热力行的既有关联),据此把跳号映射到
// 环节名,再按环节名找当日 heat 行,注入 direction 与 reason(同文,已过护栏扫描)。
// 静态无该链(slug 缺)或某跳无关联环节 → 整体/该跳的 today* 缺席,不硬造。
function buildDailyHops(
  insightSlug: string | undefined,
  heat: DailyInsightPayload["heat"]
): DailyHop[] | undefined {
  const chain = insightSlug ? INSIGHT_CHAINS[insightSlug] : undefined;
  if (!chain) return undefined;
  // 环节名归一化 join:静态 heatmap 写「光模块 / 高速互连」,链配置 segments 写「光模块/高速互连」
  // (空格差异),还有「数据中心电力 / 供配电」vs「数据中心电力」(后缀差异)。规则:去空格精确
  // 匹配优先,miss 再按「/」首段匹配(首段在两侧枚举里无碰撞,实测覆盖全部现有环节);
  // 都 miss 则该跳 today* 缺席,不硬造。todaySegment 写回的是【当日 heat 行】的名字(在枚举内)。
  const norm = (s: string) => s.replace(/\s+/g, "");
  const heatByNorm = new Map(heat.map((h) => [norm(h.segment), h]));
  const findToday = (staticSeg: string) => {
    const n = norm(staticSeg);
    const exact = heatByNorm.get(n);
    if (exact) return exact;
    const head = n.split("/")[0];
    for (const [k, v] of Array.from(heatByNorm)) if (k === head || k.split("/")[0] === head) return v;
    return undefined;
  };
  // 一跳可能关联多个热力行(如跳3同时挂 HBM 与封装),取静态 heatmap 里第一处(主关联)
  const segByHop = new Map<number, string>();
  for (const row of chain.heatmap)
    if (row.hopOrder != null && !segByHop.has(row.hopOrder)) segByHop.set(row.hopOrder, row.segment);
  const mk = (h: (typeof chain.mainHops)[number], kind: "main" | "branch"): DailyHop => {
    const seg = segByHop.get(h.order);
    const today = seg ? findToday(seg) : undefined;
    return {
      order: h.order,
      from: h.from,
      to: h.to,
      plain: h.plain,
      logic: h.logic,
      // 静态 Confidence 含「假设」档,每日 payload 三档口径下归入「低」(不确定性只多不少)
      confidence: h.confidence === "假设" ? "低" : h.confidence,
      kind,
      ...(today ? { todaySegment: today.segment, todayDirection: today.direction, todayNote: today.reason } : {}),
    };
  };
  const hops = [
    ...chain.mainHops.map((h) => mk(h, "main")),
    ...chain.branchHops.map((h) => mk(h, "branch")),
  ].sort((a, b) => a.order - b.order);
  return hops.length > 0 ? hops : undefined;
}

/* ---------- 主入口 ---------- */
export async function generateDailyInsight(
  chainId: string,
  date: string,
  opts?: {
    yesterdayHeat?: { segment: string; direction: string }[] | null;
    // 回放注入(pipeline-replay):内存条目直灌,不读 DB、不要求已发布——dry-run 全链路用
    itemsOverride?: BriefingItem[];
    // 事件专篇(M2):判断段围绕单一触发事件调焦,其余五段口径不变
    eventFocus?: { code: string; name: string };
  }
): Promise<GenerateResult> {
  const chain = getChain(chainId);
  if (!chain?.segments?.length) return { ok: false, reason: "链未配置 segments" };
  const items =
    opts?.itemsOverride ??
    (await listBriefing({ date, status: "published" }).catch(() => []));
  if (items.length === 0) return { ok: false, reason: "当日无已发布简报条目(地板未产出)" };

  const meta = { llmCalls: 0, searchCalls: 0, retries: 0 };
  const toSegment = sectorToSegment(chain.segments);

  // 按链分账:概述/风险只讲本链的事;本链无直接触发时概述如实标注「外溢」。
  // ⚠️ 归属必须用【关系模型】的链 id(chainIdFromSlug):CHAINS 注册 id 'ai' ≠ 关系链 'ai-infra',
  // 直接用 chainId 会让 AI 链永远匹配不到自己的触发源(07-09 实踩:AI 链被误标"情绪外溢")。
  const relChainId = chainIdFromSlug(chain.insightSlug) ?? chainId;
  const own = chainOwnItems(items, relChainId);
  const trigger = own.length
    ? buildTrigger(own)
    : { ...buildTrigger(items), summary: `${buildTrigger(items).summary}(链外事件,本链属情绪外溢)` };
  const judgment = await genJudgment(chain.name, chain.segments, chain.tagline, items, meta, opts?.eventFocus);
  const heat = await genHeat(chain.segments, items, toSegment, opts?.yesterdayHeat ?? null, meta);
  const mappingsDelta = buildMappingsDelta(items, chain.segments, toSegment, chain.insightSlug);
  const verifyWords =
    chain.segments?.find((sg) => sg.defaultRelation === "直接映射")?.verifyTemplate?.slice(0, 3).join("、") ??
    "订单、毛利率、资本开支";
  const risk =
    (await genRisk(chain.name, verifyWords, own, items, meta)) ?? chainRisk(chain.segments, own, items);
  const references = await buildReferences(trigger, meta);
  const hops = buildDailyHops(chain.insightSlug, heat);

  const payload: DailyInsightPayload = {
    version: 2, // PR3:references 为 ReferenceV2(历史 v1 归档不迁移,读取端双读)
    chainId,
    date,
    trigger,
    judgment: judgment.text,
    heat,
    mappingsDelta,
    risk,
    references,
    confidence: judgment.degraded ? "低" : "中",
    ...(hops ? { hops } : {}),
  };

  const guard = runGuards(payload, chain.segments, meta);

  // 同图谱检测:今日热力指纹 vs 最近两天,算连续相同天数(含今日)。
  const todaySig = heatSignature(payload);
  const prevSigs = await getRecentHeatSignatures(chainId, date, 2).catch(() => []);
  let heatStreak = 1;
  for (const sig of prevSigs) {
    if (sig === todaySig) heatStreak++;
    else break;
  }
  if (heatStreak >= 3)
    guard.warnings.push(`同图谱:连续 ${heatStreak} 天热力方向零变化——疑似退化成预制图谱(若为真实连续行情属正常,人工确认)`);
  else if (heatStreak >= 2)
    guard.warnings.push(`同图谱:与昨日热力方向完全一致(连续 ${heatStreak} 天),人审重点看是否真实`);

  return { ok: true, blocked: guard.blockers.length > 0, payload, guard, heatStreak };
}
