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
import { relationForCodeInChain } from "@/lib/relation";
import { fallbackChainTake } from "@/lib/chain-take";
import { dailyRisk } from "@/lib/home-feed";
import { runGuards, type GuardResult } from "./guard";
import { heatSignature, getRecentHeatSignatures } from "./docs";
import type { DailyInsightPayload, HeatDirection } from "./schema";

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

const FALLBACK_SEGMENT = "其他链上环节";

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
给你今天「{CHAIN}」相关的简报条目(盘前生成,触发=隔夜美股,A 股尚未开盘),写一段 60~140 字的链级今日判断:
①整体偏强/偏弱/分化及来源(点名触发事件,不带具体涨跌数字) ②传导最直接的 1~3 个环节 ③哪些方向更多是情绪映射、不代表订单变化。
禁止任何操作暗示与盘口词(买卖/加减仓/抄底/接/冲/追/低开/高开/企稳/放量/缩量/破位/补跌/错杀等);用"传导/映射/承压/观察/验证/共振"。
A 股一律前瞻口吻,不断言已经怎么走;不用吓人词;不写免责。只输出正文,一段话。`;

async function genJudgment(
  chainName: string,
  items: BriefingItem[],
  meta: { llmCalls: number; retries: number }
): Promise<{ text: string; degraded: boolean }> {
  const llm = await getLLMFor("fast");
  if (llm) {
    const payload = items.map((it) => ({
      impact: it.impact,
      title: it.title,
      trigger: it.triggerName,
      direction: (it.triggerChange ?? 0) >= 0 ? "隔夜涨" : "隔夜跌",
      beneficiaries: it.beneficiaries.map((b) => b.name).slice(0, 5),
    }));
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
                { role: "system", content: JUDGMENT_PROMPT.replace("{CHAIN}", chainName) },
                { role: "user", content: `今天的简报条目(JSON):\n${JSON.stringify(payload)}\n\n请写链级今日判断。` },
              ],
            },
            { maxRetries: 1, timeout: 12000 }
          )
        );
        const txt = resp.choices[0]?.message?.content?.trim();
        if (txt && txt.length >= 30 && txt.length <= 200) return { text: txt, degraded: false };
      } catch {
        /* 重试/降级 */
      }
    }
  }
  return { text: fallbackChainTake(items) ?? "", degraded: true };
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
      const seg = segByName.get(segName);
      out.push({
        code: b.code,
        name: b.name,
        segment: segName,
        relation: relationForCodeInChain(b.code, insightSlug) ?? seg?.defaultRelation ?? "情绪映射",
        todayWhy: why,
        verify: (seg?.verifyTemplate ?? ["订单与客户验证", "板块共振"]).slice(0, 3),
      });
    }
  }
  return out;
}

/* ---------- S5:references(检索+实测,绝不自产) ---------- */
const STANDING_REFS = [
  { name: "英伟达投资者关系", url: "https://investor.nvidia.com", supports: "海外算力链事件与指引核验", kind: "常设入口" as const },
  { name: "巨潮资讯网", url: "http://www.cninfo.com.cn", supports: "A 股映射公司公告/财报核验", kind: "常设入口" as const },
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
): Promise<DailyInsightPayload["references"]> {
  const refs: DailyInsightPayload["references"] = [];
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
            name: rel.name?.slice(0, 60) || `${ev.name} 相关报道`,
            url: rel.url,
            date: rel.datePublished ?? undefined,
            supports: `触发事件:${ev.name}`,
            kind: "具体来源",
            verified: false,
          });
        }
      } catch {
        /* 检索失败不致命 */
      }
    }
  }
  for (const s of STANDING_REFS) refs.push({ ...s, verified: false });
  const capped = refs.slice(0, 5);
  await Promise.all(
    capped.map(async (r) => {
      r.verified = await verifyUrl(r.url);
    })
  );
  return capped;
}

/* ---------- 主入口 ---------- */
export async function generateDailyInsight(
  chainId: string,
  date: string,
  opts?: { yesterdayHeat?: { segment: string; direction: string }[] | null }
): Promise<GenerateResult> {
  const chain = getChain(chainId);
  if (!chain?.segments?.length) return { ok: false, reason: "链未配置 segments" };
  const items = await listBriefing({ date, status: "published" }).catch(() => []);
  if (items.length === 0) return { ok: false, reason: "当日无已发布简报条目(地板未产出)" };

  const meta = { llmCalls: 0, searchCalls: 0, retries: 0 };
  const toSegment = sectorToSegment(chain.segments);

  const trigger = buildTrigger(items);
  const judgment = await genJudgment(chain.name, items, meta);
  const heat = await genHeat(chain.segments, items, toSegment, opts?.yesterdayHeat ?? null, meta);
  const mappingsDelta = buildMappingsDelta(items, chain.segments, toSegment, chain.insightSlug);
  const risk = dailyRisk(items);
  const references = await buildReferences(trigger, meta);

  const payload: DailyInsightPayload = {
    version: 1,
    chainId,
    date,
    trigger,
    judgment: judgment.text,
    heat,
    mappingsDelta,
    risk,
    references,
    confidence: judgment.degraded ? "低" : "中",
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
