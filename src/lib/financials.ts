// 财报体检卡:把三大报表 + 财务指标翻译成几句人话结论(结论 + 大白话 + 警告),
// 散户看不懂报表,这里替他抓"利润现金流打架 / 商誉暴雷 / 靠不靠主业 / 资金链"。
// 纯规则、纯事实,不调 LLM、不喊买卖。
import { unstable_cache } from "next/cache";
import { STOCK_MAP } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import { latestAnnualFinancials } from "@/lib/tushare";

export interface CheckupFinding {
  text: string;
  severity: "high" | "mid" | "good" | "info";
}
export interface Checkup {
  period: string; // YYYYMMDD
  year: string;
  findings: CheckupFinding[];
}

const yi = (v: number | null): number | null => (v === null ? null : Math.round((v / 1e8) * 100) / 100);
const fmtYi = (v: number): string =>
  v >= 10000 ? `${(v / 10000).toFixed(2)}万亿` : `${v >= 100 ? Math.round(v) : v.toFixed(1)}亿`;

async function compute(code: string): Promise<Checkup | null> {
  if (STOCK_MAP[code]?.market !== "A股") return null;
  const f = await latestAnnualFinancials(code);
  if (!f || f.revenue === null) return null;

  const rev = yi(f.revenue);
  const ni = yi(f.niAttr);
  const ocf = yi(f.ocf);
  const eq = yi(f.equity);
  const gw = yi(f.goodwill);
  const cash = yi(f.cash);
  const st = yi(f.stDebt);
  const dedt = yi(f.dedt);
  const yr = f.period.slice(0, 4);
  const findings: CheckupFinding[] = [];

  // 概览一行(营收规模 + 盈利能力)
  const ov: string[] = [];
  if (rev !== null) ov.push(`营收 ${fmtYi(rev)}`);
  if (ni !== null) ov.push(`归母净利 ${ni < 0 ? "亏 " + fmtYi(Math.abs(ni)) : fmtYi(ni)}`);
  if (f.roe !== null) ov.push(`ROE ${f.roe.toFixed(1)}%`);
  if (f.gross !== null) ov.push(`毛利率 ${f.gross.toFixed(0)}%`);
  if (ov.length) findings.push({ text: `📊 ${yr} 年报:${ov.join(" · ")}`, severity: "info" });

  // 利润 vs 经营现金流(打架=利润是白条)
  if (ni !== null && ocf !== null) {
    if (ni > 0 && ocf < 0)
      findings.push({
        text: `💧 净利赚 ${fmtYi(ni)},但经营现金流为负(${fmtYi(Math.abs(ocf))}流出)——利润是"白条"(钱没真收回),留意应收账款/暴雷风险`,
        severity: "high",
      });
    else if (ni > 0 && ocf < ni * 0.5)
      findings.push({
        text: `💧 净利 ${fmtYi(ni)},经营现金流仅 ${fmtYi(ocf)}(不到净利一半)——利润含金量偏低,盯回款`,
        severity: "mid",
      });
    else if (ni > 0 && ocf >= ni * 0.8)
      findings.push({
        text: `💧 净利 ${fmtYi(ni)},经营现金流 ${fmtYi(ocf)}——利润有真金白银支撑,质量不错`,
        severity: "good",
      });
    else if (ni < 0)
      findings.push({ text: `📉 ${yr} 年报归母净利亏损 ${fmtYi(Math.abs(ni))}`, severity: "high" });
  }

  // 商誉(占净资产)
  if (gw !== null && gw > 0 && eq !== null && eq > 0) {
    const r = (gw / eq) * 100;
    if (r >= 30)
      findings.push({
        text: `💣 商誉 ${fmtYi(gw)},占净资产 ${r.toFixed(0)}%——偏高,业绩变脸/年报季当心商誉减值暴雷`,
        severity: "high",
      });
    else if (r >= 10)
      findings.push({ text: `商誉 ${fmtYi(gw)}(占净资产 ${r.toFixed(0)}%),留意`, severity: "info" });
  }

  // 靠主业?(扣非净利占归母净利)
  if (dedt !== null && ni !== null && ni > 0) {
    const r = (dedt / ni) * 100;
    if (r < 60)
      findings.push({
        text: `🏷️ 扣非净利只占 ${r.toFixed(0)}%——利润不少靠非经常性损益(补贴/卖资产/投资收益),主业含金量打折`,
        severity: "mid",
      });
    else if (r >= 90)
      findings.push({ text: `🏭 扣非净利占 ${r.toFixed(0)}%——利润主要靠主业,实在`, severity: "good" });
  }

  // 资金链(货币资金 vs 短期有息负债)
  if (cash !== null && st !== null && st > 0 && cash < st)
    findings.push({
      text: `💵 货币资金 ${fmtYi(cash)} < 短期有息负债 ${fmtYi(st)}——资金面偏紧`,
      severity: "mid",
    });

  return { period: f.period, year: yr, findings };
}

export function financialCheckup(code: string): Promise<Checkup | null> {
  return unstable_cache(() => compute(code), ["fin-checkup", code, todayISO()], {
    revalidate: 43200, // 12h(年报低频)
  })();
}
