// 层② dailyRelationSignals 真源(2.1-W5,2026-07-07 拍板:Watchlist 前置依赖)。
// 真源=当日【已发布】简报:每条简报的 beneficiaries(A 股)与 triggerCode(美股触发源)
// 就是"今天被事件触发"的票——纯派生,零新表零回填,简报撤回/重发后信号自动跟随。
//
// 不变量#3(拍板③,长期铁律):daily 信号【只】产生 todaySignalStrength(独立字段),
// 绝不 promote/downgrade staticRelations 的 relationType——挂接走 resolver 的 attachSignal,
// 该函数结构上就只写 todaySignalStrength 一个字段。
//
// resolver 的 getDailySignals 同步 getter 保持骨架:resolver 是全站同步热路径,不为层②
// 破坏同步契约。消费方(/watchlist 服务端)用 deriveDailySignals(异步)取信号按 code 聚合。
import { listBriefing, type BriefingItem, type Impact } from "@/lib/briefings";
import { relationsForCode } from "@/data/chain-relations";
import type { DailyRelationSignal } from "@/lib/relation-resolver";
import { SIGNAL_RANK as RANK, type SignalStrength } from "@/lib/signal-rank";

const STRENGTH: Record<Impact, SignalStrength> = { 高: "强", 中: "中", 低: "弱" };

// 纯函数(replay/测试直接调):简报条目 → 信号列表。
// - beneficiaries:信号挂到该票的【每一条静态链关系】上(chainId 逐链;P1-3 后已无多链股票,
//   通常就一条)——无静态关系的票不产信号(它没有关系可"触发",Watchlist 显示为待验证);
// - triggerCode:美股触发源本身也是"今日触发"(自选里有美股时要能亮);
// - 同 (code, chainId) 多条事件命中 → 取最强档,note 记最强那条的标题。
export function signalsFromItems(items: BriefingItem[], date: string): DailyRelationSignal[] {
  const best = new Map<string, DailyRelationSignal>();
  const put = (code: string, chainId: string, s: DailyRelationSignal) => {
    const key = `${code}:${chainId}`;
    const prev = best.get(key);
    if (!prev || RANK[s.signalStrength] > RANK[prev.signalStrength]) best.set(key, s);
  };
  for (const it of items) {
    const strength = STRENGTH[it.impact] ?? "弱";
    for (const b of it.beneficiaries) {
      for (const rel of relationsForCode(b.code)) {
        put(b.code, rel.chainId, {
          code: b.code,
          chainId: rel.chainId,
          date,
          signalStrength: strength,
          eventId: it.id,
          note: it.title,
        });
      }
    }
    if (it.triggerCode) {
      for (const rel of relationsForCode(it.triggerCode)) {
        put(it.triggerCode, rel.chainId, {
          code: it.triggerCode,
          chainId: rel.chainId,
          date,
          signalStrength: strength,
          eventId: it.id,
          note: it.title,
        });
      }
    }
  }
  return Array.from(best.values());
}

// 异步真源入口:读当日已发布简报派生。DB 失败返回空(信号缺席只影响"今日触发"标记,
// 不影响静态关系展示,fail-safe)。
export async function deriveDailySignals(date: string): Promise<DailyRelationSignal[]> {
  const items = await listBriefing({ date, status: "published" }).catch(() => []);
  return signalsFromItems(items, date);
}
